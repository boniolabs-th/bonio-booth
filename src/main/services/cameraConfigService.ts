/**
 * Camera Config Service
 *
 * บริการสำหรับจัดการ camera configuration
 * เก็บ deviceId ของกล้องที่เลือกไว้ในไฟล์ JSON ใน userData directory
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface CameraConfig {
  deviceId: string;
  label: string;
}

const CONFIG_FILE_NAME = 'camera-config.json';

/**
 * ดึง path ของไฟล์ config
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

/**
 * อ่าน camera config จากไฟล์
 */
export async function getCameraConfig(): Promise<CameraConfig | null> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: CameraConfig = JSON.parse(configContent);

    // Validate config
    if (!config.deviceId) {
      console.warn('⚠️ [cameraConfigService] Invalid config format');
      return null;
    }

    console.log('✅ [cameraConfigService] Config loaded:', config);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ยังไม่มี (ครั้งแรกที่เปิด app)
      console.log('ℹ️ [cameraConfigService] Config file not found (first run)');
      return null;
    }
    console.error('❌ [cameraConfigService] Failed to read config:', error);
    return null;
  }
}

/**
 * บันทึก camera config ลงไฟล์
 */
export async function saveCameraConfig(config: CameraConfig): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    const configContent = JSON.stringify(config, null, 2);

    // สร้าง directory ถ้ายังไม่มี
    const userDataPath = app.getPath('userData');
    await fs.mkdir(userDataPath, { recursive: true });

    // บันทึกไฟล์
    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log('✅ [cameraConfigService] Config saved:', config);
    return true;
  } catch (error) {
    console.error('❌ [cameraConfigService] Failed to save config:', error);
    return false;
  }
}

/**
 * ตรวจสอบว่ามี camera config อยู่แล้วหรือไม่
 */
export async function hasCameraConfig(): Promise<boolean> {
  const config = await getCameraConfig();
  return config !== null;
}

/**
 * ลบ camera config file
 */
export async function deleteCameraConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.unlink(configPath);
    console.log('✅ [cameraConfigService] Config deleted');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('ℹ️ [cameraConfigService] Config file not found (already deleted)');
      return true;
    }
    console.error('❌ [cameraConfigService] Failed to delete config:', error);
    return false;
  }
}
