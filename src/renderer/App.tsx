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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showQuitPasswordModal, setShowQuitPasswordModal] = useState(false);
  const [showClearConfigPasswordModal, setShowClearConfigPasswordModal] =
    useState(false);
  const [showCameraConfigModal, setShowCameraConfigModal] = useState(false);
  const [showPrinterConfigModal, setShowPrinterConfigModal] = useState(false);

  useEffect(() => {
    // Check status on mount
    const checkStatus = async () => {
      try {
        const res = await (window as any).electron.payment.getMachineData();
        if (res.success && res.machine) {
          if (res.machine.isMaintenanceMode) {
            navigate('/system-maintenance', { state: { maintenance: true } });
          } else if (res.machine.paperLevel === 0) {
            navigate('/out-of-paper', { state: { maintenance: true } });
          }
        }
      } catch (error) {
        console.error('Failed to check machine status:', error);
      }
    };
    checkStatus();

    // Listen for init event
    const unsubscribe = (window as any).electron.ipcRenderer.on(
      'machine-init',
      (arg: any) => {
        if (arg?.machine?.isMaintenanceMode) {
          navigate('/system-maintenance', { state: { maintenance: true } });
        } else if (arg?.machine?.paperLevel === 0) {
          navigate('/out-of-paper', { state: { maintenance: true } });
        }
      },
    );

    // Listen for navigate command from context menu
    const unsubscribeNavigate = (window as any).electron.ipcRenderer.on(
      'navigate-to',
      (path: string) => {
        if (path) {
          navigate(path);
        }
      },
    );

    // Listen for print test password modal request
    const unsubscribePasswordModal = (window as any).electron.ipcRenderer.on(
      'show-print-test-password-modal',
      () => {
        setShowPasswordModal(true);
      },
    );

    // Listen for quit app password modal request
    const unsubscribeQuitPasswordModal = (
      window as any
    ).electron.ipcRenderer.on('show-quit-app-password-modal', () => {
      setShowQuitPasswordModal(true);
    });

    // Listen for clear config password modal request
    const unsubscribeClearConfigPasswordModal = (
      window as any
    ).electron.ipcRenderer.on('show-clear-config-password-modal', () => {
      setShowClearConfigPasswordModal(true);
    });

    // Listen for camera config modal request
    const unsubscribeCameraConfigModal = (
      window as any
    ).electron.ipcRenderer.on('show-camera-config-modal', () => {
      setShowCameraConfigModal(true);
    });

    // Listen for printer config modal request
    const unsubscribePrinterConfigModal = (
      window as any
    ).electron.ipcRenderer.on('show-printer-config-modal', () => {
      setShowPrinterConfigModal(true);
    });

    // Listen for SSE status 502 (Bad Gateway) - navigate to SystemMaintenance
    const unsubscribeSse502 = (window as any).electron.ipcRenderer.on(
      'sse-status-502',
      () => {
        navigate('/system-maintenance', { state: { maintenance: true } });
      },
    );

    // Listen for camera availability check request from main process
    const unsubscribeCameraCheck = (window as any).electron.ipcRenderer.on(
      'check-camera-availability',
      async (data: { configuredDeviceId: string; configuredLabel: string }) => {
        try {
          console.log('📷 [Renderer] Checking camera availability:', data);

          // ดึงรายการกล้องที่เชื่อมต่ออยู่
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(
            (device) => device.kind === 'videoinput',
          );
          const availableDevices = videoDevices.map(
            (d) => d.label || d.deviceId,
          );

          console.log('📷 [Renderer] Available cameras:', availableDevices);

          // เช็คว่ากล้องที่ตั้งค่าไว้ยังมีอยู่หรือไม่
          const found = videoDevices.some(
            (d) => d.deviceId === data.configuredDeviceId,
          );

          // ส่งผลกลับไป main process
          (window as any).electron.ipcRenderer.sendMessage(
            'camera-availability-result',
            {
              found,
              configuredDeviceId: data.configuredDeviceId,
              configuredLabel: data.configuredLabel,
              availableDevices,
            },
          );
        } catch (error) {
          console.error(
            '❌ [Renderer] Error checking camera availability:',
            error,
          );
          // ส่งผลกลับไป main process (ไม่พบกล้อง)
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

    // Listen for device not found event from main process
    const unsubscribeDeviceNotFound = (window as any).electron.ipcRenderer.on(
      'device-not-found',
      (data: { deviceType: 'camera' | 'printer'; deviceName: string }) => {
        console.warn(
          `⚠️ [Renderer] Device not found: ${data.deviceType} - ${data.deviceName}`,
        );
        // Navigate to maintenance page
        navigate('/system-maintenance', {
          state: {
            maintenance: true,
            deviceType: data.deviceType,
            deviceName: data.deviceName,
          },
        });
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
    };
  }, [navigate]);

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    navigate('/print-test');
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
  };

  const handleQuitPasswordSuccess = () => {
    setShowQuitPasswordModal(false);
    // ส่ง IPC message ไปที่ main process เพื่อปิดแอป
    (window as any).electron.ipcRenderer.sendMessage('quit-app');
  };

  const handleQuitPasswordCancel = () => {
    setShowQuitPasswordModal(false);
  };

  const handleClearConfigPasswordSuccess = async () => {
    setShowClearConfigPasswordModal(false);
    try {
      // @ts-ignore
      const result = await window.electron?.payment?.deleteMachineConfig();
      if (result?.success) {
        alert('✅ ล้างค่า Config สำเร็จ! แอปจะรีโหลด...');
        // Reload page เพื่อให้แสดง config modal อีกครั้ง
        window.location.reload();
      } else {
        alert(
          '❌ ไม่สามารถล้างค่า Config ได้: ' +
            (result?.error || 'Unknown error'),
        );
      }
    } catch (error) {
      console.error('❌ [App] Error clearing config:', error);
      alert('❌ เกิดข้อผิดพลาดในการล้างค่า Config');
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
