/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from '..';
import { FrameConfig } from '../../utils/frameConfig';
import './MainShooting.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
  selectedFrame: FrameConfig;
}

interface Capture {
  video: string; // Blob URL
  photo: string; // Base64 data URL
}

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [countdown, setCountdown] = useState(3);
  const [currentCapture, setCurrentCapture] = useState(0);
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
    const context = canvas.getContext('2d');

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
      setCountdown(duration);
      setShowCountdown(true);

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowCountdown(false);
            callback();
            resolve();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
  };

  // Initialize camera when component mounts
  useEffect(() => {
    const initializeCamera = async () => {
      try {
        // Wait for camera to load before starting
        await startCamera();

        // Capture loop for 6 captures
        const captureLoop = async () => {
          const newCaptures: Capture[] = [];

          // eslint-disable-next-line no-plusplus
          for (let i = 0; i < 6; i += 1) {
            setCurrentCapture(i);

            // Start recording video
            startRecording();

            // Countdown 3 seconds
            // eslint-disable-next-line no-await-in-loop
            await startCountdown(3, () => {
              // Callback when countdown reaches 0
            });

            // Stop recording and get video URL
            // eslint-disable-next-line no-await-in-loop
            const videoUrl = await stopRecording();

            // Take photo immediately after countdown
            const photoData = takePhoto();

            // Add capture to array
            if (videoUrl && photoData) {
              newCaptures.push({ video: videoUrl, photo: photoData });
              // Update state to show progress
              setCaptures([...newCaptures]);
            }

            // Wait 1 second before next capture (unless it's the last one)
            if (i < 5) {
              // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        };

        captureLoop();
      } catch {
        // Camera initialization failed
        setCameraError('Failed to initialize camera');
      }
    };

    initializeCamera();

    return () => {
      // Cleanup camera on unmount
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

  // Navigate when we have all 6 captures
  useEffect(() => {
    if (captures.length === 6) {
      setTimeout(() => {
        navigate('/photo-confirmation', {
          state: {
            ...state,
            captures,
          },
        });
      }, 1000);
    }
  }, [captures.length, navigate, state, captures]);

  return (
    <div className="main-shooting-container">
      {/* Header */}
      <Header showBackButton onBackClick={handleBack} />

      {/* Title Section */}
      <div className="title-section">
        <h1 className="title-thai">มองกล้อง!</h1>
        <p className="title-english">LET'S TAKE A PHOTO</p>
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
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="thumbnail-slot">
              {captures[index] ? (
                <img
                  src={captures[index].photo}
                  alt={`Photo ${index + 1}`}
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
