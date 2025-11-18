/* eslint-disable jsx-a11y/img-redundant-alt */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import { getCachedLUT, getLUTFilePath } from '../../utils/lutProcessor';
import { applyLUTWithWorker } from '../../utils/lutWorkerHelper';
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
  useBoomerang?: boolean;
}

export default function PhotoFilter() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [selectedFilter, setSelectedFilter] = useState<string>('none');
  const [previewImage, setPreviewImage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Filter รูปภาพแต่ละรูป (รองรับทั้ง CSS และ LUT)
  const applyFilterToPhoto = async (photoUrl: string): Promise<string> => {
    const filter = FILTERS.find((f) => f.id === selectedFilter);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('ไม่สามารถสร้าง canvas context ได้'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        // Check filter type
        if (filter?.type === 'lut' && filter.lutFile) {
          // Apply LUT filter using Web Worker (non-blocking)
          try {
            // Draw image to canvas first
            ctx.drawImage(img, 0, 0);

            // Load and apply LUT in background thread
            const lutPath = getLUTFilePath(filter.lutFile);
            const lut = await getCachedLUT(lutPath);
            const processedCanvas = await applyLUTWithWorker(canvas, lut);

            resolve(processedCanvas.toDataURL('image/png'));
          } catch (error) {
            console.error('Failed to apply LUT:', error);
            // Fallback to original
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          }
        } else {
          // Apply CSS filter (traditional)
          if (filter?.filter) {
            ctx.filter = filter.filter;
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        }
      };

      img.onerror = () => {
        reject(new Error('ไม่สามารถโหลดรูปภาพได้'));
      };

      img.src = photoUrl;
    });
  };

  // สร้าง finalImage ใหม่โดยใช้รูปที่ filter แล้ว + frame
  const generateFinalImageWithFilteredPhotos = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!state.selectedFrame || !state.selectedCaptures.length) {
        reject(new Error('ไม่มี frame หรือรูปภาพ'));
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('ไม่สามารถสร้าง canvas context ได้'));
        return;
      }

      // Load frame image
      const frameImg = new Image();
      frameImg.onload = async () => {
        const frameWidth = frameImg.naturalWidth || state.selectedFrame.width;
        const frameHeight =
          frameImg.naturalHeight || state.selectedFrame.height;

        canvas.width = frameWidth;
        canvas.height = frameHeight;

        const scaleX = frameWidth / state.selectedFrame.width;
        const scaleY = frameHeight / state.selectedFrame.height;

        // Draw frame background
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

        // Filter และ draw รูปภาพแต่ละรูป
        try {
          const filteredPhotos: string[] = [];

          // Filter รูปภาพทั้งหมด
          for (let i = 0; i < state.selectedCaptures.length; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            const filteredPhoto = await applyFilterToPhoto(
              state.selectedCaptures[i].photo,
            );
            filteredPhotos.push(filteredPhoto);
          }

          // Draw รูปภาพที่ filter แล้วเข้าไปใน frame
          let loadedPhotos = 0;
          const totalPhotos = state.selectedFrame.slots.length;

          state.selectedFrame.slots.forEach((slot, slotIndex) => {
            if (slotIndex >= filteredPhotos.length) {
              loadedPhotos += 1;
              if (loadedPhotos === totalPhotos) {
                resolve(canvas.toDataURL('image/png'));
              }
              return;
            }

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

              const targetX = slot.x * scaleX;
              const targetY = slot.y * scaleY;
              const targetWidth = slot.width * scaleX;
              const targetHeight = slot.height * scaleY;

              // Draw filtered photo in slot
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
                resolve(canvas.toDataURL('image/png'));
              }
            };

            photoImg.onerror = () => {
              loadedPhotos += 1;
              if (loadedPhotos === totalPhotos) {
                resolve(canvas.toDataURL('image/png'));
              }
            };

            photoImg.src = filteredPhotos[slotIndex];
          });
        } catch (error) {
          reject(error);
        }
      };

      frameImg.onerror = () => {
        reject(new Error('ไม่สามารถโหลด frame image ได้'));
      };

      frameImg.src = state.selectedFrame.image;
    });
  };

  const handlePrint = async () => {
    setIsProcessing(true);
    try {
      // Filter รูปภาพแต่ละรูป แล้วสร้าง finalImage ใหม่ (รูปที่ filter + frame)
      const filteredFinalImage = await generateFinalImageWithFilteredPhotos();

      navigate('/photo-result', {
        state: {
          ...state,
          finalImage: filteredFinalImage,
          selectedFilter,
          useBoomerang: state.useBoomerang || false,
        },
      });
    } catch (error) {
      // ถ้าเกิด error ให้ใช้ finalImage เดิม
      console.error('Error applying filter:', error);
      navigate('/photo-result', {
        state: {
          ...state,
          selectedFilter,
        },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
  };

  const handleFilterClick = (filterId: string) => {
    setSelectedFilter(filterId);
  };

  // สร้าง preview ของ finalImage ที่มี filter applied กับรูปภาพใน frame
  const generatePreview = async () => {
    if (
      !state.finalImage ||
      !state.selectedFrame ||
      !state.selectedCaptures.length
    ) {
      setPreviewImage(state.finalImage || '');
      return;
    }

    setIsGeneratingPreview(true);
    try {
      const preview = await generateFinalImageWithFilteredPhotos();
      setPreviewImage(preview);
    } catch (error) {
      console.error('Error generating preview:', error);
      setPreviewImage(state.finalImage);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  // Update preview when filter changes or component mounts
  useEffect(() => {
    generatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilter]);

  // Initial preview on mount
  useEffect(() => {
    if (state.finalImage && !previewImage) {
      setPreviewImage(state.finalImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <div className="canvas-section">
          <div className="canvas-container">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Photo with frame preview"
                className="canvas-image"
              />
            ) : state.finalImage ? (
              <img
                src={state.finalImage}
                alt="Photo with frame"
                className="canvas-image"
              />
            ) : null}
            {isGeneratingPreview && (
              <div className="preview-loading-overlay">
                <div className="preview-spinner">
                  <svg
                    width="60"
                    height="60"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      strokeOpacity="0.25"
                    />
                    <path
                      d="M12 2a10 10 0 0 1 10 10"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="preview-loading-text">กำลังประมวลผล Filter...</p>
              </div>
            )}
          </div>
        </div>
        {/* Right - Canvas Area */}
        <div className="photo-strip-section">
          {/* Filter Preview Section */}
          {state.selectedCaptures.length > 0 && (
            <div className="filter-preview-section">
              <div className="filter-preview-title">เลือก Filter</div>
              <div className="filter-preview-grid">
                {FILTERS.map((filter) => {
                  const getFilterStyle = (filterId: string) => {
                    const f = FILTERS.find((fl) => fl.id === filterId);
                    // Only return CSS filter (LUT preview handled separately)
                    if (f?.type === 'css') {
                      return f?.filter || '';
                    }
                    return '';
                  };

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      className={`filter-preview-item ${
                        selectedFilter === filter.id ? 'active' : ''
                      }`}
                      onClick={() => handleFilterClick(filter.id)}
                    >
                      <div className="filter-preview-image">
                        <img
                          src={state.selectedCaptures[0].photo}
                          alt={filter.name}
                          style={{ filter: getFilterStyle(filter.id) }}
                        />
                        {filter.type === 'lut' && (
                          <div className="lut-badge">LUT</div>
                        )}
                      </div>
                      <div className="filter-preview-name">{filter.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Button */}
      <div className="filter-footer">
        <button
          type="button"
          className="print-button"
          onClick={handlePrint}
          disabled={isProcessing}
        >
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
          {isProcessing ? 'กำลังประมวลผล...' : 'พิมพ์รูปภาพ'}
        </button>
      </div>

      {/* Hidden canvas for applying filter */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
