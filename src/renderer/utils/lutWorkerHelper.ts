/**
 * Helper utilities for using LUT Worker
 */

import { LUT3D } from './lutProcessor';

let worker: Worker | null = null;

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
 */
export const applyLUTWithWorker = (
  canvas: HTMLCanvasElement,
  lut: LUT3D,
): Promise<HTMLCanvasElement> => {
  return new Promise((resolve, reject) => {
    const w = initLUTWorker();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Send to worker
    w.postMessage({
      type: 'APPLY_LUT',
      imageData,
      lut,
    });

    // Listen for response
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'LUT_APPLIED') {
        // Create result canvas
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = canvas.width;
        resultCanvas.height = canvas.height;
        const resultCtx = resultCanvas.getContext('2d');

        if (!resultCtx) {
          reject(new Error('Failed to create result canvas'));
          return;
        }

        resultCtx.putImageData(e.data.imageData, 0, 0);
        w.removeEventListener('message', handleMessage);
        resolve(resultCanvas);
      }
    };

    w.addEventListener('message', handleMessage);

    // Timeout after 10 seconds
    setTimeout(() => {
      w.removeEventListener('message', handleMessage);
      reject(new Error('LUT processing timeout'));
    }, 10000);
  });
};

/**
 * Terminate worker
 */
export const terminateLUTWorker = (): void => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
};
