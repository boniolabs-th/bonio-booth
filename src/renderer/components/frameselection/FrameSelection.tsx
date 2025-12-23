/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef } from 'react';
// import BackButton from '../backbutton';
import Countdown from '../countdown';
import { COUNTDOWN } from '../../utils/appConfig';
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
  const [useBoomerang, setUseBoomerang] = useState<boolean>(false); // Default: ไม่ใช้ Boomerang (Live Photo style)
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Drag to scroll state
  const framesContainerRef = useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const isDraggingRef = useRef(false);
  const thumbnailWidthRef = useRef(120 + 36); // thumbnail width + gap

  // Scroll position state for enabling/disabling nav buttons
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Update scroll position state
  const updateScrollButtons = useCallback(() => {
    if (framesContainerRef.current) {
      const {
        scrollLeft: sl,
        scrollWidth,
        clientWidth,
      } = framesContainerRef.current;
      setCanScrollLeft(sl > 0);
      setCanScrollRight(sl < scrollWidth - clientWidth - 1);
    }
  }, []);

  // Scroll by one frame
  const scrollByOneFrame = (direction: 'left' | 'right') => {
    if (framesContainerRef.current) {
      const scrollAmount =
        direction === 'left'
          ? -thumbnailWidthRef.current
          : thumbnailWidthRef.current;
      framesContainerRef.current.scrollBy({
        left: scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDown(true);
    isDraggingRef.current = false;
    if (framesContainerRef.current) {
      setStartX(e.pageX - framesContainerRef.current.offsetLeft);
      setScrollLeft(framesContainerRef.current.scrollLeft);
    }
  };

  const handleMouseLeave = () => {
    setIsDown(false);
  };

  const handleMouseUp = () => {
    setIsDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDown) return;
    e.preventDefault();
    if (framesContainerRef.current) {
      const x = e.pageX - framesContainerRef.current.offsetLeft;
      const walk = (x - startX) * 2; // Scroll-fast
      if (Math.abs(walk) > 5) {
        isDraggingRef.current = true;
      }
      framesContainerRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  // Touch event handlers for touch screen
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDown(true);
    isDraggingRef.current = false;
    if (framesContainerRef.current) {
      setStartX(e.touches[0].pageX - framesContainerRef.current.offsetLeft);
      setScrollLeft(framesContainerRef.current.scrollLeft);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDown) return;
    if (framesContainerRef.current) {
      const x = e.touches[0].pageX - framesContainerRef.current.offsetLeft;
      const walk = (x - startX) * 2;
      if (Math.abs(walk) > 5) {
        isDraggingRef.current = true;
      }
      framesContainerRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  const handleTouchEnd = () => {
    setIsDown(false);
  };

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

  // Update scroll buttons on scroll and on resize (when images load)
  useEffect(() => {
    const container = framesContainerRef.current;
    if (container && !isLoading && frames && frames.length > 0) {
      // Listen for scroll events
      container.addEventListener('scroll', updateScrollButtons);

      // Use ResizeObserver to detect when container size changes (images loaded)
      const resizeObserver = new ResizeObserver(() => {
        updateScrollButtons();
      });
      resizeObserver.observe(container);

      // Initial check
      updateScrollButtons();

      return () => {
        container.removeEventListener('scroll', updateScrollButtons);
        resizeObserver.disconnect();
      };
    }
    return undefined;
  }, [updateScrollButtons, isLoading, frames]);

  // const handleBack = () => {
  //   navigate('/payment-qr', { state });
  // };

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
      {/* <BackButton onBackClick={handleBack} /> */}

      {/* Countdown Timer - นับถอยหลัง 30 วินาที แล้วไปหน้าถัดไปอัตโนมัติ */}
      <Countdown
        seconds={COUNTDOWN.FRAME_SELECTION.DURATION}
        onComplete={handleCountdownComplete}
        visible={COUNTDOWN.FRAME_SELECTION.VISIBLE}
      />

      {/* Main Content */}
      <div className="main-content-frame">
        {/* Row 1: Title + Thumbnails (20%) */}
        <div className="selection-row-top">
          {/* Title Section */}
          <div className="title-section">
            <h1 className="title-frame">เลือกกรอบรูป</h1>
            <p className="subtitle-frame">SELECT YOUR FRAME</p>
          </div>

          {/* Frame Thumbnails - Horizontal Scroll with Navigation Buttons */}
          <div className="frames-thumbnails-wrapper">
            {/* Left Arrow Button */}
            <button
              type="button"
              className="frame-nav-button frame-nav-left"
              onClick={() => scrollByOneFrame('left')}
              aria-label="Previous frame"
              disabled={!canScrollLeft}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div
              className="frames-thumbnails"
              ref={framesContainerRef}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                cursor: isDown ? 'grabbing' : 'grab',
                overflowX: 'auto',
                userSelect: 'none',
              }}
            >
              {isLoading ? (
                <div className="loading-frames">Loading frames...</div>
              ) : (
                frames?.map((frame) => {
                  // const thumbnailWidth =
                  //   frame.orientation === 'portrait' ? '120px' : '160px';
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
                      onClick={() => {
                        if (!isDraggingRef.current) {
                          setSelectedFrame(frame);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedFrame(frame);
                        }
                      }}
                    >
                      {selectedFrame?.id === frame.id && (
                        <div className="selected-badge">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
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

            {/* Right Arrow Button */}
            <button
              type="button"
              className="frame-nav-button frame-nav-right"
              onClick={() => scrollByOneFrame('right')}
              aria-label="Next frame"
              disabled={!canScrollRight}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 18l6-6-6-6"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Row 2: Large Preview (60%) */}
        <div className="selection-row-middle">
          <div className="frame-preview-large">
            <img src={selectedFrame?.image} alt={selectedFrame?.name} />
          </div>
        </div>

        {/* Row 3: Confirm Button (20%) */}
        <div className="selection-row-bottom">
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
