/**
 * QR Code Utilities
 *
 * ฟังก์ชันสำหรับสร้าง QR code โดยใช้ library แทน external service
 * เพื่อให้ performance ดีขึ้นและไม่ต้องพึ่งพา internet
 */

import { QRCodeSVG } from 'qrcode.react';
import QRCode from 'qrcode';

/**
 * Export QRCodeSVG component สำหรับใช้ใน React components
 */
export { QRCodeSVG as QRCodeComponent };

/**
 * สร้าง QR code เป็น data URL (base64 image)
 * ใช้สำหรับกรณีที่ต้องการใช้เป็น image src
 */
export async function generateQRCodeDataUrl(
  value: string,
  size: number = 200,
  level: 'L' | 'M' | 'Q' | 'H' = 'M',
): Promise<string> {
  try {
    // ใช้ qrcode library เพื่อสร้าง QR code เป็น data URL โดยตรง
    const dataUrl = await QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: level,
    });
    return dataUrl;
  } catch (error) {
    console.error('❌ [QRCodeUtils] Failed to generate QR code:', error);
    throw error;
  }
}
