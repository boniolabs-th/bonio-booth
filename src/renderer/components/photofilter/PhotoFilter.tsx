/* eslint-disable jsx-a11y/img-redundant-alt */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import { getCachedLUT, getLUTFilePath } from '../../utils/lutProcessor';
import { applyLUTWithWorker } from '../../utils/lutWorkerHelper';
import { drawPhotoInSlot } from '../../utils/canvasUtils';
import './PhotoFilter.css';
import { Countdown } from '..';

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
  const [isGeneratingPreview, setIsGeneratingPreview] =
    useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [lutThumbnails, setLutThumbnails] = useState<Record<string, string>>(
    {},
  );
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] =
    useState<boolean>(false);
  const [canCut, setCanCut] = useState<boolean>(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const handleCountdownComplete = useCallback(() => {
    console.log(
      '⏰ [PhotoFilter] Countdown completed, auto-navigating to home',
    );
    navigate('/');
  }, [navigate]);

  // Generate LUT preview thumbnails for filter selection
  const generateLutThumbnails = useCallback(async () => {
    if (!state.selectedCaptures?.length) return;

    setIsGeneratingThumbnails(true);
    const thumbnails: Record<string, string> = {};

    // Get LUT filters only
    const lutFilters = FILTERS.filter((f) => f.type === 'lut' && f.lutFile);

    // Create a small thumbnail from the first photo for faster processing
    const createThumbnail = (photoUrl: string): Promise<HTMLCanvasElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Cannot create canvas context'));
            return;
          }
          // Use smaller size for thumbnails (faster processing)
          const maxSize = 200;
          const scale = Math.min(maxSize / img.width, maxSize / img.height);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = photoUrl;
      });
    };

    try {
      // Create thumbnail canvas once
      const thumbnailCanvas = await createThumbnail(
        state.selectedCaptures[0].photo,
      );

      // Process all LUT filters concurrently
      const processFilter = async (
        filter: (typeof lutFilters)[0],
      ): Promise<{ id: string; dataUrl: string } | null> => {
        try {
          // Clone the thumbnail canvas for each filter
          const canvas = document.createElement('canvas');
          canvas.width = thumbnailCanvas.width;
          canvas.height = thumbnailCanvas.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;

          ctx.drawImage(thumbnailCanvas, 0, 0);

          // Apply LUT
          const lutPath = getLUTFilePath(filter.lutFile!);
          const lut = await getCachedLUT(lutPath);
          const processedCanvas = await applyLUTWithWorker(canvas, lut);
          return {
            id: filter.id,
            dataUrl: processedCanvas.toDataURL('image/jpeg', 0.8),
          };
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(
            `Failed to generate thumbnail for ${filter.id}:`,
            error,
          );
          return null;
        }
      };

      // Process all filters concurrently
      const results = await Promise.all(lutFilters.map(processFilter));

      // Build thumbnails object from results
      results.forEach((result) => {
        if (result) {
          thumbnails[result.id] = result.dataUrl;
        }
      });

      setLutThumbnails(thumbnails);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate LUT thumbnails:', error);
    } finally {
      setIsGeneratingThumbnails(false);
    }
  }, [state.selectedCaptures]);

  // Generate LUT thumbnails on mount
  useEffect(() => {
    generateLutThumbnails();
  }, [generateLutThumbnails]);

  // Filter รูปภาพแต่ละรูป (รองรับทั้ง CSS และ LUT)
  const applyFilterToPhoto = async (photoUrl: string): Promise<HTMLCanvasElement> => {
    const filter = FILTERS.find((f) => f.id === selectedFilter);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

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

            resolve(processedCanvas);
          } catch (error) {
            console.error('Failed to apply LUT:', error);
            // Fallback to original
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
          }
        } else {
          // Apply CSS filter (traditional)
          if (filter?.filter) {
            ctx.filter = filter.filter;
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas);
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
      frameImg.crossOrigin = 'anonymous';
      frameImg.onload = async () => {
        const frameWidth = frameImg.naturalWidth || state.selectedFrame.width;
        const frameHeight =
          frameImg.naturalHeight || state.selectedFrame.height;

        canvas.width = frameWidth;
        canvas.height = frameHeight;

        const scaleX = frameWidth / state.selectedFrame.width;
        const scaleY = frameHeight / state.selectedFrame.height;

        // Fill with white background first (paper color)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, frameWidth, frameHeight);

        // Filter และ draw รูปภาพแต่ละรูป
        try {
          // Filter รูปภาพทั้งหมดแบบ Parallel
          const filteredPhotos = await Promise.all(
            state.selectedCaptures.map((capture) =>
              applyFilterToPhoto(capture.photo)
            )
          );

          // Helper function to draw a slot
          const drawSlot = (slot: typeof state.selectedFrame.slots[0], slotIndex: number) => {
            if (slotIndex >= filteredPhotos.length) return;

            const photoCanvas = filteredPhotos[slotIndex];

            ctx.save();

            // Calculate crop dimensions (cover behavior - crop to fit slot)
            const photoAspect = photoCanvas.width / photoCanvas.height;
            const slotAspect = slot.width / slot.height;

            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = photoCanvas.width;
            let sourceHeight = photoCanvas.height;

            if (photoAspect > slotAspect) {
              // Photo is wider - crop sides
              sourceWidth = photoCanvas.height * slotAspect;
              sourceX = (photoCanvas.width - sourceWidth) / 2;
            } else {
              // Photo is taller - crop top/bottom
              sourceHeight = photoCanvas.width / slotAspect;
              sourceY = (photoCanvas.height - sourceHeight) / 2;
            }

            const targetX = slot.x * scaleX;
            const targetY = slot.y * scaleY;
            const targetWidth = slot.width * scaleX;
            const targetHeight = slot.height * scaleY;

            // Draw filtered photo in slot
            ctx.drawImage(
              photoCanvas,
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
          };

          // 1. Draw background slots (zIndex < 0)
          state.selectedFrame.slots.forEach((slot, slotIndex) => {
            if ((slot.zIndex || 0) < 0) {
              drawSlot(slot, slotIndex);
            }
          });

          // 2. Draw frame background
          ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

          // 3. Draw foreground slots (zIndex >= 0)
          state.selectedFrame.slots.forEach((slot, slotIndex) => {
            if ((slot.zIndex || 0) >= 0) {
              drawSlot(slot, slotIndex);
            }
          });

          resolve(canvas.toDataURL('image/png'));
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
      console.log('=== START GENERATING FINAL IMAGE ===');
      // Filter รูปภาพแต่ละรูป แล้วสร้าง finalImage ใหม่ (รูปที่ filter + frame)
      // รอให้ generate เสร็จก่อน
      const filteredFinalImage = await generateFinalImageWithFilteredPhotos();
      console.log('=== FINAL IMAGE GENERATED SUCCESSFULLY ===');

      // Check duplication logic for printing
      let printImage = filteredFinalImage;

      if (state.selectedFrame) {
        const frameWidth = state.selectedFrame.width;
        const frameHeight = state.selectedFrame.height;
        const aspectRatio = frameWidth / frameHeight;
        const is2x6 = aspectRatio < 0.4;

        // ALWAYS duplicate if it is 2x6 frame, because backend always generates 4x6 canvas
        const shouldDuplicate = is2x6;

        console.log('🖨️ [PhotoFilter] Duplication check:', { canCut, is2x6, shouldDuplicate, frameWidth, frameHeight });

        if (shouldDuplicate) {
          console.log('=== DUPLICATING IMAGE FOR PRINT (2x6 -> 4x6) ===');
          const doubleCanvas = document.createElement('canvas');
          doubleCanvas.width = frameWidth * 2;
          doubleCanvas.height = frameHeight;
          const dCtx = doubleCanvas.getContext('2d');
          if (dCtx) {
            dCtx.fillStyle = '#ffffff';
            dCtx.fillRect(0, 0, doubleCanvas.width, doubleCanvas.height);

            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                dCtx.drawImage(img, 0, 0);
                dCtx.drawImage(img, frameWidth, 0);
                printImage = doubleCanvas.toDataURL('image/png');
                resolve();
              };
              img.src = filteredFinalImage;
            });
          }
        }
      }

      // Log image for debugging
      console.log('=== GENERATED FINAL IMAGE ===');
      console.log('Image from generateFinalImageWithFilteredPhotos');
      console.log('Image size:', filteredFinalImage.length, 'characters');
      console.log('Image type:', filteredFinalImage.substring(0, 20)); // Show data:image/...
      console.log(
        'Image preview (first 200 chars):',
        filteredFinalImage.substring(0, 200),
      );
      console.log(
        'Image preview (last 200 chars):',
        filteredFinalImage.substring(filteredFinalImage.length - 200),
      );

      // พิมพ์รูปภาพทันที และรอให้พิมพ์เสร็จก่อนค่อย navigate
      if (window.electron?.print) {
        try {
          setPrintStatus('printing');
          console.log('=== SENDING PRINT REQUEST ===');
          console.log('Frame ID:', state.selectedFrame?.id || 'classic_2x6');
          console.log(
            'Frame Name:',
            state.selectedFrame?.name || '2x6 Classic',
          );
          console.log(
            'Using filteredFinalImage from generateFinalImageWithFilteredPhotos',
          );

          // รอ print response ก่อน navigate
          await new Promise<void>((resolve, reject) => {
            // Set up listener for print response
            window.electron.print.onPrintResponse((response) => {
              console.log('=== PRINT RESPONSE RECEIVED ===', response);
              if (response.success) {
                setPrintStatus('success');
                console.log('พิมพ์สำเร็จ - จะ navigate ไปหน้าต่อไป');
                // Clean up listener
                window.electron?.print?.removePrintResponseListener();
                resolve();
              } else {
                setPrintStatus('error');
                console.error('พิมพ์ไม่สำเร็จ:', response.error);
                // Clean up listener
                window.electron?.print?.removePrintResponseListener();
                // แม้พิมพ์ไม่สำเร็จก็ยัง navigate ไปหน้า result
                resolve();
              }
            });

            // Send print request with frame configuration
            try {
              window.electron.print.printPhoto({
                imageDataUrl: printImage,
                frameId: state.selectedFrame?.id || 'classic_2x6',
                frameName: state.selectedFrame?.name || '2x6 Classic',
                copies: state.quantity || 1,
                orientation: state.selectedFrame?.orientation || 'landscape',
              });
              console.log('Print request sent - waiting for response...');
            } catch (printError) {
              console.error('Error sending print request:', printError);
              window.electron?.print?.removePrintResponseListener();
              reject(printError);
            }
          });

          console.log('=== PRINT PROCESS COMPLETED - NAVIGATING ===');
        } catch (printError) {
          setPrintStatus('error');
          console.error('Error in print process:', printError);
          // แม้เกิด error ก็ยัง navigate ไปหน้า result
        }
      } else {
        console.error('window.electron.print is not available');
        // แม้ไม่มี print function ก็ยัง navigate ไปหน้า result
      }

      // Navigate to photo-result page หลังจาก finalImage generate เสร็จและ print เสร็จแล้ว
      console.log('=== NAVIGATING TO PHOTO RESULT ===');
      navigate('/photo-result', {
        state: {
          ...state,
          finalImage: filteredFinalImage,
          printImage,
          selectedFilter,
          useBoomerang: state.useBoomerang || false,
          alreadyPrinted: true, // บอกว่าเพิ่งพิมพ์แล้ว ไม่ต้อง auto-print อีก
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
      {/* Countdown Timer - นับถอยหลัง 500 วินาที แล้วไปหน้าถัดไปอัตโนมัติ */}
      <Countdown
        seconds={300}
        onComplete={handleCountdownComplete}
        visible={true}
      />

      {/* Main Content */}
      <div className="main-content-filter">
        {/* Row 1: Title (20%) */}
        <div className="row-top">
          <div className="title-section">
            <h1 className="filter-title">ตกแต่งรูปของคุณ</h1>
            <p className="filter-subtitle">DECORATE YOUR PHOTO</p>
          </div>
        </div>

        {/* Row 2: Main Layout (60%) */}
        <div className="row-middle">
          <div className="filter-main">
            {/* Left - Canvas Preview */}
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
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path
                          d="M12 2a10 10 0 0 1 10 10"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <p className="preview-loading-text">
                      กำลังประมวลผล Filter...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right - Filter Selection */}
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

                      // Get thumbnail source - use LUT processed thumbnail if available
                      const getThumbnailSrc = () => {
                        if (filter.type === 'lut' && lutThumbnails[filter.id]) {
                          return lutThumbnails[filter.id];
                        }
                        return state.selectedCaptures[0].photo;
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
                            {filter.type === 'lut' &&
                            !lutThumbnails[filter.id] &&
                            isGeneratingThumbnails ? (
                              <div className="lut-thumbnail-loading">
                                <div className="lut-thumbnail-spinner" />
                              </div>
                            ) : (
                              <img
                                src={getThumbnailSrc()}
                                alt={filter.name}
                                style={{ filter: getFilterStyle(filter.id) }}
                              />
                            )}
                            {filter.type === 'lut' && (
                              <div className="lut-badge">LUT</div>
                            )}
                          </div>
                          <div className="filter-preview-name">
                            {filter.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Button (20%) */}
        <div className="row-bottom">
          <button
            type="button"
            className="next-button-filter"
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
            {isProcessing
              ? 'กำลังประมวลผล...'
              : printStatus === 'printing'
                ? 'กำลังพิมพ์...'
                : printStatus === 'success'
                  ? 'พิมพ์สำเร็จ ✓'
                  : printStatus === 'error'
                    ? 'พิมพ์ไม่สำเร็จ ✗'
                    : 'พิมพ์รูปภาพ'}
          </button>
        </div>
      </div>

      {/* Hidden canvas for applying filter */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
