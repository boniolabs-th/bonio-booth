/**
 * Boomerang video processing using FFmpeg (via Main Process)
 * Much faster than browser-based GIF creation
 */

interface BoomerangResult {
  success: boolean;
  path?: string;
  error?: string;
}

interface FrameExtractionResult {
  success: boolean;
  frames?: string[]; // Data URLs
  paths?: string[]; // File paths for cleanup
  error?: string;
}

/**
 * Create a boomerang effect video or GIF using FFmpeg in main process
 * This is much faster than the browser-based approach
 */
export const createBoomerangWithFFmpeg = async (
  videoUrl: string,
  format: 'video' | 'gif' = 'video',
): Promise<string> => {
  try {
    // Convert blob URL to file path if needed
    let videoPath = videoUrl;

    // If it's a blob URL, we need to download it first
    if (videoUrl.startsWith('blob:')) {
      const response = await fetch(videoUrl);
      const blob = await response.blob();

      // Create a temporary file
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Request main process to save and process
      // For now, we'll use the blob directly in memory
      // In production, you might want to save to temp file first
      throw new Error('Blob URL processing not yet implemented. Please provide file path.');
    }

    const result: BoomerangResult = await window.electron.ipcRenderer.invoke(
      'create-boomerang',
      videoPath,
      format,
    );

    if (!result.success || !result.path) {
      throw new Error(result.error || 'Failed to create boomerang');
    }

    return result.path;
  } catch (error) {
    console.error('Error creating boomerang with FFmpeg:', error);
    throw error;
  }
};

/**
 * Extract frames from video for preview/display
 * Much faster than canvas-based extraction
 */
export const extractFramesWithFFmpeg = async (
  videoUrl: string,
  frameCount: number = 12,
): Promise<{ frames: string[]; tempPaths: string[] }> => {
  try {
    let videoPath = videoUrl;

    if (videoUrl.startsWith('blob:')) {
      throw new Error('Blob URL processing not yet implemented. Please provide file path.');
    }

    const result: FrameExtractionResult = await window.electron.ipcRenderer.invoke(
      'extract-frames',
      videoPath,
      frameCount,
    );

    if (!result.success || !result.frames) {
      throw new Error(result.error || 'Failed to extract frames');
    }

    return {
      frames: result.frames,
      tempPaths: result.paths || [],
    };
  } catch (error) {
    console.error('Error extracting frames with FFmpeg:', error);
    throw error;
  }
};

/**
 * Cleanup temporary files created during processing
 */
export const cleanupTempFiles = async (filePaths: string[]): Promise<void> => {
  try {
    if (filePaths.length === 0) {
      return;
    }

    const result = await window.electron.ipcRenderer.invoke(
      'cleanup-temp',
      filePaths,
    );

    if (!result.success) {
      console.warn('Some temp files may not have been cleaned up');
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
};

/**
 * Save blob URL to temporary file for FFmpeg processing
 */
export const saveBlobToTemp = async (blobUrl: string): Promise<string> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Use FileReader to convert to base64 for IPC transfer
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Send to main process to save as temp file
        window.electron.ipcRenderer
          .invoke('save-blob-to-temp', base64)
          .then((result: { success: boolean; path?: string; error?: string }) => {
            if (result.success && result.path) {
              resolve(result.path);
            } else {
              reject(new Error(result.error || 'Failed to save blob'));
            }
          })
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error saving blob to temp:', error);
    throw error;
  }
};

/**
 * Build boomerang frame sequence (forward + reverse)
 */
export const buildBoomerangSequence = (frames: string[]): string[] => {
  if (frames.length <= 1) {
    return frames;
  }

  // Forward + reverse (excluding first and last frame in reverse)
  const reversed = frames.slice(1, -1).reverse();
  return [...frames, ...reversed];
};
