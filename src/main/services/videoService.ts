import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

let activeRecordingProcess: ChildProcess | null = null;

/**
 * Get FFmpeg binary path that works in both development and production (packed app)
 * In production, asar archive is unpacked to app.asar.unpacked folder
 */
const getFFmpegPath = (): string => {
  let ffmpegPath = ffmpegInstaller.path;

  // In production (packed app), the path points to inside app.asar
  // But we unpacked ffmpeg using asarUnpack, so we need to use app.asar.unpacked
  if (app.isPackaged && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }

  return ffmpegPath;
};

/**
 * Creates a boomerang effect video using FFmpeg
 * Much faster than browser-based GIF creation
 */
export const createBoomerangVideo = async (
  inputVideoPath: string,
  outputPath?: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log('========== createBoomerangVideo ==========');
    // Generate output path if not provided
    const output =
      outputPath ||
      path.join(
        app.getPath('temp'),
        `boomerang-${Date.now()}.mp4`,
      );

    // FFmpeg command to create boomerang effect:
    // 1. Create a reversed copy of the video
    // 2. Concatenate original + reversed
    // 3. Scale to reasonable size for performance
    // 4. Use fast encoding preset
    const args = [
      '-i',
      inputVideoPath,
      '-filter_complex',
      '[0:v]fps=30,reverse,fifo[r];[0:v]fps=30[o];[o][r]concat=n=2:v=1:a=0,scale=1080:-2,setsar=1',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-r',
      '30',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ];

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Check if file was created
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`,
          ),
        );
      }
    });
  });
};

/**
 * Creates a looping boomerang GIF using FFmpeg
 * Alternative to video if GIF format is required
 */
export const createBoomerangGif = async (
  inputVideoPath: string,
  outputPath?: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const output =
      outputPath ||
      path.join(
        app.getPath('temp'),
        `boomerang-${Date.now()}.gif`,
      );

    // Create high-quality boomerang GIF with palette optimization
    console.log('==========================createBoomerangGif==========================');
    const args = [
      '-i',
      inputVideoPath,
      '-filter_complex',
      '[0:v]fps=15,reverse,fifo[r];[0:v]fps=15[o];[o][r]concat=n=2:v=1:a=0,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop',
      '0', // Infinite loop
      '-y',
      output,
    ];

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`,
          ),
        );
      }
    });
  });
};

/**
 * Extract specific number of frames from video for preview
 */
