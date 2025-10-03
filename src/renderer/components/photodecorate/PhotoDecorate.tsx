/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef } from 'react';
import { Header } from '..';
import { FRAME_CONFIGS, FILTERS, FrameConfig } from '../../utils/frameConfig';
import './PhotoDecorate.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  photos: string[];
  videoData: string;
}

export default function PhotoDecorate() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [activeTab, setActiveTab] = useState<'frame' | 'filter'>('frame');
  const [selectedFrame, setSelectedFrame] = useState<FrameConfig>(
    FRAME_CONFIGS[0],
  );
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [photoAssignments, setPhotoAssignments] = useState<{
    [slotIndex: number]: number;
  }>({});
  const [draggedPhoto, setDraggedPhoto] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleReset = () => {
    navigate('/main-shooting', { state });
  };

  const handleConfirm = () => {
    // Generate final image
    generateFinalImage();
  };

  const generateFinalImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on frame configuration (300 DPI for print quality)
    canvas.width = selectedFrame.width;
    canvas.height = selectedFrame.height;

    // Create the final composite image
    const frameImg = new Image();
    frameImg.onload = () => {
      // Draw frame first
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      // Draw photos in their assigned slots
      let loadedPhotos = 0;
      const totalPhotos = Object.keys(photoAssignments).length;

      if (totalPhotos === 0) {
        // No photos assigned, just proceed
        proceedToResult(canvas.toDataURL('image/jpeg'));
        return;
      }

      Object.entries(photoAssignments).forEach(([slotIndex, photoIndex]) => {
        const slot = selectedFrame.slots[parseInt(slotIndex, 10)];
        const photoImg = new Image();

        photoImg.onload = () => {
          ctx.save();

          // Apply filter if selected
          if (selectedFilter.filter) {
            ctx.filter = selectedFilter.filter;
          }

          // Draw photo in slot
          ctx.drawImage(
            photoImg,
            slot.x,
            slot.y,
            slot.width + 3,
            slot.height + 6,
          );

          ctx.restore();

          loadedPhotos += 1;
          if (loadedPhotos === totalPhotos) {
            proceedToResult(canvas.toDataURL('image/jpeg'));
          }
        };

        photoImg.src = state.photos[photoIndex];
      });
    };

    frameImg.src = selectedFrame.image;
  };

  const proceedToResult = (finalImageData: string) => {
    navigate('/photo-result', {
      state: {
        ...state,
        finalImage: finalImageData,
        selectedFrame: selectedFrame.name,
        selectedFilter: selectedFilter.name,
      },
    });
  };

  const handleDragStart = (photoIndex: number) => {
    setDraggedPhoto(photoIndex);
  };

  const handleDrop = (slotIndex: number) => {
    if (draggedPhoto !== null) {
      setPhotoAssignments((prev) => ({
        ...prev,
        [slotIndex]: draggedPhoto,
      }));
      setDraggedPhoto(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="photo-decorate-container">
      {/* Header */}
      {/* <Header showLogo /> */}

      {/* Main Content */}
      <div className="main-content">
        <div className="decoration-layout">
          {/* Left Panel - Tools */}
          <div className="tools-panel">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'frame' ? 'active' : ''}`}
                onClick={() => setActiveTab('frame')}
              >
                Frames
              </button>
              <button
                className={`tab ${activeTab === 'filter' ? 'active' : ''}`}
                onClick={() => setActiveTab('filter')}
              >
                Filters
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'frame' && (
                <div className="frames-grid">
                  {FRAME_CONFIGS.map((frame) => (
                    <div
                      key={frame.id}
                      className={`frame-option ${selectedFrame.id === frame.id ? 'selected' : ''}`}
                      onClick={() => setSelectedFrame(frame)}
                    >
                      <img src={frame.image} alt={frame.name} />
                      <span>{frame.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'filter' && (
                <div className="filters-grid">
                  {FILTERS.map((filter) => (
                    <div
                      key={filter.id}
                      className={`filter-option ${selectedFilter.id === filter.id ? 'selected' : ''}`}
                      onClick={() => setSelectedFilter(filter)}
                    >
                      <div
                        className="filter-preview"
                        style={{
                          filter: filter.filter,
                          backgroundImage: state.photos[0]
                            ? `url(${state.photos[0]})`
                            : 'none',
                        }}
                      />
                      <span>{filter.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="preview-panel">
            <div className="preview-container">
              {/* Frame with photo slots */}
              <div className="frame-preview">
                <img
                  src={selectedFrame.image}
                  alt="Frame"
                  className="frame-image"
                />

                {selectedFrame.slots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className="photo-slot"
                    style={{
                      left: `${(slot.x / selectedFrame.width) * 4.3 * 100}%`,
                      top: `${(slot.y / selectedFrame.height) * 100}%`,
                      width: `${(slot.width / selectedFrame.width / 2) * 100}%`,
                      height: `${(slot.height / selectedFrame.height) * 100}%`,
                    }}
                    onDrop={() => handleDrop(index)}
                    onDragOver={handleDragOver}
                  >
                    {photoAssignments[index] !== undefined ? (
                      <img
                        src={state.photos[photoAssignments[index]]}
                        alt={`Slot ${index + 1}`}
                        className="slot-photo"
                        style={{ filter: selectedFilter.filter }}
                      />
                    ) : (
                      <div className="empty-slot">Drag photo here</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Available Photos */}
              <div className="available-photos">
                <h3>Your Photos</h3>
                <div className="photos-list">
                  {state.photos &&
                    state.photos.map((photo, index) => (
                      <div
                        key={photo}
                        className="draggable-photo"
                        draggable
                        onDragStart={() => handleDragStart(index)}
                      >
                        <img src={photo} alt={`Captured ${index + 1}`} />
                        <div className="photo-label">{index + 1}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button type="button" className="reset-button" onClick={handleReset}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 3v5h-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Reset
          </button>

          <button
            type="button"
            className="confirm-button"
            onClick={handleConfirm}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 2a1 1 0 000 2h11a1 1 0 100-2H9z"
                fill="currentColor"
              />
              <path
                d="M3 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zM5 10a1 1 0 011-1h12a1 1 0 110 2H6a1 1 0 01-1-1z"
                fill="currentColor"
              />
            </svg>
            Confirm
          </button>
        </div>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
