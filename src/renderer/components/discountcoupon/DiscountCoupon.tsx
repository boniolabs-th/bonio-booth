/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '..';
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

  const handleBack = () => {
    navigate('/select-print', { state });
  };

  const handleNumberClick = (number: string) => {
    setCode((prev) => {
      // Shift left and add new number
      const newCode = prev.slice(1) + number;
      return newCode;
    });
  };

  const handleBackspace = () => {
    setCode((prev) => {
      // Shift right and add 0 at the beginning
      const newCode = '0' + prev.slice(0, -1);
      return newCode;
    });
  };

  const handleConfirm = () => {
    // Navigate back to SelectPrint with discount code
    navigate('/select-print', {
      state: {
        ...state,
        discountCode: code,
      },
    });
  };

  return (
    <div className="discount-coupon-container">
      <Header showBackButton onBackClick={handleBack} />

      <div className="discount-content">
        {/* Title Section */}
        <div className="title-section">
          <h1 className="title-thai">ใช้คูปองส่วนลด</h1>
          <p className="title-english">USE DISCOUNT COUPON</p>
        </div>

        {/* Code Input Display */}
        <div className="code-input-container">
          <div className="code-display">{code}</div>
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

      {/* Confirm Button */}
      <div className="confirm-section">
        <button
          type="button"
          className="confirm-button"
          onClick={handleConfirm}
        >
          ยืนยัน
        </button>
      </div>
    </div>
  );
}

