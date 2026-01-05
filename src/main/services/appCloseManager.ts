/**
 * App Close Manager สำหรับ bonio-booth
 * จัดการ countdown สำหรับปิดแอป
 */

export interface AppCloseState {
  isScheduled: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
  scheduledAt?: Date;
}

export interface AppCloseManagerCallbacks {
  onCountdownUpdate?: (state: AppCloseState) => void;
  onAppCloseStarting?: () => void;
  onAppCloseCancelled?: () => void;
  onActivityDetected?: () => void;
  onLog?: (level: 'log' | 'warn' | 'error', message: string, data?: any) => void;
}

// ค่า default
const DEFAULT_COUNTDOWN_MINUTES = 1;

export class AppCloseManager {
  private state: AppCloseState = {
    isScheduled: false,
    isPaused: false,
    remainingSeconds: 0,
    totalSeconds: 0,
  };

  private countdownTimer: NodeJS.Timeout | null = null;
  private callbacks: AppCloseManagerCallbacks = {};
  private isInTransaction: boolean = false;

  constructor() {
    console.log('🔧 [AppCloseManager] Initialized');
  }

  /**
   * ลงทะเบียน callbacks
   */
  setCallbacks(callbacks: AppCloseManagerCallbacks): void {
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
  startCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES): void {
    const totalSeconds = minutes * 60;
    this.log('warn', `🚪 Starting app close countdown: ${minutes} minutes (${totalSeconds} seconds)`);
    this.log('log', `🔍 isInTransaction: ${this.isInTransaction}`);

    // ยกเลิก countdown เดิมถ้ามี
    this.clearCountdownTimer();

    this.state = {
      isScheduled: true,
      isPaused: false,
      remainingSeconds: totalSeconds,
      totalSeconds,
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
    this.log('log', `✅ App close countdown started successfully: ${totalSeconds} seconds`);
  }

  /**
   * เริ่ม countdown ถ้ายังไม่เริ่ม (ไม่ reset ถ้าเริ่มแล้ว)
   * ใช้สำหรับเช็คจาก isClosedAppReady เพื่อไม่ให้ reset countdown ที่กำลังรันอยู่
   */
  ensureCountdown(minutes: number = DEFAULT_COUNTDOWN_MINUTES): void {
    console.log('🔍 [AppCloseManager] ========== ENSURE COUNTDOWN ==========');
    console.log('🔍 [AppCloseManager] Current state:', {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
      isInTransaction: this.isInTransaction,
    });

    // ถ้า countdown กำลังรันอยู่แล้ว ไม่ต้อง reset
    if (this.state.isScheduled && this.countdownTimer !== null) {
      console.log('⏸️ [AppCloseManager] Countdown already running, skipping reset');
      console.log('⏸️ [AppCloseManager] Current remaining seconds:', this.state.remainingSeconds);
      return;
    }

    // ถ้ายังไม่เริ่ม หรือถูก cancel ไปแล้ว ให้เริ่มใหม่
    console.log('▶️ [AppCloseManager] Countdown not running or was cancelled, starting new countdown');
    console.log('▶️ [AppCloseManager] Previous state:', {
      isScheduled: this.state.isScheduled,
      countdownTimer: this.countdownTimer !== null ? 'running' : 'null',
    });
    this.startCountdown(minutes);
  }

  /**
   * เริ่ม countdown timer
   */
  private startCountdownTimer(): void {
    this.log('log', `⏱️ Starting app close countdown timer: ${this.state.remainingSeconds} seconds remaining`);
    this.countdownTimer = setInterval(() => {
      // เช็คว่า countdown ยังถูก schedule อยู่หรือไม่ (ถ้ายกเลิกแล้วให้หยุดทันที)
      if (!this.state.isScheduled) {
        this.log('warn', '🛑 App close countdown was cancelled, stopping timer immediately');
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
        this.log('log', `⏱️ App close countdown: ${this.state.remainingSeconds}s remaining`);
      }
      this.callbacks.onCountdownUpdate?.(this.state);

      // เวลาหมด - ปิดแอป
      if (this.state.remainingSeconds <= 0) {
        console.log('⏰ [AppCloseManager] Countdown finished, closing application');
        this.clearCountdownTimer(); // Clear timer ก่อน execute
        this.executeAppClose();
      }
    }, 1000);
  }

  /**
   * ยกเลิก countdown
   */
  cancelAppClose(): void {
    this.log('log', '🔄 ========== CANCELLING APP CLOSE ==========');
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

    this.callbacks.onAppCloseCancelled?.();
    this.callbacks.onCountdownUpdate?.(this.state);
    this.log('log', '✅ App close cancelled successfully');
  }

  /**
   * Reset countdown เมื่อมี activity (กดอะไรที่หน้าตู้)
   * จะ reset เฉพาะเมื่อ countdown กำลังรันอยู่ (isScheduled = true)
   */
  onUserActivity(): void {
    // เช็คว่า countdown กำลังรันอยู่หรือไม่ (ต้อง isScheduled = true)
    if (!this.state.isScheduled) {
      console.log('ℹ️ [AppCloseManager] User activity detected but no app close scheduled, ignoring');
      return;
    }

    if (this.state.isPaused) {
      console.log('ℹ️ [AppCloseManager] User activity detected but countdown is paused, ignoring');
      return;
    }

    console.log('👆 [AppCloseManager] User activity detected, resetting countdown to prevent app close');
    console.log('👆 [AppCloseManager] Before reset:', {
      remainingSeconds: this.state.remainingSeconds,
      totalSeconds: this.state.totalSeconds,
    });

    // Reset เป็น totalSeconds ใหม่
    this.state.remainingSeconds = this.state.totalSeconds;

    console.log('👆 [AppCloseManager] After reset:', {
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
      console.log('⏸️ [AppCloseManager] Pausing countdown (not on home page)');
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
      console.log('▶️ [AppCloseManager] Resuming countdown (back to home page)');
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
      console.log('🔄 [AppCloseManager] Resetting countdown to 1 minute (back to home page)');
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
    console.log('💳 [AppCloseManager] Transaction started, pausing countdown');
    this.isInTransaction = true;

    if (this.state.isScheduled) {
      this.state.isPaused = true;
      this.clearCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
    }
  }

  /**
   * จบ transaction และกลับหน้า home
   * ให้ reset countdown เป็น 1 นาทีใหม่
   */
  endTransaction(): void {
    console.log('✅ [AppCloseManager] ========== TRANSACTION ENDED ==========');
    console.log('✅ [AppCloseManager] State before endTransaction:', {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
      isInTransaction: this.isInTransaction,
    });

    this.isInTransaction = false;

    if (this.state.isScheduled) {
      console.log('🔄 [AppCloseManager] Resetting countdown after transaction');

      // Reset countdown เป็น 1 นาทีใหม่
      this.state.isPaused = false;
      this.state.remainingSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;
      this.state.totalSeconds = DEFAULT_COUNTDOWN_MINUTES * 60;

      console.log('▶️ [AppCloseManager] Starting countdown timer after transaction ended');
      this.startCountdownTimer();
      this.callbacks.onCountdownUpdate?.(this.state);
      console.log('✅ [AppCloseManager] Countdown resumed after transaction');
    } else {
      console.log('ℹ️ [AppCloseManager] No scheduled app close, nothing to resume');
    }
  }

  /**
   * Execute app close
   */
  executeAppClose(): void {
    this.log('error', '🚪 ========== EXECUTING APP CLOSE ==========');
    const state = {
      isScheduled: this.state.isScheduled,
      isPaused: this.state.isPaused,
      remainingSeconds: this.state.remainingSeconds,
    };
    this.log('error', '🚪 State', state);

    this.clearCountdownTimer();
    this.callbacks.onAppCloseStarting?.();

    // เรียก callback เพื่อให้ main.ts ปิดแอป
    // main.ts จะจัดการ shouldQuit และ mainWindow.close()
    this.callbacks.onAppCloseStarting?.();
  }

  /**
   * Clear countdown timer
   */
  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      console.log('🛑 [AppCloseManager] Clearing countdown timer');
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      console.log('✅ [AppCloseManager] Countdown timer cleared');
    } else {
      console.log('ℹ️ [AppCloseManager] No countdown timer to clear');
    }
  }

  /**
   * ดึง state ปัจจุบัน
   */
  getState(): AppCloseState {
    return { ...this.state };
  }

  /**
   * ตรวจสอบว่ามี app close scheduled อยู่หรือไม่
   */
  isAppCloseScheduled(): boolean {
    return this.state.isScheduled;
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
export default new AppCloseManager();

