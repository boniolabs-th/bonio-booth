/**
 * Config Service
 *
 * บริการสำหรับจัดการ configuration ที่ persistent
 * เก็บ machineId และ port ไว้ในไฟล์ JSON ใน userData directory
 */
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export interface MachineConfig {
  machineId: string;
  machinePort: string;
}

const CONFIG_FILE_NAME = 'machine-config.json';

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
export async function getMachineConfig(): Promise<MachineConfig | null> {
  try {
    const configPath = getConfigPath();
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: MachineConfig = JSON.parse(configContent);

    // Validate config
    if (!config.machineId || !config.machinePort) {
      console.warn('⚠️ [configService] Invalid config format');
      return null;
    }

    console.log('✅ [configService] Config loaded:', config);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ยังไม่มี (ครั้งแรกที่เปิด app)
      console.log('ℹ️ [configService] Config file not found (first run)');
      return null;
    }
    console.error('❌ [configService] Failed to read config:', error);
    return null;
  }
}

/**
 * บันทึก config ลงไฟล์
 */
export async function saveMachineConfig(config: MachineConfig): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    const configContent = JSON.stringify(config, null, 2);

    // สร้าง directory ถ้ายังไม่มี
    const userDataPath = app.getPath('userData');
    await fs.mkdir(userDataPath, { recursive: true });

    // บันทึกไฟล์
    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log('✅ [configService] Config saved:', config);
    return true;
  } catch (error) {
    console.error('❌ [configService] Failed to save config:', error);
    return false;
  }
}

/**
 * ตรวจสอบว่ามี config อยู่แล้วหรือไม่
 */
export async function hasMachineConfig(): Promise<boolean> {
  const config = await getMachineConfig();
  return config !== null;
}

/**
 * ลบ config file (ใช้สำหรับทดสอบ)
 */
export async function deleteMachineConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.unlink(configPath);
    console.log('✅ [configService] Config deleted');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // ไฟล์ไม่มีอยู่แล้ว
      console.log('ℹ️ [configService] Config file not found (already deleted)');
      return true;
    }
    console.error('❌ [configService] Failed to delete config:', error);
    return false;
  }
}

/**
 * ดึง path ของไฟล์ config (สำหรับ debug)
 */
export function getConfigFilePath(): string {
  return getConfigPath();
}

