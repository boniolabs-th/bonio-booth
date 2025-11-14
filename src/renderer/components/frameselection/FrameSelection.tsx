/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Header } from '..';
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

  const handleBack = () => {
    navigate('/payment-qr', { state });
  };

  const handleConfirm = () => {
    navigate('/photo-prepare', { state: { ...state, selectedFrame } });
  };

  return (
    <div className="frame-selection-container">
      {/* Header */}
      <Header showBackButton onBackClick={handleBack} />

      {/* Main Content */}
      <div className="main-content">
        <h1 className="title-frame">เลือกกรอบรูป</h1>
        <p className="subtitle-frame">SELECT YOUR FRAME</p>

        {/* Frame Thumbnails - Horizontal Scroll */}
        <div className="frames-thumbnails">
          {FRAME_CONFIGS.map((frame) => {
            const thumbnailWidth =
              frame.orientation === 'portrait' ? '200px' : '300px';

            return (
              <div
                key={frame.id}
                role="button"
                tabIndex={0}
                className={`frame-thumbnail ${selectedFrame.id === frame.id ? 'selected' : ''}`}
                style={{
                  width: thumbnailWidth,
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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

        {/* Confirm Button */}
        <button
          type="button"
          className="confirm-button"
          onClick={handleConfirm}
        >
          ต่อไป
        </button>
      </div>
    </div>
  );
}
