/**
 * Native Camera Service
 *
 * Architecture (Single Source of Truth):
 *   Camera
 *     ↓
 *   FFmpeg (dshow)
 *     ├─ pipe → raw frames → Electron (Live View)
 *     └─ encode → MP4/JPEG (Record / Capture)
 *
 * Benefits:
 * - FFmpeg handles all camera access (no getUserMedia in renderer)
 * - Consistent colorspace (BT.709 contract)
 * - Direct MP4 encoding (no WebM → MP4 conversion)
 * - JPEG capture with proper quality
 * - Low latency live view via raw frame pipe
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow } from 'electron';

// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

/**
 * Get FFmpeg binary path that works in both development and production
 */
const getFFmpegPath = (): string => {
  let ffmpegPath = ffmpegInstaller.path;
  if (app.isPackaged && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
};

// ============================================================================
// State Management
// ============================================================================

/** Active live view process */
let liveViewProcess: ChildProcess | null = null;

/** Active recording process */
let recordingProcess: ChildProcess | null = null;

/** Current device name */
let currentDeviceName: string | null = null;

/** Frame listeners for live view */
const frameListeners: Set<(frameData: string) => void> = new Set();

/** Is live view active */
let isLiveViewActive = false;

/** Is recording active */
let isRecordingActive = false;

/** Current recording output path */
let currentRecordingPath: string | null = null;

// ============================================================================
// Live View - FFmpeg pipes raw frames to Electron
// ============================================================================

interface LiveViewOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  quality?: number; // JPEG quality 1-31 (lower = better)
}

/**
 * Start live view from camera
 * FFmpeg reads from dshow and pipes JPEG frames to stdout
 */
export const startLiveView = (
  deviceName: string,
  options: LiveViewOptions = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (liveViewProcess) {
      reject(new Error('Live view is already running'));
      return;
    }

    const {
      width = 1280,
      height = 720,
      frameRate = 30,
      quality = 5, // JPEG quality (1-31, lower = better quality)
    } = options;

    currentDeviceName = deviceName;

    // FFmpeg command:
    // Read from dshow → scale → output MJPEG frames to pipe
    // Using image2pipe to get individual JPEG frames
    const args = [
      // Input from DirectShow
      '-f', 'dshow',
      '-video_size', `${width}x${height}`,
      '-framerate', `${frameRate}`,
      '-i', `video=${deviceName}`,
      // Video filters for quality
      '-vf', 'format=yuvj420p',
      // Output as MJPEG to pipe
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', `${quality}`,
      '-an', // No audio
      'pipe:1', // Output to stdout
    ];

    console.log(`🎥 [NativeCamera] Starting live view: ${args.join(' ')}`);

    liveViewProcess = spawn(getFFmpegPath(), args);

    let startupError = '';

    // Handle JPEG frames from stdout
    let buffer = Buffer.alloc(0);
    const JPEG_START = Buffer.from([0xff, 0xd8]);
    const JPEG_END = Buffer.from([0xff, 0xd9]);

    liveViewProcess.stdout?.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Find complete JPEG frames
      while (true) {
        const startIdx = buffer.indexOf(JPEG_START);
        if (startIdx === -1) break;

        const endIdx = buffer.indexOf(JPEG_END, startIdx + 2);
        if (endIdx === -1) break;

        // Extract complete JPEG frame
        const jpegData = buffer.subarray(startIdx, endIdx + 2);
        buffer = buffer.subarray(endIdx + 2);

        // Convert to base64 data URL
        const base64 = jpegData.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        // Notify all listeners
        frameListeners.forEach(listener => {
          try {
            listener(dataUrl);
          } catch (err) {
            console.error('Frame listener error:', err);
          }
        });
      }

      // Prevent buffer from growing too large
      if (buffer.length > 10 * 1024 * 1024) {
        console.warn('⚠️ [NativeCamera] Buffer too large, trimming...');
        const lastStart = buffer.lastIndexOf(JPEG_START);
        if (lastStart > 0) {
          buffer = buffer.subarray(lastStart);
        }
      }
    });

    liveViewProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!isLiveViewActive) {
        startupError += msg;
      }
      // Log errors but don't spam
      if (msg.includes('Error') || msg.includes('error')) {
        console.error(`⚠️ [NativeCamera] FFmpeg: ${msg.trim()}`);
      }
    });

    liveViewProcess.on('error', (err) => {
      console.error('❌ [NativeCamera] Process error:', err);
      liveViewProcess = null;
      isLiveViewActive = false;
      if (!isLiveViewActive) {
        reject(err);
      }
    });

    liveViewProcess.on('close', (code) => {
      console.log(`🎥 [NativeCamera] Live view process exited with code ${code}`);
      liveViewProcess = null;
      isLiveViewActive = false;
    });

    // Wait a bit to ensure it started
    setTimeout(() => {
      if (liveViewProcess && liveViewProcess.exitCode === null) {
        isLiveViewActive = true;
        console.log('✅ [NativeCamera] Live view started successfully');
        resolve();
      } else {
        reject(new Error(`Failed to start live view: ${startupError}`));
      }
    }, 1000);
  });
};

