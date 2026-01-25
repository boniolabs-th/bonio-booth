import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { getEnvConfig, DEFAULT_MACHINE_ID, DEFAULT_PORT, DEFAULT_API_TIMEOUT } from '../config/env.config';

// ==================== Type Definitions ====================

// ตัวแปรสำหรับเก็บ config (จะถูกโหลดเมื่อสร้าง instance)
let cachedEnvConfig: Awaited<ReturnType<typeof getEnvConfig>> | null = null;

// ฟังก์ชันสำหรับโหลด env config (ใช้ async)
async function loadEnvConfig() {
  if (!cachedEnvConfig) {
    cachedEnvConfig = await getEnvConfig();
  }
  return cachedEnvConfig;
}

// Export สำหรับ backward compatibility (ใช้ default values จาก env.config.ts)
export const apiBaseUrl = '';
export const machineId = DEFAULT_MACHINE_ID;

export interface MachineInfo {
  id: string;
  machineName: string;
  serialNumber?: string;
  localIpAddress?: string;
  localPort?: number;
  status: string;
}

export interface VerifyResponse {
  success: boolean;
  message: string;
  machine: MachineInfo;
  requestInfo: {
    clientIp: string;
    clientPort: number;
    origin: string;
  };
}

export interface Theme {
  _id: string;
  name: string;
  code: string;
  logo?: string;
  background?: string;
  backgroundSecond?: string;
  primaryColor?: string;
  fontColor?: string;
  frames?: string[];
  isActive: boolean;
}

export interface ThemeResponse {
  machineId: string;
  machineName: string;
  theme: Theme;
}

export interface Frame {
  _id: string;
  name: string;
  code: string;
  imageUrl?: string;
  imageSize?: string;
  grid?: {
    rows: number;
    columns: number;
    slots: unknown[];
  };
  isActive: boolean;
}

export interface FramesResponse {
  machineId: string;
  machineName: string;
  frames: Frame[];
}

export interface Coupon {
  _id: string;
  name: string;
  discountType: 'percent' | 'fixed';
  value: number;
  expiryDate?: string;
}

export interface CouponCode {
  _id: string;
  code: string;
  type: 'single_use' | 'multi_use';
  maxUsage?: number;
}

export interface CouponCheckRequest {
  code: string;
}

export interface CouponCheckResponse {
  valid: boolean;
  message: string;
  couponCodeId?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  coupon?: Coupon;
  couponCode?: CouponCode;
}

export interface CouponUseRequest {
  code: string;
  transactionId?: string;
}

export interface CouponUseResponse {
  success: boolean;
  message: string;
  coupon?: Coupon;
  couponCode?: CouponCode;
}

export interface MachineStatus {
  _id: string;
  machineName: string;
  serialNumber?: string;
  status: string;
  paperLevel?: number;
  softwareVersion?: number;
  cameraCountdown?: number;
  setTimer?: string;
  timerSchedule?: unknown;
  isMaintenanceMode?: boolean;
  lastUpdate?: string;
}

export interface StatusResponse {
  machine: MachineStatus;
  theme?: {
    _id: string;
    name: string;
    code: string;
  };
  framesCount?: number;
}

export interface PaperLevelRequest {
  paperLevel: number;
}

export interface PaperLevelResponse {
  success: boolean;
  message: string;
  machine: {
    _id: string;
    machineName: string;
    paperLevel: number;
  };
}

export interface PaymentCreateRequest {
  amount: number;
  numberPhoto: number;
  channel: string;
  couponCodeId?: string;
}

export interface PaymentCreateResponse {
  success: boolean;
  qr_code?: string;
  reference_id?: string;
  order_id?: string;
  transactionId?: string;
  paymentDetailsId?: string;
  numberPhoto?: number;
  discountAmount?: number;
  totalAmount?: number;
  netAmount?: number;
  couponCodeId?: string;
  message?: string;
  error?: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  status?: string;
  amount?: number;
  reference_id?: string;
  transactionStatus?: string;
  error?: string;
}

