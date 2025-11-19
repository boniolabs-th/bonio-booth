/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { BackButton } from '..';
import { FRAME_CONFIGS, FrameConfig } from '../../utils/frameConfig';
import './FrameSelection.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
}

export default function FrameSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedFrame, setSelectedFrame] = useState<FrameConfig>(
    FRAME_CONFIGS[0],
  );
  const [useBoomerang, setUseBoomerang] = useState<boolean>(false);

  const handleBack = () => {
    navigate('/payment-qr', { state });
  };

  const handleConfirm = () => {
    navigate('/photo-prepare', {
      state: { ...state, selectedFrame, useBoomerang },
    });
  };

  return (
    <div className="frame-selection-container">
      {/* Back Button */}
      <BackButton onBackClick={handleBack} />

      {/* Main Content */}
      <div className="main-content-frame">
        {/* Title Section */}
        <div className="title-section">
          <h1 className="title-frame">เลือกกรอบรูป</h1>
          <p className="subtitle-frame">SELECT YOUR FRAME</p>
        </div>

        {/* Frame Thumbnails - Horizontal Scroll */}
        <div className="frames-thumbnails">
          {FRAME_CONFIGS.map((frame) => {
            const thumbnailWidth =
              frame.orientation === 'portrait' ? '120px' : '160px';
            const thumbnailHeight =
              frame.orientation === 'portrait' ? '160px' : '120px';

            return (
              <div
                key={frame.id}
                role="button"
                tabIndex={0}
                className={`frame-thumbnail ${selectedFrame.id === frame.id ? 'selected' : ''}`}
                style={{
                  height: thumbnailHeight,
                }}
                onClick={() => setSelectedFrame(frame)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedFrame(frame);
                  }
                }}
              >
                {selectedFrame.id === frame.id && (
                  <div className="selected-badge">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <img src={frame.image} alt={frame.name} />
              </div>
            );
          })}
        </div>

        {/* Large Preview */}
        <div className="frame-preview-large">
          <img src={selectedFrame.image} alt={selectedFrame.name} />
        </div>

        {/* Boomerang Option */}
        {/* <div className="boomerang-option-section">
          <div className="boomerang-option-title">เลือกรูปแบบวิดีโอ</div>
          <div className="boomerang-options">
            <button
              type="button"
              className={`boomerang-option-button ${!useBoomerang ? 'active' : ''}`}
              onClick={() => setUseBoomerang(false)}
            >
              <div className="boomerang-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="2"
                    y="4"
                    width="20"
                    height="16"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M10 12l3 3 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="boomerang-option-content">
                <div className="boomerang-option-name">วิดีโอธรรมดา</div>
                <div className="boomerang-option-desc">เร็ว ไม่ต้องรอ</div>
              </div>
            </button>
            <button
              type="button"
              className={`boomerang-option-button ${useBoomerang ? 'active' : ''}`}
              onClick={() => setUseBoomerang(true)}
            >
              <div className="boomerang-option-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L2 7l10 5 10-5-10-5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 17l10 5 10-5M2 12l10 5 10-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="boomerang-option-content">
                <div className="boomerang-option-name">Boomerang</div>
                <div className="boomerang-option-desc">เอฟเฟ็กต์พิเศษ (ใช้เวลานาน)</div>
              </div>
            </button>
          </div>
        </div> */}

        {/* Confirm Button */}
        <button
          type="button"
          className="next-button-frame"
          onClick={handleConfirm}
        >
          ต่อไป
        </button>
      </div>
    </div>
  );
}
