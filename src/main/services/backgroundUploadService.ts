/**
 * Background Upload Service (Presigned Upload)
 * จัดการการ upload files แบบ background โดย PUT ตรงไป Storage ผ่าน presigned URLs
 * และสามารถทำงานต่อได้แม้ renderer จะ navigate ไปหน้าอื่น
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import machineService from './machineService';
import { convertWebmToMp4Base64 } from './videoService';
import type {
  PresignUploadUrlInfo,
  ConfirmUploadFileInfo,
} from './machineService';

interface UploadJob {
  id: string;
  sessionId: string;
  photos: string[];
  videos: string[];
  webmVideoPath?: string; // Path to WebM file for background conversion
  uploadUrls: PresignUploadUrlInfo[]; // Presigned upload URLs from Step 1
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * PUT binary data ไปยัง presigned URL (Storage โดยตรง)
 */
function putFileToStorage(
  uploadUrl: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(uploadUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
          'x-amz-acl': 'public-read', // Set ACL to public-read for publish
        },
      };

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(
                `PUT to storage failed: HTTP ${res.statusCode} - ${data}`,
              ),
            );
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`PUT to storage error: ${error.message}`));
      });

      // Timeout: คำนวณจากขนาดไฟล์ (อย่างน้อย 60s, สูงสุด 5 นาที)
      const fileSizeMB = buffer.length / (1024 * 1024);
      const calculatedTimeout = Math.max(60000, fileSizeMB * 10000);
      const uploadTimeout = Math.min(calculatedTimeout, 300000);

      req.setTimeout(uploadTimeout, () => {
        req.destroy();
        reject(
          new Error(
            `PUT to storage timeout after ${uploadTimeout / 1000} seconds`,
          ),
        );
      });

      // Write buffer in chunks (1MB per chunk)
      const chunkSize = 1024 * 1024;
      let bytesWritten = 0;

      const writeChunk = () => {
        if (bytesWritten >= buffer.length) {
          req.end();
          return;
        }

        const chunk = buffer.slice(bytesWritten, bytesWritten + chunkSize);
        const canContinue = req.write(chunk);
        bytesWritten += chunk.length;

        if (!canContinue) {
          req.once('drain', writeChunk);
        } else {
          setImmediate(writeChunk);
        }
      };

      writeChunk();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * แปลง base64 data URL เป็น Buffer
 */
function dataUrlToBuffer(dataUrl: string): {
  buffer: Buffer;
  mimeType: string;
} {
  if (!dataUrl.startsWith('data:')) {
    throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
  }

  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  return { buffer, mimeType };
}

class BackgroundUploadService {
  private uploadQueue: UploadJob[] = [];

  private isProcessing = false;

  private maxRetries = 3;

  /**
   * เพิ่ม upload job เข้า queue และเริ่ม process ทันที
   */
  async queueUpload(
    sessionId: string,
    photos: string[],
    videos: string[],
    webmVideoPath: string | undefined,
    uploadUrls: PresignUploadUrlInfo[],
  ): Promise<{ jobId: string; success: boolean }> {
    const jobId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job: UploadJob = {
      id: jobId,
      sessionId,
      photos,
      videos,
      webmVideoPath,
      uploadUrls,
      status: 'pending',
      createdAt: new Date(),
    };

    this.uploadQueue.push(job);
    console.log(
      `📤 [BackgroundUpload] Job ${jobId} queued for session ${sessionId}`,
    );
    console.log(
      `📤 [BackgroundUpload] Queue size: ${this.uploadQueue.length}`,
    );
    console.log(
      `📤 [BackgroundUpload] Photos: ${photos.length}, Videos: ${videos.length}, UploadUrls: ${uploadUrls.length}`,
    );
    if (webmVideoPath) {
      console.log(
        `📤 [BackgroundUpload] WebM video path: ${webmVideoPath} (will convert to MP4 in background)`,
      );
    }

    // เริ่ม process queue ทันที (ถ้ายังไม่ได้ process)
    this.processQueue();

    return { jobId, success: true };
  }

