/**
 * Machine Service Integration Example
 * 
 * ตัวอย่างการใช้งาน MachineService ใน main.ts
 * 
 * Copy code นี้ไปใส่ใน main.ts เพื่อใช้งาน
 */

import { app, BrowserWindow } from 'electron';
import machineService from './machineService';

// Example: Initialize App with Theme

let mainWindow: BrowserWindow | null = null;


async function initializeApp() {
  try {
    console.log('🚀 Initializing app...');
    
    // 1. Verify machine
    const verifyResponse = await machineService.verify();
    console.log('✅ Machine verified:', verifyResponse.machine.machineName);
    
    // 2. Get theme
    const themeResponse = await machineService.getTheme();
    console.log('✅ Theme loaded:', themeResponse.theme.name);
    
    // 3. Send theme to renderer process
    if (mainWindow && themeResponse.theme.background) {
      mainWindow.webContents.send('theme-loaded', themeResponse.theme);
      console.log('✅ Theme sent to renderer');
    }
    
    // 4. Get frames (optional)
    const framesResponse = await machineService.getFrames();
    console.log(`✅ Frames loaded: ${framesResponse.frames.length} frames`);
    
    // 5. Get status (optional)
    const status = await machineService.getStatus();
    console.log('✅ Status loaded:', status.machine.status);
    console.log('📄 Paper level:', status.machine.paperLevel, '%');
    
    return {
      machine: verifyResponse.machine,
      theme: themeResponse.theme,
      frames: framesResponse.frames,
      status: status.machine,
    };
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    // ยังคงสร้าง window แม้ API จะล้มเหลว
    throw error;
  }
}

// ==================== Example: Use in app.whenReady() ====================

/*
app.whenReady().then(async () => {
  // สร้าง window ก่อน
  mainWindow = await createWindow();
  
  // Initialize machine (เรียก API)
  try {
    await initializeApp();
  } catch (error) {
    console.error('Machine initialization failed, but app will continue:', error);
  }
  
  app.on('activate', () => {
    if (mainWindow === null) createWindow();
  });
});
*/

// ==================== Example: Call API on Window Ready ====================

/*
mainWindow.on('ready-to-show', async () => {
  if (!mainWindow) return;
  
  // เรียก API theme เมื่อ window พร้อม
  try {
    const themeResponse = await machineService.getTheme();
    
    if (themeResponse.theme.background) {
      // ส่ง theme ไปให้ renderer
      mainWindow.webContents.send('theme-loaded', themeResponse.theme);
    }
  } catch (error) {
    console.error('Failed to load theme:', error);
  }
});
*/

// ==================== Example: IPC Handler for Theme ====================

/*
import { ipcMain } from 'electron';

// Handler สำหรับ renderer process เรียกขอ theme
ipcMain.handle('get-theme', async () => {
  try {
    const themeResponse = await machineService.getTheme();
    return {
      success: true,
      theme: themeResponse.theme,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Handler สำหรับ renderer process เรียกขอ frames
ipcMain.handle('get-frames', async () => {
  try {
    const framesResponse = await machineService.getFrames();
    return {
      success: true,
      frames: framesResponse.frames,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Handler สำหรับ renderer process เรียกขอ status
ipcMain.handle('get-machine-status', async () => {
  try {
    const status = await machineService.getStatus();
    return {
      success: true,
      status: status.machine,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
*/

// ==================== Example: Periodic Status Check ====================

/*
// ตรวจสอบ status ทุก 5 นาที
setInterval(async () => {
  try {
    const status = await machineService.getStatus();
    console.log('📊 Machine status:', status.machine.status);
    console.log('📄 Paper level:', status.machine.paperLevel, '%');
    
    // แจ้งเตือนถ้า paper level ต่ำ
    if (status.machine.paperLevel && status.machine.paperLevel < 20) {
      console.warn('⚠️ Low paper level!');
      // ส่ง notification หรือ alert
    }
  } catch (error) {
    console.error('Failed to check status:', error);
  }
}, 5 * 60 * 1000); // 5 minutes
*/

// ==================== Example: Coupon Handler ====================

/*
ipcMain.handle('check-coupon', async (event, code: string) => {
  try {
    const result = await machineService.checkCoupon(code);
    return {
      success: true,
      valid: result.valid,
      coupon: result.coupon,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('use-coupon', async (event, code: string, transactionId?: string) => {
  try {
    const result = await machineService.useCoupon(code, transactionId);
    return {
      success: result.success,
      coupon: result.coupon,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
*/

// ==================== Example: Update Paper Level ====================

/*
ipcMain.handle('update-paper-level', async (event, paperLevel: number) => {
  try {
    const result = await machineService.updatePaperLevel(paperLevel);
    return {
      success: result.success,
      paperLevel: result.machine.paperLevel,
      message: result.message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
*/

export { initializeApp };

