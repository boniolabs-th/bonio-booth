/* eslint-disable jsx-a11y/img-redundant-alt */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { FrameConfig } from '../../utils/frameConfig';
import { drawPhotoInSlot } from '../../utils/canvasUtils';
import './PhotoDecorate.css';
import Countdown from '../countdown';
import { COUNTDOWN } from '../../utils/appConfig';

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
  videoDuration?: number; // Duration in seconds from MainShooting
}

export default function PhotoDecorate() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const { selectedFrame } = state;
  const [photoAssignments, setPhotoAssignments] = useState<{
    [slotIndex: number]: number;
  }>({});
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [scaleFactor, setScaleFactor] = useState({ x: 1, y: 1 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [canCut, setCanCut] = useState<boolean>(true);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const fetchMachineData = async () => {
      try {
        // @ts-ignore
        const response = await window.electron.payment.getMachineData();
        if (response.success && response.machine) {
          setCanCut(response.machine.canCut !== false);
        }
      } catch (error) {
        console.error('Failed to fetch machine data', error);
      }
    };
    fetchMachineData();
  }, []);

  // Handle scroll event to hide guide
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    const handleScroll = () => {
      if (mainElement.scrollTop > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    mainElement.addEventListener('scroll', handleScroll);
    return () => mainElement.removeEventListener('scroll', handleScroll);
  }, []);

  // Touch and Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!mainRef.current) return;
    setIsDragging(true);
    setStartY(e.pageY - mainRef.current.offsetTop);
    setScrollTop(mainRef.current.scrollTop);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!mainRef.current) return;
    setIsDragging(true);
    setStartY(e.touches[0].pageY - mainRef.current.offsetTop);
    setScrollTop(mainRef.current.scrollTop);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !mainRef.current) return;
    e.preventDefault();
    const y = e.pageY - mainRef.current.offsetTop;
    const walk = (y - startY) * 2; // Scroll speed multiplier
    mainRef.current.scrollTop = scrollTop - walk;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !mainRef.current) return;
    const y = e.touches[0].pageY - mainRef.current.offsetTop;
    const walk = (y - startY) * 2; // Scroll speed multiplier
    mainRef.current.scrollTop = scrollTop - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameImgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewSlots =
    selectedFrame?.previewSlots || selectedFrame?.slots || [];
  const frameAspectRatio = selectedFrame?.height
    ? selectedFrame.width / selectedFrame.height
    : 1;

  const calculateScaleFactor = useCallback(() => {
    const frameImg = frameImgRef.current;
    const container = containerRef.current;
    if (frameImg && container && selectedFrame) {
      const containerWidth = container.offsetWidth || container.clientWidth;
      const containerHeight = container.offsetHeight || container.clientHeight;

      // Calculate actual rendered size with object-fit: contain
      const imgAspect = selectedFrame.width / selectedFrame.height;
      const containerAspect = containerWidth / containerHeight;

      let renderedWidth: number;
      let renderedHeight: number;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > containerAspect) {
        // Image is wider - fit by width
        renderedWidth = containerWidth;
        renderedHeight = containerWidth / imgAspect;
        offsetY = (containerHeight - renderedHeight) / 2;
      } else {
        // Image is taller - fit by height
        renderedHeight = containerHeight;
        renderedWidth = containerHeight * imgAspect;
        offsetX = (containerWidth - renderedWidth) / 2;
      }

      const scaleX = renderedWidth / selectedFrame.width;
      const scaleY = renderedHeight / selectedFrame.height;
      setScaleFactor({ x: scaleX, y: scaleY });
      setImageOffset({ x: offsetX, y: offsetY });
    }
  }, [selectedFrame?.height, selectedFrame?.width, selectedFrame]);

  // Redirect if no frame selected
  useEffect(() => {
    if (!selectedFrame) {
      console.error('No frame selected, redirecting to frame selection');
      navigate('/frame-selection');
    }
  }, [selectedFrame, navigate]);

  // Calculate scale factor on mount and when frame changes
  useEffect(() => {
    if (!selectedFrame) return;
    // Give a small delay to ensure layout is computed
    const timer = setTimeout(() => {
      calculateScaleFactor();
    }, 100);
    return () => clearTimeout(timer);
  }, [calculateScaleFactor, selectedFrame?.height, selectedFrame?.width]);

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
    printImageData?: string,
  ) => {
    navigate('/photo-filter', {
      state: {
        ...state,
        finalImage: finalImageData,
        printImage: printImageData,
        selectedFrame,
        selectedCaptures,
        useBoomerang: state.useBoomerang || false,
        videoDuration: state.videoDuration, // ส่งต่อ videoDuration
      },
    });
  };

  const generateFinalImage = () => {
    if (!selectedFrame) return;
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

      // Check if we need to duplicate for 4x6 (when machine cannot cut and frame is 2x6)
      // 2x6 frame usually has aspect ratio around 0.33 (2/6)
      const aspectRatio = frameWidth / frameHeight;
      const is2x6 = aspectRatio < 0.4; // Threshold to detect 2x6 strip

      // ALWAYS duplicate if it is 2x6 frame
      // Printer always outputs 4x6 paper, then cuts into two 2x6 strips
      const shouldDuplicate = is2x6;

      console.log('📸 [PhotoDecorate] Frame dimensions:', {
        width: frameWidth,
        height: frameHeight,
        aspectRatio,
      });
      console.log('📸 [PhotoDecorate] Duplication check:', {
        canCut,
        is2x6,
        shouldDuplicate,
      });

      // Always start with single frame dimensions for the main canvas
      canvas.width = frameWidth;
      canvas.height = frameHeight;

      const scaleX = frameWidth / selectedFrame.width;
      const scaleY = frameHeight / selectedFrame.height;

      // Fill with white background first (paper color)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw photos in their assigned slots
      const totalPhotos = Object.keys(photoAssignments).length;

      if (totalPhotos === 0) {
        // No photos assigned, draw frame only
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

        const singleImageData = canvas.toDataURL('image/png');

        if (shouldDuplicate) {
          const doubleCanvas = document.createElement('canvas');
          doubleCanvas.width = frameWidth * 2;
          doubleCanvas.height = frameHeight;
          const dCtx = doubleCanvas.getContext('2d');
          if (dCtx) {
            dCtx.fillStyle = '#ffffff';
            dCtx.fillRect(0, 0, doubleCanvas.width, doubleCanvas.height);
            const img = new Image();
            img.onload = () => {
              dCtx.drawImage(img, 0, 0);
              dCtx.drawImage(img, frameWidth, 0);
              proceedToResult(
                singleImageData,
                [],
                doubleCanvas.toDataURL('image/png'),
              );
            };
            img.src = singleImageData;
          } else {
            proceedToResult(singleImageData, []);
          }
        } else {
          proceedToResult(singleImageData, []);
        }
        return;
      }

      // Prepare slots to draw
      const slotsToDraw = Object.entries(photoAssignments).map(
        ([slotIndex, photoIndex]) => {
          const slot = selectedFrame.slots[parseInt(slotIndex, 10)];
          return {
            slot,
            photoIndex,
            zIndex: slot.zIndex || 0,
          };
        },
      );

      // Sort slots by zIndex (if needed, but we separate them into background/foreground)
      const backgroundSlots = slotsToDraw.filter((s) => s.zIndex < 0);
      const foregroundSlots = slotsToDraw.filter((s) => s.zIndex >= 0);

      const drawSlot = (
        slotData: (typeof slotsToDraw)[0],
        offsetX: number,
        offsetY: number,
      ) => {
        return new Promise<void>((resolve) => {
          const { slot, photoIndex } = slotData;
          const targetX = slot.x * scaleX + offsetX;
          const targetY = slot.y * scaleY + offsetY;
          const targetWidth = slot.width * scaleX;
          const targetHeight = slot.height * scaleY;
          const targetRadius = slot.radius * scaleX; // Scale radius with scaleX
          const rotation = slot.rotate || 0; // Rotation in degrees
          const photoImg = new Image();
          photoImg.crossOrigin = 'anonymous';

          photoImg.onload = () => {
            ctx.save();

            // Apply rotation around center if needed
            if (rotation !== 0) {
              const centerX = targetX + targetWidth / 2;
              const centerY = targetY + targetHeight / 2;
              ctx.translate(centerX, centerY);
              ctx.rotate((rotation * Math.PI) / 180);
              ctx.translate(-centerX, -centerY);
            }

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
        const drawComposition = async (offsetX: number, offsetY: number) => {
          // 1. Draw background slots
          for (const slotData of backgroundSlots) {
            await drawSlot(slotData, offsetX, offsetY);
          }

          // 2. Draw frame
          ctx.drawImage(frameImg, offsetX, offsetY, frameWidth, frameHeight);

          // 3. Draw foreground slots
          for (const slotData of foregroundSlots) {
            await drawSlot(slotData, offsetX, offsetY);
          }
        };

        // Draw single frame
        await drawComposition(0, 0);

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

        const singleImageData = canvas.toDataURL('image/png');

        if (shouldDuplicate) {
          const doubleCanvas = document.createElement('canvas');
          doubleCanvas.width = frameWidth * 2;
          doubleCanvas.height = frameHeight;
          const dCtx = doubleCanvas.getContext('2d');
          if (dCtx) {
            dCtx.fillStyle = '#ffffff';
            dCtx.fillRect(0, 0, doubleCanvas.width, doubleCanvas.height);
            const img = new Image();
            img.onload = () => {
              dCtx.drawImage(img, 0, 0);
              dCtx.drawImage(img, frameWidth, 0);
              proceedToResult(
                singleImageData,
                selectedCaptures,
                doubleCanvas.toDataURL('image/png'),
              );
            };
            img.src = singleImageData;
          } else {
            proceedToResult(singleImageData, selectedCaptures);
          }
        } else {
          proceedToResult(singleImageData, selectedCaptures);
        }
      })();
    };

    frameImg.src = selectedFrame?.image;
  };

  const handleConfirm = () => {
    // Generate final image
    generateFinalImage();
  };

  const handlePhotoClick = (photoIndex: number) => {
    if (!selectedFrame) return;

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
        seconds={COUNTDOWN.PHOTO_DECORATE.DURATION}
        onComplete={handleCountdownComplete}
        visible={COUNTDOWN.PHOTO_DECORATE.VISIBLE}
      />

      {/* Main Layout */}
      <div className="title-section-decorate">
        <h1 className="title-decorate">เลือกรูปของคุณ</h1>
        <p className="subtitle-decorate">Select your photos</p>
      </div>

      <div
        ref={mainRef}
        className={`decorate-main ${isScrolled ? 'scrolled' : ''} ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Left - Frame Preview */}
        <div className="frame-preview-section">
          <div
            ref={containerRef}
            className="frame-preview-container"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: `calc(65vh * ${frameAspectRatio})`,
              aspectRatio: frameAspectRatio,
              isolation: 'isolate',
              backgroundColor: 'transparent',
            }}
          >
            <img
              ref={frameImgRef}
              src={selectedFrame?.image}
              alt="Frame"
              crossOrigin="anonymous"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />
            {previewSlots.map((slot, slotIndex) => {
              // Calculate pixel positions and sizes based on previewSlots dimensions
              // Add imageOffset to account for object-fit: contain positioning
              const slotX = slot.x * scaleFactor.x + imageOffset.x;
              const slotY = slot.y * scaleFactor.y + imageOffset.y;
              const slotWidth = slot.width * scaleFactor.x;
              const slotHeight = slot.height * scaleFactor.y;
              const slotAspectRatio = slot.width / slot.height;
              const scaledRadius = slot.radius * scaleFactor.x; // Scale radius
              const zIndex = slot.zIndex || 0;
              const rotation = slot.rotate || 0; // Rotation in degrees

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
                    transform:
                      rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
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
          disabled={selectedPhotos.length !== selectedFrame?.slots.length}
        >
          ต่อไป
        </button>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
