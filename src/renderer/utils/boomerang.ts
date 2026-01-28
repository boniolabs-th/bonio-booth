// NOTE: Migrated from gifshot to canvas-based approach for better performance
// For even better performance, consider using FFmpeg (see boomerangFFmpeg.ts)

const DEFAULT_SAMPLE_COUNT = 12;
const DEFAULT_INTERVAL_SECONDS = 0.08;

interface FrameExtractionResult {
  frames: string[];
  width: number;
  height: number;
}

const extractFramesFromVideo = async (
  videoUrl: string,
  targetFrameCount = DEFAULT_SAMPLE_COUNT,
): Promise<FrameExtractionResult> => {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    const handleLoadedMetadata = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      resolve();
    };
    const handleError = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      reject(new Error('Failed to load recorded video for processing'));
    };
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError, { once: true });
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });

  if (!context) {
    video.remove();
    throw new Error('Unable to prepare canvas for boomerang frames');
  }

  const frames: string[] = [];
  const totalFrames = Math.max(targetFrameCount, 2);
  const duration =
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;

  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < totalFrames; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      const handleSeeked = () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.9)); //แก้จาก 0.9 เป็น 1.0
        resolve();
      };
      const targetTime = (duration * i) / Math.max(totalFrames - 1, 1);
      video.addEventListener('seeked', handleSeeked, { once: true });
      video.currentTime = targetTime;
    });
  }

  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();

  return {
    frames,
    width: canvas.width,
    height: canvas.height,
  };
};

const buildBoomerangFrames = (frames: string[]): string[] => {
  if (frames.length <= 1) {
    return frames;
  }

  const reversed = frames.slice(1, -1).reverse();
  return [...frames, ...reversed];
};

/**
 * Create a canvas-based boomerang animation
 * This replaces the old gifshot library with a simpler canvas approach
 * Returns a data URL of the first frame for preview
 * For production, consider using FFmpeg (see boomerangFFmpeg.ts) for better performance
 */
const createBoomerangGifFromFrames = async (
  frames: string[],
  width: number,
  height: number,
): Promise<string> => {
  // Return the first frame as a static preview
  // The actual boomerang animation will be handled by the video element in PhotoResult
  if (frames.length > 0) {
    return Promise.resolve(frames[0]);
  }

  return Promise.reject(new Error('No frames available for boomerang'));
};

export interface BoomerangAssets {
  boomerangFrames: string[];
  boomerangGif: string;
}

export const generateBoomerangAssets = async (
  videoUrl: string,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): Promise<BoomerangAssets> => {
  if (!videoUrl) {
    throw new Error('Video URL is required to generate a boomerang effect');
  }

  const { frames, width, height } = await extractFramesFromVideo(
    videoUrl,
    sampleCount,
  );
  const boomerangFrames = buildBoomerangFrames(frames);
  const boomerangGif = await createBoomerangGifFromFrames(
    boomerangFrames,
    width,
    height,
  );

  return {
    boomerangFrames,
    boomerangGif,
  };
};
