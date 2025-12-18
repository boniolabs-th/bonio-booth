import React, { useState, useEffect, useCallback } from 'react';
import './CameraConfigModal.css';

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface CameraConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CameraConfigModal({
  isOpen,
  onClose,
  onSuccess,
}: CameraConfigModalProps): React.JSX.Element | null {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [currentConfig, setCurrentConfig] = useState<CameraDevice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // โหลดรายการกล้องและ config ปัจจุบัน
  const loadCameras = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      // ขอสิทธิ์เข้าถึงกล้องก่อนเพื่อให้ได้ label ของกล้อง
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach((track) => track.stop());

      // ดึงรายการกล้อง
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));

      setCameras(videoDevices);

      // ดึง config ปัจจุบัน
      // @ts-ignore
      const configResult = await window.electron?.payment?.getCameraConfig();
      if (configResult?.success && configResult.config) {
        setCurrentConfig(configResult.config);
        setSelectedDeviceId(configResult.config.deviceId);
      } else if (videoDevices.length > 0) {
        // ถ้าไม่มี config ให้เลือกกล้องตัวสุดท้าย (external camera)
        setSelectedDeviceId(videoDevices[videoDevices.length - 1].deviceId);
      }
    } catch (err) {
      console.error('Failed to load cameras:', err);
      setError('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งาน');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // เริ่ม preview เมื่อเลือกกล้อง
  const startPreview = useCallback(async (deviceId: string) => {
    // หยุด stream เดิม
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
    }

    if (!deviceId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });
      setPreviewStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to start preview:', err);
    }
  }, [previewStream]);

  // โหลดกล้องเมื่อ modal เปิด
  useEffect(() => {
    if (isOpen) {
      loadCameras();
    } else {
      // หยุด preview เมื่อปิด modal
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
        setPreviewStream(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // เริ่ม preview เมื่อเลือกกล้อง
  useEffect(() => {
    if (isOpen && selectedDeviceId) {
      startPreview(selectedDeviceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, isOpen]);

  // Cleanup เมื่อ unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [previewStream]);

  const handleSave = useCallback(async () => {
    if (!selectedDeviceId) {
      setError('กรุณาเลือกกล้อง');
      return;
    }

    const selectedCamera = cameras.find((c) => c.deviceId === selectedDeviceId);
    if (!selectedCamera) {
      setError('ไม่พบกล้องที่เลือก');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // @ts-ignore
      const result = await window.electron?.payment?.saveCameraConfig({
        deviceId: selectedCamera.deviceId,
        label: selectedCamera.label,
      });

      if (result?.success) {
        // หยุด preview
        if (previewStream) {
          previewStream.getTracks().forEach((track) => track.stop());
          setPreviewStream(null);
        }
        onSuccess?.();
        onClose();
      } else {
        setError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('Failed to save camera config:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsSaving(false);
    }
  }, [selectedDeviceId, cameras, previewStream, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    // หยุด preview
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
      setPreviewStream(null);
    }
    onClose();
  }, [previewStream, onClose]);

  if (!isOpen) return null;

  return (
    <div className="camera-config-modal-overlay">
      <div className="camera-config-modal-content">
        <h2 className="camera-config-modal-title">ตั้งค่ากล้อง</h2>
        <p className="camera-config-modal-description">
          เลือกกล้องที่ต้องการใช้ในการถ่ายภาพ
        </p>

        {isLoading ? (
          <div className="camera-config-loading">
            <div className="camera-config-spinner" />
            <p>กำลังโหลดรายการกล้อง...</p>
          </div>
        ) : (
          <>
            {/* Preview */}
            <div className="camera-config-preview">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-config-video"
              />
              {!previewStream && (
                <div className="camera-config-no-preview">
                  <span>ไม่มี Preview</span>
                </div>
              )}
            </div>

            {/* Camera Selection */}
            <div className="camera-config-form">
              <label htmlFor="camera-select" className="camera-config-label">
                เลือกกล้อง
              </label>
              <select
                id="camera-select"
                className="camera-config-select"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={isSaving}
              >
                <option value="">-- เลือกกล้อง --</option>
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                    {currentConfig?.deviceId === camera.deviceId
                      ? ' (ปัจจุบัน)'
                      : ''}
                  </option>
                ))}
              </select>

              {cameras.length === 0 && (
                <p className="camera-config-warning">
                  ไม่พบกล้องที่เชื่อมต่ออยู่
                </p>
              )}

              {currentConfig && (
                <p className="camera-config-current">
                  กล้องปัจจุบัน: <strong>{currentConfig.label}</strong>
                </p>
              )}
            </div>

            {error && <p className="camera-config-error">{error}</p>}

            {/* Actions */}
            <div className="camera-config-actions">
              <button
                type="button"
                className="camera-config-btn camera-config-btn-cancel"
                onClick={handleClose}
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="camera-config-btn camera-config-btn-save"
                onClick={handleSave}
                disabled={isSaving || !selectedDeviceId}
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
