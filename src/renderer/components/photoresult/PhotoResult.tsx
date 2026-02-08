/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import fixWebmDuration from 'fix-webm-duration';
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
import AlertModal from '../alertmodal';

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
  cameraType?: 'webcam' | 'canon'; // ประเภทกล้องสำหรับ processing
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
      const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });

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

          // ไม่ใช้ sharpening เพื่อรักษาคุณภาพภาพต้นฉบับ
          // ใช้ quality 0.88 เพื่อลดขนาดไฟล์โดยคงคุณภาพ
          resolve(processedCanvas.toDataURL('image/jpeg', 1.0)); // edit by all
        } catch (error) {
          console.error('Failed to apply LUT:', error);
          // Fallback to original (no sharpening)
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        }
      } else {
        // No filter to apply (LUT only supported now)
        ctx.drawImage(img, 0, 0);
        // ไม่ใช้ sharpening เพื่อรักษาคุณภาพภาพต้นฉบับ
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for filtering'));
    };

    img.src = photoUrl;
  });
};

/**
 * Pre-extract ทุก frame จาก video element ลง ImageBitmap[]
 * วิธีนี้เล่น video 1 ครั้ง จับทุก decoded frame เข้า memory
 * ทำให้ตอน record loop ไม่ต้องพึ่ง real-time decoder เลย
 * → ไม่ freeze บนเครื่องสเปคต่ำ (BMAX mini PC)
 *
 * @param maxWidth ความกว้างสูงสุดของ bitmap ที่เก็บ
 *   ลด GPU memory สำหรับ onboard GPU ที่ใช้ shared RAM
 *   1920x1080 @ ~8.3 MB/frame → resize เหลือ ~720p @ ~2.8 MB/frame (ลด ~65%)
 */
