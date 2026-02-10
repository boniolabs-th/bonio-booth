import {
  MemoryRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Home,
  SelectPrint,
  FrameSelection,
  PaymentQR,
  PhotoPrepare,
  MainShooting,
  PhotoConfirmation,
  PhotoDecorate,
  PhotoFilter,
  PhotoResult,
  TermsAndServices,
  GetHelp,
  DiscountCoupon,
  ErrorBoundary,
  OutOfPaper,
  SystemMaintenance,
  PrintTest,
  RequestImage,
  PasswordModal,
  MachineConfigModal,
  CameraConfigModal,
  PrinterConfigModal,
} from './components';
import './App.css';
import { useBlockTouchContextMenu } from './hooks/useBlockTouchContextMenu';
import AlertModal from './components/alertmodal';
// import machineService from '../main/services/machineService';
// import { getEnvConfig } from '../main/config/env.config';
// import sseClient from '../main/services/sseClient';
// import { useMachineStatus } from './hooks/useMachineStatus';
// import { useSseStatus } from './hooks/useSseStatus';

function RouteListener() {
  const location = useLocation();

  useEffect(() => {
    // Send route change message to index.tsx
    window.postMessage(
      { type: 'ROUTE_CHANGE', pathname: location.pathname },
      '*',
    );
  }, [location]);

  return null;
}

