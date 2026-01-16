/**
 * Canon Camera Service V2
 *
 * ใช้ @brick-a-brack/napi-canon-cameras แทน native module ที่เขียนเอง
 * รองรับ Canon EOS cameras รวมถึง EOS R50 ผ่าน USB connection
 */
import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log';

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

// =============================================================================
// State
// =============================================================================

let camera: any = null;
let Camera: any = null;
let CameraProperty: any = null;
let Option: any = null;
let ImageQuality: any = null;
let watchCameras: any = null;
let cameraBrowser: any = null;

let isInitialized = false;
let isWatching = false;
let pendingCaptureResolve: ((result: CaptureResult) => void) | null = null;

// =============================================================================
// Initialize
// =============================================================================

export function initializeCanonCameraV2(): boolean {
  if (isInitialized) {
    canonLog.info('Already initialized');
    return true;
  }

  try {
    // Dynamic import
    const canonCameras = require('@brick-a-brack/napi-canon-cameras');
    Camera = canonCameras.Camera;
    CameraProperty = canonCameras.CameraProperty;
    Option = canonCameras.Option;
    ImageQuality = canonCameras.ImageQuality;
    watchCameras = canonCameras.watchCameras;
    cameraBrowser = canonCameras.cameraBrowser;

    isInitialized = true;
    canonLog.info('napi-canon-cameras loaded successfully');
    return true;
  } catch (error) {
    canonLog.error('Failed to load napi-canon-cameras:', error);
    return false;
  }
}

// =============================================================================
// Camera Functions
// =============================================================================

export function getCameraList(): CameraInfo[] {
  if (!isInitialized || !cameraBrowser) {
    canonLog.error('Not initialized');
    return [];
  }

  try {
    const cameras = cameraBrowser.getCameras();
    canonLog.info(`Found ${cameras.length} camera(s)`);
    return cameras.map((cam: any) => ({
      name: cam.description || 'Canon Camera',
      portName: cam.portName || '',
    }));
  } catch (error) {
    canonLog.error('Failed to get camera list:', error);
    return [];
  }
}

export function connectCamera(): CameraInfo | null {
  if (!isInitialized || !Camera || !CameraProperty || !Option || !watchCameras) {
    canonLog.error('Not initialized');
    return null;
  }

  try {
    // Create new camera instance (connects to first available)
    camera = new Camera();

    // Set up event handler for capture
    camera.setEventHandler((eventName: string, event: any) => {
      canonLog.info(`📸 Camera event received: ${eventName}`, JSON.stringify(event || {}).substring(0, 200));

      // Handle LiveViewStop event - signal that Live View has fully stopped
      if (eventName === Camera!.EventName.LiveViewStop || eventName === 'LiveViewStop') {
        if (pendingLiveViewStopResolve) {
          canonLog.info('📹 LiveViewStop event received, proceeding with capture');
          pendingLiveViewStopResolve();
          pendingLiveViewStopResolve = null;
        }
      }

      // Also detect Live View stop via Evf_OutputDevice property change (PC becomes false)
      // This is a more reliable signal on some cameras/situations
      if (eventName === Camera!.EventName.PropertyChangeValue ||
          eventName === 'PropertyChangeValue') {
        const prop = event?.property;
        if (prop?.label === 'Evf_OutputDevice' && prop?.value?.devices?.PC === false) {
          if (pendingLiveViewStopResolve) {
            canonLog.info('📹 Evf_OutputDevice shows PC=false, proceeding with capture');
            pendingLiveViewStopResolve();
            pendingLiveViewStopResolve = null;
          }
        }
      }

      if (eventName === Camera!.EventName.FileCreate ||
          eventName === Camera!.EventName.DownloadRequest) {
        const file = event.file;
        canonLog.info(`📁 File received: ${file.name}`);

        try {
          // Download to base64
          canonLog.info('📥 Downloading file to base64...');
          const base64Data = file.downloadToString();
          const fileSizeMB = (base64Data.length * 3 / 4 / 1024 / 1024).toFixed(2);
          canonLog.info(`✅ File downloaded, size: ${fileSizeMB} MB`);

          if (pendingCaptureResolve) {
            pendingCaptureResolve({
              success: true,
              imageData: base64Data,
            });
            pendingCaptureResolve = null;
          } else {
            // Late arrival - save for next capture
            canonLog.warn('⚠️ File received after timeout - saving for next capture');
            lateArrivalImage = base64Data;
          }
        } catch (err: any) {
          canonLog.error('❌ Failed to download file:', err);
          if (pendingCaptureResolve) {
            pendingCaptureResolve({
              success: false,
              error: err.message,
            });
            pendingCaptureResolve = null;
          }
        }
      }
    });

    // Connect to camera
    camera.connect();
    canonLog.info(`Connected to camera: ${camera.description}`);

    // Configure camera for host download
    camera.setProperties({
      [CameraProperty.ID.SaveTo]: Option.SaveTo.Host,
      [CameraProperty.ID.ImageQuality]: ImageQuality!.ID.LargeJPEGFine,
    });

    // Start watching for events
    if (!isWatching) {
      watchCameras();
      isWatching = true;
    }

    return {
      name: camera.description || 'Canon Camera',
      portName: camera.portName || '',
      serialNumber: camera.serialNumber || '',
    };
  } catch (error) {
    canonLog.error('Failed to connect camera:', error);
    camera = null;
    return null;
  }
}

