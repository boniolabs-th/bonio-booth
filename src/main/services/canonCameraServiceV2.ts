/**
 * Canon Camera Service V2
 *
 * ใช้ canon-edsdk wrapper (Rust/napi-rs) ที่เขียนเอง
 * รองรับ Canon EOS cameras รวมถึง EOS R50 ผ่าน USB connection
 */
import { ipcMain } from 'electron';
import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// Declare __non_webpack_require__ for TypeScript
declare const __non_webpack_require__: NodeRequire | undefined;

// Configure log prefix
const canonLog = log.scope('CanonCameraV2');

// =============================================================================
// Types
// =============================================================================

export interface CameraInfo {
  name: string;
  portName: string;
  serialNumber?: string;
}

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
  imageData?: string; // base64
}

// Import types from canon-edsdk
interface CanonEdsdk {
  initializeSdk: (dllPath?: string | null) => boolean;
  terminateSdk: () => boolean;
  isSdkInitialized: () => boolean;
  getCameraList: () => Array<{ name: string; portName: string; deviceSubType: number; bodyId?: string }>;
  connectCamera: () => { name: string; portName: string; deviceSubType: number; bodyId?: string };
  connectCameraByIndex: (index: number) => { name: string; portName: string; deviceSubType: number; bodyId?: string };
  openSession: () => boolean;
  closeSession: () => boolean;
  disconnectCamera: () => boolean;
  isCameraConnected: () => boolean;
  isSessionOpen: () => boolean;
  takePicture: (savePath: string) => Promise<{ success: boolean; filePath?: string; error?: string; imageData?: Buffer }>;
  captureToBuffer: () => Promise<{ success: boolean; filePath?: string; error?: string; imageData?: Buffer }>;
  pressShutterButton: (pressType: number) => boolean;
  startLiveView: () => boolean;
  stopLiveView: () => boolean;
  getLiveViewFrame: () => { width: number; height: number; data: Buffer } | null;
  getProperty: (propertyId: number) => number | null;
  setProperty: (propertyId: number, value: number) => boolean;
  getIso: () => number | null;
  setIso: (value: number) => boolean;
  getAperture: () => number | null;
  setAperture: (value: number) => boolean;
  getShutterSpeed: () => number | null;
  setShutterSpeed: (value: number) => boolean;
  getBatteryLevel: () => number | null;
  getAvailableShots: () => number | null;
  processEvents: () => boolean;
  getSdkVersion: () => string;
  getEdsdkDllPath: () => string;
  shutter_button: {
    OFF: number;
    HALFWAY: number;
    COMPLETELY: number;
    HALFWAY_NON_AF: number;
    COMPLETELY_NON_AF: number;
  };
  property_ids: {
    ISO_SPEED: number;
    APERTURE: number;
    SHUTTER_SPEED: number;
    WHITE_BALANCE: number;
    EXPOSURE_COMPENSATION: number;
    IMAGE_QUALITY: number;
    BATTERY_LEVEL: number;
    AVAILABLE_SHOTS: number;
    AE_MODE: number;
    DRIVE_MODE: number;
    METERING_MODE: number;
    AF_MODE: number;
  };
}

// =============================================================================
// State
// =============================================================================

let sdk: CanonEdsdk | null = null;
let isInitialized = false;
let eventPollInterval: NodeJS.Timeout | null = null;

// Capture state
let isCapturing = false;
let captureNumber = 0;
let lastCaptureTime = 0;
let wasLiveViewActive = false;

// =============================================================================
// Initialize
// =============================================================================

