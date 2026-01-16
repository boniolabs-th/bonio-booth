/**
 * Custom hook for Canon Camera operations (V2)
 * Uses @brick-a-brack/napi-canon-cameras via IPC to main process
 * This version uses event-based capture which is more reliable
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface CameraInfo {
  name: string;
  portName?: string;
}

interface CaptureResult {
  success: boolean;
  imagePath?: string;
  imageData?: string; // Base64 encoded image with data URI prefix
  error?: string;
}

interface FrameRecording {
  frames: string[]; // Base64 JPEG frames
  timestamps: number[];
}

interface UseCanonCameraV2Return {
  // State
  isInitialized: boolean;
  isConnected: boolean;
  isLiveViewActive: boolean;
  cameraInfo: CameraInfo | null;
  cameraList: CameraInfo[];
  error: string | null;
  liveViewFrame: string | null; // Base64 JPEG frame
  isRecordingFrames: boolean;
  isCapturing: boolean;

  // Actions
  initialize: () => Promise<boolean>;
  connect: (cameraIndex?: number) => Promise<boolean>;
  disconnect: () => Promise<void>;
  startLiveView: () => Promise<boolean>;
  stopLiveView: () => Promise<void>;
  takePicture: () => Promise<CaptureResult>; // Shutter only - no Live View fallback
  takePictureToFile: (savePath: string) => Promise<CaptureResult>;
  cleanup: () => Promise<void>;
  refreshCameraList: () => Promise<CameraInfo[]>;

  // Frame recording for video/boomerang
  startFrameRecording: () => void;
  stopFrameRecording: () => FrameRecording;
  getCurrentFrame: () => string | null;
}

export default function useCanonCameraV2(): UseCanonCameraV2Return {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLiveViewActive, setIsLiveViewActive] = useState(false);
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [cameraList, setCameraList] = useState<CameraInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);
  const [isRecordingFrames, setIsRecordingFrames] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const liveViewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef(false);

  // Latest frame ref - always holds the most recent live view frame
  const latestFrameRef = useRef<string | null>(null);

  // Frame recording refs
  const recordedFramesRef = useRef<string[]>([]);
  const recordedTimestampsRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);

  // Get electron API
  // @ts-ignore
  const canonApi = window.electron?.canonCameraV2;

  /**
   * Initialize Canon SDK V2
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon V2 API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCameraV2] Initializing SDK...');

      const result = await canonApi.initialize();
      console.log('[useCanonCameraV2] Initialize result:', result);

      if (result?.success) {
        setIsInitialized(true);
        return true;
      } else {
        setError(result?.error || 'Failed to initialize Canon SDK');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCameraV2] Initialize error:', err);
      setError(err.message || 'Failed to initialize Canon SDK');
      return false;
    }
  }, [canonApi]);

  /**
   * Refresh camera list
   */
  const refreshCameraList = useCallback(async (): Promise<CameraInfo[]> => {
    if (!canonApi) {
      setError('Canon V2 API not available');
      return [];
    }

    try {
      console.log('[useCanonCameraV2] Getting camera list...');
      const result = await canonApi.getCameraList();
      console.log('[useCanonCameraV2] Camera list result:', result);

      if (result?.success && result.cameras) {
        setCameraList(result.cameras);
        return result.cameras;
      }
      return [];
    } catch (err: any) {
      console.error('[useCanonCameraV2] Get camera list error:', err);
      return [];
    }
  }, [canonApi]);

  /**
   * Connect to camera by index (default: 0)
   */
  const connect = useCallback(async (cameraIndex: number = 0): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon V2 API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCameraV2] Connecting to camera index:', cameraIndex);

      // Initialize first if needed
      if (!isInitialized) {
        const initResult = await initialize();
        if (!initResult) return false;
      }

      // Get camera list
      const cameras = await refreshCameraList();
      if (cameras.length === 0) {
        setError('No Canon cameras found');
        return false;
      }

      if (cameraIndex >= cameras.length) {
        setError(`Camera index ${cameraIndex} out of range. Found ${cameras.length} camera(s).`);
        return false;
      }

      // Connect
      const result = await canonApi.connect(cameraIndex);
      console.log('[useCanonCameraV2] Connect result:', result);

      if (result?.success) {
        setIsConnected(true);
        setCameraInfo(cameras[cameraIndex]);
        return true;
      } else {
        setError(result?.error || 'Failed to connect to camera');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCameraV2] Connect error:', err);
      setError(err.message || 'Failed to connect to camera');
      return false;
    }
  }, [canonApi, isInitialized, initialize, refreshCameraList]);

  /**
   * Disconnect camera
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (!canonApi) return;

    try {
      console.log('[useCanonCameraV2] Disconnecting...');

      // Stop live view first
      if (isLiveViewActive) {
        await stopLiveView();
      }

      await canonApi.disconnect();

      setIsConnected(false);
      setCameraInfo(null);
    } catch (err: any) {
      console.error('[useCanonCameraV2] Disconnect error:', err);
    }
  }, [canonApi, isLiveViewActive]);

  /**
   * Stop live view
   */
  const stopLiveView = useCallback(async (): Promise<void> => {
    if (liveViewIntervalRef.current) {
      clearInterval(liveViewIntervalRef.current);
      liveViewIntervalRef.current = null;
    }

    if (!canonApi) return;

    try {
      console.log('[useCanonCameraV2] Stopping live view...');
      await canonApi.stopLiveView();
      setIsLiveViewActive(false);
      setLiveViewFrame(null);
      latestFrameRef.current = null;
    } catch (err: any) {
      console.error('[useCanonCameraV2] StopLiveView error:', err);
    }
  }, [canonApi]);

  /**
   * Start live view and begin frame polling
   */
  const startLiveView = useCallback(async (): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon V2 API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCameraV2] Starting live view...');

      const result = await canonApi.startLiveView();
      console.log('[useCanonCameraV2] StartLiveView result:', result);

      if (result?.success) {
        setIsLiveViewActive(true);

        // Start polling for live view frames
        if (liveViewIntervalRef.current) {
          clearInterval(liveViewIntervalRef.current);
        }

        liveViewIntervalRef.current = setInterval(async () => {
          if (isCleanedUpRef.current) return;

          try {
            const frameResult = await canonApi.getLiveViewImage();
            if (frameResult?.success && frameResult.imageData) {
              const base64 = frameResult.imageData.startsWith('data:')
                ? frameResult.imageData
                : `data:image/jpeg;base64,${frameResult.imageData}`;

              // Always update latest frame ref (for instant capture)
              latestFrameRef.current = base64;

              // Update React state for UI display
              setLiveViewFrame(base64);

              // If recording, save frame
              if (isRecordingRef.current) {
                recordedFramesRef.current.push(base64);
                recordedTimestampsRef.current.push(Date.now());
              }
            }
          } catch {
            // Ignore frame errors
          }
        }, 33); // ~30fps

        return true;
      } else {
        setError(result?.error || 'Failed to start live view');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCameraV2] StartLiveView error:', err);
      setError(err.message || 'Failed to start live view');
      return false;
    }
  }, [canonApi]);

  /**
   * Take a picture and get base64 data
   * This uses the event-based capture with shutter only (NO Live View fallback)
   */
  const takePicture = useCallback(async (): Promise<CaptureResult> => {
    if (!canonApi) {
      return { success: false, error: 'Canon V2 API not available' };
    }

    try {
      setError(null);
      setIsCapturing(true);
      console.log('[useCanonCameraV2] Taking picture with shutter...');

      const result = await canonApi.takePicture();

      if (result?.success && result.imageData) {
        const imageData = result.imageData.startsWith('data:')
          ? result.imageData
          : `data:image/jpeg;base64,${result.imageData}`;

        // Calculate file size
        const base64Data = imageData.split(',')[1] || imageData;
        const sizeInBytes = (base64Data.length * 3) / 4;
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

        console.log(`[useCanonCameraV2] ✅ Shutter capture SUCCESS - Size: ${sizeInMB} MB`);

        return {
          success: true,
          imageData,
        };
      } else {
        const errorMsg = result?.error || 'Shutter capture failed';
        console.error(`[useCanonCameraV2] ❌ Shutter capture FAILED: ${errorMsg}`);
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('[useCanonCameraV2] ❌ Shutter capture ERROR:', err);
      const errorMsg = err.message || 'Shutter capture failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsCapturing(false);
    }
  }, [canonApi]);

  /**
   * Take a picture and save to file
   */
  const takePictureToFile = useCallback(async (savePath: string): Promise<CaptureResult> => {
    if (!canonApi) {
      return { success: false, error: 'Canon V2 API not available' };
    }

    try {
      setError(null);
      setIsCapturing(true);
      console.log('[useCanonCameraV2] Taking picture to file:', savePath);

      const result = await canonApi.takePictureToFile(savePath);
      console.log('[useCanonCameraV2] Capture to file result:', result);

      if (result?.success) {
        return {
          success: true,
          imagePath: result.imagePath,
        };
      } else {
        const errorMsg = result?.error || 'Failed to capture image';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('[useCanonCameraV2] Capture to file error:', err);
      const errorMsg = err.message || 'Failed to capture image';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsCapturing(false);
    }
  }, [canonApi]);

  /**
   * Start recording live view frames for video/boomerang
   */
  const startFrameRecording = useCallback(() => {
    console.log('[useCanonCameraV2] Starting frame recording...');
    recordedFramesRef.current = [];
    recordedTimestampsRef.current = [];
    isRecordingRef.current = true;
    setIsRecordingFrames(true);
  }, []);

  /**
   * Stop recording and return captured frames
   */
  const stopFrameRecording = useCallback((): FrameRecording => {
    console.log('[useCanonCameraV2] Stopping frame recording, captured', recordedFramesRef.current.length, 'frames');
    isRecordingRef.current = false;
    setIsRecordingFrames(false);

    const recording: FrameRecording = {
      frames: [...recordedFramesRef.current],
      timestamps: [...recordedTimestampsRef.current],
    };

    // Clear refs
    recordedFramesRef.current = [];
    recordedTimestampsRef.current = [];

    return recording;
  }, []);

  /**
   * Get current live view frame (for snapshot during countdown)
   * Uses ref instead of state for more reliable instant capture
   */
  const getCurrentFrame = useCallback((): string | null => {
    // Use ref first (most up-to-date), fallback to state
    return latestFrameRef.current || liveViewFrame;
  }, [liveViewFrame]);

  /**
   * Cleanup all resources
   */
  const cleanup = useCallback(async (): Promise<void> => {
    isCleanedUpRef.current = true;
    isRecordingRef.current = false;

    if (liveViewIntervalRef.current) {
      clearInterval(liveViewIntervalRef.current);
      liveViewIntervalRef.current = null;
    }

    await disconnect();
  }, [disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCleanedUpRef.current = true;
      isRecordingRef.current = false;
      if (liveViewIntervalRef.current) {
        clearInterval(liveViewIntervalRef.current);
      }
    };
  }, []);

  return {
    // State
    isInitialized,
    isConnected,
    isLiveViewActive,
    cameraInfo,
    cameraList,
    error,
    liveViewFrame,
    isRecordingFrames,
    isCapturing,

    // Actions
    initialize,
    connect,
    disconnect,
    startLiveView,
    stopLiveView,
    takePicture,
    takePictureToFile,
    cleanup,
    refreshCameraList,

    // Frame recording
    startFrameRecording,
    stopFrameRecording,
    getCurrentFrame,
  };
}
