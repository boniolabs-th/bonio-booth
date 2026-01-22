/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import path from 'path';
import { app, BrowserWindow, shell, ipcMain, session, powerSaveBlocker } from 'electron';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fix GPU process crash on Electron 35+ in production builds
// Use ANGLE with D3D11 backend for WebGL instead of native GPU
// This keeps WebGL working while avoiding GPU process issues
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('no-sandbox'); // Required for packaged apps with GPU

// Load .env file manually if dotenv is not available
const loadEnv = async () => {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = await fs.readFile(envPath, 'utf-8');
    const envLines = envContent.split('\n');
    envLines.forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    console.error('ℹ️ No .env file found or failed to load');
  }
};

loadEnv();

import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import {
  applyLutToVideo,
  createBoomerangWithLut,
  convertWebmToMp4,
  convertWebmToMp4Base64,
} from './services/videoService';
import machineService from './services/machineService';
import { backgroundUploadService } from './services/backgroundUploadService';
import sseClient from './services/sseClient';
import shutdownManager, { ShutdownState } from './services/shutdownManager';
import appCloseManager, { AppCloseState } from './services/appCloseManager';
import { getEnvConfig, clearEnvConfigCache, DEFAULT_PORT } from './config/env.config';
import {
  getMachineConfig,
  saveMachineConfig,
  hasMachineConfig,
  deleteMachineConfig,
  getConfigFilePath,
} from './services/configService';
import {
  getPaperPositionConfig,
  savePaperPositionConfig,
  deletePaperPositionConfig,
  DEFAULT_PAPER_POSITION_CONFIG,
  PaperPositionConfig,
} from './services/paperPositionConfigService';
import {
  getPrintTestPosition,
  savePrintTestPosition,
  PrintTestPosition,
} from './services/printTestPositionService';
import {
  getCameraConfig,
  saveCameraConfig,
  hasCameraConfig,
  deleteCameraConfig,
  CameraConfig,
} from './services/cameraConfigService';
import {
  registerCanonCameraIpcHandlers,
  terminateCanonSdk,
  setMainWindow as setCanonMainWindow,
  isCameraConnected as isCanonCameraConnected,
} from './services/canonCameraService';
import { registerCanonCameraV2IpcHandlers } from './services/canonCameraServiceV2';
import {
  getPrinterConfig,
  savePrinterConfig,
  hasPrinterConfig,
  deletePrinterConfig,
  getActivePrinter,
  PrinterConfig,
} from './services/printerConfigService';
class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}


/**
 * Helper function สำหรับเช็คและจัดการ isShutdownReady หลังจากเรียก init()
 */
function handleShutdownReady(initResponse: any): void {
  // ส่ง log ไปที่ renderer
  const sendLog = (level: 'log' | 'warn' | 'error', message: string, data?: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('shutdown-log', { level, message, data, timestamp: new Date().toISOString() });
    }
  };

  // ดึง isShutdownReady โดยเช็คทั้ง undefined, null, false
  const isShutdownReady = (initResponse as any)?.isShutdownReady ?? initResponse?.isShutdownReady;
  const isShutdownReadyBool = isShutdownReady === true || isShutdownReady === 'true';

  // ดึง isClosedAppReady
  const isClosedAppReady = (initResponse as any)?.isClosedAppReady ?? initResponse?.isClosedAppReady;
  const isClosedAppReadyBool = isClosedAppReady === true || isClosedAppReady === 'true';

  // Log ทุกครั้งที่ function ถูกเรียก (สำคัญมาก!)
  console.log('🔍 [Main] ========== HANDLING SHUTDOWN READY ==========');
  console.log('🔍 [Main] isShutdownReady from init (raw):', isShutdownReady);
  console.log('🔍 [Main] isShutdownReady (boolean):', isShutdownReadyBool);
  console.log('🔍 [Main] isClosedAppReady from init (raw):', isClosedAppReady);
  console.log('🔍 [Main] isClosedAppReady (boolean):', isClosedAppReadyBool);
  console.log('🔍 [Main] Current shutdown state BEFORE:', shutdownManager.getState());

  sendLog('warn', '🔍 ========== HANDLING SHUTDOWN READY ==========');
  sendLog('log', '🔍 isShutdownReady & isClosedAppReady', {
    isShutdownReady: { raw: isShutdownReady, boolean: isShutdownReadyBool },
    isClosedAppReady: { raw: isClosedAppReady, boolean: isClosedAppReadyBool },
    stateBefore: shutdownManager.getState(),
  });

  // จัดการ isShutdownReady (shutdown เครื่อง)
  if (isShutdownReadyBool) {
    // ถ้า isShutdownReady เป็น true ให้เริ่ม countdown (แต่ไม่ reset ถ้าเริ่มแล้ว)
    console.log('🛑 [Main] isShutdownReady is TRUE, ensuring countdown is running');
    sendLog('error', '🛑 isShutdownReady = TRUE, starting countdown');
    shutdownManager.ensureCountdown(2, 'manual'); // ใช้ 2 นาทีตาม DEFAULT_COUNTDOWN_MINUTES
    const stateAfter = shutdownManager.getState();
    console.log('🛑 [Main] Current shutdown state AFTER:', stateAfter);
    sendLog('log', '🛑 Countdown started', { stateAfter });
  } else {
    // ถ้า isShutdownReady เป็น false, undefined, หรือ null ให้เคลียร์ shutdown ทันที
    console.log('🔄 [Main] isShutdownReady is FALSE/undefined/null, cancelling shutdown immediately');
    sendLog('error', '🔄 isShutdownReady = FALSE, cancelling shutdown NOW!');
    shutdownManager.cancelShutdown();
    const stateAfter = shutdownManager.getState();
    console.log('🔄 [Main] Current shutdown state AFTER cancel:', stateAfter);
    sendLog('log', '🔄 Shutdown cancelled', { stateAfter });
  }

  // จัดการ isClosedAppReady (ปิดโปรแกรม)
  if (isClosedAppReadyBool) {
    // ถ้า isClosedAppReady เป็น true ให้เริ่ม countdown (แต่ไม่ reset ถ้าเริ่มแล้ว)
    console.log('🚪 [Main] isClosedAppReady is TRUE, ensuring app close countdown is running');
    sendLog('error', '🚪 isClosedAppReady = TRUE, starting app close countdown');
    appCloseManager.ensureCountdown(2); // ใช้ 2 นาทีตาม DEFAULT_COUNTDOWN_MINUTES
    const stateAfter = appCloseManager.getState();
    console.log('🚪 [Main] Current app close state AFTER:', stateAfter);
    sendLog('log', '🚪 App close countdown started', { stateAfter });
  } else {
    // ถ้า isClosedAppReady เป็น false, undefined, หรือ null ให้เคลียร์ app close ทันที
    console.log('🔄 [Main] isClosedAppReady is FALSE/undefined/null, cancelling app close immediately');
    sendLog('error', '🔄 isClosedAppReady = FALSE, cancelling app close NOW!');
    appCloseManager.cancelAppClose();
    const stateAfter = appCloseManager.getState();
    console.log('🔄 [Main] Current app close state AFTER cancel:', stateAfter);
    sendLog('log', '🔄 App close cancelled', { stateAfter });
  }
}

