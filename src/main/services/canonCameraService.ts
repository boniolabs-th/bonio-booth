/**
 * Canon Camera Service
 *
 * บริการสำหรับจัดการกล้อง Canon ผ่าน EDSDK
 * รองรับ Canon EOS cameras รวมถึง EOS R50 ผ่าน USB connection
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import log from 'electron-log';

// Configure log prefix
const canonLog = log.scope('CanonCamera');

// =============================================================================
// Types (ต้อง define เองเพราะไม่มี TypeScript source แล้ว)
// =============================================================================

export interface CameraInfo {
  name: string;
  portName: string;
  deviceSubType: number;
  bodyId?: string;
}

export interface CaptureSettings {
  iso?: number;
  aperture?: number;
  shutterSpeed?: number;
  whiteBalance?: number;
  imageQuality?: number;
}

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
  imageData?: Buffer;
}

export interface LiveViewFrame {
  width: number;
  height: number;
  data: Buffer;
}

export type CameraEventType =
  | 'Connected'
  | 'Disconnected'
  | 'PropertyChanged'
  | 'ObjectCreated'
  | 'CaptureComplete'
  | 'ShutdownRequested'
  | 'Error';

export interface CameraEvent {
  eventType: CameraEventType;
  message?: string;
  data?: string;
}

// =============================================================================
// Native Module Interface
// =============================================================================

interface CanonEdsdkModule {
  initializeSdk(dllPath?: string): boolean;
  terminateSdk(): boolean;
  isSdkInitialized(): boolean;
  getCameraList(): CameraInfo[];
  connectCamera(): CameraInfo;
  connectCameraByIndex(index: number): CameraInfo;
  openSession(): boolean;
  closeSession(): boolean;
  disconnectCamera(): boolean;
  isCameraConnected(): boolean;
  isSessionOpen(): boolean;
  takePicture(savePath: string): Promise<CaptureResult>;
  captureToBuffer(): Promise<CaptureResult>;
  pressShutterButton(pressType: number): boolean;
  startLiveView(): boolean;
  stopLiveView(): boolean;
  getLiveViewFrame(): LiveViewFrame | null;
  getProperty(propertyId: number): number | null;
  setProperty(propertyId: number, value: number): boolean;
  getIso(): number | null;
  setIso(value: number): boolean;
  getAperture(): number | null;
  setAperture(value: number): boolean;
  getShutterSpeed(): number | null;
  setShutterSpeed(value: number): boolean;
  getBatteryLevel(): number | null;
  getAvailableShots(): number | null;
  processEvents(): boolean;
  getSdkVersion(): string;
  getEdsdkDllPath(): string;
  propertyIds: {
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
  shutterButton: {
    OFF: number;
    HALFWAY: number;
    COMPLETELY: number;
    HALFWAY_NON_AF: number;
    COMPLETELY_NON_AF: number;
  };
}

// Lazy load native module
let canonModule: CanonEdsdkModule | null = null;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');

/**
 * Get native module path - tries multiple locations for dev/production
 */
function getNativeModulePath(): string {
  const indexFileName = 'index.js';

  const possiblePaths = [
    // Development: src/main/native/ (using process.cwd() since __dirname points to .erb/dll in dev)
    path.join(process.cwd(), 'src', 'main', 'native', indexFileName),
    // Development fallback: relative to __dirname (works if running from src)
    path.join(__dirname, '..', 'native', indexFileName),
    // Production (extraResources): resources/native/
    path.join(process.resourcesPath || '', 'native', indexFileName),
    // Production alternative: next to exe in resources
    path.join(path.dirname(app.getPath('exe')), 'resources', 'native', indexFileName),
    // Production (asar unpacked): resources/app.asar.unpacked/dist/main/native/
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'main', 'native', indexFileName),
    // Production alternative: next to exe
    path.join(path.dirname(app.getPath('exe')), 'resources', 'app.asar.unpacked', 'dist', 'main', 'native', indexFileName),
    // Portable: same directory as exe
    path.join(path.dirname(app.getPath('exe')), indexFileName),
  ];

  for (const nodePath of possiblePaths) {
    canonLog.info(`Checking native module at: ${nodePath}`);
    if (fs.existsSync(nodePath)) {
      canonLog.info(`Found native module at: ${nodePath}`);
      return nodePath;
    }
  }

  // Return first path as fallback (will throw error on load)
  canonLog.warn('Native module not found in any location');
  return possiblePaths[0];
}

