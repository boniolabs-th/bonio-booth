/**
 * Image Processing Utilities
 * - Sharpening filter
 * - Quality optimization
 * - Native resolution handling
 * - Canon photo resizing
 */

/**
 * Canon photo target resolution
 * Original: 6000x4000 (~6-7MB)
 * Target: 3600x2400 (~2-3MB)
 */
export const CANON_TARGET_RESOLUTION = {
  width: 3600,
  height: 2400,
};

/**
 * JPEG quality สำหรับการ save รูปภาพ
 * 0.85 = คุณภาพดี ไฟล์เล็ก (แนะนำ)
 * 1.0 = คุณภาพสูงสุด ไฟล์ใหญ่
 */
export const JPEG_QUALITY = {
  /** คุณภาพสูงสุด - ใช้สำหรับ print output */
  PRINT: 1.0,
  /** คุณภาพมาตรฐาน - ใช้สำหรับ upload/share */
  STANDARD: 1.0,
  /** คุณภาพต่ำ - ใช้สำหรับ thumbnail/preview */
  PREVIEW: 1.0,
};

/**
 * Resize Canon photo from original resolution (6000x4000) to target resolution (3600x2400)
 * This reduces file size from ~6-7MB to ~2-3MB while maintaining good quality
 *
 * @param imageDataUrl - Base64 data URL of the original image
 * @param targetWidth - Target width (default: 3600)
 * @param targetHeight - Target height (default: 2400)
 * @param quality - JPEG quality (default: 0.92 for print quality)
 * @returns Promise<string> - Base64 data URL of the resized image
 */
export async function resizeCanonPhoto(
  imageDataUrl: string,
  targetWidth: number = CANON_TARGET_RESOLUTION.width,
  targetHeight: number = CANON_TARGET_RESOLUTION.height,
  quality: number = JPEG_QUALITY.PRINT,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      console.log(`📷 [resizeCanonPhoto] Original: ${originalWidth}x${originalHeight}`);
      console.log(`📷 [resizeCanonPhoto] Target: ${targetWidth}x${targetHeight}`);

      // If already smaller than target, return original
      if (originalWidth <= targetWidth && originalHeight <= targetHeight) {
        console.log('📷 [resizeCanonPhoto] Image already at or below target size, returning original');
        resolve(imageDataUrl);
        return;
      }

      // Calculate scale to fit target while maintaining aspect ratio
      const scaleX = targetWidth / originalWidth;
      const scaleY = targetHeight / originalHeight;
      const scale = Math.min(scaleX, scaleY);

      const newWidth = Math.round(originalWidth * scale);
      const newHeight = Math.round(originalHeight * scale);

      console.log(`📷 [resizeCanonPhoto] Resizing to: ${newWidth}x${newHeight} (scale: ${scale.toFixed(3)})`);

      // Create canvas for resizing
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Use high quality image smoothing for best resize quality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw resized image
      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Convert to data URL with specified quality
      const resizedDataUrl = canvas.toDataURL('image/jpeg', quality);

      // Log size comparison
      const originalSize = imageDataUrl.length;
      const resizedSize = resizedDataUrl.length;
      const reduction = ((1 - resizedSize / originalSize) * 100).toFixed(1);
      console.log(`📷 [resizeCanonPhoto] Size reduced by ${reduction}% (${(originalSize / 1024 / 1024).toFixed(2)}MB -> ${(resizedSize / 1024 / 1024).toFixed(2)}MB)`);

      resolve(resizedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for resizing'));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Apply unsharp mask (sharpening) to canvas image
 * Uses convolution matrix for edge enhancement
 *
 * @param canvas - Source canvas with image
 * @param amount - Sharpening strength (0.0 - 1.0), default 0.3
 * @returns New canvas with sharpened image
 */
export function applySharpen(
  canvas: HTMLCanvasElement,
  amount: number = 0.3,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outputCtx) return canvas;

  // Copy original data
  const outputData = outputCtx.createImageData(width, height);
  const output = outputData.data;

  // Unsharp mask kernel (edge enhancement)
  // Center weight increases sharpness, negative neighbors create edge detection
  const kernel = [
    0, -amount, 0,
    -amount, 1 + 4 * amount, -amount,
    0, -amount, 0,
  ];

  // Apply convolution
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        // RGB channels only
        let sum = 0;

        // Apply kernel
        sum += data[((y - 1) * width + x) * 4 + c] * kernel[1]; // top
        sum += data[(y * width + (x - 1)) * 4 + c] * kernel[3]; // left
        sum += data[(y * width + x) * 4 + c] * kernel[4]; // center
        sum += data[(y * width + (x + 1)) * 4 + c] * kernel[5]; // right
        sum += data[((y + 1) * width + x) * 4 + c] * kernel[7]; // bottom

        // Clamp to 0-255
        output[idx + c] = Math.max(0, Math.min(255, Math.round(sum)));
      }

      // Copy alpha channel
      output[idx + 3] = data[idx + 3];
    }
  }

  // Copy edge pixels (not processed)
  for (let x = 0; x < width; x++) {
    // Top row
    const topIdx = x * 4;
    output[topIdx] = data[topIdx];
    output[topIdx + 1] = data[topIdx + 1];
    output[topIdx + 2] = data[topIdx + 2];
    output[topIdx + 3] = data[topIdx + 3];

    // Bottom row
    const bottomIdx = ((height - 1) * width + x) * 4;
    output[bottomIdx] = data[bottomIdx];
    output[bottomIdx + 1] = data[bottomIdx + 1];
    output[bottomIdx + 2] = data[bottomIdx + 2];
    output[bottomIdx + 3] = data[bottomIdx + 3];
  }

  for (let y = 0; y < height; y++) {
    // Left column
    const leftIdx = (y * width) * 4;
    output[leftIdx] = data[leftIdx];
    output[leftIdx + 1] = data[leftIdx + 1];
    output[leftIdx + 2] = data[leftIdx + 2];
    output[leftIdx + 3] = data[leftIdx + 3];

    // Right column
    const rightIdx = (y * width + (width - 1)) * 4;
    output[rightIdx] = data[rightIdx];
    output[rightIdx + 1] = data[rightIdx + 1];
    output[rightIdx + 2] = data[rightIdx + 2];
    output[rightIdx + 3] = data[rightIdx + 3];
  }

  outputCtx.putImageData(outputData, 0, 0);
  return outputCanvas;
}

