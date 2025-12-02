/**
 * Machine Service Usage Examples
 * 
 * ตัวอย่างการใช้งาน MachineService สำหรับเรียก Machine Local API
 */

import machineService, { MachineService } from './machineService';

// ==================== Example 1: Basic Usage (Default Instance) ====================

async function example1_BasicUsage() {
  try {
    // เรียก API theme
    const themeResponse = await machineService.getTheme();
    console.log('Theme:', themeResponse.theme.name);
    console.log('Background:', themeResponse.theme.background);
    console.log('BackgroundSecond:', themeResponse.theme.backgroundSecond);
    
    // เรียก API verify
    const verifyResponse = await machineService.verify();
    console.log('Machine:', verifyResponse.machine.machineName);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ==================== Example 2: Custom Configuration ====================

async function example2_CustomConfig() {
  // สร้าง instance ใหม่พร้อม custom config
  const customService = new MachineService({
    apiBaseUrl: 'http://localhost:3000', // สำหรับ localhost testing
    machinePort: 33333,
    machineId: '6926008fb7f0df1d5093503b', // สำหรับ localhost testing
    timeout: 5000, // 5 seconds
  });

  try {
    const theme = await customService.getTheme();
    console.log('Theme:', theme);
  } catch (error) {
    console.error('Error:', error);
  }
}

// ==================== Example 3: Get Theme and Apply Background ====================

async function example3_GetThemeAndApply() {
  try {
    const themeResponse = await machineService.getTheme();
    const { theme } = themeResponse;
    
    if (theme.background) {
      // ใช้ background URL ในการตั้งค่า UI
      console.log('Setting background:', theme.background);
      // ตัวอย่าง: ส่งไปให้ renderer process
      // mainWindow.webContents.send('theme-loaded', theme);
    }
    
    if (theme.primaryColor) {
      console.log('Primary color:', theme.primaryColor);
    }
    
    if (theme.fontColor) {
      console.log('Font color:', theme.fontColor);
    }
  } catch (error) {
    console.error('Failed to load theme:', error);
  }
}

// ==================== Example 4: Get Frames ====================

async function example4_GetFrames() {
  try {
    const framesResponse = await machineService.getFrames();
    console.log(`Found ${framesResponse.frames.length} frames`);
    
    framesResponse.frames.forEach((frame) => {
      console.log(`- ${frame.name} (${frame.code})`);
      if (frame.imageUrl) {
        console.log(`  Image: ${frame.imageUrl}`);
      }
    });
  } catch (error) {
    console.error('Failed to load frames:', error);
  }
}

// ==================== Example 5: Coupon Check and Use ====================

async function example5_CouponFlow() {
  const couponCode = 'NEWYEAR001';
  
  try {
    // Step 1: ตรวจสอบ coupon
    const checkResponse = await machineService.checkCoupon(couponCode);
    
    if (!checkResponse.valid) {
      console.log('Coupon is invalid:', checkResponse.message);
      return;
    }
    
    console.log('Coupon is valid!');
    console.log('Discount:', checkResponse.coupon?.value, checkResponse.coupon?.discountType);
    
    // Step 2: ใช้ coupon
    const transactionId = 'TXN-' + Date.now();
    const useResponse = await machineService.useCoupon(couponCode, transactionId);
    
    if (useResponse.success) {
      console.log('Coupon used successfully!');
    } else {
      console.log('Failed to use coupon:', useResponse.message);
    }
  } catch (error) {
    console.error('Coupon flow error:', error);
  }
}

// ==================== Example 6: Get Machine Status ====================

async function example6_GetStatus() {
  try {
    const status = await machineService.getStatus();
    
    console.log('Machine Status:');
    console.log('- Name:', status.machine.machineName);
    console.log('- Status:', status.machine.status);
    console.log('- Paper Level:', status.machine.paperLevel, '%');
    console.log('- Software Version:', status.machine.softwareVersion);
    console.log('- Camera Countdown:', status.machine.cameraCountdown, 'seconds');
    console.log('- Frames Count:', status.framesCount);
    
    if (status.theme) {
      console.log('- Theme:', status.theme.name);
    }
  } catch (error) {
    console.error('Failed to get status:', error);
  }
}

// ==================== Example 7: Update Paper Level ====================

async function example7_UpdatePaperLevel() {
  try {
    const newPaperLevel = 85;
    const response = await machineService.updatePaperLevel(newPaperLevel);
    
    if (response.success) {
      console.log('Paper level updated to:', response.machine.paperLevel, '%');
    }
  } catch (error) {
    console.error('Failed to update paper level:', error);
  }
}

// ==================== Example 8: Initialize App with Theme ====================

async function example8_InitializeApp() {
  try {
    // 1. Verify machine
    const verifyResponse = await machineService.verify();
    console.log('Machine verified:', verifyResponse.machine.machineName);
    
    // 2. Get theme
    const themeResponse = await machineService.getTheme();
    console.log('Theme loaded:', themeResponse.theme.name);
    
    // 3. Get frames
    const framesResponse = await machineService.getFrames();
    console.log('Frames loaded:', framesResponse.frames.length);
    
    // 4. Get status
    const status = await machineService.getStatus();
    console.log('Machine status:', status.machine.status);
    console.log('Paper level:', status.machine.paperLevel, '%');
    
    // Return all data for app initialization
    return {
      machine: verifyResponse.machine,
      theme: themeResponse.theme,
      frames: framesResponse.frames,
      status: status.machine,
    };
  } catch (error) {
    console.error('Failed to initialize app:', error);
    throw error;
  }
}

// ==================== Example 9: Error Handling ====================

async function example9_ErrorHandling() {
  try {
    const theme = await machineService.getTheme();
    console.log('Theme:', theme);
  } catch (error) {
    if (error instanceof Error) {
      // Handle specific errors
      if (error.message.includes('404')) {
        console.error('Machine not found. Please check IP and port configuration.');
      } else if (error.message.includes('timeout')) {
        console.error('Request timeout. Please check network connection.');
      } else {
        console.error('API Error:', error.message);
      }
    } else {
      console.error('Unknown error:', error);
    }
  }
}

// ==================== Example 10: Using in Main Process ====================

/**
 * ตัวอย่างการใช้งานใน main.ts
 * 
 * import machineService from './services/machineService';
 * 
 * app.whenReady().then(async () => {
 *   try {
 *     // เรียก API theme ตอนเริ่ม app
 *     const themeResponse = await machineService.getTheme();
 *     
 *     // ส่ง theme ไปให้ renderer process
 *     if (mainWindow && themeResponse.theme.background) {
 *       mainWindow.webContents.send('theme-loaded', themeResponse.theme);
 *     }
 *     
 *     createWindow();
 *   } catch (error) {
 *     console.error('Failed to initialize machine:', error);
 *     createWindow(); // ยังคงสร้าง window แม้ API จะล้มเหลว
 *   }
 * });
 */

export {
  example1_BasicUsage,
  example2_CustomConfig,
  example3_GetThemeAndApply,
  example4_GetFrames,
  example5_CouponFlow,
  example6_GetStatus,
  example7_UpdatePaperLevel,
  example8_InitializeApp,
  example9_ErrorHandling,
};

