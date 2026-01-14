/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import { generateBoomerangAssets } from '../../utils/boomerang';
import {
  getCachedLUT,
  applyLUTToCanvas,
  getLUTFilePath,
} from '../../utils/lutProcessor';
import { applyLUTWithWorker } from '../../utils/lutWorkerHelper';
import { COUNTDOWN } from '../../utils/appConfig';

import './PhotoResult.css';
import BackButton from '../backbutton';
import Countdown from '../countdown';

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
  videoDuration?: number; // Duration in seconds from MainShooting
  transactionId?: string; // transactionId จาก payment/create response
  referenceId?: string; // mchOrderNo จาก payment/create response
  paymentDetailsId?: string;
  orderId?: string;
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

/**
 * Apply filter to a photo (supports both CSS and LUT filters)
 * Returns base64 data URL of the filtered image
 */
const applyFilterToPhoto = async (
  photoUrl: string,
  selectedFilterId: string,
): Promise<string> => {
  const filter = FILTERS.find((f) => f.id === selectedFilterId);

  // If no filter or 'none' filter, return original
  if (!filter || selectedFilterId === 'none') {
    return photoUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Cannot create canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;

      // Check filter type
      if (filter.type === 'lut' && filter.lutFile) {
        // Apply LUT filter using Web Worker (non-blocking)
        try {
          // Draw image to canvas first
          ctx.drawImage(img, 0, 0);

          // Load and apply LUT in background thread
          const lutPath = await getLUTFilePath(filter.lutFile);
          const lut = await getCachedLUT(lutPath);
          const processedCanvas = await applyLUTWithWorker(canvas, lut);

          resolve(processedCanvas.toDataURL('image/png'));
        } catch (error) {
          console.error('Failed to apply LUT:', error);
          // Fallback to original
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        }
      } else if (filter.type === 'css' && filter.filter) {
        // Apply CSS filter
        ctx.filter = filter.filter;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        // No filter to apply
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for filtering'));
    };

    img.src = photoUrl;
  });
};

