import {
  MemoryRouter as Router,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useEffect } from 'react';
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

  useEffect(() => {
    // Check status on mount
    const checkStatus = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window as any).electron.payment.getMachineData();
        if (res.success && res.machine?.isMaintenanceMode) {
          navigate('/get-help', { state: { maintenance: true } });
        }
      } catch (error) {
        console.error('Failed to check machine status:', error);
      }
    };
    checkStatus();

    // Listen for init event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = (window as any).electron.ipcRenderer.on(
      'machine-init',
      (arg: any) => {
        if (arg?.machine?.isMaintenanceMode) {
          navigate('/get-help', { state: { maintenance: true } });
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [navigate]);

  return null;
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
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}