async function initializeApp() {
  try {
    console.log('🚀 Initializing app...');

    // ดึง config จาก persistent storage
    const envConfig = await getEnvConfig();
    const machineIdFromConfig = envConfig.MACHINE_ID;
    const machinePortFromConfig = envConfig.PORT ? Number(envConfig.PORT) : Number(DEFAULT_PORT);

    console.log('🔍 [Main] Config from storage:', {
      machineId: machineIdFromConfig,
      machinePort: machinePortFromConfig,
    });

    // อัปเดต config ของ machineService
    machineService.updateConfig({
      machineId: machineIdFromConfig,
      machinePort: machinePortFromConfig,
    });

    // เรียก API init เพื่อดึงข้อมูลทั้งหมดในครั้งเดียว
    // ส่ง machineId จาก config ถ้ามี
    console.log('🔍 [Main] Calling init with machineId:', machineIdFromConfig);
    const initResponse = await machineService.init(machineIdFromConfig);

    // เช็ค isShutdownReady และจัดการ shutdown countdown
    handleShutdownReady(initResponse);

    // Send theme to renderer process
    if (mainWindow && initResponse.theme.background) {
      mainWindow.webContents.send('theme-loaded', initResponse.theme);
    }

    // เก็บข้อมูลไว้ใน cache
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };

    // Send machine data (including prices) to renderer process
    if (mainWindow && initResponse.machine) {
      mainWindow.webContents.send('machine-init', {
        machine: initResponse.machine,
        prices: initResponse.machine.prices || [],
      });
    }

    // เชื่อมต่อ SSE หลังจาก init สำเร็จ
    console.log('🔗 Connecting to SSE...');

    // อัปเดต config ของ sseClient
    sseClient.updateConfig({
      apiBaseUrl: envConfig.API_BASE_URL,
      machineId: machineIdFromConfig,
    });

    // ตั้งค่า callback สำหรับเมื่อ SSE ได้รับ status 502
    sseClient.setOnStatus502Callback(() => {
      if (mainWindow) {
        mainWindow.webContents.send('sse-status-502');
      }
    });

    sseClient.connect();

    // ตรวจสอบ devices ที่ตั้งค่าไว้ (camera/printer) หลังจาก init สำเร็จ
    // ทำแบบ async เพื่อไม่ให้บล็อกการโหลด app
    setTimeout(() => {
      checkConfiguredDevices().catch(err => {
        console.error('❌ [Main] Error in checkConfiguredDevices:', err);
      });
    }, 3000); // รอ 3 วินาทีหลัง init เสร็จ

    // Helper function สำหรับส่ง log ไปที่ renderer (DevTools)
    const sendLogToRenderer = (level: 'log' | 'warn' | 'error', message: string, data?: any) => {
      if (mainWindow) {
        mainWindow.webContents.send('shutdown-log', { level, message, data, timestamp: new Date().toISOString() });
      }
    };

    // Setup shutdown manager callbacks
    shutdownManager.setCallbacks({
      onCountdownUpdate: (state: ShutdownState) => {
        // ส่งสถานะ countdown ไปที่ renderer
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-countdown-update', state);
          sendLogToRenderer('log', `⏱️ Shutdown countdown: ${state.remainingSeconds}s / ${state.totalSeconds}s`, state);
        }
      },
      onShutdownStarting: () => {
        // แจ้ง renderer ว่ากำลังจะ shutdown
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-starting');
          sendLogToRenderer('warn', '🛑 Shutdown starting!');
        }
      },
      onShutdownCancelled: () => {
        // แจ้ง renderer ว่ายกเลิก shutdown
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-cancelled');
          sendLogToRenderer('log', '🔄 Shutdown cancelled');
        }
      },
      onActivityDetected: () => {
        // แจ้ง renderer ว่า countdown ถูก reset
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-countdown-reset');
          sendLogToRenderer('log', '👆 User activity detected, shutdown countdown reset');
        }
      },
    });

    // Setup app close manager callbacks
    appCloseManager.setCallbacks({
      onCountdownUpdate: (state: AppCloseState) => {
        // ส่งสถานะ countdown ไปที่ renderer
        if (mainWindow) {
          mainWindow.webContents.send('app-close-countdown-update', state);
          sendLogToRenderer('log', `⏱️ App close countdown: ${state.remainingSeconds}s / ${state.totalSeconds}s`, state);
        }
      },
      onAppCloseStarting: () => {
        // แจ้ง renderer ว่ากำลังจะปิดแอป
        if (mainWindow) {
          mainWindow.webContents.send('app-close-starting');
          sendLogToRenderer('warn', '🚪 App close starting!');
        }
        // ตั้ง flag เพื่อบอกว่าเราต้องการปิดแอปจริงๆ
        shouldQuit = true;
        console.log('🚪 [Main] shouldQuit set to:', shouldQuit);
        // ปิด window (จะไม่ถูก preventDefault เพราะ shouldQuit = true)
        if (mainWindow) {
          console.log('🚪 [Main] Main window exists, closing...');
          console.log('🚪 [Main] mainWindow.isDestroyed():', mainWindow.isDestroyed());
          console.log('🚪 [Main] mainWindow.isVisible():', mainWindow.isVisible());
          try {
            console.log('🚪 [Main] Executing mainWindow.close()...');
            mainWindow.close();
            console.log('🚪 [Main] mainWindow.close() called successfully');
          } catch (error) {
            console.error('❌ [Main] Error closing window:', error);
          }
        } else {
          console.log('⚠️ [Main] Main window is null, cannot close');
        }
      },
      onAppCloseCancelled: () => {
        // แจ้ง renderer ว่ายกเลิก app close
        if (mainWindow) {
          mainWindow.webContents.send('app-close-cancelled');
          sendLogToRenderer('log', '🔄 App close cancelled');
        }
      },
      onActivityDetected: () => {
        // แจ้ง renderer ว่า countdown ถูก reset
        if (mainWindow) {
          mainWindow.webContents.send('app-close-countdown-reset');
          sendLogToRenderer('log', '👆 User activity detected, app close countdown reset');
        }
      },
    });

    return {
      machine: initResponse.machine,
      theme: initResponse.theme,
      frames: initResponse.frames,
    };
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    // ยังคงสร้าง window แม้ API จะล้มเหลว
    throw error;
  }
}


/**
 * ตรวจสอบว่า device (camera/printer) ที่เคยตั้งค่าไว้ยังมีอยู่หรือไม่
 * ถ้าไม่พบจะส่งแจ้งเตือนไปยัง Telegram ผ่าน API
 */
