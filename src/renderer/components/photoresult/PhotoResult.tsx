/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { FrameConfig, FILTERS } from '../../utils/frameConfig';
import { generateBoomerangAssets } from '../../utils/boomerang';
import {
  getCachedLUT,
  applyLUTToCanvas,
  getLUTFilePath,
} from '../../utils/lutProcessor';
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

const generateFramedVideo = async (
  captures: Capture[],
  frame: FrameConfig,
  selectedFilterId?: string,
  useBoomerang?: boolean,
  isLutFilterApplied?: boolean, // Flag to indicate if LUT filter is already applied
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
  const [isCreatingVideo, setIsCreatingVideo] = useState(false);
  const [isApplyingLUT, setIsApplyingLUT] = useState(false);
  const hasGeneratedVideo = useRef(false);
  const [previewBoomerangGif, setPreviewBoomerangGif] = useState<string | null>(
    null,
  );
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [qrcodeStorageUrl, setQrcodeStorageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const hasUploaded = useRef(false); // ป้องกันการ upload ซ้ำ
  const [orientationLog, setOrientationLog] = useState<string>('');

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
          console.log('🎨 [PhotoResult] Applying LUT filter to original videos:', filter.lutFile);

          try {
            // Apply LUT filter to each capture video
            processedCaptures = await Promise.all(
              state.selectedCaptures.map(async (capture, index) => {
                try {
                  console.log(`🎨 [PhotoResult] Processing capture ${index + 1}...`);

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
                    filter.lutFile,
                  );

                  if (lutResult.success && lutResult.path) {
                    // Read the processed file via IPC
                    const fileResult = await window.electron.video.readVideoFile(
                      lutResult.path,
                    );

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

            console.log('✅ [PhotoResult] All captures processed with LUT filter');
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
        });

        // Generate framed video with processed captures
        const videoUrl = await generateFramedVideo(
          processedCaptures,
          state.selectedFrame,
          initialFilterId,
          state.useBoomerang,
          isLutFilterApplied,
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
        // ส่ง: 1) finalImage (รูปที่ print - order 1) 2) รูปอื่นๆ จาก selectedCaptures (order 2, 3, ...) 3) วิดีโอจาก compiledVideoUrl
        const photos: string[] = [];
        const videos: string[] = [];

        // เพิ่ม finalImage (รูปที่ print) - order 1
        if (state.finalImage) {
          const convertedImage = await blobUrlToDataUrl(state.finalImage);
          photos.push(convertedImage);
          console.log(
            '📤 [PhotoResult] Added finalImage (order 1 - print image) to photos',
          );
        } else {
          console.warn(
            '⚠️ [PhotoResult] No finalImage available, cannot upload photo',
          );
        }

        // เพิ่มรูปอื่นๆ จาก selectedCaptures ที่ไม่ได้เป็น finalImage (order 2, 3, ...)
        if (state.selectedCaptures && state.selectedCaptures.length > 0) {
          // แปลง finalImage เป็น data URL เพื่อเปรียบเทียบ
          let finalImageDataUrl: string | null = null;
          if (state.finalImage) {
            finalImageDataUrl = await blobUrlToDataUrl(state.finalImage);
          }

          for (let i = 0; i < state.selectedCaptures.length; i++) {
            const capture = state.selectedCaptures[i];
            if (capture.photo) {
              const convertedPhoto = await blobUrlToDataUrl(capture.photo);

              // เปรียบเทียบว่าเป็นรูปเดียวกันหรือไม่ (เปรียบเทียบ base64 data)
              // ใช้ substring เพื่อเปรียบเทียบส่วน base64 data เท่านั้น (ข้าม data:image/...;base64,)
              const photoBase64 = convertedPhoto.includes('base64,')
                ? convertedPhoto.split('base64,')[1]
                : convertedPhoto;
              const finalBase64 =
                finalImageDataUrl && finalImageDataUrl.includes('base64,')
                  ? finalImageDataUrl.split('base64,')[1]
                  : finalImageDataUrl;

              // เปรียบเทียบ 1000 ตัวอักษรแรก (เพื่อความเร็ว)
              const isSameAsFinalImage =
                finalBase64 &&
                photoBase64.substring(0, 1000) ===
                  finalBase64.substring(0, 1000);

              if (!isSameAsFinalImage) {
                photos.push(convertedPhoto);
                console.log(
                  `📤 [PhotoResult] Added capture[${i}].photo (order ${photos.length}) to photos`,
                );
              } else {
                console.log(
                  `📤 [PhotoResult] Skipped capture[${i}].photo (same as finalImage - order 1)`,
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
            const saveResult = await window.electron.video.saveTempVideo(arrayBuffer);
            if (!saveResult.success) {
              throw new Error(`Failed to save temp video: ${saveResult.error}`);
            }
            console.log('📤 [PhotoResult] WebM saved to temp:', saveResult.path);

            // Step 3: Convert WebM to MP4 using FFmpeg (returns base64 data URL)
            const convertResult = await window.electron.video.convertToMp4(saveResult.path, true);
            if (!convertResult.success) {
              throw new Error(`Failed to convert to MP4: ${convertResult.error}`);
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

            // Cleanup temp WebM file
            try {
              await window.electron.video.cleanupTemp([saveResult.path]);
            } catch (cleanupError) {
              console.warn('⚠️ [PhotoResult] Failed to cleanup temp file:', cleanupError);
            }
          } catch (error) {
            console.error(
              '❌ [PhotoResult] Failed to convert video to MP4:',
              error,
            );
            console.warn(
              '⚠️ [PhotoResult] Falling back to WebM format...',
            );

            // Fallback: upload WebM if MP4 conversion fails
            try {
              const convertedVideo = await blobUrlToDataUrl(compiledVideoUrl);
              const base64Length = convertedVideo.includes('base64,')
                ? convertedVideo.split('base64,')[1].length
                : convertedVideo.length;
              const estimatedSizeMB = (base64Length * 3) / 4 / (1024 * 1024);

              if (estimatedSizeMB <= 10) {
                videos.push(convertedVideo);
                console.log('✅ [PhotoResult] Added WebM video (fallback) to videos');
              }
            } catch (fallbackError) {
              console.error('❌ [PhotoResult] Fallback also failed:', fallbackError);
            }
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

        console.log(
          '📤 [PhotoResult] ========== CALLING UPLOAD API ==========',
        );
        console.log('📤 [PhotoResult] Calling uploadMachineFiles API...');
        console.log('📤 [PhotoResult] Upload parameters:', {
          transactionCode,
          transactionId: state.transactionId,
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

        const uploadResult = await window.electron.payment.uploadMachineFiles(
          transactionCode,
          photos,
          videos,
          state.transactionId,
        );

        console.log('📤 [PhotoResult] Upload result:', uploadResult);

        // เก็บ qrcodeStorageUrl จาก response (เช็คก่อน condition อื่นๆ)
        if (uploadResult.qrcodeStorageUrl) {
          console.log(
            '✅ [PhotoResult] QR Code Storage URL:',
            uploadResult.qrcodeStorageUrl,
          );
          setQrcodeStorageUrl(uploadResult.qrcodeStorageUrl);
        } else {
          console.warn('⚠️ [PhotoResult] No qrcodeStorageUrl in response');
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
                  '📤 [PhotoResult] Added finalImage (order 1 - print image) to photos (useEffect)',
                );
              } else {
                console.warn(
                  '⚠️ [PhotoResult] No finalImage available, cannot upload photo (useEffect)',
                );
              }

              // เพิ่มรูปอื่นๆ จาก selectedCaptures ที่ไม่ได้เป็น finalImage (order 2, 3, ...)
              if (state.selectedCaptures && state.selectedCaptures.length > 0) {
                console.log(
                  '📤 [PhotoResult] Processing selectedCaptures (useEffect):',
                  {
                    capturesCount: state.selectedCaptures.length,
                  },
                );

                // แปลง finalImage เป็น data URL เพื่อเปรียบเทียบ
                let finalImageDataUrl: string | null = null;
                if (state.finalImage) {
                  finalImageDataUrl = await blobUrlToDataUrl(state.finalImage);
                }

                for (let i = 0; i < state.selectedCaptures.length; i++) {
                  const capture = state.selectedCaptures[i];
                  if (capture.photo) {
                    const convertedPhoto = await blobUrlToDataUrl(
                      capture.photo,
                    );

                    // เปรียบเทียบว่าเป็นรูปเดียวกันหรือไม่ (เปรียบเทียบ base64 data)
                    const photoBase64 = convertedPhoto.includes('base64,')
                      ? convertedPhoto.split('base64,')[1]
                      : convertedPhoto;
                    const finalBase64 =
                      finalImageDataUrl && finalImageDataUrl.includes('base64,')
                        ? finalImageDataUrl.split('base64,')[1]
                        : finalImageDataUrl;

                    // เปรียบเทียบ 1000 ตัวอักษรแรก (เพื่อความเร็ว)
                    const isSameAsFinalImage =
                      finalBase64 &&
                      photoBase64.substring(0, 1000) ===
                        finalBase64.substring(0, 1000);

                    if (!isSameAsFinalImage) {
                      photos.push(convertedPhoto);
                      console.log(
                        `📤 [PhotoResult] Added capture[${i}].photo (order ${photos.length}) to photos (useEffect)`,
                      );
                    } else {
                      console.log(
                        `📤 [PhotoResult] Skipped capture[${i}].photo (same as finalImage - order 1) (useEffect)`,
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
                  console.log('📤 [PhotoResult] Converting WebM to MP4 (useEffect)...');

                  // Fetch blob from blob URL
                  const response = await fetch(compiledVideoUrl);
                  const blob = await response.blob();
                  const arrayBuffer = await blob.arrayBuffer();

                  // Save WebM to temp file
                  const saveResult = await window.electron.video.saveTempVideo(arrayBuffer);
                  if (!saveResult.success) {
                    throw new Error(`Failed to save temp video: ${saveResult.error}`);
                  }

                  // Convert WebM to MP4
                  const convertResult = await window.electron.video.convertToMp4(saveResult.path, true);
                  if (!convertResult.success) {
                    throw new Error(`Failed to convert to MP4: ${convertResult.error}`);
                  }

                  videos.push(convertResult.dataUrl);
                  console.log('✅ [PhotoResult] Added MP4 video to upload (useEffect)');

                  // Cleanup temp file
                  try {
                    await window.electron.video.cleanupTemp([saveResult.path]);
                  } catch (cleanupErr) {
                    console.warn('⚠️ Cleanup failed:', cleanupErr);
                  }
                } catch (error) {
                  console.error('❌ [PhotoResult] MP4 conversion failed, trying WebM fallback:', error);
                  // Fallback to WebM
                  try {
                    const convertedVideo = await blobUrlToDataUrl(compiledVideoUrl);
                    videos.push(convertedVideo);
                    console.log('✅ [PhotoResult] Added WebM video (fallback) to upload');
                  } catch (fallbackError) {
                    console.error('❌ [PhotoResult] Fallback also failed:', fallbackError);
                  }
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

              const uploadResult =
                await window.electron.payment.uploadMachineFiles(
                  transactionCode,
                  photos,
                  videos,
                  state.transactionId,
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
                if (uploadResult.qrcodeStorageUrl) {
                  setQrcodeStorageUrl(uploadResult.qrcodeStorageUrl);
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

  const generateQRCode = () => {
    // ใช้ qrcodeStorageUrl จาก API response เป็น data สำหรับสร้าง QR code
    // qrcodeStorageUrl เป็น URL ของ photosession ที่ต้องใช้สร้าง QR code
    if (qrcodeStorageUrl) {
      console.log(
        '📱 [PhotoResult] Generating QR code from qrcodeStorageUrl:',
        qrcodeStorageUrl,
      );
      // สร้าง QR code จาก qrcodeStorageUrl โดยใช้ external QR code generator
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcodeStorageUrl)}`;
      return qrCodeUrl;
    }

    // Fallback: Generate QR code from uploaded file URL (ถ้าไม่มี qrcodeStorageUrl)
    if (uploadedFileUrl) {
      console.log(
        '📱 [PhotoResult] Generating QR code from uploadedFileUrl (fallback)',
      );
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uploadedFileUrl)}`;
      return qrCodeUrl;
    }

    // Fallback: Generate QR code for the final image or download link
    // For demo purposes, this would be a placeholder
    console.warn(
      '⚠️ [PhotoResult] No QR code URL available, using placeholder',
    );
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTAgMTBoODB2ODBIMTBWMTB6IiBmaWxsPSJibGFjayIvPgo8cGF0aCBkPSJNMjAgMjBoNjB2NjBIMjBWMjB6IiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzAgMzBoNDB2NDBIMzBWMzB6IiBmaWxsPSJibGFjayIvPgo8L3N2Zz4K';
  };

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
            ) : isUploading ? (
              <div className="creating-video-message">
                <div className="loading-spinner" />
                <p>กำลังอัปโหลดไฟล์...</p>
              </div>
            ) : (
              <div className="qr-display">
                <img src={generateQRCode()} alt="QR Code" className="qr-code" />
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
        >
          เสร็จสิ้น
        </button>
      </div>

      {/* Orientation Log - แสดงที่มุมล่างซ้าย */}
      {orientationLog && (
        <div className="orientation-log">{orientationLog}</div>
      )}
    </div>
  );
}
