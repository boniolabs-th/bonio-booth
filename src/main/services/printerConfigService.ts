/**
 * Printer Config Service
 *
 * บริการสำหรับจัดการ printer configuration
 * เก็บ printer name ที่เลือกไว้ในไฟล์ JSON ใน userData directory
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface PrinterConfig {
  printerName: string;
  displayName: string;
  canCut: boolean; // เครื่องปริ้นตัดกระดาษได้หรือไม่
}

const CONFIG_FILE_NAME = 'printer-config.json';

/**
 * ดึง path ของไฟล์ config
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

/**
 * อ่าน printer config จากไฟล์
 */
export async function getPrinterConfig(): Promise<PrinterConfig | null> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: PrinterConfig = JSON.parse(configContent);

    // Validate config
    if (!config.printerName) {
      console.warn('⚠️ [printerConfigService] Invalid config format');
      return null;
    }

    console.log('✅ [printerConfigService] Config loaded:', config);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ยังไม่มี (ครั้งแรกที่เปิด app)
      console.log('ℹ️ [printerConfigService] Config file not found (first run)');
      return null;
    }
    console.error('❌ [printerConfigService] Failed to read config:', error);
    return null;
  }
}

/**
 * บันทึก printer config ลงไฟล์
 */
export async function savePrinterConfig(config: PrinterConfig): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    const configContent = JSON.stringify(config, null, 2);

    // สร้าง directory ถ้ายังไม่มี
    const userDataPath = app.getPath('userData');
    await fs.mkdir(userDataPath, { recursive: true });

    // บันทึกไฟล์
    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log('✅ [printerConfigService] Config saved:', config);
    return true;
  } catch (error) {
    console.error('❌ [printerConfigService] Failed to save config:', error);
    return false;
  }
}

/**
 * ตรวจสอบว่ามี printer config อยู่แล้วหรือไม่
 */
export async function hasPrinterConfig(): Promise<boolean> {
  const config = await getPrinterConfig();
  return config !== null;
}

/**
 * ลบ printer config file
 */
export async function deletePrinterConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.unlink(configPath);
    console.log('✅ [printerConfigService] Config deleted');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('ℹ️ [printerConfigService] Config file not found (already deleted)');
      return true;
    }
    console.error('❌ [printerConfigService] Failed to delete config:', error);
    return false;
  }
}
