/**
 * Background Upload Service
 * จัดการการ upload files แบบ background โดยไม่ block UI
 * และสามารถทำงานต่อได้แม้ renderer จะ navigate ไปหน้าอื่น
 */

import machineService from './machineService';

export interface UploadJob {
  id: string;
  sessionId: string;
  photos: string[];
  videos: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
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
  ): Promise<{ jobId: string; success: boolean }> {
    const jobId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const job: UploadJob = {
      id: jobId,
      sessionId,
      photos,
      videos,
      status: 'pending',
      createdAt: new Date(),
    };

    this.uploadQueue.push(job);
    console.log(`📤 [BackgroundUpload] Job ${jobId} queued for session ${sessionId}`);
    console.log(`📤 [BackgroundUpload] Queue size: ${this.uploadQueue.length}`);
    console.log(`📤 [BackgroundUpload] Photos: ${photos.length}, Videos: ${videos.length}`);

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
          console.log(`✅ [BackgroundUpload] Job ${job.id} completed successfully`);
          console.log(`✅ [BackgroundUpload] Uploaded ${result.files?.length || 0} files`);
        } else {
          job.status = 'failed';
          job.error = result.error || result.message || 'Unknown error';
          console.error(`❌ [BackgroundUpload] Job ${job.id} failed:`, job.error);
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
          console.log(`🗑️ [BackgroundUpload] Job ${job.id} removed from queue`);
        }
      }, 5 * 60 * 1000); // 5 minutes
    }

    this.isProcessing = false;
    console.log('📤 [BackgroundUpload] Queue processing completed');
  }

  /**
   * Execute upload with retry logic
   */
  private async executeUpload(
    job: UploadJob,
    retryCount = 0,
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    files?: Array<{ type: string; url: string; order: number }>;
  }> {
    try {
      console.log(
        `📤 [BackgroundUpload] Uploading to session ${job.sessionId} (attempt ${retryCount + 1}/${this.maxRetries})`,
      );

      const result = await machineService.uploadFilesToSession(
        job.sessionId,
        job.photos,
        job.videos,
      );

      if (!result.success && retryCount < this.maxRetries - 1) {
        console.log(
          `⚠️ [BackgroundUpload] Upload failed, retrying... (${retryCount + 1}/${this.maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * (retryCount + 1))); // Exponential backoff
        return this.executeUpload(job, retryCount + 1);
      }

      return result;
    } catch (error) {
      if (retryCount < this.maxRetries - 1) {
        console.log(
          `⚠️ [BackgroundUpload] Upload error, retrying... (${retryCount + 1}/${this.maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000 * (retryCount + 1)));
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