export function disconnectCamera(): boolean {
  if (!camera) {
    return true;
  }

  try {
    camera.disconnect();
    camera = null;
    canonLog.info('Camera disconnected');
    return true;
  } catch (error) {
    canonLog.error('Failed to disconnect camera:', error);
    return false;
  }
}

export function isCameraConnected(): boolean {
  return camera !== null;
}

// =============================================================================
// Capture Functions
// =============================================================================

// Track if live view was active before capture
let wasLiveViewActive = false;
let isCapturing = false;
let captureNumber = 0;
let lastCaptureTime = 0;

// Store late-arriving images for potential recovery
let lateArrivalImage: string | null = null;

// Callback for LiveViewStop event
let pendingLiveViewStopResolve: (() => void) | null = null;

/**
 * Take picture - keeps Live View running if possible
 * After capture, automatically restarts Live View if it was stopped
 */
export function takePicture(): Promise<CaptureResult> {
  return new Promise((resolve) => {
    if (!camera) {
      resolve({ success: false, error: 'No camera connected' });
      return;
    }

    // Prevent concurrent captures
    if (isCapturing) {
      canonLog.warn('Capture already in progress, waiting...');
      resolve({ success: false, error: 'Capture already in progress' });
      return;
    }

    // Check if there's a late-arriving image from previous timeout
    if (lateArrivalImage) {
      canonLog.info('🔄 Using late-arrival image from previous capture');
      const imageData = lateArrivalImage;
      lateArrivalImage = null;
      resolve({ success: true, imageData });
      return;
    }

    // Enforce minimum delay between captures (2 seconds)
    const now = Date.now();
    const timeSinceLastCapture = now - lastCaptureTime;
    if (lastCaptureTime > 0 && timeSinceLastCapture < 2000) {
      const waitTime = 2000 - timeSinceLastCapture;
      canonLog.info(`⏳ Waiting ${waitTime}ms before next capture...`);
      setTimeout(() => {
        takePicture().then(resolve);
      }, waitTime);
      return;
    }

    captureNumber++;
    const currentCapture = captureNumber;
    lastCaptureTime = now;
    isCapturing = true;

    // Check if Live View is currently active
    // Use both the API method and check Evf_OutputDevice property for reliability
    try {
      wasLiveViewActive = camera.isLiveViewActive();
      // Double-check with property
      const evfOutputDevice = camera.getProperty(CameraProperty.ID.Evf_OutputDevice);
      const isEvfStreamingToPC = evfOutputDevice?.value?.devices?.PC === true;
      canonLog.info(`Starting capture #${currentCapture} (Live View API: ${wasLiveViewActive}, Evf PC stream: ${isEvfStreamingToPC})...`);
      // Consider Live View active if either check says so
      wasLiveViewActive = wasLiveViewActive || isEvfStreamingToPC;
    } catch (err) {
      canonLog.warn('Error checking Live View state:', err);
      wasLiveViewActive = true; // Assume it was active
    }

    // Stop Live View before capture - this is REQUIRED for reliable download events
    // The R50 doesn't properly send DownloadRequest when Live View is active
    // We must WAIT for the LiveViewStop event before proceeding
    const stopLiveViewAndWait = async (): Promise<void> => {
      // CRITICAL: Canon EOS R50 requires Live View to be started and stopped
      // before capture for reliable DownloadRequest events.
      // If Live View is not active, start it first, then stop it.
      if (!wasLiveViewActive) {
        try {
          canonLog.info('Live View not active, starting it for reliable capture...');
          camera!.startLiveView();
          // Wait for Live View to initialize
          await new Promise(r => setTimeout(r, 500));
          wasLiveViewActive = true; // Mark as active so we restart it after capture
        } catch (err) {
          canonLog.warn('Failed to start Live View for capture:', err);
        }
      }

      return new Promise<void>((resolveStop) => {
        // Set up listener for LiveViewStop event
        pendingLiveViewStopResolve = resolveStop;

        // Set a timeout in case the event doesn't arrive
        const liveViewStopTimeout = setTimeout(() => {
          canonLog.warn('LiveViewStop event not received within 1s, proceeding anyway');
          pendingLiveViewStopResolve = null;
          resolveStop();
        }, 1000);

        // Also clear timeout if event arrives
        const originalResolve = pendingLiveViewStopResolve;
        pendingLiveViewStopResolve = () => {
          clearTimeout(liveViewStopTimeout);
          originalResolve?.();
        };

        try {
          camera!.stopLiveView();
          canonLog.info('Stopped Live View for capture, waiting for LiveViewStop event...');
        } catch (err) {
          canonLog.warn('Failed to stop Live View:', err);
          clearTimeout(liveViewStopTimeout);
          pendingLiveViewStopResolve = null;
          resolveStop();
        }
      });
    };

    // Wait for Live View to fully stop, then proceed with capture
    stopLiveViewAndWait().then(async () => {
      // Add a small stabilization delay after Live View stops
      // This gives the camera time to fully transition before shutter command
      await new Promise(r => setTimeout(r, 300));
      canonLog.info('Stabilization delay complete, proceeding with shutter');

      try {
        const timeout = setTimeout(() => {
          canonLog.warn(`Capture #${currentCapture} timeout triggered (20s)`);
          isCapturing = false;
          pendingCaptureResolve = null;

          // Restart Live View on timeout
          if (wasLiveViewActive) {
            try {
              camera?.startLiveView();
              canonLog.info('Live View restarted after timeout');
            } catch (err) {
              canonLog.warn('Failed to restart Live View:', err);
            }
          }

          resolve({ success: false, error: 'Capture timeout' });
        }, 20000); // 20 second timeout

        // Store resolve function for event handler
        pendingCaptureResolve = (result: CaptureResult) => {
          clearTimeout(timeout);
          isCapturing = false;
          canonLog.info(`Capture #${currentCapture} completed:`, result.success ? 'success' : result.error);

          // Restart Live View after successful capture
          setTimeout(() => {
            if (wasLiveViewActive) {
              try {
                camera?.startLiveView();
                canonLog.info('Live View restarted after capture');
              } catch (err) {
                canonLog.warn('Failed to restart Live View:', err);
              }
            }
            resolve(result);
          }, 100);
        };

        // Take picture using PressShutterButton commands instead of TakePicture (0)
        // This simulates a physical shutter press and is more reliable for R-series cameras
        // especially when Live View was just stopped (clearing the bus).
        try {
          const CMD_PRESS_SHUTTER = 4; // kEdsCameraCommand_PressShutterButton
          const SHUTTER_COMPLETELY = 3; // kEdsCameraCommand_ShutterButton_Completely
          const SHUTTER_OFF = 0; // kEdsCameraCommand_ShutterButton_OFF

          canonLog.info('Sending Shutter Button COMPLETELY command...');
          camera!.sendCommand(CMD_PRESS_SHUTTER, SHUTTER_COMPLETELY);

          // Wait for camera to process and take the shot before releasing
          await new Promise(resolve => setTimeout(resolve, 200));

          canonLog.info('Sending Shutter Button OFF command...');
          camera!.sendCommand(CMD_PRESS_SHUTTER, SHUTTER_OFF);

          canonLog.info('Shutter sequence complete, waiting for DownloadRequest/FileItemCreated...');
        } catch (captureError: any) {
          clearTimeout(timeout);
          isCapturing = false;
          pendingCaptureResolve = null;
          canonLog.error('sendCommand threw error:', captureError);

          // Restart Live View on error
          if (wasLiveViewActive) {
            try {
              camera?.startLiveView();
            } catch {}
          }

          resolve({ success: false, error: captureError.message || 'Capture failed' });
        }

      } catch (error: any) {
        canonLog.error('takePicture failed:', error);
        isCapturing = false;
        pendingCaptureResolve = null;
        resolve({ success: false, error: error.message });
      }
    });
  });
}