  /**
   * Process upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('📤 [BackgroundUpload] Already processing queue');
      return;
    }

    this.isProcessing = true;

    while (this.uploadQueue.length > 0) {
      const job = this.uploadQueue.find((j) => j.status === 'pending');
      if (!job) {
        break;
      }

      job.status = 'processing';
      console.log(`📤 [BackgroundUpload] Processing job ${job.id}...`);

      try {
        const result = await this.executeUpload(job);

        if (result.success) {
          job.status = 'completed';
          job.completedAt = new Date();
          console.log(
            `✅ [BackgroundUpload] Job ${job.id} completed successfully`,
          );
        } else {
          job.status = 'failed';
          job.error = result.error || result.message || 'Unknown error';
          console.error(
            `❌ [BackgroundUpload] Job ${job.id} failed:`,
            job.error,
          );
        }
      } catch (error) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [BackgroundUpload] Job ${job.id} error:`, error);
      }

      // ลบ job ที่เสร็จแล้วหรือ failed ออกจาก queue (เก็บไว้ 5 นาที)
      setTimeout(() => {
        const index = this.uploadQueue.findIndex((j) => j.id === job.id);
        if (index !== -1) {
          this.uploadQueue.splice(index, 1);
          console.log(
            `🗑️ [BackgroundUpload] Job ${job.id} removed from queue`,
          );
        }
      }, 5 * 60 * 1000); // 5 minutes
    }

    this.isProcessing = false;
    console.log('📤 [BackgroundUpload] Queue processing completed');
  }

  /**
   * Execute presigned upload with retry logic
   *
   * Flow:
   * 1. Convert WebM → MP4 (ถ้ามี webmVideoPath)
   * 2. PUT แต่ละไฟล์ไปยัง presigned URL (parallel)
   * 3. POST confirm-upload ไปยัง backend
   */
  private async executeUpload(
    job: UploadJob,
    retryCount = 0,
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }> {
    try {
      console.log(
        `📤 [BackgroundUpload] Executing presigned upload for session ${job.sessionId} (attempt ${retryCount + 1}/${this.maxRetries})`,
      );

      // ========== Step 1: Prepare files ==========

      // Convert WebM → MP4 ถ้ามี
      const videosToUpload = [...job.videos];
      if (job.webmVideoPath) {
        console.log(
          `🎬 [BackgroundUpload] Converting WebM to MP4 in background...`,
        );
        const convertStartTime = Date.now();

        try {
          const mp4DataUrl = await convertWebmToMp4Base64(job.webmVideoPath);
          if (
            mp4DataUrl &&
            typeof mp4DataUrl === 'string' &&
            mp4DataUrl.startsWith('data:video/mp4')
          ) {
            const convertDuration = (
              (Date.now() - convertStartTime) /
              1000
            ).toFixed(1);
            const mp4SizeMB = (
              (mp4DataUrl.length * 0.75) /
              1024 /
              1024
            ).toFixed(2);
            console.log(
              `✅ [BackgroundUpload] MP4 conversion done in ${convertDuration}s, size: ~${mp4SizeMB} MB`,
            );
            videosToUpload.push(mp4DataUrl);
          } else {
            console.error(
              `❌ [BackgroundUpload] MP4 conversion failed: Invalid dataUrl returned`,
            );
          }
        } catch (convertError) {
          console.error(
            `❌ [BackgroundUpload] MP4 conversion error:`,
            convertError,
          );
          // ไม่ throw error - ยังคง upload photos ได้
        }
      }

      // ========== Step 2: PUT files to presigned URLs ==========

      // แยก upload URLs ตาม type
      const photoUrls = job.uploadUrls
        .filter((u) => u.type === 'photo')
        .sort((a, b) => a.order - b.order);
      const videoUrls = job.uploadUrls
        .filter((u) => u.type === 'video')
        .sort((a, b) => a.order - b.order);

      console.log(
        `📤 [BackgroundUpload] Upload targets: ${photoUrls.length} photo URLs, ${videoUrls.length} video URLs`,
      );
      console.log(
        `📤 [BackgroundUpload] Files ready: ${job.photos.length} photos, ${videosToUpload.length} videos`,
      );

      const uploadedFiles: ConfirmUploadFileInfo[] = [];
      const uploadPromises: Promise<void>[] = [];

      // Upload photos (parallel)
      const photoCount = Math.min(job.photos.length, photoUrls.length);
      for (let i = 0; i < photoCount; i++) {
        const urlInfo = photoUrls[i];
        const photoIndex = i; // capture index for closure
        uploadPromises.push(
          (async () => {
            try {
              const { buffer } = dataUrlToBuffer(job.photos[photoIndex]);
              const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
              console.log(
                `📤 [BackgroundUpload] PUT photo ${urlInfo.order} (${sizeMB} MB) → ${urlInfo.key}`,
              );

              await putFileToStorage(
                urlInfo.uploadUrl,
                buffer,
                urlInfo.contentType,
              );

              console.log(
                `✅ [BackgroundUpload] Photo ${urlInfo.order} uploaded successfully`,
              );
              uploadedFiles.push({
                key: urlInfo.key,
                type: 'photo',
                order: urlInfo.order,
              });
            } catch (error) {
              console.error(
                `❌ [BackgroundUpload] Failed to upload photo ${urlInfo.order}:`,
                error,
              );
              // ไม่ throw - ให้ upload ไฟล์อื่นต่อ
            }
          })(),
        );
      }

      // Upload videos (parallel)
      const videoCount = Math.min(videosToUpload.length, videoUrls.length);
      for (let i = 0; i < videoCount; i++) {
        const urlInfo = videoUrls[i];
        const videoIndex = i;
        uploadPromises.push(
          (async () => {
            try {
              const { buffer } = dataUrlToBuffer(videosToUpload[videoIndex]);
              const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
              console.log(
                `📤 [BackgroundUpload] PUT video ${urlInfo.order} (${sizeMB} MB) → ${urlInfo.key}`,
              );

              await putFileToStorage(
                urlInfo.uploadUrl,
                buffer,
                urlInfo.contentType,
              );

              console.log(
                `✅ [BackgroundUpload] Video ${urlInfo.order} uploaded successfully`,
              );
              uploadedFiles.push({
                key: urlInfo.key,
                type: 'video',
                order: urlInfo.order,
              });
            } catch (error) {
              console.error(
                `❌ [BackgroundUpload] Failed to upload video ${urlInfo.order}:`,
                error,
              );
              // ไม่ throw - ให้ upload ไฟล์อื่นต่อ
            }
          })(),
        );
      }

      // รอ upload ทั้งหมดเสร็จ (parallel)
      await Promise.all(uploadPromises);

      console.log(
        `📤 [BackgroundUpload] Upload results: ${uploadedFiles.length}/${photoCount + videoCount} files uploaded`,
      );

      // ถ้าไม่มีไฟล์ที่ upload สำเร็จเลย
      if (uploadedFiles.length === 0) {
        return {
          success: false,
          error: 'No files were uploaded successfully',
        };
      }

      // ========== Step 3: Confirm upload ==========

      console.log(
        `📤 [BackgroundUpload] Confirming upload for session ${job.sessionId}...`,
      );
      const confirmResult = await machineService.confirmUpload(
        job.sessionId,
        uploadedFiles,
      );

      if (confirmResult.success) {
        console.log(
          `✅ [BackgroundUpload] Upload confirmed! Session status: ${confirmResult.photoSession?.status}`,
        );
      } else {
        console.error(
          `❌ [BackgroundUpload] Confirm failed:`,
          confirmResult.error || confirmResult.message,
        );
      }

      return {
        success: confirmResult.success,
        error: confirmResult.error,
        message: confirmResult.message,
      };
    } catch (error) {
      if (retryCount < this.maxRetries - 1) {
        console.log(
          `⚠️ [BackgroundUpload] Upload error, retrying... (${retryCount + 1}/${this.maxRetries})`,
        );
        await new Promise((resolve) => {
          setTimeout(resolve, 2000 * (retryCount + 1));
        }); // Exponential backoff
        return this.executeUpload(job, retryCount + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): UploadJob | undefined {
    return this.uploadQueue.find((j) => j.id === jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): UploadJob[] {
    return [...this.uploadQueue];
  }

  /**
   * Get pending jobs count
   */
  getPendingCount(): number {
    return this.uploadQueue.filter(
      (j) => j.status === 'pending' || j.status === 'processing',
    ).length;
  }
}

// Singleton instance
export const backgroundUploadService = new BackgroundUploadService();
