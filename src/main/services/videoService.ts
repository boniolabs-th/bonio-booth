import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// @ts-ignore
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

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
      '[0:v]reverse,fifo[r];[0:v][r]concat=n=2:v=1:a=0,scale=1080:-2,setsar=1',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y', // Overwrite output file
      output,
    ];

    const ffmpeg = spawn(ffmpegPath.path, args);

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
      '[0:v]reverse,fifo[r];[0:v][r]concat=n=2:v=1:a=0,scale=720:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop',
      '0', // Infinite loop
      '-y',
      output,
    ];

    const ffmpeg = spawn(ffmpegPath.path, args);

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

    const ffmpeg = spawn(ffmpegPath.path, args);

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

    // Use relative path from project root - simpler for FFmpeg
    const relativeLutPath = `assets/filters/${lutFileName}`;

    const args = [
      '-i',
      inputVideoPath,
      '-vf',
      `lut3d=${relativeLutPath}`,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ];

    const ffmpeg = spawn(ffmpegPath.path, args);

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

    // Use relative path from project root - simpler for FFmpeg
    const relativeLutPath = `assets/filters/${lutFileName}`;

    // Combine boomerang + LUT in one pass for better performance
    const args = [
      '-i',
      inputVideoPath,
      '-filter_complex',
      `[0:v]reverse,fifo[r];[0:v][r]concat=n=2:v=1:a=0,scale=1080:-2,setsar=1,lut3d=${relativeLutPath}[v]`,
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ];

    const ffmpeg = spawn(ffmpegPath.path, args);

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
 */
export const convertWebmToMp4 = async (
  inputVideoPath: string,
  outputPath?: string,
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
    const args = [
      '-i',
      inputVideoPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast', // Good balance between speed and compression
      '-crf',
      '20', // Lower = better quality (18-22 is good for web, 23+ causes visible artifacts)
      '-pix_fmt',
      'yuv420p', // Required for iPhone compatibility
      '-an', // No audio (WebM from canvas usually has no audio track)
      '-movflags',
      '+faststart', // Enable fast start for web playback
      '-y', // Overwrite output file
      output,
    ];

    console.log('🎬 [VideoService] Converting WebM to MP4 with args:', args.join(' '));

    const ffmpeg = spawn(ffmpegPath.path, args);

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
 */
export const convertWebmToMp4Base64 = async (
  inputVideoPath: string,
): Promise<string> => {
  const mp4Path = await convertWebmToMp4(inputVideoPath);
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