export const extractFrames = async (
  inputVideoPath: string,
  frameCount: number = 12,
  outputDir?: string,
): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const tempDir =
      outputDir ||
      path.join(
        app.getPath('temp'),
        `frames-${Date.now()}`,
      );

    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputPattern = path.join(tempDir, 'frame-%03d.jpg');
    console.log('==========================extractFrames==========================');
    // Extract frames at even intervals
    const args = [
      '-i',
      inputVideoPath,
      '-vf',
      `select='not(mod(n\\,${Math.floor(30 / frameCount)}))',scale=640:-2`,
      '-vsync',
      'vfr',
      '-frames:v',
      frameCount.toString(),
      '-q:v',
      '2',
      outputPattern,
    ];

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Read extracted frames
        const files = fs
          .readdirSync(tempDir)
          .filter((f) => f.startsWith('frame-'))
          .sort()
          .map((f) => path.join(tempDir, f));

        if (files.length > 0) {
          resolve(files);
        } else {
          reject(new Error('No frames were extracted'));
        }
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`,
          ),
        );
      }
    });
  });
};

/**
 * Convert extracted frames to data URLs for browser display
 */
export const framesToDataUrls = async (
  framePaths: string[],
): Promise<string[]> => {
  return Promise.all(
    framePaths.map(async (framePath) => {
      const buffer = await fs.promises.readFile(framePath);
      const base64 = buffer.toString('base64');
      return `data:image/jpeg;base64,${base64}`;
    }),
  );
};

/**
 * Get absolute path to LUT file in assets
 */
const getLUTPath = (lutFileName: string): string => {
  if (app.isPackaged) {
    // Production: assets are in resources folder
    return path.join(process.resourcesPath, 'assets', 'filters', lutFileName);
  }

  // Development: use app.getAppPath() to get project root
  const appPath = app.getAppPath(); // This returns the project root in development
  const lutPath = path.join(appPath, 'assets', 'filters', lutFileName);

  return lutPath;
};

/**
 * Apply .cube LUT to video using FFmpeg
 */
export const applyLutToVideo = async (
  inputVideoPath: string,
  lutFileName: string,
  outputPath?: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const lutPath = getLUTPath(lutFileName);

    if (!fs.existsSync(lutPath)) {
      reject(new Error(`LUT file not found: ${lutPath}`));
      return;
    }

    const output =
      outputPath ||
      path.join(app.getPath('temp'), `lut-applied-${Date.now()}.mp4`);

    // Copy LUT file to temp directory and use simple filename
    // This avoids path escaping issues with FFmpeg on Windows
    const tempLutPath = path.join(app.getPath('temp'), lutFileName);
    try {
      fs.copyFileSync(lutPath, tempLutPath);
    } catch (err) {
      reject(new Error(`Failed to copy LUT file: ${err}`));
      return;
    }

    // Get input video duration first using ffprobe-like approach
    // Since WebM from MediaRecorder often has incorrect duration,
    // we'll process the entire input without duration limit
    console.log('==========================applyLutToVideo==========================');
    const args = [
      '-i',
      inputVideoPath,
      '-vf',
      `lut3d=${lutFileName}`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-r',
      '30',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-vsync',
      'cfr',
      '-y',
      output,
    ];

    // Run FFmpeg from temp directory so it can find the LUT file
    const ffmpeg = spawn(getFFmpegPath(), args, {
      cwd: app.getPath('temp'),
    });

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        reject(
          new Error(`FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`),
        );
      }
    });
  });
};

/**
 * Create boomerang with LUT applied
 */
export const createBoomerangWithLut = async (
  inputVideoPath: string,
  lutFileName: string,
  outputPath?: string,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const lutPath = getLUTPath(lutFileName);

    if (!fs.existsSync(lutPath)) {
      reject(new Error(`LUT file not found: ${lutPath}`));
      return;
    }

    const output =
      outputPath ||
      path.join(app.getPath('temp'), `boomerang-lut-${Date.now()}.mp4`);

    // Combine boomerang + LUT in one pass for better performance
    // Copy LUT file to temp directory and use simple filename
    // This avoids path escaping issues with FFmpeg on Windows
    const tempLutPath = path.join(app.getPath('temp'), lutFileName);
    try {
      fs.copyFileSync(lutPath, tempLutPath);
    } catch (err) {
      reject(new Error(`Failed to copy LUT file: ${err}`));
      return;
    }
    console.log('==========================createBoomerangWithLut==========================');
    const args = [
      '-i',
      inputVideoPath,
      '-filter_complex',
      `[0:v]fps=30,reverse,fifo[r];[0:v]fps=30[o];[o][r]concat=n=2:v=1:a=0,scale=1080:-2,setsar=1,lut3d=${lutFileName}[v]`,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-r',
      '30',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ];

    // Run FFmpeg from temp directory so it can find the LUT file
    const ffmpeg = spawn(getFFmpegPath(), args, {
      cwd: app.getPath('temp'),
    });

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        reject(
          new Error(`FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`),
        );
      }
    });
  });
};

/**
 * Cleanup temporary files
 */
export const cleanupTempFiles = async (filePaths: string[]): Promise<void> => {
  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          const stat = await fs.promises.stat(filePath);
          if (stat.isDirectory()) {
            await fs.promises.rm(filePath, { recursive: true });
          } else {
            await fs.promises.unlink(filePath);
          }
        }
      } catch (error) {
        console.error(`Failed to cleanup ${filePath}:`, error);
      }
    }),
  );
};

/**
 * Convert WebM video to MP4 (H.264) for iPhone/Safari compatibility
 * iPhone/Safari does not support WebM format, so we need to convert to MP4
 * @param inputVideoPath - Path to input WebM file
 * @param outputPath - Optional output path
 * @param targetDuration - Optional target duration in seconds (default: 9)
 */
export const convertWebmToMp4 = async (
  inputVideoPath: string,
  outputPath?: string,
  targetDuration: number = 9,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const output =
      outputPath ||
      path.join(
        app.getPath('temp'),
        `converted-${Date.now()}.mp4`,
      );

    // FFmpeg command to convert WebM to MP4 (H.264)
    // WebM from MediaRecorder has color issues
    // Try hue filter to adjust colors
    console.log('==========================convertWebmToMp4==========================');
    const args = [
      '-i',
      inputVideoPath,
      '-t',
      String(targetDuration),
      // Adjust hue to fix color shift
      '-vf',
      // 'hue=h=350:s=1',
      'hue=h=-10:s=1',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '15',
      '-r',
      '30',
      '-vsync',
      'cfr',
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ];

    console.log('Converting WebM to MP4 with FFmpeg args:', args);

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(output)) {
          resolve(output);
        } else {
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}\nOutput: ${stderrOutput}`,
          ),
        );
      }
    });
  });
};

/**
 * Convert WebM to MP4 and return as Base64 data URL
 * Useful for direct embedding or download
 * @param inputVideoPath - Path to input WebM file
 * @param targetDuration - Optional target duration in seconds (default: 9)
 */
