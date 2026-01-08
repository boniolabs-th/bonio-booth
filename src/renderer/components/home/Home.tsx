import React from 'react';
import { useNavigate } from 'react-router-dom';
// import icon from '../../../../assets/icons/default_full.svg';
import './Home.css';

import { REFETCH_INTERVAL } from '../../utils/appConfig';

interface ShutdownState {
  isScheduled: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

interface AppCloseState {
  isScheduled: boolean;
  isPaused: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

function Home(): React.JSX.Element {
  const navigate = useNavigate();
  const [shutdownState, setShutdownState] =
    React.useState<ShutdownState | null>(null);
  const [appCloseState, setAppCloseState] =
    React.useState<AppCloseState | null>(null);

  const handleStartClick = React.useCallback(() => {
    // ยกเลิก countdown เมื่อ click start
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.sendMessage('home-page-inactive');
      // ยกเลิก countdown ทั้งสอง
      window.electron.ipcRenderer.invoke('cancel-shutdown');
      window.electron.ipcRenderer.invoke('cancel-app-close');
    }
    navigate('/select-print');
  }, [navigate]);

  const handleTermsClick = React.useCallback(() => {
    navigate('/terms-and-services');
  }, [navigate]);

  const handleHelpClick = React.useCallback(() => {
    navigate('/get-help');
  }, [navigate]);

  // เช็ค isClosedAppReady และ isShutdownReady เมื่อกลับมาหน้า home
  React.useEffect(() => {
    const checkShutdownStatus = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window as any).electron.payment.forceInit(); // forceInit retrieves fresh data
        if (res.success && res.data) {
          // handleShutdownReady จะถูกเรียกใน main process หลังจาก forceInit
          // ดังนั้น countdown จะเริ่มอัตโนมัติถ้า isShutdownReady หรือ isClosedAppReady เป็น true
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking shutdown status:', error);
      }
    };

    // เช็คเมื่อ component mount
    checkShutdownStatus();
  }, []);

  // รับ countdown updates และแจ้ง main process ว่าเข้าหน้า home
  React.useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    // แจ้ง main process ว่าเข้าหน้า home (resume countdown)
    window.electron.ipcRenderer.sendMessage('home-page-active');

    // รับ shutdown countdown updates
    const removeShutdownListener = window.electron.ipcRenderer.on(
      'shutdown-countdown-update',
      (...args: unknown[]) => {
        const state = args[0] as ShutdownState;
        setShutdownState(state);
      },
    );

    // รับ app close countdown updates
    const removeAppCloseListener = window.electron.ipcRenderer.on(
      'app-close-countdown-update',
      (...args: unknown[]) => {
        const state = args[0] as AppCloseState;
        setAppCloseState(state);
      },
    );

    // ดึง state ปัจจุบัน
    const loadCurrentStates = async (): Promise<void> => {
      try {
        const shutdownStateResult =
          await window.electron?.ipcRenderer.invoke('get-shutdown-state');
        if (shutdownStateResult) {
          setShutdownState(shutdownStateResult);
        }
        const appCloseStateResult = await window.electron?.ipcRenderer.invoke(
          'get-app-close-state',
        );
        if (appCloseStateResult) {
          setAppCloseState(appCloseStateResult);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error loading countdown states:', error);
      }
    };

    loadCurrentStates();

    return (): void => {
      // แจ้ง main process ว่าออกจากหน้า home (pause countdown)
      window.electron.ipcRenderer.sendMessage('home-page-inactive');
      if (removeShutdownListener) {
        removeShutdownListener();
      }
      if (removeAppCloseListener) {
        removeAppCloseListener();
      }
    };
  }, []);

  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window as any).electron.payment.forceInit(); // forceInit retrieves fresh data
        if (res.success && res.data?.machine) {
          if (res.data.machine.isMaintenanceMode) {
            navigate('/system-maintenance', { state: { maintenance: true } });
          } else if (res.data.machine.paperLevel === 0) {
            navigate('/out-of-paper', { state: { maintenance: true } });
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking machine status in Home:', error);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 10 seconds
    const interval = setInterval(checkStatus, REFETCH_INTERVAL.HOME * 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  // Format time สำหรับแสดง countdown
  const formatTime = React.useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // แสดง countdown UI
  const renderCountdown = React.useCallback((): React.JSX.Element | null => {
    let activeCountdown: ShutdownState | AppCloseState | null = null;
    let isShutdown = false;

    if (shutdownState?.isScheduled && !shutdownState.isPaused) {
      activeCountdown = shutdownState;
      isShutdown = true;
    } else if (appCloseState?.isScheduled && !appCloseState.isPaused) {
      activeCountdown = appCloseState;
      isShutdown = false;
    }

    if (!activeCountdown || activeCountdown.remainingSeconds <= 0) {
      return null;
    }

    const label = isShutdown ? 'กำลังจะปิดเครื่อง' : 'กำลังจะปิดแอป';

    return (
      <div className="countdown-overlay">
        <div className="countdown-content">
          <div className="countdown-message">
            ขออภัยเนื่องจากอยู่นอกเวลาทำการ
          </div>
          <div className="countdown-label">{label}</div>
          <div className="countdown-time">
            {formatTime(activeCountdown.remainingSeconds)}
          </div>
        </div>
      </div>
    );
  }, [shutdownState, appCloseState, formatTime]);

  return (
    <main className="home-container" onClick={handleStartClick}>
      {/* <section className="logo-section">
        <img
          src={icon}
          alt="Bonio Booth Logo"
          className="logo-image"
          width="100%"
          height="auto"
        />
      </section> */}

      <section className="action-section">
        {/* Removed TAP TO START button - click anywhere to start */}
      </section>

      <footer className="footer-section" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={handleTermsClick}
          className="terms-link"
          aria-label="Open Terms and Services"
        >
          <div className="extend-btn-text">
            <p>ข้อตกลงการให้บริการ</p>
            <p style={{ fontSize: '1.2rem' }}>Terms & Conditions</p>
          </div>
        </button>
        <button
          type="button"
          onClick={handleHelpClick}
          className="terms-link"
          aria-label="Open Help"
        >
          <div className="extend-btn-text">
            <p>ขอความช่วยเหลือ</p>
            <p style={{ fontSize: '1.2rem' }}>Need Help?</p>
          </div>
        </button>
      </footer>

      {renderCountdown()}
    </main>
  );
}

export default Home;