/**
 * Stop live view
 */
export const stopLiveView = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!liveViewProcess) {
      resolve();
      return;
    }

    const proc = liveViewProcess;
    liveViewProcess = null;
    isLiveViewActive = false;

    proc.on('close', () => {
      console.log('🎥 [NativeCamera] Live view stopped');
      resolve();
    });

    // Send 'q' to stop gracefully
    if (proc.stdin) {
      try {
        proc.stdin.write('q');
      } catch (err) {
        proc.kill('SIGTERM');
      }
    } else {
      proc.kill('SIGTERM');
    }

    // Force kill after timeout
    setTimeout(() => {
      if (proc && proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    }, 2000);
  });
};

/**
 * Add frame listener for live view
 */
export const addFrameListener = (listener: (frameData: string) => void): void => {
  frameListeners.add(listener);
};

/**
 * Remove frame listener
 */
export const removeFrameListener = (listener: (frameData: string) => void): void => {
  frameListeners.delete(listener);
};

/**
 * Get live view status
 */
export const getLiveViewStatus = (): { active: boolean; deviceName: string | null } => {
  return {
    active: isLiveViewActive,
    deviceName: currentDeviceName,
  };
};

// ============================================================================
// Recording - FFmpeg encodes directly to MP4
// ============================================================================

interface RecordingOptions {
  width?: number;
  height?: number;
  frameRate?: number;
  duration?: number; // Max duration in seconds (0 = unlimited)
  // Color correction
  saturation?: number;
  contrast?: number;
  brightness?: number;
  gamma?: number;
}

/**
 * Start recording from camera to MP4 file
 * Uses BT.709 colorspace contract for consistent colors
 */
export const startRecording = (
  deviceName: string,
  outputPath: string,
  options: RecordingOptions = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (recordingProcess) {
      reject(new Error('Recording is already in progress'));
      return;
    }

    const {
      width = 1920,
      height = 1080,
      frameRate = 30,
      duration = 0,
      saturation = 1.7,
      contrast = 1.3,
      brightness = -0.08,
      gamma = 0.8,
    } = options;

    currentRecordingPath = outputPath;

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Video filter for color correction
    const vf = `eq=saturation=${saturation}:contrast=${contrast}:brightness=${brightness}:gamma=${gamma},format=yuv420p`;

    // FFmpeg command for recording
    const args = [
      // Input from DirectShow
      '-f', 'dshow',
      '-video_size', `${width}x${height}`,
      '-framerate', `${frameRate}`,
      '-i', `video=${deviceName}`,
      // Duration limit (if set)
      ...(duration > 0 ? ['-t', `${duration}`] : []),
      // Video filter
      '-vf', vf,
      // BT.709 Colorspace Contract (guideVideo.md Section 7)
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      // Encoding settings
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-r', `${frameRate}`,
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an', // No audio
      '-y',
      outputPath,
    ];

    console.log(`🔴 [NativeCamera] Starting recording: ${deviceName} → ${outputPath}`);

    recordingProcess = spawn(getFFmpegPath(), args);

    let startupError = '';

    recordingProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (!isRecordingActive) {
        startupError += msg;
      }
    });

    recordingProcess.on('error', (err) => {
      console.error('❌ [NativeCamera] Recording error:', err);
      recordingProcess = null;
      isRecordingActive = false;
      reject(err);
    });

    recordingProcess.on('close', (code) => {
      console.log(`🔴 [NativeCamera] Recording process exited with code ${code}`);
      recordingProcess = null;
      isRecordingActive = false;
    });

    // Wait a bit to ensure it started
    setTimeout(() => {
      if (recordingProcess && recordingProcess.exitCode === null) {
        isRecordingActive = true;
        console.log('✅ [NativeCamera] Recording started');
        resolve();
      } else {
        reject(new Error(`Failed to start recording: ${startupError}`));
      }
    }, 1000);
  });
};

/**
 * Stop recording and return the output file path
 */
