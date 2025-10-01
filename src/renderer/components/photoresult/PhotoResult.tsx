/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { Header } from '..';
import './PhotoResult.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  photos: string[];
  gifData: string;
  finalImage: string;
  selectedFrame: string;
  selectedFilter: string;
}

export default function PhotoResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const handleDownloadGif = () => {
    if (state.gifData) {
      const link = document.createElement('a');
      link.href = state.gifData;
      link.download = 'bonio-booth-memories.webm';
      link.click();
    }
  };

  const handleFinish = () => {
    navigate('/');
  };

  const generateQRCode = () => {
    // Generate QR code for the final image or download link
    // For demo purposes, this would be a placeholder
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTAgMTBoODB2ODBIMTBWMTB6IiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNMjAgMjBoNjB2NjBIMjBWMjB6IiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzAgMzBoNDB2NDBIMzBWMzB6IiBmaWxsPSJibGFjayIvPgo8L3N2Zz4K';
  };

  return (
    <div className="photo-result-container">
      {/* Header */}
      <Header showLogo />

      {/* Main Content */}
      <div className="main-content">
        <div className="result-layout">
          {/* Left side - Final photo */}
          <div className="final-photo-section">
            <h2 className="section-title">Your Beautiful Memory</h2>

            <div className="final-photo-container">
              {state.finalImage ? (
                <img
                  src={state.finalImage}
                  alt="Final photo"
                  className="final-photo"
                />
              ) : (
                <div className="placeholder-photo">
                  <div className="placeholder-content">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                        fill="currentColor"
                      />
                    </svg>
                    <p>Your photo will appear here</p>
                  </div>
                </div>
              )}
            </div>

            <div className="photo-details">
              <div className="detail-item">
                <span className="label">Frame:</span>
                <span className="value">
                  {state.selectedFrame || 'Classic'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Filter:</span>
                <span className="value">
                  {state.selectedFilter || 'Original'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Photos:</span>
                <span className="value">
                  {state.photos?.length || 0} images
                </span>
              </div>
            </div>
          </div>

          {/* Right side - Download options */}
          <div className="download-section">
            <h2 className="section-title">Download Your .Gif</h2>

            <div className="download-container">
              <div className="gif-preview">
                {state.gifData ? (
                  <video
                    src={state.gifData}
                    autoPlay
                    loop
                    muted
                    className="gif-video"
                  />
                ) : (
                  <div className="gif-placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                    <p>Your GIF will appear here</p>
                  </div>
                )}
              </div>

              <div className="qr-code-container">
                <img
                  src={generateQRCode()}
                  alt="QR Code for download"
                  className="qr-code"
                />
                <p className="qr-text">Scan to download</p>
              </div>

              <button
                type="button"
                className="download-button"
                onClick={handleDownloadGif}
                disabled={!state.gifData}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 10l5 5 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 15V3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download Your .Gif
              </button>
            </div>
          </div>
        </div>

        {/* Finish Button */}
        <div className="action-section">
          <button
            type="button"
            className="finish-button"
            onClick={handleFinish}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.46 0 2.84.35 4.05.97"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Finish & Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
