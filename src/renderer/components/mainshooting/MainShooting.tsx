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

// Crop overlay component that shows the crop area based on slot ratio
function CropOverlay({
  slotWidth,
  slotHeight,
  videoWidth,
  videoHeight,
}: {
  slotWidth: number;
  slotHeight: number;
  videoWidth: number;
  videoHeight: number;
}) {
  const slotRatio = slotWidth / slotHeight;
  const videoRatio = videoWidth / videoHeight;

  // Calculate the crop area dimensions as percentages of the video feed
  // The crop area maintains the slot ratio and is centered within the video
  const getCropDimensions = () => {
    let cropWidth: number;
    let cropHeight: number;

    if (slotRatio >= videoRatio) {
      // Slot is wider than video - width fills 100%, height adjusts
      cropWidth = 100;
      cropHeight = (100 * videoRatio) / slotRatio;
    } else {
      // Slot is taller than video - height fills 100%, width adjusts
      cropHeight = 100;
      cropWidth = (100 * slotRatio) / videoRatio;
    }

    return { cropWidth, cropHeight };
  };

  const { cropWidth, cropHeight } = getCropDimensions();

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready before proceeding
        await new Promise<void>((resolve) => {
          const onLoadedMetadata = () => {
            if (videoRef.current) {
              setVideoDimensions({
                width: videoRef.current.videoWidth,
                height: videoRef.current.videoHeight,
              });
            }
            setIsCameraLoading(false);
            videoRef.current?.removeEventListener(
              'loadedmetadata',
              onLoadedMetadata,
            );
            resolve();
          };

          videoRef.current?.addEventListener(
            'loadedmetadata',
            onLoadedMetadata,
          );
        });
      }
    } catch (error) {
      setIsCameraLoading(false);
      setCameraError('Failed to access camera. Please check permissions.');
      throw error;
    }
  };

  const startRecording = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    try {
      recordedChunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp9' };

      // Fallback to vp8 if vp9 is not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
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
              console.log('📸 Camera countdown loaded in initializeCamera:', countdownValue);
            }
          } catch (error) {
            console.error('Failed to get machine data in initializeCamera:', error);
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
          },
        });
      }, 1000);
    }
  }, [captures.length, requiredCaptures, navigate, state, captures]);

  return (
    <div className="main-shooting-container">
      {/* Back Button */}
      <BackButton onBackClick={handleBack} />

      {/* Title Section */}
      <div className="title-section-shooting">
        <h1 className="title-thai">มองกล้อง!</h1>
        <p className="title-english">LET&apos;S TAKE A PHOTO</p>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="camera-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-feed"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Crop Overlay - shows the crop area based on slot ratio */}
          {!isCameraLoading && state.selectedFrame?.slots?.[0] && (
            <CropOverlay
              slotWidth={state.selectedFrame.slots[0].width}
              slotHeight={state.selectedFrame.slots[0].height}
              videoWidth={videoDimensions.width}
              videoHeight={videoDimensions.height}
            />
          )}

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
