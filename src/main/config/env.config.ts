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
  MACHINE_CAN_CUT: boolean;
  API_TIMEOUT: number;
}

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
  
  const config: EnvConfig = {
    // API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',
    API_BASE_URL: process.env.API_BASE_URL || 'https://api-booth.boniolabs.com',
    // PORT: process.env.PORT || '99999',
    PORT: machineConfig?.machinePort || process.env.PORT || '44444',
    // MACHINE_ID: process.env.MACHINE_ID || '693296af25719d62f695db5d',
    MACHINE_ID: machineConfig?.machineId || process.env.MACHINE_ID || '69247c9602dd728488995e3c',
    MACHINE_CAN_CUT: process.env.MACHINE_CAN_CUT !== 'false',
    API_TIMEOUT: Number(process.env.API_TIMEOUT) || 10000,
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

