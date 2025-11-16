/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '..';
import './PhotoConfirmation.css';

interface Capture {
  video: string;
  photo: string;
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  captures: Capture[];
}

export default function PhotoConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const handleBack = () => {
    navigate('/photo-prepare', { state });
  };

  const handleRetake = () => {
    navigate('/main-shooting', { state });
  };

  const handleConfirm = () => {
    navigate('/photo-decorate', { state });
  };

  return (
    <div className="photo-confirmation-container">
      {/* Header */}
      <Header showBackButton onBackClick={handleBack} />

      {/* Main Content */}
      <div className="main-content">
        <div className="confirmation-container">
          <h2 className="title">Confirm Your Photo Shoot</h2>

          <div className="photos-grid">
            {state.captures &&
              state.captures.map((capture, index) => (
                <div key={index} className="photo-frame">
                  <img
                    src={capture.photo}
                    alt={`Photo ${index + 1}`}
                    className="photo-image"
                  />
                  <div className="photo-number">{index + 1}</div>
                </div>
              ))}
          </div>

          <div className="action-buttons">
            <button
              type="button"
              className="retake-button"
              onClick={handleRetake}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 3v5h-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 21v-5h5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Retake Photos
            </button>

            <button
              type="button"
              className="confirm-photo-button"
              onClick={handleConfirm}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
