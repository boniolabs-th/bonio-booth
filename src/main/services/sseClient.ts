/**
 * SSE Client Service สำหรับ bonio-booth
 * ใช้เชื่อมต่อกับ backend เพื่อรับ events ต่างๆ เช่น shutdown command
 *
 * Note: ใช้ HTTP/HTTPS stream แทน EventSource เพราะอยู่ใน Node.js main process
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { apiBaseUrl as machineApiBaseUrl, machineId as defaultMachineId } from './machineService';

// Event types จาก backend
export enum MachineEventType {
  SHUTDOWN_SCHEDULED = 'shutdown-scheduled',
  SHUTDOWN_IMMEDIATE = 'shutdown-immediate',
  SHUTDOWN_CANCELLED = 'cancel-shutdown',
  CONNECTED = 'connected',
  HEARTBEAT = 'heartbeat',
  MAINTENANCE_ON = 'maintenance-on',
  MAINTENANCE_OFF = 'maintenance-off',
  CONFIG_UPDATED = 'config-updated',
}

export interface ShutdownScheduledPayload {
  countdownMinutes: number;
  reason: 'manual' | 'timer';
  scheduledBy?: string;
  timestamp: number;
}

export interface ShutdownImmediatePayload {
  reason: 'timer';
  timestamp: number;
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
  private reconnectDelay: number = 5000; // 5 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private eventCallbacks: Map<string, SseEventCallback[]> = new Map();
  private buffer: string = '';
  private onStatus502Callback: (() => void) | null = null;

  // SSE parsing state - ต้องเก็บไว้ข้าม chunks
  private currentEvent: string = '';
  private currentData: string = '';

  constructor(options?: { apiBaseUrl?: string; machineId?: string }) {
    // ใช้ค่าจาก machineService ที่ได้จาก env แล้ว
    this.apiBaseUrl = options?.apiBaseUrl || machineApiBaseUrl;
    this.machineId = options?.machineId || defaultMachineId;

    console.log('🔧 [SseClient] Configuration:', {
      apiBaseUrl: this.apiBaseUrl,
      machineId: this.machineId,
    });
  }

  /**
   * ตั้งค่า callback สำหรับเมื่อได้รับ status 502
   */
  setOnStatus502Callback(callback: () => void): void {
    this.onStatus502Callback = callback;
  }

  /**
   * เชื่อมต่อกับ SSE endpoint
   */
  connect(): void {
    if (this.request) {
      console.log('⚠️ [SseClient] Already connected, closing existing connection');
      this.disconnect();
    }
    const sseUrl = `${this.apiBaseUrl}/api/sse/machine/connect?machineId=${this.machineId}`;
    console.log('🔗 [SseClient] Connecting to:', sseUrl);

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

      this.request = protocol.request(options, (res) => {
        console.log('📡 [SseClient] Response status:', res.statusCode);

        if (res.statusCode !== 200) {
          console.error('❌ [SseClient] Failed to connect, status:', res.statusCode);
          this.isConnectedFlag = false;
          
          // ถ้าเป็น 502 ให้เรียก callback เพื่อแสดง SystemMaintenance
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

        // Handle incoming data
        res.on('data', (chunk: Buffer) => {
          this.buffer += chunk.toString();
          this.processBuffer();
        });

        res.on('end', () => {
          console.log('🔌 [SseClient] Connection ended');
          this.isConnectedFlag = false;
          this.scheduleReconnect();
        });

        res.on('error', (error) => {
          console.error('❌ [SseClient] Response error:', error);
          this.isConnectedFlag = false;
          this.scheduleReconnect();
        });
      });

      this.request.on('error', (error) => {
        console.error('❌ [SseClient] Request error:', error);
        this.isConnectedFlag = false;
        this.scheduleReconnect();
      });

      this.request.end();
    } catch (error) {
      console.error('❌ [SseClient] Failed to create connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Parse SSE buffer และ emit events
   */
  private processBuffer(): void {
    // แยกด้วย \n และ trim \r ออก (สำหรับ Windows)
    const lines = this.buffer.split('\n').map(line => line.replace(/\r$/, ''));

    // Keep incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        this.currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        this.currentData = line.slice(5).trim();
      } else if (line === '') {
        // Empty line = end of SSE message
        if (this.currentEvent && this.currentData) {
          this.handleEvent(this.currentEvent, this.currentData);
        }
        // Reset for next event
        this.currentEvent = '';
        this.currentData = '';
      }
    }
  }

  /**
   * Handle parsed SSE event
   */
  private handleEvent(eventType: string, dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);

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
    }
  }

  /**
   * ยกเลิกการเชื่อมต่อ
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this.isConnectedFlag = false;
    this.buffer = '';
    console.log('🔌 [SseClient] Disconnected');
  }

  /**
   * ตั้งเวลาเชื่อมต่อใหม่
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [SseClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5); // Exponential backoff

    console.log(
      `🔄 [SseClient] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * ลงทะเบียน callback สำหรับ event
   */
  on(eventType: string, callback: SseEventCallback): void {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType)!.push(callback);
  }

  /**
   * ยกเลิก callback
   */
  off(eventType: string, callback: SseEventCallback): void {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event ไปยัง callbacks
   */
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

  /**
   * ตรวจสอบสถานะการเชื่อมต่อ
   */
  getIsConnected(): boolean {
    return this.isConnectedFlag;
  }

  /**
   * ดึง machineId
   */
  getMachineId(): string {
    return this.machineId;
  }

  /**
   * แจ้ง backend ว่าพร้อม shutdown แล้ว
   */
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
}

// Default instance
export default new SseClient();
