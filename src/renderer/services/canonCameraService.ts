/**
 * Canon Camera Service
 *
 * Service for interacting with Canon cameras via EDSDK in renderer process.
 * All operations are proxied through IPC to the main process.
 */

import type {
  CameraInfo,
  CaptureResult,
  LiveViewFrame,
  FullConnectResult,
  PropertyIds,
} from '../types/canonCamera';

/**
 * Get Canon camera API from electron
 */
function getCanonApi() {
  if (!window.electron?.canonCamera) {
    throw new Error('Canon camera API not available');
  }
  return window.electron.canonCamera;
}

/**
 * Initialize Canon EDSDK
 * Must be called before any other operations
 */
export async function initializeCanonSdk(): Promise<boolean> {
  try {
    return await getCanonApi().initialize();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to initialize:', error);
    return false;
  }
}

/**
 * Terminate Canon EDSDK
 * Call when done using the camera
 */
export async function terminateCanonSdk(): Promise<boolean> {
  try {
    return await getCanonApi().terminate();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to terminate:', error);
    return false;
  }
}

/**
 * Check if SDK is initialized
 */
export async function isSdkInitialized(): Promise<boolean> {
  try {
    return await getCanonApi().isInitialized();
  } catch (error) {
    return false;
  }
}

/**
 * Get list of connected Canon cameras
 */
export async function getCameraList(): Promise<CameraInfo[]> {
  try {
    return await getCanonApi().getCameraList();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to get camera list:', error);
    return [];
  }
}

/**
 * Connect to first available camera
 */
export async function connectCamera(): Promise<CameraInfo | null> {
  try {
    return await getCanonApi().connect();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to connect:', error);
    return null;
  }
}

/**
 * Connect to camera by index
 */
export async function connectCameraByIndex(
  index: number,
): Promise<CameraInfo | null> {
  try {
    return await getCanonApi().connectByIndex(index);
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to connect by index:', error);
    return null;
  }
}

/**
 * Open camera session
 */
export async function openSession(): Promise<boolean> {
  try {
    return await getCanonApi().openSession();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to open session:', error);
    return false;
  }
}

/**
 * Close camera session
 */
export async function closeSession(): Promise<boolean> {
  try {
    return await getCanonApi().closeSession();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to close session:', error);
    return false;
  }
}

/**
 * Check if camera is connected
 */
export async function isCameraConnected(): Promise<boolean> {
  try {
    return await getCanonApi().isConnected();
  } catch (error) {
    return false;
  }
}

/**
 * Check if session is open
 */
export async function isSessionOpen(): Promise<boolean> {
  try {
    return await getCanonApi().isSessionOpen();
  } catch (error) {
    return false;
  }
}

/**
 * Take a picture and save to specified path
 */
export async function takePicture(savePath: string): Promise<CaptureResult> {
  try {
    return await getCanonApi().takePicture(savePath);
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to take picture:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Capture to buffer (for direct use in memory)
 */
export async function captureToBuffer(): Promise<CaptureResult> {
  try {
    return await getCanonApi().captureToBuffer();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to capture to buffer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Start live view
 */
export async function startLiveView(): Promise<boolean> {
  try {
    return await getCanonApi().startLiveView();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to start live view:', error);
    return false;
  }
}

/**
 * Stop live view
 */
export async function stopLiveView(): Promise<boolean> {
  try {
    return await getCanonApi().stopLiveView();
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to stop live view:', error);
    return false;
  }
}

/**
 * Get live view frame
 */
export async function getLiveViewFrame(): Promise<LiveViewFrame | null> {
  try {
    return await getCanonApi().getLiveViewFrame();
  } catch (error) {
    return null;
  }
}

/**
 * Get camera property
 */
export async function getProperty(propertyId: number): Promise<number | null> {
  try {
    return await getCanonApi().getProperty(propertyId);
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to get property:', error);
    return null;
  }
}

/**
 * Set camera property
 */
export async function setProperty(
  propertyId: number,
  value: number,
): Promise<boolean> {
  try {
    return await getCanonApi().setProperty(propertyId, value);
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to set property:', error);
    return false;
  }
}

/**
 * Get battery level
 */
export async function getBatteryLevel(): Promise<number | null> {
  try {
    return await getCanonApi().getBatteryLevel();
  } catch (error) {
    return null;
  }
}

/**
 * Get available shots
 */
export async function getAvailableShots(): Promise<number | null> {
  try {
    return await getCanonApi().getAvailableShots();
  } catch (error) {
    return null;
  }
}

/**
 * Get ISO
 */
export async function getIso(): Promise<number | null> {
  try {
    return await getCanonApi().getIso();
  } catch (error) {
    return null;
  }
}

/**
 * Set ISO
 */
export async function setIso(value: number): Promise<boolean> {
  try {
    return await getCanonApi().setIso(value);
  } catch (error) {
    console.error('❌ [CanonCameraService] Failed to set ISO:', error);
    return false;
  }
}

/**
 * Get SDK version
 */
export async function getSdkVersion(): Promise<string> {
  try {
    return await getCanonApi().getSdkVersion();
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Get property IDs
 */
export async function getPropertyIds(): Promise<PropertyIds | null> {
  try {
    return await getCanonApi().getPropertyIds();
  } catch (error) {
    return null;
  }
}

/**
 * Full connect flow: initialize -> get list -> connect -> open session
 * Convenient method for quick camera setup
 */
export async function fullConnect(): Promise<FullConnectResult> {
  try {
    return await getCanonApi().fullConnect();
  } catch (error) {
    console.error('❌ [CanonCameraService] Full connect failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Full disconnect flow: close session -> terminate
 */
export async function fullDisconnect(): Promise<{ success: boolean; error?: string }> {
  try {
    return await getCanonApi().fullDisconnect();
  } catch (error) {
    console.error('❌ [CanonCameraService] Full disconnect failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Export all functions as default object
export default {
  initializeCanonSdk,
  terminateCanonSdk,
  isSdkInitialized,
  getCameraList,
  connectCamera,
  connectCameraByIndex,
  openSession,
  closeSession,
  isCameraConnected,
  isSessionOpen,
  takePicture,
  captureToBuffer,
  startLiveView,
  stopLiveView,
  getLiveViewFrame,
  getProperty,
  setProperty,
  getBatteryLevel,
  getAvailableShots,
  getIso,
  setIso,
  getSdkVersion,
  getPropertyIds,
  fullConnect,
  fullDisconnect,
};