// Use __non_webpack_require__ to bypass webpack's module resolution
// This is necessary for native modules that are unpacked from asar
declare const __non_webpack_require__: NodeRequire;
const nativeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;

function getCanonModule(): CanonEdsdkModule {
  if (!canonModule) {
    try {
      // Load .node file directly using native require (bypass webpack)
      const nodeFilePath = getNativeModulePath();
      canonLog.info('Loading native module with nativeRequire from:', nodeFilePath);
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      canonModule = nativeRequire(nodeFilePath) as CanonEdsdkModule;
      canonLog.info('Native module loaded successfully');
    } catch (error) {
      canonLog.error('Failed to load native module:', error);
      throw error;
    }
  }
  if (!canonModule) {
    throw new Error('Canon EDSDK module not loaded');
  }
  return canonModule;
}

// Service state
let isInitialized = false;
let eventPollingInterval: NodeJS.Timeout | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Get EDSDK DLL path
 */
function getEdsdkDllPath(): string {
  // Check multiple possible locations
  const possiblePaths = [
    // Production: resources/native folder (extraResources copies DLLs with native module)
    path.join(process.resourcesPath || '', 'native', 'EDSDK.dll'),
    // Development: assets folder in project root
    path.join(process.cwd(), 'assets', 'EDSDK', 'Dll', 'EDSDK.dll'),
    // Production: resources/assets folder (extraResources)
    path.join(process.resourcesPath || '', 'assets', 'EDSDK', 'Dll', 'EDSDK.dll'),
    // Production alternative: next to exe
    path.join(path.dirname(app.getPath('exe')), 'resources', 'assets', 'EDSDK', 'Dll', 'EDSDK.dll'),
    // User data folder
    path.join(app.getPath('userData'), 'EDSDK', 'Dll', 'EDSDK.dll'),
    // Executable directory
    path.join(path.dirname(app.getPath('exe')), 'assets', 'EDSDK', 'Dll', 'EDSDK.dll'),
  ];

  for (const dllPath of possiblePaths) {
    canonLog.info(`Checking EDSDK.dll at: ${dllPath}`);
    if (fs.existsSync(dllPath)) {
      canonLog.info(`Found EDSDK.dll at: ${dllPath}`);
      return dllPath;
    }
  }

  // Default fallback
  canonLog.warn('EDSDK.dll not found, using default path');
  return possiblePaths[0];
}

/**
 * Initialize Canon EDSDK
 */
export async function initializeCanonSdk(): Promise<boolean> {
  if (isInitialized) {
    canonLog.info('SDK already initialized');
    return true;
  }

  try {
    const canon = getCanonModule();
    const dllPath = getEdsdkDllPath();

    canonLog.info(`Initializing SDK with DLL: ${dllPath}`);
    const result = canon.initializeSdk(dllPath);

    if (result) {
      isInitialized = true;
      canonLog.info('SDK initialized successfully');
      startEventPolling();
    }

    return result;
  } catch (error) {
    canonLog.error('Failed to initialize SDK:', error);
    return false;
  }
}

/**
 * Terminate Canon EDSDK
 */
export function terminateCanonSdk(): boolean {
  if (!isInitialized) {
    canonLog.info('SDK not initialized');
    return true;
  }

  try {
    stopEventPolling();
    const canon = getCanonModule();
    const result = canon.terminateSdk();

    if (result) {
      isInitialized = false;
      canonLog.info('SDK terminated successfully');
    }

    return result;
  } catch (error) {
    canonLog.error('Failed to terminate SDK:', error);
    return false;
  }
}

/**
 * Check if SDK is initialized
 */
