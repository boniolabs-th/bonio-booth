/* eslint-disable jsx-a11y/control-has-associated-label */
import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import fixWebmDuration from 'fix-webm-duration';
import { BackButton } from '..';
import { FrameConfig } from '../../utils/frameConfig';
import useCanonCameraV2 from '../../hooks/useCanonCameraV2';
import { resizeCanonPhoto } from '../../utils/imageProcessing';
import './MainShooting.css';

type CameraType = 'webcam' | 'canon';

interface CameraConfig {
  type: CameraType;
  // Webcam fields
  deviceId?: string;
  label?: string;
  // Canon fields
  cameraIndex?: number;
  cameraName?: string;
}

interface LocationState {
  quantity: number;
  totalPrice: number;
  selectedFrame: FrameConfig;
  useBoomerang?: boolean;
}

interface Capture {
  video: string; // Blob URL of the raw recording (webcam) or empty (canon)
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
  // คำนวณ Ratio
  const slotRatio = slotWidth / slotHeight;
  const videoRatio = videoWidth / videoHeight;

  // คำนวณขนาดของ Crop Area บน Video ต้นฉบับ (Source)
  // โดยใช้ logic "Object Fit: Cover" - หาพื้นที่ใหญ่ที่สุดใน Video ที่มี Ratio เดียวกับ Slot
  let cropSourceWidth: number;
  let cropSourceHeight: number;

  if (videoRatio > slotRatio) {
    // Video กว้างกว่า Slot -> ยึด Height เป็นหลัก แล้วตัดขอบซ้ายขวาออก
    cropSourceHeight = videoHeight;
    cropSourceWidth = videoHeight * slotRatio;
  } else {
    // Video สูงกว่า Slot -> ยึด Width เป็นหลัก แล้วตัดขอบบนล่างออก
    cropSourceWidth = videoWidth;
    cropSourceHeight = videoWidth / slotRatio;
  }

  // คำนวณ Scale ของ Video ที่แสดงผลบนหน้าจอเมื่อเทียบกับ Video ต้นฉบับ
  // (คำนวณเหมือนเดิมเพื่อหาขนาด Video ที่วาดจริงบน Container)
  const containerRatio = containerWidth / containerHeight;
  let displayedVideoWidth: number;

  if (videoRatio > containerRatio) {
    // Video กว้างกว่า container - height เต็ม
    displayedVideoWidth = containerHeight * videoRatio;
  } else {
    // Video สูงกว่า container - width เต็ม
    displayedVideoWidth = containerWidth;
  }

  const scale = displayedVideoWidth / videoWidth;

  // แปลงขนาด Crop จาก Source -> Displayed (บนหน้าจอ)
  const displayedCropWidth = cropSourceWidth * scale;
  const displayedCropHeight = cropSourceHeight * scale;

  // คำนวณเป็น percentage ของ container
  const cropWidthPercent = (displayedCropWidth / containerWidth) * 100;
  const cropHeightPercent = (displayedCropHeight / containerHeight) * 100;

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

/**
 * Helper function to flip image horizontally (mirror effect)
 * Used for both webcam and Canon photos to match the mirror-like preview
 */
const flipImageHorizontally = (imageDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
      if (!ctx) {
        reject(new Error('Cannot create canvas context'));
        return;
      }
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Flip horizontally (mirror effect)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);

      // ใช้ quality 0.92 สำหรับ original capture (คุณภาพสูง)
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load image for flipping'));
    img.src = imageDataUrl;
  });
};

