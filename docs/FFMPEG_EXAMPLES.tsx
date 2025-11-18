/**
 * Example: How to use FFmpeg-based boomerang in PhotoResult
 * Replace the slow gifshot-based approach with fast FFmpeg processing
 */

import { useEffect, useState, useRef } from 'react';

// Example updated interface
interface Capture {
  video: string; // Should be file path, not blob URL
  photo: string;
  // Remove these if using FFmpeg approach:
  // boomerangGif?: string;
  // boomerangFrames?: string[];
}

// Example component showing the migration
export function PhotoResultFFmpegExample() {
  const [boomerangVideoPath, setBoomerangVideoPath] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  // Example: Create boomerang on mount
  useEffect(() => {
    const createBoomerang = async () => {
      // Prevent duplicate processing
      if (hasProcessed.current) return;
      hasProcessed.current = true;

      const videoPath = '/path/to/recorded/video.webm'; // Get from props/state

      if (!videoPath) {
        setError('No video path provided');
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Call FFmpeg via IPC
        const result = await window.electron.video.createBoomerang(
          videoPath,
          'video', // or 'gif' if you need GIF format
        );

        if (result.success && result.path) {
          setBoomerangVideoPath(result.path);
          console.log('✅ Boomerang created successfully:', result.path);
        } else {
          throw new Error(result.error || 'Failed to create boomerang');
        }
      } catch (err) {
        console.error('❌ Error creating boomerang:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsProcessing(false);
      }
    };

    createBoomerang();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (boomerangVideoPath) {
        // Cleanup temp file
        window.electron.video.cleanupTemp([boomerangVideoPath])
          .catch(console.error);
      }
    };
  }, [boomerangVideoPath]);

  return (
    <div className="boomerang-preview">
      {isProcessing && (
        <div className="processing-indicator">
          <div className="spinner" />
          <p>กำลังสร้าง Boomerang...</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>เกิดข้อผิดพลาด: {error}</p>
        </div>
      )}

      {boomerangVideoPath && !isProcessing && (
        <video
          key={boomerangVideoPath}
          src={`file://${boomerangVideoPath}`}
          className="boomerang-video"
          loop
          autoPlay
          muted
          playsInline
          style={{
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
}

// Example: Extract frames for thumbnail preview
export function FramePreviewExample() {
  const [frames, setFrames] = useState<string[]>([]);
  const [tempPaths, setTempPaths] = useState<string[]>([]);

  useEffect(() => {
    const extractFrames = async () => {
      const videoPath = '/path/to/video.webm';

      try {
        const result = await window.electron.video.extractFrames(videoPath, 6);

        if (result.success && result.frames) {
          setFrames(result.frames); // Data URLs
          setTempPaths(result.paths || []); // File paths for cleanup
        }
      } catch (error) {
        console.error('Failed to extract frames:', error);
      }
    };

    extractFrames();

    // Cleanup
    return () => {
      if (tempPaths.length > 0) {
        window.electron.video.cleanupTemp(tempPaths).catch(console.error);
      }
    };
  }, []);

  return (
    <div className="frame-preview-grid">
      {frames.map((frame, index) => (
        <img
          key={index}
          src={frame}
          alt={`Frame ${index + 1}`}
          className="frame-thumbnail"
        />
      ))}
    </div>
  );
}

// Example: Complete flow with video capture to boomerang
export function CompleteBoomerangFlow() {
  const [videoFilePath, setVideoFilePath] = useState<string | null>(null);
  const [boomerangPath, setBoomerangPath] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'done'>('idle');

  const handleRecordComplete = async (chunks: Blob[]) => {
    try {
      // Step 1: Save recorded video to temp file
      setStatus('processing');

      const blob = new Blob(chunks, { type: 'video/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          '',
        ),
      );

      // Save to temp file via IPC
      const saveResult = await window.electron.ipcRenderer.invoke(
        'save-video-to-temp',
        base64,
      );

      if (!saveResult.success || !saveResult.path) {
        throw new Error('Failed to save video');
      }

      setVideoFilePath(saveResult.path);

      // Step 2: Create boomerang
      const boomerangResult = await window.electron.video.createBoomerang(
        saveResult.path,
        'video',
      );

      if (!boomerangResult.success || !boomerangResult.path) {
        throw new Error('Failed to create boomerang');
      }

      setBoomerangPath(boomerangResult.path);
      setStatus('done');

      console.log('✅ Complete flow finished successfully');
    } catch (error) {
      console.error('❌ Flow failed:', error);
      setStatus('idle');
    }
  };

  return (
    <div className="complete-flow">
      <h2>Status: {status}</h2>

      {status === 'done' && boomerangPath && (
        <div className="result">
          <h3>✅ Boomerang Ready!</h3>
          <video
            src={`file://${boomerangPath}`}
            loop
            autoPlay
            muted
            playsInline
            style={{ width: '100%', maxWidth: '640px' }}
          />
        </div>
      )}
    </div>
  );
}

// Performance comparison demonstration
export function PerformanceComparison() {
  const [oldTime, setOldTime] = useState<number | null>(null);
  const [newTime, setNewTime] = useState<number | null>(null);

  const testOldApproach = async () => {
    const start = performance.now();

    // Old gifshot-based approach (simulated)
    await new Promise(resolve => setTimeout(resolve, 12000)); // ~12 seconds

    setOldTime(performance.now() - start);
  };

  const testNewApproach = async () => {
    const start = performance.now();

    try {
      const videoPath = '/path/to/test/video.webm';
      await window.electron.video.createBoomerang(videoPath, 'video');
      setNewTime(performance.now() - start);
    } catch (error) {
      console.error('Test failed:', error);
    }
  };

  return (
    <div className="performance-test">
      <h2>Performance Comparison</h2>

      <div className="test-buttons">
        <button onClick={testOldApproach}>
          Test Old (gifshot)
        </button>
        <button onClick={testNewApproach}>
          Test New (FFmpeg)
        </button>
      </div>

      <div className="results">
        <div>
          Old Approach: {oldTime ? `${(oldTime / 1000).toFixed(2)}s` : 'Not tested'}
          {oldTime && <span> 🐢</span>}
        </div>
        <div>
          New Approach: {newTime ? `${(newTime / 1000).toFixed(2)}s` : 'Not tested'}
          {newTime && <span> ⚡</span>}
        </div>

        {oldTime && newTime && (
          <div className="improvement">
            <strong>
              ⚡ {((oldTime / newTime)).toFixed(1)}x faster!
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}
