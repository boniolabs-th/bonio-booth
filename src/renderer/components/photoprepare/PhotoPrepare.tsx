/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { BackButton } from '..';
import { FRAME_CONFIGS, FrameConfig } from '../../utils/frameConfig';
import './PhotoPrepare.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  selectedFrame?: FrameConfig;
  useBoomerang?: boolean;
  transactionId?: string;
  referenceId?: string;
  paymentDetailsId?: string;
}

export default function PhotoPrepare() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedFrame, setSelectedFrame] = useState<FrameConfig>(
    state.selectedFrame || FRAME_CONFIGS[0],
  );

  const handleBack = () => {
    navigate('/frame-selection', { state });
  };

  const handleConfirm = () => {
    navigate('/main-shooting', {
      state: {
        ...state,
        selectedFrame,
        useBoomerang: state.useBoomerang || false,
      },
    });
  };

  return (
    <div className="photo-prepare-container">
      {/* Back Button */}
      <BackButton onBackClick={handleBack} />

      {/* Main Content */}
      <div className="main-content">
        <div className="title-prepare-section">
          <h1 className="title-prepare">เตรียมถ่ายภาพ</h1>
          <p className="subtitle-prepare">PREPARE FOR PHOTOSHOOT</p>
        </div>

        {/* Steps */}
        <div className="steps-container">
          {/* Step 1 */}
          <div className="step">
            <div className="step-circle">
              <span className="step-number">1</span>
            </div>
            <div className="step-content">
              <div className="step-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="13"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 9v4M10 11h4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <p className="step-title">3 Second Per Image</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="step">
            <div className="step-circle">
              <span className="step-number">2</span>
            </div>
            <div className="step-content">
              <div className="step-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="8" cy="10" r="2" fill="currentColor" />
                  <circle cx="16" cy="10" r="2" fill="currentColor" />
                  <circle cx="12" cy="16" r="2" fill="currentColor" />
                  <circle cx="6" cy="16" r="1" fill="currentColor" />
                  <circle cx="18" cy="16" r="1" fill="currentColor" />
                  <circle cx="10" cy="6" r="1" fill="currentColor" />
                  <circle cx="14" cy="6" r="1" fill="currentColor" />
                </svg>
              </div>
              <p className="step-title">Decorate Your Photo</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="step">
            <div className="step-circle">
              <span className="step-number">3</span>
            </div>
            <div className="step-content">
              <div className="step-icon-group">
                {/* Frame with Play Icon */}
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <polygon
                    points="10,8 10,16 16,12"
                    fill="currentColor"
                  />
                </svg>
                {/* Printer Icon */}
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <polyline
                    points="6,9 6,2 18,2 18,9"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <rect
                    x="6"
                    y="14"
                    width="12"
                    height="8"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <p className="step-title">Decorate Your Photo</p>
            </div>
          </div>
        </div>

        {/* Confirm Button */}
        <button
          type="button"
          className="start-shooting-button"
          onClick={handleConfirm}
        >
          เริ่มถ่าย
        </button>
      </div>
    </div>
  );
}
