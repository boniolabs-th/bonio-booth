/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BackButton } from '..';
import './DiscountCoupon.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
}

export default function DiscountCoupon() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    navigate('/select-print', { state });
  };

  const handleKeyClick = (key: string) => {
    setCode((prev) => {
      // เพิ่มตัวอักษรใหม่ (จำกัดความยาวตามต้องการ)
      const maxLength = 20; // กำหนดความยาวสูงสุด
      if (prev.length >= maxLength) {
        return prev; // ไม่เพิ่มถ้าเกินความยาว
      }
      return prev + key;
    });
    // Clear error when user types
    if (error) {
      setError(null);
    }
  };

  const handleBackspace = () => {
    setCode((prev) => {
      // ลบตัวอักษรตัวสุดท้าย
      return prev.slice(0, -1);
    });
    // Clear error when user types
    if (error) {
      setError(null);
    }
  };

  const handleConfirm = async () => {
    // Check if code is not empty
    if (code.length === 0) {
      return; // Don't proceed if code is empty
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. ตรวจสอบ coupon code
      const checkResult =
        await window.electron.payment.checkMachineCoupon(code);

      if (!checkResult.valid) {
        setError(checkResult.message || 'โค้ดส่วนลดไม่ถูกต้อง');
        setIsLoading(false);
        return;
      }

      // 2. ถ้า coupon ถูกต้อง ให้สร้าง payment พร้อม couponCodeId
      const originalPrice = state.totalPrice;
      const paymentResult = await window.electron.payment.createMachinePayment(
        originalPrice,
        state.quantity,
        'promptpay',
        checkResult.couponCodeId,
      );

      console.log('💳 [DiscountCoupon] Payment response:', {
        success: paymentResult.success,
        qr_code: paymentResult.qr_code ? 'present' : 'missing',
        reference_id: paymentResult.reference_id,
        order_id: paymentResult.order_id,
        transactionId: paymentResult.transactionId,
        paymentDetailsId: paymentResult.paymentDetailsId,
        fullResponse: paymentResult,
      });

      if (paymentResult.success && paymentResult.qr_code) {
        // Navigate to payment page with QR code and discount info
        const navigationState = {
          quantity: state.quantity,
          totalPrice: paymentResult.netAmount || originalPrice,
          originalPrice,
          discountCode: code,
          discountAmount: paymentResult.discountAmount || 0,
          netAmount: paymentResult.netAmount || originalPrice,
          qrcode: paymentResult.qr_code,
          referenceId: paymentResult.reference_id,
          transactionId: paymentResult.transactionId,
          paymentDetailsId: paymentResult.paymentDetailsId,
          orderId: paymentResult.order_id,
          couponCodeId: paymentResult.couponCodeId,
        };
        
        console.log('💳 [DiscountCoupon] Navigating with state:', navigationState);
        
        navigate('/payment-qr', {
          state: navigationState,
        });
      } else {
        setError(
          paymentResult.error ||
            'ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่อีกครั้ง',
        );
      }
    } catch (err) {
      console.error('Error in coupon flow:', err);
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="discount-coupon-container">
      <BackButton onBackClick={handleBack} />

      <div className="discount-content">
        {/* Title Section */}
        <div className="title-section">
          <h1 className="title-thai">ใช้คูปองส่วนลด</h1>
          <p className="title-english">USE DISCOUNT COUPON</p>
        </div>

        {/* Code Input Display */}
        <div className="code-input-container">
          <div className="code-display">
            {code || (
              <span style={{ color: '#999', fontWeight: 400 }}>
                Enter coupon code
              </span>
            )}
          </div>
        </div>

        {/* QWERTY Keyboard */}
        <div className="keypad-container">
          {/* Row 1: Numbers */}
          <div className="keypad-row">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((key) => (
              <button
                key={key}
                type="button"
                className="keypad-button"
                onClick={() => handleKeyClick(key)}
              >
                {key}
              </button>
            ))}
          </div>
          {/* Row 2: Q W E R T Y U I O P */}
          <div className="keypad-row">
            {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((key) => (
              <button
                key={key}
                type="button"
                className="keypad-button"
                onClick={() => handleKeyClick(key.toLowerCase())}
              >
                {key}
              </button>
            ))}
          </div>
          {/* Row 3: A S D F G H J K L */}
          <div className="keypad-row">
            {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((key) => (
              <button
                key={key}
                type="button"
                className="keypad-button"
                onClick={() => handleKeyClick(key.toLowerCase())}
              >
                {key}
              </button>
            ))}
          </div>
          {/* Row 4: Z X C V B N M */}
          <div className="keypad-row">
            {['', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ''].map((key,index) => (
              <button
                key={index}
                type="button"
                className="keypad-button"
                style={{ visibility: key !== '' ? 'visible' : 'hidden' }}
                onClick={() => handleKeyClick(key.toLowerCase())}
              >
                {key}
              </button>
            ))}
          </div>
          {/* Row 5: Backspace and Space */}
          <div className="keypad-row">
            <button
              type="button"
              className="keypad-button keypad-button-wide"
              onClick={handleBackspace}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            {/* <button
              type="button"
              className="keypad-button keypad-button-wide"
              onClick={() => handleKeyClick(' ')}
            >
              Space
            </button> */}
            <button
              type="button"
              className="keypad-button keypad-button-wide"
              onClick={handleConfirm}
              disabled={code.length === 0 || isLoading}
            >
              {isLoading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
            </button>
          </div>
        </div>
      </div>

      {/* Error Modal */}
      {error && (
        <div className="error-modal-overlay" onClick={() => setError(null)}>
          <div className="error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="error-modal-content">
              <h2 className="error-title">เกิดข้อผิดพลาด</h2>
              <p className="error-message">{error}</p>
              <button
                type="button"
                className="error-close-button"
                onClick={() => setError(null)}
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Button */}
      {/* <div className="confirm-section">
        <button
          type="button"
          className="confirm-button"
          onClick={handleConfirm}
          disabled={code.length === 0 || isLoading}
        >
          {isLoading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
        </button>
      </div> */}
    </div>
  );
}
