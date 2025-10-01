/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as gifshot from 'gifshot';
import { Header } from '..';
import './MainShooting.css';

interface LocationState {
  quantity: number;
  totalPrice: number;
}

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [countdown, setCountdown] = useState(5);
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [gifData, setGifData] = useState<string>('');
  const [showCountdown, setShowCountdown] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string>('');
  const [isCreatingGif, setIsCreatingGif] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
        video: { width: 1280, height: 720 },
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

  const createGifFromPhotos = useCallback(async () => {
    if (photos.length !== 6) return;

    setIsCreatingGif(true);

    try {
      gifshot.createGIF(
        {
          images: photos,
          gifWidth: 640,
          gifHeight: 480,
          interval: 0.8, // 0.8 seconds between frames
          numFrames: 6,
          frameDuration: 0.8,
          sampleInterval: 10,
          numWorkers: 2,
        },
        (obj) => {
          if (!obj.error && obj.image) {
            // Convert data URL to blob
            fetch(obj.image)
              .then((res) => res.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                setGifData(url);
                setIsCreatingGif(false);
                return blob;
              })
              .catch(() => {
                setIsCreatingGif(false);
              });
          } else {
            // Error creating GIF
            setIsCreatingGif(false);
          }
        },
      );
    } catch {
      // Error creating GIF
      setIsCreatingGif(false);
    }
  }, [photos]);

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const photoData = canvas.toDataURL('image/jpeg');
      setPhotos((prev) => [...prev, photoData]);

      // Flash effect
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 150);
    }
  };

  const startCountdown = (duration: number, callback: () => void) => {
    setCountdown(duration);
    setShowCountdown(true);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowCountdown(false);
          callback();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Initialize camera when component mounts
  useEffect(() => {
    const initializeCamera = async () => {
      try {
        // Wait for camera to load before starting
        await startCamera();

        // Start initial countdown and first photo
        startCountdown(5, () => {
          // Take first photo
          takePhoto();
          setCurrentPhoto(1);

          // Continue taking photos every 3 seconds
          let photoCount = 1;
          const photoTimer = setInterval(() => {
            if (photoCount < 6) {
              startCountdown(3, () => {
                takePhoto();
                photoCount += 1;
                setCurrentPhoto(photoCount);

                if (photoCount >= 6) {
                  clearInterval(photoTimer);
                }
              });
            }
          }, 4000); // 3 seconds countdown + 1 second buffer
        });
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate when we have all 6 photos
  useEffect(() => {
    if (photos.length === 6) {
      // Create GIF from photos
      createGifFromPhotos();
    }
  }, [photos.length, createGifFromPhotos]);

  // Navigate when GIF is ready
  useEffect(() => {
    if (photos.length === 6 && gifData) {
      setTimeout(() => {
        navigate('/photo-confirmation', {
          state: {
            ...state,
            photos,
            gifData,
          },
        });
      }, 1000);
    }
  }, [photos.length, gifData, navigate, state, photos]);

  return (
    <div className="main-shooting-container">
      {/* Header */}
      <Header showBackButton onBackClick={handleBack} />

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
              <div className="countdown-text">
                {currentPhoto === 0
                  ? 'Get Ready!'
                  : `Photo ${currentPhoto + 1}`}
              </div>
            </div>
          )}

          {!isCameraLoading && !cameraError && !isCreatingGif && (
            <div className="photo-progress">
              <div className="progress-text">
                Photos taken: {photos.length} / 6
              </div>
              <div className="progress-dots">
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <div
                    key={num}
                    className={`progress-dot ${photos.length >= num ? 'completed' : ''}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* GIF Creation Loading Overlay */}
          {isCreatingGif && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              <div className="loading-text">Creating your GIF...</div>
            </div>
          )}

          {showFlash && <div className="flash-overlay" />}
        </div>
      </div>
    </div>
  );
}