export function isSdkInitialized(): boolean {
  if (!canonModule) return false;
  return canonModule.isSdkInitialized();
}

/**
 * Get list of connected Canon cameras
 */
export function getCameraList(): CameraInfo[] {
  try {
    const canon = getCanonModule();
    const cameras = canon.getCameraList();
    canonLog.info(`Found ${cameras.length} camera(s)`);
    return cameras;
  } catch (error) {
    canonLog.error('Failed to get camera list:', error);
    return [];
  }
}

/**
 * Connect to first available camera
 */
export function connectCamera(): CameraInfo | null {
  try {
    const canon = getCanonModule();
    const camera = canon.connectCamera();
    canonLog.info(`Connected to: ${camera.name}`);
    return camera;
  } catch (error) {
    canonLog.error('Failed to connect camera:', error);
    return null;
  }
}

/**
 * Connect to camera by index
 */
export function connectCameraByIndex(index: number): CameraInfo | null {
  try {
    const canon = getCanonModule();
    const camera = canon.connectCameraByIndex(index);
    canonLog.info(`Connected to camera ${index}: ${camera.name}`);
    return camera;
  } catch (error) {
    canonLog.error(`Failed to connect camera at index ${index}:`, error);
    return null;
  }
}

/**
 * Open camera session
 */
export function openSession(): boolean {
  try {
    const canon = getCanonModule();
    const result = canon.openSession();
    if (result) {
      canonLog.info('Session opened');
    }
    return result;
  } catch (error) {
    canonLog.error('Failed to open session:', error);
    return false;
  }
}

/**
 * Close camera session
 */
export function closeSession(): boolean {
  try {
    const canon = getCanonModule();
    const result = canon.closeSession();
    if (result) {
      canonLog.info('Session closed');
    }
    return result;
  } catch (error) {
    canonLog.error('Failed to close session:', error);
    return false;
  }
}

/**
 * Check if camera is connected
 */
export function isCameraConnected(): boolean {
  if (!canonModule) return false;
  return canonModule.isCameraConnected();
}

/**
 * Check if session is open
 */
export function isSessionOpen(): boolean {
  if (!canonModule) return false;
  return canonModule.isSessionOpen();
}

/**
 * Take a picture
 */
