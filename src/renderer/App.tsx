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
  PasswordModal,
} from './components';
import './App.css';

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
    const unsubscribeQuitPasswordModal = (window as any).electron.ipcRenderer.on(
      'show-quit-app-password-modal',
      () => {
        setShowQuitPasswordModal(true);
      },
    );

    // Listen for SSE status 502 (Bad Gateway) - navigate to SystemMaintenance
    const unsubscribeSse502 = (window as any).electron.ipcRenderer.on(
      'sse-status-502',
      () => {
        navigate('/system-maintenance', { state: { maintenance: true } });
      },
    );

    return () => {
      unsubscribe();
      unsubscribeNavigate();
      unsubscribePasswordModal();
      unsubscribeQuitPasswordModal();
      unsubscribeSse502();
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
        password="1212312121"
      />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <RouteListener />
      <MaintenanceListener />
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
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}
