/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BackButton } from '..';
import paymentService from '../../services/paymentService';
import checkCircleIcon from '../../../../assets/icons/svg/check-circle.svg';
import './PaymentQR.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  discountCode?: string;
  originalPrice?: number;
  qrcode?: string;
  referenceId?: string;
  transactionId?: string;
  paymentDetailsId?: string;
}

// Function to calculate discount based on code
const calculateDiscount = (code: string, originalPrice: number): number => {
  // Mock discount: 20 THB for any valid 4-digit code
  if (code && code.length >= 4) {
    return 20; // 20 THB discount
  }
  return 0;
};

export default function PaymentQR() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  // Calculate discount and final price
  const originalPrice = state.originalPrice || state.totalPrice;
  const discountAmount = state.discountCode
    ? calculateDiscount(state.discountCode, originalPrice)
    : 0;
  const finalPrice = originalPrice - discountAmount;

  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [qrCode, setQrCode] = useState<string>(state?.qrcode || '');
  const [referenceId, setReferenceId] = useState<string>(state?.referenceId || '');
  const [isLoading, setIsLoading] = useState(!state?.qrcode);
  const [error, setError] = useState<string>('');
  const [successCountdown, setSuccessCountdown] = useState<number | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    | 'pending'
    | 'SUCCESS'
    | 'FAIL'
    | 'CLOSED'
    | 'NOTPAY'
    | 'PAYERROR'
    | 'PENDING'
    | 'NOTSURE'
    | 'USERPAYING'
    | 'REFUND'
  >('pending');

  // If no state passed, redirect back
  useEffect(() => {
    if (!state) {
      navigate('/');
    }
  }, [state, navigate]);

  const createPayment = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      // ใช้ API ใหม่จาก machine service
      const result = await window.electron.payment.createMachinePayment(
        finalPrice,
        state.quantity,
        'promptpay',
      );

      if (result.success && result.qr_code) {
        setQrCode(result.qr_code);
        setReferenceId(result.reference_id || '');
        setPaymentStatus('pending');
      } else {
        setError(result.error || 'Failed to create payment');
      }
    } catch (err) {
      setError('Failed to create payment');
      // eslint-disable-next-line no-console
      console.error('Payment creation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [finalPrice, state.quantity]);

  // Create payment when component mounts (ถ้ายังไม่มี qrcode)
  useEffect(() => {
    if (state && !state.qrcode) {
      createPayment();
    }
  }, [state, createPayment]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      // Time's up, redirect back to home
      navigate('/');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, navigate]);

  // Check payment status periodically using Machine API
  useEffect(() => {
    if (!referenceId) return;

    const statusChecker = setInterval(async () => {
      try {
        const result = await window.electron.payment.checkMachinePaymentStatus(referenceId);
        
        if (result.success && result.status) {
          setPaymentStatus(result.status as any);
          
          // เช็คว่า payment สำเร็จหรือไม่
          if (result.status === 'SUCCESS' || result.transactionStatus === 'success') {
            // Payment successful, start countdown
            setSuccessCountdown(3);
          } else if (
            ['FAIL', 'PAYERROR', 'CLOSED', 'failed'].includes(result.status as string) ||
            result.transactionStatus === 'failed'
          ) {
            setError('Payment failed. Please try again.');
          }
        } else if (result.error) {
          console.error('Payment status check error:', result.error);
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(statusChecker);
  }, [referenceId]);

  // Success countdown timer
  useEffect(() => {
    if (successCountdown === null) return;

    if (successCountdown <= 0) {
      // Navigate to frame selection after countdown
      navigate('/frame-selection', {
        state: {
          quantity: state.quantity,
          totalPrice: finalPrice,
        },
      });
      return;
    }

    const timer = setInterval(() => {
      setSuccessCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [successCountdown, navigate, state.quantity, finalPrice]);

  const handlePriceClick = () => {
    if (paymentStatus === 'SUCCESS') {
      navigate('/frame-selection', {
        state: {
          quantity: state.quantity,
          totalPrice: finalPrice,
        },
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerLabel = () => {
    if (successCountdown !== null) {
      return `ชำระเงินสำเร็จ (${successCountdown})`;
    }

    switch (paymentStatus) {
      case 'pending':
        return 'Waiting for payment...';
      case 'SUCCESS':
        return 'ชำระเงินสำเร็จ';
      case 'PENDING':
      case 'USERPAYING':
        return 'Processing payment...';
      case 'FAIL':
      case 'PAYERROR':
        return 'Payment failed';
      case 'CLOSED':
        return 'Payment session closed';
      case 'NOTPAY':
        return 'Payment not completed';
      case 'NOTSURE':
        return 'Payment status unknown';
      case 'REFUND':
        return 'Payment refunded';
      default:
        return 'Payment status unknown';
    }
  };

  if (!state) {
    return null; // Will redirect
  }

  return (
    <div className="payment-qr-container">
      {/* Back Button */}
      <BackButton backButtonPath="/select-print" />

      {/* Main Content */}
      <div className="main-content">
        <div className="title-section">
          <h1 className="title">สแกนจ่ายได้เลย!</h1>
          <p className="title-english">SCAN TO PAY!</p>
        </div>

        {/* QR Code */}
        <div className="qr-code-container">
          {isLoading && (
            <div className="loading-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
          )}
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={createPayment} type="button">
                Retry
              </button>
            </div>
          )}
          {!isLoading && !error && qrCode && (
            <>
              {paymentStatus === 'SUCCESS' || successCountdown !== null ? (
                <div className="payment-success-container">
                  <img
                    src={checkCircleIcon}
                    alt="Payment Success"
                    className="check-circle-icon"
                  />
                  {/* <div className="success-text">ชำระเงินสำเร็จ</div> */}
                  {/* {successCountdown !== null && (
                    <div className="countdown-text">{successCountdown}</div>
                  )} */}
                </div>
              ) : (
                <div className="qr-code-wrapper">
                  <img
                    src={qrCode}
                    alt="Payment QR Code"
                    className="qr-code-image"
                    style={{ width: '240px', height: '240px' }}
                  />
                </div>
              )}
            </>
          )}
          {!isLoading && !error && !qrCode && (
            <div className="qr-code-placeholder">
              <div className="qr-pattern">
                <div className="qr-square corner-square top-left" />
                <div className="qr-square corner-square top-right" />
                <div className="qr-square corner-square bottom-left" />
                <div className="qr-dots">
                  {Array.from({ length: 64 }, (_, i) => (
                    <div
                      key={i}
                      className={`qr-dot ${Math.random() > 0.5 ? 'filled' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Price Display */}
        <div className="price-section">
          {discountAmount > 0 && (
            <div className="discount-display">
              <span className="discount-label">Discount</span>
              <span className="discount-amount">{discountAmount} THB</span>
            </div>
          )}
          <div
            className={`price-container ${paymentStatus === 'SUCCESS' ? 'paid' : ''}`}
            onClick={handlePriceClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handlePriceClick();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className="price">{finalPrice}</span>
            <span className="currency">THB</span>
          </div>
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className="timer-circle">
            <span className="timer-text">{formatTime(timeLeft)}</span>
          </div>
          {/* <p className="timer-label">{getTimerLabel()}</p> */}
          <p className="title-thai timer-label"> กรุณาชำระเงินภายในเวลาที่กำหนด</p>
          <p className="title-english timer-label">
            Please complete your payment within the time limit.
          </p>
        </div>
      </div>
    </div>
  );
}
