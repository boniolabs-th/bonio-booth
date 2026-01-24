/**
 * SSE Client Service สำหรับ bonio-booth
 * Version: Fixed - with proper cleanup
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { getEnvConfig, DEFAULT_MACHINE_ID } from '../config/env.config';

export enum MachineEventType {
  SHUTDOWN_SCHEDULED = 'shutdown-scheduled',
  SHUTDOWN_IMMEDIATE = 'shutdown-immediate',
  SHUTDOWN_CANCELLED = 'cancel-shutdown',
  CONNECTED = 'connected',
  HEARTBEAT = 'heartbeat',
  MAINTENANCE_ON = 'maintenance-on',
  MAINTENANCE_OFF = 'maintenance-off',
  CONFIG_UPDATED = 'config-updated',
  SSE_CONNECTED = 'sse-connected',
  SSE_DISCONNECTED = 'sse-disconnected',
}

export interface SseEventCallback {
  (eventType: string, data: any): void;
}

export class SseClient {
  private request: http.ClientRequest | null = null;
  private apiBaseUrl: string;
  private machineId: string;
  private isConnectedFlag: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private eventCallbacks: Map<string, SseEventCallback[]> = new Map();
  private buffer: string = '';
  private onStatus502Callback: (() => void) | null = null;
  private currentEvent: string = '';
  private currentData: string = '';
  private hasEmittedConnected: boolean = false;
  private isConnecting: boolean = false;

  private isManualDisconnect = false;

  // ⭐ เพิ่ม: ตัวแปรสำหรับเก็บ timers/intervals ทั้งหมด
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;
  private connectionTimeoutTimer: NodeJS.Timeout | null = null;
  private lastHeartbeatTime: number = Date.now();

  // Buffer size limit
  private readonly DEFAULT_MAX_BUFFER_SIZE = 1 * 1024 * 1024; // 1MB
  private maxBufferSize: number = this.DEFAULT_MAX_BUFFER_SIZE;

  constructor(options?: { apiBaseUrl?: string; machineId?: string }) {
    this.apiBaseUrl = options?.apiBaseUrl ? options.apiBaseUrl : '';
    this.machineId = options?.machineId ? options.machineId : DEFAULT_MACHINE_ID;

    getEnvConfig().then((config) => {
      if (!options?.apiBaseUrl) {
        this.apiBaseUrl = config.API_BASE_URL;
      }
      if (!options?.machineId) {
        this.machineId = config.MACHINE_ID;
      }
      console.log('🔧 [SseClient] Configuration loaded:', {
        apiBaseUrl: this.apiBaseUrl,
        machineId: this.machineId,
      });
    }).catch((error) => {
      console.error('❌ [SseClient] Failed to load env config:', error);
    });
  }

  /**
   * ตั้งค่าขนาด buffer สูงสุด
   */
  setMaxBufferSize(sizeInMB: number): void {
    this.maxBufferSize = sizeInMB * 1024 * 1024;
    console.log(`📏 [SseClient] Max buffer size set to ${sizeInMB}MB`);
  }

  updateConfig(options: { apiBaseUrl?: string; machineId?: string }): void {
    if (options.apiBaseUrl !== undefined) {
      this.apiBaseUrl = options.apiBaseUrl;
      console.log('✅ [SseClient] Updated apiBaseUrl:', this.apiBaseUrl);
    }
    if (options.machineId !== undefined) {
      this.machineId = options.machineId;
      console.log('✅ [SseClient] Updated machineId:', this.machineId);
    }
  }

  setOnStatus502Callback(callback: () => void): void {
    this.onStatus502Callback = callback;
  }

  connect(): void {
    // ⭐ Validate config
    if (!this.apiBaseUrl || !this.machineId) {
      console.error('❌ [SseClient] Invalid config:', {
        apiBaseUrl: this.apiBaseUrl,
        machineId: this.machineId,
      });
      return;
    }

    // ⭐ ป้องกัน race condition
    if (this.isConnecting) {
      console.log('⚠️ [SseClient] Connection in progress, ignoring');
      return;
    }

    if (this.request) {
      console.log('⚠️ [SseClient] Already connected, closing existing connection');
      this.disconnect();
    }

    const sseUrl = `${this.apiBaseUrl}/api/sse/machine/connect?machineId=${this.machineId}`;
    console.log('🔗 [SseClient] Connecting to:', sseUrl);

    this.isConnecting = true;

    try {
      const url = new URL(sseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      };

      // ⭐ ตั้ง connection timeout (30 วินาที)
      this.connectionTimeoutTimer = setTimeout(() => {
        console.error('❌ [SseClient] Connection timeout (30s)');
        this.isConnecting = false;
        if (this.request) {
          this.request.destroy();
          this.request = null;
        }
        this.scheduleReconnect();
      }, 30000);

      this.request = protocol.request(options, (res) => {
        this.isConnecting = false;
        this.clearConnectionTimeout();

        console.log('📡 [SseClient] Response status:', res.statusCode);

        if (res.statusCode !== 200) {
          console.error('❌ [SseClient] Failed to connect, status:', res.statusCode);
          this.isConnectedFlag = false;
          this.hasEmittedConnected = false;

          if (res.statusCode === 502 && this.onStatus502Callback) {
            console.log('⚠️ [SseClient] Status 502 detected, triggering maintenance mode');
            this.onStatus502Callback();
          }

          this.scheduleReconnect();
          return;
        }

        console.log('✅ [SseClient] Connected to SSE');
        this.isConnectedFlag = true;
        this.reconnectAttempts = 0;

        // ⭐ เริ่ม heartbeat monitoring
        this.startHeartbeatMonitoring();

        res.on('data', (chunk: Buffer) => {
          this.buffer += chunk.toString();

          // Emit connected event ครั้งแรก
          if (!this.hasEmittedConnected) {
            console.log('📡 [SseClient] First data received, emitting connected event');
            this.hasEmittedConnected = true;
            this.emitEvent(MachineEventType.SSE_CONNECTED, {
              timestamp: Date.now(),
              machineId: this.machineId,
            });
          }

          this.processBuffer();
        });

        res.on('end', () => {
          console.log('🔌 [SseClient] Connection ended');
          this.isConnectedFlag = false;
          this.hasEmittedConnected = false;
          this.stopHeartbeatMonitoring();

          this.emitEvent(MachineEventType.SSE_DISCONNECTED, {
            timestamp: Date.now(),
            reason: 'connection-ended',
          });

          this.scheduleReconnect();
        });

        res.on('error', (error) => {
          console.error('❌ [SseClient] Response error:', error);
          this.isConnectedFlag = false;
          this.hasEmittedConnected = false;
          this.stopHeartbeatMonitoring();

          this.emitEvent(MachineEventType.SSE_DISCONNECTED, {
            timestamp: Date.now(),
            reason: 'error',
            error: error.message,
          });

          this.scheduleReconnect();
        });
      });

      this.request.on('error', (error) => {
        console.error('❌ [SseClient] Request error:', error);
        this.isConnecting = false;
        this.isConnectedFlag = false;
        this.hasEmittedConnected = false;
        this.clearConnectionTimeout();
        this.stopHeartbeatMonitoring();

        this.emitEvent(MachineEventType.SSE_DISCONNECTED, {
          timestamp: Date.now(),
          reason: 'request-error',
          error: error.message,
        });

        if (!this.isManualDisconnect) {
          this.scheduleReconnect();
        }
      });

      this.request.end();
    } catch (error) {
      console.error('❌ [SseClient] Failed to create connection:', error);
      this.isConnecting = false;
      this.clearConnectionTimeout();

      this.emitEvent(MachineEventType.SSE_DISCONNECTED, {
        timestamp: Date.now(),
        reason: 'connection-failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.scheduleReconnect();
    }
  }

  /**
   * ⭐ เริ่ม heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.lastHeartbeatTime = Date.now();
    this.stopHeartbeatMonitoring(); // Clear ก่อน (ป้องกัน duplicate)

    // เช็คทุก 10 วินาที
    this.heartbeatCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.lastHeartbeatTime;

      // ถ้าไม่ได้รับ heartbeat เกิน 60 วินาที = disconnect
      if (timeSinceLastHeartbeat > 60000) {
        console.warn('⚠️ [SseClient] No heartbeat for 60s, connection may be dead');

        // Disconnect และ reconnect
        this.disconnect();
      }
    }, 10000);

    console.log('💓 [SseClient] Heartbeat monitoring started');
  }

  /**
   * ⭐ หยุด heartbeat monitoring
   */
  private stopHeartbeatMonitoring(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
      console.log('💔 [SseClient] Heartbeat monitoring stopped');
    }
  }

  /**
   * ⭐ Clear connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  /**
   * ⭐ ยกเลิกการเชื่อมต่อ - แก้ไขให้ clear timers ทั้งหมด
   */
  disconnect(manual = true): void {
    this.isManualDisconnect = manual;
    console.log('🔌 [SseClient] Disconnecting...');

    // ⭐ 1. Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log('   ✓ Reconnect timer cleared');
    }

    // ⭐ 2. Clear connection timeout
    this.clearConnectionTimeout();
    console.log('   ✓ Connection timeout cleared');

    // ⭐ 3. Stop heartbeat monitoring
    this.stopHeartbeatMonitoring();
    console.log('   ✓ Heartbeat monitoring stopped');

    // ⭐ 4. Destroy HTTP request
    if (this.request) {
      this.request.destroy();
      this.request = null;
      console.log('   ✓ HTTP request destroyed');
    }

    // ⭐ 5. Emit disconnect event (ถ้าเคย connected)
    if (this.isConnectedFlag) {
      this.emitEvent(MachineEventType.SSE_DISCONNECTED, {
        timestamp: Date.now(),
        reason: 'manual-disconnect',
      });
    }

    // ⭐ 6. Reset flags และ state
    this.isConnectedFlag = false;
    this.isConnecting = false;
    this.hasEmittedConnected = false;
    this.buffer = '';
    this.currentEvent = '';
    this.currentData = '';

    console.log('✅ [SseClient] Disconnected completely');
  }

  private processBuffer(): void {
    // ⭐ จำกัดขนาด buffer
    if (this.buffer.length > this.maxBufferSize) {
      console.error(`❌ [SseClient] Buffer exceeded ${this.maxBufferSize / 1024 / 1024}MB, clearing`);
      console.error(`   Current size: ${this.buffer.length} bytes`);
      this.buffer = '';
      this.currentEvent = '';
      this.currentData = '';
      return;
    }

    const lines = this.buffer.split('\n').map(line => line.replace(/\r$/, ''));
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        this.currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this.currentData = line.slice(5).trim();
      } else if (line === '') {
        if (this.currentEvent && this.currentData) {
          this.handleEvent(this.currentEvent, this.currentData);
        }
        this.currentEvent = '';
        this.currentData = '';
      }
    }
  }

  private handleEvent(eventType: string, dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);

      // ⭐ อัพเดท heartbeat time
      if (eventType === MachineEventType.HEARTBEAT) {
        this.lastHeartbeatTime = Date.now();
      }

      switch (eventType) {
        case MachineEventType.CONNECTED:
          console.log('📥 [SseClient] Connected event:', data);
          break;
        case MachineEventType.HEARTBEAT:
          console.log('💓 [SseClient] Heartbeat:', data.timestamp);
          break;
        case MachineEventType.SHUTDOWN_SCHEDULED:
          console.log('🛑 [SseClient] Shutdown scheduled:', data);
          break;
        case MachineEventType.SHUTDOWN_IMMEDIATE:
          console.log('🛑 [SseClient] Shutdown immediate:', data);
          break;
        case MachineEventType.SHUTDOWN_CANCELLED:
          console.log('🔄 [SseClient] Shutdown cancelled:', data);
          break;
        case MachineEventType.MAINTENANCE_ON:
          console.log('🔧 [SseClient] Maintenance ON:', data);
          break;
        case MachineEventType.MAINTENANCE_OFF:
          console.log('🔧 [SseClient] Maintenance OFF:', data);
          break;
        case MachineEventType.CONFIG_UPDATED:
          console.log('⚙️ [SseClient] Config updated:', data);
          break;
        default:
          console.log(`📥 [SseClient] Unknown event ${eventType}:`, data);
      }

      this.emitEvent(eventType, data);
    } catch (error) {
      console.error('❌ [SseClient] Failed to parse event data:', error, dataStr);
      // Emit parse error event
      this.emitEvent('parse-error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType,
        dataStr: dataStr.substring(0, 100),
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.isConnecting) {
      console.log('⚠️ [SseClient] Already connecting, skip reconnect');
      return;
    }

    if (this.reconnectTimer) {
      console.log('⚠️ [SseClient] Reconnect already scheduled');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [SseClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;

    // ⭐ Exponential backoff with max 60s
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    console.log(
      `🔄 [SseClient] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  on(eventType: string, callback: SseEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  off(eventType: string, callback: SseEventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emitEvent(eventType: string, data: any): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(eventType, data);
        } catch (error) {
          console.error(`❌ [SseClient] Error in callback for ${eventType}:`, error);
        }
      });
    }
  }

  getIsConnected(): boolean {
    return this.isConnectedFlag;
  }

  getMachineId(): string {
    return this.machineId;
  }

  async notifyShutdownReady(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      try {
        const url = new URL(`${this.apiBaseUrl}/api/machines/${this.machineId}/shutdown/ready`);
        const protocol = url.protocol === 'https:' ? https : http;

        const postData = JSON.stringify({ machineId: this.machineId });

        const options: https.RequestOptions = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        };

        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              console.log('📤 [SseClient] Shutdown ready notification sent:', result);
              resolve(result);
            } catch {
              resolve({ success: false, message: 'Failed to parse response' });
            }
          });
        });

        req.on('error', (error) => {
          console.error('❌ [SseClient] Failed to notify shutdown ready:', error);
          resolve({
            success: false,
            message: error.message,
          });
        });

        req.write(postData);
        req.end();
      } catch (error) {
        console.error('❌ [SseClient] Failed to notify shutdown ready:', error);
        resolve({
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  async notifyOffline(): Promise<void> {
    try {
      const url = new URL(`${this.apiBaseUrl}/api/machines/${this.machineId}`);
      const protocol = url.protocol === 'https:' ? https : http;

      const postData = JSON.stringify({
        status: 'offline',
      });

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      await new Promise<void>((resolve, reject) => {
        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            console.log('📤 [SseClient] Machine set offline:', data);
            resolve();
          });
        });

        req.on('error', (err) => {
          console.error('❌ [SseClient] Failed to set offline:', err);
          reject(err);
        });

        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('❌ [SseClient] notifyOffline error:', error);
    }
  }

  /**
   * ⭐ Cleanup method - เรียกเมื่อปิดแอป
   */
  async destroy(): Promise<void> {
    console.log('🗑️ [SseClient] Destroying instance...');
    await this.notifyOffline();
    this.disconnect();
    this.eventCallbacks.clear();
    console.log('✅ [SseClient] Instance destroyed');
  }
}

export default new SseClient();