export interface UploadFile {
  type: 'photo' | 'video';
  url: string;
  order: number;
}

export interface PhotoSession {
  id: string;
  transactionId: string;
  formatId?: string;
  numPhotosSelected: number;
  status?: 'pending' | 'uploading' | 'success' | 'failed'; // Status ของ session
}

export interface CreatePhotoSessionRequest {
  transactionId: string; // Required
  transactionCode?: string; // Optional
}

export interface CreatePhotoSessionResponse {
  success: boolean;
  message: string;
  photoSession: PhotoSession;
  qrcodeStorageUrl: string; // URL สำหรับ QR code (ได้ทันที)
  error?: string;
}

export interface UploadFilesResponse {
  success: boolean;
  message: string;
  photoSession: PhotoSession;
  files: UploadFile[];
  qrcodeStorageUrl?: string; // URL สำหรับ QR code ที่เก็บไว้ใน storage (deprecated: ใช้จาก createPhotoSession แทน)
  error?: string;
}

export interface Price {
  quantity: number;
  price: number;
}

export interface InitMachine {
  _id: string;
  machineName: string;
  serialNumber?: string;
  status: string;
  paperLevel?: number;
  softwareVersion?: number;
  cameraCountdown?: number;
  setTimer?: string;
  timerSchedule?: unknown;
  isMaintenanceMode?: boolean;
  prices?: Price[];
  lineUrl?: string;
}

export interface InitTheme {
  _id: string;
  name: string;
  code: string;
  logo?: string;
  background?: string;
  primaryColor?: string;
  fontColor?: string;
  frames?: string[];
  isActive: boolean;
}

export interface InitFrame {
  _id: string;
  name: string;
  code: string;
  imageUrl?: string;
  imageSize?: string;
  grid?: {
    rows: number;
    columns: number;
    slots: unknown[];
  };
  isActive: boolean;
}

export interface InitResponse {
  machine: InitMachine;
  theme: InitTheme;
  frames: InitFrame[];
  paperPosition?: PaperPosition;
  isShutdownReady?: boolean;
  isClosedAppReady?: boolean;
}

export interface PaperPosition {
  _id: string;
  scale: number;
  horizontal: number;
  vertical: number;
}

export interface MachineServiceOptions {
  apiBaseUrl?: string;
  machinePort?: number;
  machineId?: string;
  timeout?: number;
}

// ==================== Service Class ====================

export class MachineService {
  private apiBaseUrl: string;
  private machinePort: number;
  private machineId?: string;
  private timeout: number;

  constructor(options: MachineServiceOptions = {}) {
    // ใช้ค่า default จาก env.config.ts (จะถูกอัปเดตเมื่อเรียก loadEnvConfig)
    this.apiBaseUrl = options.apiBaseUrl ? options.apiBaseUrl : '';
    this.machinePort = options.machinePort ? options.machinePort : Number(DEFAULT_PORT);
    this.machineId = options.machineId ? options.machineId : DEFAULT_MACHINE_ID;
    this.timeout = options.timeout ? options.timeout : DEFAULT_API_TIMEOUT;

    // โหลด config จาก env.config.ts (async แต่ไม่ต้องรอ)
    loadEnvConfig().then((config) => {
      if (!options.apiBaseUrl) {
        this.apiBaseUrl = config.API_BASE_URL;
      }
      if (!options.machinePort) {
        this.machinePort = Number(config.PORT);
      }
      if (!options.machineId) {
        this.machineId = config.MACHINE_ID;
      }
      if (!options.timeout) {
        this.timeout = config.API_TIMEOUT;
      }
    }).catch((error) => {
      console.error('❌ [MachineService] Failed to load env config:', error);
    });
  }

  /**
   * อัปเดต config ของ service (ใช้เมื่อมีการเปลี่ยน config จาก persistent storage)
   */
  updateConfig(options: { machineId?: string; machinePort?: number }): void {
    if (options.machineId !== undefined) {
      this.machineId = options.machineId;
      console.log('✅ [MachineService] Updated machineId:', this.machineId);
    }
    if (options.machinePort !== undefined) {
      this.machinePort = options.machinePort;
      console.log('✅ [MachineService] Updated machinePort:', this.machinePort);
    }
  }

