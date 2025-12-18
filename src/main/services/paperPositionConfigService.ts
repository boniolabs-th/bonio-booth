/**
 * Paper Position Config Service
 *
 * บริการสำหรับจัดการ configuration ของ paper position
 * เก็บ landscapeWidth, landscapeHeight, portraitWidth, portraitHeight ไว้ในไฟล์ JSON
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface PaperPositionConfig {
  landscapeWidth: number;
  landscapeHeight: number;
  portraitWidth: number;
  portraitHeight: number;
}

// Default values
export const DEFAULT_PAPER_POSITION_CONFIG: PaperPositionConfig = {
  landscapeWidth: 14,
  landscapeHeight: 16,
  portraitWidth: 5,
  portraitHeight: 5,
};

const CONFIG_FILE_NAME = 'paper-position-config.json';

/**
 * ดึง path ของไฟล์ config
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

/**
 * อ่าน config จากไฟล์
 */
export async function getPaperPositionConfig(): Promise<PaperPositionConfig> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: PaperPositionConfig = JSON.parse(configContent);

    // Validate config
    if (
      typeof config.landscapeWidth !== 'number' ||
      typeof config.landscapeHeight !== 'number' ||
      typeof config.portraitWidth !== 'number' ||
      typeof config.portraitHeight !== 'number'
    ) {
      console.warn('⚠️ [paperPositionConfigService] Invalid config format, using defaults');
      return DEFAULT_PAPER_POSITION_CONFIG;
    }

    console.log('✅ [paperPositionConfigService] Config loaded:', config);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ยังไม่มี (ครั้งแรกที่เปิด app)
      console.log('ℹ️ [paperPositionConfigService] Config file not found, using defaults');
      return DEFAULT_PAPER_POSITION_CONFIG;
    }
    console.error('❌ [paperPositionConfigService] Failed to read config:', error);
    return DEFAULT_PAPER_POSITION_CONFIG;
  }
}

/**
 * บันทึก config ลงไฟล์
 */
export async function savePaperPositionConfig(
  config: PaperPositionConfig,
): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    const configContent = JSON.stringify(config, null, 2);

    // สร้าง directory ถ้ายังไม่มี
    const userDataPath = app.getPath('userData');
    await fs.mkdir(userDataPath, { recursive: true });

    // บันทึกไฟล์
    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log('✅ [paperPositionConfigService] Config saved:', config);
    return true;
  } catch (error) {
    console.error('❌ [paperPositionConfigService] Failed to save config:', error);
    return false;
  }
}

/**
 * ลบ config file (ใช้สำหรับ reset)
 */
export async function deletePaperPositionConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.unlink(configPath);
    console.log('✅ [paperPositionConfigService] Config deleted');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ไม่มีอยู่แล้ว
      console.log('ℹ️ [paperPositionConfigService] Config file not found (already deleted)');
      return true;
    }
    console.error('❌ [paperPositionConfigService] Failed to delete config:', error);
    return false;
  }
}

