import https from 'https';
import http from 'http';
import { URL } from 'url';

// ==================== Type Definitions ====================

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
}

export interface PaymentCreateResponse {
  success: boolean;
  qr_code?: string;
  reference_id?: string;
  order_id?: string;
  transactionId?: string;
  paymentDetailsId?: string;
  numberPhoto?: number;
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
    // this.apiBaseUrl = 'https://api-booth.boniolabs.com';
    this.apiBaseUrl = 'http://localhost:3000';
    this.machinePort = options.machinePort || Number(process.env.PORT) || 33333;
    this.machineId = options.machineId || process.env.MACHINE_ID;
    this.timeout = options.timeout || 10000;
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
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                const jsonData = data ? JSON.parse(data) : {};
                resolve(jsonData as T);
              } else {
                let errorMessage = `HTTP ${res.statusCode}`;
                try {
                  const errorData = JSON.parse(data);
                  errorMessage = errorData.message || errorData.error || errorMessage;
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
      console.log('✅ [MachineService] Machine verified:', response.machine.machineName);
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
      console.log('✅ [MachineService] Theme loaded:', JSON.stringify(response, null, 2));
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
      console.log(`✅ [MachineService] Frames loaded: ${response.frames.length} frames`);
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
      console.log('✅ [MachineService] Status loaded:', response.machine.machineName);
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
    machineId?: string,
  ): Promise<PaymentCreateResponse> {
    console.log('💳 [MachineService] Creating payment:', { amount, numberPhoto, channel });
    try {
      const response = await this.makeRequest<PaymentCreateResponse>(
        '/api/machines-public/payment/create',
        'POST',
        { amount, numberPhoto, channel },
        machineId ? { machineId } : undefined,
      );
      console.log(
        response.success
          ? `✅ [MachineService] Payment created: ${response.reference_id}`
          : `⚠️ [MachineService] Payment creation failed`,
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
}

// ==================== Default Instance ====================

export default new MachineService();

