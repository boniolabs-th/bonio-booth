/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '..';
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

  // If no state passed, redirect back
  useEffect(() => {
    if (!state) {
      navigate('/');
    }
  }, [state, navigate]);

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

  const handlePriceClick = () => {
    navigate('/photo-prepare', {
      state: {
        quantity: state.quantity,
        totalPrice: state.totalPrice,
      },
    });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate QR code data (you can replace this with actual payment data)
  const qrCodeData = `payment:${state?.totalPrice || 125}:${state?.quantity || 1}:${Date.now()}`;

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
          <div className="qr-code-placeholder">
            {/* Placeholder QR Code pattern */}
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
        </div>

        {/* Price Display */}
        <div
          className="price-container"
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
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className="timer-circle">
            <span className="timer-text">{timeLeft}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
