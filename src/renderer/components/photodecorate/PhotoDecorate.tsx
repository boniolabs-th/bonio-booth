/* eslint-disable jsx-a11y/img-redundant-alt */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { FRAME_CONFIGS, FrameConfig } from '../../utils/frameConfig';
import { drawPhotoInSlot } from '../../utils/canvasUtils';
import './PhotoDecorate.css';
import { Countdown } from '..';

interface Capture {
  video: string;
  photo: string;
  boomerangGif?: string;
  boomerangFrames?: string[];
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  captures: Capture[];
  selectedFrame?: FrameConfig;
  useBoomerang?: boolean;
}

export default function PhotoDecorate() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const selectedFrame = state.selectedFrame || FRAME_CONFIGS[0];
  const [photoAssignments, setPhotoAssignments] = useState<{
    [slotIndex: number]: number;
  }>({});
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [scaleFactor, setScaleFactor] = useState({ x: 1, y: 1 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameImgRef = useRef<HTMLImageElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const previewSlots = selectedFrame.previewSlots || selectedFrame.slots;

  const calculateScaleFactor = useCallback(() => {
    const frameImg = frameImgRef.current;
    const container = frameImg?.parentElement;
    if (!frameImg || !frameImg.complete || !container) return;

    // Get the img element dimensions - this IS the rendered image size
    const imgRect = frameImg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const renderedWidth = imgRect.width;
    const renderedHeight = imgRect.height;

    if (renderedWidth <= 0 || renderedHeight <= 0) return;

    // The image maintains aspect ratio when rendered (max-width/max-height CSS)
    // Calculate scale from both dimensions and use the one that's actually constraining
    // For portrait frames (height > width), typically height is constraining
    // For landscape frames (width > height), typically width is constraining
    const scaleFromWidth = renderedWidth / selectedFrame.width;
    const scaleFromHeight = renderedHeight / selectedFrame.height;

    // Use the smaller scale factor - this is the one that's actually constraining the image
    // Both should be equal (or very close) since aspect ratio is maintained
    const scale = Math.min(scaleFromWidth, scaleFromHeight);

    // Calculate offset - the image is centered in the container via flexbox
    // We need the offset from container's top-left to image's top-left
    const offsetX = imgRect.left - containerRect.left;
    const offsetY = imgRect.top - containerRect.top;

    setScaleFactor({ x: scale, y: scale });
    setImageOffset({ x: offsetX, y: offsetY });
  }, [selectedFrame.width, selectedFrame.height]);

  // Calculate scale factor on mount and resize
  useEffect(() => {
    // Small timeout to ensure layout is ready
    const timer = setTimeout(calculateScaleFactor, 100);
    window.addEventListener('resize', calculateScaleFactor);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateScaleFactor);
    };
  }, [calculateScaleFactor]);

  const handleFrameImageLoad = () => {
    // Use requestAnimationFrame to ensure the image is fully rendered
    requestAnimationFrame(() => {
      calculateScaleFactor();
    });
  };

  const handleCountdownComplete = useCallback(() => {
    console.log(
      '⏰ [PhotoDecorate] Countdown completed, auto-navigating to home',
    );
    navigate('/');
  }, [navigate]);

  const proceedToResult = (
    finalImageData: string,
    selectedCaptures: Capture[],
  ) => {
    navigate('/photo-filter', {
      state: {
        ...state,
        finalImage: finalImageData,
        selectedFrame,
        selectedCaptures,
        useBoomerang: state.useBoomerang || false,
      },
    });
  };

  const generateFinalImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create the final composite image
    const frameImg = new Image();
    frameImg.onload = () => {
      const frameWidth = frameImg.naturalWidth || selectedFrame.width;
      const frameHeight = frameImg.naturalHeight || selectedFrame.height;

      canvas.width = frameWidth;
      canvas.height = frameHeight;

      const scaleX = frameWidth / selectedFrame.width;
      const scaleY = frameHeight / selectedFrame.height;

      // Draw photos in their assigned slots
      let loadedPhotos = 0;
      const totalPhotos = Object.keys(photoAssignments).length;

      if (totalPhotos === 0) {
        // No photos assigned, draw frame only
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);
        proceedToResult(canvas.toDataURL('image/png'), []);
        return;
      }

      // Draw frame background before adding photos
      ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

      Object.entries(photoAssignments).forEach(([slotIndex, photoIndex]) => {
        const slot = selectedFrame.slots[parseInt(slotIndex, 10)];
        const photoImg = new Image();

        photoImg.onload = () => {
          drawPhotoInSlot({
            ctx,
            photoImg,
            slot,
            scaleX,
            scaleY,
          });

          loadedPhotos += 1;
          if (loadedPhotos === totalPhotos) {
            // Preserve slot order when collecting the selected captures
            const selectedCaptures = selectedFrame.slots.reduce<Capture[]>(
              (acc, _, slotIdx) => {
                const assignedIndex = photoAssignments[slotIdx];
                if (assignedIndex !== undefined) {
                  acc.push(state.captures[assignedIndex]);
                }
                return acc;
              },
              [],
            );
            proceedToResult(canvas.toDataURL('image/png'), selectedCaptures);
          }
        };

        photoImg.src = state.captures[photoIndex].photo;
      });
    };

    frameImg.src = selectedFrame.image;
  };

  const handleConfirm = () => {
    // Generate final image
    generateFinalImage();
  };

  const handlePhotoClick = (photoIndex: number) => {
    // Check if photo is already selected
    if (selectedPhotos.includes(photoIndex)) {
      // Remove photo from selection
      const newSelectedPhotos = selectedPhotos.filter((p) => p !== photoIndex);
      setSelectedPhotos(newSelectedPhotos);

      // Update photoAssignments to match new sequence
      const newAssignments: { [slotIndex: number]: number } = {};
      newSelectedPhotos.forEach((p, index) => {
        newAssignments[index] = p;
      });
      setPhotoAssignments(newAssignments);
    } else if (selectedPhotos.length < selectedFrame.slots.length) {
      // Add photo to selection if there's space
      const newSelectedPhotos = [...selectedPhotos, photoIndex];
      setSelectedPhotos(newSelectedPhotos);

      // Update photoAssignments
      const newAssignments = { ...photoAssignments };
      newAssignments[selectedPhotos.length] = photoIndex;
      setPhotoAssignments(newAssignments);
    }
  };

  return (
    <div className="photo-decorate-container">
      {/* Countdown Timer - นับถอยหลัง 30 วินาที แล้วไปหน้าถัดไปอัตโนมัติ */}
      <Countdown
        seconds={30}
        onComplete={handleCountdownComplete}
        visible={true}
      />

      {/* Main Content */}
      <div className="main-content-decorate">
        {/* Row 1: Title (20%) */}
        <div className="row-top">
          <div className="title-section">
            <h1 className="decorate-title">เลือกรูปของคุณ</h1>
            <p className="decorate-subtitle">SELECT YOUR PHOTO</p>
          </div>
        </div>

        {/* Row 2: Main Layout (60%) */}
        <div className="row-middle">
          <div className="decorate-main">
            {/* Left - Frame Preview */}
            <div className="frame-preview-section" ref={sectionRef}>
              <div className="frame-preview-container">
                <img
                  ref={frameImgRef}
                  src={selectedFrame.image}
                  alt="Frame"
                  className="frame-background-dec"
                  onLoad={handleFrameImageLoad}
                />
                {previewSlots.map((slot, slotIndex) => {
                  // Calculate pixel positions and sizes based on previewSlots dimensions
                  // Add imageOffset to account for centered image within container
                  const slotX = slot.x * scaleFactor.x + imageOffset.x;
                  const slotY = slot.y * scaleFactor.y + imageOffset.y;
                  const slotWidth = slot.width * scaleFactor.x;
                  const slotHeight = slot.height * scaleFactor.y;
                  // const slotAspectRatio = slot.width / slot.height;

                  return (
                    <div
                      key={slot.id}
                      className="frame-slot-preview"
                      style={{
                        position: 'absolute',
                        zIndex: 1,
                        left: `${slotX}px`,
                        top: `${slotY}px`,
                        width: `${slotWidth}px`,
                        height: `${slotHeight}px`,
                        // aspectRatio: slotAspectRatio,
                        borderRadius: `${slot.radius}px`,
                      }}
                    >
                      {photoAssignments[slotIndex] !== undefined && (
                        <img
                          src={
                            state.captures[photoAssignments[slotIndex]].photo
                          }
                          alt={`Capture ${slotIndex + 1}`}
                          className="slot-photo"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right - Photo Grid */}
            <div className="photo-grid-section">
              <div className="photo-grid">
                {state.captures.map((capture, index) => {
                  const sequenceNumber = selectedPhotos.indexOf(index);
                  const isSelected = sequenceNumber !== -1;

                  const slot = selectedFrame.slots?.[0];
                  const aspectRatio = slot
                    ? `${slot.width} / ${slot.height}`
                    : '16 / 9';
                  return (
                    <button
                      key={capture.video || capture.photo}
                      type="button"
                      className={`photo-card ${isSelected ? 'selected' : ''}`}
                      style={{ aspectRatio }}
                      onClick={() => handlePhotoClick(index)}
                    >
                      <img src={capture.photo} alt={`Capture ${index + 1}`} />
                      {isSelected && (
                        <div className="sequence-badge">
                          {sequenceNumber + 1}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Button (20%) */}
        <div className="row-bottom">
          <button
            type="button"
            className="next-button-decorate"
            onClick={handleConfirm}
            disabled={selectedPhotos.length !== selectedFrame.slots.length}
          >
            ต่อไป
          </button>
        </div>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
