import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import {
  Home,
  SelectPrint,
  PaymentQR,
  PhotoPrepare,
  MainShooting,
} from './components';
import './App.css';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/select-print" element={<SelectPrint />} />
        <Route path="/payment" element={<PaymentQR />} />
        <Route path="/payment-qr" element={<PaymentQR />} />
        <Route path="/photo-prepare" element={<PhotoPrepare />} />
        <Route path="/main-shooting" element={<MainShooting />} />
      </Routes>
    </Router>
  );
}
