import path from 'path';
import fs from 'fs';

interface PaymentResult {
  success: boolean;
  qr_code?: string;
  reference_id?: string;
  order_id?: string;
  error?: string;
}

interface PaymentStatus {
  success: boolean;
  status?: string;
  amount?: number;
  reference_id?: string;
  error?: string;
}

export class KsherService {
  private ksherPay: any = null;

  constructor() {
    this.initializeKSher();
  }

  async initializeKSher() {
    try {
      const ksherLib = require('@kshersolution/ksher');
      
      // Path to private key file
      let privateKeyPath = path.join(__dirname, '..', '..', '..', 'assets', 'ksher', 'Mch37500_PrivateKey.pem');
      
      // Alternative paths for different environments
      if (!fs.existsSync(privateKeyPath)) {
        // Try development path
        privateKeyPath = path.join(process.cwd(), 'assets', 'ksher', 'Mch37500_PrivateKey.pem');
      }
      
      if (!fs.existsSync(privateKeyPath)) {
        // Try release path
        privateKeyPath = path.join(process.resourcesPath, 'ksher', 'Mch37500_PrivateKey.pem');
      }
      
      if (!fs.existsSync(privateKeyPath)) {
        // Try another release path
        privateKeyPath = path.join(__dirname, '..', '..', '..', 'release', 'ksher', 'Mch37500_PrivateKey.pem');
      }

      console.log('Private key path:', privateKeyPath);
      
      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Private key file not found at: ${privateKeyPath}`);
      }

      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      
      // Initialize KSher in agent mode for PromptPay
      this.ksherPay = new ksherLib(
        'mch37500', // appId (Merchant ID)
        privateKey, // privateKey
      );
      
      console.log('KSher service initialized successfully in agent mode');
    } catch (error) {
      console.error('Failed to initialize KSher service:', error);
    }
  }

  async createPayment(amount: number, orderNo: string, channel = 'promptpay'): Promise<PaymentResult> {
    try {
      if (!this.ksherPay) {
        throw new Error('KSher service not initialized');
      }

      const paymentData = {
        mch_order_no: orderNo,
        total_fee: Math.round(1 * 100), // Convert to cents
        fee_type: 'THB',
        channel: channel,
        product: orderNo,
      };
      
      const response = await this.ksherPay.native_pay(paymentData);

      console.log('response create payment:', response);
      
      if (response && response.data) {
        return {
          success: true,
          qr_code: response.data.imgdat, // KSher returns base64 image data
          reference_id: response.data.mch_order_no,
          order_id: response.data.ksher_order_no,
        };
      } else {
        const errorMsg = response.data ? response.data.err_msg : 'Unknown error';
        throw new Error(`Payment creation failed: ${errorMsg}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async checkPaymentStatus(referenceId: string): Promise<PaymentStatus> {
    try {
      if (!this.ksherPay) {
        throw new Error('KSher service not initialized');
      }

      const response = await this.ksherPay.order_query({
        mch_order_no: referenceId,
      });

      console.log('Payment status response:', response);

      if (response.data) {
        return {
          success: true,
          status: response.data.result, // SUCCESS, PROCESSING, FAIL
          amount: response.data.total_fee,
          reference_id: response.data.mch_order_no,
        };
      } else {
        const errorMsg = response.data ? response.data.err_msg : 'Unknown error';
        return {
          success: false,
          error: errorMsg,
        };
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

export default new KsherService();