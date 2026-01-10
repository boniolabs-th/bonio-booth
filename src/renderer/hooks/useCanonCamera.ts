/**
 * Custom hook for Canon Camera operations
 * Uses Canon EDSDK via IPC to main process
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface CanonCameraInfo {
  name: string;
  portName: string;
  deviceSubType: number;
  bodyId?: string;
}

interface CaptureResult {
  success: boolean;
  imagePath?: string;
  imageData?: string; // Base64 encoded image
  error?: string;
}

interface FrameRecording {
  frames: string[]; // Base64 JPEG frames
  timestamps: number[];
}

interface UseCanonCameraReturn {
  // State
  isInitialized: boolean;
  isConnected: boolean;
  isSessionOpen: boolean;
  isLiveViewActive: boolean;
  cameraInfo: CanonCameraInfo | null;
  batteryLevel: number | null;
  error: string | null;
  liveViewFrame: string | null; // Base64 JPEG frame
  isRecordingFrames: boolean;

  // Actions
  initialize: () => Promise<boolean>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  startLiveView: () => Promise<boolean>;
  stopLiveView: () => Promise<void>;
  takePicture: (savePath?: string) => Promise<CaptureResult>;
  cleanup: () => Promise<void>;

  // Frame recording for video/boomerang
  startFrameRecording: () => void;
  stopFrameRecording: () => FrameRecording;
  getCurrentFrame: () => string | null;
}

export default function useCanonCamera(): UseCanonCameraReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isLiveViewActive, setIsLiveViewActive] = useState(false);
  const [cameraInfo, setCameraInfo] = useState<CanonCameraInfo | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);
  const [isRecordingFrames, setIsRecordingFrames] = useState(false);

  const liveViewIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef(false);

  // Frame recording refs
  const recordedFramesRef = useRef<string[]>([]);
  const recordedTimestampsRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);

  // Get electron API
  // @ts-ignore
  const canonApi = window.electron?.canonCamera;

  /**
   * Initialize Canon SDK
   */
  const initialize = useCallback(async (): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCamera] Initializing SDK...');

      const result = await canonApi.initialize();
      console.log('[useCanonCamera] Initialize result:', result);

      if (result) {
        setIsInitialized(true);
        return true;
      } else {
        setError('Failed to initialize Canon SDK');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCamera] Initialize error:', err);
      setError(err.message || 'Failed to initialize Canon SDK');
      return false;
    }
  }, [canonApi]);

  /**
   * Connect to first available camera and open session
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCamera] Connecting to camera...');

      // Use fullConnect which does: initialize -> getCameraList -> connect -> openSession
      const result = await canonApi.fullConnect();
      console.log('[useCanonCamera] FullConnect result:', result);

      if (result?.success) {
        setIsInitialized(true);
        setIsConnected(true);
        setIsSessionOpen(true);

        if (result.camera) {
          setCameraInfo(result.camera);
        }
        if (result.batteryLevel !== undefined) {
          setBatteryLevel(result.batteryLevel);
        }

        return true;
      } else {
        setError(result?.error || 'Failed to connect to camera');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCamera] Connect error:', err);
      setError(err.message || 'Failed to connect to camera');
      return false;
    }
  }, [canonApi]);

  /**
   * Disconnect camera
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (!canonApi) return;

    try {
      console.log('[useCanonCamera] Disconnecting...');

      // Stop live view first
      if (isLiveViewActive) {
        await stopLiveView();
      }

      await canonApi.fullDisconnect();

      setIsConnected(false);
      setIsSessionOpen(false);
      setIsInitialized(false);
      setCameraInfo(null);
      setBatteryLevel(null);
    } catch (err: any) {
      console.error('[useCanonCamera] Disconnect error:', err);
    }
  }, [canonApi, isLiveViewActive]);

  /**
   * Start live view and begin frame polling
   */
  const startLiveView = useCallback(async (): Promise<boolean> => {
    if (!canonApi) {
      setError('Canon API not available');
      return false;
    }

    try {
      setError(null);
      console.log('[useCanonCamera] Starting live view...');

      const result = await canonApi.startLiveView();
      console.log('[useCanonCamera] StartLiveView result:', result);

      if (result) {
        setIsLiveViewActive(true);

        // Start polling for live view frames
        if (liveViewIntervalRef.current) {
          clearInterval(liveViewIntervalRef.current);
        }

        liveViewIntervalRef.current = setInterval(async () => {
          if (isCleanedUpRef.current) return;

          try {
            const frame = await canonApi.getLiveViewFrame();
            if (frame?.data) {
              // Convert buffer to base64
              const base64 = `data:image/jpeg;base64,${frame.data}`;
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
        setError('Failed to start live view');
        return false;
      }
    } catch (err: any) {
      console.error('[useCanonCamera] StartLiveView error:', err);
      setError(err.message || 'Failed to start live view');
      return false;
    }
  }, [canonApi]);

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
      console.log('[useCanonCamera] Stopping live view...');
      await canonApi.stopLiveView();
      setIsLiveViewActive(false);
      setLiveViewFrame(null);
    } catch (err: any) {
      console.error('[useCanonCamera] StopLiveView error:', err);
    }
  }, [canonApi]);

  /**
   * Take a picture
   */
  const takePicture = useCallback(async (savePath?: string): Promise<CaptureResult> => {
    if (!canonApi) {
      return { success: false, error: 'Canon API not available' };
    }

    try {
      setError(null);
      console.log('[useCanonCamera] Taking picture...');

      let result;
      if (savePath) {
        result = await canonApi.takePicture(savePath);
      } else {
        result = await canonApi.captureToBuffer();
      }

      console.log('[useCanonCamera] Capture result:', result);

      if (result?.success) {
        return {
          success: true,
          imagePath: result.imagePath,
          imageData: result.imageData ? `data:image/jpeg;base64,${result.imageData}` : undefined,
        };
      } else {
        const errorMsg = result?.error || 'Failed to capture image';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('[useCanonCamera] Capture error:', err);
      const errorMsg = err.message || 'Failed to capture image';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [canonApi]);

  /**
   * Start recording live view frames for video/boomerang
   */
  const startFrameRecording = useCallback(() => {
    console.log('[useCanonCamera] Starting frame recording...');
    recordedFramesRef.current = [];
    recordedTimestampsRef.current = [];
    isRecordingRef.current = true;
    setIsRecordingFrames(true);
  }, []);

  /**
   * Stop recording and return captured frames
   */
  const stopFrameRecording = useCallback((): FrameRecording => {
    console.log('[useCanonCamera] Stopping frame recording, captured', recordedFramesRef.current.length, 'frames');
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
   */
  const getCurrentFrame = useCallback((): string | null => {
    return liveViewFrame;
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
    isSessionOpen,
    isLiveViewActive,
    cameraInfo,
    batteryLevel,
    error,
    liveViewFrame,
    isRecordingFrames,

    // Actions
    initialize,
    connect,
    disconnect,
    startLiveView,
    stopLiveView,
    takePicture,
    cleanup,

    // Frame recording
    startFrameRecording,
    stopFrameRecording,
    getCurrentFrame,
  };
}
