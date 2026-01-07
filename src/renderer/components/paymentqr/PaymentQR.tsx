/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ConfirmationModal from '../confirmationmodal';
// import paymentService from '../../services/paymentService';
import checkCircleIcon from '../../../../assets/icons/svg/check-circle.svg';
import './PaymentQR.css';
import { COUNTDOWN } from '../../utils/appConfig';

interface LocationState {
  quantity: number;
  totalPrice: number;
  discountCode?: string;
  originalPrice?: number;
  qrcode?: string;
  referenceId?: string;
  transactionId?: string;
  paymentDetailsId?: string;
  orderId?: string;
  discountAmount?: number;
  netAmount?: number;
  couponCodeId?: string;
  isFree?: boolean; // Flag สำหรับ free transaction (netAmount = 0)
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
  // ใช้ discountAmount และ netAmount จาก state (ที่ได้จาก API) ถ้ามี
  // ถ้าไม่มีให้คำนวณเอง
  const originalPrice = state.originalPrice || state.totalPrice;
  const discountAmount =
    state.discountAmount !== undefined
      ? state.discountAmount
      : state.discountCode
        ? calculateDiscount(state.discountCode, originalPrice)
        : 0;
  const finalPrice =
    state.netAmount !== undefined
      ? state.netAmount
      : originalPrice - discountAmount;

  const [timeLeft, setTimeLeft] = useState(COUNTDOWN.PAYMENT_QR.DURATION); // 5 minutes in seconds
  const [isTimeout, setIsTimeout] = useState(false); // Track ว่า timeout แล้วหรือยัง
  const [qrCode, setQrCode] = useState<string>(state?.qrcode || '');
  const [referenceId, setReferenceId] = useState<string>(
    state?.referenceId || '',
  );
  const [isLoading, setIsLoading] = useState(!state?.qrcode);
  const [error, setError] = useState<string>('');

  // Log state when component mounts
  useEffect(() => {
    console.log('💳 [PaymentQR] Component mounted with state:', {
      hasState: !!state,
      orderId: state?.orderId,
      referenceId: state?.referenceId,
      transactionId: state?.transactionId,
      paymentDetailsId: state?.paymentDetailsId,
      qrcode: state?.qrcode ? 'present' : null,
    });
  }, []);
  const [successCountdown, setSuccessCountdown] = useState<number | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

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
        console.log('💳 [PaymentQR] Payment created successfully:', {
          reference_id: result.reference_id,
          order_id: result.order_id,
          transactionId: result.transactionId,
          paymentDetailsId: result.paymentDetailsId,
        });
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

