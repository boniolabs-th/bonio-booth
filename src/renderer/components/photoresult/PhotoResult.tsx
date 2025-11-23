/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import { generateBoomerangAssets } from '../../utils/boomerang';
import {
  getCachedLUT,
  applyLUTToCanvas,
  getLUTFilePath,
} from '../../utils/lutProcessor';

import './PhotoResult.css';

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
  finalImage: string;
  selectedFrame: FrameConfig;
  selectedFilter: string;
  selectedCaptures: Capture[];
  useBoomerang?: boolean;
}

const ensureBoomerangAssets = async (
  captures: Capture[],
  useBoomerang?: boolean,
): Promise<Capture[]> => {
  // If boomerang is not selected, return captures as-is
  if (!useBoomerang) {
    return captures;
  }

  return Promise.all(
    captures.map(async (capture) => {
      if (capture.boomerangFrames?.length && capture.boomerangGif) {
        return capture;
      }

      try {
        const assets = await generateBoomerangAssets(capture.video);
        return {
          ...capture,
          ...assets,
        };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to create boomerang assets', error);
        return capture;
      }
    }),
  );
};

const generateFramedVideo = async (
  captures: Capture[],
  frame: FrameConfig,
  selectedFilterId?: string,
  useBoomerang?: boolean,
): Promise<string> => {
  const loadFrameImage = () =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ไม่สามารถโหลดภาพกรอบได้'));
      img.src = frame.image;
    });

  const loadVideoElement = (capture: Capture, index: number) =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
      const videoElement = document.createElement('video');
      videoElement.src = capture.video;
      videoElement.muted = true;
      videoElement.preload = 'auto';
      videoElement.loop = true;
      videoElement.playsInline = true;

      const timeout = setTimeout(() => {
        reject(new Error(`วิดีโอที่ ${index + 1} ใช้เวลานานเกินไปในการโหลด`));
      }, 10000);

      videoElement.onloadedmetadata = () => {
        clearTimeout(timeout);
        resolve(videoElement);
      };

      videoElement.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`ไม่สามารถโหลดวิดีโอที่ ${index + 1}`));
      };
    });

  const composeBoomerangVideo = async (
    frameImg: HTMLImageElement,
    enrichedCaptures: Capture[],
    selectedFilterId?: string,
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('ไม่สามารถสร้าง canvas context ได้');
    }

    const frameWidth = frameImg.naturalWidth || frame.width;
    const frameHeight = frameImg.naturalHeight || frame.height;

    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const scaleX = frameWidth / frame.width;
    const scaleY = frameHeight / frame.height;

    const loadBoomerangFrames = (capture: Capture, captureIndex: number) => {
      if (!capture.boomerangFrames || capture.boomerangFrames.length === 0) {
        return Promise.reject(
          new Error(
            `เอฟเฟ็กต์ Boomerang ของวิดีโอที่ ${captureIndex + 1} ยังไม่พร้อม`,
          ),
        );
      }

      return Promise.all(
        capture.boomerangFrames.map(
          (frameSrc, frameIndex) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () =>
                reject(
                  new Error(
                    `ไม่สามารถโหลดภาพเอฟเฟ็กต์ที่ ${frameIndex + 1} ของวิดีโอที่ ${captureIndex + 1}`,
                  ),
                );
              img.src = frameSrc;
            }),
        ),
      );
    };

    const boomerangImages = await Promise.all(
      enrichedCaptures.map((capture, index) =>
        loadBoomerangFrames(capture, index),
      ),
    );

    const fps = 12;
    const totalDurationSeconds = 4;
    const totalFrames = fps * totalDurationSeconds;

    return new Promise<string>((resolve, reject) => {
      const stream = canvas.captureStream(fps);

      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm',
        'video/webm;codecs=vp8',
      ];

      const selectedMimeType =
        mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ??
        mimeTypes[0];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 2500000,
      });

      const chunks: Blob[] = [];
      let recording = true;
      let timeoutId: number | null = null;
      let frameCursor = 0;

      const cleanup = () => {
        recording = false;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: selectedMimeType });
        resolve(URL.createObjectURL(blob));
      };

      mediaRecorder.onerror = (event) => {
        cleanup();
        reject(
          event.error ||
            new Error('MediaRecorder เกิดปัญหาในระหว่างสร้างวิดีโอ'),
        );
      };

      const drawFrame = () => {
        if (!recording) {
          return;
        }

        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

        frame.slots.forEach((slot, slotIndex) => {
          const slotFrames = boomerangImages[slotIndex];
          if (!slotFrames || slotFrames.length === 0) {
            return;
          }

          const image = slotFrames[frameCursor % slotFrames.length];
          const imageWidth = image.naturalWidth || image.width;
          const imageHeight = image.naturalHeight || image.height;
          const slotAspect = slot.width / slot.height;
          const imageAspect = imageWidth / imageHeight || 1;

          let sourceWidth = imageWidth;
          let sourceHeight = imageHeight;
          let sourceX = 0;
          let sourceY = 0;

          if (imageAspect > slotAspect) {
            sourceWidth = imageHeight * slotAspect;
            sourceX = (imageWidth - sourceWidth) / 2;
          } else {
            sourceHeight = imageWidth / slotAspect;
            sourceY = (imageHeight - sourceHeight) / 2;
          }

          const targetX = slot.x * scaleX;
          const targetY = slot.y * scaleY;
          const targetWidth = slot.width * scaleX;
          const targetHeight = slot.height * scaleY;

          // Apply filter to boomerang frame before drawing
          ctx.save();
          const filter = FILTERS.find((f) => f.id === selectedFilterId);

          // Use CSS filter for all filter types (including LUT approximation)
          if (filter?.filter) {
            ctx.filter = filter.filter;
          } else if (filter?.type === 'lut') {
            // CSS approximation for LUT filters
            ctx.filter = 'saturate(1.1) contrast(1.05) brightness(1.02)';
          }

          ctx.drawImage(
            image,
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
        });

        frameCursor += 1;
        if (frameCursor >= totalFrames) {
          recording = false;
          mediaRecorder.stop();
          return;
        }

        timeoutId = window.setTimeout(() => {
          drawFrame();
        }, 1000 / fps);
      };

      mediaRecorder.start();
      drawFrame();
    });
  };

  const frameImg = await loadFrameImage();
  const enrichedCaptures = await ensureBoomerangAssets(captures, useBoomerang);

  const hasBoomerangFrames = enrichedCaptures.every(
    (capture) => capture.boomerangFrames && capture.boomerangFrames.length > 0,
  );

  // Only use boomerang if user selected it and frames are available
  if (useBoomerang && hasBoomerangFrames) {
    return composeBoomerangVideo(frameImg, enrichedCaptures, selectedFilterId);
  }

  const videoElements = await Promise.all(
    enrichedCaptures.map((capture, index) => loadVideoElement(capture, index)),
  );

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('ไม่สามารถสร้าง canvas context ได้');
  }

  const frameWidth = frameImg.naturalWidth || frame.width;
  const frameHeight = frameImg.naturalHeight || frame.height;

  canvas.width = frameWidth;
  canvas.height = frameHeight;

  const scaleX = frameWidth / frame.width;
  const scaleY = frameHeight / frame.height;

  videoElements.forEach((video) => {
    // eslint-disable-next-line no-param-reassign
    video.currentTime = 0;
  });

  await Promise.all(
    videoElements.map((video) => video.play().catch(() => undefined)),
  );

  return new Promise<string>((resolve, reject) => {
    const stream = canvas.captureStream(30);

    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm',
      'video/webm;codecs=vp8',
    ];

    const selectedMimeType =
      mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ||
      mimeTypes[0];

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 2500000,
    });

    const chunks: Blob[] = [];
    let animationFrameId: number | null = null;
    const maxDuration = 4;
    const startTime = performance.now();
    let recording = true;

    const cleanup = () => {
      recording = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      stream.getTracks().forEach((track) => track.stop());
      videoElements.forEach((video) => {
        video.pause();
        // eslint-disable-next-line no-param-reassign
        video.src = '';
      });
    };

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      cleanup();
      const blob = new Blob(chunks, { type: selectedMimeType });
      const url = URL.createObjectURL(blob);
      resolve(url);
    };

    mediaRecorder.onerror = (event) => {
      cleanup();
      reject(
        event.error || new Error('MediaRecorder เกิดปัญหาในระหว่างสร้างวิดีโอ'),
      );
    };

    const drawFrame = () => {
      if (!recording) {
        return;
      }

      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= maxDuration) {
        recording = false;
        mediaRecorder.stop();
        return;
      }

      ctx.clearRect(0, 0, frameWidth, frameHeight);
      ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

      frame.slots.forEach((slot, index) => {
        const video = videoElements[index];
        if (!video) {
          return;
        }

        const slotAspect = slot.width / slot.height;
        const videoAspect = video.videoWidth / video.videoHeight || 1;

        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;
        let sourceX = 0;
        let sourceY = 0;

        if (videoAspect > slotAspect) {
          sourceWidth = video.videoHeight * slotAspect;
          sourceX = (video.videoWidth - sourceWidth) / 2;
        } else {
          sourceHeight = video.videoWidth / slotAspect;
          sourceY = (video.videoHeight - sourceHeight) / 2;
        }

        const targetX = slot.x * scaleX;
        const targetY = slot.y * scaleY;
        const targetWidth = slot.width * scaleX;
        const targetHeight = slot.height * scaleY;

        // Apply filter to video before drawing
        ctx.save();
        const filter = FILTERS.find((f) => f.id === selectedFilterId);

        // Use CSS filter for all filter types (including LUT approximation)
        if (filter?.filter) {
          ctx.filter = filter.filter;
        } else if (filter?.type === 'lut') {
          // CSS approximation for LUT filters
          ctx.filter = 'saturate(1.1) contrast(1.05) brightness(1.02)';
        }

        ctx.drawImage(
          video,
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
      });

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    mediaRecorder.start();
    drawFrame();
  });
};

