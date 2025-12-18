/**
 * Printer Config Service
 *
 * บริการสำหรับจัดการ printer configuration
 * เก็บ printer name ที่เลือกไว้ในไฟล์ JSON ใน userData directory
 * รองรับ Main และ Secondary printer
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

// ขนาดกระดาษที่รองรับ
export type PaperSize = '4x6' | '5x7' | '6x8';

export interface SinglePrinterConfig {
  printerName: string;
  displayName: string;
  paperSize: PaperSize; // ขนาดกระดาษ
  canCut: boolean; // เครื่องปริ้นตัดกระดาษได้หรือไม่
}

export interface PrinterConfig {
  // Main Printer - เครื่องหลัก
  main: SinglePrinterConfig;
  // Secondary Printer - เครื่องรอง สำหรับ frame 2x6 ที่ต้องตัด (optional)
  secondary?: SinglePrinterConfig;
}

// Legacy interface สำหรับ backward compatibility
export interface LegacyPrinterConfig {
  printerName: string;
  displayName: string;
  canCut: boolean;
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
 * ตรวจสอบว่าเป็น config รูปแบบใหม่หรือไม่
 */
function isNewConfigFormat(config: any): config is PrinterConfig {
  return config && typeof config.main === 'object' && config.main.printerName;
}

/**
 * แปลง legacy config เป็น config ใหม่
 */
function migrateLegacyConfig(legacy: LegacyPrinterConfig): PrinterConfig {
  return {
    main: {
      printerName: legacy.printerName,
      displayName: legacy.displayName,
      paperSize: '4x6', // default
      canCut: legacy.canCut,
    },
    secondary: undefined,
  };
}

/**
 * อ่าน printer config จากไฟล์
 */
export async function getPrinterConfig(): Promise<PrinterConfig | null> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const rawConfig = JSON.parse(configContent);

    // ตรวจสอบว่าเป็น config รูปแบบใหม่หรือเก่า
    if (isNewConfigFormat(rawConfig)) {
      console.log('✅ [printerConfigService] New config loaded:', rawConfig);
      return rawConfig;
    }

    // Legacy format - migrate
    if (rawConfig.printerName) {
      console.log('⚠️ [printerConfigService] Migrating legacy config...');
      const newConfig = migrateLegacyConfig(rawConfig as LegacyPrinterConfig);
      // Save migrated config
      await savePrinterConfig(newConfig);
      return newConfig;
    }

    console.warn('⚠️ [printerConfigService] Invalid config format');
    return null;
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

/**
 * ดึง printer ที่จะใช้ตาม frame type
 * - ถ้า frame เป็น 2x6 และมี secondary ที่ canCut=true → ใช้ secondary
 * - นอกนั้นใช้ main
 */
export function getActivePrinter(config: PrinterConfig, is2x6Frame: boolean = false): SinglePrinterConfig {
  // ถ้าเป็น frame 2x6 และมี secondary ที่ตัดกระดาษได้ → ใช้ secondary
  if (is2x6Frame && config.secondary && config.secondary.canCut) {
    console.log('🖨️ [printerConfigService] Using secondary printer for 2x6 frame (canCut=true)');
    return config.secondary;
  }
  return config.main;
}
