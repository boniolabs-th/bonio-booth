import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

// ==================== Type Definitions ====================


// ใช้ environment variables ที่ webpack inject มา
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEnv = (): any => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env;
  }
  // Fallback สำหรับกรณีที่ process.env ไม่มี
  return {};
};

const env = getEnv();
console.log('🔧 [MachineService] gett Environment config:', env);
// const apiBaseUrl = env.API_BASE_URL  || 'http://localhost:3000';
const apiBaseUrl = env.API_BASE_URL  || 'https://api-booth.boniolabs.com';
const machinePort = env.PORT || '99999';
const machineId = env.MACHINE_ID || '693296af25719d62f695db5d';

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
}

export interface UploadFilesResponse {
  success: boolean;
  message: string;
  photoSession: PhotoSession;
  files: UploadFile[];
  qrcodeStorageUrl?: string; // URL สำหรับ QR code ที่เก็บไว้ใน storage
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
    // อ่าน API URL จาก environment variable หรือ options หรือ default
    // this.apiBaseUrl =  'https://api-booth.boniolabs.com';
    this.apiBaseUrl = apiBaseUrl;
    this.machinePort = options.machinePort || Number(machinePort) || 99999;
    this.machineId = options.machineId || machineId || '';
    this.timeout = options.timeout || Number(env.API_TIMEOUT) || 10000;

    console.log('🔧 [MachineService] Configuration:', {
      apiBaseUrl: this.apiBaseUrl,
      machinePort: this.machinePort,
      machineId: this.machineId || 'not set',
      timeout: this.timeout,
    });
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
        if (this.machineId) {
          url.searchParams.append('machineId', this.machineId);
        }
        if (this.machinePort) {
          url.searchParams.append('port', String(this.machinePort));
        }

