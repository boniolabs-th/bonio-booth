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
import { app, BrowserWindow, shell, ipcMain, session } from 'electron';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
} from './services/videoService';
import machineService from './services/machineService';
import sseClient from './services/sseClient';
import shutdownManager, { ShutdownState } from './services/shutdownManager';
import { getEnvConfig, clearEnvConfigCache, DEFAULT_PORT } from './config/env.config';
import {
  getMachineConfig,
  saveMachineConfig,
  hasMachineConfig,
  deleteMachineConfig,
  getConfigFilePath,
} from './services/configService';
class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
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

    // Setup shutdown manager callbacks
    shutdownManager.setCallbacks({
      onCountdownUpdate: (state: ShutdownState) => {
        // ส่งสถานะ countdown ไปที่ renderer
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-countdown-update', state);
        }
      },
      onShutdownStarting: () => {
        // แจ้ง renderer ว่ากำลังจะ shutdown
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-starting');
        }
      },
      onShutdownCancelled: () => {
        // แจ้ง renderer ว่ายกเลิก shutdown
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-cancelled');
        }
      },
      onActivityDetected: () => {
        // แจ้ง renderer ว่า countdown ถูก reset
        if (mainWindow) {
          mainWindow.webContents.send('shutdown-countdown-reset');
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
 * สร้างรูปภาพที่มี padding รอบๆ เพื่อป้องกันการล้นและขาดขอบ
 * ใช้ BrowserWindow เพื่อ render รูปภาพให้เหมาะสมกับเครื่องปริ้น
 */
async function generateImageWithPadding(
  base64: string,
  paddingPercent = 0,
  orientation: 'portrait' | 'landscape' = 'portrait'
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
        max-width: calc(100% ${orientation === 'landscape' ? '+' : '-'} ${orientation === 'landscape' ? '14' : '5'}%);
        max-height: calc(100% ${orientation === 'landscape' ? '+' : '-'} ${orientation === 'landscape' ? '16' : '5'}%);
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        transform: ${orientation === 'landscape' ? 'rotate(90deg)' : 'none'};
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
              const buffer = image.toPNG();
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
      template.push({ type: 'separator' });
    }

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
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
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

    createWindow();
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

    const paddedImageBuffer = await generateImageWithPadding(printConfig.imageDataUrl, 5, orientation);

    const tempDir = app.getPath("temp");
    const pngPath = path.join(tempDir, `photo-${Date.now()}.png`);
    await fs.writeFile(pngPath, paddedImageBuffer);

    let printerName = "DP-QW410";

    if (mainWindow) {
      const printers = await mainWindow.webContents.getPrintersAsync();
      const target = printers.find(p => p.name.toLowerCase().includes("qw410"));
      if (target) printerName = target.name;
    }

    // พิมพ์หลายครั้งตาม copies
    let completedPrints = 0;
    let hasError = false;
    let errorMessage = "";

    const printNext = (copyNumber: number) => {
      if (copyNumber > copies) {
        // พิมพ์เสร็จทั้งหมดแล้ว
        setTimeout(() => fs.unlink(pngPath).catch(() => {}), 2000);

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
        printCmd = `rundll32.exe C:\\WINDOWS\\system32\\shimgvw.dll,ImageView_PrintTo "${pngPath}" "${printerName}"`;
      } else if (platform === 'darwin') {
        // macOS
        printCmd = `lpr -P "${printerName}" "${pngPath}"`;
      } else {
        // Linux และ OS อื่นๆ
        printCmd = `lp -d "${printerName}" "${pngPath}"`;
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
    const canCut = process.env.MACHINE_CAN_CUT !== 'false';

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

// Handler สำหรับ request paper position data
ipcMain.handle('get-paper-position', async () => {
  try {
    if (cachedInitData?.paperPosition) {
      return { success: true, paperPosition: cachedInitData.paperPosition };
    }
    // ถ้ายังไม่มี cache ให้เรียก API ใหม่
    const initResponse = await machineService.init();
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

// Handler สำหรับ upload files
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

// ==================== SHUTDOWN MANAGEMENT ====================

// Handler สำหรับแจ้งว่ามี user activity ที่หน้าตู้ (reset countdown)
ipcMain.on('user-activity', () => {
  shutdownManager.onUserActivity();
});

// Handler สำหรับเริ่ม transaction (pause countdown)
ipcMain.on('transaction-start', () => {
  shutdownManager.startTransaction();
});

// Handler สำหรับจบ transaction (reset countdown เป็น 10 นาที)
ipcMain.on('transaction-end', () => {
  shutdownManager.endTransaction();
});

// Handler สำหรับ request shutdown state
ipcMain.handle('get-shutdown-state', () => {
  return shutdownManager.getState();
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
