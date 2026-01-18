/**
 * Print Test Position Service
 *
 * บริการสำหรับจัดการ configuration ของ print test position
 * เก็บ horizontal และ vertical ไว้ในไฟล์ JSON
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface PrintTestPosition {
  landscapeHorizontal: number;
  landscapeVertical: number;
  portraitHorizontal: number;
  portraitVertical: number;
}

// Default values
export const DEFAULT_PRINT_TEST_POSITION: PrintTestPosition = {
  landscapeHorizontal: 0,
  landscapeVertical: 0,
  portraitHorizontal: 0,
  portraitVertical: 0,
};

const CONFIG_FILE_NAME = 'print-test-position.json';

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
export async function getPrintTestPosition(): Promise<PrintTestPosition> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: PrintTestPosition = JSON.parse(configContent);

    // Validate config
    if (
      typeof config.landscapeHorizontal !== 'number' ||
      typeof config.landscapeVertical !== 'number' ||
      typeof config.portraitHorizontal !== 'number' ||
      typeof config.portraitVertical !== 'number'
    ) {
      console.warn(
        '⚠️ [printTestPositionService] Invalid config format, using defaults',
      );
      return DEFAULT_PRINT_TEST_POSITION;
    }

    console.log('✅ [printTestPositionService] Config loaded:', config);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ยังไม่มี (ครั้งแรกที่เปิด app)
      console.log(
        'ℹ️ [printTestPositionService] Config file not found, using defaults',
      );
      return DEFAULT_PRINT_TEST_POSITION;
    }
    console.error(
      '❌ [printTestPositionService] Failed to read config:',
      error,
    );
    return DEFAULT_PRINT_TEST_POSITION;
  }
}

/**
 * บันทึก config ลงไฟล์
 */
export async function savePrintTestPosition(
  config: PrintTestPosition,
): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    const configContent = JSON.stringify(config, null, 2);

    // สร้าง directory ถ้ายังไม่มี
    const userDataPath = app.getPath('userData');
    await fs.mkdir(userDataPath, { recursive: true });

    // บันทึกไฟล์
    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log('✅ [printTestPositionService] Config saved:', config);
    return true;
  } catch (error) {
    console.error(
      '❌ [printTestPositionService] Failed to save config:',
      error,
    );
    return false;
  }
}

