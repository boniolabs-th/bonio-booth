/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BackButton } from '..';
import { FrameConfig } from '../../utils/frameConfig';
import './MainShooting.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  selectedFrame: FrameConfig;
  useBoomerang?: boolean;
}

interface Capture {
  video: string; // Blob URL of the raw recording
  photo: string; // Base64 data URL
  boomerangGif?: string; // Base64 GIF with boomerang effect
  boomerangFrames?: string[]; // Captured frames used for boomerang playback
}

// Crop overlay component that shows the crop area based on actual slot pixel size
function CropOverlay({
  slotWidth,
  slotHeight,
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
}: {
  slotWidth: number;
  slotHeight: number;
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  containerHeight: number;
}) {
  // คำนวณว่า video ถูก scale เท่าไหร่ใน container (object-fit: cover)
  const videoRatio = videoWidth / videoHeight;
  const containerRatio = containerWidth / containerHeight;

  let displayedVideoWidth: number;
  let displayedVideoHeight: number;

  if (videoRatio > containerRatio) {
    // Video กว้างกว่า container - height เต็ม, width ถูกครอป
    displayedVideoHeight = containerHeight;
    displayedVideoWidth = containerHeight * videoRatio;
  } else {
    // Video สูงกว่า container - width เต็ม, height ถูกครอป
    displayedVideoWidth = containerWidth;
    displayedVideoHeight = containerWidth / videoRatio;
  }

  // คำนวณ scale factor ระหว่าง video จริงกับที่แสดง
  const scale = displayedVideoWidth / videoWidth;

  // ขนาด slot ที่แสดงจริงบน container (ตาม pixel จริง)
  const displayedSlotWidth = slotWidth * scale;
  const displayedSlotHeight = slotHeight * scale;

  // คำนวณเป็น percentage ของ container
  const cropWidthPercent = (displayedSlotWidth / containerWidth) * 100;
  const cropHeightPercent = (displayedSlotHeight / containerHeight) * 100;

  // จำกัดไม่ให้เกิน 100%
  const cropWidth = Math.min(cropWidthPercent, 100);
  const cropHeight = Math.min(cropHeightPercent, 100);

  // Calculate position to center the crop area
  const cropX = (100 - cropWidth) / 2;
  const cropY = (100 - cropHeight) / 2;

  return (
    <div className="crop-overlay">
      <svg
        className="crop-overlay-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <mask id="cropMask">
            {/* White = visible, Black = hidden */}
            {/* Fill entire area with white (semi-transparent overlay) */}
            <rect x="0" y="0" width="100" height="100" fill="white" />
            {/* Cut out the crop area (black = transparent) */}
            <rect
              x={cropX}
              y={cropY}
              width={cropWidth}
              height={cropHeight}
              fill="black"
            />
          </mask>
        </defs>
        {/* Semi-transparent overlay with the crop area cut out */}
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#cropMask)"
        />
        {/* Border around the crop area */}
        <rect
          x={cropX}
          y={cropY}
          width={cropWidth}
          height={cropHeight}
          fill="none"
          stroke="white"
          strokeWidth="0.3"
          strokeDasharray="2,1"
        />
      </svg>
    </div>
  );
}

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [, setCameraCountdown] = useState(3);
  const [countdown, setCountdown] = useState(3);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [showCountdown, setShowCountdown] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 1920, height: 1080 });
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 800, height: 600 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cameraCountdownRef = useRef<number>(3);
  const isInitializedRef = useRef<boolean>(false);

  const handleBack = () => {
    // Stop camera when going back
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    navigate('/photo-prepare', { state });
  };

  const startCamera = async (): Promise<void> => {
    try {
      setIsCameraLoading(true);
      setCameraError('');

      // เช็คว่า mediaDevices มีอยู่จริงหรือไม่
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'MediaDevices API is not supported. Please use a modern browser.',
        );
      }

      console.log('📹 [Camera] Requesting camera access...');

      // ดึง camera config จากที่บันทึกไว้
      let configuredDeviceId: string | null = null;
      try {
        // @ts-ignore
        const configResult = await window.electron?.payment?.getCameraConfig();
        if (configResult?.success && configResult.config?.deviceId) {
          configuredDeviceId = configResult.config.deviceId;
          console.log('📹 [Camera] Using configured camera:', configResult.config);
        }
      } catch (configError) {
        console.warn('⚠️ [Camera] Failed to get camera config:', configError);
      }

      // List available devices ก่อน
      let targetDeviceId = configuredDeviceId;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === 'videoinput',
        );
        console.log(
          `📹 [Camera] Found ${videoDevices.length} camera device(s):`,
          videoDevices.map((d) => ({
            id: d.deviceId,
            label: d.label || 'Unknown',
          })),
        );

        if (videoDevices.length === 0) {
          throw new Error(
            'ไม่พบกล้องที่เชื่อมต่ออยู่ กรุณาตรวจสอบการเชื่อมต่อกล้อง',
          );
        }

        // ถ้ามี config แต่ไม่พบกล้องที่ตั้งค่าไว้ ให้ใช้กล้องตัวสุดท้าย
        if (targetDeviceId && !videoDevices.find(d => d.deviceId === targetDeviceId)) {
          console.warn('⚠️ [Camera] Configured camera not found, using last camera');
          targetDeviceId = videoDevices[videoDevices.length - 1].deviceId;
        }

        // ถ้าไม่มี config ให้ใช้กล้องตัวสุดท้าย (มักเป็น external camera)
        if (!targetDeviceId) {
          targetDeviceId = videoDevices[videoDevices.length - 1].deviceId;
          console.log('📹 [Camera] No config, using last camera (external):', targetDeviceId);
        }
      } catch (enumError) {
        console.warn('⚠️ [Camera] Failed to enumerate devices:', enumError);
        // ยังคงลองต่อไปแม้จะ enumerate ไม่ได้
      }

      // Request camera access with specific device
      const constraints: MediaStreamConstraints = {
        video: targetDeviceId ? {
          deviceId: { exact: targetDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } : {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      console.log(
        '📹 [Camera] Requesting stream with constraints:',
        constraints,
      );

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!stream) {
        throw new Error('Failed to get camera stream');
      }

      console.log('✅ [Camera] Stream obtained:', {
        tracks: stream.getTracks().map((t) => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready before proceeding
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(
              new Error(
                'Camera video timeout - video did not load within 10 seconds',
              ),
            );
          }, 10000);

          const onLoadedMetadata = () => {
            clearTimeout(timeout);
            if (videoRef.current) {
              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;

              if (width === 0 || height === 0) {
                reject(new Error('Camera video dimensions are invalid'));
                return;
              }

              console.log('✅ [Camera] Video metadata loaded:', {
                width,
                height,
              });
              setVideoDimensions({ width, height });
            }
            setIsCameraLoading(false);
            videoRef.current?.removeEventListener(
              'loadedmetadata',
              onLoadedMetadata,
            );
            videoRef.current?.removeEventListener('error', onError);
            resolve();
          };

          const onError = (event: Event) => {
            clearTimeout(timeout);
            console.error('❌ [Camera] Video element error:', event);
            reject(new Error('Video element error'));
          };

          videoRef.current?.addEventListener(
            'loadedmetadata',
            onLoadedMetadata,
          );
          videoRef.current?.addEventListener('error', onError);
        });
      } else {
        throw new Error('Video element is not available');
      }

      console.log('✅ [Camera] Camera initialized successfully');
    } catch (error) {
      setIsCameraLoading(false);

      let errorMessage = 'ไม่สามารถเชื่อมต่อกล้องได้';

      if (error instanceof Error) {
        console.error('❌ [Camera] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });

        // แปลง error message เป็นภาษาไทยที่เข้าใจง่าย
        if (
          error.name === 'NotAllowedError' ||
          error.message.includes('permission')
        ) {
          errorMessage =
            'ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาอนุญาตการเข้าถึงกล้องในระบบ';
        } else if (
          error.name === 'NotFoundError' ||
          error.message.includes('not found')
        ) {
          errorMessage =
            'ไม่พบกล้องที่เชื่อมต่ออยู่ กรุณาตรวจสอบการเชื่อมต่อกล้อง';
        } else if (
          error.name === 'NotReadableError' ||
          error.message.includes('not readable')
        ) {
          errorMessage =
            'กล้องถูกใช้งานโดยโปรแกรมอื่นอยู่ กรุณาปิดโปรแกรมอื่นที่ใช้กล้อง';
        } else if (error.message.includes('timeout')) {
          errorMessage =
            'การเชื่อมต่อกล้องใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง';
        } else if (error.message.includes('dimensions')) {
          errorMessage = 'ไม่สามารถอ่านขนาดภาพจากกล้องได้';
        } else {
          errorMessage = `ไม่สามารถเชื่อมต่อกล้องได้: ${error.message}`;
        }
      }

      setCameraError(errorMessage);
      console.error('❌ [Camera] Camera initialization failed:', error);
      throw error;
    }
  };

  const startRecording = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    try {
      recordedChunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp8' };

      // Fallback to vp8 if vp9 is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp9';
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      // Error starting recording
    }
  }, []);

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve('');
        return;
      }

      // Check if mediaRecorder is recording
      if (mediaRecorderRef.current.state === 'inactive') {
        resolve('');
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: 'video/webm',
        });
        const url = URL.createObjectURL(blob);
        setIsRecording(false);
        resolve(url);
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const takePhoto = (): string => {
    if (!videoRef.current || !canvasRef.current) return '';

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', { willReadFrequently: true });

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const photoData = canvas.toDataURL('image/png');

      // Flash effect
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 150);

      return photoData;
    }

    return '';
  };

  const startCountdown = (
    duration: number,
    callback: () => void,
  ): Promise<void> => {
    return new Promise((resolve) => {
      // Clear any existing timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      let currentCount = duration;
      setCountdown(currentCount);
      setShowCountdown(true);

      countdownTimerRef.current = setInterval(() => {
        currentCount -= 1;
        setCountdown(currentCount);

        if (currentCount <= 0) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setShowCountdown(false);
          callback();
          resolve();
        }
      }, 1000);
    });
  };

  // Update container dimensions when component mounts and on resize
  useEffect(() => {
    const updateContainerDimensions = () => {
      if (cameraContainerRef.current) {
        const rect = cameraContainerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    // Initial update
    updateContainerDimensions();

    // Update on resize
    window.addEventListener('resize', updateContainerDimensions);

    return () => {
      window.removeEventListener('resize', updateContainerDimensions);
    };
  }, []);

  // รับ cameraCountdown จาก machine-init event และ request ข้อมูลทันที (fallback)
  useEffect(() => {
    // ฟังก์ชันสำหรับ set cameraCountdown
    const setCameraCountdownData = (countdownValue: number) => {
      if (countdownValue && countdownValue > 0) {
        setCameraCountdown(countdownValue);
        cameraCountdownRef.current = countdownValue;
        console.log('📸 Camera countdown loaded:', countdownValue);
      }
    };

    // 1. รับจาก event (ถ้า event ถูกส่งมา)
    const handleMachineInit = (...args: unknown[]) => {
      const data = args[0] as { machine?: { cameraCountdown?: number } };
      if (data?.machine?.cameraCountdown) {
        setCameraCountdownData(data.machine.cameraCountdown);
      }
    };

    const removeListener = window.electron?.ipcRenderer.on(
      'machine-init',
      handleMachineInit,
    );

    // 2. Request ข้อมูลทันที (fallback ถ้า event ยังไม่มา)
    const requestMachineData = async () => {
      try {
        const result = await window.electron?.payment.getMachineData();
        if (result?.success && result?.machine?.cameraCountdown) {
          setCameraCountdownData(result.machine.cameraCountdown);
        }
      } catch (error) {
        console.error('Failed to get machine data:', error);
      }
    };

    // Request ทันที
    requestMachineData();

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, []);

  // Initialize camera when component mounts (run only once)
  useEffect(() => {
    // Prevent multiple initializations
    if (isInitializedRef.current) {
      return;
    }

    const initializeCamera = async () => {
      try {
        isInitializedRef.current = true;

        // Wait for camera to load before starting
        await startCamera();

        // Wait for cameraCountdown to be loaded from API
        let countdownValue = cameraCountdownRef.current;
        if (countdownValue === 3) {
          // Try to get machine data if still using default value
          try {
            const result = await window.electron?.payment.getMachineData();
            if (result?.success && result?.machine?.cameraCountdown) {
              countdownValue = result.machine.cameraCountdown;
              cameraCountdownRef.current = countdownValue;
              setCameraCountdown(countdownValue);
              console.log(
                '📸 Camera countdown loaded in initializeCamera:',
                countdownValue,
              );
            }
          } catch (error) {
            console.error(
              'Failed to get machine data in initializeCamera:',
              error,
            );
          }
        }

        // Capture loop for required captures
        const captureLoop = async () => {
          const newCaptures: Capture[] = [];

          // eslint-disable-next-line no-plusplus
          for (let i = 0; i < requiredCaptures; i += 1) {
            console.log(`📷 Starting capture ${i + 1}/${requiredCaptures}`);

            // Wait 3 seconds before first capture
            // if (i === 0) {
            //   console.log('⏳ Waiting 3 seconds before first capture...');
            //   // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
            //   await new Promise((resolve) => setTimeout(resolve, 3000));
            // }

            // Start recording video
            startRecording();

            // Countdown using cameraCountdown from API
            // eslint-disable-next-line no-await-in-loop
            await startCountdown(cameraCountdownRef.current, () => {
              // Callback when countdown reaches 0
              console.log(`✅ Countdown finished for capture ${i + 1}`);
            });

            // Stop recording and get video URL
            // eslint-disable-next-line no-await-in-loop
            const videoUrl = await stopRecording();

            // Take photo immediately after countdown
            const photoData = takePhoto();

            // Add capture to array
            if (videoUrl && photoData) {
              newCaptures.push({
                video: videoUrl,
                photo: photoData,
              });
              // Update state to show progress
              setCaptures([...newCaptures]);
              console.log(`✅ Capture ${i + 1} completed`);
            }

            // Wait 1 second before next capture (unless it's the last one)
            if (i < requiredCaptures - 1) {
              // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }

          console.log(`🎉 All ${requiredCaptures} captures completed!`);
        };

        captureLoop();
      } catch (error) {
        // Camera initialization failed
        console.error('Camera initialization failed:', error);
        setCameraError('Failed to initialize camera');
        isInitializedRef.current = false;
      }
    };

    initializeCamera();

    return () => {
      // Cleanup camera on unmount
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Stop recording if still recording
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // คำนวณจำนวน capture ที่ต้องการ = จำนวน slots + 2
  const requiredCaptures = state?.selectedFrame?.slots
    ? state.selectedFrame.slots.length + 2
    : 6; // fallback ถ้าไม่มี frame

  // Navigate when we have all required captures
  useEffect(() => {
    if (captures.length === requiredCaptures) {
      setTimeout(() => {
        navigate('/photo-decorate', {
          state: {
            ...state,
            captures,
            useBoomerang: state.useBoomerang || false,
            // ส่ง videoDuration ไปด้วย เพราะ WebM ไม่มี duration metadata
            videoDuration: cameraCountdownRef.current + 1, // countdown + buffer
          },
        });
      }, 1000);
    }
  }, [captures.length, requiredCaptures, navigate, state, captures]);

  return (
    <div className="main-shooting-container">
      {/* Back Button */}
      {/* <BackButton onBackClick={handleBack} /> */}

      {/* Title Section */}
      <div className="title-section-shooting">
        <h1 className="title-thai">มองกล้อง!</h1>
        <p className="title-english">LET&apos;S TAKE A PHOTO</p>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="camera-container" ref={cameraContainerRef}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-feed"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Crop Overlay - shows the crop area based on current slot pixel size */}
          {/* For spare photos (beyond slots.length), use the largest slot dimensions */}
          {!isCameraLoading &&
           state.selectedFrame?.slots &&
           state.selectedFrame.slots.length > 0 && (() => {
            const slots = state.selectedFrame.slots;
            const currentIndex = captures.length;

            // ถ้ายังไม่เกิน slots.length ให้ใช้ slot ปัจจุบัน
            // ถ้าเกินแล้ว (รูปสำรอง) ให้หา slot ที่ใหญ่ที่สุด (พื้นที่มากสุด)
            let targetSlot;
            if (currentIndex < slots.length) {
              targetSlot = slots[currentIndex];
            } else {
              // หา slot ที่มีพื้นที่มากที่สุด
              targetSlot = slots.reduce((largest, current) => {
                const largestArea = largest.width * largest.height;
                const currentArea = current.width * current.height;
                return currentArea > largestArea ? current : largest;
              }, slots[0]);
            }

            return (
              <CropOverlay
                slotWidth={targetSlot.width}
                slotHeight={targetSlot.height}
                videoWidth={videoDimensions.width}
                videoHeight={videoDimensions.height}
                containerWidth={containerDimensions.width}
                containerHeight={containerDimensions.height}
              />
            );
          })()}

          {/* Camera Loading Overlay */}
          {isCameraLoading && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              <div className="loading-text">Setting up camera...</div>
            </div>
          )}

          {/* Camera Error Overlay */}
          {cameraError && (
            <div className="error-overlay">
              <div className="error-text">{cameraError}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="retry-button"
              >
                Retry
              </button>
            </div>
          )}

          {showCountdown && !isCameraLoading && (
            <div className="countdown-overlay">
              <div className="countdown-number">{countdown}</div>
            </div>
          )}

          {showFlash && <div className="flash-overlay" />}
        </div>
      </div>

      {/* Photo Thumbnails Grid */}
      <div className="thumbnails-container">
        <div className="thumbnails-grid">
          {Array.from({ length: requiredCaptures }, (_, index) => {
            const slot = state.selectedFrame?.slots?.[0];
            const aspectRatio = slot
              ? `${slot.width} / ${slot.height}`
              : '16 / 9';
            return (
              <div
                key={index}
                className="thumbnail-slot"
                style={{ aspectRatio }}
              >
                {captures[index] ? (
                  <img
                    src={captures[index].photo}
                    alt={`Capture ${index + 1}`}
                    className="thumbnail-image"
                  />
                ) : (
                  <div className="thumbnail-placeholder" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
