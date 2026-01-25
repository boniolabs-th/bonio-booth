import path from 'path';
import { app } from 'electron';
import { createRequire } from 'module';

let cachedBinding: any | null | undefined;

const loadBinding = (): any | null => {
  if (cachedBinding !== undefined) {
    return cachedBinding;
  }

  const requireFn = createRequire(__filename);
  const candidates = [
    path.join(app.getAppPath(), 'native', 'mf-encoder', 'index.js'),
    path.join(process.resourcesPath, 'native', 'mf-encoder', 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      cachedBinding = requireFn(candidate);
      return cachedBinding;
    } catch (error) {
      // Continue to next candidate
    }
  }

  cachedBinding = null;
  return null;
};

export const isMfEncoderAvailable = (): boolean => {
  const binding = loadBinding();
  if (!binding) {
    return false;
  }
  try {
    if (typeof binding.mfIsAvailable === 'function') {
      return binding.mfIsAvailable();
    }
    return typeof binding.mf_is_available === 'function'
      ? binding.mf_is_available()
      : false;
  } catch (error) {
    return false;
  }
};

export const tryConvertWebmToMp4WithNative = (
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
  targetDuration: number,
): string | null => {
  const binding = loadBinding();
  if (!binding) {
    return null;
  }

  try {
    if (typeof binding.mfConvertWebmToMp4 === 'function') {
      return binding.mfConvertWebmToMp4(
        inputPath,
        outputPath,
        ffmpegPath,
        targetDuration,
      ) as string;
    }
    if (typeof binding.mf_convert_webm_to_mp4 === 'function') {
      return binding.mf_convert_webm_to_mp4(
        inputPath,
        outputPath,
        ffmpegPath,
        targetDuration,
      ) as string;
    }
    return null;
  } catch (error) {
    console.warn('⚠️ [MFEncoder] Native conversion failed, fallback to JS:', error);
    return null;
  }
};

export const tryEncodeNv12ToMp4WithNative = (
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  frames: Buffer,
  frameCount: number,
  outputPath: string,
): string | null => {
  const binding = loadBinding();
  if (!binding) {
    return null;
  }

  try {
    if (typeof binding.mfEncodeNv12ToMp4 === 'function') {
      return binding.mfEncodeNv12ToMp4(
        width,
        height,
        fps,
        bitrate,
        frames,
        frameCount,
        outputPath,
      ) as string;
    }
    if (typeof binding.mf_encode_nv12_to_mp4 === 'function') {
      return binding.mf_encode_nv12_to_mp4(
        width,
        height,
        fps,
        bitrate,
        frames,
        frameCount,
        outputPath,
      ) as string;
    }
    return null;
  } catch (error) {
    console.warn('⚠️ [MFEncoder] NV12 encode failed:', error);
    return null;
  }
};

export const listMfVideoDevices = (): string[] => {
  const binding = loadBinding();
  if (!binding) {
    return [];
  }

  try {
    if (typeof binding.mfListVideoDevices === 'function') {
      return binding.mfListVideoDevices() as string[];
    }
    if (typeof binding.mf_list_video_devices === 'function') {
      return binding.mf_list_video_devices() as string[];
    }
    return [];
  } catch (error) {
    console.warn('⚠️ [MFEncoder] List devices failed:', error);
    return [];
  }
};

export const tryCaptureRgb32ToRawWithNative = (
  deviceIndex: number,
  width: number,
  height: number,
  fps: number,
  frameCount: number,
  outputPath: string,
): { path?: string; error?: string } => {
  const binding = loadBinding();
  if (!binding) {
    return { error: 'Native binding not loaded' };
  }

  try {
    if (typeof binding.mfCaptureRgb32ToRaw === 'function') {
      const path = binding.mfCaptureRgb32ToRaw(
        deviceIndex,
        width,
        height,
        fps,
        frameCount,
        outputPath,
      ) as string;
      return { path };
    }
    if (typeof binding.mf_capture_rgb32_to_raw === 'function') {
      const path = binding.mf_capture_rgb32_to_raw(
        deviceIndex,
        width,
        height,
        fps,
        frameCount,
        outputPath,
      ) as string;
      return { path };
    }
    return { error: 'Native capture function not found' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('⚠️ [MFEncoder] Capture RGB32 failed:', error);
    return { error: message };
  }
};