export const stopRecording = (): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!recordingProcess) {
      resolve(null);
      return;
    }

    const proc = recordingProcess;
    const outputPath = currentRecordingPath;
    recordingProcess = null;
    currentRecordingPath = null;
    isRecordingActive = false;

    proc.on('close', () => {
      console.log(`✅ [NativeCamera] Recording stopped: ${outputPath}`);
      resolve(outputPath);
    });

    // Send 'q' to stop gracefully (this finalizes the MP4 file)
    if (proc.stdin) {
      try {
        proc.stdin.write('q');
      } catch (err) {
        console.warn('Could not write q to stdin, killing process');
        proc.kill('SIGINT');
      }
    } else {
      proc.kill('SIGINT');
    }

    // Force kill after timeout
    setTimeout(() => {
      if (proc && proc.exitCode === null) {
        proc.kill('SIGKILL');
        resolve(outputPath);
      }
    }, 5000);
  });
};

/**
 * Get recording status
 */
export const getRecordingStatus = (): {
  active: boolean;
  outputPath: string | null;
} => {
  return {
    active: isRecordingActive,
    outputPath: currentRecordingPath,
  };
};

// ============================================================================
// Capture - Single JPEG frame from camera
// ============================================================================

interface CaptureOptions {
  width?: number;
  height?: number;
  quality?: number; // JPEG quality 1-100
}

/**
 * Capture a single JPEG frame from camera
 * Returns base64 data URL
 */
export const captureFrame = (
  deviceName: string,
  options: CaptureOptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const {
      width = 1920,
      height = 1080,
      quality = 95,
    } = options;

    // Convert quality 1-100 to FFmpeg's 1-31 scale (inverted)
    const ffmpegQuality = Math.max(1, Math.min(31, Math.round(31 - (quality / 100) * 30)));

    // FFmpeg command to capture single frame
    const args = [
      '-f', 'dshow',
      '-video_size', `${width}x${height}`,
      '-i', `video=${deviceName}`,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', `${ffmpegQuality}`,
      'pipe:1',
    ];

    console.log(`📸 [NativeCamera] Capturing frame from ${deviceName}`);

    const process = spawn(getFFmpegPath(), args);

    const chunks: Buffer[] = [];

    process.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    let stderrOutput = '';
    process.stderr?.on('data', (data) => {
      stderrOutput += data.toString();
    });

    process.on('error', (err) => {
      reject(new Error(`Capture error: ${err.message}`));
    });

    process.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        console.log(`✅ [NativeCamera] Frame captured (${buffer.length} bytes)`);
        resolve(dataUrl);
      } else {
        reject(new Error(`Capture failed with code ${code}: ${stderrOutput}`));
      }
    });
  });
};

/**
 * Capture frame to file
 */
export const captureFrameToFile = (
  deviceName: string,
  outputPath: string,
  options: CaptureOptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const {
      width = 1920,
      height = 1080,
      quality = 95,
    } = options;

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert quality 1-100 to FFmpeg's 1-31 scale (inverted)
    const ffmpegQuality = Math.max(1, Math.min(31, Math.round(31 - (quality / 100) * 30)));

    const args = [
      '-f', 'dshow',
      '-video_size', `${width}x${height}`,
      '-i', `video=${deviceName}`,
      '-frames:v', '1',
      '-q:v', `${ffmpegQuality}`,
      '-y',
      outputPath,
    ];

    console.log(`📸 [NativeCamera] Capturing to file: ${outputPath}`);

    const process = spawn(getFFmpegPath(), args);

    let stderrOutput = '';
    process.stderr?.on('data', (data) => {
      stderrOutput += data.toString();
    });

    process.on('error', (err) => {
      reject(new Error(`Capture error: ${err.message}`));
    });

    process.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`✅ [NativeCamera] Frame saved to ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error(`Capture failed with code ${code}: ${stderrOutput}`));
      }
    });
  });
};

// ============================================================================
// Combined Live View + Recording (Simultaneous)
// ============================================================================

// Using tee filter, we can do both live view and recording simultaneously
// But for simplicity, we'll use separate processes for now
// The camera can be accessed by multiple processes on most systems

/**
 * Start live view and recording simultaneously
 * Note: This starts two separate FFmpeg processes
 * On Windows, dshow allows multiple consumers for the same device
 */
export const startLiveViewAndRecording = async (
  deviceName: string,
  recordingPath: string,
  liveViewOptions: LiveViewOptions = {},
  recordingOptions: RecordingOptions = {}
): Promise<void> => {
  // First start live view
  await startLiveView(deviceName, liveViewOptions);

  // Then start recording
  try {
    await startRecording(deviceName, recordingPath, recordingOptions);
  } catch (err) {
    // If recording fails, stop live view too
    await stopLiveView();
    throw err;
  }
};

/**
 * Stop both live view and recording
 */
export const stopAll = async (): Promise<{ recordingPath: string | null }> => {
  const recordingPath = await stopRecording();
  await stopLiveView();
  return { recordingPath };
};

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup all processes (call on app quit)
 */
export const cleanup = async (): Promise<void> => {
  console.log('🧹 [NativeCamera] Cleaning up...');
  await stopAll();
  frameListeners.clear();
};
