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
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import ksherService from './services/ksherService';

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
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.on('print-photo', async (event, imageDataUrl: string) => {
  try {
    if (!mainWindow) {
      event.reply('print-response', {
        success: false,
        error: 'Main window not found',
      });
      return;
    }

    // Create a new hidden window for printing
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Create HTML content with the image
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
          <img src="${imageDataUrl}" alt="Photo to print" />
        </body>
      </html>
    `;

    // Load the HTML content
    printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
    );

    // Wait for the content to load
    printWindow.webContents.once('did-finish-load', () => {
      // Get the default printer
      printWindow.webContents
        .getPrintersAsync()
        .then((printers) => {
          if (printers.length === 0) {
            event.reply('print-response', {
              success: false,
              error: 'No printers found',
            });
            printWindow.close();
            return;
          }

          // Use the default printer (first in the list)
          const defaultPrinter = printers[0];

          // Print without showing dialog
          printWindow.webContents.print(
            {
              silent: true, // Print without showing dialog
              printBackground: true,
              deviceName: defaultPrinter.name,
              pageSize: 'A4',
              margins: {
                marginType: 'default',
              },
            },
            (success, failureReason) => {
              if (success) {
                console.log('Print job sent successfully');
                event.reply('print-response', { success: true });
              } else {
                console.error('Print failed:', failureReason);
                event.reply('print-response', {
                  success: false,
                  error: failureReason,
                });
              }

              // Close the print window after printing
              setTimeout(() => {
                printWindow.close();
              }, 1000);
            },
          );
        })
        .catch((error) => {
          console.error('Error getting printers:', error);
          event.reply('print-response', {
            success: false,
            error: 'Failed to get printers',
          });
          printWindow.close();
        });
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
    console.log('Creating payment for amount:', amount, 'orderNo:', orderNo);
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
    console.log('Checking payment status for reference:', referenceId);
    const result = await ksherService.checkPaymentStatus(referenceId);
    return result;
  } catch (error) {
    console.error('Error in check-payment-status handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
    fullscreen: true,
    kiosk: true,
    frame: false,
    resizable: false,
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
