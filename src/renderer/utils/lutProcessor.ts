/**
 * 3D LUT (.cube) Processor
 * Supports Adobe .cube format for color grading on images and videos
 */

export interface LUT3D {
  title: string;
  size: number;
  data: Float32Array;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

/**
 * Parse .cube LUT file content
 */
export const parseCubeLUT = (cubeContent: string): LUT3D => {
  const lines = cubeContent.split('\n');
  let title = '';
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const dataPoints: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.startsWith('TITLE')) {
      title = trimmed.substring(5).trim().replace(/"/g, '');
      continue;
    }

    if (trimmed.startsWith('LUT_3D_SIZE')) {
      size = parseInt(trimmed.split(/\s+/)[1], 10);
      continue;
    }

    if (trimmed.startsWith('DOMAIN_MIN')) {
      const values = trimmed.split(/\s+/).slice(1);
      domainMin = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
      continue;
    }

    if (trimmed.startsWith('DOMAIN_MAX')) {
      const values = trimmed.split(/\s+/).slice(1);
      domainMax = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
      continue;
    }

    const values = trimmed.split(/\s+/);
    if (values.length === 3) {
      const r = parseFloat(values[0]);
      const g = parseFloat(values[1]);
      const b = parseFloat(values[2]);

      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        dataPoints.push(r, g, b);
      }
    }
  }

  if (size === 0) {
    throw new Error('Invalid LUT file: LUT_3D_SIZE not found');
  }

  const expectedDataPoints = size * size * size * 3;
  if (dataPoints.length !== expectedDataPoints) {
    throw new Error(
      `Invalid LUT: Expected ${expectedDataPoints} values, got ${dataPoints.length}`,
    );
  }

  return {
    title,
    size,
    data: new Float32Array(dataPoints),
    domainMin,
    domainMax,
  };
};

/**
 * Load .cube LUT file from URL or path
 */
export const loadCubeLUT = async (url: string): Promise<LUT3D> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load LUT: ${response.statusText}`);
  }
  const content = await response.text();
  return parseCubeLUT(content);
};

/**
 * Apply 3D LUT to canvas (for images/photos)
 */
export const applyLUTToCanvas = (
  sourceCanvas: HTMLCanvasElement,
  lut: LUT3D,
): HTMLCanvasElement => {
  const { width, height } = sourceCanvas;
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

  if (!sourceCtx) {
    throw new Error('Failed to get source canvas context');
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputCtx = outputCanvas.getContext('2d');

  if (!outputCtx) {
    throw new Error('Failed to get output canvas context');
  }

  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const lutSize = lut.size;
  const lutData = lut.data;
  const [minR, minG, minB] = lut.domainMin;
  const [maxR, maxG, maxB] = lut.domainMax;
  const rangeR = maxR - minR;
  const rangeG = maxG - minG;
  const rangeB = maxB - minB;

  for (let i = 0; i < pixels.length; i += 4) {
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

    const getColor = (
      ri: number,
      gi: number,
      bi: number,
    ): [number, number, number] => {
      const index = (ri + gi * lutSize + bi * lutSize * lutSize) * 3;
      return [lutData[index], lutData[index + 1], lutData[index + 2]];
    };

    const c000 = getColor(rLow, gLow, bLow);
    const c001 = getColor(rLow, gLow, bHigh);
    const c010 = getColor(rLow, gHigh, bLow);
    const c011 = getColor(rLow, gHigh, bHigh);
    const c100 = getColor(rHigh, gLow, bLow);
    const c101 = getColor(rHigh, gLow, bHigh);
    const c110 = getColor(rHigh, gHigh, bLow);
    const c111 = getColor(rHigh, gHigh, bHigh);

    const interpolate = (
      v000: number,
      v001: number,
      v010: number,
      v011: number,
      v100: number,
      v101: number,
      v110: number,
      v111: number,
    ): number => {
      const v00 = v000 * (1 - rFrac) + v100 * rFrac;
      const v01 = v001 * (1 - rFrac) + v101 * rFrac;
      const v10 = v010 * (1 - rFrac) + v110 * rFrac;
      const v11 = v011 * (1 - rFrac) + v111 * rFrac;

      const v0 = v00 * (1 - gFrac) + v10 * gFrac;
      const v1 = v01 * (1 - gFrac) + v11 * gFrac;

      return v0 * (1 - bFrac) + v1 * bFrac;
    };

    const outR = interpolate(
      c000[0],
      c001[0],
      c010[0],
      c011[0],
      c100[0],
      c101[0],
      c110[0],
      c111[0],
    );
    const outG = interpolate(
      c000[1],
      c001[1],
      c010[1],
      c011[1],
      c100[1],
      c101[1],
      c110[1],
      c111[1],
    );
    const outB = interpolate(
      c000[2],
      c001[2],
      c010[2],
      c011[2],
      c100[2],
      c101[2],
      c110[2],
      c111[2],
    );

    pixels[i] = Math.round(Math.max(0, Math.min(255, outR * 255)));
    pixels[i + 1] = Math.round(Math.max(0, Math.min(255, outG * 255)));
    pixels[i + 2] = Math.round(Math.max(0, Math.min(255, outB * 255)));
  }

  outputCtx.putImageData(imageData, 0, 0);
  return outputCanvas;
};

/**
 * Apply LUT to image element
 */
export const applyLUTToImage = async (
  image: HTMLImageElement | HTMLVideoElement,
  lut: LUT3D,
): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width =
    image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
  canvas.height =
    image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const processedCanvas = applyLUTToCanvas(canvas, lut);

  // ใช้ quality 0.88 เพื่อ balance ระหว่างขนาดไฟล์และคุณภาพ
  return processedCanvas.toDataURL('image/jpeg', 0.88);
};

/**
 * Cache for loaded LUTs
 */
const lutCache = new Map<string, LUT3D>();

/**
 * Get LUT with caching
 */
export const getCachedLUT = async (url: string): Promise<LUT3D> => {
  if (lutCache.has(url)) {
    return lutCache.get(url)!;
  }

  const lut = await loadCubeLUT(url);
  lutCache.set(url, lut);
  return lut;
};

/**
 * Clear LUT cache
 */
export const clearLUTCache = (): void => {
  lutCache.clear();
};

// Cache for resources path
let cachedResourcesPath: string | null = null;

/**
 * Get LUT file path for a filter
 */
export const getLUTFilePath = async (lutFileName: string): Promise<string> => {
  // In production (packaged app), assets are in resources folder
  if (process.env.NODE_ENV === 'production' || (window as any).electron) {
    try {
      // Get resources path from main process
      if (!cachedResourcesPath) {
        cachedResourcesPath = await (window as any).electron.payment.getResourcesPath();
      }

      if (cachedResourcesPath) {
        // Use file:// protocol for packaged app
        // Join path manually (can't use Node.js path module in renderer)
        const normalizedBase = cachedResourcesPath.replace(/\\/g, '/').replace(/\/$/, '');
        const lutPath = `${normalizedBase}/assets/filters/${lutFileName}`;
        return `file://${lutPath}`;
      }
    } catch (error) {
      console.error('Failed to get resources path:', error);
    }
  }

  // In development, use relative path
  return `/assets/filters/${lutFileName}`;
};