export function initializeCanonCameraV2(): boolean {
  if (isInitialized && sdk) {
    canonLog.info('Already initialized');
    return true;
  }

  try {
    // Dynamic import of canon-edsdk from local native folder
    // In development: webpack bundles to .erb/dll/, so we need to use app.getAppPath()
    // In production: extraResources copies native folder to resources/native
    const isPackaged = app.isPackaged;
    let nativePath: string;

    canonLog.info(`app.isPackaged: ${isPackaged}`);
    canonLog.info(`process.resourcesPath: ${process.resourcesPath}`);
    canonLog.info(`app.getAppPath(): ${app.getAppPath()}`);

    if (isPackaged) {
      // Production: native module is in resources/native (via extraResources)
      nativePath = path.join(process.resourcesPath, 'native', 'index.js');
    } else {
      // Development: native module is in src/main/native
      nativePath = path.join(app.getAppPath(), 'src', 'main', 'native', 'index.js');
    }

    canonLog.info(`Loading native module from: ${nativePath}`);

    // Use __non_webpack_require__ to bypass webpack bundling
    // This allows loading native modules at runtime from filesystem
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
    sdk = nodeRequire(nativePath) as CanonEdsdk;

    // Get EDSDK DLL path - MUST be the FULL PATH to EDSDK.dll file, not just the folder!
    // The Rust wrapper uses LoadLibraryA which requires the exact file path
    let edsdkDllPath: string;

    if (isPackaged) {
      // In production, EDSDK.dll is in resources/native (copied with native module)
      edsdkDllPath = path.join(process.resourcesPath, 'native', 'EDSDK.dll');
    } else {
      // In development, use assets folder
      edsdkDllPath = path.join(app.getAppPath(), 'assets', 'EDSDK', 'Dll', 'EDSDK.dll');
    }

    canonLog.info(`Initializing SDK with DLL path: ${edsdkDllPath}`);

    // Initialize the SDK
    const result = sdk.initializeSdk(edsdkDllPath);

    if (result) {
      isInitialized = true;
      canonLog.info('canon-edsdk initialized successfully');
      canonLog.info(`SDK Version: ${sdk.getSdkVersion()}`);
      return true;
    } else {
      canonLog.error('Failed to initialize canon-edsdk SDK');
      return false;
    }
  } catch (error) {
    canonLog.error('Failed to load canon-edsdk:', error);
    return false;
  }
}

// =============================================================================
// Camera Functions
// =============================================================================

export function getCameraList(): CameraInfo[] {
  if (!isInitialized || !sdk) {
    canonLog.error('SDK not initialized');
    return [];
  }

  try {
    const cameras = sdk.getCameraList();
    canonLog.info(`Found ${cameras.length} camera(s)`);
    return cameras.map((cam) => ({
      name: cam.name || 'Canon Camera',
      portName: cam.portName || '',
      serialNumber: cam.bodyId,
    }));
  } catch (error) {
    canonLog.error('Failed to get camera list:', error);
    return [];
  }
}

export function connectCamera(): CameraInfo | null {
  if (!isInitialized || !sdk) {
    canonLog.error('SDK not initialized');
    return null;
  }

  try {
    // Connect to first available camera
    const camera = sdk.connectCamera();
    canonLog.info(`Connected to camera: ${camera.name}`);

    // Open session
    const sessionOpened = sdk.openSession();
    if (!sessionOpened) {
      canonLog.error('Failed to open camera session');
      sdk.disconnectCamera();
      return null;
    }

    canonLog.info('Camera session opened');

    // Start event polling
    startEventPolling();

    return {
      name: camera.name || 'Canon Camera',
      portName: camera.portName || '',
      serialNumber: camera.bodyId,
    };
  } catch (error) {
    canonLog.error('Failed to connect camera:', error);
    return null;
  }
}

export function disconnectCamera(): boolean {
  if (!sdk) {
    return true;
  }

  try {
    // Stop event polling
    stopEventPolling();

    // Close session
    if (sdk.isSessionOpen()) {
      sdk.closeSession();
    }

    // Disconnect
    if (sdk.isCameraConnected()) {
      sdk.disconnectCamera();
    }

    canonLog.info('Camera disconnected');
    return true;
  } catch (error) {
    canonLog.error('Failed to disconnect camera:', error);
    return false;
  }
}

export function isCameraConnected(): boolean {
  return sdk?.isCameraConnected() ?? false;
}

