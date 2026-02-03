/**
 * Helper utilities for using LUT Worker
 * Uses chunked processing to handle large images without timeout
 * Uses WebGL for large images (Canon cameras) when GPU is available
 */

import { LUT3D } from './lutProcessor';
import { applyLUTWithWebGL, isWebGLAvailable, cleanupWebGL } from './lutWebGL';

let worker: Worker | null = null;

// Threshold for using WebGL (4 megapixels = ~2000x2000)
// Canon images are typically 24MP+ so they will use WebGL
const WEBGL_THRESHOLD_PIXELS = 4_000_000;

// Maximum dimensions for processing (to reduce file size from Canon's 24MP)
const MAX_PROCESS_WIDTH = 3600;
const MAX_PROCESS_HEIGHT = 2400;

// Cache WebGL availability check
let webGLAvailable: boolean | null = null;

/**
 * Resize canvas if it exceeds maximum dimensions
 * Maintains aspect ratio
 */
const resizeCanvasIfNeeded = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const { width, height } = canvas;

  // Check if resize is needed
  if (width <= MAX_PROCESS_WIDTH && height <= MAX_PROCESS_HEIGHT) {
    return canvas;
  }

  // Calculate new dimensions maintaining aspect ratio
  const aspectRatio = width / height;
  let newWidth = width;
  let newHeight = height;

  if (width > MAX_PROCESS_WIDTH) {
    newWidth = MAX_PROCESS_WIDTH;
    newHeight = Math.round(newWidth / aspectRatio);
  }

  if (newHeight > MAX_PROCESS_HEIGHT) {
    newHeight = MAX_PROCESS_HEIGHT;
    newWidth = Math.round(newHeight * aspectRatio);
  }

  console.log(`[LUT] Resizing from ${width}x${height} to ${newWidth}x${newHeight}`);

  // Create resized canvas
  const resizedCanvas = document.createElement('canvas');
  resizedCanvas.width = newWidth;
  resizedCanvas.height = newHeight;
  const ctx = resizedCanvas.getContext('2d', { colorSpace: 'srgb' });

  if (ctx) {
    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
  }

  return resizedCanvas;
};

/**
 * DEBUG: Set to true to force CPU Worker path (disable WebGL)
 * This helps isolate whether color issues are in WebGL or CPU code
 */
const DEBUG_FORCE_CPU = true;

/**
 * Check if WebGL should be used based on image size
 */
const shouldUseWebGL = (width: number, height: number): boolean => {
  // DEBUG: Force CPU path for testing
  if (DEBUG_FORCE_CPU) {
    console.log(`[LUT] DEBUG: Forcing CPU path (WebGL disabled)`);
    return false;
  }

  const pixelCount = width * height;

  // Only use WebGL for large images (likely from Canon camera)
  if (pixelCount < WEBGL_THRESHOLD_PIXELS) {
    return false;
  }

  // Check WebGL availability (cache result)
  if (webGLAvailable === null) {
    webGLAvailable = isWebGLAvailable();
    console.log(`[LUT] WebGL available: ${webGLAvailable}`);
  }

  return webGLAvailable;
};

/**
 * Initialize LUT Worker
 */
export const initLUTWorker = (): Worker => {
  if (!worker) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - webpack will handle this
    worker = new Worker(new URL('../workers/lutWorker.ts', import.meta.url));
  }
  return worker;
};

/**
 * Apply LUT using Web Worker (non-blocking)
 * Supports progress callback for large images
 * Automatically uses WebGL for large images (Canon) when GPU available
 */
export const applyLUTWithWorker = (
  canvas: HTMLCanvasElement,
  lut: LUT3D,
  onProgress?: (progress: number) => void,
): Promise<HTMLCanvasElement> => {
  // Resize canvas if needed (reduce Canon's 24MP to max 3600x2400)
  const processCanvas = resizeCanvasIfNeeded(canvas);

  // Log image size for debugging
  const pixelCount = processCanvas.width * processCanvas.height;
  const megaPixels = (pixelCount / 1000000).toFixed(1);
  console.log(`[LUT] Processing ${processCanvas.width}x${processCanvas.height} (${megaPixels}MP)`);

  // Use WebGL for large images (Canon cameras typically 24MP+)
  if (shouldUseWebGL(processCanvas.width, processCanvas.height)) {
    console.log(`[LUT] Using WebGL acceleration for large image`);

    try {
      const result = applyLUTWithWebGL(processCanvas, lut);
      if (result) {
        // WebGL succeeded
        if (onProgress) onProgress(100);
        return Promise.resolve(result);
      }
      // WebGL returned null, fall through to CPU
      console.warn(`[LUT] WebGL returned null, falling back to CPU`);
    } catch (error) {
      console.warn(`[LUT] WebGL failed, falling back to CPU:`, error);
    }
  }

  // Use Web Worker (CPU) for smaller images or as fallback
  return new Promise((resolve, reject) => {
    const w = initLUTWorker();
    const ctx = processCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    const imageData = ctx.getImageData(0, 0, processCanvas.width, processCanvas.height);
    const requestId = Math.random().toString(36).substring(7);

    // Clone imageData for transfer (create a new ArrayBuffer)
    const clonedData = new Uint8ClampedArray(imageData.data);
    const clonedImageData = new ImageData(clonedData, imageData.width, imageData.height);

    // Track last progress time for timeout detection
    let lastProgressTime = Date.now();
    const PROGRESS_TIMEOUT = 30000; // 30s without progress = timeout

    // Send to worker
    w.postMessage({
      type: 'APPLY_LUT',
      imageData: clonedImageData,
      lut: {
        size: lut.size,
        data: lut.data, // Pass Float32Array directly (structured clone)
        domainMin: lut.domainMin,
        domainMax: lut.domainMax,
      },
      requestId,
    });

    // Listen for response
    const handleMessage = (e: MessageEvent) => {
      if (e.data.requestId !== requestId) return;

      // Handle progress updates
      if (e.data.type === 'LUT_PROGRESS') {
        lastProgressTime = Date.now();
        if (onProgress) {
          onProgress(e.data.progress);
        }
        return;
      }

      // Handle completion
      if (e.data.type === 'LUT_APPLIED') {
        clearInterval(timeoutChecker);

        // Create result canvas with processCanvas dimensions (resized)
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = processCanvas.width;
        resultCanvas.height = processCanvas.height;
        const resultCtx = resultCanvas.getContext('2d', { colorSpace: 'srgb' });

        if (!resultCtx) {
          w.removeEventListener('message', handleMessage);
          reject(new Error('Failed to create result canvas'));
          return;
        }

        resultCtx.putImageData(e.data.imageData, 0, 0);
        w.removeEventListener('message', handleMessage);

        console.log(`[LUT] Processing complete`);
        resolve(resultCanvas);
      }
    };

    w.addEventListener('message', handleMessage);

    // Check for progress timeout (no progress for 30s = stuck)
    const timeoutChecker = setInterval(() => {
      const elapsed = Date.now() - lastProgressTime;
      if (elapsed > PROGRESS_TIMEOUT) {
        clearInterval(timeoutChecker);
        w.removeEventListener('message', handleMessage);
        reject(new Error(`LUT processing timeout (no progress for ${PROGRESS_TIMEOUT / 1000}s)`));
      }
    }, 5000);
  });
};

/**
 * Terminate worker and cleanup WebGL
 */
export const terminateLUTWorker = (): void => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  cleanupWebGL();
};
