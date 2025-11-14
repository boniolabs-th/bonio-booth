/* eslint-disable jsx-a11y/img-redundant-alt */
/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef } from 'react';
import { FRAME_CONFIGS, FrameConfig } from '../../utils/frameConfig';
import './PhotoDecorate.css';

interface Capture {
  video: string;
  photo: string;
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  captures: Capture[];
}

export default function PhotoDecorate() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedFrame] = useState<FrameConfig>(FRAME_CONFIGS[0]);
  const [photoAssignments, setPhotoAssignments] = useState<{
    [slotIndex: number]: number;
  }>({});
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewSlots = selectedFrame.previewSlots || selectedFrame.slots;
  const frameAspectRatio = selectedFrame.height
    ? selectedFrame.width / selectedFrame.height
    : 1;

  const proceedToResult = (
    finalImageData: string,
    selectedCaptures: Capture[],
  ) => {
    navigate('/photo-result', {
      state: {
        ...state,
        finalImage: finalImageData,
        selectedFrame,
        selectedCaptures,
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
        const targetX = slot.x * scaleX;
        const targetY = slot.y * scaleY;
        const targetWidth = slot.width * scaleX;
        const targetHeight = slot.height * scaleY;
        const photoImg = new Image();

        photoImg.onload = () => {
          ctx.save();

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
      {/* Header */}
      <div className="decorate-header">
        <h1 className="decorate-title">เลือกรูปของคุณ</h1>
        <p className="decorate-subtitle">SELECT YOUR PHOTO</p>
      </div>

      {/* Main Layout */}
      <div className="decorate-main">
        {/* Left - Frame Preview */}
        <div className="frame-preview-section">
          <div
            className="frame-preview-container"
            style={{
              aspectRatio: frameAspectRatio,
              width: '100%',
              maxWidth: '100%',
            }}
          >
            <img
              src={selectedFrame.image}
              alt="Frame"
              className="frame-background-dec"
            />
            {previewSlots.map((slot, slotIndex) => (
              <div
                key={slot.id}
                className="frame-slot-preview"
                style={{
                  position: 'absolute',
                  left: `${(slot.x / selectedFrame.width) * 100}%`,
                  top: `${(slot.y / selectedFrame.height) * 100}%`,
                  width: `${(slot.width / selectedFrame.width) * 100}%`,
                  height: `${(slot.height / selectedFrame.height) * 100}%`,
                }}
              >
                {photoAssignments[slotIndex] !== undefined && (
                  <img
                    src={state.captures[photoAssignments[slotIndex]].photo}
                    alt={`Photo ${slotIndex + 1}`}
                    className="slot-photo"
                  />
                )}
              </div>
            ))}
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
                  <img src={capture.photo} alt={`Photo ${index + 1}`} />
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
