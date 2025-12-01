/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState, useEffect } from 'react';
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

interface Price {
  quantity: number;
  price: number;
}

const DEFAULT_PRICE_PER_PIECE = 125;

export default function SelectPrint() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  
  const [prices, setPrices] = useState<Price[]>([]);
  const [quantity, setQuantity] = useState(state?.quantity || 1);
  const [discountCode] = useState(state?.discountCode || undefined);

  // รับ prices จาก main process
  useEffect(() => {
    // ฟังก์ชันสำหรับ set prices
    const setPricesData = (pricesData: Price[]) => {
      if (Array.isArray(pricesData) && pricesData.length > 0) {
        setPrices(pricesData);
        console.log('💰 Prices loaded:', pricesData);
      }
    };

    // 1. รับจาก event (ถ้า event ถูกส่งมา)
    const handleMachineInit = (...args: unknown[]) => {
      const data = args[0] as { prices?: Price[] };
      if (data?.prices) {
        setPricesData(data.prices);
      }
    };

    const removeListener = window.electron?.ipcRenderer.on('machine-init', handleMachineInit);

    // 2. Request ข้อมูลทันที (fallback ถ้า event ยังไม่มา)
    const requestPrices = async () => {
      try {
        const result = await window.electron?.payment.getMachinePrices();
        if (result?.success && result?.prices) {
          setPricesData(result.prices as Price[]);
        }
      } catch (error) {
        console.error('Failed to get prices:', error);
      }
    };

    // Request ทันทีและ retry หลังจาก 1 วินาที (ถ้ายังไม่มี)
    requestPrices();
    const retryTimer = setTimeout(() => {
      if (prices.length === 0) {
        console.log('🔄 Retrying to get prices...');
        requestPrices();
      }
    }, 1000);

    return () => {
      if (removeListener) {
        removeListener();
      }
      clearTimeout(retryTimer);
    };
  }, [prices.length]);

  // คำนวณราคาตาม quantity
  const getPriceForQuantity = (qty: number): number => {
    if (prices.length === 0) {
      // Fallback: ใช้ราคา 125 บาทต่อชิ้น
      return DEFAULT_PRICE_PER_PIECE * qty;
    }
    
    // หาราคาที่ตรงกับ quantity
    const priceEntry = prices.find((p) => p.quantity === qty);
    if (priceEntry) {
      return priceEntry.price;
    }
    
    // ถ้าไม่เจอ ให้ใช้ราคาสูงสุดที่น้อยกว่า quantity
    const sortedPrices = [...prices].sort((a, b) => a.quantity - b.quantity);
    const closestPrice = sortedPrices
      .filter((p) => p.quantity <= qty)
      .pop();
    
    if (closestPrice) {
      return closestPrice.price;
    }
    
    // ถ้ายังไม่เจอ ให้ใช้ราคาต่ำสุด * quantity
    const minPrice = sortedPrices[0];
    return minPrice ? (minPrice.price / minPrice.quantity) * qty : DEFAULT_PRICE_PER_PIECE * qty;
  };

  // หา maximum quantity จาก prices
  const maxQuantity = prices.length > 0 
    ? Math.max(...prices.map((p) => p.quantity))
    : 10; // Default max ถ้าไม่มี prices

  const currentPrice = getPriceForQuantity(quantity);

  const handleDecrease = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleIncrease = () => {
    if (quantity < maxQuantity) {
      setQuantity(quantity + 1);
    }
  };

  const handleDiscountCoupon = () => {
    navigate('/discount-coupon', {
      state: {
        quantity,
        totalPrice: currentPrice,
      },
    });
  };

  const handleConfirm = async () => {
    try {
      // คำนวณ amount ที่ลบส่วนลดแล้ว
      const originalPrice = currentPrice;
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

      console.log('💳 [SelectPrint] Payment response:', {
        success: result.success,
        qr_code: result.qr_code ? 'present' : 'missing',
        reference_id: result.reference_id,
        order_id: result.order_id,
        transactionId: result.transactionId,
        paymentDetailsId: result.paymentDetailsId,
        fullResponse: result,
      });

      if (result.success && result.qr_code) {
        // Navigate to payment page with QR code
        const navigationState = {
          quantity,
          totalPrice: finalAmount,
          originalPrice,
          discountCode: discountCode || undefined,
          qrcode: result.qr_code,
          referenceId: result.reference_id,
          transactionId: result.transactionId,
          paymentDetailsId: result.paymentDetailsId,
          orderId: result.order_id,
        };
        
        console.log('💳 [SelectPrint] Navigating with state:', navigationState);
        
        navigate('/payment-qr', {
          state: navigationState,
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
            aria-label="Decrease quantity"
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
            disabled={quantity >= maxQuantity}
            aria-label="Increase quantity"
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
            <span className="price">{currentPrice}</span>
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
