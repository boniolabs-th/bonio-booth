export interface PaymentResult {
  success: boolean;
  qr_code?: string | null;
  reference_id?: string;
  order_id?: string;
  error?: string;
}

export interface PaymentStatus {
  success: boolean;
  status?:
    | 'paid'
    | 'pending'
    | 'failed'
    | 'SUCCESS'
    | 'FAIL'
    | 'CLOSED'
    | 'NOTPAY'
    | 'PAYERROR'
    | 'PENDING'
    | 'NOTSURE'
    | 'USERPAYING'
    | 'REFUND';
  amount?: number;
  reference_id?: string;
  error?: string;
}

class PaymentService {
  async createPayment(amount: number, orderNo: string): Promise<PaymentResult> {
    try {
      const result = await window.electron.payment.createPayment(amount, orderNo);
      return result;
    } catch (error) {
      console.error('Error creating payment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create payment';
      return { success: false, error: errorMessage };
    }
  }

  async checkPaymentStatus(referenceId: string): Promise<PaymentStatus> {
    try {
      const result = await window.electron.payment.checkPaymentStatus(referenceId);
      return result;
    } catch (error) {
      console.error('Error checking payment status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to check payment status';
      return { success: false, error: errorMessage };
    }
  }

  generateOrderNo(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `BOOTH_${timestamp}_${random}`;
  }
}

export default new PaymentService();
