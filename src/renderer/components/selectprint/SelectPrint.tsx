/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BackButton } from '..';
import './SelectPrint.css';
import couponIcon from '../../../../assets/icons/svg/coupon.svg';
import qrIcon from '../../../../assets/icons/svg/qrcode.svg';

interface LocationState {
  quantity?: number;
  totalPrice?: number;
  discountCode?: string;
}

export default function SelectPrint() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  
  const [quantity, setQuantity] = useState(state?.quantity || 1);
  const [price] = useState(125); // Base price per print
  const [discountCode] = useState(state?.discountCode || undefined);

  const [amount, setAmount] = useState(price * quantity);

  const handleDecrease = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleIncrease = () => {
    setQuantity(quantity + 1);
  };

  const handleDiscountCoupon = () => {
    navigate('/discount-coupon', {
      state: {
        quantity,
        totalPrice: price * quantity,
      },
    });
  };

  const handleConfirm = async () => {
    try {
      // คำนวณ amount ที่ลบส่วนลดแล้ว
      const originalPrice = price * quantity;
      // TODO: ควรดึง discount amount จาก coupon check ที่ทำไว้แล้ว
      // ตอนนี้ใช้ mock discount 20 THB
      const discountAmount = discountCode ? 20 : 0;
      const finalAmount = originalPrice - discountAmount;

      // เรียก API สร้าง payment
      const result = await window.electron.payment.createMachinePayment(
        finalAmount,
        quantity,
        'promptpay',
      );

      if (result.success && result.qr_code) {
        // Navigate to payment page with QR code
        navigate('/payment-qr', {
          state: {
            quantity,
            totalPrice: finalAmount,
            originalPrice,
            discountCode: discountCode || undefined,
            qrcode: result.qr_code,
            referenceId: result.reference_id,
            transactionId: result.transactionId,
            paymentDetailsId: result.paymentDetailsId,
          },
        });
      } else {
        console.error('Failed to create payment:', result.error);
        alert('ไม่สามารถสร้าง QR Code ได้ กรุณาลองใหม่อีกครั้ง');
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="select-print-container">
      {/* Back Button */}
      <BackButton backButtonPath="/" />

      {/* Main Content */}
      <div className="main-content">
        {/* Title Section */}
        <div className="title-section">
          <h1 className="title-thai">เลือกจำนวนการพิมพ์</h1>
          <p className="title-english">SELECT NUMBER OF PRINT</p>
        </div>

        {/* Quantity Selector */}
        <div className="quantity-selector">
          <button
            className="quantity-button decrease"
            onClick={handleDecrease}
            disabled={quantity <= 1}
            type="button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12H19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <div className="quantity-display">{quantity}</div>

          <button
            type="button"
            className="quantity-button increase"
            onClick={handleIncrease}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5V19M5 12H19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Price Display */}
        <div className="price-container">
          <h1 className="price-title">
            <span className="price">{price * quantity}</span>
            <span className="currency">THB</span>
          </h1>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="button"
            className="discount-button"
            onClick={handleDiscountCoupon}
          >
            <div className="button-icon">
              <img src={couponIcon} alt="Coupon Icon" className="coupon-icon" />
            </div>
            <span className="button-text-thai">ใช้</span>
            <span className="button-text-english">Discount Coupon</span>
          </button>
          <button type="button" className="qr-button" onClick={handleConfirm}>
            <div className="button-icon">
              <img src={qrIcon} alt="QR Code Icon" className="qr-code-icon" />
            </div>
            <span className="button-text-thai">ชำระเงินผ่าน</span>
            <span className="button-text-english">QR Payment</span>
          </button>
        </div>
      </div>
    </div>
  );
}
