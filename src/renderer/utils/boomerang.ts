import * as gifshot from 'gifshot';

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
  const context = canvas.getContext('2d', { willReadFrequently: true });

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
        frames.push(canvas.toDataURL('image/jpeg', 0.9));
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

const createBoomerangGifFromFrames = async (
  frames: string[],
  width: number,
  height: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    gifshot.createGIF(
      {
        images: frames,
        gifWidth: width,
        gifHeight: height,
        interval: DEFAULT_INTERVAL_SECONDS,
        frameDuration: 1,
        numFrames: frames.length,
        sampleInterval: 7,
        numWorkers: 2,
        crossOrigin: 'Anonymous',
      },
      (obj) => {
        if (!obj.error && obj.image) {
          resolve(obj.image);
        } else {
          reject(new Error(obj.errorMsg || 'Failed to create boomerang GIF'));
        }
      },
    );
  });
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
