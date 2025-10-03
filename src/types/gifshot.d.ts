declare module 'gifshot' {
  export interface GifShotOptions {
    images?: string[];
    video?: HTMLVideoElement | string;
    webcamVideoElement?: HTMLVideoElement;
    cameraStream?: MediaStream;
    keepCameraOn?: boolean;
    gifWidth?: number;
    gifHeight?: number;
    interval?: number;
    numFrames?: number;
    frameDuration?: number;
    fontWeight?: string;
    fontSize?: string;
    fontFamily?: string;
    fontColor?: string;
    textAlign?: string;
    textBaseline?: string;
    sampleInterval?: number;
    numWorkers?: number;
    filter?: string;
    waterMark?: string;
    waterMarkHeight?: number;
    waterMarkWidth?: number;
    waterMarkXCoordinate?: number;
    waterMarkYCoordinate?: number;
    progressCallback?: (captureProgress: number) => void;
    completeCallback?: () => void;
    savedCallback?: (blob: Blob) => void;
    saveRenderingContexts?: boolean;
    crossOrigin?: string;
  }

  export function createGIF(
    options: GifShotOptions,
    callback?: (obj: {
      image: string;
      error?: boolean;
      errorCode?: string;
      errorMsg?: string;
    }) => void,
  ): void;

  export function takeSnapShot(
    options: GifShotOptions,
    callback?: (obj: {
      image: string;
      error?: boolean;
      errorCode?: string;
      errorMsg?: string;
    }) => void,
  ): void;
}