export const convertWebmToMp4Base64 = async (
  inputVideoPath: string,
  targetDuration: number = 9,
): Promise<string> => {
  const mp4Path = await convertWebmToMp4(inputVideoPath, undefined, targetDuration);
  const buffer = await fs.promises.readFile(mp4Path);
  const base64 = buffer.toString('base64');

  // Cleanup temp mp4 file
  try {
    await fs.promises.unlink(mp4Path);
  } catch (error) {
    console.error('Failed to cleanup temp MP4 file:', error);
  }

  return `data:video/mp4;base64,${base64}`;
};

/**
 * List available DirectShow video devices
 */
export const listVideoDevices = async (): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    // Command: ffmpeg -list_devices true -f dshow -i dummy
    const args = ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'];
    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('close', () => {
      // Parse output for video devices
      // Output format example:
      // [dshow @ ...] DirectShow video devices (some may be both video and audio devices)
      // [dshow @ ...]  "Integrated Camera"
      // [dshow @ ...]     Alternative name "@device_pnp_..."

      const devices: string[] = [];
      const lines = stderrOutput.split('\n');
      let inVideoSection = false;

      for (const line of lines) {
        if (line.includes('DirectShow video devices')) {
          inVideoSection = true;
          continue;
        }
        if (line.includes('DirectShow audio devices')) {
          inVideoSection = false;
          continue;
        }

        if (inVideoSection) {
          // Match lines starting with [dshow @ ...]  "Device Name"
          // We look for quotes after the [dshow] prefix
          const match = line.match(/\[dshow @ [^\]]+\]\s+"([^"]+)"/);
          if (match && match[1]) {
             // Exclude "Alternative name" lines
             if (!line.includes('Alternative name')) {
               devices.push(match[1]);
             }
          }
        }
      }

      resolve(devices);
    });

    // The command always fails with "dummy: Immediate exit requested", so we rely on stderr parsing in 'close'
  });
};

/**
 * Start recording from a DirectShow video device
 */
export const startRecordingCallback = (
  deviceName: string,
  outputPath: string,
  options: { saturation?: number; contrast?: number; brightness?: number; gamma?: number } = {}
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (activeRecordingProcess) {
      reject(new Error('Recording is already in progress'));
      return;
    }

    const {
      saturation = 1.7,   // High saturation for deep colors
      contrast = 1.3,     // High contrast for punchy look
      brightness = -0.08, // Reduce brightness to fix washout
      gamma = 0.8         // Lower gamma for richer midtones
    } = options;

    // Filter string for color correction
    // brightness: -1.0 to 1.0 (default 0)
    // gamma: 0.1 to 10.0 (default 1)
    const vf = `eq=saturation=${saturation}:contrast=${contrast}:brightness=${brightness}:gamma=${gamma},format=yuv420p`;

    const args = [
      '-f', 'dshow',
      '-i', `video=${deviceName}`,
      '-c:v', 'libx264',
      '-preset', 'ultrafast', // Low CPU usage for real-time
      '-tune', 'zerolatency',
      '-vf', vf,
      '-y',
      outputPath
    ];

    console.log(`Starting recording with args: ${args.join(' ')}`);

    activeRecordingProcess = spawn(getFFmpegPath(), args);

    activeRecordingProcess.stderr!.on('data', (data) => {
      // console.log(`FFmpeg Rec: ${data}`); // Optional: Log ffmpeg output
    });

    activeRecordingProcess.on('error', (err) => {
      console.error('FFmpeg recording start error:', err);
      activeRecordingProcess = null;
      reject(err);
    });

    // We consider it started if it doesn't crash immediately (e.g. within 500ms)
    // But since it's async process, we just resolve immediately and handle errors via events if needed
    // Better: wait a bit to ensure it started
    setTimeout(() => {
        if (activeRecordingProcess && activeRecordingProcess.exitCode === null) {
            resolve();
        } else {
            reject(new Error('Process exited immediately (check device name)'));
        }
    }, 1000);
  });
};

/**
 * Stop the current recording
 */
export const stopRecordingCallback = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!activeRecordingProcess) {
      resolve(); // Nothing to stop
      return;
    }

    const proc = activeRecordingProcess;
    activeRecordingProcess = null; // Clear reference immediately

    proc.on('close', (code) => {
      console.log(`Recording process exited with code ${code}`);
      resolve();
    });

    // Send 'q' to stdin to stop gracefully
    if (proc.stdin) {
        try {
            proc.stdin.write('q');
        } catch (err) {
            console.warn("Could not write 'q' to stdin, killing process...", err);
            proc.kill(); // Fallback
        }
    } else {
        proc.kill();
    }
  });
};
