/* eslint-disable jsx-a11y/img-redundant-alt */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { FrameConfig } from '../../utils/frameConfig';
import './PhotoFilter.css';

interface Capture {
  video: string;
  photo: string;
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  captures: Capture[];
  finalImage: string;
  selectedFrame: FrameConfig;
  selectedCaptures: Capture[];
}

export default function PhotoFilter() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);

  const handlePrint = () => {
    navigate('/photo-result', {
      state: {
        ...state,
      },
    });
  };

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  return (
    <div className="photo-filter-container">
      {/* Header */}
      <div className="filter-header">
        <h1 className="filter-title">ตกแต่งรูปของคุณ</h1>
        <p className="filter-subtitle">DECORATE YOUR PHOTO</p>
      </div>

      {/* Main Layout */}
      <div className="filter-main">
        {/* Left - Photo Strip */}
        <div className="photo-strip-section">
          <div className="photo-strip">
            {state.selectedCaptures.map((capture, index) => {
              const isSelected = index === selectedPhotoIndex;
              return (
                <button
                  key={capture.video || capture.photo}
                  type="button"
                  className={`photo-strip-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePhotoClick(index)}
                >
                  <img src={capture.photo} alt={`Photo ${index + 1}`} />
                  {isSelected && (
                    <div className="strip-overlay">
                      <div className="strip-badge">{index + 1}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right - Canvas Area */}
        <div className="canvas-section">
          <div className="canvas-container">
            {state.finalImage ? (
              <img
                src={state.finalImage}
                alt="Photo to decorate"
                className="canvas-image"
              />
            ) : (
              state.selectedCaptures[selectedPhotoIndex] && (
                <img
                  src={state.selectedCaptures[selectedPhotoIndex].photo}
                  alt="Photo to decorate"
                  className="canvas-image"
                />
              )
            )}
            {/* Canvas area for future decoration features */}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="filter-footer">
        <button type="button" className="print-button" onClick={handlePrint}>
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
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          พิมพ์รูปภาพ
        </button>
      </div>
    </div>
  );
}

