import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
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
} from './components';
import './App.css';

export default function App() {
  return (
    <Router>
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
    </Router>
  );
}
