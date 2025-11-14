/* eslint-disable jsx-a11y/control-has-associated-label */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '..';
import './SelectPrint.css';

export default function SelectPrint() {
  const [quantity, setQuantity] = useState(1);
  const [price] = useState(125); // Base price per print
  const navigate = useNavigate();

  const handleDecrease = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleIncrease = () => {
    setQuantity(quantity + 1);
  };

  const handleDiscountCoupon = () => {
    // TODO: Implement discount coupon functionality
  };

  const handleConfirm = () => {
    // Navigate to payment page with quantity and total price
    navigate('/payment-qr', {
      state: {
        quantity,
        totalPrice: price * quantity,
      },
    });
  };

  return (
    <div className="select-print-container">
      {/* Header */}
      <Header showBackButton backButtonPath="/" />

      {/* Main Content */}
      <div className="main-content">
        <h1 className="title">Select Number of Print</h1>

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
          <span className="price">{price * quantity}</span>
          <span className="currency">THB</span>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button
            type="button"
            className="discount-button"
            onClick={handleDiscountCoupon}
          >
            Discount Coupon
          </button>
          <button
            type="button"
            className="confirm-button"
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
