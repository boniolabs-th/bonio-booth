/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '..';
import paymentService from '../../services/paymentService';
import './PaymentQR.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
}

export default function PaymentQR() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes in seconds
  const [qrCode, setQrCode] = useState<string>('');
  const [referenceId, setReferenceId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
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
      const orderNo = paymentService.generateOrderNo();
      const result = await paymentService.createPayment(
        state.totalPrice,
        orderNo,
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
  }, [state.totalPrice]);

  // Create payment when component mounts
  useEffect(() => {
    if (state) {
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

  // Check payment status periodically
  useEffect(() => {
    if (!referenceId) return;

    const statusChecker = setInterval(async () => {
      const status = await paymentService.checkPaymentStatus(referenceId);
      if (status.success && status.status) {
        setPaymentStatus(status.status as any); // Cast to any to handle all KSher statuses
        
        if (status.status === 'NOTPAY') {
          // Payment successful, start countdown
          setSuccessCountdown(3);
        } else if (
          ['FAIL', 'PAYERROR', 'CLOSED'].includes(status.status as string)
        ) {
          setError('Payment failed. Please try again.');
        } else if (status.status === 'REFUND') {
          setError('Payment was refunded. Please try again.');
        }
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(statusChecker);
  }, [referenceId, paymentStatus, navigate, state]);

  // Success countdown timer
  useEffect(() => {
    if (successCountdown === null) return;

    if (successCountdown <= 0) {
      // Navigate to photo prepare after countdown
      navigate('/photo-prepare', {
        state: {
          quantity: state.quantity,
          totalPrice: state.totalPrice,
        },
      });
      return;
    }

    const timer = setInterval(() => {
      setSuccessCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [successCountdown, navigate, state]);

  const handlePriceClick = () => {
    if (paymentStatus === 'SUCCESS') {
      navigate('/photo-prepare', {
        state: {
          quantity: state.quantity,
          totalPrice: state.totalPrice,
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
      {/* Header */}
      <Header showBackButton backButtonPath="/select-print" />

      {/* Main Content */}
      <div className="main-content">
        <h1 className="title">Pay through QR Payment</h1>

        {/* QR Code */}
        <div className="qr-code-container">
          {isLoading && <div className="loading-spinner">Loading...</div>}
          {error && (
            <div className="error-message">
              <p>{error}</p>
              <button onClick={createPayment} type="button">
                Retry
              </button>
            </div>
          )}
          {!isLoading && !error && qrCode && (
            <div className="qr-code-wrapper">
              <img
                src={qrCode}
                alt="Payment QR Code"
                className="qr-code-image"
                style={{ width: '240px', height: '240px' }}
              />
              {(paymentStatus === 'SUCCESS' || successCountdown !== null) && (
                <div className="payment-success-overlay">
                  <div className="success-icon">
                    <span className="checkmark">✓</span>
                  </div>
                  <div className="success-text">ชำระเงินสำเร็จ</div>
                  {successCountdown !== null && (
                    <div className="countdown-text">{successCountdown}</div>
                  )}
                </div>
              )}
            </div>
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
          <span className="price">{state.totalPrice}</span>
          <span className="currency">THB</span>
          {(paymentStatus === 'SUCCESS' || successCountdown !== null) && (
            <span className="paid-indicator">✓ ชำระแล้ว</span>
          )}
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className="timer-circle">
            <span className="timer-text">{formatTime(timeLeft)}</span>
          </div>
          <p className="timer-label">{getTimerLabel()}</p>
        </div>
      </div>
    </div>
  );
}
