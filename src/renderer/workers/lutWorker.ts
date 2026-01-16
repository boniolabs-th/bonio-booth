/**
 * Web Worker for LUT Processing
 * Handles heavy LUT calculations in background thread
 * Uses chunked processing to avoid blocking and enable progress reporting
 */

import { LUT3D } from '../utils/lutProcessor';

interface WorkerMessage {
  type: 'APPLY_LUT';
  imageData: ImageData;
  lut: LUT3D;
  requestId: string;
}

interface WorkerResponse {
  type: 'LUT_APPLIED' | 'LUT_PROGRESS';
  imageData?: ImageData;
  requestId: string;
  progress?: number; // 0-100
}

// Chunk size - process this many pixels before yielding
// Smaller = more responsive progress, larger = faster overall
const CHUNK_SIZE = 50000; // ~50K pixels per chunk

// Apply LUT to ImageData using chunked processing
const applyLUTToImageDataChunked = async (
  imageData: ImageData,
  lut: LUT3D,
  requestId: string,
  reportProgress: (progress: number) => void,
): Promise<ImageData> => {
  const pixels = imageData.data;
  const totalPixels = pixels.length / 4;
  const lutSize = lut.size;
  const lutData = lut.data;
  const [minR, minG, minB] = lut.domainMin;
  const [maxR, maxG, maxB] = lut.domainMax;
  const rangeR = maxR - minR;
  const rangeG = maxG - minG;
  const rangeB = maxB - minB;

  // Helper function to get color from LUT
  const getColor = (
    ri: number,
    gi: number,
    bi: number,
  ): [number, number, number] => {
    const index = (ri + gi * lutSize + bi * lutSize * lutSize) * 3;
    return [lutData[index], lutData[index + 1], lutData[index + 2]];
  };

  // Trilinear interpolation helper
  const interpolate = (
    v000: number, v001: number, v010: number, v011: number,
    v100: number, v101: number, v110: number, v111: number,
    rFrac: number, gFrac: number, bFrac: number,
  ): number => {
    const v00 = v000 * (1 - rFrac) + v100 * rFrac;
    const v01 = v001 * (1 - rFrac) + v101 * rFrac;
    const v10 = v010 * (1 - rFrac) + v110 * rFrac;
    const v11 = v011 * (1 - rFrac) + v111 * rFrac;
    const v0 = v00 * (1 - gFrac) + v10 * gFrac;
    const v1 = v01 * (1 - gFrac) + v11 * gFrac;
    return v0 * (1 - bFrac) + v1 * bFrac;
  };

  let processedPixels = 0;
  let lastReportedProgress = 0;

  // Process in chunks
  for (let chunkStart = 0; chunkStart < pixels.length; chunkStart += CHUNK_SIZE * 4) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE * 4, pixels.length);

    // Process this chunk
    for (let i = chunkStart; i < chunkEnd; i += 4) {
      let r = pixels[i] / 255;
      let g = pixels[i + 1] / 255;
      let b = pixels[i + 2] / 255;

      r = (r - minR) / rangeR;
      g = (g - minG) / rangeG;
      b = (b - minB) / rangeB;

      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      const rIndex = r * (lutSize - 1);
      const gIndex = g * (lutSize - 1);
      const bIndex = b * (lutSize - 1);

      const rLow = Math.floor(rIndex);
      const gLow = Math.floor(gIndex);
      const bLow = Math.floor(bIndex);

      const rHigh = Math.min(rLow + 1, lutSize - 1);
      const gHigh = Math.min(gLow + 1, lutSize - 1);
      const bHigh = Math.min(bLow + 1, lutSize - 1);

      const rFrac = rIndex - rLow;
      const gFrac = gIndex - gLow;
      const bFrac = bIndex - bLow;

      const c000 = getColor(rLow, gLow, bLow);
      const c001 = getColor(rLow, gLow, bHigh);
      const c010 = getColor(rLow, gHigh, bLow);
      const c011 = getColor(rLow, gHigh, bHigh);
      const c100 = getColor(rHigh, gLow, bLow);
      const c101 = getColor(rHigh, gLow, bHigh);
      const c110 = getColor(rHigh, gHigh, bLow);
      const c111 = getColor(rHigh, gHigh, bHigh);

      const outR = interpolate(c000[0], c001[0], c010[0], c011[0], c100[0], c101[0], c110[0], c111[0], rFrac, gFrac, bFrac);
      const outG = interpolate(c000[1], c001[1], c010[1], c011[1], c100[1], c101[1], c110[1], c111[1], rFrac, gFrac, bFrac);
      const outB = interpolate(c000[2], c001[2], c010[2], c011[2], c100[2], c101[2], c110[2], c111[2], rFrac, gFrac, bFrac);

      pixels[i] = Math.round(Math.max(0, Math.min(255, outR * 255)));
      pixels[i + 1] = Math.round(Math.max(0, Math.min(255, outG * 255)));
      pixels[i + 2] = Math.round(Math.max(0, Math.min(255, outB * 255)));
    }

    processedPixels += (chunkEnd - chunkStart) / 4;

    // Report progress every 5%
    const progress = Math.round((processedPixels / totalPixels) * 100);
    if (progress - lastReportedProgress >= 5) {
      lastReportedProgress = progress;
      reportProgress(progress);
    }

    // Yield to allow other operations (use setTimeout trick in worker)
    if (chunkEnd < pixels.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return imageData;
};

// Worker message handler
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, imageData, lut, requestId } = e.data;

  if (type === 'APPLY_LUT') {
    const startTime = performance.now();

    const reportProgress = (progress: number) => {
      const progressResponse: WorkerResponse = {
        type: 'LUT_PROGRESS',
        requestId,
        progress,
      };
      self.postMessage(progressResponse);
    };

    try {
      const processedImageData = await applyLUTToImageDataChunked(
        imageData,
        lut,
        requestId,
        reportProgress,
      );

      const elapsed = performance.now() - startTime;
      console.log(`[LUT Worker] Processed ${imageData.width}x${imageData.height} in ${elapsed.toFixed(0)}ms`);

      const response: WorkerResponse = {
        type: 'LUT_APPLIED',
        imageData: processedImageData,
        requestId,
      };

      self.postMessage(response);
    } catch (error) {
      console.error('[LUT Worker] Error:', error);
    }
  }
};

export {};