        const options = {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
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
    console.log('🚀 [MachineService] Initializing app...');
    try {
      const response = await this.makeRequest<InitResponse>(
        '/api/machines-public/init',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log('✅ [MachineService] App initialized:', {
        machine: response.machine.machineName,
        theme: response.theme.name,
        frames: response.frames.length,
      });
      return response;
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
    console.log('🔍 [MachineService] Verifying machine...');
    try {
      const response = await this.makeRequest<VerifyResponse>(
        '/api/machines-public/verify',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log(
        '✅ [MachineService] Machine verified:',
        response.machine.machineName,
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
    console.log('🎨 [MachineService] Fetching theme...');
    try {
      const response = await this.makeRequest<ThemeResponse>(
        '/api/machines-public/theme',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log(
        '✅ [MachineService] Theme loaded:',
        JSON.stringify(response, null, 2),
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
    console.log('🖼️ [MachineService] Fetching frames...');
    try {
      const response = await this.makeRequest<FramesResponse>(
        '/api/machines-public/frames',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log(
        `✅ [MachineService] Frames loaded: ${response.frames.length} frames`,
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
    console.log('🎫 [MachineService] Checking coupon:', code);
    try {
      const response = await this.makeRequest<CouponCheckResponse>(
        '/api/machines-public/coupon/check',
        'POST',
        { code },
        machineId ? { machineId } : undefined,
      );
      console.log(
        response.valid
          ? `✅ [MachineService] Coupon valid: ${code}`
          : `⚠️ [MachineService] Coupon invalid: ${code}`,
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
    console.log('🎫 [MachineService] Using coupon:', code);
    try {
      const response = await this.makeRequest<CouponUseResponse>(
        '/api/machines-public/coupon/use',
        'POST',
        { code, ...(transactionId && { transactionId }) },
        machineId ? { machineId } : undefined,
      );
      console.log(
        response.success
          ? `✅ [MachineService] Coupon used: ${code}`
          : `⚠️ [MachineService] Coupon use failed: ${code}`,
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
    console.log('📊 [MachineService] Fetching machine status...');
    try {
      const response = await this.makeRequest<StatusResponse>(
        '/api/machines-public/status',
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log(
        '✅ [MachineService] Status loaded:',
        response.machine.machineName,
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
    console.log('📄 [MachineService] Updating paper level:', paperLevel);
    try {
      const response = await this.makeRequest<PaperLevelResponse>(
        '/api/machines-public/paper-level',
        'POST',
        { paperLevel },
        machineId ? { machineId } : undefined,
      );
      console.log('✅ [MachineService] Paper level updated:', paperLevel);
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
    console.log('💳 [MachineService] Creating payment:', {
      amount,
      numberPhoto,
      channel,
      couponCodeId: couponCodeId || 'none',
    });
    try {
      const requestBody: PaymentCreateRequest = {
        amount,
        numberPhoto,
        channel,
        ...(couponCodeId && { couponCodeId }),
      };

      console.log('💳 [MachineService] Request body:', JSON.stringify(requestBody, null, 2));

      const response = await this.makeRequest<PaymentCreateResponse>(
        '/api/machines-public/payment/create',
        'POST',
        requestBody,
        machineId ? { machineId } : undefined,
      );

      console.log('💳 [MachineService] Payment create response:', JSON.stringify(response, null, 2));
      console.log('💳 [MachineService] Payment response fields:', {
        success: response.success,
        qr_code: response.qr_code ? 'present' :  null,
        reference_id: response.reference_id,
        order_id: response.order_id,
        transactionId: response.transactionId,
        paymentDetailsId: response.paymentDetailsId,
        numberPhoto: response.numberPhoto,
        discountAmount: response.discountAmount,
        totalAmount: response.totalAmount,
        netAmount: response.netAmount,
        couponCodeId: response.couponCodeId,
        message: response.message,
        error: response.error,
      });

      console.log(
        response.success
          ? `✅ [MachineService] Payment created: ${response.reference_id || response.order_id || response.transactionId || 'unknown'}`
          : `⚠️ [MachineService] Payment creation failed: ${response.error || response.message || 'Unknown error'}`,
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
    console.log('🔍 [MachineService] Checking payment status:', mchOrderNo);
    try {
      const response = await this.makeRequest<PaymentStatusResponse>(
        `/api/machines-public/payment/status/${mchOrderNo}`,
        'GET',
        undefined,
        machineId ? { machineId } : undefined,
      );
      console.log(
        response.success
          ? `✅ [MachineService] Payment status: ${response.status}`
          : `⚠️ [MachineService] Failed to check payment status`,
      );
      return response;
    } catch (error) {
      console.error('❌ [MachineService] Check payment status failed:', error);
      throw error;
    }
  }

  /**
   * 10. POST /api/machines-public/upload-files
   * Upload รูปภาพและวิดีโอ (ใช้ form-data)
   */
  async uploadFiles(
    transactionCode: string,
    photos: string[], // Array of base64 data URLs
    videos: string[] = [], // Array of base64 data URLs
    transactionId?: string, // transactionId จาก payment/create response
    machineId?: string,
  ): Promise<UploadFilesResponse> {
    console.log('📤 [MachineService] Uploading files (form-data):', {
      transactionCode,
      transactionId,
      photoCount: photos.length,
      videoCount: videos.length,
    });

    try {
      // Create multipart form data
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const formData: Buffer[] = [];

      // Add transactionCode
      console.log('📤 [MachineService] Adding form field: transactionCode =', transactionCode);
      formData.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="transactionCode"\r\n\r\n${transactionCode}\r\n`,
        ),
      );

      // Add transactionId (จาก payment/create response)
      if (transactionId) {
        console.log('📤 [MachineService] Adding form field: transactionId =', transactionId);
        console.log('📤 [MachineService] transactionId type:', typeof transactionId);
        console.log('📤 [MachineService] transactionId length:', transactionId.length);
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

      // Add photos
      console.log('📤 [MachineService] Processing photos for upload:', {
        photosCount: photos.length,
      });

      let photosAddedCount = 0; // นับจำนวน photos ที่เพิ่มสำเร็จ
      const photoFilenames: string[] = []; // เก็บชื่อไฟล์รูปภาพ

      for (let i = 0; i < photos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(photos[i]);
          const photoSizeMB = buffer.length / (1024 * 1024);

          console.log(`📤 [MachineService] Photo ${i + 1}:`, {
            filename,
            mimeType,
            sizeMB: photoSizeMB.toFixed(2),
            bufferLength: buffer.length,
          });

          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));

          photosAddedCount++;
          photoFilenames.push(filename);
          console.log(`✅ [MachineService] Photo ${i + 1} added to form data`);
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
        console.log(`✅ [MachineService] Successfully added ${photosAddedCount} of ${photos.length} photos to form data`);
      }

      // Add videos
      console.log('📤 [MachineService] Processing videos for upload:', {
        videosCount: videos.length,
      });

      let videosAddedCount = 0; // นับจำนวน videos ที่เพิ่มสำเร็จ
      const videoFilenames: string[] = []; // เก็บชื่อไฟล์วิดีโอ

      for (let i = 0; i < videos.length; i++) {
        try {
          const { buffer, filename, mimeType } = dataUrlToBuffer(videos[i]);
          const videoSizeMB = buffer.length / (1024 * 1024);

          console.log(`📤 [MachineService] Video ${i + 1}:`, {
            filename,
            mimeType,
            sizeMB: videoSizeMB.toFixed(2),
            bufferLength: buffer.length,
          });

          formData.push(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="videos"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
            ),
          );
          formData.push(buffer);
          formData.push(Buffer.from('\r\n'));

          videosAddedCount++;
          videoFilenames.push(filename);
          console.log(`✅ [MachineService] Video ${i + 1} added to form data`);
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
        console.log(`✅ [MachineService] Successfully added ${videosAddedCount} of ${videos.length} videos to form data`);
      }

      // Close boundary
      formData.push(Buffer.from(`--${boundary}--\r\n`));

      const formBuffer = Buffer.concat(formData);

      // Log form data fields ที่จะส่งไป
      console.log('📤 [MachineService] ========== FORM DATA BODY ==========');
      console.log('📤 [MachineService] Form data fields:', {
        transactionCode: transactionCode,
        transactionId: transactionId || 'NOT PROVIDED',
        transactionIdType: typeof transactionId,
        transactionIdLength: transactionId?.length || 0,
        photosCount: photos.length,
        videosCount: videos.length,
        formBufferSize: formBuffer.length,
        boundary: boundary,
      });

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

      console.log('📤 [MachineService] Files found in form data:', {
        photosCount: photosInForm,
        videosCount: videosInForm,
        photoFilenames: photoFilenames.length > 0 ? photoFilenames : 'none',
        videoFilenames: videoFilenames.length > 0 ? videoFilenames : 'none',
      });

      console.log('📤 [MachineService] Extracted form fields:');
      if (transactionCodeMatch) {
        console.log('📤 [MachineService]   transactionCode:', transactionCodeMatch[1]);
      }
      if (transactionIdMatch) {
        console.log('📤 [MachineService]   transactionId:', transactionIdMatch[1]);
        console.log('📤 [MachineService]   transactionId (raw):', JSON.stringify(transactionIdMatch[1]));
        console.log('📤 [MachineService]   transactionId (hex):', Buffer.from(transactionIdMatch[1]).toString('hex'));
      } else {
        console.warn('⚠️ [MachineService]   transactionId: NOT FOUND IN FORM DATA');
      }

      console.log('📤 [MachineService] Files in form data:', {
        photosInForm,
        videosInForm,
        expectedPhotos: photos.length,
        expectedVideos: videos.length,
        photosMatch: photosInForm === photos.length,
        videosMatch: videosInForm === videos.length,
      });

      if (videosInForm === 0 && videos.length > 0) {
        console.error('❌ [MachineService] Videos were NOT added to form data!');
        console.error('❌ [MachineService] Expected videos:', videos.length);
      }

      // Log first part of form data structure
      const formDataPreview = bufferStr.substring(0, Math.min(2000, bufferStr.length));
      console.log('📤 [MachineService] Form data structure preview (first 2000 chars):');
      console.log(formDataPreview);
      console.log('📤 [MachineService] ============================================');

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
          console.log('📤 [MachineService] Making HTTP request:', {
            method: options.method,
            url: url.toString(),
            hostname: options.hostname,
            port: options.port,
            path: options.path,
            contentLength: formBuffer.length,
          });

          const req = protocol.request(options, (res) => {
            let data = '';

            console.log('📤 [MachineService] Response received:', {
              statusCode: res.statusCode,
              headers: res.headers,
            });

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                console.log('📤 [MachineService] Response data length:', data.length);
                if (
                  res.statusCode &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300
                ) {
                  const jsonData = data ? JSON.parse(data) : {};
                  console.log(
                    `✅ [MachineService] Files uploaded successfully: ${jsonData.files?.length || 0} files`,
                  );
                  console.log('✅ [MachineService] Full response:', JSON.stringify(jsonData, null, 2));
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

          console.log('📤 [MachineService] Upload timeout settings:', {
            fileSizeMB: fileSizeMB.toFixed(2),
            calculatedTimeout: `${(calculatedTimeout / 1000).toFixed(0)}s`,
            uploadTimeout: `${(uploadTimeout / 1000).toFixed(0)}s`,
          });

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

          console.log('📤 [MachineService] Writing form buffer to request...');
          console.log('📤 [MachineService] Total size:', `${(formBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
          console.log('📤 [MachineService] Chunk size:', `${(chunkSize / (1024 * 1024)).toFixed(2)} MB`);

          const writeChunk = () => {
            if (bytesWritten >= formBuffer.length) {
              req.end();
              console.log('✅ [MachineService] All data sent successfully');
              return;
            }

            const chunk = formBuffer.slice(bytesWritten, bytesWritten + chunkSize);
            const canContinue = req.write(chunk);

            bytesWritten += chunk.length;
            currentChunk += 1;

            const progress = ((bytesWritten / formBuffer.length) * 100).toFixed(1);
            if (currentChunk % 5 === 0 || bytesWritten === formBuffer.length) {
              console.log(`📤 [MachineService] Upload progress: ${progress}% (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB / ${(formBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
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
          console.log('📤 [MachineService] Request sent (chunked)');
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    } catch (error) {
      console.error('❌ [MachineService] Upload files failed:', error);
      throw error;
    }
  }
}

// ==================== Default Instance ====================

export default new MachineService();