function MaintenanceListener() {
  const navigate = useNavigate();
  const location = useLocation();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showQuitPasswordModal, setShowQuitPasswordModal] = useState(false);
  const [showClearConfigPasswordModal, setShowClearConfigPasswordModal] =
    useState(false);
  const [showCameraConfigModal, setShowCameraConfigModal] = useState(false);
  const [showPrinterConfigModal, setShowPrinterConfigModal] = useState(false);

  // ✅ Alert modal state
  const [alertState, setAlertState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    open: false,
    title: '',
    message: '',
  });

  const showAlert = (
    title: string,
    message: string,
    onConfirm?: () => void,
  ) => {
    setAlertState({
      open: true,
      title,
      message,
      onConfirm,
    });
  };

  const closeAlert = () => {
    setAlertState((prev) => ({ ...prev, open: false }));
  };

  useEffect(() => {
    // Check status on mount - but only navigate if we're not in a normal flow page
    const checkStatus = async () => {
      try {
        const res = await (window as any).electron.payment.getMachineData();
        if (res.success && res.machine) {
          const currentPath = location.pathname;
          // Only navigate to maintenance/out-of-paper if we're not in a normal flow
          // Don't interrupt user flow (photo-prepare, main-shooting, photo-decorate, etc.)
          const isInNormalFlow = [
            '/select-print',
            '/discount-coupon',
            '/frame-selection',
            '/payment',
            '/payment-qr',
            '/photo-prepare',
            '/main-shooting',
            '/photo-confirmation',
            '/photo-decorate',
            '/photo-filter',
            '/photo-result',
          ].includes(currentPath);

          if (res.machine.isMaintenanceMode) {
            // Only navigate if not already in maintenance or in normal flow
            if (currentPath !== '/system-maintenance' && !isInNormalFlow) {
              navigate('/system-maintenance', { state: { maintenance: true } });
            }
          } else if (res.machine.paperLevel === 0) {
            // Only navigate if not already in out-of-paper or in normal flow
            if (currentPath !== '/out-of-paper' && !isInNormalFlow) {
              navigate('/out-of-paper', { state: { maintenance: true } });
            }
          }
        }
      } catch (error) {
        console.error('Failed to check machine status:', error);
      }
    };

    checkStatus();

    const unsubscribe = (window as any).electron.ipcRenderer.on(
      'machine-init',
      (arg: any) => {
        const currentPath = location.pathname;
        // Only navigate if we're not in a normal flow page
        const isInNormalFlow = [
          '/select-print',
          '/discount-coupon',
          '/frame-selection',
          '/payment',
          '/payment-qr',
          '/photo-prepare',
          '/main-shooting',
          '/photo-confirmation',
          '/photo-decorate',
          '/photo-filter',
          '/photo-result',
        ].includes(currentPath);

        if (arg?.machine?.isMaintenanceMode) {
          // Only navigate if not already in maintenance or in normal flow
          if (currentPath !== '/system-maintenance' && !isInNormalFlow) {
            navigate('/system-maintenance', { state: { maintenance: true } });
          }
        } else if (arg?.machine?.paperLevel === 0) {
          // Only navigate if not already in out-of-paper or in normal flow
          if (currentPath !== '/out-of-paper' && !isInNormalFlow) {
            navigate('/out-of-paper', { state: { maintenance: true } });
          }
        }
      },
    );

    const unsubscribeNavigate = (window as any).electron.ipcRenderer.on(
      'navigate-to',
      (path: string) => {
        if (path) navigate(path);
      },
    );

    const unsubscribePasswordModal = (window as any).electron.ipcRenderer.on(
      'show-print-test-password-modal',
      () => {
        setShowPasswordModal(true);
      },
    );

    const unsubscribeQuitPasswordModal = (
      window as any
    ).electron.ipcRenderer.on('show-quit-app-password-modal', () => {
      setShowQuitPasswordModal(true);
    });

    const unsubscribeClearConfigPasswordModal = (
      window as any
    ).electron.ipcRenderer.on('show-clear-config-password-modal', () => {
      setShowClearConfigPasswordModal(true);
    });

    const unsubscribeCameraConfigModal = (
      window as any
    ).electron.ipcRenderer.on('show-camera-config-modal', () => {
      setShowCameraConfigModal(true);
    });

    const unsubscribePrinterConfigModal = (
      window as any
    ).electron.ipcRenderer.on('show-printer-config-modal', () => {
      setShowPrinterConfigModal(true);
    });

    const unsubscribeSse502 = (window as any).electron.ipcRenderer.on(
      'sse-status-502',
      () => {
        navigate('/system-maintenance', { state: { maintenance: true } });
      },
    );

    const unsubscribeCameraCheck = (window as any).electron.ipcRenderer.on(
      'check-camera-availability',
      async (data: { configuredDeviceId: string; configuredLabel: string }) => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(
            (device) => device.kind === 'videoinput',
          );

          const found = videoDevices.some(
            (d) => d.deviceId === data.configuredDeviceId,
          );

          (window as any).electron.ipcRenderer.sendMessage(
            'camera-availability-result',
            {
              found,
              configuredDeviceId: data.configuredDeviceId,
              configuredLabel: data.configuredLabel,
              availableDevices: videoDevices.map((d) => d.label || d.deviceId),
            },
          );
        } catch {
          (window as any).electron.ipcRenderer.sendMessage(
            'camera-availability-result',
            {
              found: false,
              configuredDeviceId: data.configuredDeviceId,
              configuredLabel: data.configuredLabel,
              availableDevices: [],
            },
          );
        }
      },
    );

    const unsubscribeDeviceNotFound = (window as any).electron.ipcRenderer.on(
      'device-not-found',
      (data: { deviceType: 'camera' | 'printer'; deviceName: string }) => {
        navigate('/system-maintenance', {
          state: {
            maintenance: true,
            deviceNotFound: true,
            deviceType: data.deviceType,
            deviceName: data.deviceName,
          },
        });
      },
    );
    const unsubscribeDeviceFound = (window as any).electron.ipcRenderer.on(
      'device-found',
      () => {
        // Navigate to home only if we're in maintenance or out-of-paper pages
        // Don't interrupt normal user flow
        const currentPath = location.pathname;
        if (
          currentPath === '/system-maintenance' ||
          currentPath === '/out-of-paper'
        ) {
          navigate('/');
        }
      },
    );

    return () => {
      unsubscribe();
      unsubscribeNavigate();
      unsubscribePasswordModal();
      unsubscribeQuitPasswordModal();
      unsubscribeClearConfigPasswordModal();
      unsubscribeCameraConfigModal();
      unsubscribePrinterConfigModal();
      unsubscribeSse502();
      unsubscribeCameraCheck();
      unsubscribeDeviceNotFound();
      unsubscribeDeviceFound();
    };
  }, [navigate, location.pathname]);

  // ---------------- PASSWORD HANDLERS ----------------

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    navigate('/print-test');
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
  };

  const handleQuitPasswordSuccess = () => {
    setShowQuitPasswordModal(false);
    (window as any).electron.ipcRenderer.sendMessage('quit-app');
  };

  const handleQuitPasswordCancel = () => {
    setShowQuitPasswordModal(false);
  };

  const handleClearConfigPasswordSuccess = async () => {
    setShowClearConfigPasswordModal(false);

    try {
      const result = await window.electron?.payment?.deleteMachineConfig();

      if (result?.success) {
        showAlert('สำเร็จ', '✅ ล้างค่า Config สำเร็จ! แอปจะรีโหลด...', () =>
          window.location.reload(),
        );
      } else {
        showAlert(
          'เกิดข้อผิดพลาด',
          `❌ ไม่สามารถล้างค่า Config ได้: ${result?.error || 'Unknown error'}`,
        );
      }
    } catch (error) {
      console.error('❌ [App] Error clearing config:', error);
      showAlert('เกิดข้อผิดพลาด', '❌ เกิดข้อผิดพลาดในการล้างค่า Config');
    }
  };

  const handleClearConfigPasswordCancel = () => {
    setShowClearConfigPasswordModal(false);
  };

  const handleCameraConfigClose = () => {
    setShowCameraConfigModal(false);
  };

  const handleCameraConfigSuccess = () => {
    console.log('✅ [App] Camera config saved successfully');
  };

  const handlePrinterConfigClose = () => {
    setShowPrinterConfigModal(false);
  };

  const handlePrinterConfigSuccess = () => {
    console.log('✅ [App] Printer config saved successfully');
  };

  return (
    <>
      {/* PASSWORD MODALS */}
      <PasswordModal
        isOpen={showPasswordModal}
        onSuccess={handlePasswordSuccess}
        onCancel={handlePasswordCancel}
        title="กรอกรหัสผ่านเพื่อเข้าสู่หน้า Print Test"
      />

      <PasswordModal
        isOpen={showQuitPasswordModal}
        onSuccess={handleQuitPasswordSuccess}
        onCancel={handleQuitPasswordCancel}
        title="กรอกรหัสผ่านเพื่อปิดแอป"
        password="7053"
      />

      <PasswordModal
        isOpen={showClearConfigPasswordModal}
        onSuccess={handleClearConfigPasswordSuccess}
        onCancel={handleClearConfigPasswordCancel}
        title="กรอกรหัสผ่านเพื่อล้างค่า Config"
        password="7053"
      />

      {/* CONFIG MODALS */}
      <CameraConfigModal
        isOpen={showCameraConfigModal}
        onClose={handleCameraConfigClose}
        onSuccess={handleCameraConfigSuccess}
      />

      <PrinterConfigModal
        isOpen={showPrinterConfigModal}
        onClose={handlePrinterConfigClose}
        onSuccess={handlePrinterConfigSuccess}
      />

      {/* ✅ ALERT MODAL */}
      <AlertModal
        isOpen={alertState.open}
        title={alertState.title}
        message={alertState.message}
        onConfirm={() => {
          closeAlert();
          alertState.onConfirm?.();
        }}
      />
    </>
  );
}