/**
 * ตรวจสอบว่า Canon SDK ถูก initialize แล้วหรือยัง
 * ใช้เพื่อแยกกรณี "SDK ยังไม่ได้ init" ออกจาก "กล้องถูกถอด"
 */
export function isCanonSdkInitialized(): boolean {
  return isInitialized && sdk !== null;
}

// =============================================================================
// Event Polling
// =============================================================================

function startEventPolling(): void {
  if (eventPollInterval) {
    return;
  }

  eventPollInterval = setInterval(() => {
    if (sdk && sdk.isCameraConnected()) {
      try {
        sdk.processEvents();
      } catch (error) {
        // Ignore event processing errors
      }
    }
  }, 100); // Poll every 100ms

  canonLog.info('Event polling started');
}

function stopEventPolling(): void {
  if (eventPollInterval) {
    clearInterval(eventPollInterval);
    eventPollInterval = null;
    canonLog.info('Event polling stopped');
  }
}

// =============================================================================
// Capture Functions
// =============================================================================

/**
 * Take picture and return base64 image data
 */
export async function takePicture(): Promise<CaptureResult> {
  if (!sdk || !sdk.isCameraConnected()) {
    return { success: false, error: 'No camera connected' };
  }

  // Prevent concurrent captures
  if (isCapturing) {
    canonLog.warn('Capture already in progress');
    return { success: false, error: 'Capture already in progress' };
  }

  // Enforce minimum delay between captures (2 seconds)
  const now = Date.now();
  const timeSinceLastCapture = now - lastCaptureTime;
  if (lastCaptureTime > 0 && timeSinceLastCapture < 2000) {
    const waitTime = 2000 - timeSinceLastCapture;
    canonLog.info(`⏳ Waiting ${waitTime}ms before next capture...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  captureNumber++;
  const currentCapture = captureNumber;
  lastCaptureTime = Date.now();
  isCapturing = true;

  canonLog.info(`Starting capture #${currentCapture}...`);

  try {
    // Check if Live View is active and stop it for capture
    wasLiveViewActive = false;
    try {
      // Try to stop live view - if it was active, we'll restart it after
      sdk.stopLiveView();
      wasLiveViewActive = true;
      canonLog.info('Stopped Live View for capture');
      // Wait for camera to stabilize
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch {
      // Live view wasn't active, that's fine
    }

    // Capture to buffer
    canonLog.info('Capturing to buffer...');
    const result = await sdk.captureToBuffer();

    isCapturing = false;

    if (result.success && result.imageData) {
      const base64Data = result.imageData.toString('base64');
      const fileSizeMB = (base64Data.length * 3 / 4 / 1024 / 1024).toFixed(2);
      canonLog.info(`✅ Capture #${currentCapture} successful, size: ${fileSizeMB} MB`);

      // Restart Live View if it was active
      if (wasLiveViewActive) {
        setTimeout(() => {
          try {
            sdk?.startLiveView();
            canonLog.info('Live View restarted after capture');
          } catch (err) {
            canonLog.warn('Failed to restart Live View:', err);
          }
        }, 100);
      }

      return {
        success: true,
        imageData: base64Data,
      };
    } else {
      canonLog.error(`❌ Capture #${currentCapture} failed:`, result.error);

      // Restart Live View on failure
      if (wasLiveViewActive) {
        try {
          sdk?.startLiveView();
        } catch {}
      }

      return {
        success: false,
        error: result.error || 'Capture failed',
      };
    }
  } catch (error: any) {
    isCapturing = false;
    canonLog.error('takePicture error:', error);

    // Restart Live View on error
    if (wasLiveViewActive) {
      try {
        sdk?.startLiveView();
      } catch {}
    }

    return {
      success: false,
      error: error.message || 'Capture failed',
    };
  }
}

// =============================================================================
// Live View Functions
// =============================================================================

export function startLiveView(): boolean {
  if (!sdk || !sdk.isCameraConnected()) {
    canonLog.error('No camera connected for live view');
    return false;
  }

  try {
    const result = sdk.startLiveView();
    if (result) {
      canonLog.info('Live view started successfully');
    } else {
      canonLog.error('Failed to start live view');
    }
    return result;
  } catch (error) {
    canonLog.error('Failed to start live view:', error);
    return false;
  }
}

export function stopLiveView(): boolean {
  if (!sdk) {
    return true;
  }

  try {
    const result = sdk.stopLiveView();
    canonLog.info('Live view stopped');
    return result;
  } catch (error) {
    canonLog.error('Failed to stop live view:', error);
    return false;
  }
}

export function getLiveViewImage(): string | null {
  if (!sdk || !sdk.isCameraConnected()) {
    return null;
  }

  try {
    const frame = sdk.getLiveViewFrame();
    if (frame && frame.data) {
      // Convert buffer to base64 data URL
      const base64 = frame.data.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    }
    return null;
  } catch (error) {
    // Live view frame not available - this is normal during transitions
    return null;
  }
}

// =============================================================================
// Camera Properties
// =============================================================================

export function getBatteryLevel(): number | null {
  if (!sdk || !sdk.isCameraConnected()) {
    return null;
  }

  try {
    return sdk.getBatteryLevel();
  } catch {
    return null;
  }
}

export function getAvailableShots(): number | null {
  if (!sdk || !sdk.isCameraConnected()) {
    return null;
  }

  try {
    return sdk.getAvailableShots();
  } catch {
    return null;
  }
}

// =============================================================================
// Cleanup
// =============================================================================

export function terminateCanonCameraV2(): void {
  if (!sdk) {
    return;
  }

  try {
    stopEventPolling();

    if (sdk.isSessionOpen()) {
      sdk.closeSession();
    }

    if (sdk.isCameraConnected()) {
      sdk.disconnectCamera();
    }

    sdk.terminateSdk();
    isInitialized = false;
    sdk = null;
    canonLog.info('Canon SDK terminated');
  } catch (error) {
    canonLog.error('Error terminating SDK:', error);
  }
}

// =============================================================================
// IPC Handlers
// =============================================================================

export function registerCanonCameraV2IpcHandlers(): void {
  // Initialize
  ipcMain.handle('canon-v2:initialize', async () => {
    try {
      const result = initializeCanonCameraV2();
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get camera list
  ipcMain.handle('canon-v2:getCameraList', async () => {
    try {
      const cameras = getCameraList();
      return { success: true, cameras };
    } catch (error: any) {
      return { success: false, error: error.message, cameras: [] };
    }
  });

  // Connect
  ipcMain.handle('canon-v2:connect', async (_event, _cameraIndex?: number) => {
    try {
      const result = connectCamera();
      return { success: result !== null, camera: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Disconnect
  ipcMain.handle('canon-v2:disconnect', async () => {
    try {
      disconnectCamera();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Is connected
  ipcMain.handle('canon-v2:isConnected', async () => {
    return { success: true, connected: isCameraConnected() };
  });

  // Take picture
  ipcMain.handle('canon-v2:takePicture', async () => {
    try {
      const result = await takePicture();
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Start live view
  ipcMain.handle('canon-v2:startLiveView', async () => {
    try {
      const result = startLiveView();
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Stop live view
  ipcMain.handle('canon-v2:stopLiveView', async () => {
    try {
      stopLiveView();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get live view image
  ipcMain.handle('canon-v2:getLiveViewImage', async () => {
    try {
      const imageData = getLiveViewImage();
      if (imageData) {
        return { success: true, imageData };
      }
      return { success: false, error: 'No live view frame available' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get battery level
  ipcMain.handle('canon-v2:getBatteryLevel', async () => {
    try {
      const level = getBatteryLevel();
      return { success: true, level };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get available shots
  ipcMain.handle('canon-v2:getAvailableShots', async () => {
    try {
      const shots = getAvailableShots();
      return { success: true, shots };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  canonLog.info('Canon Camera V2 IPC handlers registered');
}
