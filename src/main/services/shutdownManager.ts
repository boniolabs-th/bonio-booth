/**
 * Shutdown Manager สำหรับ bonio-booth
 * จัดการ shutdown countdown และ logic ต่างๆ
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import sseClient, { MachineEventType } from './sseClient';
import machineService from './machineService';

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
  onLog?: (level: 'log' | 'warn' | 'error', message: string, data?: any) => void;
}

// ค่า default
const DEFAULT_COUNTDOWN_MINUTES = 2;
/** รอหลัง destroy() เพื่อให้ backend รับ connection close แล้ว mark offline + ส่ง Telegram ก่อนที่ OS จะปิด */
const POST_DESTROY_DELAY_SECONDS = 3;

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

  constructor() {
    console.log('🔧 [ShutdownManager] Initialized');
    this.setupSseListeners();
  }

  /**
   * ตั้งค่า listeners สำหรับ SSE events
   */
  private setupSseListeners(): void {
    // Shutdown scheduled (manual - กด Power Off จาก dashboard)
    sseClient.on(MachineEventType.SHUTDOWN_SCHEDULED, (_, data: any) => {
      console.log('🛑 [ShutdownManager] Received shutdown scheduled:', data);
      this.startCountdown(data.countdownMinutes, data.reason);
    });

    // Shutdown immediate (timer schedule)
    sseClient.on(MachineEventType.SHUTDOWN_IMMEDIATE, (_, data: any) => {
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
   * Helper function สำหรับส่ง log
   */
  private log(level: 'log' | 'warn' | 'error', message: string, data?: any): void {
    console[level](message, data || '');
    this.callbacks.onLog?.(level, message, data);
  }

  /**
   * เริ่ม countdown
   */
  startCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES, reason: ShutdownReason = 'manual'): void {
    const totalSeconds = minutes * 60;
    this.log('warn', `🛑 Starting countdown: ${minutes} minutes (${totalSeconds} seconds), reason: ${reason}`);
    this.log('log', `🔍 isInTransaction: ${this.isInTransaction}`);

    // ยกเลิก countdown เดิมถ้ามี
    this.clearCountdownTimer();

    this.state = {
      isScheduled: true,
      isPaused: false,
      remainingSeconds: totalSeconds,
      totalSeconds,
      reason,
      scheduledAt: new Date(),
    };

    // ถ้าอยู่ใน transaction ให้ pause ไว้ก่อน
    if (this.isInTransaction) {
      this.log('warn', '⏳ In transaction, pausing countdown (will start after transaction ends)');
      this.state.isPaused = true;
      this.callbacks.onCountdownUpdate?.(this.state);
      return;
    }

    this.log('log', '▶️ Not in transaction, starting countdown timer immediately');
    this.startCountdownTimer();
    this.callbacks.onCountdownUpdate?.(this.state);
    this.log('log', `✅ Countdown started successfully: ${totalSeconds} seconds`);
  }

  /**
   * เริ่ม countdown ถ้ายังไม่เริ่ม (ไม่ reset ถ้าเริ่มแล้ว)
   * ใช้สำหรับเช็คจาก isShutdownReady เพื่อไม่ให้ reset countdown ที่กำลังรันอยู่
   */
  ensureCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES, reason: ShutdownReason = 'manual'): void {
    console.log('🔍 [ShutdownManager] ========== ENSURE COUNTDOWN ==========');
    console.log('🔍 [ShutdownManager] Current state:', {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
      isInTransaction: this.isInTransaction,
    });

    // ถ้า countdown กำลังรันอยู่แล้ว ไม่ต้อง reset
    if (this.state.isScheduled && this.countdownTimer !== null) {
      console.log('⏸️ [ShutdownManager] Countdown already running, skipping reset');
      console.log('⏸️ [ShutdownManager] Current remaining seconds:', this.state.remainingSeconds);
      return;
    }

    // ถ้ายังไม่เริ่ม หรือถูก cancel ไปแล้ว ให้เริ่มใหม่
    console.log('▶️ [ShutdownManager] Countdown not running or was cancelled, starting new countdown');
    console.log('▶️ [ShutdownManager] Previous state:', {
      isScheduled: this.state.isScheduled,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
    });
    this.startCountdown(minutes, reason);
  }

  /**
   * เริ่ม countdown timer
   */
  private startCountdownTimer(): void {
    this.log('log', `⏱️ Starting countdown timer: ${this.state.remainingSeconds} seconds remaining`);
    this.countdownTimer = setInterval(() => {
      // เช็คว่า countdown ยังถูก schedule อยู่หรือไม่ (ถ้ายกเลิกแล้วให้หยุดทันที)
      if (!this.state.isScheduled) {
        this.log('warn', '🛑 Countdown was cancelled, stopping timer immediately');
        this.clearCountdownTimer();
        return;
      }

      if (this.state.isPaused) {
        // ไม่ log ทุกวินาทีเมื่อ pause (จะ spam log)
        return;
      }

      this.state.remainingSeconds--;
      // Log ทุก 10 วินาที หรือเมื่อเหลือน้อยกว่า 10 วินาที
      if (this.state.remainingSeconds % 10 === 0 || this.state.remainingSeconds <= 10) {
        this.log('log', `⏱️ Countdown: ${this.state.remainingSeconds}s remaining`);
      }
      this.callbacks.onCountdownUpdate?.(this.state);

      // เวลาหมด - shutdown
      if (this.state.remainingSeconds <= 0) {
        console.log('⏰ [ShutdownManager] Countdown finished, executing shutdown');
        this.clearCountdownTimer(); // Clear timer ก่อน execute
        this.executeShutdown();
      }
    }, 1000);
  }

  /**
   * ยกเลิก countdown
   */
  cancelShutdown(): void {
    this.log('log', '🔄 ========== CANCELLING SHUTDOWN ==========');
    const stateBefore = {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
    };
    this.log('log', '🔄 State before cancel', stateBefore);

    this.clearCountdownTimer();

    this.state = {
      isScheduled: false,
      isPaused: false,
      remainingSeconds: 0,
      totalSeconds: 0,
    };

    const stateAfter = {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
    };
    this.log('log', '🔄 State after cancel', stateAfter);

    this.callbacks.onShutdownCancelled?.();
    this.callbacks.onCountdownUpdate?.(this.state);
    this.log('log', '✅ Shutdown cancelled successfully');
  }

  /**
   * Reset countdown เมื่อมี activity (กดอะไรที่หน้าตู้)
   * จะ reset เฉพาะเมื่อ countdown กำลังรันอยู่ (isScheduled = true)
   * เพื่อป้องกันการ shutdown ต่อหน้า user
   */
  onUserActivity(): void {
    // เช็คว่า countdown กำลังรันอยู่หรือไม่ (ต้อง isScheduled = true)
    if (!this.state.isScheduled) {
      console.log('ℹ️ [ShutdownManager] User activity detected but no shutdown scheduled, ignoring');
      return;
    }

    if (this.state.isPaused) {
      console.log('ℹ️ [ShutdownManager] User activity detected but countdown is paused, ignoring');
      return;
    }

    console.log('👆 [ShutdownManager] User activity detected, resetting countdown to prevent shutdown');
    console.log('👆 [ShutdownManager] Before reset:', {
      remainingSeconds: this.state.remainingSeconds,
      totalSeconds: this.state.totalSeconds,
    });

    // Reset เป็น totalSeconds ใหม่ (ไม่ใช่ 10 นาที แต่ใช้ totalSeconds ที่ตั้งไว้)
    this.state.remainingSeconds = this.state.totalSeconds;

    console.log('👆 [ShutdownManager] After reset:', {
      remainingSeconds: this.state.remainingSeconds,
      totalSeconds: this.state.totalSeconds,
    });

    this.callbacks.onActivityDetected?.();
    this.callbacks.onCountdownUpdate?.(this.state);
  }

  /**
   * Pause countdown (เมื่อไม่อยู่หน้า home)
   */
  pauseCountdown(): void {
    if (this.state.isScheduled && !this.state.isPaused) {
      console.log('⏸️ [ShutdownManager] Pausing countdown (not on home page)');
      this.state.isPaused = true;
      this.clearCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * Resume countdown (เมื่อกลับมาหน้า home)
   */
  resumeCountdown(): void {
    if (this.state.isScheduled && this.state.isPaused && !this.isInTransaction) {
      console.log('▶️ [ShutdownManager] Resuming countdown (back to home page)');
      this.state.isPaused = false;
      this.startCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * Reset countdown เป็น 1 นาทีใหม่เมื่อกลับมาหน้า home
   */
  resetCountdownOnHome(): void {
    if (this.state.isScheduled && !this.isInTransaction) {
      console.log('🔄 [ShutdownManager] Resetting countdown to 1 minute (back to home page)');
      this.state.isPaused = false;
      this.state.remainingSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.state.totalSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.clearCountdownTimer();
      this.startCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
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
    console.log('✅ [ShutdownManager] ========== TRANSACTION ENDED ==========');
    console.log('✅ [ShutdownManager] State before endTransaction:', {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      isInTransaction: this.isInTransaction,
    });

    this.isInTransaction = false;

    if (this.state.isScheduled) {
      console.log('🔄 [ShutdownManager] Resetting countdown after transaction');

      // Reset countdown เป็น 10 นาทีใหม่
      this.state.isPaused = false;
      this.state.remainingSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.state.totalSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;

      console.log('▶️ [ShutdownManager] Starting countdown timer after transaction ended');
      this.startCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
      console.log('✅ [ShutdownManager] Countdown resumed after transaction');
    } else {
      console.log('ℹ️ [ShutdownManager] No scheduled shutdown, nothing to resume');
    }
  }

  /**
   * Execute shutdown command
   */
  async executeShutdown(): Promise<void> {
    this.log('error', '🛑 ========== EXECUTING SHUTDOWN ==========');
    const state = {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
    };
    this.log('error', '🛑 State', state);

    this.clearCountdownTimer();
    this.callbacks.onShutdownStarting?.();

    try {
      // แจ้ง backend ก่อน (mark offline + ส่ง Telegram ทันที) — ไม่พึ่ง connection หลุด จึงแจ้งได้แม้ process ถูก kill เร็ว
      console.log('📴 [ShutdownManager] Notifying backend (going offline)...');
      await machineService.notifyGoingOffline().catch((err) => {
        console.error('⚠️ [ShutdownManager] Notify going offline failed (continuing):', err);
      });

      // ตัด SSE
      console.log('🔌 [ShutdownManager] Disconnecting SSE before shutdown...');
      await sseClient.destroy();

      // รอให้ TCP close ไปถึง backend (สำรอง)
      console.log(`⏳ [ShutdownManager] Waiting ${POST_DESTROY_DELAY_SECONDS}s before shutdown...`);
      await new Promise((resolve) => setTimeout(resolve, POST_DESTROY_DELAY_SECONDS * 1000));

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

      console.log(`🖥️ [ShutdownManager] Platform: ${platform}`);
      console.log(`🖥️ [ShutdownManager] Executing shutdown command: ${shutdownCmd}`);
      const result = await execAsync(shutdownCmd);
      console.log('✅ [ShutdownManager] Shutdown command executed successfully');
      console.log('✅ [ShutdownManager] Result:', result);
    } catch (error) {
      console.error('❌ [ShutdownManager] Shutdown failed:', error);
      console.error('❌ [ShutdownManager] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
      console.log('🛑 [ShutdownManager] Clearing countdown timer');
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      console.log('✅ [ShutdownManager] Countdown timer cleared');
    } else {
      console.log('ℹ️ [ShutdownManager] No countdown timer to clear');
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
