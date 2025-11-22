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

ipcMain.on('print-photo', async (event, printConfig: PrintConfig) => {
  console.log("=== NATIVE PRINT METHOD ===");

  if (!printConfig.imageDataUrl) {
    event.reply("print-response", { success: false, error: "No image data" });
    return;
  }

  try {
    const tempDir = app.getPath("temp");
    const jpgPath = path.join(tempDir, `photo-${Date.now()}.jpg`);

    // ตัด prefix base64
    const base64Data = printConfig.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // สร้างไฟล์ JPG
    await fs.writeFile(jpgPath, buffer);

    console.log("JPG created:", jpgPath);

    // หา printer name จาก list
    let printerName = "DP-QW410"; // default
    if (mainWindow) {
      try {
        const printers = await mainWindow.webContents.getPrintersAsync();
        console.log("Available printers:", JSON.stringify(printers, null, 2));

        const targetPrinter = printers.find(
          (p) => p.name.toLowerCase().includes('dp-qw410') ||
                 p.name.toLowerCase().includes('qw410')
        );
        if (targetPrinter) {
          printerName = targetPrinter.name;
          console.log("Found printer:", printerName);
        } else if (printers.length > 0) {
          // ใช้ default printer ถ้าไม่เจอ DP-QW410
          const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
          printerName = defaultPrinter.name;
          console.log("Using default printer:", printerName);
        }
      } catch (err) {
        console.error("Error getting printers:", err);
      }
    }

    console.log("Using printer:", printerName);

    // ตัวเลือก 1 (ดีที่สุด): ใช้ mspaint.exe
    const mspaintCmd = `mspaint.exe /pt "${jpgPath}" "${printerName}"`;
    console.log("Executing:", mspaintCmd);

    exec(mspaintCmd, (err) => {
      if (err) {
        console.error("MSPaint print error:", err);

        // fallback ตัวเลือก 2: ใช้ rundll32
        const fallbackCmd = `rundll32.exe C:\\WINDOWS\\system32\\shimgvw.dll,ImageView_PrintTo "${jpgPath}" "${printerName}"`;
        console.log("Fallback print:", fallbackCmd);

        exec(fallbackCmd, (err2) => {
          // ลบไฟล์ temp หลังพิมพ์เสร็จ (รอสักครู่)
          setTimeout(() => {
            fs.unlink(jpgPath).catch(() => {});
          }, 3000);

          if (err2) {
            console.error("Fallback print error:", err2);
            event.reply("print-response", {
              success: false,
              error: err2.message || "Print failed"
            });
          } else {
            console.log("Fallback print success");
            event.reply("print-response", { success: true });
          }
        });
      } else {
        console.log("MSPaint print success");

        // ลบไฟล์ temp หลังพิมพ์เสร็จ (รอสักครู่)
        setTimeout(() => {
          fs.unlink(jpgPath).catch(() => {});
        }, 3000);

        event.reply("print-response", { success: true });
      }
    });



   } catch (err) {
     console.error("PDF Print Error:", err);
     event.reply("print-response", {
       success: false,
       error: err instanceof Error ? err.message : "Unknown error",
     });
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
