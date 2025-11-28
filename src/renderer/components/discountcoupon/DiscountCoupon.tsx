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
  const [code, setCode] = useState('0000');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    navigate('/select-print', { state });
  };

  const handleNumberClick = (number: string) => {
    setCode((prev) => {
      // Shift left and add new number, keep 4 digits
      const newCode = prev.slice(1) + number;
      return newCode;
    });
    // Clear error when user types
    if (error) {
      setError(null);
    }
  };

  const handleBackspace = () => {
    setCode((prev) => {
      // Shift right and add 0 at the beginning
      const newCode = '0' + prev.slice(0, -1);
      return newCode;
    });
    // Clear error when user types
    if (error) {
      setError(null);
    }
  };

  const handleConfirm = async () => {
    // Check if code is at least 4 digits
    if (code.length < 4) {
      return; // Don't proceed if code is not complete
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. ตรวจสอบ coupon code
      const checkResult = await window.electron.payment.checkMachineCoupon(code);
      
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

      if (paymentResult.success && paymentResult.qr_code) {
        // Navigate to payment page with QR code and discount info
        navigate('/payment-qr', {
          state: {
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
            couponCodeId: paymentResult.couponCodeId,
          },
        });
      } else {
        setError(paymentResult.error || 'ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่อีกครั้ง');
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
            {code.padStart(4, '0').slice(0, 4)}
          </div>
        </div>

        {/* Numeric Keypad */}
        <div className="keypad-container">
          <div className="keypad-row">
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('1')}
            >
              1
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('2')}
            >
              2
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('3')}
            >
              3
            </button>
          </div>
          <div className="keypad-row">
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('4')}
            >
              4
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('5')}
            >
              5
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('6')}
            >
              6
            </button>
          </div>
          <div className="keypad-row">
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('7')}
            >
              7
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('8')}
            >
              8
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('9')}
            >
              9
            </button>
          </div>
          <div className="keypad-row">
            <button
              type="button"
              className="keypad-button"
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
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('0')}
            >
              0
            </button>
            <button
              type="button"
              className="keypad-button"
              onClick={() => handleNumberClick('*')}
            >
              *
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
      <div className="confirm-section">
        <button
          type="button"
          className="confirm-button"
          onClick={handleConfirm}
          disabled={code.length < 4 || isLoading}
        >
          {isLoading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  );
}

