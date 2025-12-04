/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { BackButton, Countdown } from '..';
import { FrameConfig, fetchFrameConfigs } from '../../utils/frameConfig';
import './FrameSelection.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  transactionId?: string;
  referenceId?: string;
  paymentDetailsId?: string;
}

export default function FrameSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [frames, setFrames] = useState<FrameConfig[]>();
  const [selectedFrame, setSelectedFrame] = useState<FrameConfig>();
  const [useBoomerang, setUseBoomerang] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadFrames = async () => {
      try {
        setIsLoading(true);
        const apiFrames = await fetchFrameConfigs();
        if (apiFrames.length > 0) {
          setFrames(apiFrames);
          setSelectedFrame(apiFrames[0]);
        }
      } catch (error) {
        console.error('Failed to load frames:', error);
        // Fallback to local frames is already set in initial state
      } finally {
        setIsLoading(false);
      }
    };

    loadFrames();
  }, []);

  const handleBack = () => {
    navigate('/payment-qr', { state });
  };

  const handleConfirm = () => {
    navigate('/photo-prepare', {
      state: {
        ...state,
        selectedFrame,
        useBoomerang,
        transactionId: state.transactionId,
        referenceId: state.referenceId,
        paymentDetailsId: state.paymentDetailsId,
      },
    });
  };

  // Handle countdown completion - ไปหน้าถัดไปอัตโนมัติเมื่อหมดเวลา
  const handleCountdownComplete = useCallback(() => {
    console.log(
      '⏰ [FrameSelection] Countdown completed, auto-navigating to photo-prepare',
    );
    // ไปหน้าถัดไปอัตโนมัติด้วย frame ที่เลือกอยู่
    // navigate('/photo-prepare', {
    //   state: {
    //     ...state,
    //     selectedFrame,
    //     useBoomerang,
    //     transactionId: state.transactionId,
    //     referenceId: state.referenceId,
    //     paymentDetailsId: state.paymentDetailsId,
    //   },
    // });

    navigate('/');
  }, [navigate]);

  return (
    <div className="frame-selection-container">
      {/* Back Button */}
      <BackButton onBackClick={handleBack} />

      {/* Countdown Timer - นับถอยหลัง 30 วินาที แล้วไปหน้าถัดไปอัตโนมัติ */}
      <Countdown
        seconds={30}
        onComplete={handleCountdownComplete}
        visible={true}
      />

      {/* Main Content */}
      <div className="main-content-frame">
        {/* Row 1: Title + Thumbnails (20%) */}
        <div className="row-top">
          {/* Title Section */}
          <div className="title-section">
            <h1 className="title-frame">เลือกกรอบรูป</h1>
            <p className="subtitle-frame">SELECT YOUR FRAME</p>
          </div>

        {/* Frame Thumbnails - Horizontal Scroll */}
        <div className="frames-thumbnails">
          {isLoading ? (
            <div className="loading-frames">Loading frames...</div>
          ) : (
            frames?.map((frame) => {
              const thumbnailWidth =
                frame.orientation === 'portrait' ? '120px' : '160px';
              const thumbnailHeight =
                frame.orientation === 'portrait' ? '160px' : '120px';

              return (
                <div
                  key={frame.id}
                  role="button"
                  tabIndex={0}
                  className={`frame-thumbnail ${selectedFrame?.id === frame.id ? 'selected' : ''}`}
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
                  {selectedFrame?.id === frame.id && (
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
            })
          )}
        </div>
      </div>

        {/* Row 2: Large Preview (60%) */}
        <div className="row-middle">
          <div className="frame-preview-large">
            <img src={selectedFrame?.image} alt={selectedFrame?.name} />
          </div>
        </div>

        {/* Row 3: Confirm Button (20%) */}
        <div className="row-bottom">
          <button
            type="button"
            className="next-button-frame"
            onClick={handleConfirm}
          >
            ต่อไป
          </button>
        </div>
      </div>
    </div>
  );
}
