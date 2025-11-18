/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { FrameConfig } from '../../utils/frameConfig';
import { generateBoomerangAssets } from '../../utils/boomerang';
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
}

const ensureBoomerangAssets = async (
  captures: Capture[],
): Promise<Capture[]> => {
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
  const enrichedCaptures = await ensureBoomerangAssets(captures);

  const hasBoomerangFrames = enrichedCaptures.every(
    (capture) => capture.boomerangFrames && capture.boomerangFrames.length > 0,
  );

  if (hasBoomerangFrames) {
    return composeBoomerangVideo(frameImg, enrichedCaptures);
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
  const hasGeneratedVideo = useRef(false);

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
        const url = await generateFramedVideo(
          state.selectedCaptures,
          state.selectedFrame,
        );
        setCompiledVideoUrl(url);
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
  }, [state?.selectedCaptures, state?.selectedFrame]);

  useEffect(() => {
    return () => {
      if (compiledVideoUrl) {
        URL.revokeObjectURL(compiledVideoUrl);
      }
    };
  }, [compiledVideoUrl]);

  // Auto-print when component mounts
  useEffect(() => {
    const handleAutoPrint = async () => {
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

  return (
    <div className="photo-result-container">
      {/* Header */}
      <div className="result-header">
        <h1 className="result-title">รูปถ่ายของคุณ</h1>
        <p className="result-subtitle">YOUR PHOTO</p>
      </div>

      {/* Main Layout */}
      <div className="result-main">
        {/* Left - Frame with Photos */}
        <div className="frame-display-section">
          <div className="frame-display-container">
            {state.finalImage && (
              <img
                src={state.finalImage}
                alt="Final result"
                className="final-result-image"
              />
            )}
          </div>
        </div>

        {/* Right - QR Code & Download */}
        <div className="download-section">
          <div className="download-content">
            <h2 className="download-title">ดาวน์โหลดวิดีโอ</h2>
            <p className="download-subtitle">DOWNLOAD YOUR VIDEO</p>

            {isCreatingVideo ? (
              <div className="creating-video-message">
                <div className="loading-spinner" />
                <p>กำลังสร้างวิดีโอของคุณ...</p>
              </div>
            ) : (
              <>
                <div className="qr-display">
                  <img
                    src={generateQRCode()}
                    alt="QR Code"
                    className="qr-code"
                  />
                  <p className="qr-instruction">สแกน QR Code เพื่อดาวน์โหลด</p>
                </div>

                <div className="download-actions">
                  <button
                    type="button"
                    className="download-button"
                    onClick={handleDownloadGif}
                    disabled={!compiledVideoUrl}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
                </div>
              </>
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
