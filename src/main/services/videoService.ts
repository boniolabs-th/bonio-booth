import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// @ts-ignore
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

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

  console.log('🎬 [VideoService] FFmpeg path:', ffmpegPath);
  console.log('🎬 [VideoService] FFmpeg exists:', fs.existsSync(ffmpegPath));

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
      '20',
      '-r',
      '30', // Force 30fps output
      '-pix_fmt',
      'yuv420p',
      // Color space settings - Force BT.709 (sRGB compatible) to prevent color shift
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
      '-y', // Overwrite output file
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

    console.log('🎨 [VideoService] Applying LUT from temp:', tempLutPath);

    // Get input video duration first using ffprobe-like approach
    // Since WebM from MediaRecorder often has incorrect duration,
    // we'll process the entire input without duration limit
    const args = [
      '-i',
      inputVideoPath,
      '-vf',
      `lut3d=${lutFileName}`,
      '-c:v',
      'libx264',
      '-preset',
      'slow', // Better quality encoding (slower but sharper)
      '-crf',
      '16', // Higher quality (lower = better, 16 is very good)
      '-maxrate',
      '12M', // Higher bitrate for better quality
      '-bufsize',
      '24M', // Buffer size for rate control
      '-r',
      '30', // Force 30fps output
      '-pix_fmt',
      'yuv420p',
      // Color space settings - Force BT.709 (sRGB compatible) to prevent color shift
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
      '-vsync',
      'cfr', // Constant frame rate to ensure consistent duration
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

    console.log('🎨 [VideoService] Creating boomerang with LUT from temp:', tempLutPath);

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
      '20',
      '-r',
      '30', // Force 30fps output
      '-pix_fmt',
      'yuv420p',
      // Color space settings - Force BT.709 (sRGB compatible) to prevent color shift
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
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
    // - libx264: Most compatible codec for all devices including iPhone
    // - an: No audio (WebM from canvas recording usually has no audio)
    // - movflags +faststart: Optimize for web streaming
    // - t: Force exact output duration
    // - color settings: Force BT.709 (sRGB) color space to prevent color shift
    const args = [
      '-i',
      inputVideoPath,
      '-t',
      String(targetDuration), // Force exact output duration (9 seconds)
      '-c:v',
      'libx264',
      '-preset',
      'slow', // Better quality encoding (slower but sharper)
      '-crf',
      '16', // Higher quality (lower = better, 16 is very good)
      '-maxrate',
      '12M', // Higher bitrate for better quality
      '-bufsize',
      '24M', // Buffer size for rate control
      '-r',
      '30', // Force 30fps output (WebM from canvas has variable fps)
      '-vsync',
      'cfr', // Constant frame rate - preserve original duration
      '-pix_fmt',
      'yuv420p', // Required for iPhone compatibility
      // Color space settings - Force BT.709 (sRGB compatible) to prevent color shift
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv', // Limited range (16-235) - standard for video
      '-an', // No audio (WebM from canvas usually has no audio track)
      '-movflags',
      '+faststart', // Enable fast start for web playback
      '-y', // Overwrite output file
      output,
    ];

    console.log('🎬 [VideoService] Converting WebM to MP4 with args:', args.join(' '));

    const ffmpeg = spawn(getFFmpegPath(), args);

    let stderrOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on('error', (error) => {
      console.error('❌ [VideoService] FFmpeg process error:', error.message);
      reject(new Error(`FFmpeg process error: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        if (fs.existsSync(output)) {
          console.log('✅ [VideoService] MP4 conversion successful:', output);
          resolve(output);
        } else {
          console.error('❌ [VideoService] FFmpeg completed but output file not found');
          reject(new Error('FFmpeg completed but output file not found'));
        }
      } else {
        console.error(`❌ [VideoService] FFmpeg exited with code ${code}:`, stderrOutput);
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
