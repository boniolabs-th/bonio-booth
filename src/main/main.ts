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

/**
 * สร้างรูปภาพที่มี padding รอบๆ เพื่อป้องกันการล้นและขาดขอบ
 * ใช้ BrowserWindow เพื่อ render รูปภาพให้เหมาะสมกับเครื่องปริ้น
 */
async function generateImageWithPadding(base64: string, paddingPercent = 0): Promise<Buffer> {
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
        max-width: calc(100% - ${1}%);
        max-height: calc(100% - ${1}%);
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        // transform: rotate(90deg);
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
      console.log("HTML file created:", htmlPath);

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
      console.log("HTML file loaded successfully");

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
  copies?: number;
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

  console.log("=== NATIVE PRINT METHOD WITH PADDING ===");
  console.log("Image hash:", imageHash.substring(0, 20) + "...");

  const copies = printConfig.copies || 1;
  console.log(`Printing ${copies} copy/copies`);

  try {
    // ใช้ generateImageWithPadding เพื่อเพิ่ม padding รอบรูปภาพ (5% ทั้ง 4 ด้าน)
    console.log("Generating image with padding...");
    const paddedImageBuffer = await generateImageWithPadding(printConfig.imageDataUrl, 5);
    console.log("Padded image generated, size:", paddedImageBuffer.length, "bytes");

    const tempDir = app.getPath("temp");
    const pngPath = path.join(tempDir, `photo-${Date.now()}.png`);
    await fs.writeFile(pngPath, paddedImageBuffer);
    console.log("PNG file saved:", pngPath);

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
          console.log(`Print success: ${completedPrints} copy/copies printed`);
          event.reply("print-response", { success: true });
        }

        // ปลดล็อคหลังพิมพ์เสร็จ (รอสักครู่เพื่อป้องกันการพิมพ์ซ้ำ)
        setTimeout(() => {
          isPrinting = false;
        }, 1000);
        return;
      }

      const printCmd = `rundll32.exe C:\\WINDOWS\\system32\\shimgvw.dll,ImageView_PrintTo "${pngPath}" "${printerName}"`;
      console.log(`Executing print ${copyNumber}/${copies}:`, printCmd);

      exec(printCmd, (err) => {
        if (err) {
          console.error(`Print error (copy ${copyNumber}):`, err);
          hasError = true;
          errorMessage = err.message;
        } else {
          console.log(`Print success (copy ${copyNumber}/${copies})`);
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