const generateFramedVideo = async (
  captures: Capture[],
  frame: FrameConfig,
  selectedFilterId?: string,
  useBoomerang?: boolean,
  isLutFilterApplied?: boolean, // Flag to indicate if LUT filter is already applied
  videoDuration?: number, // Duration in seconds from MainShooting (WebM doesn't have duration metadata)
): Promise<string> => {
  const loadFrameImage = () =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ไม่สามารถโหลดภาพกรอบได้'));
      img.src = frame.image;
    });

  const loadVideoElement = (capture: Capture, index: number) =>
    new Promise<HTMLVideoElement>((resolve, reject) => {
      const videoElement = document.createElement('video');
      videoElement.crossOrigin = 'anonymous';
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
    isLutFilterApplied?: boolean, // Flag to indicate if LUT filter is already applied
    boomerangVideoDuration?: number, // Duration in seconds
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

    // Fill with white background first (paper color)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, frameWidth, frameHeight);

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
    // ใช้ videoDuration ถ้ามี หรือ fallback เป็น 4 วินาที
    // Loop วิดีโอ 3 รอบ (เช่น countdown 5 วิ x 3 = 15 วินาที)
    const singleLoopDuration = boomerangVideoDuration || 4;
    const loopCount = 3;
    const totalDurationSeconds = singleLoopDuration * loopCount;
    const totalFrames = fps * totalDurationSeconds;

    return new Promise<string>((resolve, reject) => {
      const stream = canvas.captureStream(fps);

      const mimeTypes = [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm',
      ];

      const selectedMimeType =
        mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ??
        mimeTypes[0];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 8000000, // 10 Mbps for high quality
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

        // Fill with white background first (paper color)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, frameWidth, frameHeight);

        const drawSlot = (slot: (typeof frame.slots)[0], slotIndex: number) => {
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
          const rotation = slot.rotate || 0; // Rotation in degrees

          // Apply filter to boomerang frame before drawing
          // Only apply CSS filters here, LUT filters should be applied to source video
          ctx.save();

          // Apply rotation around center if needed
          if (rotation !== 0) {
            const centerX = targetX + targetWidth / 2;
            const centerY = targetY + targetHeight / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate((rotation * Math.PI) / 180);
            ctx.translate(-centerX, -centerY);
          }

          if (!isLutFilterApplied && selectedFilterId) {
            const filter = FILTERS.find((f) => f.id === selectedFilterId);
            // Only apply CSS filters, LUT filters are already applied to source
            if (filter?.type === 'css' && filter?.filter) {
              ctx.filter = filter.filter;
            }
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
        };

        // 1. Draw background slots (zIndex < 0)
        frame.slots.forEach((slot, slotIndex) => {
          if ((slot.zIndex || 0) < 0) {
            drawSlot(slot, slotIndex);
          }
        });

        // 2. Draw frame
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

        // 3. Draw foreground slots (zIndex >= 0)
        frame.slots.forEach((slot, slotIndex) => {
          if ((slot.zIndex || 0) >= 0) {
            drawSlot(slot, slotIndex);
          }
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
    return composeBoomerangVideo(
      frameImg,
      enrichedCaptures,
      selectedFilterId,
      isLutFilterApplied,
      videoDuration,
    );
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

  // Fill with white background first (paper color)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, frameWidth, frameHeight);

  videoElements.forEach((video) => {
    // eslint-disable-next-line no-param-reassign
    video.currentTime = 0;
  });

  await Promise.all(
    videoElements.map((video) => video.play().catch(() => undefined)),
  );

  // ใช้ videoDuration ที่ส่งมาจาก MainShooting (เพราะ WebM ไม่มี duration metadata)
  // Loop วิดีโอ 3 รอบ (เช่น countdown 5 วิ x 3 = 15 วินาที)
  const singleLoopDuration = videoDuration || 6; // fallback 6 seconds
  const loopCount = 3;
  const maxDuration = singleLoopDuration * loopCount;

  return new Promise<string>((resolve, reject) => {
    const stream = canvas.captureStream(30);

    const mimeTypes = [
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm',
    ];

    const selectedMimeType =
      mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ||
      mimeTypes[0];

    console.log('🎬 [generateFramedVideo] Using codec:', selectedMimeType);

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 8000000, // 10 Mbps for high quality
    });

    const chunks: Blob[] = [];
    let animationFrameId: number | null = null;
    // maxDuration คำนวณจากความยาววิดีโอต้นฉบับแล้ว (ด้านบน)
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

      // Fill with white background first (paper color)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, frameWidth, frameHeight);

      const drawSlot = (slot: (typeof frame.slots)[0], index: number) => {
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
        const rotation = slot.rotate || 0; // Rotation in degrees

        // Apply filter to video before drawing
        // Only apply CSS filters here, LUT filters should be applied to source video
        ctx.save();

        // Apply rotation around center if needed
        if (rotation !== 0) {
          const centerX = targetX + targetWidth / 2;
          const centerY = targetY + targetHeight / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        if (!isLutFilterApplied && selectedFilterId) {
          const filter = FILTERS.find((f) => f.id === selectedFilterId);
          // Only apply CSS filters, LUT filters are already applied to source
          if (filter?.type === 'css' && filter?.filter) {
            ctx.filter = filter.filter;
          }
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
      };

      // 1. Draw background slots (zIndex < 0)
      frame.slots.forEach((slot, index) => {
        if ((slot.zIndex || 0) < 0) {
          drawSlot(slot, index);
        }
      });

      // 2. Draw frame
      ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);

      // 3. Draw foreground slots (zIndex >= 0)
      frame.slots.forEach((slot, index) => {
        if ((slot.zIndex || 0) >= 0) {
          drawSlot(slot, index);
        }
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
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [qrcodeStorageUrl, setQrcodeStorageUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null); // เก็บ sessionId สำหรับ upload files
  const [isUploading, setIsUploading] = useState(false);
  const hasUploaded = useRef(false); // ป้องกันการ upload ซ้ำ
  const hasCreatedSession = useRef(false); // ป้องกันการสร้าง session ซ้ำ

  // สร้าง photo session ทันทีเมื่อมี transactionId (เพื่อรับ qrcodeStorageUrl ทันที)
  useEffect(() => {
    if (state?.transactionId && !hasCreatedSession.current) {
      const createSession = async () => {
        try {
          hasCreatedSession.current = true;
          console.log(
            '📸 [PhotoResult] Creating photo session to get QR code URL immediately...',
          );

          // Format transaction code (optional)
          const transactionCode = state.referenceId
            ? state.referenceId.startsWith('TXN-')
              ? state.referenceId
              : `TXN-${state.referenceId}`
            : undefined;

          const sessionResult =
            await window.electron.payment.createPhotoSession(
              state.transactionId,
              transactionCode,
            );

          if (sessionResult.success && sessionResult.qrcodeStorageUrl) {
            console.log(
              '✅ [PhotoResult] Photo session created! QR Code URL:',
              sessionResult.qrcodeStorageUrl,
            );
            // Set state ทันทีเพื่อให้ QR code แสดงได้เลย
            setQrcodeStorageUrl(sessionResult.qrcodeStorageUrl);
            setSessionId(sessionResult.photoSession.id);
            console.log(
              '✅ [PhotoResult] Session ID:',
              sessionResult.photoSession.id,
            );
            console.log(
              '✅ [PhotoResult] QR code should be visible now!',
            );
          } else {
            console.error(
              '❌ [PhotoResult] Failed to create photo session:',
              sessionResult.error || sessionResult.message,
            );
            hasCreatedSession.current = false; // Reset เพื่อให้ลองใหม่ได้
          }
        } catch (error) {
          console.error(
            '❌ [PhotoResult] Error creating photo session:',
            error,
          );
          hasCreatedSession.current = false; // Reset เพื่อให้ลองใหม่ได้
        }
      };

      createSession();
    }
  }, [state?.transactionId, state?.referenceId]);

  // Log เมื่อ compiledVideoUrl เปลี่ยน และ trigger upload ถ้าพร้อม
  useEffect(() => {
    if (compiledVideoUrl) {
      console.log('✅ [PhotoResult] compiledVideoUrl SET:', {
        url: compiledVideoUrl.substring(0, 50),
        length: compiledVideoUrl.length,
        timestamp: new Date().toISOString(),
      });

      // ถ้ามี compiledVideoUrl และยังไม่ได้ upload และมีข้อมูลครบ ให้ trigger upload
      if (
        state?.finalImage &&
        state?.referenceId &&
        state?.transactionId &&
        !hasUploaded.current
      ) {
        console.log(
          '🔄 [PhotoResult] Video ready, will trigger upload in main useEffect',
        );
        // ไม่ต้อง trigger ที่นี่ เพราะ main useEffect จะ trigger อัตโนมัติเมื่อ compiledVideoUrl เปลี่ยน
      }
    } else {
      console.log('⚠️ [PhotoResult] compiledVideoUrl is NULL');
    }
  }, [
    compiledVideoUrl,
    state?.finalImage,
    state?.referenceId,
    state?.transactionId,
  ]);
  const [orientationLog, setOrientationLog] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gifImageRef = useRef<HTMLImageElement | null>(null);

  // Ensure video loops continuously
  useEffect(() => {
    const video = videoRef.current;
    const videoUrl = state?.selectedCaptures?.[0]?.video;

    if (video && videoUrl && !previewBoomerangGif) {
      const handleEnded = () => {
        video.currentTime = 0;
        video.play().catch(() => {
          // Ignore play errors
        });
      };

      video.addEventListener('ended', handleEnded);
      // Ensure loop attribute is set
      video.loop = true;

      return () => {
        video.removeEventListener('ended', handleEnded);
      };
    }

    return undefined;
  }, [state?.selectedCaptures, previewBoomerangGif]);

  // Ensure GIF loops continuously by reloading it
  useEffect(() => {
    const img = gifImageRef.current;
    if (img && previewBoomerangGif) {
      // Set up interval to reload GIF periodically to ensure it loops
      const interval = setInterval(() => {
        if (img.complete) {
          const currentSrc = img.src;
          img.src = '';
          setTimeout(() => {
            img.src = currentSrc;
          }, 10);
        }
      }, 2000); // Reload every 2 seconds (adjust based on GIF duration)

      return () => {
        clearInterval(interval);
      };
    }

    return undefined;
  }, [previewBoomerangGif]);

  // Prevent invalid previewBoomerangGif values
  useEffect(() => {
    if (
      previewBoomerangGif &&
      (previewBoomerangGif === 'http://localhost:1212/index.html' ||
        !previewBoomerangGif.startsWith('data:'))
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️ [PhotoResult] Invalid previewBoomerangGif detected, resetting:',
        previewBoomerangGif,
      );
      setPreviewBoomerangGif(null);
    }
  }, [previewBoomerangGif]);

  // Log orientation when component mounts
  useEffect(() => {
    const loadOrientationLog = async () => {
      if (state?.selectedFrame) {
        const orientation = state.selectedFrame.orientation || 'unknown';
        const frameName =
          state.selectedFrame.name || state.selectedFrame.id || 'unknown';
        const frameId = state.selectedFrame.id || 'unknown';
        const width = state.selectedFrame.width || 0;
        const height = state.selectedFrame.height || 0;

        // โหลด paper position config
        let paperPositionConfig = null;
        try {
          // @ts-ignore
          const result =
            await window.electron?.payment?.getPaperPositionConfig();
          if (result?.success && result.config) {
            paperPositionConfig = result.config;
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            '❌ [PhotoResult] Failed to load paper position config:',
            err,
          );
        }

        // คำนวณ typeTransform จาก paperPositionConfig.type
        let typeTransform = 'unknown';
        if (paperPositionConfig) {
          typeTransform =
            paperPositionConfig.type === 1 ? 'landscape' : 'portrait';
        }

        // คำนวณ transform (ตาม logic ใน main.ts)
        // transform: ${orientation === typeTransform ? 'none' : 'rotate(90deg)'}
        const transform =
          orientation === typeTransform ? 'none' : 'rotate(90deg)';

        // สร้าง log text
        let logText = `🖨️ PRINT ORIENTATION: ${orientation.toUpperCase()}\n`;
        logText += `Frame: ${frameName}\n`;
        logText += `ID: ${frameId}\n`;
        logText += `Size: ${width}x${height}\n`;
        logText += `Type Transform: ${typeTransform}\n`;
        logText += `Transform: ${transform}\n`;

        if (paperPositionConfig) {
          logText += `\n📐 Paper Position Config:\n`;
          logText += `Type: ${paperPositionConfig.type} (${typeTransform})\n`;
          logText += `Landscape Width: ${paperPositionConfig.landscapeWidth}%\n`;
          logText += `Landscape Height: ${paperPositionConfig.landscapeHeight}%\n`;
          logText += `Portrait Width: ${paperPositionConfig.portraitWidth}%\n`;
          logText += `Portrait Height: ${paperPositionConfig.portraitHeight}%`;
        } else {
          logText += `\n⚠️ Paper Position Config: Not loaded`;
        }

        console.log('🖨️ [PhotoResult] Orientation Log:', {
          orientation,
          frameName,
          frameId,
          width,
          height,
          typeTransform,
          transform,
          paperPositionConfig,
        });
        setOrientationLog(logText);
      } else {
        setOrientationLog('⚠️ No frame selected');
      }
    };

    loadOrientationLog();
  }, [state?.selectedFrame]);

  // Setup preview (boomerang or video based on user choice)
  useEffect(() => {
    const setupPreview = async () => {
      if (!state?.selectedCaptures?.[0]) {
        return;
      }

      const firstCapture = state.selectedCaptures[0];
      const shouldUseBoomerang = state.useBoomerang || false;

      if (shouldUseBoomerang) {
        // Check if boomerang assets already exist and is valid data URL
        if (
          firstCapture.boomerangGif &&
          firstCapture.boomerangGif.startsWith('data:')
        ) {
          // eslint-disable-next-line no-console
          console.log(
            '✅ [PhotoResult] Using existing boomerang GIF:',
            firstCapture.boomerangGif.substring(0, 50),
          );
          setPreviewBoomerangGif(firstCapture.boomerangGif);
          return;
        }

        // Generate boomerang assets if not exists
        if (firstCapture.video) {
          try {
            // eslint-disable-next-line no-console
            console.log(
              '🔄 [PhotoResult] Generating boomerang assets from video:',
              firstCapture.video,
            );
            const assets = await generateBoomerangAssets(firstCapture.video);
            if (
              assets.boomerangGif &&
              assets.boomerangGif.startsWith('data:')
            ) {
              // eslint-disable-next-line no-console
              console.log(
                '✅ [PhotoResult] Boomerang GIF generated:',
                assets.boomerangGif.substring(0, 50),
              );
              setPreviewBoomerangGif(assets.boomerangGif);
            } else {
              // eslint-disable-next-line no-console
              console.warn(
                '⚠️ [PhotoResult] Invalid boomerang GIF, falling back to video',
              );
              setPreviewBoomerangGif(null);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              '❌ [PhotoResult] Failed to create boomerang preview:',
              error,
            );
            // Fallback to video if boomerang generation fails
            setPreviewBoomerangGif(null);
          }
        } else {
          // eslint-disable-next-line no-console
          console.warn('⚠️ [PhotoResult] No video available for boomerang');
          setPreviewBoomerangGif(null);
        }
      } else {
        // Use regular video, no boomerang
        // eslint-disable-next-line no-console
        console.log(
          '📹 [PhotoResult] Using regular video (no boomerang):',
          firstCapture.video,
        );
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

      console.log('🎬 [PhotoResult] Starting video creation:', {
        capturesCount: state.selectedCaptures.length,
        frameId: state.selectedFrame.id,
        useBoomerang: state.useBoomerang,
        selectedFilter: state.selectedFilter,
      });

      try {
        const filter = FILTERS.find((f) => f.id === state.selectedFilter);

        // Apply LUT filter to original captures BEFORE creating framed video
        let processedCaptures = state.selectedCaptures;

        if (filter?.type === 'lut' && filter.lutFile) {
          setIsApplyingLUT(true);
          const lutFileName = filter.lutFile; // Store in local variable for type narrowing
          console.log(
            '🎨 [PhotoResult] Applying LUT filter to original videos:',
            lutFileName,
          );

          try {
            // Apply LUT filter to each capture video
            processedCaptures = await Promise.all(
              state.selectedCaptures.map(async (capture, index) => {
                try {
                  console.log(
                    `🎨 [PhotoResult] Processing capture ${index + 1}...`,
                  );

                  // Convert blob URL to ArrayBuffer
                  const response = await fetch(capture.video);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();

                  // Save to temp file via IPC
                  const saveResult =
                    await window.electron.video.saveTempVideo(arrayBuffer);

                  if (!saveResult.success || !saveResult.path) {
                    throw new Error('Failed to save temp video file');
                  }

                  // Apply LUT via FFmpeg
                  const lutResult = await window.electron.video.applyLutToVideo(
                    saveResult.path,
                    lutFileName,
                  );

                  if (lutResult.success && lutResult.path) {
                    // Read the processed file via IPC
                    const fileResult =
                      await window.electron.video.readVideoFile(lutResult.path);

                    if (fileResult.success && fileResult.data) {
                      const processedBlob = new Blob([fileResult.data], {
                        type: 'video/mp4',
                      });
                      const processedUrl = URL.createObjectURL(processedBlob);
                      console.log(
                        `✅ [PhotoResult] Capture ${index + 1} LUT applied successfully`,
                      );

                      return {
                        ...capture,
                        video: processedUrl,
                      };
                    }
                  }

                  // Fallback to original if processing fails
                  console.warn(
                    `⚠️ [PhotoResult] LUT processing failed for capture ${index + 1}, using original`,
                  );
                  return capture;
                } catch (error) {
                  console.error(
                    `❌ [PhotoResult] Failed to apply LUT to capture ${index + 1}:`,
                    error,
                  );
                  // Fallback to original capture
                  return capture;
                }
              }),
            );

            console.log(
              '✅ [PhotoResult] All captures processed with LUT filter',
            );
          } catch (lutError) {
            console.error(
              '❌ [PhotoResult] Failed to apply LUT filters:',
              lutError,
            );
            // Fallback to original captures
            processedCaptures = state.selectedCaptures;
          } finally {
            setIsApplyingLUT(false);
          }
        }

        // Determine filter ID for CSS filters (LUT filters are already applied)
        const initialFilterId =
          filter?.type === 'css' ? state.selectedFilter : undefined;
        const isLutFilterApplied = filter?.type === 'lut';

        console.log('🎬 [PhotoResult] Generating framed video...', {
          initialFilterId,
          hasLUTFilter: isLutFilterApplied,
          isLutFilterApplied,
          videoDuration: state.videoDuration,
        });

        // Generate framed video with processed captures
        const videoUrl = await generateFramedVideo(
          processedCaptures,
          state.selectedFrame,
          initialFilterId,
          state.useBoomerang,
          isLutFilterApplied,
          state.videoDuration, // ส่ง videoDuration จาก MainShooting
        );

        console.log(
          '✅ [PhotoResult] Framed video generated:',
          videoUrl.substring(0, 50),
        );

        setCompiledVideoUrl(videoUrl);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('❌ [PhotoResult] Error creating framed video:', error);
        // eslint-disable-next-line no-alert
        alert(
          `เกิดข้อผิดพลาดในการสร้างวิดีโอ: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        hasGeneratedVideo.current = false;
        // ไม่ set compiledVideoUrl ถ้าเกิด error
        console.warn(
          '⚠️ [PhotoResult] Video creation failed, compiledVideoUrl will remain null',
        );
      } finally {
        setIsCreatingVideo(false);
        console.log('✅ [PhotoResult] Video creation process finished:', {
          hasCompiledVideoUrl: !!compiledVideoUrl,
          isCreatingVideo: false,
        });
      }
    };

    createFramedVideo();
  }, [
    state?.selectedCaptures,
    state?.selectedFrame,
    state?.selectedFilter,
    state?.useBoomerang,
  ]);

  useEffect(() => {
    return () => {
      if (compiledVideoUrl) {
        URL.revokeObjectURL(compiledVideoUrl);
      }
    };
  }, [compiledVideoUrl]);

  // Auto-print when component mounts (เฉพาะเมื่อยังไม่ได้พิมพ์จาก PhotoFilter)
  useEffect(() => {
    console.log('🔄 [PhotoResult] useEffect triggered', {
      hasState: !!state,
      hasFinalImage: !!state?.finalImage,
      alreadyPrinted: (state as any)?.alreadyPrinted,
      printStatus,
    });
    console.log(
      '🔄 [PhotoResult] Full state object:',
      JSON.stringify(state, null, 2),
    );

    const handleAutoPrint = async () => {
      // ป้องกันการ upload ซ้ำ
      if (hasUploaded.current) {
        console.log('⚠️ [PhotoResult] Already uploaded, skipping...');
        return;
      }

      // ถ้าเพิ่งพิมพ์จาก PhotoFilter แล้ว ก็ยังต้อง upload files
      if ((state as any)?.alreadyPrinted) {
        console.log(
          '⚠️ [PhotoResult] Already printed from PhotoFilter, but will still upload files',
        );
        // ไม่ return ต่อ ให้ upload files ต่อไป
      }

      if (!state?.finalImage) {
        console.error('❌ [PhotoResult] No finalImage in state');
        setPrintStatus('error');
        return;
      }

      // ตรวจสอบว่ามีวิดีโอให้รอหรือไม่
      const hasCaptures =
        state?.selectedCaptures && state.selectedCaptures.length > 0;
      const shouldWaitForVideo = hasCaptures && !compiledVideoUrl;

      if (shouldWaitForVideo) {
        console.log(
          '⏳ [PhotoResult] Video not ready yet, skipping handleAutoPrint',
          {
            hasCompiledVideoUrl: !!compiledVideoUrl,
            hasCaptures,
          },
        );
        console.log(
          '⏳ [PhotoResult] Will wait for compiledVideoUrl to be set by useEffect',
        );
        // ไม่ set hasUploaded.current และไม่ upload ให้ useEffect ที่สองทำงานแทน
        return;
      }

      // ตั้งค่า flag เพื่อป้องกันการ upload ซ้ำ (ตั้งหลังจากตรวจสอบวิดีโอแล้ว)
      hasUploaded.current = true;

      // ข้ามการพิมพ์ - สมมติว่ากำลังพิมพ์
      setPrintStatus('printing');
      setIsUploading(true);

      try {
        // Helper function: แปลง blob URL เป็น base64 data URL
        const blobUrlToDataUrl = async (url: string): Promise<string> => {
          // ถ้าเป็น data URL อยู่แล้ว ให้ return ตามเดิม
          if (url.startsWith('data:')) {
            return url;
          }

          // ถ้าเป็น blob URL ให้แปลงเป็น base64
          if (url.startsWith('blob:')) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  resolve(reader.result as string);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (error) {
              console.error('Error converting blob URL to data URL:', error);
              throw error;
            }
          }

          // ถ้าเป็น file path หรือ URL อื่นๆ ให้ return ตามเดิม
          return url;
        };

        // 1. Upload files ก่อน
        // ใช้ mchOrderNo (reference_id) จาก payment response เป็น transaction code
        // Format เป็น TXN-{mchOrderNo} ตามที่ API ต้องการ
        if (!state.referenceId) {
          const errorMsg =
            '❌ [PhotoResult] No mchOrderNo (referenceId) found in state! Cannot upload files.';
          console.error(errorMsg);
          console.error(
            '📤 [PhotoResult] Full state:',
            JSON.stringify(state, null, 2),
          );
          console.error('📤 [PhotoResult] Available IDs:', {
            orderId: state.orderId,
            referenceId: state.referenceId,
            transactionId: state.transactionId,
          });
          throw new Error(
            'mchOrderNo (referenceId) is required. Please ensure payment was created successfully.',
          );
        }

        // Format transaction code เป็น TXN-{mchOrderNo}
        const mchOrderNo = state.referenceId;
        const transactionCode = mchOrderNo.startsWith('TXN-')
          ? mchOrderNo
          : `TXN-${mchOrderNo}`;

        console.log('📤 [PhotoResult] Starting upload files...');
        console.log('📤 [PhotoResult] mchOrderNo (referenceId):', mchOrderNo);
        console.log(
          '📤 [PhotoResult] Formatted Transaction Code:',
          transactionCode,
        );
        console.log(
          '📤 [PhotoResult] Transaction ID from state:',
          state.transactionId,
        );
        console.log(
          '📤 [PhotoResult] Transaction ID type:',
          typeof state.transactionId,
        );
        console.log(
          '📤 [PhotoResult] Transaction ID length:',
          state.transactionId?.length,
        );
        console.log('📤 [PhotoResult] Available IDs:', {
          orderId: state.orderId,
          referenceId: state.referenceId,
          transactionId: state.transactionId,
        });

        // เตรียม photos และ videos
        // ส่ง: 1) finalImage (รูปที่ print - order 1) 2) รูปอื่นๆ จาก selectedCaptures ที่ apply filter แล้ว (order 2, 3, ...) 3) วิดีโอจาก compiledVideoUrl
        const photos: string[] = [];
        const videos: string[] = [];

        // เพิ่ม finalImage (รูปที่ print - มี filter applied แล้ว) - order 1
        if (state.finalImage) {
          const convertedImage = await blobUrlToDataUrl(state.finalImage);
          photos.push(convertedImage);
          console.log(
            '📤 [PhotoResult] Added finalImage (order 1 - print image with filter) to photos',
          );
        } else {
          console.warn(
            '⚠️ [PhotoResult] No finalImage available, cannot upload photo',
          );
        }

        // เพิ่มรูปอื่นๆ จาก selectedCaptures ที่ apply filter แล้ว (order 2, 3, ...)
        // รูปเหล่านี้จะถูก apply filter เดียวกันกับ finalImage
        if (state.selectedCaptures && state.selectedCaptures.length > 0) {
          console.log(
            `📤 [PhotoResult] Applying filter "${state.selectedFilter}" to ${state.selectedCaptures.length} original photos...`,
          );

          for (let i = 0; i < state.selectedCaptures.length; i++) {
            const capture = state.selectedCaptures[i];
            if (capture.photo) {
              try {
                // Apply filter to original photo before upload
                const filteredPhoto = await applyFilterToPhoto(
                  capture.photo,
                  state.selectedFilter,
                );
                photos.push(filteredPhoto);
                console.log(
                  `📤 [PhotoResult] Added filtered capture[${i}].photo (order ${photos.length}) to photos`,
                );
              } catch (filterError) {
                console.error(
                  `❌ [PhotoResult] Failed to apply filter to capture[${i}].photo:`,
                  filterError,
                );
                // Fallback: upload original photo without filter
                const convertedPhoto = await blobUrlToDataUrl(capture.photo);
                photos.push(convertedPhoto);
                console.log(
                  `📤 [PhotoResult] Added original capture[${i}].photo (fallback, order ${photos.length}) to photos`,
                );
              }
            }
          }
        }

        // เพิ่มวิดีโอจาก compiledVideoUrl (วิดีโอที่ผ่าน LUT แล้ว)
        // แปลง WebM เป็น MP4 ก่อน upload เพื่อให้ iPhone/Safari เปิดดูได้
        console.log(
          '📤 [PhotoResult] ========== VIDEO UPLOAD CHECK ==========',
        );
        console.log('📤 [PhotoResult] Checking compiledVideoUrl:', {
          hasCompiledVideoUrl: !!compiledVideoUrl,
          compiledVideoUrlType: typeof compiledVideoUrl,
          compiledVideoUrlPreview: compiledVideoUrl?.substring(0, 50),
          compiledVideoUrlLength: compiledVideoUrl?.length || 0,
          hasSelectedCaptures: !!state?.selectedCaptures,
          selectedCapturesLength: state?.selectedCaptures?.length || 0,
          isCreatingVideo,
          isApplyingLUT,
        });

        if (compiledVideoUrl) {
          try {
            console.log(
              '📤 [PhotoResult] Converting WebM video to MP4 for iPhone/Safari compatibility...',
            );

            // Step 1: Fetch blob from blob URL
            const response = await fetch(compiledVideoUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            console.log('📤 [PhotoResult] Video blob fetched:', {
              blobSize: blob.size,
              blobType: blob.type,
            });

            // Step 2: Save WebM to temp file
            const saveResult =
              await window.electron.video.saveTempVideo(arrayBuffer);
            if (!saveResult.success) {
              throw new Error(`Failed to save temp video: ${saveResult.error}`);
            }
            console.log(
              '📤 [PhotoResult] WebM saved to temp:',
              saveResult.path,
            );

            // Step 3: Convert WebM to MP4 using FFmpeg (returns base64 data URL)
            const convertResult = await window.electron.video.convertToMp4(
              saveResult.path,
              true,
            );
            if (!convertResult.success) {
              throw new Error(
                `Failed to convert to MP4: ${convertResult.error}`,
              );
            }

            const mp4DataUrl = convertResult.dataUrl;
            console.log('📤 [PhotoResult] MP4 conversion successful:', {
              dataUrlLength: mp4DataUrl.length,
              preview: mp4DataUrl.substring(0, 50),
            });

            // คำนวณขนาดไฟล์ MP4 (ประมาณ)
            const base64Length = mp4DataUrl.includes('base64,')
              ? mp4DataUrl.split('base64,')[1].length
              : mp4DataUrl.length;
            const estimatedSizeMB = (base64Length * 3) / 4 / (1024 * 1024);

            console.log('📤 [PhotoResult] MP4 video size:', {
              base64Length,
              estimatedSizeMB: estimatedSizeMB.toFixed(2),
            });

            if (estimatedSizeMB > 10) {
              console.warn(
                `⚠️ [PhotoResult] MP4 video size (${estimatedSizeMB.toFixed(2)}MB) exceeds 10MB limit!`,
              );
              console.warn(
                '⚠️ [PhotoResult] Video will be skipped to avoid upload failure',
              );
            } else {
              videos.push(mp4DataUrl);
              console.log(
                '✅ [PhotoResult] Added MP4 video (converted from WebM) to videos',
              );
            }

            // Note: Temp file cleanup is handled by OS temp folder cleanup
          } catch (error) {
            console.error(
              '❌ [PhotoResult] Failed to convert video to MP4:',
              error,
            );
            // ไม่ fallback ไป WebM อีกต่อไป เพราะ iPhone/Safari ไม่รองรับ
            // ถ้าแปลง MP4 ไม่สำเร็จ ให้ skip video upload
            console.error(
              '⚠️ [PhotoResult] Skipping video upload because MP4 conversion failed. iPhone/Safari will not be able to play WebM.',
            );
          }
        } else {
          console.warn(
            '⚠️ [PhotoResult] No compiledVideoUrl available, skipping video upload',
          );
          console.warn(
            '⚠️ [PhotoResult] Video may still be processing. Consider waiting for video to be ready.',
          );
        }
        console.log('📤 [PhotoResult] Final upload arrays:', {
          photosCount: photos.length,
          videosCount: videos.length,
        });
        console.log(
          '📤 [PhotoResult] ===========================================',
        );

        console.log('📤 [PhotoResult] ========== UPLOAD SUMMARY ==========');
        console.log('📤 [PhotoResult] Upload summary:', {
          photosCount: photos.length,
          videosCount: videos.length,
          formatId: state.selectedFrame?.id,
        });

        // ตรวจสอบขนาดไฟล์ที่จะส่ง
        let totalPhotosSize = 0;
        let totalVideosSize = 0;

        photos.forEach((photo, index) => {
          const base64Length = photo.includes('base64,')
            ? photo.split('base64,')[1].length
            : photo.length;
          const sizeMB = (base64Length * 3) / 4 / (1024 * 1024);
          totalPhotosSize += sizeMB;
          console.log(
            `📤 [PhotoResult] Photo ${index + 1} size: ${sizeMB.toFixed(2)} MB`,
          );
        });

        videos.forEach((video, index) => {
          const base64Length = video.includes('base64,')
            ? video.split('base64,')[1].length
            : video.length;
          const sizeMB = (base64Length * 3) / 4 / (1024 * 1024);
          totalVideosSize += sizeMB;
          console.log(
            `📤 [PhotoResult] Video ${index + 1} size: ${sizeMB.toFixed(2)} MB`,
          );
        });

        console.log('📤 [PhotoResult] Total sizes:', {
          totalPhotosSize: `${totalPhotosSize.toFixed(2)} MB`,
          totalVideosSize: `${totalVideosSize.toFixed(2)} MB`,
          totalSize: `${(totalPhotosSize + totalVideosSize).toFixed(2)} MB`,
        });
        console.log('📤 [PhotoResult] ======================================');

        // Upload files
        // ใช้ transactionId จาก payment/create response
        if (!state.transactionId) {
          const errorMsg =
            '❌ [PhotoResult] No transactionId found in state! Cannot upload files.';
          console.error(errorMsg);
          throw new Error(
            'transactionId is required. Please ensure payment was created successfully.',
          );
        }

        // ตรวจสอบว่ามี sessionId หรือไม่ (ควรมีจาก createPhotoSession แล้ว)
        if (!sessionId) {
          console.warn(
            '⚠️ [PhotoResult] No sessionId found! Waiting for session to be created...',
          );
          // รอ sessionId สักครู่ (อาจจะยังสร้าง session ไม่เสร็จ)
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!sessionId) {
            throw new Error(
              'Session ID is required. Please ensure photo session was created successfully.',
            );
          }
        }

        console.log(
          '📤 [PhotoResult] ========== CALLING UPLOAD API ==========',
        );
        console.log('📤 [PhotoResult] Calling uploadFilesToSession API...');
        console.log('📤 [PhotoResult] Upload parameters:', {
          sessionId,
          photosCount: photos.length,
          videosCount: videos.length,
        });
        console.log('📤 [PhotoResult] Photos array:', {
          length: photos.length,
          firstPhotoPreview: photos[0]?.substring(0, 100) || 'none',
        });
        console.log('📤 [PhotoResult] Videos array:', {
          length: videos.length,
          firstVideoPreview: videos[0]?.substring(0, 100) || 'none',
          hasCompiledVideoUrl: !!compiledVideoUrl,
        });
        console.log(
          '📤 [PhotoResult] =========================================',
        );

        // ใช้ uploadFilesToSession แทน uploadMachineFiles (ใช้ sessionId)
        const uploadResult = await window.electron.payment.uploadFilesToSession(
          sessionId,
          photos,
          videos,
        );

        console.log('📤 [PhotoResult] Upload result:', uploadResult);

        // qrcodeStorageUrl ควรมีอยู่แล้วจาก createPhotoSession (ไม่ต้องรอจาก upload)
        if (!qrcodeStorageUrl) {
          console.warn(
            '⚠️ [PhotoResult] No qrcodeStorageUrl found (should have been set from createPhotoSession)',
          );
        }

        if (uploadResult.success && uploadResult.files?.length > 0) {
          console.log(
            '✅ [PhotoResult] Upload successful! Files:',
            uploadResult.files,
          );

          // หา photo URL แรก
          const photoFile = uploadResult.files.find(
            (f: { type: string; url: string }) => f.type === 'photo',
          );
          if (photoFile?.url) {
            console.log('✅ [PhotoResult] Photo URL:', photoFile.url);
            setUploadedFileUrl(photoFile.url);
          }

          // แสดง URLs ทั้งหมด
          uploadResult.files.forEach(
            (file: { type: string; url: string; order: number }) => {
              console.log(
                `📁 [PhotoResult] ${file.type} (order: ${file.order}): ${file.url}`,
              );
            },
          );
        } else {
          console.error('❌ [PhotoResult] Upload failed:', uploadResult);
        }

        setIsUploading(false);

        // 2. ข้ามการพิมพ์ - สมมติว่ากำลังพิมพ์
        console.log('🖨️ [PhotoResult] Skipping print (simulated)');
        setTimeout(() => {
          setPrintStatus('success');
          console.log(
            '✅ [PhotoResult] Print status set to success (simulated)',
          );
        }, 2000); // สมมติว่าพิมพ์เสร็จใน 2 วินาที

        // // Print หลังจาก upload เสร็จ (ถูก comment ออกเพื่อเทส API)
        // // Set up listener for print response
        // window.electron?.print?.onPrintResponse((response) => {
        //   if (response.success) {
        //     setPrintStatus('success');
        //   } else {
        //     setPrintStatus('error');
        //   }

        //   // Clean up listener
        //   window.electron?.print?.removePrintResponseListener();
        // });

        // // Send print request with frame configuration
        // window.electron?.print?.printPhoto({
        //   imageDataUrl: state.finalImage,
        //   frameId: state.selectedFrame?.id || 'classic_2x6',
        //   frameName: state.selectedFrame?.name || '2x6 Classic',
        //   copies: state.quantity || 1,
        // });
      } catch (error) {
        console.error('❌ [PhotoResult] Error in handleAutoPrint:', error);
        setIsUploading(false);
        setPrintStatus('error');
        // Reset flag ถ้าเกิด error เพื่อให้ลองใหม่ได้
        hasUploaded.current = false;
      }
    };

    // เรียก upload files ทันทีเมื่อ component mount (ไม่ต้องรอ printStatus === 'idle')
    // แต่ต้องตรวจสอบว่า state มีข้อมูลครบถ้วน
    // รอให้วิดีโอพร้อมก่อน (compiledVideoUrl) หรือ timeout หลังจาก 15 วินาที
    if (state?.finalImage && state?.referenceId && state?.transactionId) {
      if (!hasUploaded.current) {
        // ตรวจสอบว่ามีวิดีโอให้รอหรือไม่
        const hasCaptures =
          state?.selectedCaptures && state.selectedCaptures.length > 0;
        const shouldWaitForVideo = hasCaptures && !compiledVideoUrl;

        console.log('🔍 [PhotoResult] Upload decision:', {
          hasCaptures,
          hasCompiledVideoUrl: !!compiledVideoUrl,
          shouldWaitForVideo,
          isCreatingVideo,
          isApplyingLUT,
        });

        if (shouldWaitForVideo) {
          // รอให้วิดีโอพร้อมก่อน upload (ถ้ามีการสร้างวิดีโอ)
          // ไม่ต้องเรียก handleAutoPrint ที่นี่ ให้ useEffect ที่สอง (บรรทัด 1341) ทำงานแทน
          // เพราะมันจะ trigger อัตโนมัติเมื่อ compiledVideoUrl พร้อม
          console.log(
            '⏳ [PhotoResult] Video not ready yet, will wait for compiledVideoUrl to be set',
            {
              hasCompiledVideoUrl: !!compiledVideoUrl,
              hasCaptures,
            },
          );
          console.log(
            '⏳ [PhotoResult] Upload will be triggered automatically when compiledVideoUrl is ready',
          );
          // ไม่ต้องทำอะไร ให้ useEffect ที่สอง (บรรทัด 1341) ทำงานแทน
        } else {
          // ไม่มี captures แสดงว่าไม่มีวิดีโอ - upload ทันที
          console.log(
            '🔄 [PhotoResult] No captures (no video needed), triggering handleAutoPrint immediately',
            {
              hasCaptures,
            },
          );
          handleAutoPrint();
        }
      } else {
        console.log(
          '⚠️ [PhotoResult] Already uploaded, skipping handleAutoPrint',
        );
      }
    } else {
      console.warn('⚠️ [PhotoResult] Missing required data:', {
        hasFinalImage: !!state?.finalImage,
        hasReferenceId: !!state?.referenceId,
        hasTransactionId: !!state?.transactionId,
      });
    }
  }, [
    state?.finalImage,
    state?.referenceId,
    state?.transactionId,
    // ไม่ใส่ compiledVideoUrl ใน dependency เพราะจะทำให้เกิด race condition
    // ให้ useEffect ที่สอง (บรรทัด 1297) เป็นตัวเดียวที่จัดการ upload เมื่อ compiledVideoUrl พร้อม
  ]);

  // Trigger upload เมื่อ compiledVideoUrl พร้อม (ถ้ายังไม่ได้ upload)
  // useEffect นี้เป็นตัวหลักที่จัดการ upload เมื่อมีวิดีโอ
  useEffect(() => {
    console.log('🔍 [PhotoResult] useEffect (compiledVideoUrl) triggered:', {
      hasCompiledVideoUrl: !!compiledVideoUrl,
      hasFinalImage: !!state?.finalImage,
      hasReferenceId: !!state?.referenceId,
      hasTransactionId: !!state?.transactionId,
      hasUploaded: hasUploaded.current,
    });

    if (
      compiledVideoUrl &&
      state?.finalImage &&
      state?.referenceId &&
      state?.transactionId &&
      !hasUploaded.current
    ) {
      console.log(
        '🔄 [PhotoResult] Video became available, triggering upload now',
      );
      // เรียก handleAutoPrint โดยตรง
      const triggerUpload = async () => {
        // รอสักครู่เพื่อให้แน่ใจว่า state อัพเดทแล้ว
        await new Promise((resolve) => setTimeout(resolve, 300));

        // ตรวจสอบอีกครั้งหลังจากรอ (ป้องกัน race condition)
        if (!hasUploaded.current && compiledVideoUrl) {
          console.log(
            '🔄 [PhotoResult] Executing upload with video now available',
          );
          // เรียก handleAutoPrint โดยตรง
          // แต่ต้องสร้าง function handleAutoPrint ใหม่หรือใช้ ref
          // ให้ใช้ inline function แทน
          const uploadWithVideo = async () => {
            if (hasUploaded.current) {
              console.log('⚠️ [PhotoResult] Already uploaded, skipping...');
              return;
            }

            hasUploaded.current = true;
            setPrintStatus('printing');
            setIsUploading(true);

            try {
              // Helper function: แปลง blob URL เป็น base64 data URL
              const blobUrlToDataUrl = async (url: string): Promise<string> => {
                if (url.startsWith('data:')) {
                  return url;
                }
                if (url.startsWith('blob:')) {
                  try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    return new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        resolve(reader.result as string);
                      };
                      reader.onerror = reject;
                      reader.readAsDataURL(blob);
                    });
                  } catch (error) {
                    console.error(
                      'Error converting blob URL to data URL:',
                      error,
                    );
                    throw error;
                  }
                }
                return url;
              };

              if (!state.referenceId || !state.transactionId) {
                throw new Error('Missing required IDs');
              }

              const mchOrderNo = state.referenceId;
              const transactionCode = mchOrderNo.startsWith('TXN-')
                ? mchOrderNo
                : `TXN-${mchOrderNo}`;

              const photos: string[] = [];
              const videos: string[] = [];

              // เพิ่ม finalImage (รูปที่ print) - order 1
              if (state.finalImage) {
                const convertedImage = await blobUrlToDataUrl(state.finalImage);
                photos.push(convertedImage);
                console.log(
                  '📤 [PhotoResult] Added finalImage (order 1 - print image with filter) to photos (useEffect)',
                );
              } else {
                console.warn(
                  '⚠️ [PhotoResult] No finalImage available, cannot upload photo (useEffect)',
                );
              }

              // เพิ่มรูปอื่นๆ จาก selectedCaptures ที่ apply filter แล้ว (order 2, 3, ...)
              if (state.selectedCaptures && state.selectedCaptures.length > 0) {
                console.log(
                  `📤 [PhotoResult] Applying filter "${state.selectedFilter}" to ${state.selectedCaptures.length} original photos (useEffect)...`,
                );

                for (let i = 0; i < state.selectedCaptures.length; i++) {
                  const capture = state.selectedCaptures[i];
                  if (capture.photo) {
                    try {
                      // Apply filter to original photo before upload
                      const filteredPhoto = await applyFilterToPhoto(
                        capture.photo,
                        state.selectedFilter,
                      );
                      photos.push(filteredPhoto);
                      console.log(
                        `📤 [PhotoResult] Added filtered capture[${i}].photo (order ${photos.length}) to photos (useEffect)`,
                      );
                    } catch (filterError) {
                      console.error(
                        `❌ [PhotoResult] Failed to apply filter to capture[${i}].photo (useEffect):`,
                        filterError,
                      );
                      // Fallback: upload original photo without filter
                      const convertedPhoto = await blobUrlToDataUrl(
                        capture.photo,
                      );
                      photos.push(convertedPhoto);
                      console.log(
                        `📤 [PhotoResult] Added original capture[${i}].photo (fallback, order ${photos.length}) to photos (useEffect)`,
                      );
                    }
                  }
                }
              } else {
                console.log(
                  '📤 [PhotoResult] No selectedCaptures to add (useEffect)',
                );
              }

              // เพิ่มวิดีโอ (แปลง WebM เป็น MP4 สำหรับ iPhone/Safari)
              if (compiledVideoUrl) {
                try {
                  const convertStartTime = Date.now();
                  console.log(
                    '📤 [PhotoResult] Converting WebM to MP4 (useEffect)...',
                  );

                  // Fetch blob from blob URL
                  const response = await fetch(compiledVideoUrl);
                  const blob = await response.blob();
                  const webmSizeMB = (blob.size / 1024 / 1024).toFixed(2);
                  console.log(
                    `📊 [PhotoResult] WebM blob size: ${webmSizeMB} MB`,
                  );

                  const arrayBuffer = await blob.arrayBuffer();

                  // Save WebM to temp file
                  const saveResult =
                    await window.electron.video.saveTempVideo(arrayBuffer);
                  if (!saveResult.success) {
                    throw new Error(
                      `Failed to save temp video: ${saveResult.error}`,
                    );
                  }
                  console.log(
                    `📁 [PhotoResult] Temp WebM saved: ${saveResult.path}`,
                  );

                  // Convert WebM to MP4
                  const convertResult =
                    await window.electron.video.convertToMp4(
                      saveResult.path,
                      true,
                    );
                  if (!convertResult.success) {
                    throw new Error(
                      `Failed to convert to MP4: ${convertResult.error}`,
                    );
                  }

                  const convertEndTime = Date.now();
                  const convertDuration = (
                    (convertEndTime - convertStartTime) /
                    1000
                  ).toFixed(1);
                  const mp4SizeMB = convertResult.dataUrl
                    ? (
                        (convertResult.dataUrl.length * 0.75) /
                        1024 /
                        1024
                      ).toFixed(2)
                    : 'N/A';
                  console.log(
                    `✅ [PhotoResult] MP4 conversion done in ${convertDuration}s, size: ~${mp4SizeMB} MB`,
                  );

                  videos.push(convertResult.dataUrl);
                  console.log(
                    '✅ [PhotoResult] Added MP4 video to upload (useEffect)',
                  );

                  // Note: Temp file cleanup is handled by OS temp folder cleanup
                } catch (error) {
                  console.error(
                    '❌ [PhotoResult] MP4 conversion failed (useEffect):',
                    error,
                  );
                  // ไม่ fallback ไป WebM เพราะ iPhone/Safari ไม่รองรับ
                  console.error(
                    '⚠️ [PhotoResult] Skipping video upload because MP4 conversion failed. iPhone/Safari will not be able to play WebM.',
                  );
                }
              }

              console.log('📤 [PhotoResult] Uploading with video:', {
                photosCount: photos.length,
                videosCount: videos.length,
                hasCompiledVideoUrl: !!compiledVideoUrl,
                compiledVideoUrlPreview: compiledVideoUrl?.substring(0, 50),
              });

              // Retry logic removed - MP4 conversion already handles fallback

              console.log('📤 [PhotoResult] Final arrays before upload:', {
                photosCount: photos.length,
                videosCount: videos.length,
              });

              // ตรวจสอบว่ามี sessionId หรือไม่
              if (!sessionId) {
                console.warn(
                  '⚠️ [PhotoResult] No sessionId found! Waiting for session to be created...',
                );
                await new Promise((resolve) => setTimeout(resolve, 1000));
                if (!sessionId) {
                  throw new Error(
                    'Session ID is required. Please ensure photo session was created successfully.',
                  );
                }
              }

              // ใช้ uploadFilesToSession แทน uploadMachineFiles (ใช้ sessionId)
              const uploadResult =
                await window.electron.payment.uploadFilesToSession(
                  sessionId,
                  photos,
                  videos,
                );

              console.log('📤 [PhotoResult] Upload result (from useEffect):', {
                success: uploadResult.success,
                filesCount: uploadResult.files?.length || 0,
                videosInResponse:
                  uploadResult.files?.filter(
                    (f: { type: string }) => f.type === 'video',
                  ).length || 0,
                photosInResponse:
                  uploadResult.files?.filter(
                    (f: { type: string }) => f.type === 'photo',
                  ).length || 0,
              });

              if (uploadResult.success) {
                console.log('✅ [PhotoResult] Upload successful with video!');
                // qrcodeStorageUrl ควรมีอยู่แล้วจาก createPhotoSession (ไม่ต้องรอจาก upload)
                if (!qrcodeStorageUrl) {
                  console.warn(
                    '⚠️ [PhotoResult] No qrcodeStorageUrl found (should have been set from createPhotoSession)',
                  );
                }
              }

              setIsUploading(false);
              setPrintStatus('success');
            } catch (error) {
              console.error(
                '❌ [PhotoResult] Error in upload with video:',
                error,
              );
              setIsUploading(false);
              setPrintStatus('error');
              hasUploaded.current = false;
            }
          };

          uploadWithVideo();
        }
      };

      triggerUpload();
    }
  }, [
    compiledVideoUrl,
    state?.finalImage,
    state?.referenceId,
    state?.transactionId,
  ]);

  const handleFinish = () => {
    navigate('/');
  };

  const handleCountdownComplete = useCallback(() => {
    console.log(
      '⏰ [PhotoResult] Countdown completed, auto-navigating to home',
    );
    handleFinish();
  }, [handleFinish]);

  // Generate QR code data URL จาก qrcodeStorageUrl (ใช้ library แทน external service)
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (qrcodeStorageUrl) {
      // Import และ generate QR code โดยใช้ library
      import('../../utils/qrCodeUtils').then(({ generateQRCodeDataUrl }) => {
        generateQRCodeDataUrl(qrcodeStorageUrl, 200, 'M')
          .then((dataUrl) => {
            console.log('📱 [PhotoResult] QR code generated successfully');
            setQrCodeDataUrl(dataUrl);
          })
          .catch((error) => {
            console.error('❌ [PhotoResult] Failed to generate QR code:', error);
            setQrCodeDataUrl(null);
          });
      });
    } else {
      setQrCodeDataUrl(null);
    }
  }, [qrcodeStorageUrl]);

  const handleDownloadGif = () => {
    // Download compiled video
    if (compiledVideoUrl) {
      const link = document.createElement('a');
      link.href = compiledVideoUrl;
      // Use .mp4 extension as we are now converting to MP4
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
        <h1 className="result-title">
          {printStatus === 'success'
            ? 'พิมพ์รูปภาพเสร็จแล้ว'
            : printStatus === 'error'
              ? 'เกิดข้อผิดพลาดในการพิมพ์'
              : 'กำลังพิมพ์รูปภาพ...'}
        </h1>
        <p className="result-subtitle">
          {printStatus === 'success'
            ? 'Print completed!'
            : printStatus === 'error'
              ? 'Print failed'
              : 'Printing your memory...'}
        </p>
      </div>

      {/* Countdown Timer - นับถอยหลัง 30 วินาที แล้วไปหน้าถัดไปอัตโนมัติ */}
      <Countdown
        seconds={COUNTDOWN.PHOTO_RESULT.DURATION}
        onComplete={handleCountdownComplete}
        visible={COUNTDOWN.PHOTO_RESULT.VISIBLE}
      />

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
                {previewBoomerangGif &&
                previewBoomerangGif !== 'http://localhost:1212/index.html' &&
                previewBoomerangGif.startsWith('data:') ? (
                  <img
                    ref={gifImageRef}
                    src={previewBoomerangGif}
                    alt="Boomerang preview"
                    className="video-preview"
                    style={{
                      filter: getFilterStyle(),
                    }}
                    onLoad={(e) => {
                      // Force reload to loop GIF
                      const img = e.currentTarget;
                      if (img.complete) {
                        // Reset image to force replay
                        const currentSrc = img.src;
                        img.src = '';
                        setTimeout(() => {
                          img.src = currentSrc;
                        }, 10);
                      }
                    }}
                    onError={() => {
                      // eslint-disable-next-line no-console
                      console.error(
                        '❌ [PhotoResult] Failed to load GIF:',
                        previewBoomerangGif?.substring(0, 50),
                      );
                      // Fallback to video if GIF fails to load
                      setPreviewBoomerangGif(null);
                    }}
                  />
                ) : state?.selectedCaptures?.[0]?.video ? (
                  <video
                    ref={videoRef}
                    src={state.selectedCaptures[0].video}
                    className="video-preview"
                    style={{
                      filter: getFilterStyle(),
                    }}
                    loop
                    muted
                    playsInline
                    autoPlay
                    onEnded={(e) => {
                      const video = e.currentTarget;
                      video.currentTime = 0;
                      video.play().catch(() => {
                        // Ignore play errors
                      });
                    }}
                  />
                ) : (
                  <div className="video-preview-loading">
                    <div className="loading-spinner" />
                    <p>กำลังโหลดวิดีโอ...</p>
                  </div>
                )}
              </div>
              {/* <button
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
              </button> */}
            </>
          )}
        </div>

        {/* Right - QR Code & Download */}
        <div className="download-section">
          <div className="download-content">
            <h2 className="download-title">Download GIF File</h2>

            {/* แสดง QR code ทันทีที่ qrCodeDataUrl มีค่า (ไม่ต้องรอ video หรือ upload) */}
            {qrCodeDataUrl ? (
              <div className="qr-display">
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code"
                  className="qr-code"
                  onLoad={() => {
                    console.log(
                      '✅ [PhotoResult] QR code image loaded successfully',
                    );
                  }}
                  onError={(e) => {
                    console.error(
                      '❌ [PhotoResult] QR code image failed to load:',
                      e,
                    );
                  }}
                />
                {/* แสดงสถานะการทำงานด้านล่าง QR code */}
                {isCreatingVideo && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      marginTop: '8px',
                    }}
                  >
                    กำลังสร้างวิดีโอ...
                  </p>
                )}
                {isApplyingLUT && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      marginTop: '8px',
                    }}
                  >
                    กำลังประมวลผล Filter...
                  </p>
                )}
                {isUploading && (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#666',
                      marginTop: '8px',
                    }}
                  >
                    กำลังอัปโหลดไฟล์...
                  </p>
                )}
              </div>
            ) : isCreatingVideo ? (
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
              <div className="qr-loading">
                <div className="loading-spinner" />
                <p>กำลังสร้าง QR Code...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Button */}
      <div className="result-footer">
        <button
          type="button"
          className="finish-button"
          onClick={handleFinish}
          disabled={printStatus !== 'success' || !qrcodeStorageUrl}
          style={{
            opacity: printStatus !== 'success' || !qrcodeStorageUrl ? 0.5 : 1,
          }}
        >
          Done
        </button>
      </div>

      {/* Orientation Log - แสดงที่มุมล่างซ้าย */}
      {/* {orientationLog && (
        <div className="orientation-log">{orientationLog}</div>
      )} */}
    </div>
  );
}
