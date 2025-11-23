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
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import ksherService from './services/ksherService';
import {
  createBoomerangVideo,
  createBoomerangGif,
  extractFrames,
  framesToDataUrls,
  cleanupTempFiles,
  applyLutToVideo,
  createBoomerangWithLut,
} from './services/videoService';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

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

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    console.log("Print request ignored: already printing.");
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
    console.log(
      `Print request ignored: same image printed ${Math.round((now - lastPrintTime) / 1000)}s ago`
    );
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

  console.log("=== NATIVE PRINT METHOD ===");
  console.log("Image hash:", imageHash.substring(0, 20) + "...");

  try {
    const tempDir = app.getPath("temp");
    const jpgPath = path.join(tempDir, `photo-${Date.now()}.jpg`);

    const base64Data = printConfig.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await fs.writeFile(jpgPath, buffer);

    let printerName = "DP-QW410";

    if (mainWindow) {
      const printers = await mainWindow.webContents.getPrintersAsync();
      const target = printers.find(p => p.name.toLowerCase().includes("qw410"));
      if (target) printerName = target.name;
    }

    const printCmd = `rundll32.exe C:\\WINDOWS\\system32\\shimgvw.dll,ImageView_PrintTo "${jpgPath}" "${printerName}"`;
    console.log("Executing:", printCmd);

    exec(printCmd, err => {
      setTimeout(() => fs.unlink(jpgPath).catch(() => {}), 2000);

      if (err) {
        console.error("Print error:", err);
        event.reply("print-response", { success: false, error: err.message });
      } else {
        console.log("Print success");
        event.reply("print-response", { success: true });
      }

      // ปลดล็อคหลังพิมพ์เสร็จ (รอสักครู่เพื่อป้องกันการพิมพ์ซ้ำ)
      setTimeout(() => {
        isPrinting = false;
      }, 1000);
    });

  } catch (err) {
    console.error(err);
    event.reply("print-response", {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error"
    });
    isPrinting = false;
  }
});


// KSher Payment IPC handlers
ipcMain.handle(
  'create-payment',
  async (event, amount: number, orderNo: string) => {
    try {
      const result = await ksherService.createPayment(amount, orderNo);
      return result;
    } catch (error) {
      console.error('Error in create-payment handler:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

ipcMain.handle('check-payment-status', async (event, referenceId: string) => {
  try {
    const result = await ksherService.checkPaymentStatus(referenceId);
    return result;
  } catch (error) {
    console.error('Error in check-payment-status handler:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});
