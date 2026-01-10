/**
 * Camera Config Service
 *
 * บริการสำหรับจัดการ camera configuration
 * เก็บ deviceId ของกล้องที่เลือกไว้ในไฟล์ JSON ใน userData directory
 * รองรับทั้ง Webcam (WebRTC) และ Canon DSLR/Mirrorless (EDSDK)
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export type CameraType = 'webcam' | 'canon';

export interface WebcamConfig {
  type: 'webcam';
  deviceId: string;
  label: string;
}

export interface CanonCameraConfig {
  type: 'canon';
  cameraIndex: number;
  cameraName: string;
  portName?: string;
  bodyId?: string;
}

export type CameraConfig = WebcamConfig | CanonCameraConfig;

// Legacy format for backward compatibility
export interface LegacyCameraConfig {
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
 * รองรับทั้ง format เก่า (deviceId/label) และ format ใหม่ (type-based)
 */
export async function getCameraConfig(): Promise<CameraConfig | null> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const rawConfig = JSON.parse(configContent);

    // Check if it's the new format (has 'type' field)
    if (rawConfig.type === 'webcam' || rawConfig.type === 'canon') {
      console.log('✅ [cameraConfigService] Config loaded (new format):', rawConfig);
      return rawConfig as CameraConfig;
    }

    // Legacy format migration - treat as webcam
    if (rawConfig.deviceId) {
      const migratedConfig: WebcamConfig = {
        type: 'webcam',
        deviceId: rawConfig.deviceId,
        label: rawConfig.label || 'Unknown Camera',
      };
      console.log('✅ [cameraConfigService] Config loaded (legacy, migrated to webcam):', migratedConfig);
      return migratedConfig;
    }

    console.warn('⚠️ [cameraConfigService] Invalid config format');
    return null;
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
