/**
 * Shutdown Manager สำหรับ bonio-booth
 * จัดการ shutdown countdown และ logic ต่างๆ
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import sseClient, { MachineEventType, ShutdownScheduledPayload, ShutdownImmediatePayload } from './sseClient';

const execAsync = promisify(exec);

export type ShutdownReason = 'manual' | 'timer';

export interface ShutdownState {
  isScheduled: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  reason?: ShutdownReason;
  scheduledAt?: Date;
}

export interface ShutdownManagerCallbacks {
  onCountdownUpdate?: (state: ShutdownState) => void;
  onShutdownStarting?: () => void;
  onShutdownCancelled?: () => void;
  onActivityDetected?: () => void;
}

// ค่า default
const DEFAULT_COUNTDOWN_MINUTES = 10;
const SHUTDOWN_NOTIFY_SECONDS = 5; // แจ้ง backend 5 วินาทีก่อน shutdown

export class ShutdownManager {
  private state: ShutdownState = {
    isScheduled: false,
    isPaused: false,
    remainingSeconds: 0,
    totalSeconds: 0,
  };

  private countdownTimer: NodeJS.Timeout | null = null;
  private callbacks: ShutdownManagerCallbacks = {};
  private isInTransaction: boolean = false;
  private hasNotifiedBackend: boolean = false;

  constructor() {
    console.log('🔧 [ShutdownManager] Initialized');
    this.setupSseListeners();
  }

  /**
   * ตั้งค่า listeners สำหรับ SSE events
   */
  private setupSseListeners(): void {
    // Shutdown scheduled (manual - กด Power Off จาก dashboard)
    sseClient.on(MachineEventType.SHUTDOWN_SCHEDULED, (_, data: ShutdownScheduledPayload) => {
      console.log('🛑 [ShutdownManager] Received shutdown scheduled:', data);
      this.startCountdown(data.countdownMinutes, data.reason);
    });

    // Shutdown immediate (timer schedule)
    sseClient.on(MachineEventType.SHUTDOWN_IMMEDIATE, (_, data: ShutdownImmediatePayload) => {
      console.log('🛑 [ShutdownManager] Received immediate shutdown:', data);
      // ถ้าอยู่ใน transaction ให้รอก่อน
      if (this.isInTransaction) {
        console.log('⏳ [ShutdownManager] In transaction, will shutdown after completion');
        this.state = {
          isScheduled: true,
          isPaused: true,
          remainingSeconds: 0,
          totalSeconds: 0,
          reason: 'timer',
          scheduledAt: new Date(),
        };
        return;
      }
      // Shutdown ทันที
      this.executeShutdown();
    });

    // Shutdown cancelled (กด Power On ขณะ countdown)
    sseClient.on(MachineEventType.SHUTDOWN_CANCELLED, () => {
      console.log('🔄 [ShutdownManager] Received shutdown cancel');
      this.cancelShutdown();
    });
  }

  /**
   * ลงทะเบียน callbacks
   */
  setCallbacks(callbacks: ShutdownManagerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * เริ่ม countdown
   */
  startCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES, reason: ShutdownReason = 'manual'): void {
    console.log(`🛑 [ShutdownManager] Starting countdown: ${minutes} minutes, reason: ${reason}`);

    // ยกเลิก countdown เดิมถ้ามี
    this.clearCountdownTimer();

    const totalSeconds = minutes * 60;
    this.state = {
      isScheduled: true,
      isPaused: false,
      remainingSeconds: totalSeconds,
      totalSeconds,
      reason,
      scheduledAt: new Date(),
    };
    this.hasNotifiedBackend = false;

    // ถ้าอยู่ใน transaction ให้ pause ไว้ก่อน
    if (this.isInTransaction) {
      console.log('⏳ [ShutdownManager] In transaction, pausing countdown');
      this.state.isPaused = true;
      this.callbacks.onCountdownUpdate?.(this.state);
      return;
    }

    this.startCountdownTimer();
    this.callbacks.onCountdownUpdate?.(this.state);
  }

  /**
   * เริ่ม countdown ถ้ายังไม่เริ่ม (ไม่ reset ถ้าเริ่มแล้ว)
   * ใช้สำหรับเช็คจาก isShutdownReady เพื่อไม่ให้ reset countdown ที่กำลังรันอยู่
   */
  ensureCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES, reason: ShutdownReason = 'manual'): void {
    // ถ้า countdown กำลังรันอยู่แล้ว ไม่ต้อง reset
    if (this.state.isScheduled && this.countdownTimer !== null) {
      console.log('⏸️ [ShutdownManager] Countdown already running, skipping reset');
      return;
    }

    // ถ้ายังไม่เริ่ม ให้เริ่มใหม่
    console.log('▶️ [ShutdownManager] Countdown not running, starting new countdown');
    this.startCountdown(minutes, reason);
  }

  /**
   * เริ่ม countdown timer
   */
  private startCountdownTimer(): void {
    this.countdownTimer = setInterval(() => {
      if (this.state.isPaused) return;

      this.state.remainingSeconds--;
      this.callbacks.onCountdownUpdate?.(this.state);

      // แจ้ง backend 5 วินาทีก่อน shutdown
      if (this.state.remainingSeconds === SHUTDOWN_NOTIFY_SECONDS && !this.hasNotifiedBackend) {
        console.log('📤 [ShutdownManager] Notifying backend: shutdown ready');
        this.notifyShutdownReady();
      }

      // เวลาหมด - shutdown
      if (this.state.remainingSeconds <= 0) {
        console.log('⏰ [ShutdownManager] Countdown finished, executing shutdown');
        this.executeShutdown();
      }
    }, 1000);
  }

  /**
   * ยกเลิก countdown
   */
  cancelShutdown(): void {
    console.log('🔄 [ShutdownManager] Cancelling shutdown');
    this.clearCountdownTimer();

    this.state = {
      isScheduled: false,
      isPaused: false,
      remainingSeconds: 0,
      totalSeconds: 0,
    };
    this.hasNotifiedBackend = false;

    this.callbacks.onShutdownCancelled?.();
    this.callbacks.onCountdownUpdate?.(this.state);
  }

  /**
   * Reset countdown เมื่อมี activity (กดอะไรที่หน้าตู้)
   */
  onUserActivity(): void {
    if (!this.state.isScheduled || this.state.isPaused) return;

    console.log('👆 [ShutdownManager] User activity detected, resetting countdown');

    // Reset เป็น 10 นาทีใหม่
    this.state.remainingSeconds = this.state.totalSeconds;
    this.hasNotifiedBackend = false;

    this.callbacks.onActivityDetected?.();
    this.callbacks.onCountdownUpdate?.(this.state);
  }

  /**
   * เริ่ม transaction (ไปหน้า frame selection หรือทำ payment)
   * ให้ pause countdown
   */
  startTransaction(): void {
    console.log('💳 [ShutdownManager] Transaction started, pausing countdown');
    this.isInTransaction = true;

    if (this.state.isScheduled) {
      this.state.isPaused = true;
      this.clearCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * จบ transaction และกลับหน้า home
   * ให้ reset countdown เป็น 10 นาทีใหม่
   */
  endTransaction(): void {
    console.log('✅ [ShutdownManager] Transaction ended, returning to home');
    this.isInTransaction = false;

    if (this.state.isScheduled) {
      console.log('🔄 [ShutdownManager] Resetting countdown after transaction');

      // Reset countdown เป็น 10 นาทีใหม่
      this.state.isPaused = false;
      this.state.remainingSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.state.totalSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.hasNotifiedBackend = false;

      this.startCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * แจ้ง backend ว่าพร้อม shutdown
   */
  private async notifyShutdownReady(): Promise<void> {
    if (this.hasNotifiedBackend) return;

    this.hasNotifiedBackend = true;
    this.callbacks.onShutdownStarting?.();

    try {
      await sseClient.notifyShutdownReady();
      console.log('✅ [ShutdownManager] Backend notified successfully');
    } catch (error) {
      console.error('❌ [ShutdownManager] Failed to notify backend:', error);
    }
  }

  /**
   * Execute shutdown command
   */
  async executeShutdown(): Promise<void> {
    console.log('🛑 [ShutdownManager] Executing shutdown...');

    this.clearCountdownTimer();
    this.callbacks.onShutdownStarting?.();

    // แจ้ง backend ก่อน (ถ้ายังไม่ได้แจ้ง)
    if (!this.hasNotifiedBackend) {
      await this.notifyShutdownReady();
    }

    // รอ 5 วินาทีให้ backend ปิด smart plug
    console.log('⏳ [ShutdownManager] Waiting 5 seconds for backend to turn off smart plug...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Shutdown OS
    try {
      const platform = process.platform;
      let shutdownCmd: string;

      if (platform === 'win32') {
        // Windows - shutdown ทันที
        shutdownCmd = 'shutdown /s /f /t 0';
      } else if (platform === 'darwin') {
        // macOS
        shutdownCmd = 'sudo shutdown -h now';
      } else {
        // Linux
        shutdownCmd = 'sudo shutdown -h now';
      }

      console.log(`🖥️ [ShutdownManager] Executing: ${shutdownCmd}`);
      await execAsync(shutdownCmd);
    } catch (error) {
      console.error('❌ [ShutdownManager] Shutdown failed:', error);
      // ถ้า shutdown ไม่สำเร็จ ให้ reset state
      this.state = {
        isScheduled: false,
        isPaused: false,
        remainingSeconds: 0,
        totalSeconds: 0,
      };
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * Clear countdown timer
   */
  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * ดึง state ปัจจุบัน
   */
  getState(): ShutdownState {
    return { ...this.state };
  }

  /**
   * ตรวจสอบว่ามี shutdown scheduled อยู่หรือไม่
   */
  isShutdownScheduled(): boolean {
    return this.state.isScheduled;
  }

  /**
   * ทดสอบ shutdown service (สำหรับ development/testing)
   * ⚠️ คำเตือน: จะ shutdown เครื่องจริงๆ!
   */
  testShutdown(): void {
    console.log('🧪 [ShutdownManager] Test shutdown called');
    this.executeShutdown();
  }

  /**
   * ทำลาย manager (cleanup)
   */
  destroy(): void {
    this.clearCountdownTimer();
    this.state = {
      isScheduled: false,
      isPaused: false,
      remainingSeconds: 0,
      totalSeconds: 0,
    };
  }
}

// Default instance
export default new ShutdownManager();