/**
 * Apply fast box blur (for unsharp mask)
 * @param data - ImageData.data array
 * @param width - Image width
 * @param height - Image height
 * @param radius - Blur radius
 */
export function applyBoxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  const size = radius * 2 + 1;
  const divisor = size * size;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;

          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
        }
      }

      const idx = (y * width + x) * 4;
      output[idx] = Math.round(r / divisor);
      output[idx + 1] = Math.round(g / divisor);
      output[idx + 2] = Math.round(b / divisor);
      output[idx + 3] = data[idx + 3];
    }
  }

  return output;
}

/**
 * Apply unsharp mask using blur-based method (higher quality)
 * Formula: sharpened = original + amount * (original - blurred)
 *
 * @param canvas - Source canvas
 * @param amount - Sharpening strength (0.5 - 2.0), default 0.8
 * @param radius - Blur radius for unsharp mask, default 1
 * @returns New canvas with sharpened image
 */
export function applyUnsharpMask(
  canvas: HTMLCanvasElement,
  amount: number = 0.8,
  radius: number = 1,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const original = imageData.data;

  // Create blurred version
  const blurred = applyBoxBlur(original, width, height, radius);

  // Create output
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outputCtx) return canvas;

  const outputData = outputCtx.createImageData(width, height);
  const output = outputData.data;

  // Apply unsharp mask formula
  for (let i = 0; i < original.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = original[i + c] - blurred[i + c];
      const sharpened = original[i + c] + amount * diff;
      output[i + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
    }
    output[i + 3] = original[i + 3]; // Alpha
  }

  outputCtx.putImageData(outputData, 0, 0);
  return outputCanvas;
}

/**
 * ประมวลผลภาพ webcam ให้คมชัดขึ้นและ optimize ขนาดไฟล์
 *
 * @param dataUrl - Image data URL จาก webcam capture
 * @param options - Processing options
 * @returns Promise<string> - Processed image data URL
 */
