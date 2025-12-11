/**
 * Environment Configuration
 *
 * ไฟล์นี้ใช้สำหรับจัดการ environment variables
 * สามารถตั้งค่าได้ผ่าน:
 * 1. .env file (ใน root directory)
 * 2. Environment variables (ตอนรัน app)
 * 3. Default values (ถ้าไม่มี)
 */

export interface EnvConfig {
  API_BASE_URL: string;
  PORT: string;
  MACHINE_ID: string;
  MACHINE_CAN_CUT: boolean;
  API_TIMEOUT: number;
}

/**
 * ดึง environment variables พร้อม default values
 */
export function getEnvConfig(): EnvConfig {
  return {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000',
    // API_BASE_URL: process.env.API_BASE_URL || 'https://api-booth.boniolabs.com',
    // PORT: process.env.PORT || '99999',
    PORT: process.env.PORT || '44444',
    // MACHINE_ID: process.env.MACHINE_ID || '693296af25719d62f695db5d',
    MACHINE_ID: process.env.MACHINE_ID || '69247c9602dd728488995e3c',
    MACHINE_CAN_CUT: process.env.MACHINE_CAN_CUT !== 'false',
    API_TIMEOUT: Number(process.env.API_TIMEOUT) || 10000,
  };
}

/**
 * Log environment configuration (สำหรับ debug)
 */
export function logEnvConfig(): void {
  const config = getEnvConfig();
  console.log('🔧 [EnvConfig] Environment Configuration:');
  console.log('  API_BASE_URL:', config.API_BASE_URL);
  console.log('  PORT:', config.PORT);
  console.log('  MACHINE_ID:', config.MACHINE_ID || '(not set)');
  console.log('  MACHINE_CAN_CUT:', config.MACHINE_CAN_CUT);
  console.log('  API_TIMEOUT:', config.API_TIMEOUT);
}