export default function MainShooting() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  // Camera type and config state
  const [cameraType, setCameraType] = useState<CameraType>('webcam');
  const [cameraConfig, setCameraConfigState] = useState<CameraConfig | null>(
    null,
  );
  const cameraTypeRef = useRef<CameraType>('webcam'); // Ref to track current camera type for capture loop

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

  // Webcam refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cameraCountdownRef = useRef<number>(3);
  const isInitializedRef = useRef<boolean>(false);

  // Canon camera ref for live view image
  const canonLiveViewRef = useRef<HTMLImageElement>(null);

  // Canon camera hook (V2 - uses @brick-a-brack/napi-canon-cameras)
  const canonCamera = useCanonCameraV2();

  const handleBack = () => {
    // Stop camera when going back
    if (cameraType === 'webcam' && streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    } else if (cameraType === 'canon') {
      canonCamera.cleanup();
    }
    navigate('/photo-prepare', { state });
  };

  // ===========================================================================
  // WEBCAM Functions
  // ===========================================================================

  const startWebcam = async (config?: CameraConfig | null): Promise<void> => {
    try {
      setIsCameraLoading(true);
      setCameraError('');

      // เช็คว่า mediaDevices มีอยู่จริงหรือไม่
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'MediaDevices API is not supported. Please use a modern browser.',
        );
      }

      console.log('📹 [Webcam] Requesting camera access...');

      // ใช้ deviceId จาก config ที่ส่งมา หรือจาก state (fallback)
      // ใช้ parameter config ก่อน เพราะมันเป็นค่าที่โหลดมาใหม่และแน่ใจว่า update แล้ว
      const configToUse = config || cameraConfig;
      const targetDeviceId =
        configToUse?.type === 'webcam' ? configToUse.deviceId : null;

      console.log('📹 [Webcam] Using camera config:', {
        hasConfig: !!configToUse,
        deviceId: targetDeviceId,
        configSource: config ? 'parameter' : 'state',
      });

      // List available devices ก่อน
      let finalDeviceId = targetDeviceId;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === 'videoinput',
        );
        console.log(
          `📹 [Webcam] Found ${videoDevices.length} camera device(s):`,
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
        if (
          finalDeviceId &&
          !videoDevices.find((d) => d.deviceId === finalDeviceId)
        ) {
          console.warn(
            '⚠️ [Webcam] Configured camera not found, using last camera',
          );
          finalDeviceId = videoDevices[videoDevices.length - 1].deviceId;
        }

        // ถ้าไม่มี config ให้ใช้กล้องตัวสุดท้าย (มักเป็น external camera)
        if (!finalDeviceId) {
          finalDeviceId = videoDevices[videoDevices.length - 1].deviceId;
          console.log(
            '📹 [Webcam] No config, using last camera (external):',
            finalDeviceId,
          );
        }
      } catch (enumError) {
        console.warn('⚠️ [Webcam] Failed to enumerate devices:', enumError);
        // ยังคงลองต่อไปแม้จะ enumerate ไม่ได้
      }

      // Request camera access with specific device
      const constraints: MediaStreamConstraints = {
        video: finalDeviceId
          ? {
              deviceId: { exact: finalDeviceId },
              width: { ideal: 2560 }, //edit by all 2k
              height: { ideal: 1440 },
              frameRate: { ideal: 30 }, // เพิ่มการตั้งค่าเพื่อความคมชัด by all
            }
          : {
              width: { ideal: 2560 },
              height: { ideal: 1440 }, //เพิ่มความคมชัด by all 2k
            },
        audio: false,
      };

      console.log(
        '📹 [Webcam] Requesting stream with constraints:',
        constraints,
      );

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!stream) {
        throw new Error('Failed to get camera stream');
      }

      console.log('✅ [Webcam] Stream obtained:', {
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
      console.error('❌ [Webcam] Camera initialization failed:', error);
      throw error;
    }
  };

  const startWebcamRecording = useCallback(() => {
    if (!videoRef.current || !streamRef.current) return;

    try {
      recordedChunksRef.current = [];

      // Try to use MP4 (H.264) first if available (Chrome 107+ supports it)
      const mimeTypes = [
        'video/mp4;codecs=avc1', // H.264 in MP4 container (Best for colors/compatibility)
        'video/mp4', // Generic MP4
        'video/webm;codecs=vp9', // Chrome default high quality
        'video/webm;codecs=vp8', // Chrome default compatibility
        'video/webm', // Generic WebM
      ];

      const supportedType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );

      const options = {
        mimeType: supportedType || 'video/webm',
        videoBitsPerSecond: 15000000, // 15 Mbps for high quality video
      };

      console.log(
        `🎥 [MainShooting] MediaRecorder using mimeType: ${options.mimeType}`,
      );

      // Save mimeType to ref to use when creating Blob later
      (mediaRecorderRef as any).mimeType = options.mimeType;

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

  const stopWebcamRecording = useCallback((): Promise<string> => {
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
        // Use the same mimeType used for recording
        const mimeType = (mediaRecorderRef as any).mimeType || 'video/webm';
        console.log(`🎬 [MainShooting] Blob created with type: ${mimeType}`);

        const blob = new Blob(recordedChunksRef.current, {
          type: mimeType,
        });
        const url = URL.createObjectURL(blob);
        setIsRecording(false);
        resolve(url);
      };

      mediaRecorderRef.current.stop();
    });
  }, []);

  const takeWebcamPhoto = useCallback((): string => {
    if (!videoRef.current || !canvasRef.current) return '';

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
      colorSpace: 'srgb',
    });

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // เพิ่ม 2 บรรทัดนี้เพื่อความคมชัด by all
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high'; // edit from high to medium by all

      // Draw image directly without flipping
      // Live Preview is mirrored via CSS (scaleX(-1)) for selfie-like experience
      // But captured photo should be the actual camera view (readable text/numbers)
      context.drawImage(video, 0, 0);

      // ใช้ quality 0.92 สำหรับ original webcam capture
      const photoData = canvas.toDataURL('image/jpeg', 1.0); // edit by all

      // Flash effect
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 150);

      return photoData;
    }

    return '';
  }, []);

  // ===========================================================================
  // CANON CAMERA Functions
  // ===========================================================================

  const startCanonCamera = async (
    config?: CameraConfig | null,
  ): Promise<void> => {
    try {
      setIsCameraLoading(true);
      setCameraError('');

      console.log('📷 [Canon] Initializing Canon camera...');

      // Initialize SDK
      const initialized = await canonCamera.initialize();
      if (!initialized) {
        throw new Error('ไม่สามารถเริ่มต้น Canon SDK ได้');
      }

      // ดึง cameraIndex จาก config (ถ้ามี)
      let cameraIndex = 0; // default to first camera
      if (config && config.type === 'canon') {
        cameraIndex = config.cameraIndex ?? 0;
        console.log(
          `📷 [Canon] Using saved camera index: ${cameraIndex} (${config.cameraName})`,
        );
      }

      // Connect to camera with saved index
      const connected = await canonCamera.connect(cameraIndex);
      if (!connected) {
        throw new Error('ไม่สามารถเชื่อมต่อกล้อง Canon ได้');
      }

      console.log('📷 [Canon] Camera connected, starting Live View...');

      // Start live view
      const liveViewStarted = await canonCamera.startLiveView();
      if (!liveViewStarted) {
        throw new Error('ไม่สามารถเริ่ม Live View ได้');
      }

      console.log('📷 [Canon] Live View started, waiting for first frame...');

      // รอให้ได้ frame แรกก่อนถือว่า camera พร้อม
      // เพื่อป้องกันปัญหา video รูปแรกขาดช่วงเพราะ Live View ยังไม่พร้อม
      const FIRST_FRAME_TIMEOUT = 3000; // รอสูงสุด 3 วินาที
      const POLL_INTERVAL = 100; // เช็คทุก 100ms
      let waitTime = 0;

      while (!canonCamera.liveViewFrame && waitTime < FIRST_FRAME_TIMEOUT) {
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        waitTime += POLL_INTERVAL;
      }

      if (canonCamera.liveViewFrame) {
        console.log(
          `✅ [Canon] First frame received after ${waitTime}ms - camera ready!`,
        );
      } else {
        console.warn(
          `⚠️ [Canon] First frame timeout after ${waitTime}ms - proceeding anyway`,
        );
      }

      console.log('✅ [Canon] Camera initialized successfully with Live View');

      // Set default dimensions for Canon (Live View is usually 1920x1280 or similar)
      setVideoDimensions({ width: 1920, height: 1280 });
      setIsCameraLoading(false);
    } catch (error) {
      setIsCameraLoading(false);

      let errorMessage = 'ไม่สามารถเชื่อมต่อกล้อง Canon ได้';
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('❌ [Canon] Error:', error.message);
      }

      setCameraError(errorMessage);
      throw error;
    }
  };

  const startCanonFrameRecording = useCallback(() => {
    console.log('📷 [Canon] Starting frame recording...');
    canonCamera.startFrameRecording();
    setIsRecording(true);
  }, [canonCamera]);

  /**
   * Create a video blob URL from an array of JPEG base64 frames
   * Uses canvas + MediaRecorder to generate WebM video
   */
  const createVideoFromFrames = useCallback(
    async (frames: string[], fps: number = 30): Promise<string> => {
      if (frames.length === 0) {
        console.warn('📷 [Canon] No frames to create video from');
        return '';
      }

      console.log(
        `📷 [Canon] Creating video from ${frames.length} frames at ${fps}fps`,
      );

      const recordingStartTime = performance.now();

      const rawBlobUrl = await new Promise<string>((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          reject(new Error('Cannot create canvas context'));
          return;
        }

        // Load first frame to get dimensions
        const firstImg = new Image();
        firstImg.onload = () => {
          canvas.width = firstImg.naturalWidth;
          canvas.height = firstImg.naturalHeight;

          // Setup MediaRecorder
          const stream = canvas.captureStream(fps);

          // Prefer VP9 for better quality, fallback to VP8
          const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
          ];
          const selectedMimeType =
            mimeTypes.find((mt) => MediaRecorder.isTypeSupported(mt)) ||
            mimeTypes[0];

          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: selectedMimeType,
            videoBitsPerSecond: 15000000, // 15 Mbps for high quality video
          });

          const chunks: Blob[] = [];
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((track) => track.stop());
            const rawBlob = new Blob(chunks, { type: selectedMimeType });

            // Fix WebM duration metadata (MediaRecorder สร้าง WebM ที่มี duration: Infinity)
            const actualElapsedMs = Math.round(performance.now() - recordingStartTime);
            console.log(
              `📷 [Canon] Fixing WebM duration: ${actualElapsedMs}ms, size: ${(rawBlob.size / 1024).toFixed(1)} KB`,
            );

            try {
              const fixedBlob = await fixWebmDuration(rawBlob, actualElapsedMs, {
                logger: false,
              });
              const url = URL.createObjectURL(fixedBlob);
              console.log(
                `✅ [Canon] Video created (duration fixed): ${url} (${(fixedBlob.size / 1024).toFixed(1)} KB)`,
              );
              resolve(url);
            } catch (err) {
              console.warn('⚠️ [Canon] Failed to fix WebM duration, using raw:', err);
              const url = URL.createObjectURL(rawBlob);
              resolve(url);
            }
          };

          mediaRecorder.onerror = (e) => {
            console.error('❌ [Canon] MediaRecorder error:', e);
            stream.getTracks().forEach((track) => track.stop());
            reject(e);
          };

          // Start recording with timeslice เพื่อให้ได้ data อย่างสม่ำเสมอ
          mediaRecorder.start(500);

          // Pre-load all frame images first for consistent timing
          const loadImage = (src: string): Promise<HTMLImageElement> =>
            new Promise((res) => {
              const img = new Image();
              img.onload = () => res(img);
              img.onerror = () => {
                console.warn('⚠️ [Canon] Failed to load frame, using blank');
                res(img); // resolve anyway to keep going
              };
              img.src = src;
            });

          // Draw frames sequentially with pre-loaded images
          let frameIndex = 0;
          const frameInterval = 1000 / fps;

          const drawNextFrame = async () => {
            if (frameIndex >= frames.length) {
              // All frames drawn - stop recording immediately (no delay!)
              // ไม่ต้องรอ frame interval เพิ่ม เพราะจะทำให้ frame สุดท้ายค้าง
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.requestData(); // flush pending data
              }
              // Small delay เพื่อให้ requestData flush เสร็จ
              setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                  mediaRecorder.stop();
                }
              }, 50);
              return;
            }

            const img = await loadImage(frames[frameIndex]);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            frameIndex++;
            setTimeout(drawNextFrame, frameInterval);
          };

          drawNextFrame();
        };

        firstImg.onerror = () => {
          reject(new Error('Failed to load first frame'));
        };
        firstImg.src = frames[0];
      });

      return rawBlobUrl;
    },
    [],
  );

  /**
   * Convert a WebM blob URL to MP4 via FFmpeg for smooth looping
   * H.264 MP4 มี keyframe ที่ตำแหน่ง 0 เสมอ ทำให้ loop ราบรื่นกว่า WebM (VP9)
   */
  const convertCanonWebmToMp4 = useCallback(
    async (webmBlobUrl: string): Promise<string> => {
      try {
        console.log('📷 [Canon] Converting WebM to MP4 for smooth loop...');

        // 1. Fetch blob จาก URL
        const response = await fetch(webmBlobUrl);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // 2. Save WebM to temp file via IPC
        const saveResult = await window.electron.video.saveTempVideo(arrayBuffer);
        if (!saveResult.success || !saveResult.path) {
          console.warn('⚠️ [Canon] Failed to save temp WebM, using original');
          return webmBlobUrl;
        }

        // 3. Convert WebM → MP4 via FFmpeg
        const convertResult = await window.electron.video.convertToMp4(saveResult.path);
        if (!convertResult.success || !convertResult.path) {
          console.warn('⚠️ [Canon] Failed to convert to MP4, using WebM');
          return webmBlobUrl;
        }

        // 4. Read MP4 file back as ArrayBuffer
        const readResult = await window.electron.video.readVideoFile(convertResult.path);
        if (!readResult.success || !readResult.data) {
          console.warn('⚠️ [Canon] Failed to read MP4, using WebM');
          return webmBlobUrl;
        }

        // 5. Create blob URL from MP4 data
        const mp4Blob = new Blob([readResult.data], { type: 'video/mp4' });
        const mp4Url = URL.createObjectURL(mp4Blob);

        // 6. Cleanup: revoke old WebM blob URL
        URL.revokeObjectURL(webmBlobUrl);

        // 7. Cleanup temp files via IPC
        window.electron.video.cleanupTemp([saveResult.path, convertResult.path]).catch(() => {});

        console.log(
          `✅ [Canon] Converted to MP4: ${mp4Url} (${(mp4Blob.size / 1024).toFixed(1)} KB)`,
        );
        return mp4Url;
      } catch (err) {
        console.warn('⚠️ [Canon] MP4 conversion failed, using WebM:', err);
        return webmBlobUrl;
      }
    },
    [],
  );

  const stopCanonFrameRecording = useCallback(async (): Promise<string> => {
    console.log('📷 [Canon] Stopping frame recording...');
    const recording = canonCamera.stopFrameRecording();
    setIsRecording(false);

    console.log(`📷 [Canon] Captured ${recording.frames.length} frames`);

    // Return frames data for background processing later
    // Instead of blocking here, we'll process video in background
    if (recording.frames.length > 0) {
      // Store frames for background processing - return placeholder
      // The actual video will be created in background after shutter
      return JSON.stringify({ frames: recording.frames, pending: true });
    }

    return '';
  }, [canonCamera]);

  const takeCanonPhoto = useCallback(async (): Promise<string> => {
    console.log('📷 [Canon] Taking photo with shutter...');

    // Flash effect
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 150);

    try {
      // Use shutter only - no fallback to Live View
      const result = await canonCamera.takePicture();

      if (result.success && result.imageData) {
        console.log('✅ [Canon] Photo captured with shutter!');
        // Return image directly without flipping
        // Live Preview is mirrored via CSS for selfie-like experience
        // But captured photo should be the actual camera view (readable text/numbers)
        console.log(
          '✅ [Canon] Photo returned without flip (actual camera view)',
        );

        // Resize photo from 6000x4000 to 3600x2400 to reduce file size
        try {
          console.log('📷 [Canon] Resizing photo to 3600x2400...');
          const resizedPhoto = await resizeCanonPhoto(result.imageData);
          console.log('✅ [Canon] Photo resized successfully!');
          return resizedPhoto;
        } catch (resizeError) {
          console.error(
            '⚠️ [Canon] Resize failed, returning original:',
            resizeError,
          );
          return result.imageData;
        }
      }

      console.error('❌ [Canon] Shutter capture failed:', result.error);
      return '';
    } catch (error) {
      console.error('❌ [Canon] Shutter capture error:', error);
      return '';
    }
  }, [canonCamera]);

  // ===========================================================================
  // GENERIC Functions (work for both camera types)
  // Uses cameraTypeRef to get the current camera type (avoids stale closure)
  // ===========================================================================

  const startRecording = useCallback(() => {
    const currentType = cameraTypeRef.current;
    console.log(`📷 [startRecording] cameraType: ${currentType}`);
    if (currentType === 'webcam') {
      startWebcamRecording();
    } else {
      startCanonFrameRecording();
    }
  }, [startWebcamRecording, startCanonFrameRecording]);

  const stopRecording = useCallback(async (): Promise<string> => {
    const currentType = cameraTypeRef.current;
    console.log(`📷 [stopRecording] cameraType: ${currentType}`);
    if (currentType === 'webcam') {
      return stopWebcamRecording();
    } else {
      // stopCanonFrameRecording now returns a Promise (creates video from frames)
      return stopCanonFrameRecording();
    }
  }, [stopWebcamRecording, stopCanonFrameRecording]);

  const takePhoto = useCallback(async (): Promise<string> => {
    const currentType = cameraTypeRef.current;
    console.log(`📷 [takePhoto] cameraType: ${currentType}`);
    if (currentType === 'webcam') {
      return takeWebcamPhoto();
    } else {
      return takeCanonPhoto();
    }
  }, [takeWebcamPhoto, takeCanonPhoto]);

  const startCountdown = (
    duration: number,
    callback: () => void,
    onStartRecording?: () => void, // callback เมื่อถึงเวลาเริ่มถ่าย video (3 วิสุดท้าย)
  ): Promise<void> => {
    return new Promise((resolve) => {
      // Clear any existing timer
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      let currentCount = duration;
      const VIDEO_RECORDING_DURATION = 3; // ถ่าย video 3 วินาทีสุดท้ายเสมอ
      let recordingStarted = false;

      setCountdown(currentCount);
      setShowCountdown(true);

      // ถ้า duration <= 3 ให้เริ่มถ่ายทันทีตอนแสดง countdown แรก
      // เช่น countdown 3 วิ: [3=เริ่มถ่ายทันที], 2, 1, 0=stop (ได้ video 3 วิเต็ม)
      if (currentCount <= VIDEO_RECORDING_DURATION) {
        recordingStarted = true;
        console.log(
          `🎬 Starting video recording immediately at countdown ${currentCount}`,
        );
        onStartRecording?.();
      }

      countdownTimerRef.current = setInterval(() => {
        currentCount -= 1;
        setCountdown(currentCount);

        // เริ่มถ่าย video เมื่อ countdown เหลือ 3 วินาที (สำหรับ duration > 3)
        // เช่น countdown 5 วิ: 5, 4, [3=เริ่มถ่าย], 2, 1, 0=stop (ได้ video 3 วิเต็ม)
        // เช่น countdown 7 วิ: 7, 6, 5, 4, [3=เริ่มถ่าย], 2, 1, 0=stop (ได้ video 3 วิเต็ม)
        if (!recordingStarted && currentCount === VIDEO_RECORDING_DURATION) {
          recordingStarted = true;
          console.log(
            `🎬 Starting video recording at countdown ${currentCount}`,
          );
          onStartRecording?.();
        }

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

        // ========================================
        // Step 1: Load camera config to determine type
        // ========================================
        let loadedCameraType: CameraType = 'webcam'; // default
        let loadedConfig: CameraConfig | null = null;

        try {
          // @ts-ignore
          const configResult =
            await window.electron?.payment?.getCameraConfig();
          console.log('📷 [MainShooting] Camera config result:', configResult);

          if (configResult?.success && configResult.config) {
            loadedConfig = configResult.config;
            loadedCameraType = configResult.config.type || 'webcam';
            console.log(`📷 [MainShooting] Using ${loadedCameraType} camera`);
          }
        } catch (configError) {
          console.warn(
            '⚠️ [MainShooting] Failed to get camera config, using webcam:',
            configError,
          );
        }

        // Update both state and ref
        setCameraType(loadedCameraType);
        cameraTypeRef.current = loadedCameraType; // Important: set ref for capture loop
        setCameraConfigState(loadedConfig);
        console.log(
          `📷 [MainShooting] cameraTypeRef set to: ${cameraTypeRef.current}`,
        );

        // ========================================
        // Step 2: Start the appropriate camera
        // ========================================
        if (loadedCameraType === 'canon') {
          // ส่ง loadedConfig ไปให้ startCanonCamera เพื่อใช้ cameraIndex ที่บันทึกไว้
          await startCanonCamera(loadedConfig);
        } else {
          // ส่ง loadedConfig ไปให้ startWebcam เพื่อให้แน่ใจว่าใช้ config ที่ถูกต้อง
          await startWebcam(loadedConfig);
        }

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

        // ========================================
        // Step 3: Capture loop for required captures
        // ========================================
        const captureLoop = async () => {
          const newCaptures: Capture[] = [];

          // หน่วงเวลาให้กล้องพร้อมก่อนเริ่มถ่ายรอบแรก
          // กล้อง webcam ต้องการเวลาปรับ exposure/white balance
          const CAMERA_WARMUP_MS = 1500;
          console.log(
            `📷 Waiting ${CAMERA_WARMUP_MS}ms for camera to warm up...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, CAMERA_WARMUP_MS),
          );
          console.log('📷 Camera warm-up done, starting capture loop');

          // eslint-disable-next-line no-plusplus
          for (let i = 0; i < requiredCaptures; i += 1) {
            console.log(`📷 Starting capture ${i + 1}/${requiredCaptures}`);

            // Countdown using cameraCountdown from API
            // Video recording จะเริ่มตอน countdown เหลือ 3 วินาที (ผ่าน onStartRecording callback)
            // eslint-disable-next-line no-await-in-loop
            await startCountdown(
              cameraCountdownRef.current,
              () => {
                // Callback when countdown reaches 0
                console.log(`✅ Countdown finished for capture ${i + 1}`);
              },
              () => {
                // Callback to start recording when countdown reaches 3
                startRecording();
              },
            );

            // Stop recording and get frames data (for Canon) or video URL (for webcam)
            // eslint-disable-next-line no-await-in-loop
            const recordingData = await stopRecording();

            // Take photo immediately after countdown
            // eslint-disable-next-line no-await-in-loop
            const photoData = await takePhoto();

            console.log(
              `📷 [Capture ${i + 1}] photoData received:`,
              photoData ? `${photoData.substring(0, 50)}...` : 'EMPTY',
            );

            // Process video for Canon
            let videoUrl = '';
            // Store frames for boomerang if needed
            let boomerangFrames: string[] | undefined;

            if (cameraTypeRef.current === 'canon' && recordingData) {
              try {
                const data = JSON.parse(recordingData);
                if (data.pending && data.frames?.length > 0) {
                  boomerangFrames = data.frames;
                  // Handle video creation in background (don't await)
                  // This prevents blocking the UI and next capture countdown
                  console.log(
                    `📷 [Canon] Creating video in background from ${data.frames.length} frames...`,
                  );

                  // Capture index for updating state later
                  const currentCaptureIndex = i;

                  createVideoFromFrames(data.frames, 30)
                    .then((webmUrl) => convertCanonWebmToMp4(webmUrl))
                    .then((url) => {
                      console.log(
                        `✅ [Canon] Background video ready (MP4) for capture ${currentCaptureIndex + 1}: ${url}`,
                      );
                      // Update state with the generated video URL
                      setCaptures((prevCaptures) => {
                        const updated = [...prevCaptures];
                        if (updated[currentCaptureIndex]) {
                          updated[currentCaptureIndex] = {
                            ...updated[currentCaptureIndex],
                            video: url,
                          };
                        }
                        return updated;
                      });

                      // Also update the local array reference if needed (though next iterations just append)
                      if (newCaptures[currentCaptureIndex]) {
                        newCaptures[currentCaptureIndex].video = url;
                      }
                    })
                    .catch((err) => {
                      console.error(
                        '❌ [Canon] Background video processing failed:',
                        err,
                      );
                    });
                }
              } catch (err) {
                console.error('❌ [Canon] Video data parse failed:', err);
              }
            } else {
              // Webcam - recordingData is already a video URL
              videoUrl = recordingData || '';
            }

            // Add capture to array
            if (photoData) {
              newCaptures.push({
                video: videoUrl, // Will be empty initially for Canon, updated later
                photo: photoData,
                boomerangFrames, // Store frames for potential use
              });
              // Update state to show progress
              setCaptures([...newCaptures]);
              console.log(
                `✅ Capture ${i + 1} completed, total captures: ${newCaptures.length}`,
              );
            } else {
              console.error(`❌ Capture ${i + 1} FAILED - no photoData`);
            }

            // Wait 1.5 seconds before next capture to let camera stabilize
            if (i < requiredCaptures - 1) {
              // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
              await new Promise((resolve) => setTimeout(resolve, 1500));
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
      // Cleanup webcam
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      // Stop webcam recording if still recording
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      // Cleanup Canon camera (will be handled by hook cleanup if needed)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // คำนวณจำนวน capture ที่ต้องการ = จำนวน slots + 2
  const requiredCaptures = state?.selectedFrame?.slots
    ? state.selectedFrame.slots.length + 2
    : 6; // fallback ถ้าไม่มี frame

  // Navigate when we have all required captures AND all videos are ready
  useEffect(() => {
    if (captures.length === requiredCaptures) {
      // Check if all captures have valid video URLs (not empty)
      // For Canon, videos are created asynchronously
      const allVideosReady = captures.every(
        (capture) => capture.video && capture.video.length > 0,
      );

      if (!allVideosReady) {
        console.log(
          '⏳ [MainShooting] Waiting for Canon videos to be ready...',
        );
        console.log(
          '📊 [MainShooting] Video status:',
          captures.map((c, i) => ({
            index: i,
            hasVideo: !!c.video,
            videoLength: c.video?.length || 0,
          })),
        );
        return; // Wait for videos to be ready
      }

      console.log(
        '✅ [MainShooting] All captures and videos ready, navigating...',
      );
      setTimeout(() => {
        navigate('/photo-decorate', {
          state: {
            ...state,
            captures,
            useBoomerang: state.useBoomerang || false,
            // ส่ง videoDuration ไปด้วย เพราะ WebM ไม่มี duration metadata
            videoDuration: cameraCountdownRef.current + 1, // countdown + buffer
            // ส่ง cameraType เพื่อให้ PhotoFilter รู้ว่าต้อง process อย่างไร
            cameraType,
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
          {/* Webcam video feed */}
          {cameraType === 'webcam' && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-feed"
            />
          )}

          {/* Canon Live View feed */}
          {cameraType === 'canon' && canonCamera.liveViewFrame && (
            <img
              ref={canonLiveViewRef}
              src={canonCamera.liveViewFrame}
              alt="Canon Live View"
              className="camera-feed canon-live-view"
            />
          )}

          {/* Canon waiting for live view */}
          {cameraType === 'canon' &&
            !canonCamera.liveViewFrame &&
            !isCameraLoading && (
              <div className="camera-feed canon-waiting">
                <div className="waiting-text">
                  Waiting for Canon Live View...
                </div>
              </div>
            )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Crop Overlay - shows the crop area based on current slot pixel size */}
          {/* For spare photos (beyond slots.length), use the largest slot dimensions */}
          {!isCameraLoading &&
            state.selectedFrame?.slots &&
            state.selectedFrame.slots.length > 0 &&
            (() => {
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
            <div className="countdown-overlay-shooting">
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