  /**
   * Make HTTP/HTTPS request
   */
  private async makeRequest<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
    queryParams?: Record<string, string | number>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        // Build URL with query parameters
        const url = new URL(path, this.apiBaseUrl);

        // Add query parameters
        if (queryParams) {
          Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              url.searchParams.append(key, String(value));
            }
          });
        }

        // Add machine identification for localhost testing
        // เพิ่ม machineId และ port ถ้ายังไม่มีใน queryParams (เพื่อไม่ให้ซ้ำ)
        if (this.machineId && !url.searchParams.has('machineId')) {
          url.searchParams.append('machineId', this.machineId);
        }
        if (this.machinePort && !url.searchParams.has('port')) {
          url.searchParams.append('port', String(this.machinePort));
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Machine-Port': String(this.machinePort),
          'X-Client-Type': 'booth', // Priority Queue: บอก backend ว่าเป็น request จากหน้าตู้
        };

        // เพิ่ม X-Machine-Id header ถ้ามี machineId
        if (this.machineId && this.machineId.trim()) {
          headers['X-Machine-Id'] = this.machineId;
        }

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
        };

        // Debug log
        console.log('🔍 [MachineService] Request:', {
          url: url.toString(),
          machineId: this.machineId,
          machinePort: this.machinePort,
          headers: headers,
        });

        const protocol = url.protocol === 'https:' ? https : http;
        const req = protocol.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (
                res.statusCode &&
                res.statusCode >= 200 &&
                res.statusCode < 300
              ) {
                const jsonData = data ? JSON.parse(data) : {};
                resolve(jsonData as T);
              } else {
                let errorMessage = `HTTP ${res.statusCode}`;
                try {
                  const errorData = JSON.parse(data);
                  errorMessage =
                    errorData.message || errorData.error || errorMessage;
                } catch {
                  errorMessage = data || errorMessage;
                }
                reject(new Error(errorMessage));
              }
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.setTimeout(this.timeout, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        // Send body for POST requests
        if (method === 'POST' && body) {
          req.write(JSON.stringify(body));
        }

        req.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * 0. GET /api/machines-public/init
   * ดึงข้อมูลทั้งหมดสำหรับ initialize app (machine, theme, frames)
   */
  async init(machineId?: string): Promise<InitResponse> {
    try {
      // ใช้ machineId จาก parameter หรือจาก this.machineId
      const finalMachineId = machineId || this.machineId;
      console.log('🔍 [MachineService] Init called:', {
        paramMachineId: machineId,
        thisMachineId: this.machineId,
        finalMachineId,
        thisMachinePort: this.machinePort,
      });

      const response = await this.makeRequest<InitResponse>(
        '/api/machines-public/init',
        'GET',
        undefined,
        finalMachineId ? { machineId: finalMachineId } : undefined,
      );

      // Access paperPosition with type assertion to handle optional property
      const paperPosition = (response as any).paperPosition || response.paperPosition;
      const isShutdownReady = (response as any).isShutdownReady || response.isShutdownReady;
      const isClosedAppReady = (response as any).isClosedAppReady || response.isClosedAppReady;
      console.log('🔍 [MachineService] Init response:', {
        isShutdownReady,
        isShutdownReadyType: typeof isShutdownReady,
        isShutdownReadyValue: isShutdownReady,
        isClosedAppReady,
        isClosedAppReadyType: typeof isClosedAppReady,
        isClosedAppReadyValue: isClosedAppReady,
      });
      console.log('⚠️ [MachineService] ⚠️⚠️⚠️ IMPORTANT: handleShutdownReady() MUST be called after this! ⚠️⚠️⚠️');
      return { ...response, isShutdownReady, isClosedAppReady };
    } catch (error) {
      console.error('❌ [MachineService] Init failed:', error);
      throw error;
    }
  }

  /**
   * 1. GET /api/machines-public/verify
   * ตรวจสอบว่า machine สามารถเข้าถึง API ได้หรือไม่1
   */
  async verify(machineId?: string): Promise<VerifyResponse> {
    try {
      const response = await this.makeRequest<VerifyResponse>(
        '/api/machines-public/verify',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Verify failed:', error);
      throw error;
    }
  }

  /**xxxzvvvvss
   * 2. GET /api/machines-public/theme
   * ดึง theme ที่ตู้ถูก assign ปัจจุบัน
   */
  async getTheme(machineId?: string): Promise<ThemeResponse> {
    try {
      const response = await this.makeRequest<ThemeResponse>(
        '/api/machines-public/theme',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Get theme failed:', error);
      throw error;
    }
  }

  /**
   * 3. GET /api/machines-public/frames
   * ดึง frames ที่ใช้ได้สำหรับ machine นี้
   */
  async getFrames(machineId?: string): Promise<FramesResponse> {
    try {
      const response = await this.makeRequest<FramesResponse>(
        '/api/machines-public/frames',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Get frames failed:', error);
      throw error;
    }
  }

  /**
   * 4. POST /api/machines-public/coupon/check
   * ตรวจสอบว่า coupon code ใช้ได้หรือไม่
   */
  async checkCoupon(
    code: string,
    machineId?: string,
  ): Promise<CouponCheckResponse> {
    try {
      const response = await this.makeRequest<CouponCheckResponse>(
        '/api/machines-public/coupon/check',
        'POST',
        { code },
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Check coupon failed:', error);
      throw error;
    }
  }

  /**
   * 5. POST /api/machines-public/coupon/use
   * ใช้/redeem coupon code
   */
  async useCoupon(
    code: string,
    transactionId?: string,
    machineId?: string,
  ): Promise<CouponUseResponse> {
    try {
      const response = await this.makeRequest<CouponUseResponse>(
        '/api/machines-public/coupon/use',
        'POST',
        { code, ...(transactionId && { transactionId }) },
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Use coupon failed:', error);
      throw error;
    }
  }

  /**
   * 6. GET /api/machines-public/status
   * ดึง config machine ทั้งหมด
   */
  async getStatus(machineId?: string): Promise<StatusResponse> {
    try {
      const response = await this.makeRequest<StatusResponse>(
        '/api/machines-public/status',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Get status failed:', error);
      throw error;
    }
  }

  /**
   * 7. POST /api/machines-public/paper-level
   * อัพเดท paper level ของ machine
   */
  async updatePaperLevel(
    paperLevel: number,
    machineId?: string,
  ): Promise<PaperLevelResponse> {
    try {
      const response = await this.makeRequest<PaperLevelResponse>(
        '/api/machines-public/paper-level',
        'POST',
        { paperLevel },
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Update paper level failed:', error);
      throw error;
    }
  }

  /**
   * 8. POST /api/machines-public/payment/create
   * สร้าง payment และรับ QR code สำหรับชำระเงิน
   */
  async createPayment(
    amount: number,
    numberPhoto: number,
    channel: string = 'promptpay',
    couponCodeId?: string,
    machineId?: string,
  ): Promise<PaymentCreateResponse> {
    try {
      const requestBody: PaymentCreateRequest = {
        amount,
        numberPhoto,
        channel,
        ...(couponCodeId && { couponCodeId }),
      };

      const response = await this.makeRequest<PaymentCreateResponse>(
        '/api/machines-public/payment/create',
        'POST',
        requestBody,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Create payment failed:', error);
      throw error;
    }
  }

  /**
   * 9. GET /api/machines-public/payment/status/{mchOrderNo}
   * ตรวจสอบสถานะการชำระเงิน
   */
  async checkPaymentStatus(
    mchOrderNo: string,
    machineId?: string,
  ): Promise<PaymentStatusResponse> {
    try {
      const response = await this.makeRequest<PaymentStatusResponse>(
        `/api/machines-public/payment/status/${mchOrderNo}`,
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Check payment status failed:', error);
      throw error;
    }
  }

  /**
   * 10. POST /api/machines-public/photo-session/create
   * สร้าง photo session และรับ QR code URL ทันที (ไม่ต้องรอ upload)
   */
  async createPhotoSession(
    transactionId: string,
    transactionCode?: string,
    machineId?: string,
  ): Promise<CreatePhotoSessionResponse> {
    try {
      const requestBody: CreatePhotoSessionRequest = {
        transactionId,
        ...(transactionCode && { transactionCode }),
      };

      const response = await this.makeRequest<CreatePhotoSessionResponse>(
        '/api/machines-public/photo-session/create',
        'POST',
        requestBody,
        machineId ? { machineId } : undefined,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Create photo session failed:', error);
      throw error;
    }
  }

  /**
   * 11. POST /api/machines-public/photo-session/{sessionId}/upload
   * Upload รูปภาพและวิดีโอไปยัง session ที่สร้างไว้แล้ว (ใช้ form-data)
   */
  async uploadFilesToSession(
    sessionId: string,
    photos: string[], // Array of base64 data URLs
    videos: string[] = [], // Array of base64 data URLs
    machineId?: string,
  ): Promise<UploadFilesResponse> {
    // ใช้ logic เดียวกับ uploadFiles แต่เปลี่ยน endpoint และไม่ต้องส่ง transactionCode/transactionId
    // เพราะใช้ sessionId แทน
    try {
      // Create multipart form data
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const formData: Buffer[] = [];

      // Helper function to convert base64 data URL to buffer
      const dataUrlToBuffer = (
        dataUrl: string,
      ): { buffer: Buffer; filename: string; mimeType: string } => {
        if (!dataUrl.startsWith('data:')) {
          throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
        }

        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Determine file extension from mime type
        let extension = 'bin';
        if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) {
          extension = 'jpg';
        } else if (mimeType.includes('image/png')) {
          extension = 'png';
        } else if (mimeType.includes('image/gif')) {
          extension = 'gif';
        } else if (mimeType.includes('video/mp4')) {
          extension = 'mp4';
        } else if (mimeType.includes('video/webm')) {
          extension = 'webm';
        }

        const filename = `file.${extension}`;

        return { buffer, filename, mimeType };
      };

      // Add photos
      for (let i = 0; i < photos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(photos[i]);
          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));
        } catch (error) {
          console.error(`❌ [MachineService] Failed to process photo ${i + 1}:`, error);
        }
      }

      // Add videos
      for (let i = 0; i < videos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(videos[i]);
          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="videos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));
        } catch (error) {
          console.error(`❌ [MachineService] Failed to process video ${i + 1}:`, error);
        }
      }

      // Close boundary
      formData.push(Buffer.from(`--${boundary}--\r\n`));

      const formBuffer = Buffer.concat(formData);

      // Make request
      return new Promise((resolve, reject) => {
        try {
          const url = new URL(
            `/api/machines-public/photo-session/${sessionId}/upload`,
            this.apiBaseUrl,
          );

          // Add query parameters
          if (machineId) {
            url.searchParams.append('machineId', machineId);
          }
          if (this.machinePort) {
            url.searchParams.append('port', String(this.machinePort));
          }

          const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': formBuffer.length.toString(),
              'X-Machine-Port': String(this.machinePort),
              ...(this.machineId && { 'X-Machine-Id': this.machineId }),
            },
          };

          const protocol = url.protocol === 'https:' ? https : http;

          const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                if (
                  res.statusCode &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300
                ) {
                  const jsonData = data ? JSON.parse(data) : {};
                  resolve(jsonData as UploadFilesResponse);
                } else {
                  let errorMessage = `HTTP ${res.statusCode}`;
                  try {
                    const errorData = JSON.parse(data);
                    errorMessage =
                      errorData.message || errorData.error || errorMessage;
                  } catch {
                    errorMessage = data || errorMessage;
                  }
                  console.error('❌ [MachineService] Upload to session failed:', errorMessage);
                  reject(new Error(errorMessage));
                }
              } catch (parseError) {
                console.error('❌ [MachineService] Parse error:', parseError, 'Data:', data);
                reject(new Error(`Failed to parse response: ${data}`));
              }
            });
          });

          req.on('error', (error) => {
            console.error('❌ [MachineService] Request error:', error);
            reject(error);
          });

          // Timeout สำหรับ upload ไฟล์ใหญ่
          const fileSizeMB = formBuffer.length / (1024 * 1024);
          const calculatedTimeout = Math.max(60000, fileSizeMB * 10000);
          const uploadTimeout = Math.min(calculatedTimeout, 300000); // สูงสุด 5 นาที

          req.setTimeout(uploadTimeout, () => {
            console.error(`❌ [MachineService] Upload timeout after ${uploadTimeout / 1000}s`);
            req.destroy();
            reject(new Error(`Upload timeout after ${uploadTimeout / 1000} seconds`));
          });

          // Write form buffer in chunks
          const chunkSize = 1024 * 1024; // 1MB per chunk
          let bytesWritten = 0;

          const writeChunk = () => {
            if (bytesWritten >= formBuffer.length) {
              req.end();
              return;
            }

            const chunk = formBuffer.slice(bytesWritten, bytesWritten + chunkSize);
            const canContinue = req.write(chunk);
            bytesWritten += chunk.length;

            if (!canContinue) {
              req.once('drain', writeChunk);
            } else {
              setImmediate(writeChunk);
            }
          };

          writeChunk();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      console.error('❌ [MachineService] Upload files to session failed:', error);
      throw error;
    }
  }

  /**
   * 12. POST /api/machines-public/upload-files (Legacy - สำหรับ backward compatibility)
   * Upload รูปภาพและวิดีโอ (ใช้ form-data)
   */
  async uploadFiles(
    transactionCode: string,
    photos: string[], // Array of base64 data URLs
    videos: string[] = [], // Array of base64 data URLs
    transactionId?: string, // transactionId จาก payment/create response
    machineId?: string,
  ): Promise<UploadFilesResponse> {

    try {
      // Create multipart form data
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const formData: Buffer[] = [];

      // Add transactionCode

      // Add transactionId (จาก payment/create response)
      if (transactionId) {
        formData.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="transactionId"\r\n\r\n${transactionId}\r\n`,
          ),
        );
      } else {
        console.warn('⚠️ [MachineService] transactionId is missing!');
      }

      // Helper function to convert base64 data URL to buffer
      const dataUrlToBuffer = (
        dataUrl: string,
      ): { buffer: Buffer; filename: string; mimeType: string } => {
        if (!dataUrl.startsWith('data:')) {
          throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
        }

        const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Determine file extension from mime type
        let extension = 'bin';
        if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) {
          extension = 'jpg';
        } else if (mimeType.includes('image/png')) {
          extension = 'png';
        } else if (mimeType.includes('image/gif')) {
          extension = 'gif';
        } else if (mimeType.includes('video/mp4')) {
          extension = 'mp4';
        } else if (mimeType.includes('video/webm')) {
          extension = 'webm';
        }

        const filename = `file.${extension}`;

        return { buffer, filename, mimeType };
      };

      let photosAddedCount = 0; // นับจำนวน photos ที่เพิ่มสำเร็จ
      const photoFilenames: string[] = []; // เก็บชื่อไฟล์รูปภาพ

      for (let i = 0; i < photos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(photos[i]);
          const photoSizeMB = buffer.length / (1024 * 1024);

          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));

          photosAddedCount++;
          photoFilenames.push(filename);
        } catch (error) {
          console.error(`❌ [MachineService] Failed to process photo ${i + 1}:`, error);
          // Continue with other photos
        }
      }

      if (photos.length === 0) {
        console.warn('⚠️ [MachineService] No photos to upload');
      } else if (photosAddedCount === 0) {
        console.error('❌ [MachineService] Failed to add any photos to form data!');
      } else {
        // console.log(`✅ [MachineService] Successfully added ${photosAddedCount} of ${photos.length} photos to form data`);
      }

      let videosAddedCount = 0; // นับจำนวน videos ที่เพิ่มสำเร็จ
      const videoFilenames: string[] = []; // เก็บชื่อไฟล์วิดีโอ

      for (let i = 0; i < videos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(videos[i]);
          const videoSizeMB = buffer.length / (1024 * 1024);

          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="videos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));

          videosAddedCount++;
          videoFilenames.push(filename);
        } catch (error) {
          console.error(`❌ [MachineService] Failed to process video ${i + 1}:`, error);
          // Continue with other videos
        }
      }

      if (videos.length === 0) {
        console.warn('⚠️ [MachineService] No videos to upload');
      } else if (videosAddedCount === 0) {
        console.error('❌ [MachineService] Failed to add any videos to form data!');
      } else {
        // console.log(`✅ [MachineService] Successfully added ${videosAddedCount} of ${videos.length} videos to form data`);
      }

      // Close boundary
      formData.push(Buffer.from(`--${boundary}--\r\n`));

      const formBuffer = Buffer.concat(formData);

      // Log form data structure (text fields only)
      // แสดงส่วนที่เป็น text fields (ไม่รวม binary data)
      // ใช้วิธีนับจากตัวแปรที่เก็บไว้แทนการอ่านจาก buffer เพราะ buffer อาจจะใหญ่เกินไป
      const bufferStr = formBuffer.toString('utf8', 0, Math.min(10000, formBuffer.length));

      // Extract text fields from form data
      const transactionCodeMatch = bufferStr.match(/name="transactionCode"[^\r\n]*\r\n\r\n([^\r\n]+)/);
      const transactionIdMatch = bufferStr.match(/name="transactionId"[^\r\n]*\r\n\r\n([^\r\n]+)/);

      // ใช้จำนวนที่นับไว้แล้วจาก formData array แทนการอ่านจาก buffer
      // เพราะ buffer อาจจะใหญ่เกินไปและ videos อาจจะไม่อยู่ในส่วนแรก
      const photosInForm = photosAddedCount;
      const videosInForm = videosAddedCount;
      if (transactionCodeMatch) {
        // console.log('📤 [MachineService]   transactionCode:', transactionCodeMatch[1]);
      }
      if (transactionIdMatch) {
        // console.log('📤 [MachineService]   transactionId:', transactionIdMatch[1]);
        // console.log('📤 [MachineService]   transactionId (raw):', JSON.stringify(transactionIdMatch[1]));
        // console.log('📤 [MachineService]   transactionId (hex):', Buffer.from(transactionIdMatch[1]).toString('hex'));
      } else {
        console.warn('⚠️ [MachineService]   transactionId: NOT FOUND IN FORM DATA');
      }

      if (videosInForm === 0 && videos.length > 0) {
        console.error('❌ [MachineService] Videos were NOT added to form data!');
        console.error('❌ [MachineService] Expected videos:', videos.length);
      }

      // Log first part of form data structure
      const formDataPreview = bufferStr.substring(0, Math.min(2000, bufferStr.length));

      // Make request
      return new Promise((resolve, reject) => {
        try {
          const url = new URL('/api/machines-public/upload-files', this.apiBaseUrl);

          // Add query parameters
          if (machineId) {
            url.searchParams.append('machineId', machineId);
          }
          if (this.machinePort) {
            url.searchParams.append('port', String(this.machinePort));
          }

          const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': formBuffer.length.toString(),
              'X-Machine-Port': String(this.machinePort),
              ...(this.machineId && { 'X-Machine-Id': this.machineId }),
            },
          };

          const protocol = url.protocol === 'https:' ? https : http;

          const req = protocol.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                if (
                  res.statusCode &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300
                ) {
                  const jsonData = data ? JSON.parse(data) : {};
                  resolve(jsonData as UploadFilesResponse);
                } else {
                  let errorMessage = `HTTP ${res.statusCode}`;
                  try {
                    const errorData = JSON.parse(data);
                    errorMessage =
                      errorData.message || errorData.error || errorMessage;
                  } catch {
                    errorMessage = data || errorMessage;
                  }
                  console.error('❌ [MachineService] Upload failed:', errorMessage);
                  reject(new Error(errorMessage));
                }
              } catch (parseError) {
                console.error('❌ [MachineService] Parse error:', parseError, 'Data:', data);
                reject(new Error(`Failed to parse response: ${data}`));
              }
            });
          });

          req.on('error', (error) => {
            console.error('❌ [MachineService] Request error:', error);
            reject(error);
          });

          // เพิ่ม timeout สำหรับ upload ไฟล์ใหญ่ (120 วินาที หรือ 2 นาที)
          // คำนวณตามขนาดไฟล์: 1MB = 10 วินาที, ขั้นต่ำ 60 วินาที
          const fileSizeMB = formBuffer.length / (1024 * 1024);
          const calculatedTimeout = Math.max(60000, fileSizeMB * 10000); // ขั้นต่ำ 60 วินาที
          const uploadTimeout = Math.min(calculatedTimeout, 300000); // สูงสุด 5 นาที

          req.setTimeout(uploadTimeout, () => {
            // Longer timeout for file uploads
            console.error(`❌ [MachineService] Upload timeout after ${uploadTimeout / 1000}s`);
            req.destroy();
            reject(new Error(`Upload timeout after ${uploadTimeout / 1000} seconds`));
          });

          // Write form buffer in chunks เพื่อแสดง progress และป้องกัน memory issues
          const chunkSize = 1024 * 1024; // 1MB per chunk
          let bytesWritten = 0;
          let currentChunk = 0;

          const writeChunk = () => {
            if (bytesWritten >= formBuffer.length) {
              req.end();
              return;
            }

            const chunk = formBuffer.slice(bytesWritten, bytesWritten + chunkSize);
            const canContinue = req.write(chunk);

            bytesWritten += chunk.length;
            currentChunk += 1;

            const progress = ((bytesWritten / formBuffer.length) * 100).toFixed(1);
            if (currentChunk % 5 === 0 || bytesWritten === formBuffer.length) {
              // console.log(`📤 [MachineService] Upload progress: ${progress}% (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB / ${(formBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
            }

            if (!canContinue) {
              // Buffer is full, wait for drain event
              req.once('drain', writeChunk);
            } else {
              // Continue writing
              setImmediate(writeChunk);
            }
          };

          // Start writing chunks
          writeChunk();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      console.error('❌ [MachineService] Upload files failed:', error);
      throw error;
    }
  }

  /**
   * ส่งแจ้งเตือนเมื่อไม่พบ device (camera หรือ printer) ที่เคยตั้งค่าไว้
   * @param deviceType - ประเภท device ('camera' หรือ 'printer')
   * @param deviceName - ชื่อ device ที่เคยตั้งค่าไว้
   * @param availableDevices - รายการ device ที่พบในระบบ (optional)
   * @param machineId - Machine ID (optional)
   */
  async sendDeviceAlert(
    deviceType: 'camera' | 'printer',
    deviceName: string,
    availableDevices?: string[],
    machineId?: string,
  ): Promise<{ success: boolean; message: string; notificationSent: boolean }> {
    console.log('sendDeviceAlert', {deviceType,deviceName,availableDevices,machineId});

    try {
      const response = await this.makeRequest<{
        success: boolean;
        message: string;
        notificationSent: boolean;
      }>(
        '/api/machines-public/device-alert',
        'POST',
        {
          deviceType,
          deviceName,
          availableDevices,
        },
        machineId ? { machineId } : undefined,
      );

      console.log(`✅ [MachineService] Device alert sent: ${deviceType} "${deviceName}" not found`);
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Send device alert failed:', error);
      // Don't throw - just log and return failure
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        notificationSent: false,
      };
    }
  }
}

// ==================== Default Instance ====================

export default new MachineService();