/**
 * Dismiss image review on camera LCD by simulating half-press shutter
 * This restores Live View without needing to stop/start it
 * Solution from: https://stackoverflow.com/questions/42388263/canon-edsdk-taking-photo-in-liveview-breaks-up-the-lv-forever
 */
function dismissImageReview(): void {
  if (!camera || !Camera) return;

  try {
    // Camera.Command.PressShutterButton = 4
    // Camera.PressShutterButton.HalfwayNonAF = 65537
    // Camera.PressShutterButton.OFF = 0
    const CMD_PRESS_SHUTTER = Camera.Command?.PressShutterButton ?? 4;
    const SHUTTER_HALFWAY_NON_AF = Camera.PressShutterButton?.HalfwayNonAF ?? 65537;
    const SHUTTER_OFF = Camera.PressShutterButton?.OFF ?? 0;

    camera.sendCommand(CMD_PRESS_SHUTTER, SHUTTER_HALFWAY_NON_AF);
    camera.sendCommand(CMD_PRESS_SHUTTER, SHUTTER_OFF);
    canonLog.info('📷 Image review dismissed (half-press shutter)');
  } catch (err) {
    canonLog.warn('Failed to dismiss image review:', err);
  }
}

// =============================================================================
// Live View Functions
// =============================================================================