export async function takePicture(savePath: string): Promise<CaptureResult> {
  try {
    const canon = getCanonModule();
    canonLog.info(`Taking picture, saving to: ${savePath}`);
    const result = await canon.takePicture(savePath);

    if (result.success) {
      canonLog.info('Picture taken successfully');
    } else {
      canonLog.error('Picture failed:', result.error);
    }

    return result;
  } catch (error) {
    canonLog.error('Failed to take picture:', error);
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
    const canon = getCanonModule();
    canonLog.info('Capturing to buffer');
    const result = await canon.captureToBuffer();

    if (result.success) {
      canonLog.info('Captured to buffer successfully');
    } else {
      canonLog.error('Capture to buffer failed:', result.error);
    }

    return result;
  } catch (error) {
    canonLog.error('Failed to capture to buffer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Start live view
 */
export function startLiveView(): boolean {
  try {
    const canon = getCanonModule();
    const result = canon.startLiveView();
    if (result) {
      canonLog.info('Live view started');
    }
    return result;
  } catch (error) {
    canonLog.error('Failed to start live view:', error);
    return false;
  }
}

/**
 * Stop live view
 */
export function stopLiveView(): boolean {
  try {
    const canon = getCanonModule();
    const result = canon.stopLiveView();
    if (result) {
      canonLog.info('Live view stopped');
    }
    return result;
  } catch (error) {
    canonLog.error('Failed to stop live view:', error);
    return false;
  }
}

/**
 * Get live view frame
 */
export function getLiveViewFrame(): LiveViewFrame | null {
  try {
    const canon = getCanonModule();
    return canon.getLiveViewFrame();
  } catch (error) {
    // Don't log every frame error
    return null;
  }
}

/**
 * Get camera property
 */
export function getProperty(propertyId: number): number | null {
  try {
    const canon = getCanonModule();
    return canon.getProperty(propertyId);
  } catch (error) {
    canonLog.error(`Failed to get property ${propertyId}:`, error);
    return null;
  }
}

/**
 * Set camera property
 */
export function setProperty(propertyId: number, value: number): boolean {
  try {
    const canon = getCanonModule();
    return canon.setProperty(propertyId, value);
  } catch (error) {
    canonLog.error(`Failed to set property ${propertyId}:`, error);
    return false;
  }
}

/**
 * Get battery level
 */
export function getBatteryLevel(): number | null {
  try {
    const canon = getCanonModule();
    return canon.getBatteryLevel();
  } catch (error) {
    return null;
  }
}

/**
 * Get available shots
 */
export function getAvailableShots(): number | null {
  try {
    const canon = getCanonModule();
    return canon.getAvailableShots();
  } catch (error) {
    return null;
  }
}

/**
 * Get ISO
 */
export function getIso(): number | null {
  try {
    const canon = getCanonModule();
    return canon.getIso();
  } catch (error) {
    return null;
  }
}

/**
 * Set ISO
 */
export function setIso(value: number): boolean {
  try {
    const canon = getCanonModule();
    return canon.setIso(value);
  } catch (error) {
    return false;
  }
}

/**
 * Get SDK version
 */
export function getSdkVersion(): string {
  try {
    const canon = getCanonModule();
    return canon.getSdkVersion();
  } catch (error) {
    return 'Unknown';
  }
}

/**
 * Start event polling for camera events
 */
function startEventPolling(): void {
  if (eventPollingInterval) return;

  eventPollingInterval = setInterval(() => {
    try {
      const canon = getCanonModule();
      canon.processEvents();
    } catch (error) {
      // Silently ignore polling errors
    }
  }, 100); // Poll every 100ms

  canonLog.info('Event polling started');
}

/**
 * Stop event polling
 */
function stopEventPolling(): void {
  if (eventPollingInterval) {
    clearInterval(eventPollingInterval);
    eventPollingInterval = null;
    canonLog.info('Event polling stopped');
  }
}

/**
 * Set main window for sending events
 */
export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

/**
 * Get property IDs
 */
export function getPropertyIds() {
  try {
    const canon = getCanonModule();
    return canon.propertyIds;
  } catch (error) {
    return null;
  }
}

// =============================================================================
// IPC Handlers Registration
// =============================================================================

/**
 * Register IPC handlers for Canon camera operations
 */
export function registerCanonCameraIpcHandlers(): void {
  // Initialize SDK
  ipcMain.handle('canon:initialize', async () => {
    return initializeCanonSdk();
  });

  // Terminate SDK
  ipcMain.handle('canon:terminate', () => {
    return terminateCanonSdk();
  });

  // Check if initialized
  ipcMain.handle('canon:isInitialized', () => {
    return isSdkInitialized();
  });

  // Get camera list
  ipcMain.handle('canon:getCameraList', () => {
    return getCameraList();
  });

  // Connect to first camera
  ipcMain.handle('canon:connect', () => {
    return connectCamera();
  });

  // Connect to camera by index
  ipcMain.handle('canon:connectByIndex', (_, index: number) => {
    return connectCameraByIndex(index);
  });

  // Open session
  ipcMain.handle('canon:openSession', () => {
    return openSession();
  });

  // Close session
  ipcMain.handle('canon:closeSession', () => {
    return closeSession();
  });

  // Check if connected
  ipcMain.handle('canon:isConnected', () => {
    return isCameraConnected();
  });

  // Check if session open
  ipcMain.handle('canon:isSessionOpen', () => {
    return isSessionOpen();
  });

  // Take picture
  ipcMain.handle('canon:takePicture', async (_, savePath: string) => {
    return takePicture(savePath);
  });

  // Capture to buffer (convert Buffer to base64 for IPC transfer)
  ipcMain.handle('canon:captureToBuffer', async () => {
    const result = await captureToBuffer();
    if (result.success && result.imageData) {
      return {
        ...result,
        imageData: result.imageData.toString('base64'),
      };
    }
    return result;
  });

  // Start live view
  ipcMain.handle('canon:startLiveView', () => {
    return startLiveView();
  });

  // Stop live view
  ipcMain.handle('canon:stopLiveView', () => {
    return stopLiveView();
  });

  // Get live view frame (convert Buffer to base64 for IPC transfer)
  ipcMain.handle('canon:getLiveViewFrame', () => {
    const frame = getLiveViewFrame();
    if (frame && frame.data) {
      return {
        width: frame.width,
        height: frame.height,
        data: frame.data.toString('base64'), // Convert Buffer to base64 string
      };
    }
    return null;
  });

  // Get property
  ipcMain.handle('canon:getProperty', (_, propertyId: number) => {
    return getProperty(propertyId);
  });

  // Set property
  ipcMain.handle('canon:setProperty', (_, propertyId: number, value: number) => {
    return setProperty(propertyId, value);
  });

  // Get battery level
  ipcMain.handle('canon:getBatteryLevel', () => {
    return getBatteryLevel();
  });

  // Get available shots
  ipcMain.handle('canon:getAvailableShots', () => {
    return getAvailableShots();
  });

  // Get ISO
  ipcMain.handle('canon:getIso', () => {
    return getIso();
  });

  // Set ISO
  ipcMain.handle('canon:setIso', (_, value: number) => {
    return setIso(value);
  });

  // Get SDK version
  ipcMain.handle('canon:getSdkVersion', () => {
    return getSdkVersion();
  });

  // Get property IDs
  ipcMain.handle('canon:getPropertyIds', () => {
    return getPropertyIds();
  });

  // Full connect flow: initialize -> get list -> connect -> open session
  ipcMain.handle('canon:fullConnect', async () => {
    try {
      canonLog.info('fullConnect: Starting full connection flow');

      // Initialize SDK if not already
      if (!isSdkInitialized()) {
        canonLog.info('fullConnect: Initializing SDK...');
        const initResult = await initializeCanonSdk();
        if (!initResult) {
          canonLog.error('fullConnect: Failed to initialize SDK');
          return { success: false, error: 'Failed to initialize SDK' };
        }
        canonLog.info('fullConnect: SDK initialized');
        // Wait a bit for camera enumeration after SDK init
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Get camera list with retry (camera enumeration can take time)
      canonLog.info('fullConnect: Getting camera list...');
      let cameras: CameraInfo[] = [];
      const maxRetries = 5;
      for (let i = 0; i < maxRetries; i++) {
        cameras = getCameraList();
        canonLog.info(`fullConnect: Attempt ${i + 1}/${maxRetries} - Found ${cameras.length} camera(s)`);
        if (cameras.length > 0) break;
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (cameras.length === 0) {
        canonLog.error('fullConnect: No Canon camera found after retries');
        return { success: false, error: 'No Canon camera found. Please check camera is connected and in PC Remote mode.' };
      }

      // Connect to first camera
      canonLog.info('fullConnect: Connecting to camera...');
      const camera = connectCamera();
      if (!camera) {
        canonLog.error('fullConnect: Failed to connect to camera');
        return { success: false, error: 'Failed to connect to camera' };
      }
      canonLog.info(`fullConnect: Connected to ${camera.name}`);

      // Open session
      canonLog.info('fullConnect: Opening session...');
      const sessionOpened = openSession();
      if (!sessionOpened) {
        canonLog.error('fullConnect: Failed to open camera session');
        return { success: false, error: 'Failed to open camera session' };
      }
      canonLog.info('fullConnect: Session opened successfully');

      return {
        success: true,
        camera,
        batteryLevel: getBatteryLevel(),
        availableShots: getAvailableShots(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Full disconnect flow: close session -> terminate
  ipcMain.handle('canon:fullDisconnect', () => {
    try {
      closeSession();
      terminateCanonSdk();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  canonLog.info('IPC handlers registered');
}
