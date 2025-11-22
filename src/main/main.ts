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

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  event.reply('ipc-example', msgTemplate('pong'));
});

// Interface for print configuration
interface PrintConfig {
  imageDataUrl: string;
  frameId: string;
  frameName: string;
}

// Function to determine paper size and print settings based on frame
function getPrintSettings(frameId: string, frameName: string) {
  // Default settings
  let pageSize: any = 'A4';
  let scaleFactor = 1;
  let cutInstruction = '';

  // Configure based on frame type
  if (frameId === 'classic_2x6' || frameName.includes('2x6')) {
    // For 2x6 frame, use 4x6 paper and instruct printer to cut to 2x6
    pageSize = { width: 152400, height: 101600 }; // 4x6 inches in microns
    cutInstruction = '2x6_cut';
  } else if (frameId === 'modern_4x6' || frameName.includes('4x6')) {
    // For 4x6 frame, use appropriate paper size
    pageSize = { width: 152400, height: 203200 }; // 6x8 inches in microns
  }

  return {
    pageSize,
    scaleFactor,
    cutInstruction,
  };
}

ipcMain.on('print-photo', async (event, printConfig: PrintConfig) => {
  console.log('=== PRINT REQUEST RECEIVED ===');
  console.log('Frame ID:', printConfig.frameId);
  console.log('Frame Name:', printConfig.frameName);
  console.log('Image data URL length:', printConfig.imageDataUrl?.length || 0);

  try {
    if (!mainWindow) {
      console.error('Main window not found');
      event.reply('print-response', {
        success: false,
        error: 'Main window not found',
      });
      return;
    }

    console.log('Creating print window...');
    // Create a new hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    console.log('Print window created');

    // Create HTML content with the image
    // Escape the image data URL to prevent issues with special characters
    const escapedImageUrl = printConfig.imageDataUrl.replace(/"/g, '&quot;');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              img {
                width: 100%;
                height: auto;
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <img src="${escapedImageUrl}" alt="Photo to print" />
        </body>
      </html>
    `;

    // Write HTML to temporary file to avoid URL length issues
    const tempDir = app.getPath('temp');
    const tempHtmlPath = path.join(tempDir, `print-${Date.now()}.html`);

    try {
      console.log('Writing HTML to temp file:', tempHtmlPath);
      await fs.writeFile(tempHtmlPath, htmlContent, 'utf-8');
      console.log('HTML file written successfully');
    } catch (writeError) {
      console.error('Error writing HTML file:', writeError);
      event.reply('print-response', {
        success: false,
        error: `Failed to create print file: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`,
      });
      printWindow.close();
      return;
    }

    // Add error handlers
    printWindow.webContents.on('did-fail-load', (_webEvent, errorCode, errorDescription) => {
      console.error('Print window failed to load:', errorCode, errorDescription);
      // Clean up temp file
      fs.unlink(tempHtmlPath).catch(() => {});
      event.reply('print-response', {
        success: false,
        error: `Failed to load print window: ${errorDescription}`,
      });
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    });

    // Load the HTML file
    console.log('Loading HTML file into print window...');
    printWindow.loadFile(tempHtmlPath);

    // Set timeout for print window loading
    const loadTimeout = setTimeout(() => {
      console.error('Print window load timeout');
      // Clean up temp file
      fs.unlink(tempHtmlPath).catch(() => {});
      event.reply('print-response', {
        success: false,
        error: 'Print window load timeout',
      });
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    }, 10000); // 10 seconds timeout

    // Wait for the content to load
    printWindow.webContents.once('did-finish-load', async () => {
      clearTimeout(loadTimeout);
      console.log('Print window loaded, starting print process...');

      // Get print settings based on frame configuration
      const printSettings = getPrintSettings(printConfig.frameId, printConfig.frameName);
      console.log('Print settings:', printSettings);

      try {
        // Get available printers and find DNP printer
        const printers = await printWindow.webContents.getPrintersAsync();

        console.log(`Found ${printers.length} printer(s):`);
        printers.forEach((printer, index) => {
          console.log(`  ${index + 1}. ${printer.name} (default: ${printer.isDefault}, status: ${printer.status})`);
        });

        if (printers.length === 0) {
          // Clean up temp file
          fs.unlink(tempHtmlPath).catch(() => {});
          event.reply('print-response', {
            success: false,
            error: 'No printers found',
          });
          if (!printWindow.isDestroyed()) {
            printWindow.close();
          }
          return;
        }

        // Find specific printer by name (priority order)
        // 1. dp-qw410 (user's preferred printer)
        // 2. DNP printers
        // 3. Default printer
        const targetPrinterName = 'dp-qw410';
        const targetPrinter = printers.find(
          (printer) => printer.name.toLowerCase() === targetPrinterName.toLowerCase(),
        );

        const dnpPrinter = printers.find(
          (printer) =>
            printer.name.toLowerCase().includes('dnp') ||
            printer.name.toLowerCase().includes('rx1hs') ||
            printer.name.toLowerCase().includes('ds'),
        );

        // Use target printer if found, otherwise use DNP printer, then default printer
        const selectedPrinter = targetPrinter || dnpPrinter || printers.find(p => p.isDefault) || printers[0];

        if (targetPrinter) {
          console.log(`✓ Found target printer: ${selectedPrinter.name}`);
        } else if (dnpPrinter) {
          console.log(`⚠ Target printer (${targetPrinterName}) not found, using DNP printer: ${selectedPrinter.name}`);
        } else {
          console.log(`⚠ Target printer (${targetPrinterName}) not found, using default printer: ${selectedPrinter.name}`);
        }
        console.log(`Selected printer: ${selectedPrinter.name} (default: ${selectedPrinter.isDefault}, status: ${selectedPrinter.status})`);

        // Print configuration for different frame types
        // Try multiple approaches for better compatibility
        const printOptions: any = {
          silent: true, // Print without showing dialog
          printBackground: true,
          margins: {
            marginType: 'none', // Use no margins for photo printing
          },
        };

        // Set printer - try deviceName first, fallback to not specifying
        if (selectedPrinter.name) {
          printOptions.deviceName = selectedPrinter.name;
        }

        // Set page size - use string format for better compatibility
        if (typeof printSettings.pageSize === 'object') {
          // For custom sizes, try to use the object format
          printOptions.pageSize = printSettings.pageSize;
        } else {
          printOptions.pageSize = printSettings.pageSize;
        }

        // Add special handling for DNP printers with 2x6 frames
        if (printSettings.cutInstruction === '2x6_cut' || dnpPrinter) {
          // Add printer-specific options for DNP printer
          printOptions.dpi = { horizontal: 300, vertical: 300 };
          printOptions.copies = 1;
          // DNP printers typically support high-quality photo printing
          printOptions.color = true;
          printOptions.duplex = false;
        }

        console.log('Print options:', JSON.stringify(printOptions, null, 2));

        // Wait a bit to ensure image is fully loaded
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Helper function to cleanup and close
        const cleanupAndClose = () => {
          // Clean up temp file
          fs.unlink(tempHtmlPath).catch((err) => {
            console.error('Error deleting temp file:', err);
          });

          // Close window if not destroyed
          if (!printWindow.isDestroyed()) {
            setTimeout(() => {
              if (!printWindow.isDestroyed()) {
                printWindow.close();
              }
            }, 1000);
          }
        };

        // Print without showing dialog
        if (printWindow.isDestroyed()) {
          console.error('Print window was destroyed before printing');
          event.reply('print-response', {
            success: false,
            error: 'Print window was destroyed',
          });
          cleanupAndClose();
          return;
        }

        printWindow.webContents.print(
          printOptions,
          (success, failureReason) => {
            if (success) {
              console.log('Print job sent successfully');
              event.reply('print-response', { success: true });
              cleanupAndClose();
            } else {
              console.error('Print failed:', failureReason);

              // Try fallback: print without deviceName (use default)
              if (printOptions.deviceName && !printWindow.isDestroyed()) {
                console.log('Retrying print without deviceName...');
                const fallbackOptions = { ...printOptions };
                delete fallbackOptions.deviceName;

                if (printWindow.isDestroyed()) {
                  event.reply('print-response', {
                    success: false,
                    error: failureReason || 'Unknown print error',
                  });
                  cleanupAndClose();
                  return;
                }

                printWindow.webContents.print(
                  fallbackOptions,
                  (retrySuccess, retryFailureReason) => {
                    if (retrySuccess) {
                      console.log('Print job sent successfully (fallback)');
                      event.reply('print-response', { success: true });
                    } else {
                      console.error('Print failed (fallback):', retryFailureReason);
                      event.reply('print-response', {
                        success: false,
                        error: retryFailureReason || 'Unknown print error',
                      });
                    }
                    cleanupAndClose();
                  },
                );
              } else {
                event.reply('print-response', {
                  success: false,
                  error: failureReason || 'Unknown print error',
                });
                cleanupAndClose();
              }
            }
          },
        );
      } catch (error) {
        console.error('Error in print process:', error);
        // Clean up temp file
        fs.unlink(tempHtmlPath).catch(() => {});
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        event.reply('print-response', {
          success: false,
          error: `Print process error: ${errorMessage}`,
        });
        if (!printWindow.isDestroyed()) {
          printWindow.close();
        }
      }
    });
  } catch (error) {
    console.error('Print error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    event.reply('print-response', { success: false, error: errorMessage });
  }
});

// KSher Payment IPC handlers
ipcMain.handle('create-payment', async (event, amount: number, orderNo: string) => {
  try {
    const result = await ksherService.createPayment(amount, orderNo);
    return result;
  } catch (error) {
    console.error('Error in create-payment handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('check-payment-status', async (event, referenceId: string) => {
  try {
    const result = await ksherService.checkPaymentStatus(referenceId);
    return result;
  } catch (error) {
    console.error('Error in check-payment-status handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// Video processing IPC handlers using FFmpeg
ipcMain.handle('create-boomerang', async (event, videoPath: string, format: 'video' | 'gif' = 'video') => {
  try {

    let outputPath: string;
    if (format === 'gif') {
      outputPath = await createBoomerangGif(videoPath);
    } else {
      outputPath = await createBoomerangVideo(videoPath);
    }

    return { success: true, path: outputPath };
  } catch (error) {
    console.error('Error creating boomerang:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('extract-frames', async (event, videoPath: string, frameCount: number = 12) => {
  try {

    const framePaths = await extractFrames(videoPath, frameCount);
    const dataUrls = await framesToDataUrls(framePaths);

    return { success: true, frames: dataUrls, paths: framePaths };
  } catch (error) {
    console.error('Error extracting frames:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('cleanup-temp', async (event, filePaths: string[]) => {
  try {
    await cleanupTempFiles(filePaths);
    return { success: true };
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// LUT filter IPC handlers
ipcMain.handle('save-temp-video', async (event, arrayBuffer: ArrayBuffer) => {
  try {
    const fs = await import('fs');
    const tempPath = path.join(app.getPath('temp'), `temp-video-${Date.now()}.webm`);
    const buffer = Buffer.from(arrayBuffer);
    await fs.promises.writeFile(tempPath, buffer);
    return { success: true, path: tempPath };
  } catch (error) {
    console.error('Error saving temp video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle(
  'apply-lut-to-video',
  async (event, videoPath: string, lutFileName: string) => {
    try {
      const outputPath = await applyLutToVideo(videoPath, lutFileName);
      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Error applying LUT:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

ipcMain.handle(
  'create-boomerang-with-lut',
  async (event, videoPath: string, lutFileName: string) => {
    try {
      const outputPath = await createBoomerangWithLut(videoPath, lutFileName);
      return { success: true, path: outputPath };
    } catch (error) {
      console.error('Error creating boomerang with LUT:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

// Add handler to read video file as buffer
ipcMain.handle('read-video-file', async (event, filePath: string) => {
  try {
    const fs = require('fs').promises;
    const buffer = await fs.readFile(filePath);
    return { success: true, data: buffer };
  } catch (error) {
    console.error('Error reading video file:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

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
  if (isDebug) {
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
    fullscreen: false,
    kiosk: true,
    frame: false,
    resizable: true,
    webPreferences: {
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