  // Create payment when component mounts (ถ้ายังไม่มี qrcode และไม่ใช่ free transaction)
  useEffect(() => {
    if (state && !state.qrcode && !state.isFree) {
      createPayment();
    }
  }, [state, createPayment]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      // Time's up, blur QR code และ redirect back to home หลังจาก delay
      setIsTimeout(true);
      // Delay การ navigate เพื่อให้เห็น blur effect
      const redirectTimer = setTimeout(() => {
        navigate('/');
      }, 30000); // Delay 30 seconds

      return () => clearTimeout(redirectTimer);
    }

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, navigate]);

  // Check payment status periodically using Machine API
  // สำหรับ free transaction (isFree = true) ให้เช็ค status ทันที
  useEffect(() => {
    if (!referenceId) return;

    // ถ้าเป็น free transaction ให้เช็ค status ทันที (ไม่ต้องรอ polling)
    const checkStatus = async () => {
      try {
        const result =
          await window.electron.payment.checkMachinePaymentStatus(referenceId);

        if (result.success && result.status) {
          setPaymentStatus(result.status as any);

          // เช็คว่า payment สำเร็จหรือไม่
          if (
            result.status === 'SUCCESS' ||
            result.transactionStatus === 'success'
          ) {
            // Payment successful, start countdown
            setSuccessCountdown(3);
            return true; // Status is SUCCESS, stop polling
          } else if (
            ['FAIL', 'PAYERROR', 'CLOSED', 'failed'].includes(
              result.status as string,
            ) ||
            result.transactionStatus === 'failed'
          ) {
            setError('Payment failed. Please try again.');
            return true; // Status is FAIL, stop polling
          }
        } else if (result.error) {
          console.error('Payment status check error:', result.error);
        }
        return false; // Continue polling
      } catch (error) {
        console.error('Error checking payment status:', error);
        return false; // Continue polling
      }
    };

    // ถ้าเป็น free transaction ให้เช็ค status ทันที
    if (state?.isFree) {
      // eslint-disable-next-line no-console
      console.log(
        '💳 [PaymentQR] Free transaction detected, checking status immediately...',
      );
      let freeStatusChecker: ReturnType<typeof setInterval> | null = null;

      checkStatus()
        .then((shouldStop) => {
          if (!shouldStop) {
            // ถ้ายังไม่สำเร็จ ให้ polling ต่อไป
            freeStatusChecker = setInterval(async () => {
              const stop = await checkStatus();
              if (stop && freeStatusChecker) {
                clearInterval(freeStatusChecker);
                freeStatusChecker = null;
              }
            }, 3000);
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Error checking free transaction status:', err);
        });

      return () => {
        if (freeStatusChecker) {
          clearInterval(freeStatusChecker);
        }
      };
    }

    // สำหรับ paid transaction ให้ polling ทุก 3 วินาที
    const statusChecker = setInterval(async () => {
      const stop = await checkStatus();
      if (stop) {
        clearInterval(statusChecker);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(statusChecker);
  }, [referenceId, state?.isFree]);

  // Success countdown timer
  useEffect(() => {
    if (successCountdown === null) return;

    if (successCountdown <= 0) {
      // Navigate to frame selection after countdown
      navigate('/frame-selection', {
        state: {
          quantity: state.quantity,
          totalPrice: finalPrice,
          transactionId: state.transactionId,
          referenceId: referenceId,
          paymentDetailsId: state.paymentDetailsId,
          orderId: state.orderId,
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
          transactionId: state.transactionId,
          referenceId: referenceId,
          paymentDetailsId: state.paymentDetailsId,
          orderId: state.orderId,
        },
      });
    }
  };

  const handleCancelClick = () => {
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    setIsCancelModalOpen(false);
    navigate('/select-print');
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
      {/* <BackButton backButtonPath="/select-print" /> */}

      {/* Main Content */}
      <div className="main-content">
        <div className="title-section">
          <h1 className="qr-title">สแกนจ่ายได้เลย!</h1>
          <p className="title-english">SCAN TO PAY!</p>
        </div>

        {/* QR Code หรือ Free Transaction Message */}
        <div className="qr-code-container">
          {isLoading && !state?.isFree && (
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
          {/* Free Transaction Message */}
          {state?.isFree && (
            <div className="free-transaction-message">
              <div className="free-transaction-icon">
                <img
                  src={checkCircleIcon}
                  alt="Free Transaction"
                  className="check-circle-icon"
                />
              </div>
              <p className="free-transaction-text">
                {paymentStatus === 'SUCCESS' || successCountdown !== null
                  ? 'ใช้งานคูปองสำเร็จ'
                  : 'กำลังตรวจสอบคูปอง...'}
              </p>
            </div>
          )}
          {/* QR Code สำหรับ Paid Transaction */}
          {!state?.isFree && !isLoading && !error && qrCode && (
            <>
              {paymentStatus === 'SUCCESS' || successCountdown !== null ? (
                <div className="payment-success-container">
                  <img
                    src={checkCircleIcon}
                    alt="Payment Success"
                    className="check-circle-icon"
                  />
                </div>
              ) : (
                <div
                  className="qr-code-wrapper"
                  style={{
                    filter: isTimeout ? 'blur(8px)' : 'none',
                    transition: 'filter 0.5s ease-in-out',
                    pointerEvents: isTimeout ? 'none' : 'auto',
                  }}
                >
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
          {!state?.isFree && !isLoading && !error && !qrCode && (
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
              <span className="discount-label">Discount:</span>
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
            <span className="price-title">{finalPrice}</span>
            <span className="currency">THB</span>
          </div>
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className="timer-circle">
            {!isTimeout && (
              <span className="timer-text">{formatTime(timeLeft)}</span>
            )}
            {isTimeout && <span className="timer-text">Timeout</span>}
          </div>
          {/* <p className="timer-label">{getTimerLabel()}</p> */}
          <p className="title-thai timer-label">
            {' '}
            กรุณาชำระเงินภายในเวลาที่กำหนด
          </p>
          <p className="title-english timer-label">
            Please complete your payment within the time limit.
          </p>
        </div>

        {/* Cancel Button */}
        {paymentStatus !== 'SUCCESS' && successCountdown === null && (
          <button
            type="button"
            className="cancel-payment-button"
            onClick={handleCancelClick}
          >
            Cancel Payment
          </button>
        )}
      </div>

      <ConfirmationModal
        isOpen={isCancelModalOpen}
        message={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <p style={{ margin: 0 }}>ต้องการยกเลิกการชำระเงิน?</p>
            <p style={{ margin: 0, fontSize: '1rem' }}>
              Are you sure you want to cancel the payment?
            </p>
          </div>
        }
        onConfirm={handleConfirmCancel}
        onCancel={() => setIsCancelModalOpen(false)}
        confirmText="Confirm"
        cancelText="Cancel"
      />
    </div>
  );
}