export default function PhotoResult() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [isApplyingLUT, setIsApplyingLUT] = useState(false);
  const hasGeneratedVideo = useRef(false);
  const [previewBoomerangGif, setPreviewBoomerangGif] = useState<string | null>(
    null,
  );

  // Setup preview (boomerang or video based on user choice)
  useEffect(() => {
    const setupPreview = async () => {
      if (!state?.selectedCaptures?.[0]) {
        return;
      }

      const firstCapture = state.selectedCaptures[0];
      const shouldUseBoomerang = state.useBoomerang || false;

      if (shouldUseBoomerang) {
        // Check if boomerang assets already exist
        if (firstCapture.boomerangGif) {
          setPreviewBoomerangGif(firstCapture.boomerangGif);
          return;
        }

        // Generate boomerang assets if not exists
        try {
          const assets = await generateBoomerangAssets(firstCapture.video);
          setPreviewBoomerangGif(assets.boomerangGif);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create boomerang preview:', error);
          // Fallback to video if boomerang generation fails
          setPreviewBoomerangGif(null);
        }
      } else {
        // Use regular video, no boomerang
        setPreviewBoomerangGif(null);
      }
    };

    setupPreview();
  }, [state?.selectedCaptures, state?.useBoomerang]);

  // Create compiled video from selected captures
  useEffect(() => {
    const createFramedVideo = async () => {
      if (!state?.selectedCaptures || state.selectedCaptures.length === 0) {
        return;
      }

      if (!state?.selectedFrame) {
        return;
      }

      if (hasGeneratedVideo.current) {
        return;
      }

      hasGeneratedVideo.current = true;
      setIsCreatingVideo(true);

      try {
        // Create video without filter first (fast)
        const videoUrl = await generateFramedVideo(
          state.selectedCaptures,
          state.selectedFrame,
          undefined, // No filter for initial video
          state.useBoomerang,
        );

        // If LUT filter is selected, apply it via FFmpeg
        const filter = FILTERS.find((f) => f.id === state.selectedFilter);
        // eslint-disable-next-line no-console
        console.log('Filter check:', {
          filterId: state.selectedFilter,
          filter,
          isLUT: filter?.type === 'lut',
          lutFile: filter?.lutFile,
        });

        if (filter?.type === 'lut' && filter.lutFile) {
          setIsApplyingLUT(true);
          // eslint-disable-next-line no-console
          console.log('Applying LUT filter:', filter.lutFile);

          try {
            // Convert blob URL to ArrayBuffer
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            // Save to temp file via IPC (send ArrayBuffer directly)
            const saveResult = await window.electron.video.saveTempVideo(arrayBuffer);

            if (!saveResult.success || !saveResult.path) {
              throw new Error('Failed to save temp video file');
            }

            // Apply LUT via FFmpeg
            let lutResult;
            if (state.useBoomerang) {
              // eslint-disable-next-line no-console
              console.log('Creating boomerang with LUT...');
              lutResult = await window.electron.video.createBoomerangWithLut(
                saveResult.path,
                filter.lutFile,
              );
            } else {
              // eslint-disable-next-line no-console
              console.log('Applying LUT to video...');
              lutResult = await window.electron.video.applyLutToVideo(
                saveResult.path,
                filter.lutFile,
              );
            }

            // eslint-disable-next-line no-console
            console.log('LUT result:', lutResult);

            if (lutResult.success && lutResult.path) {
              // Read the processed file via IPC
              const fileResult = await window.electron.video.readVideoFile(lutResult.path);

              if (fileResult.success && fileResult.data) {
                const processedBlob = new Blob([fileResult.data], { type: 'video/mp4' });
                const processedUrl = URL.createObjectURL(processedBlob);
                setCompiledVideoUrl(processedUrl);

                // Clean up original URL
                URL.revokeObjectURL(videoUrl);
              } else {
                // Fallback to original if read fails
                setCompiledVideoUrl(videoUrl);
              }
            } else {
              // Fallback to original if LUT fails
              setCompiledVideoUrl(videoUrl);
            }
          } catch (lutError) {
            // eslint-disable-next-line no-console
            console.error('Failed to apply LUT via FFmpeg:', lutError);
            // Fallback to original video
            setCompiledVideoUrl(videoUrl);
          } finally {
            setIsApplyingLUT(false);
          }
        } else {
          // No LUT filter or CSS filter - use video as-is
          setCompiledVideoUrl(videoUrl);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error creating framed video:', error);
        // eslint-disable-next-line no-alert
        alert(
          `เกิดข้อผิดพลาดในการสร้างวิดีโอ: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        hasGeneratedVideo.current = false;
      } finally {
        setIsCreatingVideo(false);
      }
    };

    createFramedVideo();
  }, [state?.selectedCaptures, state?.selectedFrame, state?.selectedFilter, state?.useBoomerang]);

  useEffect(() => {
    return () => {
      if (compiledVideoUrl) {
        URL.revokeObjectURL(compiledVideoUrl);
      }
    };
  }, [compiledVideoUrl]);

  // Auto-print when component mounts (เฉพาะเมื่อยังไม่ได้พิมพ์จาก PhotoFilter)
  useEffect(() => {
    const handleAutoPrint = async () => {
      // ถ้าเพิ่งพิมพ์จาก PhotoFilter แล้ว ไม่ต้อง auto-print อีก
      if ((state as any)?.alreadyPrinted) {
        console.log('Skip auto-print: already printed from PhotoFilter');
        setPrintStatus('success');
        return;
      }

      if (!state?.finalImage) {
        setPrintStatus('error');
        return;
      }

      setPrintStatus('printing');

      try {
        // Set up listener for print response
        window.electron?.print?.onPrintResponse((response) => {
          if (response.success) {
            setPrintStatus('success');
          } else {
            setPrintStatus('error');
          }

          // Clean up listener
          window.electron?.print?.removePrintResponseListener();
        });

        // Send print request with frame configuration
        window.electron?.print?.printPhoto({
          imageDataUrl: state.finalImage,
          frameId: state.selectedFrame?.id || 'classic_2x6',
          frameName: state.selectedFrame?.name || '2x6 Classic',
          copies: state.quantity || 1,
        });
      } catch {
        setPrintStatus('error');
      }
    };

    if (state?.finalImage && printStatus === 'idle') {
      handleAutoPrint();
    }
  }, [
    state?.finalImage,
    state?.selectedFrame?.id,
    state?.selectedFrame?.name,
    printStatus,
  ]);

  const handleFinish = () => {
    navigate('/');
  };

  const generateQRCode = () => {
    // Generate QR code for the final image or download link
    // For demo purposes, this would be a placeholder
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTAgMTBoODB2ODBIMTBWMTB6IiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNMjAgMjBoNjB2NjBIMjBWMjB6IiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzAgMzBoNDB2NDBIMzBWMzB6IiBmaWxsPSJibGFjayIvPgo8L3N2Zz4K';
  };

  const handleDownloadGif = () => {
    // Download compiled video
    if (compiledVideoUrl) {
      const link = document.createElement('a');
      link.href = compiledVideoUrl;
      link.download = `bonio-booth-video-${Date.now()}.webm`;
      link.click();
    }
  };

  const getFilterStyle = () => {
    const filter = FILTERS.find((f) => f.id === state.selectedFilter);
    return filter?.filter || '';
  };

  return (
    <div className="photo-result-container">
      {/* Header */}
      <div className="result-header">
        <h1 className="result-title">กำลังพิมพ์รูปภาพ...</h1>
        <p className="result-subtitle">Printing your memory...</p>
      </div>

      {/* Main Layout - Photo Strip Center */}
      <div className="result-main">
        <div className="photo-strip-center">
          {state.finalImage && (
            <img
              src={state.finalImage}
              alt="Final result"
              className="final-result-image"
            />
          )}
        </div>
      </div>

      {/* Bottom Section - Video Preview & QR Code */}
      <div className="result-bottom">
        {/* Left - Video Preview */}
        <div className="video-preview-section">
          {state?.selectedCaptures?.[0] && (
            <>
              <div className="video-preview-container">
                {previewBoomerangGif ? (
                  <img
                    src={previewBoomerangGif}
                    alt="Boomerang preview"
                    className="video-preview"
                    style={{
                      filter: getFilterStyle(),
                    }}
                  />
                ) : state?.selectedCaptures?.[0]?.video ? (
                  <video
                    src={state.selectedCaptures[0].video}
                    className="video-preview"
                    style={{
                      filter: getFilterStyle(),
                    }}
                    loop
                    muted
                    playsInline
                    autoPlay
                  />
                ) : (
                  <div className="video-preview-loading">
                    <div className="loading-spinner" />
                    <p>กำลังโหลดวิดีโอ...</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="download-video-button"
                onClick={handleDownloadGif}
                disabled={!compiledVideoUrl}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="7 10 12 15 17 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="12"
                    y1="15"
                    x2="12"
                    y2="3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                ดาวน์โหลดวิดีโอ
              </button>
            </>
          )}
        </div>

        {/* Right - QR Code & Download */}
        <div className="download-section">
          <div className="download-content">
            <h2 className="download-title">Download GIF File</h2>

            {isCreatingVideo ? (
              <div className="creating-video-message">
                <div className="loading-spinner" />
                <p>กำลังสร้างวิดีโอของคุณ...</p>
              </div>
            ) : isApplyingLUT ? (
              <div className="creating-video-message">
                <div className="loading-spinner" />
                <p>กำลังประมวลผล Filter...</p>
              </div>
            ) : (
              <div className="qr-display">
                <img
                  src={generateQRCode()}
                  alt="QR Code"
                  className="qr-code"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="result-footer">
        <button type="button" className="finish-button" onClick={handleFinish}>
          เสร็จสิ้น
        </button>
      </div>
    </div>
  );
}
