/**
 * Script สำหรับลบ machine config
 * ใช้สำหรับทดสอบการเริ่มเครื่องใหม่
 * 
 * วิธีใช้:
 * node scripts/clear-config.js
 */

const { app } = require('electron');
const fs = require('fs').promises;
const path = require('path');

// ต้องเรียก app.whenReady() ก่อนเพื่อให้ app.getPath() ทำงานได้
// แต่เนื่องจากเป็น script แยก ต้องใช้ path โดยตรง

async function clearConfig() {
  try {
    // สำหรับ development
    const userDataPath = process.env.APPDATA 
      ? path.join(process.env.APPDATA, 'bonio-booth') // Windows
      : process.env.HOME 
        ? path.join(process.env.HOME, 'Library', 'Application Support', 'bonio-booth') // Mac
        : path.join(process.env.HOME || '', '.config', 'bonio-booth'); // Linux
    
    const configPath = path.join(userDataPath, 'machine-config.json');
    
    console.log('📁 Looking for config file at:', configPath);
    
    try {
      await fs.unlink(configPath);
      console.log('✅ Config file deleted successfully!');
      console.log('🔄 Please restart the app to see the config modal again.');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ Config file not found (already deleted or never created)');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Alternative: Delete the file manually at:');
    console.log('   Windows: %APPDATA%\\bonio-booth\\machine-config.json');
    console.log('   Mac: ~/Library/Application Support/bonio-booth/machine-config.json');
    console.log('   Linux: ~/.config/bonio-booth/machine-config.json');
  }
}

clearConfig();