async function checkConfiguredDevices(): Promise<void> {
  console.log('🔍 [Main] Checking configured devices...');

  // 1. เช็ค Camera
  try {
    const cameraConfig = await getCameraConfig();
    if (cameraConfig) {
      // เช็คว่าเป็น webcam หรือ canon
      if (cameraConfig.type === 'webcam') {
        console.log(`📷 [Main] Webcam config found: ${cameraConfig.label} (${cameraConfig.deviceId})`);

        // ดึงรายการกล้องที่เชื่อมต่ออยู่ผ่าน renderer process
        // เนื่องจาก navigator.mediaDevices ใช้ได้เฉพาะใน renderer process
        // เราจะส่ง event ไปให้ renderer เช็คแทน
        if (mainWindow) {
          mainWindow.webContents.send('check-camera-availability', {
            configuredDeviceId: cameraConfig.deviceId,
            configuredLabel: cameraConfig.label,
          });
        }
      } else if (cameraConfig.type === 'canon') {
        console.log(`📷 [Main] Canon camera config found: ${cameraConfig.cameraName}`);

        // เช็คว่า Canon camera ยังเชื่อมต่ออยู่หรือไม่
        const isConnected = isCanonCameraConnected();

        if (!isConnected) {
          console.warn(`⚠️ [Main] Canon camera not connected: ${cameraConfig.cameraName}`);
          // ส่งแจ้งเตือน
          machineService.sendDeviceAlert(
            'camera',
            cameraConfig.cameraName,
            [],
          ).catch(err => console.error('❌ [Main] Failed to send camera alert:', err));

          // ส่ง event ไปที่ renderer เพื่อแสดงหน้า maintenance
          if (mainWindow) {
            mainWindow.webContents.send('device-not-found', {
              deviceType: 'camera',
              deviceName: cameraConfig.cameraName,
            });
          }
        } else {
          console.log(`✅ [Main] Canon camera connected: ${cameraConfig.cameraName}`);
        }
      }
    } else {
      console.log('ℹ️ [Main] No camera config found');
    }
  } catch (error) {
    console.error('❌ [Main] Error checking camera config:', error);
  }

  // 2. เช็ค Printer
  try {
    const printerConfig = await getPrinterConfig();
    if (printerConfig && mainWindow) {
      console.log(`🖨️ [Main] Printer config found - Main: ${printerConfig.main.printerName}`);
      if (printerConfig.secondary) {
        console.log(`🖨️ [Main] Secondary printer: ${printerConfig.secondary.printerName}`);
      }

      // ดึงรายการ printers ที่เชื่อมต่ออยู่
      const printers = await mainWindow.webContents.getPrintersAsync();
      const printerNames = printers.map(p => p.name);

      console.log('🖨️ [Main] Available printers:', printerNames);

      // เช็ค Main printer
      const mainPrinterFound = printers.some(p => p.name === printerConfig.main.printerName);
      if (!mainPrinterFound) {
        console.warn(`⚠️ [Main] Main printer not found: ${printerConfig.main.printerName}`);
        // ส่งแจ้งเตือน
        machineService.sendDeviceAlert(
          'printer',
          `Main: ${printerConfig.main.printerName}`,
          printerNames,
        ).catch(err => console.error('❌ [Main] Failed to send printer alert:', err));

        // ส่ง event ไปที่ renderer เพื่อแสดงหน้า maintenance
        if (mainWindow) {
          mainWindow.webContents.send('device-not-found', {
            deviceType: 'printer',
            deviceName: `Main: ${printerConfig.main.printerName}`,
          });
        }
      } else {
        console.log(`✅ [Main] Main printer found: ${printerConfig.main.printerName}`);
      }

      // เช็ค Secondary printer (ถ้ามี)
      if (printerConfig.secondary) {
        const secondaryPrinterFound = printers.some(p => p.name === printerConfig.secondary!.printerName);
        if (!secondaryPrinterFound) {
          console.warn(`⚠️ [Main] Secondary printer not found: ${printerConfig.secondary.printerName}`);
          // ส่งแจ้งเตือน
          machineService.sendDeviceAlert(
            'printer',
            `Secondary: ${printerConfig.secondary.printerName}`,
            printerNames,
          ).catch(err => console.error('❌ [Main] Failed to send printer alert:', err));

          // ส่ง event ไปที่ renderer เพื่อแสดงหน้า maintenance
          if (mainWindow) {
            mainWindow.webContents.send('device-not-found', {
              deviceType: 'printer',
              deviceName: `Secondary: ${printerConfig.secondary.printerName}`,
            });
          }
        } else {
          console.log(`✅ [Main] Secondary printer found: ${printerConfig.secondary.printerName}`);
        }
      }
    } else {
      console.log('ℹ️ [Main] No printer config found');
    }
  } catch (error) {
    console.error('❌ [Main] Error checking printer config:', error);
  }
}


/**
 * สร้างรูปภาพที่มี padding รอบๆ เพื่อป้องกันการล้นและขาดขอบ
 * ใช้ BrowserWindow เพื่อ render รูปภาพให้เหมาะสมกับเครื่องปริ้น
 */
async function generateImageWithPadding(
  base64: string,
  paddingPercent = 0,
  orientation: 'portrait' | 'landscape' = 'portrait',
  horizontal: number = 0,
  vertical: number = 0,
  scale: number = 100
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    let htmlPath: string | null = null;
    let resolved = false;

    const cleanup = async () => {
      if (htmlPath) {
        try {
          await fs.unlink(htmlPath).catch(() => {});
        } catch {
          // ignore cleanup errors
        }
      }
    };

    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        await cleanup();
        reject(new Error('Timeout: Failed to generate image with padding'));
      }
    }, 15000); // 15 seconds timeout

    try {
      // โหลด paper position config จากไฟล์
      const paperPositionConfig = await getPaperPositionConfig();
      const landscapeWidth = paperPositionConfig.landscapeWidth;
      const landscapeHeight = paperPositionConfig.landscapeHeight;
      const portraitWidth = paperPositionConfig.portraitWidth;
      const portraitHeight = paperPositionConfig.portraitHeight;

      const typeTransform = paperPositionConfig.type === 1 ? 'landscape' : 'portrait';

      // ใช้ค่าปรับขนาดตาม orientation เดิม (ก่อน rotate)
      // เพื่อให้ขนาดภาพเท่ากันทั้งเครื่อง develop (type 1) และเครื่องอื่น (type 2)
      // การหมุนภาพ (rotate) จะทำแค่เพื่อให้ภาพตรงกับกระดาษเท่านั้น
      const widthPercent = orientation === 'landscape' ? landscapeWidth : portraitWidth;
      const heightPercent = orientation === 'landscape' ? landscapeHeight : portraitHeight;

      // ดึง scale จาก config ตาม orientation (ถ้าไม่มีใน config ให้ใช้ค่าจาก parameter หรือ default 100)
      const configScale = orientation === 'landscape'
        ? (paperPositionConfig.landscapeScale ?? scale ?? 100)
        : (paperPositionConfig.portraitScale ?? scale ?? 100);

      // ตรวจสอบว่าต้องหมุนภาพหรือไม่
      const willRotate = orientation !== typeTransform;

      // แปลง scale จากเปอร์เซ็นต์ (100 = 100%) เป็นตัวเลข (1.0 = 100%)
      const scaleValue = configScale / 100;

      // Log สำหรับ debug
      console.log('🖼️ [generateImageWithPadding] Orientation calculation:', {
        originalOrientation: orientation,
        typeTransform,
        willRotate,
        widthPercent,
        heightPercent,
        configScale,
        scaleValue,
        note: 'Using original orientation for size adjustment, typeTransform only for rotation',
      });

      // ถ้ามีการ rotate 90° ต้องสลับ horizontal กับ vertical
      // เพราะหลัง rotate แกน X จะกลายเป็น Y และ Y กลายเป็น X
      const effectiveHorizontal = willRotate ? vertical : horizontal;
      const effectiveVertical = willRotate ? -horizontal : vertical;

      console.log('🖼️ [generateImageWithPadding] Position adjustment:', {
        willRotate,
        originalHorizontal: horizontal,
        originalVertical: vertical,
        effectiveHorizontal,
        effectiveVertical,
      });

      // สร้างไฟล์ HTML ชั่วคราว
      const tempDir = app.getPath("temp");
      htmlPath = path.join(tempDir, `padded-image-${Date.now()}.html`);

      const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        width: 100%;
        height: 100%;
        background: white;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }
      .container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      img {
        // max-width: calc(100% + ${widthPercent}%);
        // max-height: calc(100% + ${heightPercent}%);
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        margin-top: ${effectiveVertical < 0 ? effectiveVertical : 0}px;
        margin-bottom: ${effectiveVertical > 0 ? -effectiveVertical : 0}px;
        margin-left: ${effectiveHorizontal < 0 ? effectiveHorizontal : 0}px;
        margin-right: ${effectiveHorizontal > 0 ? -effectiveHorizontal : 0}px;
        transform: ${(() => {
          const transforms = [];
          if (scaleValue !== 1) {
            transforms.push(`scale(${scaleValue})`);
          }
          if (willRotate) {
            transforms.push('rotate(90deg)');
          }
          return transforms.length > 0 ? transforms.join(' ') : 'none';
        })()};
      }
    </style>
  </head>
  <body>
    <div class="container">
      <img src="${base64.replace(/"/g, '&quot;')}"
           onload="console.log('Image loaded successfully')"
           onerror="console.error('Image load error', this.src.substring(0, 50))"/>
    </div>
  </body>
