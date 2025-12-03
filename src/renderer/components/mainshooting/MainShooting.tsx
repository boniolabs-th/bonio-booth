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

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [cameraCountdown, setCameraCountdown] = useState(3);
  const [countdown, setCountdown] = useState(3);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [showCountdown, setShowCountdown] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);

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

      // Determine video constraints based on frame orientation
      const isPortrait = state.selectedFrame?.orientation === 'portrait';
      const videoConstraints = isPortrait
        ? { width: 1080, height: 1920 } // Portrait mode
        : { width: 1920, height: 1080 }; // Landscape mode

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video to be ready before proceeding
        await new Promise<void>((resolve) => {
          const onLoadedMetadata = () => {
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
      <div className="title-section">
        <h1 className="title-thai">มองกล้อง!</h1>
        <p className="title-english">LET&apos;S TAKE A PHOTO</p>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div
          className={`camera-container ${state.selectedFrame?.orientation === 'portrait' ? 'portrait' : 'landscape'}`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="camera-feed"
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

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
          {Array.from({ length: requiredCaptures }, (_, index) => (
            <div key={index} className="thumbnail-slot">
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
          ))}
        </div>
      </div>
    </div>
  );
}