const preExtractFrames = (
  video: HTMLVideoElement,
  maxWidth: number = 1280,
): Promise<ImageBitmap[]> => {
  return new Promise<ImageBitmap[]>((resolve) => {
    const frames: ImageBitmap[] = [];
    let resolved = false;

    // คำนวณ resize dimension ลด memory สำหรับ onboard GPU
    const vw = video.videoWidth || maxWidth;
    const vh = video.videoHeight || 720;
    let resizeWidth = vw;
    let resizeHeight = vh;
    if (resizeWidth > maxWidth) {
      const scale = maxWidth / resizeWidth;
      resizeWidth = maxWidth;
      resizeHeight = Math.round(resizeHeight * scale);
    }
    // Ensure even dimensions (required by some codecs)
    if (resizeWidth % 2 !== 0) resizeWidth++;
    if (resizeHeight % 2 !== 0) resizeHeight++;

    console.log(`📸 [preExtractFrames] Resize: ${vw}x${vh} → ${resizeWidth}x${resizeHeight} (maxWidth=${maxWidth})`);

    const finish = () => {
      if (resolved) return;
      resolved = true;
      video.pause();
      console.log(
        `📸 [preExtractFrames] Done: ${frames.length} frames captured (${resizeWidth}x${resizeHeight})`,
      );
      resolve(frames);
    };

    // Safety timeout: ถ้า extraction ใช้เวลานานเกิน 15 วินาที → หยุด
    const timeout = setTimeout(() => {
      console.warn(
        '⚠️ [preExtractFrames] Timeout, finishing with',
        frames.length,
        'frames',
      );
      finish();
    }, 15000);

    const onFrame = async () => {
      if (resolved) return;

      if (video.ended || video.paused) {
        clearTimeout(timeout);
        finish();
        return;
      }

      try {
        const bitmap = await createImageBitmap(video, {
          resizeWidth,
          resizeHeight,
          resizeQuality: 'medium',
        });
        frames.push(bitmap);
      } catch {
        // skip frame if capture fails
      }

      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(onFrame);
      } else {
        requestAnimationFrame(onFrame);
      }
    };

    // เมื่อ video จบ → finish
    video.addEventListener(
      'ended',
      () => {
        clearTimeout(timeout);
        finish();
      },
      { once: true },
    );

    // เริ่มเล่น video แล้วจับ frame
    // eslint-disable-next-line no-param-reassign
    video.currentTime = 0;
    // eslint-disable-next-line no-param-reassign
    video.loop = false;
    // eslint-disable-next-line no-param-reassign
    video.muted = true;
    // eslint-disable-next-line no-param-reassign
    video.playbackRate = 1.0;
    video
      .play()
      .then(() => {
        if ('requestVideoFrameCallback' in video) {
          (video as any).requestVideoFrameCallback(onFrame);
        } else {
          requestAnimationFrame(onFrame);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        finish();
      });
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

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`วิดีโอที่ ${index + 1} ใช้เวลานานเกินไปในการโหลด`));
        }
      }, 15000);

      const handleReady = (source: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        console.log(
          `🎬 [loadVideoElement] Video ${index + 1} ready (${source}):`,
          {
            duration: videoElement.duration,
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            readyState: videoElement.readyState,
            src: capture.video.substring(0, 50),
          },
        );
        resolve(videoElement);
      };

      // Use canplaythrough for better readiness (video is fully buffered)
      videoElement.oncanplaythrough = () => handleReady('canplaythrough');

      // Fallback to loadedmetadata if canplaythrough doesn't fire
      videoElement.onloadedmetadata = () => {
        // Give canplaythrough a chance to fire first
        setTimeout(() => {
          if (!resolved && videoElement.readyState >= 2) {
            handleReady('loadedmetadata-fallback');
          }
        }, 500);
      };

      videoElement.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error(`ไม่สามารถโหลดวิดีโอที่ ${index + 1}`));
        }
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
    // Using alpha: false improves performance and fixes some color/gamma issues in MediaRecorder
    // Removed explicit colorSpace: 'srgb' as it can cause color shifts in recorded video
    const ctx = canvas.getContext('2d', { alpha: false });

    if (!ctx) {
      throw new Error('ไม่สามารถสร้าง canvas context ได้');
    }

    const frameWidth = frameImg.naturalWidth || frame.width;
    const frameHeight = frameImg.naturalHeight || frame.height;

    // Determine target resolution based on orientation (Landscape: 1080x720, Portrait: 720x1080)
    // This reduces resolution while maintaining aspect ratio and avoiding white bars or stretching
    const isPortrait = frameHeight > frameWidth;

    // Scale to fit within 1080x720 (or 720x1080 for portrait)
    let targetWidth: number;
    let targetHeight: number;

    if (isPortrait) {
      // For portrait, we want width=720 or height=1080
      // Let's fix width to 720 for portrait (720p equivalent)
      targetWidth = 1080; //added by all
      targetHeight = Math.round(targetWidth * (frameHeight / frameWidth));
    } else {
      // For landscape, we want height=720 or width=1080
      // Let's fix height to 720 for landscape (720p equivalent)
      targetHeight = 720;
      targetWidth = Math.round(targetHeight * (frameWidth / frameHeight));
    }

    // Ensure dimensions are even numbers (required by some video codecs)
    if (targetWidth % 2 !== 0) targetWidth++;
    if (targetHeight % 2 !== 0) targetHeight++;

    console.log('🎬 [composeBoomerangVideo] Resolution:', {
      original: `${frameWidth}x${frameHeight}`,
      target: `${targetWidth}x${targetHeight}`,
      isPortrait,
    });

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const scaleX = targetWidth / frame.width;
    const scaleY = targetHeight / frame.height;

    // Fill with white background first (paper color)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

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
    // ใช้ 3 วินาทีต่อ loop คงที่ (จับแค่ 3 วินาทีสุดท้ายของการถ่าย)
    // Loop วิดีโอ 3 รอบ = 9 วินาทีรวม
    const singleLoopDuration = 3; // คงที่ 3 วินาที
    const loopCount = 3;
    const totalDurationSeconds = singleLoopDuration * loopCount;
    const totalFrames = fps * totalDurationSeconds;

    return new Promise<string>((resolve, reject) => {
      const stream = canvas.captureStream(fps);

      // VP9 first - better color handling than VP8
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];

      const selectedMimeType =
        mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ??
        mimeTypes[0];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 10000000, // 10 Mbps for high quality // added to 10 mbps for test by all
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

      mediaRecorder.onstop = async () => {
        cleanup();
        const rawBlob = new Blob(chunks, { type: selectedMimeType });

        // Fix WebM duration metadata สำหรับ boomerang video
        const durationMs = totalDurationSeconds * 1000;
        console.log(
          '🎬 [composeBoomerangVideo] Fixing WebM duration:',
          durationMs,
          'ms',
        );

        try {
          const fixedBlob = await fixWebmDuration(rawBlob, durationMs, {
            logger: false,
          });
          console.log(
            '✅ [composeBoomerangVideo] WebM duration fixed successfully',
          );
          resolve(URL.createObjectURL(fixedBlob));
        } catch (err) {
          console.warn(
            '⚠️ [composeBoomerangVideo] Failed to fix WebM duration, using original:',
            err,
          );
          resolve(URL.createObjectURL(rawBlob));
        }
      };

      mediaRecorder.onerror = (event) => {
        cleanup();
        reject(
          event.error ||
            new Error('MediaRecorder เกิดปัญหาในระหว่างสร้างวิดีโอ'),
        );
      };

      const recordingStartTime = Date.now();
      const targetDuration = totalDurationSeconds * 1000;

      const drawFrame = () => {
        if (!recording) {
          return;
        }

        const now = Date.now();
        const elapsed = now - recordingStartTime;

        // Force stop if we exceed duration (with small safety buffer)
        if (elapsed >= targetDuration) {
          recording = false;
          mediaRecorder.stop();
          return;
        }

        // Calculate frame cursor based on time for smoother playback match
        // But for recording, we can just increment to ensure we draw all needed frames?
        // Actually, for captureStream, we just need to keep the canvas updated.
        // Let's use time-based frame selection to ensure 9s loop logic works correctly
        // independently of draw speed.

        // elapsed ms
        // 1 loop = 3000ms
        // current loop time = elapsed % 3000
        // frame index in loop = floor((elapsed % 3000) / (1000/fps))
        // This ensures the animation plays at correct speed relative to real time.

        // However, we want to maintain the "frameCursor" logic to be simple.
        // Let's stick to frameCursor logic but constrained by TIME stop condition?
        // No, if we use time stop, we should use time drawing to match.

        const loopDurationMs = singleLoopDuration * 1000;
        const timeInLoop = elapsed % loopDurationMs;
        const currentFrameIndex = Math.floor(timeInLoop / (1000 / fps));

        // Fill with white background first (paper color)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        const drawSlot = (slot: (typeof frame.slots)[0], slotIndex: number) => {
          const slotFrames = boomerangImages[slotIndex];
          if (!slotFrames || slotFrames.length === 0) {
            return;
          }

          // Use currentFrameIndex instead of frameCursor
          // This ensures we pick the right frame for the current timestamp
          const image = slotFrames[currentFrameIndex % slotFrames.length];
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

          // LUT filters are already applied to source, no additional CSS filter needed
          // (CSS filters are no longer supported - LUT only)

          //  added contrast and brightness
          // ctx.filter = 'contrast(1.01) saturate(1.08) brightness(1.05)'; // fixed color filter by all

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

          ctx.filter = 'none'; // added by all
          ctx.restore();
        };

        // 1. Draw background slots (zIndex < 0)
        frame.slots.forEach((slot, slotIndex) => {
          if ((slot.zIndex || 0) < 0) {
            drawSlot(slot, slotIndex);
          }
        });

        // 2. Draw frame
        ctx.drawImage(frameImg, 0, 0, targetWidth, targetHeight);

        // 3. Draw foreground slots (zIndex >= 0)
        frame.slots.forEach((slot, slotIndex) => {
          if ((slot.zIndex || 0) >= 0) {
            drawSlot(slot, slotIndex);
          }
        });

        // frameCursor += 1; // Removed in favor of time-based calculation
        // if (frameCursor >= totalFrames) ... // Removed

        // Schedule next check/draw
        // We use requestAnimationFrame-like timing via setTimeout
        // to keep loop running until duration expires

        timeoutId = window.setTimeout(() => {
          drawFrame();
        }, 1000 / fps);
      };

      // Start recording
      // Use 1000ms timeslice to ensure we get data regularly
      mediaRecorder.start(1000);
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
  // Using alpha: false improves performance and fixes some color/gamma issues in MediaRecorder
  // Removed explicit colorSpace: 'srgb' as it can cause color shifts in recorded video
  // desynchronized: true - ลดความหน่วงโดยให้ canvas render แยกจาก DOM
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  if (!ctx) {
    throw new Error('ไม่สามารถสร้าง canvas context ได้');
  }

  // ตั้งค่า image rendering quality ให้สูงสุด
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const frameWidth = frameImg.naturalWidth || frame.width;
  const frameHeight = frameImg.naturalHeight || frame.height;

  // Determine target resolution based on orientation (Landscape: 1080x720, Portrait: 720x1080)
  // This reduces resolution while maintaining aspect ratio and avoiding white bars or stretching
  const isPortrait = frameHeight > frameWidth;

  // Scale to fit within 1080x720 (or 720x1080 for portrait)
  let targetWidth: number;
  let targetHeight: number;

  if (isPortrait) {
    // For portrait, we want width=720 or height=1080
    // Let's fix width to 720 for portrait (720p equivalent)
    targetWidth = 1080; //added by all
    targetHeight = Math.round(targetWidth * (frameHeight / frameWidth));
  } else {
    // For landscape, we want height=720 or width=1080
    // Let's fix height to 720 for landscape (720p equivalent)
    targetHeight = 720;
    targetWidth = Math.round(targetHeight * (frameWidth / frameHeight));
  }

  // Ensure dimensions are even numbers (required by some video codecs)
  if (targetWidth % 2 !== 0) targetWidth++;
  if (targetHeight % 2 !== 0) targetHeight++;

  console.log('🎬 [generateFramedVideo] Resolution:', {
    original: `${frameWidth}x${frameHeight}`,
    target: `${targetWidth}x${targetHeight}`,
    isPortrait,
  });

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const scaleX = targetWidth / frame.width;
  const scaleY = targetHeight / frame.height;

  // Fill with white background first (paper color)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Video output: 3 วินาที x 3 รอบ = 9 วินาที
  // MediaRecorder จะ record canvas ไปเรื่อยๆ จนครบ maxDuration (9 วินาที)
  const singleLoopDuration = 3; // ความยาว video source ประมาณ 3 วินาที (ตาม countdown)
  const loopCount = 3;
  const maxDuration = singleLoopDuration * loopCount; // = 9 วินาที

  // คำนวณ duration จริงของ video source
  // WebM จาก MediaRecorder มักมี duration = Infinity หรือ NaN
  const firstVideo = videoElements[0];
  let actualVideoDuration = videoDuration || 3;
  // ต้องเช็คว่า duration เป็นค่าที่ใช้ได้จริง (finite, > 0, < 60)
  if (
    firstVideo?.duration &&
    Number.isFinite(firstVideo.duration) &&
    firstVideo.duration > 0 &&
    firstVideo.duration < 60
  ) {
    actualVideoDuration = firstVideo.duration;
  }

  console.log('🎬 [generateFramedVideo] Video timing:', {
    singleLoopDuration,
    loopCount,
    maxDuration,
    actualVideoDuration,
    videoDurationFromParam: videoDuration,
    firstVideoDuration: firstVideo?.duration,
    isFirstVideoDurationValid:
      firstVideo?.duration &&
      Number.isFinite(firstVideo.duration) &&
      firstVideo.duration > 0 &&
      firstVideo.duration < 60,
  });

  // IMPORTANT: Always use fixed 9-second output duration
  // regardless of source video duration
  const FIXED_OUTPUT_DURATION = 9; // seconds
  console.log(
    '🎬 [generateFramedVideo] Using FIXED output duration:',
    FIXED_OUTPUT_DURATION,
    'seconds',
  );

  // ===== Pre-extract all video frames into memory =====
  // วิธีนี้ decode video ครั้งเดียว เก็บทุก frame เป็น ImageBitmap
  // แล้ว loop จาก memory → ไม่ต้องพึ่ง real-time decoder ตอน record
  // ทำให้ไม่ freeze บน hardware สเปคต่ำ (เช่น BMAX mini PC)
  console.log('📸 [generateFramedVideo] Pre-extracting video frames...');
  const allVideoFrames: ImageBitmap[][] = [];
  for (let i = 0; i < videoElements.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    const frames = await preExtractFrames(videoElements[i], targetWidth);
    allVideoFrames.push(frames);
    console.log(
      `📸 [generateFramedVideo] Video ${i}: ${frames.length} frames extracted`,
    );
  }

  // Release video elements — ไม่ต้องใช้แล้วตอน record
  videoElements.forEach((video) => {
    video.pause();
    video.removeAttribute('src');
    video.load(); // release decoder resources
  });

  // Safety check: ต้องมี frame อย่างน้อย 1 ตัวต่อ video
  if (allVideoFrames.some((frames) => frames.length === 0)) {
    throw new Error('ไม่สามารถดึง frame จากวิดีโอได้');
  }

  console.log('📸 [generateFramedVideo] Frame extraction complete:', {
    videos: allVideoFrames.length,
    framesPerVideo: allVideoFrames.map((f) => f.length),
    firstFrameSize: allVideoFrames[0]?.[0]
      ? `${allVideoFrames[0][0].width}x${allVideoFrames[0][0].height}`
      : 'N/A',
  });

  // ใช้ actualVideoDuration จาก video element (duration จริง) ไม่ใช่ frame-based
  // เหตุผล: webcam อาจบันทึก VFR เช่น ~16fps ได้ 48 frames ใน 3 วินาที
  //         ถ้าคำนวณ 48/30 = 1.6 วินาที → วิดีโอจะเร่งเร็วเกือบ 2 เท่า
  //         ใช้ duration จริงจาก video element จะได้ความเร็วเดิมที่ถูกต้อง
  const minFrameCount = Math.min(...allVideoFrames.map((f) => f.length));
  const maxFrameCount = Math.max(...allVideoFrames.map((f) => f.length));
  const effectiveFps = minFrameCount / actualVideoDuration;
  console.log('📸 [generateFramedVideo] Frame info:', {
    minFrameCount,
    maxFrameCount,
    actualVideoDuration: actualVideoDuration.toFixed(2),
    effectiveFps: effectiveFps.toFixed(1),
  });

  return new Promise<string>((resolve, reject) => {
    const stream = canvas.captureStream(30);

    // VP9 first - better color handling than VP8
    // VP8 has known issues with color matrix conversion
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    const selectedMimeType =
      mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ||
      mimeTypes[0];

    console.log('🎬 [generateFramedVideo] Using codec:', selectedMimeType);

    // ใช้ timeslice เพื่อให้ได้ data อย่างสม่ำเสมอ ป้องกัน data loss
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 15000000, // 15 Mbps - higher bitrate for sharper video
    });

    const chunks: Blob[] = [];
    // ใช้ FIXED_OUTPUT_DURATION (9 วินาที) แทน maxDuration เพื่อให้แน่ใจว่า output ยาว 9 วินาทีเสมอ
    const recordingDuration = FIXED_OUTPUT_DURATION; // 9 seconds fixed
    const startTime = performance.now();
    let recording = true;
    let frameCount = 0;
    let actualElapsedMs = 0; // เก็บ elapsed time จริงสำหรับ fix-webm-duration
    let drawIntervalId: number | null = null; // setInterval สำหรับ frame-based drawing

    console.log(
      '🎬 [generateFramedVideo] Starting recording with duration:',
      recordingDuration,
      'seconds',
    );

    const cleanup = () => {
      recording = false;
      if (drawIntervalId !== null) clearInterval(drawIntervalId);
      stream.getTracks().forEach((track) => track.stop());
      // Release ImageBitmaps — คืน memory
      allVideoFrames.forEach((frames) =>
        frames.forEach((bitmap) => bitmap.close()),
      );
    };

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      cleanup();
      const rawBlob = new Blob(chunks, { type: selectedMimeType });

      // ⚠️ Validation: ตรวจสอบขนาดไฟล์ - ไฟล์ที่สมบูรณ์ควรมีขนาดอย่างน้อย 3 MB
      // ไฟล์ที่เสียมักมีขนาดแค่ 1-2 MB (ประมาณ 2-3 วินาที แทนที่จะเป็น 9 วินาที)
      const MIN_VALID_SIZE = 3 * 1024 * 1024; // 3 MB minimum
      if (rawBlob.size < MIN_VALID_SIZE) {
        console.error(
          '❌ [generateFramedVideo] Video file too small! Recording may be incomplete:',
          {
            actualSize: `${(rawBlob.size / 1024 / 1024).toFixed(2)} MB`,
            expectedMinSize: `${(MIN_VALID_SIZE / 1024 / 1024).toFixed(2)} MB`,
            frameCount,
            actualElapsedMs,
            chunksCount: chunks.length,
          },
        );
        // ยังคง resolve เพื่อไม่ให้ crash แต่ log warning
        // ในอนาคตอาจเพิ่ม retry logic
      }

      // Fix WebM duration metadata (MediaRecorder สร้าง WebM ที่มี duration: Infinity)
      // ใช้ actualElapsedMs ที่เก็บไว้ตอน recording เสร็จ
      const durationMs = actualElapsedMs || recordingDuration * 1000;
      console.log('🎬 [generateFramedVideo] Fixing WebM duration:', {
        durationMs,
        actualElapsedMs,
        recordingDuration,
        rawBlobSize: rawBlob.size,
        chunksCount: chunks.length,
      });

      try {
        // Enable logger to see what fix-webm-duration is doing
        const fixedBlob = await fixWebmDuration(rawBlob, durationMs, {
          logger: (msg: string) => console.log('🔧 [fix-webm-duration]', msg),
        });
        console.log('✅ [generateFramedVideo] WebM duration fixed:', {
          originalSize: rawBlob.size,
          fixedSize: fixedBlob.size,
          durationMs,
        });
        const url = URL.createObjectURL(fixedBlob);
        resolve(url);
      } catch (err) {
        console.error(
          '❌ [generateFramedVideo] Failed to fix WebM duration:',
          err,
        );
        const url = URL.createObjectURL(rawBlob);
        resolve(url);
      }
    };

    mediaRecorder.onerror = (event) => {
      cleanup();
      reject(
        event.error || new Error('MediaRecorder เกิดปัญหาในระหว่างสร้างวิดีโอ'),
      );
    };

    // ===== Frame-based draw: วาดจาก ImageBitmap[] ที่ extract ไว้ =====
    // ไม่พึ่ง real-time video decoder ตอน record → ไม่ freeze บนเครื่องสเปคต่ำ
    // ใช้ time-based index เลือก frame → loop ด้วย modulo
    const drawFrame = () => {
      if (!recording) {
        return;
      }

      const elapsed = (performance.now() - startTime) / 1000;
      frameCount++;

      // Log progress every 30 frames (~1 second at 30fps)
      if (frameCount % 30 === 0) {
        console.log('🎬 [generateFramedVideo] Recording progress:', {
          elapsed: elapsed.toFixed(2),
          targetDuration: recordingDuration,
          frameCount,
        });
      }

      // Stop recording when we reach target duration + buffer
      // บันทึกเกิน 1 วินาที เพื่อให้มี frames เพียงพอ
      // FFmpeg จะตัดให้เหลือ 9 วินาทีพอดีด้วย -t 9
      const recordBuffer = 1; // 1 second extra to ensure enough frames
      if (elapsed >= recordingDuration + recordBuffer) {
        // เก็บ elapsed time จริงสำหรับ fix-webm-duration
        actualElapsedMs = Math.round(performance.now() - startTime);
        console.log('🎬 [generateFramedVideo] Recording completed:', {
          elapsed: elapsed.toFixed(2),
          targetDuration: recordingDuration,
          recordBuffer,
          actualElapsedMs,
          totalFrames: frameCount,
        });
        recording = false;
        if (drawIntervalId !== null) clearInterval(drawIntervalId);
        // Request final data before stopping
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.requestData();
        }
        // Small delay to ensure data is flushed
        setTimeout(() => {
          mediaRecorder.stop();
        }, 100);
        return;
      }

      // คำนวณ frame index สำหรับ loop
      // loopTime = เวลาภายใน loop ปัจจุบัน (0 ~ actualVideoDuration)
      const loopTime = elapsed % actualVideoDuration;
      const loopProgress = loopTime / actualVideoDuration; // 0.0 ~ 1.0

      // Fill with white background first (paper color)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      const drawSlot = (slot: (typeof frame.slots)[0], index: number) => {
        const frames = allVideoFrames[index];
        if (!frames || frames.length === 0) {
          return;
        }

        // เลือก frame จาก progress ภายใน loop
        const frameIdx = Math.min(
          Math.floor(loopProgress * frames.length),
          frames.length - 1,
        );
        const bitmap = frames[frameIdx];

        const slotAspect = slot.width / slot.height;
        const bitmapAspect = bitmap.width / bitmap.height || 1;

        let sourceWidth = bitmap.width;
        let sourceHeight = bitmap.height;
        let sourceX = 0;
        let sourceY = 0;

        if (bitmapAspect > slotAspect) {
          sourceWidth = bitmap.height * slotAspect;
          sourceX = (bitmap.width - sourceWidth) / 2;
        } else {
          sourceHeight = bitmap.width / slotAspect;
          sourceY = (bitmap.height - sourceHeight) / 2;
        }

        const targetX = slot.x * scaleX;
        const targetY = slot.y * scaleY;
        const targetW = slot.width * scaleX;
        const targetH = slot.height * scaleY;
        const rotation = slot.rotate || 0;

        ctx.save();

        // Apply rotation around center if needed
        if (rotation !== 0) {
          const centerX = targetX + targetW / 2;
          const centerY = targetY + targetH / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        // LUT filters are already applied to source, no additional CSS filter needed

        ctx.drawImage(
          bitmap,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          targetX,
          targetY,
          targetW,
          targetH,
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
      ctx.drawImage(frameImg, 0, 0, targetWidth, targetHeight);

      // 3. Draw foreground slots (zIndex >= 0)
      frame.slots.forEach((slot, index) => {
        if ((slot.zIndex || 0) >= 0) {
          drawSlot(slot, index);
        }
      });
    };

    // ===== setInterval: reliable frame driver =====
    // เนื่องจากวาดจาก ImageBitmap ใน memory (ไม่มี video decoder)
    // setInterval timing เพียงพอ — captureStream(30) จัดการ frame rate เอง
    const FRAME_INTERVAL = 1000 / 30; // ~33.33ms
    mediaRecorder.start(500);
    drawFrame(); // วาด frame แรกทันที
    drawIntervalId = window.setInterval(drawFrame, FRAME_INTERVAL);
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

  const [alertText, setAlertText] = useState('');

  // Video ที่ผ่าน LUT filter แล้ว สำหรับใช้แสดง preview
  const [processedPreviewVideoUrl, setProcessedPreviewVideoUrl] = useState<
    string | null
  >(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [qrcodeStorageUrl, setQrcodeStorageUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null); // เก็บ sessionId สำหรับ upload files
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadQueued, setIsUploadQueued] = useState(false); // track ว่า queue upload สำเร็จหรือยัง
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

          const transactionId = state.transactionId!; // Already checked above
          const sessionResult =
            await window.electron.payment.createPhotoSession(
              transactionId,
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
            console.log('✅ [PhotoResult] QR code should be visible now!');
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

            // เก็บ processed video URL สำหรับ preview (ใช้ตัวแรก)
            if (processedCaptures[0]?.video) {
              setProcessedPreviewVideoUrl(processedCaptures[0].video);
              console.log('📺 [PhotoResult] Set processed video for preview');
            }
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

        // LUT filters are already applied, no CSS filter support
        const initialFilterId = undefined; // CSS filters no longer supported
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
        setAlertText(
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

        // บันทึก WebM ไป temp file และส่ง path ไปให้ background service convert
        // ไม่ต้องรอ convert ในตรงนี้ - จะทำในเบื้องหลังหลัง navigate ไปแล้ว
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

        let webmVideoPath: string | undefined;
        if (compiledVideoUrl) {
          try {
            console.log(
              '📤 [PhotoResult] Saving WebM to temp file for background conversion...',
            );

            // Step 1: Fetch blob from blob URL
            const response = await fetch(compiledVideoUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const webmSizeMB = (blob.size / 1024 / 1024).toFixed(2);

            console.log('📤 [PhotoResult] Video blob fetched:', {
              blobSize: blob.size,
              blobType: blob.type,
              sizeMB: webmSizeMB,
            });

            // Step 2: Save WebM to temp file
            const saveResult =
              await window.electron.video.saveTempVideo(arrayBuffer);
            if (!saveResult.success) {
              throw new Error(`Failed to save temp video: ${saveResult.error}`);
            }
            webmVideoPath = saveResult.path;
            console.log('📤 [PhotoResult] WebM saved to temp:', webmVideoPath);
            console.log(
              '✅ [PhotoResult] WebM saved! Will convert to MP4 in background after navigation.',
            );
          } catch (error) {
            console.error(
              '❌ [PhotoResult] Failed to save WebM to temp file:',
              error,
            );
            // ไม่มี video path ส่งไป - upload จะมีแค่ photos
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
          hasWebmVideoPath: !!webmVideoPath,
        });
        console.log(
          '📤 [PhotoResult] ===========================================',
        );

        console.log('📤 [PhotoResult] ========== UPLOAD SUMMARY ==========');
        console.log('📤 [PhotoResult] Upload summary:', {
          photosCount: photos.length,
          videosCount: videos.length,
          webmVideoPath,
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

        // ใช้ queueBackgroundUpload พร้อม webmVideoPath
        // การแปลง WebM → MP4 จะทำในเบื้องหลังโดย backgroundUploadService
        const uploadResult =
          await window.electron.payment.queueBackgroundUpload(
            sessionId,
            photos,
            videos,
            webmVideoPath, // ส่ง path ไปให้ convert ในเบื้องหลัง
          );

        // qrcodeStorageUrl ควรมีอยู่แล้วจาก createPhotoSession (ไม่ต้องรอจาก upload)
        if (!qrcodeStorageUrl) {
          console.warn(
            '⚠️ [PhotoResult] No qrcodeStorageUrl found (should have been set from createPhotoSession)',
          );
        }

        if (uploadResult.success) {
          console.log(
            '✅ [PhotoResult] Upload queued successfully! Job ID:',
            uploadResult.jobId,
          );
          // Background upload จะทำงานเบื้องหลัง ไม่ต้องรอ
          // User สามารถกด Done ได้เลย
          setIsUploadQueued(true); // Mark upload as queued - enable Done button
        } else {
          console.error(
            '❌ [PhotoResult] Failed to queue upload:',
            uploadResult,
          );
          // Still allow Done button even if queue failed (user shouldn't be stuck)
          setIsUploadQueued(true);
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

              // บันทึก WebM ไป temp file และส่ง path ไปให้ background service convert
              // ไม่ต้องรอ convert ในตรงนี้ - จะทำในเบื้องหลังหลัง navigate ไปแล้ว
              let webmVideoPath: string | undefined;
              if (compiledVideoUrl) {
                try {
                  console.log(
                    '📤 [PhotoResult] Saving WebM to temp file for background conversion...',
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
                  webmVideoPath = saveResult.path;
                  console.log(
                    `📁 [PhotoResult] Temp WebM saved: ${webmVideoPath}`,
                  );
                  console.log(
                    '✅ [PhotoResult] WebM saved! Will convert to MP4 in background after navigation.',
                  );
                } catch (error) {
                  console.error(
                    '❌ [PhotoResult] Failed to save WebM to temp file:',
                    error,
                  );
                  // ไม่มี video path ส่งไป - upload จะมีแค่ photos
                }
              }

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

              // ใช้ queueBackgroundUpload พร้อม webmVideoPath
              // การแปลง WebM → MP4 จะทำในเบื้องหลังโดย backgroundUploadService
              const uploadResult =
                await window.electron.payment.queueBackgroundUpload(
                  sessionId,
                  photos,
                  videos,
                  webmVideoPath, // ส่ง path ไปให้ convert ในเบื้องหลัง
                );

              if (uploadResult.success) {
                console.log(
                  '✅ [PhotoResult] Upload queued successfully with video!',
                );
                console.log('✅ [PhotoResult] Job ID:', uploadResult.jobId);
                // Background upload จะทำงานเบื้องหลัง ไม่ต้องรอ
                setIsUploadQueued(true); // Mark upload as queued - enable Done button
              } else {
                console.error(
                  '❌ [PhotoResult] Failed to queue upload (useEffect):',
                  uploadResult,
                );
                // Still allow Done button even if queue failed (user shouldn't be stuck)
                setIsUploadQueued(true);
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
        {/* Left - Video Preview (Removed as requested) */}
        {/* <div className="video-preview-section"> ... </div> */}

        {/* Right - QR Code & Download */}
        <div className="download-section">
          <div className="download-content">
            <h2 className="download-title">Download GIF File</h2>

            {/* แสดง QR code ทันทีที่ qrcodeStorageUrl มีค่า (ไม่ต้องรอ video หรือ upload) */}
            {qrcodeStorageUrl ? (
              <div className="qr-display">
                <QRCodeSVG
                  value={qrcodeStorageUrl}
                  size={200}
                  level="M"
                  className="qr-code"
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
          disabled={printStatus === 'printing' || !isUploadQueued}
          style={{
            opacity: printStatus === 'printing' || !isUploadQueued ? 0.5 : 1,
            cursor:
              printStatus === 'printing' || !isUploadQueued
                ? 'not-allowed'
                : 'pointer',
          }}
        >
          {!isUploadQueued ? 'กำลังเตรียมข้อมูล...' : 'Done'}
        </button>
      </div>

      {/* Orientation Log - แสดงที่มุมล่างซ้าย */}
      {/* {orientationLog && (
        <div className="orientation-log">{orientationLog}</div>
      )} */}

      <AlertModal
        isOpen={!!alertText}
        title="เกิดข้อผิดพลาด"
        message={alertText}
        onConfirm={() => {
          setAlertText('');
        }}
      />
    </div>
  );
}
