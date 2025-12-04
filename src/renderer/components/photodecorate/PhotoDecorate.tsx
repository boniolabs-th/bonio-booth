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
  const containerRef = useRef<HTMLDivElement>(null);
  const previewSlots = selectedFrame.previewSlots || selectedFrame.slots;
  const frameAspectRatio = selectedFrame.height
    ? selectedFrame.width / selectedFrame.height
    : 1;

  const calculateScaleFactor = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      const actualWidth = container.offsetWidth || container.clientWidth;
      const actualHeight = container.offsetHeight || container.clientHeight;
      const scaleX = actualWidth / selectedFrame.width;
      const scaleY = actualHeight / selectedFrame.height;
      setScaleFactor({ x: scaleX, y: scaleY });
    }
  }, [selectedFrame.height, selectedFrame.width]);

  // Calculate scale factor on mount and when frame changes
  useEffect(() => {
    // Give a small delay to ensure layout is computed
    const timer = setTimeout(() => {
      calculateScaleFactor();
    }, 100);
    return () => clearTimeout(timer);
  }, [calculateScaleFactor, selectedFrame.height, selectedFrame.width]);

  // Recalculate scale factor on window resize
  useEffect(() => {
    const handleResize = () => {
      calculateScaleFactor();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', calculateScaleFactor);
    };
  }, [calculateScaleFactor]);


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
    frameImg.crossOrigin = 'anonymous'; // Fix CORS issue
    frameImg.onload = () => {
      const frameWidth = frameImg.naturalWidth || selectedFrame.width;
      const frameHeight = frameImg.naturalHeight || selectedFrame.height;

      canvas.width = frameWidth;
      canvas.height = frameHeight;

      const scaleX = frameWidth / selectedFrame.width;
      const scaleY = frameHeight / selectedFrame.height;

      // Fill with white background first (paper color)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, frameWidth, frameHeight);

      // Draw photos in their assigned slots
      let loadedPhotos = 0;
      const totalPhotos = Object.keys(photoAssignments).length;

      if (totalPhotos === 0) {
        // No photos assigned, draw frame only
        // ctx.clearRect(0, 0, frameWidth, frameHeight); // Don't clear, keep white background
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);
        proceedToResult(canvas.toDataURL('image/png'), []);
        return;
      }

      // Draw frame background before adding photos
      // ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

      // Prepare slots to draw
      const slotsToDraw = Object.entries(photoAssignments).map(([slotIndex, photoIndex]) => {
        const slot = selectedFrame.slots[parseInt(slotIndex, 10)];
        return {
          slot,
          photoIndex,
          zIndex: slot.zIndex || 0
        };
      });

      // Sort slots by zIndex (if needed, but we separate them into background/foreground)
      const backgroundSlots = slotsToDraw.filter(s => s.zIndex < 0);
      const foregroundSlots = slotsToDraw.filter(s => s.zIndex >= 0);

      const drawSlot = (slotData: typeof slotsToDraw[0]) => {
        return new Promise<void>((resolve) => {
          const { slot, photoIndex } = slotData;
          const targetX = slot.x * scaleX;
          const targetY = slot.y * scaleY;
          const targetWidth = slot.width * scaleX;
          const targetHeight = slot.height * scaleY;
          const targetRadius = slot.radius * scaleX; // Scale radius with scaleX
          const photoImg = new Image();
          photoImg.crossOrigin = 'anonymous';

          photoImg.onload = () => {
            ctx.save();

            // Create rounded rectangle clipping path
            ctx.beginPath();
            ctx.moveTo(targetX + targetRadius, targetY);
            ctx.lineTo(targetX + targetWidth - targetRadius, targetY);
            ctx.quadraticCurveTo(
              targetX + targetWidth,
              targetY,
              targetX + targetWidth,
              targetY + targetRadius,
            );
            ctx.lineTo(
              targetX + targetWidth,
              targetY + targetHeight - targetRadius,
            );
            ctx.quadraticCurveTo(
              targetX + targetWidth,
              targetY + targetHeight,
              targetX + targetWidth - targetRadius,
              targetY + targetHeight,
            );
            ctx.lineTo(targetX + targetRadius, targetY + targetHeight);
            ctx.quadraticCurveTo(
              targetX,
              targetY + targetHeight,
              targetX,
              targetY + targetHeight - targetRadius,
            );
            ctx.lineTo(targetX, targetY + targetRadius);
            ctx.quadraticCurveTo(
              targetX,
              targetY,
              targetX + targetRadius,
              targetY,
            );
            ctx.closePath();
            ctx.clip();

            // Calculate crop dimensions (cover behavior - crop to fit slot)
            const photoAspect = photoImg.width / photoImg.height;
            const slotAspect = slot.width / slot.height;

            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = photoImg.width;
            let sourceHeight = photoImg.height;

            if (photoAspect > slotAspect) {
              // Photo is wider - crop sides
              sourceWidth = photoImg.height * slotAspect;
              sourceX = (photoImg.width - sourceWidth) / 2;
            } else {
              // Photo is taller - crop top/bottom
              sourceHeight = photoImg.width / slotAspect;
              sourceY = (photoImg.height - sourceHeight) / 2;
            }

            // Draw cropped photo in slot
            ctx.drawImage(
              photoImg,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              targetX,
              targetY,
              targetWidth,
              targetHeight,
            );

            ctx.restore();
            resolve();
          };

          photoImg.onerror = () => resolve(); // Resolve even on error to continue
          photoImg.src = state.captures[photoIndex].photo;
        });
      };

      // Execute drawing in order: Background Slots -> Frame -> Foreground Slots
      (async () => {
        // 1. Draw background slots
        for (const slotData of backgroundSlots) {
          await drawSlot(slotData);
        }

        // 2. Draw frame
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

        // 3. Draw foreground slots
        for (const slotData of foregroundSlots) {
          await drawSlot(slotData);
        }

        // Finish
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
      })();
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
        seconds={9999999}
        onComplete={handleCountdownComplete}
        visible={true}
      />

      {/* Main Layout */}
      <div className="decorate-main">
        {/* Left - Frame Preview */}
        <div className="frame-preview-section">
          <div
            ref={containerRef}
            className="frame-preview-container"
            style={{
              aspectRatio: frameAspectRatio,
              height: '65vh',
              width: 'auto',
              maxWidth: '100%',
              position: 'relative',
              isolation: 'isolate', // Create stacking context
              backgroundColor: '#ffffff', // White background for transparent frames
            }}
          >
            <img
              ref={frameImgRef}
              src={selectedFrame.image}
              alt="Frame"
              crossOrigin="anonymous"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
            {previewSlots.map((slot, slotIndex) => {
              // Calculate pixel positions and sizes based on previewSlots dimensions
              const slotX = slot.x * scaleFactor.x;
              const slotY = slot.y * scaleFactor.y;
              const slotWidth = slot.width * scaleFactor.x;
              const slotHeight = slot.height * scaleFactor.y;
              const slotAspectRatio = slot.width / slot.height;
              const scaledRadius = slot.radius * scaleFactor.x; // Scale radius
              const zIndex = slot.zIndex || 0;

              return (
                <div
                  key={slot.id}
                  className="frame-slot-preview"
                  style={{
                    position: 'absolute',
                    left: `${slotX}px`,
                    top: `${slotY}px`,
                    width: `${slotWidth}px`,
                    height: `${slotHeight}px`,
                    aspectRatio: slotAspectRatio,
                    borderRadius: `${scaledRadius}px`,
                    overflow: 'hidden', // Ensure content is clipped
                    zIndex: zIndex < 0 ? -1 : 1, // Simple layering relative to frame
                  }}
                >
                  {photoAssignments[slotIndex] !== undefined && (
                    <img
                      src={state.captures[photoAssignments[slotIndex]].photo}
                      alt={`Capture ${slotIndex + 1}`}
                      className="slot-photo"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover', // Ensure photo covers the slot
                      }}
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

              return (
                <button
                  key={capture.video || capture.photo}
                  type="button"
                  className={`photo-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePhotoClick(index)}
                >
                  <img src={capture.photo} alt={`Capture ${index + 1}`} />
                  {isSelected && (
                    <div className="sequence-badge">{sequenceNumber + 1}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="decorate-footer">
        <button
          type="button"
          className="next-button"
          onClick={handleConfirm}
          disabled={selectedPhotos.length !== selectedFrame.slots.length}
        >
          ต่อไป
        </button>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
