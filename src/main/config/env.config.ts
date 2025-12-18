/**
 * Environment Configuration
 *
 * ไฟล์นี้ใช้สำหรับจัดการ environment variables
 * สามารถตั้งค่าได้ผ่าน:
 * 1. Persistent config (machine-config.json) - ใช้ก่อน
 * 2. .env file (ใน root directory)
 * 3. Environment variables (ตอนรัน app)
 * 4. Default values (ถ้าไม่มี)
 */

import { getMachineConfig } from '../services/configService';

export interface EnvConfig {
  API_BASE_URL: string;
  PORT: string;
  MACHINE_ID: string;
  API_TIMEOUT: number;
}

// Default values (แก้ไขได้ที่เดียว)
export const DEFAULT_API_BASE_URL = 'https://api-booth.boniolabs.com';
export const DEFAULT_PORT = '44444';
export const DEFAULT_MACHINE_ID = '69247c9602dd728488995e3c';
export const DEFAULT_API_TIMEOUT = 10000;

// Cache สำหรับเก็บ config (เพื่อไม่ต้องอ่านไฟล์ทุกครั้ง)
let cachedConfig: EnvConfig | null = null;

/**
 * ดึง environment variables พร้อม default values
 * อ่านจาก persistent config ก่อน ถ้าไม่มีค่อยใช้ default
 */
export async function getEnvConfig(): Promise<EnvConfig> {
  // ถ้ามี cache แล้วให้ใช้ cache
  if (cachedConfig) {
    return cachedConfig;
  }

  // อ่านจาก persistent config ก่อน
  const machineConfig = await getMachineConfig();

  // กำหนดค่า API_BASE_URL (ลำดับความสำคัญ: process.env > default)
  // หมายเหตุ: API_BASE_URL ไม่เก็บใน persistent config เพราะเป็นค่าคงที่
  const apiBaseUrl = process.env.API_BASE_URL || DEFAULT_API_BASE_URL;

  // กำหนดค่า PORT (ลำดับความสำคัญ: machineConfig > process.env > default)
  let port = DEFAULT_PORT;
  if (machineConfig?.machinePort) {
    port = machineConfig.machinePort;
  } else if (process.env.PORT) {
    port = process.env.PORT;
  }

  // กำหนดค่า MACHINE_ID (ลำดับความสำคัญ: machineConfig > process.env > default)
  let machineId = DEFAULT_MACHINE_ID;
  if (machineConfig?.machineId) {
    machineId = machineConfig.machineId;
  } else if (process.env.MACHINE_ID) {
    machineId = process.env.MACHINE_ID;
  }

  // กำหนดค่า API_TIMEOUT (ลำดับความสำคัญ: process.env > default)
  let apiTimeout = DEFAULT_API_TIMEOUT;
  if (process.env.API_TIMEOUT) {
    const timeoutValue = Number(process.env.API_TIMEOUT);
    if (!Number.isNaN(timeoutValue)) {
      apiTimeout = timeoutValue;
    }
  }

  const config: EnvConfig = {
    API_BASE_URL: apiBaseUrl,
    PORT: port,
    MACHINE_ID: machineId,
    API_TIMEOUT: apiTimeout,
  };

  // เก็บไว้ใน cache
  cachedConfig = config;
  return config;
}

/**
 * Clear cache (ใช้เมื่อมีการอัปเดต config)
 */
export function clearEnvConfigCache(): void {
  cachedConfig = null;
}

/**
 * Log environment configuration (สำหรับ debug)
 */
export async function logEnvConfig(): Promise<void> {
  const config = await getEnvConfig();
  console.log('🔧 [env.config] Current config:', config);
}