function ConfigChecker() {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        // @ts-ignore
        const result = await window.electron?.payment?.hasMachineConfig();
        if (result?.success && !result.hasConfig) {
          // ยังไม่มี config ให้แสดง modal
          setShowConfigModal(true);
        }
      } catch (error) {
        console.error('❌ [App] Failed to check machine config:', error);
        // ถ้าเกิด error ให้แสดง modal เพื่อให้ user กรอก config
        setShowConfigModal(true);
      } finally {
        setIsChecking(false);
      }
    };

    checkConfig();
  }, []);

  const handleConfigSuccess = () => {
    setShowConfigModal(false);
    // Reload page เพื่อให้ config ใหม่ถูกใช้
    window.location.reload();
  };

  // ยังไม่ตรวจสอบเสร็จ ให้แสดง loading หรือไม่แสดงอะไร
  if (isChecking) {
    return null;
  }

  return (
    <MachineConfigModal
      isOpen={showConfigModal}
      onSuccess={handleConfigSuccess}
    />
  );
}

export default function App() {
  useBlockTouchContextMenu();
  // const { isConnected } = useSseStatus();
  // const { machineStatus } = useMachineStatus();

  // useEffect(() => {
  //   console.log('SSE & Machine Status:', {
  //     isConnected,
  //     machineStatus,
  //   });
  // }, [isConnected, machineStatus]);

  return (
    <Router>
      <RouteListener />
      <MaintenanceListener />
      <ConfigChecker />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/select-print" element={<SelectPrint />} />
          <Route path="/discount-coupon" element={<DiscountCoupon />} />
          <Route path="/frame-selection" element={<FrameSelection />} />
          <Route path="/payment" element={<PaymentQR />} />
          <Route path="/payment-qr" element={<PaymentQR />} />
          <Route path="/photo-prepare" element={<PhotoPrepare />} />
          <Route path="/main-shooting" element={<MainShooting />} />
          <Route path="/photo-confirmation" element={<PhotoConfirmation />} />
          <Route path="/photo-decorate" element={<PhotoDecorate />} />
          <Route path="/photo-filter" element={<PhotoFilter />} />
          <Route path="/photo-result" element={<PhotoResult />} />
          <Route path="/terms-and-services" element={<TermsAndServices />} />
          <Route path="/get-help" element={<GetHelp />} />
          <Route path="/system-maintenance" element={<SystemMaintenance />} />
          <Route path="/out-of-paper" element={<OutOfPaper />} />
          <Route path="/print-test" element={<PrintTest />} />
          <Route path="/request-image" element={<RequestImage />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}
