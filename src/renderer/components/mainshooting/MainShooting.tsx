/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import icon from '../../../../assets/icons/default_full.svg';
import './MainShooting.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
}

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const handleBack = () => {
    navigate('/photo-prepare', { state });
  };

  return (
    <div className="main-shooting-container">
      {/* Header */}
      <div className="header">
        <button type="button" className="back-button" onClick={handleBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="logo-container">
          <img src={icon} alt="Bonio Booth" className="logo" />
        </div>
      </div>

      {/* Main Content - Empty for you to customize */}
      <div className="main-content">{/* You can add your content here */}</div>
    </div>
  );
}