export function startLiveView(): boolean {
  if (!camera || !CameraProperty) {
    canonLog.error('No camera connected for live view');
    return false;
  }

  try {
    // Check if live view is available
    canonLog.info('Checking live view availability...');
    const evfMode = camera.getProperty(CameraProperty.ID.Evf_Mode);
    canonLog.info('Evf_Mode property:', JSON.stringify(evfMode));

    if (!evfMode.available) {
      canonLog.warn('Live View property not available, trying to start anyway...');
    }

    camera.startLiveView();
    canonLog.info('Live view started successfully');
    return true;
  } catch (error) {
    canonLog.error('Failed to start live view:', error);
    return false;
  }
}

export function stopLiveView(): boolean {
  if (!camera) {
    return true;
  }

  try {
    camera.stopLiveView();
    canonLog.info('Live view stopped');
    return true;
  } catch (error) {
    canonLog.error('Failed to stop live view:', error);
    return false;
  }
}

export function getLiveViewImage(): string | null {
  if (!camera) {
    return null;
  }

  try {
    const image = camera.getLiveViewImage();
    if (image) {
      // Returns data URL (data:image/jpeg;base64,...)
      return image.getDataURL();
    }
    return null;
  } catch (error) {
    // Live view frame not available - this is normal during transitions
    return null;
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
      return { success: result };
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

  canonLog.info('Canon Camera V2 IPC handlers registered');
}
