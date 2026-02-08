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
    // 5. Apply BT.709 colorspace contract (guideVideo.md)
    const args = [
      // 1. ใส่ -fflags +genpts ไว้ข้างหน้าสุด เพื่อบังคับให้สร้าง Timestamp ใหม่ตั้งแต่ต้น
      '-fflags', '+genpts+igndts',
      '-i',
      inputVideoPath,
      '-filter_complex',
    // บังคับเอาเฉพาะ 45 เฟรมแรก (ถ้าอัด 30fps = 1.5 วิ) เพื่อมาทำไป-กลับให้ได้ 3 วิพอดี
      '[0:v]trim=0.3:1.8,setpts=PTS-STARTPTS,fps=30,scale=1280:-2,unsharp=3:3:0.8,setpts=N/30/TB[v0];' +
      '[v0]reverse,setpts=N/30/TB[v1];' +
      '[v0][v1]concat=n=2:v=1:a=0,setpts=N/30/TB,format=yuv420p[v]',
      '-map', '[v]',      // BT.709 Colorspace Contract (guideVideo.md Section 7)
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      '-c:v',
      'libx264',
      '-preset',
      'superfast', //tune by all increase compression. to superfast
      '-crf',
      '24', // ปรับ 20 เป็น 24
      '-r',
      '30',
      '-vsync', 'cfr',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '-an',                 // cut sound by all
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
      '[0:v]fps=15,reverse,fifo[r];[0:v]fps=15[o];[o][r]concat=n=2:v=1:a=0,scale=1280:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
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
      `select='not(mod(n\\,${Math.floor(30 / frameCount)}))',unsharp=5:5:1.2:5:5:0.0,scale=1080:-2:flags=lanczos`,
      '-vsync',
      'vfr',
      '-frames:v',
      frameCount.toString(),
      '-q:v',
      '6', // tuned freature by all
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
    // Apply LUT with BT.709 colorspace (guideVideo.md Section 9)
    console.log('==========================applyLutToVideo==========================');
    const args = [
      '-fflags', '+genpts+igndts',
      '-i',
      inputVideoPath,
      '-vf',
      // จัดระเบียบเฟรมใหม่ (setpts) และใส่ LUT ใน pass เดียว
      `setpts=PTS-STARTPTS,lut3d=${lutFileName},format=yuv420p`,
      // LUT + format in one pass (guideVideo.md Section 9)
      `lut3d=${lutFileName},format=yuv420p`,
      // BT.709 Colorspace Contract (guideVideo.md Section 7)

      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      '-c:v',
      'libx264',
      '-preset',
      'superfast',
      '-crf',
      '22',
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
      // Boomerang + LUT in one pass (guideVideo.md Section 10)
      `[0:v]fps=30,reverse,fifo[r];[0:v]fps=30[o];[o][r]concat=n=2:v=1:a=0,scale=1280:-2,setsar=1,format=yuv420p,lut3d=${lutFileName}[v]`,
      '-map',
      '[v]',
      // BT.709 Colorspace Contract (guideVideo.md Section 7)
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '26',
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
 *
 * NOTE (guideVideo.md Section 8):
 * WebM -> MP4 can only get "close" to original colors, never exact.
 * For best results, use FFmpeg Native Recording instead of MediaRecorder.
 *
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
    // BT.709 Colorspace Contract (guideVideo.md Section 7)
    console.log('==========================convertWebmToMp4==========================');
    const args = [
      '-i',
      inputVideoPath,
      '-t',
      String(targetDuration),
      // BT.709 Colorspace Contract - CRITICAL for color accuracy
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      // Scale and format (guideVideo.md Section 8)
      '-vf', 'scale=1280:-2,format=yuv420p',
      '-c:v',
      'libx264',
      '-preset',
      'fast', // edit from slow to fast
      '-crf',
      '20', // edit from 28 to 20 by all
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
      saturation = 1.7,
      contrast = 1.3,
      brightness = -0.08,
      gamma = 0.8
    } = options;

    const vf = `eq=saturation=${saturation}:contrast=${contrast}:brightness=${brightness}:gamma=${gamma},format=yuv420p`;

    const args = [
      '-f', 'dshow',
      '-i', `video=${deviceName}`,
      '-vf', vf,
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-color_range', 'tv',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-r', '30',
      '-y',
      outputPath
    ];

    console.log(`Starting recording with args: ${args.join(' ')}`);

    activeRecordingProcess = spawn(getFFmpegPath(), args);

    activeRecordingProcess.on('error', (err) => {
      console.error('FFmpeg recording start error:', err);
      activeRecordingProcess = null;
      reject(err);
    });


    // แก้ไขช่วงท้ายของ startRecordingCallback
// แก้ไขช่วงท้ายของ startRecordingCallback
    setTimeout(() => {
        if (activeRecordingProcess && activeRecordingProcess.exitCode === null) {
            // หน่วงเพิ่ม 500ms เพื่อให้ FFmpeg บันทึก "เนื้อวิดีโอ" ช่วงต้นรอไว้ก่อน
            // แล้วค่อยส่งสัญญาณให้ UI เริ่มนับถอยหลัง 3-2-1
            setTimeout(() => {
                console.log('Camera is ready and buffered, starting UI countdown...');
                resolve();
            }, 500);
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