export async function processWebcamPhoto(
  dataUrl: string,
  options: {
    sharpen?: boolean;
    sharpenAmount?: number;
    quality?: number;
  } = {},
): Promise<string> {
  const {
    sharpen = true,
    sharpenAmount = 0.3,
    quality = JPEG_QUALITY.STANDARD,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Create canvas at native resolution (no upscaling)
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
        colorSpace: 'srgb',
      });

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw image at native resolution
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Apply sharpening if enabled
      let outputCanvas = canvas;
      if (sharpen) {
        console.log(`🔍 [ImageProcessing] Applying sharpen (amount: ${sharpenAmount})`);
        outputCanvas = applySharpen(canvas, sharpenAmount);
      }

      // Export with optimized quality
      const processedDataUrl = outputCanvas.toDataURL('image/jpeg', quality);

      console.log(`✅ [ImageProcessing] Photo processed:`, {
        originalSize: dataUrl.length,
        processedSize: processedDataUrl.length,
        reduction: `${(100 - (processedDataUrl.length / dataUrl.length) * 100).toFixed(1)}%`,
        quality,
        sharpen,
      });

      resolve(processedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for processing'));
    };

    img.src = dataUrl;
  });
}

/**
 * คำนวณ optimal resolution สำหรับ webcam
 * ใช้ native resolution ของ webcam โดยไม่ upscale
 *
 * @param track - MediaStreamTrack จาก webcam
 * @returns { width, height } native resolution
 */
export function getNativeWebcamResolution(track: MediaStreamTrack): {
  width: number;
  height: number;
} {
  const settings = track.getSettings();
  return {
    width: settings.width || 1920,
    height: settings.height || 1080,
  };
}

/**
 * สร้าง constraints ที่ใช้ native resolution ของ webcam
 * หลีกเลี่ยงการ upscale โดยไม่จำเป็น
 */
export function getOptimalWebcamConstraints(
  deviceId?: string,
): MediaStreamConstraints {
  return {
    video: deviceId
      ? {
          deviceId: { exact: deviceId },
          // ใช้ ideal แทน exact เพื่อให้ webcam เลือก resolution ที่ดีที่สุด
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        }
      : {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
    audio: false,
  };
}

/**
 * ประมวลผลภาพจากกล้อง Canon ให้คมชัดขึ้น
 * ใช้ Unsharp Mask algorithm สำหรับ edge enhancement
 *
 * @param dataUrl - Image data URL จาก Canon capture
 * @param options - Processing options
 * @returns Promise<string> - Processed image data URL
 */
export async function processCanonPhoto(
  dataUrl: string,
  options: {
    sharpen?: boolean;
    sharpenAmount?: number;
    quality?: number;
  } = {},
): Promise<string> {
  const {
    sharpen = true,
    sharpenAmount = 0.4, // ค่า default สำหรับ Canon (สูงกว่า webcam เล็กน้อย)
    quality = JPEG_QUALITY.PRINT,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Create canvas at native resolution
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
        colorSpace: 'srgb',
      });

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw image at native resolution
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Apply sharpening if enabled
      let outputCanvas = canvas;
      if (sharpen) {
        console.log(`🔍 [ImageProcessing] Applying Canon sharpen (amount: ${sharpenAmount})`);
        // ใช้ applyUnsharpMask สำหรับคุณภาพสูงกว่า
        outputCanvas = applyUnsharpMask(canvas, sharpenAmount, 1);
      }

      // Export with optimized quality
      const processedDataUrl = outputCanvas.toDataURL('image/jpeg', quality);

      console.log(`✅ [ImageProcessing] Canon photo processed:`, {
        originalSize: `${(dataUrl.length / 1024 / 1024).toFixed(2)} MB`,
        processedSize: `${(processedDataUrl.length / 1024 / 1024).toFixed(2)} MB`,
        reduction: `${(100 - (processedDataUrl.length / dataUrl.length) * 100).toFixed(1)}%`,
        quality,
        sharpen,
        sharpenAmount,
      });

      resolve(processedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('Failed to load Canon image for processing'));
    };

    img.src = dataUrl;
  });
}

/**
 * Apply sharpening to a canvas and return new canvas
 * Convenience function for use in filter pipelines
 *
 * @param canvas - Source canvas
 * @param amount - Sharpening strength (0.1 - 1.0)
 * @returns Sharpened canvas
 */
export function sharpenCanvas(
  canvas: HTMLCanvasElement,
  amount: number = 0.35,
): HTMLCanvasElement {
  return applyUnsharpMask(canvas, amount, 1);
}

export default {
  JPEG_QUALITY,
  applySharpen,
  applyUnsharpMask,
  processWebcamPhoto,
  processCanonPhoto,
  sharpenCanvas,
  getNativeWebcamResolution,
  getOptimalWebcamConstraints,
};