</html>
      `.trim();

      await fs.writeFile(htmlPath, html, 'utf-8');

      const win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 1800,
        webPreferences: {
          offscreen: true,
        }
      });

      win.webContents.once('did-finish-load', () => {
        // รอให้รูปภาพ render เสร็จ
        setTimeout(() => {
          win.webContents.capturePage().then(async (image) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              // ใช้ JPEG แทน PNG เพื่อ color profile ที่ถูกต้องและขนาดไฟล์เล็กลง
              const buffer = image.toJPEG(100);
              win.close();
              await cleanup();
              resolve(buffer);
            }
          }).catch(async (err) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              win.close();
              await cleanup();
              reject(err);
            }
          });
        }, 1000); // รอ 1 วินาทีเพื่อให้รูปภาพ render เสร็จ
      });

      win.webContents.once('did-fail-load', async (event, errorCode, errorDescription) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          win.close();
          await cleanup();
          reject(new Error(`Failed to load HTML: ${errorDescription} (code: ${errorCode})`));
        }
      });

      win.on('closed', async () => {
        await cleanup();
      });

      // ใช้ loadFile แทน loadURL เพื่อหลีกเลี่ยงปัญหา URL ยาวเกินไป
      await win.loadFile(htmlPath);

    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        await cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let shouldQuit = false; // Flag สำหรับบอกว่าเราต้องการปิดแอปจริงๆ หรือไม่
let powerSaveBlockerId: number | null = null; // ID สำหรับ powerSaveBlocker
let cachedInitData: {
  machine?: { prices?: unknown[] };
  prices?: unknown[];
  theme?: any;
  paperPosition?: { _id: string; scale: number; horizontal: number; vertical: number } | null;
} | null = null;

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {

  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  // ตั้งค่า permissions สำหรับกล้องและไมโครโฟน ก่อนสร้าง window
  // ต้องตั้งค่าก่อน loadURL เพื่อให้ permissions ทำงานได้ถูกต้อง
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = ['camera', 'microphone', 'media'];
      if (allowedPermissions.includes(permission)) {
        callback(true); // อนุญาต
      } else {
        callback(false); // ปฏิเสธ
      }
    },
  );

  // หมายเหตุ: camera และ microphone ใช้ PermissionRequestHandler แทน DevicePermissionHandler
  // DevicePermissionHandler ใช้สำหรับ HID, Serial, USB เท่านั้น

  mainWindow = new BrowserWindow({
    show: false,
    width: 1080,
    height: 1920,
    fullscreen: true, // เปิดแบบเต็มหน้าจอตั้งแต่เริ่มต้น
    frame: false, // ซ่อน title bar เพื่อให้เต็มหน้าจอจริงๆ
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false, // ปิด sandbox เพื่อให้ mediaDevices ทำงานได้
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', async () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      // บังคับให้เต็มหน้าจอตลอดเวลา
      mainWindow.setFullScreen(true);
    }

    // เรียก initializeApp หลังจาก window พร้อมแล้ว
    try {
      await initializeApp();
    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  });

  // ป้องกันการปิด window โดยวิธีปกติ (Alt+F4, close button, etc.)
  mainWindow.on('close', (event) => {
    // ถ้าไม่ได้ตั้ง flag shouldQuit ให้ป้องกันการปิด
    if (!shouldQuit) {
      event.preventDefault();
      // ไม่ทำอะไร - ให้ปิดได้เฉพาะผ่าน context menu เท่านั้น
    }
    // ถ้า shouldQuit เป็น true จะปล่อยให้ปิดได้ตามปกติ
  });

  // ป้องกันการออกจาก fullscreen
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(true);
    }
  });

  // เพิ่ม context menu สำหรับปิดแอป (คลิกขวา)
  mainWindow.webContents.on('context-menu', (_, props) => {
    const { Menu } = require('electron');
    const template: any[] = [];

    // เพิ่ม Developer Tools (เปิดได้เสมอ)
    template.push({
      label: 'Developer Tools',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.toggleDevTools();
        }
      },
    });

    // ถ้าเป็น development mode ให้เพิ่ม inspect element
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      template.push({
        label: 'Inspect element',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.inspectElement(props.x, props.y);
          }
        },
      });
    }

    template.push({ type: 'separator' });

    // เพิ่มเมนู "Print Test" (ต้องเข้ารหัสก่อน)
    template.push({
      label: 'Print Test',
      click: () => {
        if (mainWindow) {
          // ส่ง IPC message ไปที่ renderer เพื่อแสดง password modal
          mainWindow.webContents.send('show-print-test-password-modal');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่มเมนู "ปริ้นย้อนหลัง" (เปิดหน้า request-image)
    template.push({
      label: 'ปริ้นย้อนหลัง',
      click: () => {
        if (mainWindow) {
          // ส่ง IPC message ไปที่ renderer เพื่อ navigate ไปที่หน้า request-image
          mainWindow.webContents.send('navigate-to', '/request-image');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่มเมนู "Camera Config"
    template.push({
      label: 'Camera Config',
      click: () => {
        if (mainWindow) {
          // ส่ง IPC message ไปที่ renderer เพื่อแสดง camera config modal
          mainWindow.webContents.send('show-camera-config-modal');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่มเมนู "Printer Config"
    template.push({
      label: 'Printer Config',
      click: () => {
        if (mainWindow) {
          // ส่ง IPC message ไปที่ renderer เพื่อแสดง printer config modal
          mainWindow.webContents.send('show-printer-config-modal');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่มเมนู "ล้างค่า Config" (ต้องเข้ารหัสก่อน)
    template.push({
      label: 'Format Reset',
      click: () => {
        if (mainWindow) {
          // ส่ง IPC message ไปที่ renderer เพื่อแสดง password modal
          mainWindow.webContents.send('show-clear-config-password-modal');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่มเมนูทดสอบการปิด window และ shutdown (เฉพาะ development mode)
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.DEBUG_PROD === 'true'
    ) {
      template.push({
        label: 'Test: ปิด Window (Direct)',
        click: () => {
          // ทดสอบการปิด window โดยตรง (ไม่ต้องผ่าน password)
          shouldQuit = true;
          if (mainWindow) {
            mainWindow.close();
          }
        },
      });
      template.push({
        label: 'Test: Shutdown Service',
        click: () => {
          // ทดสอบ shutdown service (จะ shutdown เครื่องจริงๆ!)
          // ⚠️ คำเตือน: จะ shutdown เครื่องจริงๆ!
          console.log('🧪 [Test] Testing shutdown service...');
          shutdownManager.testShutdown();
        },
      });
      template.push({ type: 'separator' });
    }

    template.push({
      label: 'ปิดแอป',
      click: () => {
        // ส่ง IPC message ไปที่ renderer เพื่อแสดง password modal
        if (mainWindow) {
          mainWindow.webContents.send('show-quit-app-password-modal');
        }
      },
    });

    template.push({ type: 'separator' });

    // เพิ่ม version ในเมนู
    const appVersion = app.getVersion();
    template.push({
      label: `Version ${appVersion}`,
      enabled: false, // ทำให้ไม่สามารถคลิกได้ (แสดงแค่ version)
    });

    const contextMenu = Menu.buildFromTemplate(template);
    contextMenu.popup({ window: mainWindow });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    shouldQuit = false; // Reset flag เมื่อ window ถูกปิดแล้ว
  });

  // ป้องกันการ minimize หรือ restore
  mainWindow.on('minimize', () => {
    if (mainWindow) {
      // ยกเลิกการ minimize และบังคับให้เต็มหน้าจอ
      mainWindow.restore();
      mainWindow.setFullScreen(true);
    }
  });

  mainWindow.on('restore', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(true);
    }
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // หยุด power save blocker เมื่อปิด app
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    log.info('[Main] Power save blocker stopped');
    powerSaveBlockerId = null;
  }

  // Terminate Canon SDK
  try {
    terminateCanonSdk();
    log.info('[Main] Canon SDK terminated');
  } catch (error) {
    log.error('[Main] Failed to terminate Canon SDK:', error);
  }

  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    log.info('[Main] App ready - starting initialization');

    // ========== POWER SAVE BLOCKER ==========
    // ป้องกันไม่ให้หน้าจอปิดหรือเครื่องเข้าสู่ sleep mode
    // 'prevent-display-sleep' จะป้องกันหน้าจอปิด (display turn off)
    // 'prevent-app-suspension' จะป้องกัน app ถูก suspend
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    log.info('[Main] Power save blocker started with ID:', powerSaveBlockerId);
    log.info('[Main] Power save blocker is active:', powerSaveBlocker.isStarted(powerSaveBlockerId));

    // ตั้งค่า permissions ก่อนสร้าง window
    // ตั้งค่า permissions สำหรับกล้องและไมโครโฟนใน default session
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        const allowedPermissions = ['camera', 'microphone', 'media'];
        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          callback(false);
        }
      },
    );

    // หมายเหตุ: camera และ microphone ใช้ PermissionRequestHandler แทน DevicePermissionHandler
    // DevicePermissionHandler ใช้สำหรับ HID, Serial, USB เท่านั้น

    // Register Canon Camera IPC handlers
    registerCanonCameraIpcHandlers();
    log.info('[Main] Canon Camera IPC handlers registered');

    // Register Canon Camera V2 IPC handlers (using @brick-a-brack/napi-canon-cameras)
    registerCanonCameraV2IpcHandlers();
    log.info('[Main] Canon Camera V2 IPC handlers registered');

    createWindow();

    // Set main window reference for Canon camera service
    if (mainWindow) {
      setCanonMainWindow(mainWindow);
    }

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();


    });
  })
  .catch(console.log);

interface PrintConfig {
  imageDataUrl: string;
  frameId: string;
  frameName: string;
  copies?: number;
  orientation?: 'portrait' | 'landscape';
  imageSize?: string; // เช่น "1200x3600", "3600x2400", "2400x3600"
  horizontal?: number;
  vertical?: number;
  scale?: number; // เปอร์เซ็นต์ (100 = 100%, 50 = 50%, 150 = 150%)
}

let isPrinting = false;
let lastPrintImageHash: string | null = null;
let lastPrintTime = 0;
const PRINT_DEBOUNCE_MS = 3000; // ป้องกันการพิมพ์ซ้ำภายใน 3 วินาที

// สร้าง hash จาก imageDataUrl เพื่อตรวจสอบว่าเป็นรูปเดียวกันหรือไม่
const getImageHash = (imageDataUrl: string): string => {
  // ใช้ส่วนแรกของ base64 data เป็น hash (ประมาณ 100 ตัวอักษร)
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  return base64Data.substring(0, 100);
};

ipcMain.on("print-photo", async (event, printConfig) => {
  const now = Date.now();
  const imageHash = getImageHash(printConfig.imageDataUrl);

  // ตรวจสอบว่ากำลังพิมพ์อยู่หรือไม่
  if (isPrinting) {
    event.reply("print-response", {
      success: false,
      error: "กำลังพิมพ์อยู่ กรุณารอสักครู่"
    });
    return;
  }

  // ตรวจสอบว่าเป็นรูปเดียวกันและเพิ่งพิมพ์ไปเมื่อไม่นานนี้
  if (
    lastPrintImageHash === imageHash &&
    now - lastPrintTime < PRINT_DEBOUNCE_MS
  ) {
    event.reply("print-response", {
      success: false,
      error: "รูปภาพนี้เพิ่งพิมพ์ไปเมื่อสักครู่"
    });
    return;
  }

  // ตั้งค่า flag และ hash
  isPrinting = true;
  lastPrintImageHash = imageHash;
  lastPrintTime = now;

  const copies = printConfig.copies || 1;

  try {
    // ใช้ generateImageWithPadding เพื่อเพิ่ม padding รอบรูปภาพ (5% ทั้ง 4 ด้าน)
    // ตรวจสอบ orientation ที่ส่งมา
    // หมายเหตุ: ถ้าไม่มี orientation ให้ตรวจสอบจาก frameId หรือใช้ default
    let orientation = printConfig.orientation;

    // ถ้าไม่มี orientation ให้ตรวจสอบจาก frameId หรือใช้ default
    if (!orientation) {
      // ตรวจสอบจาก frameId ว่ามีคำว่า portrait หรือ landscape หรือไม่
      const frameId = (printConfig.frameId || '').toLowerCase();
      if (frameId.includes('portrait')) {
        orientation = 'portrait';
      } else if (frameId.includes('landscape')) {
        orientation = 'landscape';
      } else {
        // Default: ใช้ landscape (ตามที่ PhotoFilter ส่งมา)
        orientation = 'landscape';
      }
    }

    console.log('🖨️ [Print] Print config received:', {
      frameId: printConfig.frameId,
      frameName: printConfig.frameName,
      copies,
      orientation,
      receivedOrientation: printConfig.orientation,
      hasOrientation: !!printConfig.orientation,
    });

    // ดึงค่า horizontal, vertical และ scale จาก printConfig หรือใช้ค่า default
    const horizontal = printConfig.horizontal ?? 0;
    const vertical = printConfig.vertical ?? 0;
    const scale = printConfig.scale ?? 100; // Default 100% (ไม่ zoom)

    const paddedImageBuffer = await generateImageWithPadding(
      printConfig.imageDataUrl,
      5,
      orientation,
      horizontal,
      vertical,
      scale
    );

    const tempDir = app.getPath("temp");
    const jpgPath = path.join(tempDir, `photo-${Date.now()}.jpg`);
    await fs.writeFile(jpgPath, paddedImageBuffer);

    // ตรวจสอบว่าเป็น frame 2x6 หรือไม่ (ต้องตัดกระดาษ)
    // ใช้ imageSize เพื่อตรวจสอบ:
    // - 1200x3600 = 2x6 (ต้องตัด)
    // - 3600x2400 = 6x4 (ไม่ต้องตัด)
    // - 2400x3600 = 4x6 (ไม่ต้องตัด)
    const imageSize = printConfig.imageSize || '';
    const is2x6Frame = imageSize === '1200x3600';

    // Log สำหรับ debug
    console.log('🖨️ [Print] Frame type detection:', {
      imageSize,
      is2x6Frame,
      frameId: printConfig.frameId,
    });

    // ดึง printer name จาก config ก่อน
    let printerName = "DP-QW410";

    // 1. ลองดึงจาก printer config ที่บันทึกไว้
    const printerConfig = await getPrinterConfig();
    if (printerConfig) {
      // ใช้ getActivePrinter เพื่อเลือก printer ตาม frame type
      // ถ้าเป็น 2x6 และมี secondary ที่ canCut=true → ใช้ secondary
      const activePrinter = getActivePrinter(printerConfig, is2x6Frame);
      printerName = activePrinter.printerName;

      // ใช้ electron-log เพื่อบันทึกลงไฟล์
      log.info('🖨️ [Print] Printer selection debug:', {
        is2x6Frame,
        imageSize,
        frameId: printConfig.frameId,
        mainPrinter: printerConfig.main.printerName,
        mainCanCut: printerConfig.main.canCut,
        secondaryPrinter: printerConfig.secondary?.printerName,
        secondaryCanCut: printerConfig.secondary?.canCut,
        selectedPrinter: printerName,
        selectedCanCut: activePrinter.canCut,
      });
    } else if (mainWindow) {
      // 2. ถ้าไม่มี config ให้หา QW410 จากรายการ printers
      const printers = await mainWindow.webContents.getPrintersAsync();
      const target = printers.find(p => p.name.toLowerCase().includes("qw410"));
      if (target) printerName = target.name;
      log.info('🖨️ [Print] Using auto-detected printer:', printerName);
    }

    // พิมพ์หลายครั้งตาม copies
    let completedPrints = 0;
    let hasError = false;
    let errorMessage = "";

    const printNext = (copyNumber: number) => {
      if (copyNumber > copies) {
        // พิมพ์เสร็จทั้งหมดแล้ว
        setTimeout(() => fs.unlink(jpgPath).catch(() => {}), 2000);

        if (hasError) {
          event.reply("print-response", { success: false, error: errorMessage });
        } else {
          event.reply("print-response", { success: true });
        }

        // ปลดล็อคหลังพิมพ์เสร็จ (รอสักครู่เพื่อป้องกันการพิมพ์ซ้ำ)
        setTimeout(() => {
          isPrinting = false;
        }, 1000);
        return;
      }

      // สร้าง print command ตาม OS
      let printCmd: string;
      const platform = process.platform;

      if (platform === 'win32') {
        // Windows
        printCmd = `rundll32.exe C:\\WINDOWS\\system32\\shimgvw.dll,ImageView_PrintTo "${jpgPath}" "${printerName}"`;
      } else if (platform === 'darwin') {
        // macOS
        printCmd = `lpr -P "${printerName}" "${jpgPath}"`;
      } else {
        // Linux และ OS อื่นๆ
        printCmd = `lp -d "${printerName}" "${jpgPath}"`;
      }

      exec(printCmd, (err) => {
        if (err) {
          console.error(`Print error (copy ${copyNumber}):`, err);
          hasError = true;
          errorMessage = err.message;
        } else {
          completedPrints++;
        }

        // พิมพ์ copy ถัดไป (รอสักครู่เพื่อให้เครื่องพิมพ์พร้อม)
        setTimeout(() => {
          printNext(copyNumber + 1);
        }, 1000);
      });
    };

    // เริ่มพิมพ์ copy แรก
    printNext(1);

  } catch (err) {
    console.error(err);
    event.reply("print-response", {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    });
    isPrinting = false;
  }
});


// // KSher Payment IPC handlers
// ipcMain.handle(
//   'create-payment',
//   async (event, amount: number, orderNo: string) => {
//     try {
//       const result = await ksherService.createPayment(amount, orderNo);
//       return result;
//     } catch (error) {
//       console.error('Error in create-payment handler:', error);
//       const errorMessage =
//         error instanceof Error ? error.message : 'Unknown error';
//       return { success: false, error: errorMessage };
//     }
//   },
// );

// ipcMain.handle('check-payment-status', async (event, referenceId: string) => {
//   try {
//     const result = await ksherService.checkPaymentStatus(referenceId);
//     return result;
//   } catch (error) {
//     console.error('Error in check-payment-status handler:', error);
//     const errorMessage =
//       error instanceof Error ? error.message : 'Unknown error';
//     return { success: false, error: errorMessage };
//   }
// });

// Machine Payment API handler
ipcMain.handle(
  'create-machine-payment',
  async (event, amount: number, numberPhoto: number, channel: string = 'promptpay', couponCodeId?: string) => {
    try {
      const result = await machineService.createPayment(amount, numberPhoto, channel, couponCodeId);
      return result;
    } catch (error) {
      console.error('Error in create-machine-payment handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

// Machine Coupon API handler
ipcMain.handle(
  'check-machine-coupon',
  async (event, code: string) => {
    try {
      const result = await machineService.checkCoupon(code);
      return result;
    } catch (error) {
      console.error('Error in check-machine-coupon handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, message: errorMessage };
    }
  },
);

ipcMain.handle(
  'check-machine-payment-status',
  async (event, mchOrderNo: string) => {
    try {
      const result = await machineService.checkPaymentStatus(mchOrderNo);
      return result;
    } catch (error) {
      console.error('Error in check-machine-payment-status handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

// Handler สำหรับ request prices
ipcMain.handle('get-machine-prices', async () => {
  try {
    if (cachedInitData?.prices) {
      return { success: true, prices: cachedInitData.prices };
    }
    // ถ้ายังไม่มี cache ให้เรียก API ใหม่
    const initResponse = await machineService.init();
    handleShutdownReady(initResponse);
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };
    return { success: true, prices: initResponse.machine.prices || [] };
  } catch (error) {
    console.error('Error in get-machine-prices handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage, prices: [] };
  }
});

// Handler สำหรับ request environment variables
ipcMain.handle('get-env-vars', async () => {
  // ดึง environment variables จาก persistent config หรือ process.env
  return await getEnvConfig();
});

// Handler สำหรับ request machine data (รวม cameraCountdown)
ipcMain.handle('get-machine-data', async () => {
  try {
    // ดึง canCut จาก main printer config (ใช้สำหรับ UI decision)
    // Note: ตอนปริ้นจริงจะเลือก printer ตาม frame type อีกที
    const printerConfig = await getPrinterConfig();
    let canCut = true; // default: เครื่องตัดได้
    if (printerConfig) {
      // ใช้ main.canCut เป็นค่าหลัก
      // ถ้ามี secondary ที่ canCut=true ก็ถือว่าระบบตัดได้
      canCut = printerConfig.main.canCut || (printerConfig.secondary?.canCut ?? false);
    }

    if (cachedInitData?.machine) {
      return {
        success: true,
        machine: {
          ...cachedInitData.machine,
          canCut,
        },
      };
    }
    // ถ้ายังไม่มี cache ให้เรียก API ใหม่
    const initResponse = await machineService.init();
    handleShutdownReady(initResponse);
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };
    return {
      success: true,
      machine: {
        ...initResponse.machine,
        canCut,
      },
    };
  } catch (error) {
    console.error('Error in get-machine-data handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Handler สำหรับ force init (เรียก API ใหม่เสมอ)
ipcMain.handle('force-init', async () => {
  try {
    const initResponse = await machineService.init();

    // เช็ค isShutdownReady และ isClosedAppReady และจัดการ shutdown/close
    handleShutdownReady(initResponse);

    // Update cache
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };

    return {
      success: true,
      data: initResponse
    };
  } catch (error) {
     console.error('❌ [Main] Force init failed:', error);
     const errorMessage =
       error instanceof Error ? error.message : 'Unknown error';
     return { success: false, error: errorMessage };
  }
});

// Handler สำหรับ save temp video file
ipcMain.handle('save-temp-video', async (event, arrayBuffer: ArrayBuffer) => {
  try {
    const tempDir = app.getPath('temp');
    const fileName = `temp-video-${Date.now()}.webm`;
    const filePath = path.join(tempDir, fileName);

    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(arrayBuffer);

    // Write file
    await fs.writeFile(filePath, buffer);

    return {
      success: true,
      path: filePath,
    };
  } catch (error) {
    console.error('❌ [Main] Error saving temp video:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
});

// Handler สำหรับ apply LUT to video
ipcMain.handle('apply-lut-to-video', async (event, videoPath: string, lutFileName: string) => {
  try {
    const outputPath = await applyLutToVideo(videoPath, lutFileName);
    return {
      success: true,
      path: outputPath,
    };
  } catch (error) {
    console.error('❌ [Main] Error applying LUT to video:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
});

// Handler สำหรับ create boomerang with LUT
ipcMain.handle('create-boomerang-with-lut', async (event, videoPath: string, lutFileName: string) => {
  try {
    const outputPath = await createBoomerangWithLut(videoPath, lutFileName);
    return {
      success: true,
      path: outputPath,
    };
  } catch (error) {
    console.error('❌ [Main] Error creating boomerang with LUT:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
});

// Handler สำหรับ convert WebM to MP4 (iPhone/Safari compatibility)
ipcMain.handle('convert-to-mp4', async (event, videoPath: string, returnBase64: boolean = false) => {
  try {
    console.log('🎬 [Main] Converting WebM to MP4:', videoPath, 'returnBase64:', returnBase64);

    if (returnBase64) {
      // Return as Base64 data URL (useful for direct download/embedding)
      const dataUrl = await convertWebmToMp4Base64(videoPath);
      return {
        success: true,
        dataUrl,
      };
    } else {
      // Return file path
      const outputPath = await convertWebmToMp4(videoPath);
      return {
        success: true,
        path: outputPath,
      };
    }
  } catch (error) {
    console.error('❌ [Main] Error converting to MP4:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
});

// Config IPC handlers
ipcMain.handle('get-machine-config', async () => {
  try {
    const config = await getMachineConfig();
    return { success: true, config };
  } catch (error) {
    console.error('❌ [Main] Error getting machine config:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-machine-config', async (event, config: { machineId: string; machinePort: string }) => {
  try {
    const success = await saveMachineConfig(config);
    if (success) {
      // Clear cache เพื่อให้อ่าน config ใหม่
      clearEnvConfigCache();
      return { success: true };
    }
    return { success: false, error: 'Failed to save config' };
  } catch (error) {
    console.error('❌ [Main] Error saving machine config:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('has-machine-config', async () => {
  try {
    const hasConfig = await hasMachineConfig();
    return { success: true, hasConfig };
  } catch (error) {
    console.error('❌ [Main] Error checking machine config:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('delete-machine-config', async () => {
  try {
    const success = await deleteMachineConfig();
    if (success) {
      // Clear cache เพื่อให้อ่าน config ใหม่
      clearEnvConfigCache();
      // Reset paper position config เป็น default ด้วย
      await deletePaperPositionConfig();
      return { success: true };
    }
    return { success: false, error: 'Failed to delete config' };
  } catch (error) {
    console.error('❌ [Main] Error deleting machine config:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('get-config-file-path', async () => {
  try {
    const configPath = getConfigFilePath();
    console.log('📁 [Main] Config file path:', configPath);
    return { success: true, path: configPath };
  } catch (error) {
    console.error('❌ [Main] Error getting config file path:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Handler สำหรับ read video file
ipcMain.handle('read-video-file', async (event, filePath: string) => {
  try {
    const buffer = await fs.readFile(filePath);
    return {
      success: true,
      data: buffer.buffer, // Return ArrayBuffer
    };
  } catch (error) {
    console.error('❌ [Main] Error reading video file:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
});

// Handler สำหรับ request theme data
ipcMain.handle('get-theme-data', async () => {
  try {
    if (cachedInitData?.theme) {
      return { success: true, theme: cachedInitData.theme };
    }
    // ถ้ายังไม่มี cache ให้เรียก API ใหม่
    const initResponse = await machineService.init();
    handleShutdownReady(initResponse);
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };
    return { success: true, theme: initResponse.theme };
  } catch (error) {
    console.error('Error in get-theme-data handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Paper Position Config handlers
ipcMain.handle('get-paper-position-config', async () => {
  try {
    const config = await getPaperPositionConfig();
    return { success: true, config };
  } catch (error) {
    console.error('Error in get-paper-position-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-paper-position-config', async (event, config: PaperPositionConfig) => {
  try {
    const success = await savePaperPositionConfig(config);
    if (success) {
      return { success: true };
    }
    return { success: false, error: 'Failed to save config' };
  } catch (error) {
    console.error('Error in save-paper-position-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('get-default-paper-position-config', async () => {
  try {
    console.log('📋 [Main] get-default-paper-position-config called');
    console.log('📋 [Main] DEFAULT_PAPER_POSITION_CONFIG:', DEFAULT_PAPER_POSITION_CONFIG);
    return { success: true, config: DEFAULT_PAPER_POSITION_CONFIG };
  } catch (error) {
    console.error('❌ [Main] Error in get-default-paper-position-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('reset-paper-position-config', async () => {
  try {
    // ลบ config file เพื่อใช้ default values
    await deletePaperPositionConfig();
    return { success: true };
  } catch (error) {
    console.error('Error in reset-paper-position-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Handler สำหรับ request paper position data
ipcMain.handle('get-paper-position', async () => {
  try {
    if (cachedInitData?.paperPosition) {
      return { success: true, paperPosition: cachedInitData.paperPosition };
    }
    // ถ้ายังไม่มี cache ให้เรียก API ใหม่
    const initResponse = await machineService.init();
    handleShutdownReady(initResponse);
    cachedInitData = {
      machine: initResponse.machine,
      prices: initResponse.machine.prices || [],
      theme: initResponse.theme,
      paperPosition: initResponse.paperPosition,
    };
    return {
      success: true,
      paperPosition: initResponse.paperPosition || null,
    };
  } catch (error) {
    console.error('Error in get-paper-position handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Print Test Position handlers
ipcMain.handle('get-print-test-position', async () => {
  try {
    const position = await getPrintTestPosition();
    return { success: true, position };
  } catch (error) {
    console.error('Error in get-print-test-position handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-print-test-position', async (event, position: PrintTestPosition) => {
  try {
    const success = await savePrintTestPosition(position);
    if (success) {
      return { success: true };
    }
    return { success: false, error: 'Failed to save position' };
  } catch (error) {
    console.error('Error in save-print-test-position handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Handler สำหรับสร้าง photo session
ipcMain.handle(
  'create-photo-session',
  async (
    event,
    transactionId: string,
    transactionCode?: string,
  ) => {
    try {
      const result = await machineService.createPhotoSession(
        transactionId,
        transactionCode,
      );
      return result;
    } catch (error) {
      console.error('❌ [Main] Error in create-photo-session handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
        photoSession: {
          id: '',
          transactionId,
          numPhotosSelected: 0,
          status: 'failed',
        },
        qrcodeStorageUrl: '',
      };
    }
  },
);

// Handler สำหรับ upload files ไปยัง session
ipcMain.handle(
  'upload-files-to-session',
  async (
    event,
    sessionId: string,
    photos: string[],
    videos: string[] = [],
  ) => {
    try {
      const result = await machineService.uploadFilesToSession(
        sessionId,
        photos,
        videos,
      );
      return result;
    } catch (error) {
      console.error('❌ [Main] Error in upload-files-to-session handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
        photoSession: {
          id: sessionId,
          transactionId: '',
          numPhotosSelected: photos.length,
          status: 'failed',
        },
        files: [],
      };
    }
  },
);

// Handler สำหรับ upload files (Legacy - สำหรับ backward compatibility)
ipcMain.handle(
  'upload-machine-files',
  async (
    event,
    transactionCode: string,
    photos: string[],
    videos: string[] = [],
    transactionId?: string,
  ) => {
    try {
      const result = await machineService.uploadFiles(
        transactionCode,
        photos,
        videos,
        transactionId,
      );
      return result;
    } catch (error) {
      console.error('❌ [Main] Error in upload-machine-files handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
        photoSession: {
          id: '',
          transactionId: transactionId || transactionCode,
          numPhotosSelected: photos.length,
        },
        files: [],
      };
    }
  },
);

// Handler สำหรับ background upload (ส่ง job ไป queue และ return ทันที)
// ใช้เมื่อต้องการให้ upload ทำงานเบื้องหลังโดยไม่ต้องรอ
// ถ้าส่ง webmVideoPath มาด้วย จะแปลง WebM→MP4 ในเบื้องหลังก่อน upload
ipcMain.handle(
  'queue-background-upload',
  async (
    event,
    sessionId: string,
    photos: string[],
    videos: string[] = [],
    webmVideoPath?: string,
  ) => {
    try {
      console.log('📤 [Main] Queueing background upload...');
      console.log(`📤 [Main] Session: ${sessionId}, Photos: ${photos.length}, Videos: ${videos.length}`);
      if (webmVideoPath) {
        console.log(`📤 [Main] WebM video path: ${webmVideoPath} (will convert in background)`);
      }

      const result = await backgroundUploadService.queueUpload(
        sessionId,
        photos,
        videos,
        webmVideoPath,
      );

      console.log(`✅ [Main] Upload queued with job ID: ${result.jobId}`);
      return {
        success: true,
        jobId: result.jobId,
        message: 'Upload queued successfully',
      };
    } catch (error) {
      console.error('❌ [Main] Error in queue-background-upload handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
      };
    }
  },
);

// Handler สำหรับตรวจสอบสถานะ background upload job
ipcMain.handle('get-upload-job-status', async (event, jobId: string) => {
  try {
    const job = backgroundUploadService.getJobStatus(jobId);
    return {
      success: true,
      job: job || null,
    };
  } catch (error) {
    console.error('❌ [Main] Error in get-upload-job-status handler:', error);
    return {
      success: false,
      job: null,
    };
  }
});

// Handler สำหรับตรวจสอบจำนวน pending uploads
ipcMain.handle('get-pending-uploads-count', async () => {
  try {
    const count = backgroundUploadService.getPendingCount();
    return {
      success: true,
      count,
    };
  } catch (error) {
    console.error('❌ [Main] Error in get-pending-uploads-count handler:', error);
    return {
      success: false,
      count: 0,
    };
  }
});

// ==================== SHUTDOWN MANAGEMENT ====================

// Handler สำหรับแจ้งว่ามี user activity ที่หน้าตู้ (reset countdown)
ipcMain.on('user-activity', () => {
  shutdownManager.onUserActivity();
  appCloseManager.onUserActivity();
});

// Handler สำหรับเริ่ม transaction (pause countdown)
ipcMain.on('transaction-start', () => {
  shutdownManager.startTransaction();
  appCloseManager.startTransaction();
});

// Handler สำหรับจบ transaction (reset countdown เป็น 1 นาที)
ipcMain.on('transaction-end', () => {
  shutdownManager.endTransaction();
  appCloseManager.endTransaction();
});

// Handler สำหรับ request shutdown state
ipcMain.handle('get-shutdown-state', () => {
  return shutdownManager.getState();
});

// Handler สำหรับ request app close state
ipcMain.handle('get-app-close-state', () => {
  return appCloseManager.getState();
});

// Handler สำหรับแจ้งว่าเข้าหน้า home (reset countdown เป็น 1 นาทีใหม่)
ipcMain.on('home-page-active', () => {
  console.log('🏠 [Main] Home page active, resetting countdowns to 1 minute');
  shutdownManager.resetCountdownOnHome();
  appCloseManager.resetCountdownOnHome();
});

// Handler สำหรับแจ้งว่าออกจากหน้า home (pause countdown)
ipcMain.on('home-page-inactive', () => {
  console.log('🚪 [Main] Home page inactive, pausing countdowns');
  shutdownManager.pauseCountdown();
  appCloseManager.pauseCountdown();
});

// Handler สำหรับยกเลิก shutdown
ipcMain.handle('cancel-shutdown', () => {
  console.log('🔄 [Main] Cancelling shutdown');
  shutdownManager.cancelShutdown();
  return { success: true };
});

// Handler สำหรับยกเลิก app close
ipcMain.handle('cancel-app-close', () => {
  console.log('🔄 [Main] Cancelling app close');
  appCloseManager.cancelAppClose();
  return { success: true };
});

// Handler สำหรับ request SSE connection status
ipcMain.handle('get-sse-status', () => {
  return {
    isConnected: sseClient.getIsConnected(),
  };
});

// Handler สำหรับ request resources path
ipcMain.handle('get-resources-path', () => {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return app.getAppPath();
});

// Handler สำหรับปิดแอป (ต้องผ่าน password verification แล้ว)
ipcMain.on('quit-app', () => {
  // ตั้ง flag เพื่อบอกว่าเราต้องการปิดแอปจริงๆ
  shouldQuit = true;
  // ปิด window (จะไม่ถูก preventDefault เพราะ shouldQuit = true)
  if (mainWindow) {
    mainWindow.close();
  }
});

// Camera Config handlers
ipcMain.handle('get-camera-config', async () => {
  try {
    const config = await getCameraConfig();
    return { success: true, config };
  } catch (error) {
    console.error('Error in get-camera-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Handler สำหรับรับผลการเช็ค camera availability จาก renderer
ipcMain.on('camera-availability-result', async (event, result: {
  found: boolean;
  configuredDeviceId: string;
  configuredLabel: string;
  availableDevices: string[];
}) => {
  if (!result.found) {
    console.warn(`⚠️ [Main] Configured camera not found: ${result.configuredLabel} (${result.configuredDeviceId})`);
    // ส่งแจ้งเตือน
    machineService.sendDeviceAlert(
      'camera',
      result.configuredLabel,
      result.availableDevices,
    ).catch(err => console.error('❌ [Main] Failed to send camera alert:', err));

    // ส่ง event ไปที่ renderer เพื่อแสดงหน้า maintenance
    if (mainWindow) {
      mainWindow.webContents.send('device-not-found', {
        deviceType: 'camera',
        deviceName: result.configuredLabel,
      });
    }
  } else {
    console.log(`✅ [Main] Configured camera found: ${result.configuredLabel}`);
  }
});

ipcMain.handle('save-camera-config', async (event, config: CameraConfig) => {
  try {
    const success = await saveCameraConfig(config);
    return { success };
  } catch (error) {
    console.error('Error in save-camera-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('has-camera-config', async () => {
  try {
    const hasConfig = await hasCameraConfig();
    return { success: true, hasConfig };
  } catch (error) {
    console.error('Error in has-camera-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('delete-camera-config', async () => {
  try {
    const success = await deleteCameraConfig();
    return { success };
  } catch (error) {
    console.error('Error in delete-camera-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Printer Config handlers
ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'Main window not available' };
    }
    const printers = await mainWindow.webContents.getPrintersAsync();
    const printerList = printers.map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault || false,
    }));
    return { success: true, printers: printerList };
  } catch (error) {
    console.error('Error in get-printers handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('get-printer-config', async () => {
  try {
    const config = await getPrinterConfig();
    return { success: true, config };
  } catch (error) {
    console.error('Error in get-printer-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('save-printer-config', async (event, config: PrinterConfig) => {
  try {
    const success = await savePrinterConfig(config);
    return { success };
  } catch (error) {
    console.error('Error in save-printer-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('has-printer-config', async () => {
  try {
    const hasConfig = await hasPrinterConfig();
    return { success: true, hasConfig };
  } catch (error) {
    console.error('Error in has-printer-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('delete-printer-config', async () => {
  try {
    const success = await deletePrinterConfig();
    return { success };
  } catch (error) {
    console.error('Error in delete-printer-config handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});
