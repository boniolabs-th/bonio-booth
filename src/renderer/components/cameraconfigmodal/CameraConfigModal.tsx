import React, { useState, useEffect, useCallback } from 'react';
import './CameraConfigModal.css';

// =============================================================================
// Types
// =============================================================================

type CameraTab = 'webcam' | 'canon';

interface WebcamDevice {
  deviceId: string;
  label: string;
}

interface CanonCamera {
  name: string;
  portName: string;
  deviceSubType: number;
  bodyId?: string;
}

interface CameraConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export default function CameraConfigModal({
  isOpen,
  onClose,
  onSuccess,
}: CameraConfigModalProps): React.JSX.Element | null {
  // Tab state
  const [activeTab, setActiveTab] = useState<CameraTab>('webcam');

  // Webcam state
  const [webcams, setWebcams] = useState<WebcamDevice[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('');
  const [currentWebcamConfig, setCurrentWebcamConfig] =
    useState<WebcamDevice | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState('');

  // Canon state
  const [canonCameras, setCanonCameras] = useState<CanonCamera[]>([]);
  const [selectedCanonIndex, setSelectedCanonIndex] = useState<number>(-1);
  const [canonConnected, setCanonConnected] = useState(false);
  const [canonSessionOpen, setCanonSessionOpen] = useState(false);
  const [canonError, setCanonError] = useState('');
  const [canonBatteryLevel, setCanonBatteryLevel] = useState<number | null>(
    null,
  );

  // Disconnect warning state
  const [webcamDisconnected, setWebcamDisconnected] = useState(false);
  const [canonDisconnected, setCanonDisconnected] = useState(false);

  // Common state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);

  // ===========================================================================
  // Webcam Functions
  // ===========================================================================

  const loadWebcams = useCallback(async () => {
    setWebcamError('');

    try {
      // ขอสิทธิ์เข้าถึงกล้องก่อนเพื่อให้ได้ label ของกล้อง
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      tempStream.getTracks().forEach((track) => track.stop());

      // ดึงรายการกล้อง
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));

      setWebcams(videoDevices);

      // ดึง config ปัจจุบัน
      // @ts-ignore
      const configResult = await window.electron?.payment?.getCameraConfig();
      if (configResult?.success && configResult.config) {
        setCurrentWebcamConfig(configResult.config);
        setSelectedWebcamId(configResult.config.deviceId);

        // เช็คว่ากล้อง webcam ที่ตั้งค่าไว้ยังเชื่อมต่ออยู่หรือไม่
        if (configResult.config.type === 'webcam') {
          const configuredFound = videoDevices.some(
            (d) => d.deviceId === configResult.config.deviceId
          );
          if (!configuredFound) {
            setWebcamDisconnected(true);
            (window as any).electron?.ipcRenderer?.sendMessage?.(
              'camera-access-failed',
            );
            console.warn(
              `⚠️ [CameraConfig] Configured webcam disconnected: ${configResult.config.label}`,
            );
          } else {
            setWebcamDisconnected(false);
          }
        }
      } else if (videoDevices.length > 0) {
        setSelectedWebcamId(videoDevices[videoDevices.length - 1].deviceId);
      }
    } catch (err: any) {
      console.error('Failed to load webcams:', err);
      if (err.name === 'NotFoundError') {
        setWebcamError('ไม่พบ Webcam ที่เชื่อมต่ออยู่');
      } else if (err.name === 'NotAllowedError') {
        setWebcamError('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง');
      } else {
        setWebcamError('ไม่สามารถเข้าถึงกล้องได้');
      }
      (window as any).electron?.ipcRenderer?.sendMessage?.('camera-access-failed');
    }
  }, []);

  const startWebcamPreview = useCallback(
    async (deviceId: string) => {
      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
      }

      if (!deviceId) return;

      try {
        setWebcamError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        setPreviewStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to start webcam preview:', err);
        setWebcamError('ไม่สามารถเข้าถึงกล้องได้');
        (window as any).electron?.ipcRenderer?.sendMessage?.(
          'camera-access-failed',
        );
      }
    },
    [previewStream],
  );

  const stopWebcamPreview = useCallback(() => {
    if (previewStream) {
      previewStream.getTracks().forEach((track) => track.stop());
      setPreviewStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [previewStream]);

  // ===========================================================================
  // Canon EDSDK Functions
  // ===========================================================================

  const loadCanonCameras = useCallback(async () => {
    setCanonError('');

    try {
      console.log('[CameraConfigModal] Starting Canon camera detection...');

      // 1) เช็คสถานะการเชื่อมต่อปัจจุบันก่อน
      // @ts-ignore - canonCamera API from preload
      const isAlreadyConnected = await window.electron?.canonCamera?.isConnected();
      // @ts-ignore
      const isAlreadySessionOpen = await window.electron?.canonCamera?.isSessionOpen();
      console.log('[CameraConfigModal] Current status - connected:', isAlreadyConnected, 'session:', isAlreadySessionOpen);

      // 2) ถ้ากล้อง connected และ session เปิดอยู่แล้ว → แค่ดึงข้อมูลแสดงผล
      if (isAlreadyConnected && isAlreadySessionOpen) {
        console.log('[CameraConfigModal] Camera already connected, loading info...');
        setCanonConnected(true);
        setCanonSessionOpen(true);

        // ดึง battery level
        // @ts-ignore
        const batteryLevel = await window.electron?.canonCamera?.getBatteryLevel();
        if (batteryLevel !== null && batteryLevel !== undefined) {
          setCanonBatteryLevel(batteryLevel);
        }

        // ดึงรายชื่อกล้อง (ไม่กระทบ connection ที่เปิดอยู่)
        // @ts-ignore
        const cameras = await window.electron?.canonCamera?.getCameraList();
        if (cameras && Array.isArray(cameras)) {
          setCanonCameras(cameras);
          if (cameras.length > 0) {
            setSelectedCanonIndex(0);
          }
        }
        return;
      }

      // 3) ยังไม่ connected → initialize SDK และสแกนหากล้อง
      // @ts-ignore
      const initResult = await window.electron?.canonCamera?.initialize();
      console.log('[CameraConfigModal] SDK initialize result:', initResult);

      if (!initResult) {
        setCanonError('ไม่สามารถเริ่มต้น Canon SDK ได้');
        return;
      }

      // @ts-ignore
      const cameras = await window.electron?.canonCamera?.getCameraList();
      console.log('[CameraConfigModal] Camera list:', cameras);

      if (cameras && Array.isArray(cameras)) {
        setCanonCameras(cameras);
      } else {
        setCanonCameras([]);
      }

      setCanonConnected(false);
      setCanonSessionOpen(false);
      setCanonBatteryLevel(null);

      // เช็คว่ามี saved config เป็น Canon แต่ไม่เจอกล้อง → แสดง warning disconnect
      // @ts-ignore
      const savedConfigResult = await window.electron?.payment?.getCameraConfig();
      if (savedConfigResult?.success && savedConfigResult.config?.type === 'canon') {
        if (!cameras || cameras.length === 0) {
          setCanonDisconnected(true);
          console.warn(
            `⚠️ [CameraConfig] Configured Canon camera disconnected: ${savedConfigResult.config.cameraName}`,
          );
        } else {
          setCanonDisconnected(false);
        }
      }

      // 4) ถ้าเจอกล้องและมี saved config → ลอง auto-reconnect
      if (cameras && cameras.length > 0) {
        // @ts-ignore
        const configResult = await window.electron?.payment?.getCameraConfig();
        if (configResult?.success && configResult.config?.type === 'canon') {
          const savedIndex = configResult.config.cameraIndex ?? 0;
          const validIndex = savedIndex < cameras.length ? savedIndex : 0;
          setSelectedCanonIndex(validIndex);

          console.log('[CameraConfigModal] Auto-reconnecting with saved config, index:', validIndex);

          try {
            // @ts-ignore
            const camera = await window.electron?.canonCamera?.connectByIndex(validIndex);
            if (camera) {
              setCanonConnected(true);
              // @ts-ignore
              const sessionOpened = await window.electron?.canonCamera?.openSession();
              if (sessionOpened) {
                setCanonSessionOpen(true);
                // @ts-ignore
                const batteryLevel = await window.electron?.canonCamera?.getBatteryLevel();
                if (batteryLevel !== null && batteryLevel !== undefined) {
                  setCanonBatteryLevel(batteryLevel);
                }
                console.log('[CameraConfigModal] Auto-reconnect successful');
              }
            }
          } catch (autoErr) {
            console.warn('[CameraConfigModal] Auto-reconnect failed, user can connect manually:', autoErr);
            // ไม่ set error — แค่ให้ user กดเชื่อมต่อเอง
            setCanonConnected(false);
            setCanonSessionOpen(false);
          }
        } else if (cameras.length > 0) {
          setSelectedCanonIndex(0);
        }
      }
    } catch (err: any) {
      console.error('[CameraConfigModal] Failed to load Canon cameras:', err);
      setCanonError(
        'ไม่สามารถโหลดกล้อง Canon ได้: ' + (err.message || 'Unknown error'),
      );
    }
  }, []);

  const connectCanonCamera = useCallback(async () => {
    if (selectedCanonIndex < 0) return;

    setCanonError('');
    setIsSaving(true);

    try {
      console.log('[CameraConfigModal] Connecting to camera index:', selectedCanonIndex);

      // @ts-ignore
      const camera = await window.electron?.canonCamera?.connectByIndex(selectedCanonIndex);
      console.log('[CameraConfigModal] Connect result:', camera);

      if (!camera) {
        setCanonError('ไม่สามารถเชื่อมต่อกล้องได้');
        return;
      }

      setCanonConnected(true);

      // Open session
      // @ts-ignore
      const sessionOpened = await window.electron?.canonCamera?.openSession();
      console.log('[CameraConfigModal] Session opened:', sessionOpened);

      if (sessionOpened) {
        setCanonSessionOpen(true);

        // Get battery level
        // @ts-ignore
        const batteryLevel = await window.electron?.canonCamera?.getBatteryLevel();
        console.log('[CameraConfigModal] Battery level:', batteryLevel);
        if (batteryLevel !== null) {
          setCanonBatteryLevel(batteryLevel);
        }
      }
    } catch (err: any) {
      console.error('[CameraConfigModal] Failed to connect Canon camera:', err);
      setCanonError('เกิดข้อผิดพลาด: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedCanonIndex]);

  const disconnectCanonCamera = useCallback(async () => {
    try {
      console.log('[CameraConfigModal] Disconnecting Canon camera...');
      // @ts-ignore
      await window.electron?.canonCamera?.fullDisconnect();
      setCanonConnected(false);
      setCanonSessionOpen(false);
      setCanonBatteryLevel(null);
    } catch (err) {
      console.error('[CameraConfigModal] Failed to disconnect Canon camera:', err);
    }
  }, []);

  const refreshCanonCameras = useCallback(async () => {
    setIsLoading(true);
    await loadCanonCameras();
    setIsLoading(false);
  }, [loadCanonCameras]);

  // ===========================================================================
  // Save Functions
  // ===========================================================================

  const handleSaveWebcam = useCallback(async () => {
    if (!selectedWebcamId) {
      setWebcamError('กรุณาเลือกกล้อง');
      return;
    }

    const selectedCamera = webcams.find((c) => c.deviceId === selectedWebcamId);
    if (!selectedCamera) {
      setWebcamError('ไม่พบกล้องที่เลือก');
      return;
    }

    setIsSaving(true);
    setWebcamError('');

    try {
      // @ts-ignore
      const result = await window.electron?.payment?.saveCameraConfig({
        type: 'webcam',
        deviceId: selectedCamera.deviceId,
        label: selectedCamera.label,
      });

      if (result?.success) {
        stopWebcamPreview();
        onSuccess?.();
        onClose();
      } else {
        setWebcamError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('Failed to save webcam config:', err);
      setWebcamError('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsSaving(false);
    }
  }, [selectedWebcamId, webcams, stopWebcamPreview, onSuccess, onClose]);

  const handleSaveCanon = useCallback(async () => {
    if (selectedCanonIndex < 0) {
      setCanonError('กรุณาเลือกกล้อง Canon');
      return;
    }

    const selectedCamera = canonCameras[selectedCanonIndex];
    if (!selectedCamera) {
      setCanonError('ไม่พบกล้อง Canon ที่เลือก');
      return;
    }

    // ต้อง connect และ open session ก่อน
    if (!canonConnected || !canonSessionOpen) {
      setCanonError('กรุณาเชื่อมต่อกล้องและเปิด Session ก่อนบันทึก');
      return;
    }

    setIsSaving(true);
    setCanonError('');

    try {
      // @ts-ignore
      const result = await window.electron?.payment?.saveCameraConfig({
        type: 'canon',
        cameraIndex: selectedCanonIndex,
        cameraName: selectedCamera.name,
        portName: selectedCamera.portName,
        bodyId: selectedCamera.bodyId,
      });

      if (result?.success) {
        onSuccess?.();
        onClose();
      } else {
        setCanonError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('Failed to save Canon camera config:', err);
      setCanonError('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsSaving(false);
    }
  }, [selectedCanonIndex, canonCameras, canonConnected, canonSessionOpen, onSuccess, onClose]);

  // ===========================================================================
  // Effects
  // ===========================================================================

  // Load cameras when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      Promise.all([loadWebcams(), loadCanonCameras()]).finally(() => {
        setIsLoading(false);
      });
    } else {
      stopWebcamPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Start webcam preview when selected
  useEffect(() => {
    if (isOpen && activeTab === 'webcam' && selectedWebcamId) {
      startWebcamPreview(selectedWebcamId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWebcamId, isOpen, activeTab]);

  // Stop webcam preview when switching to Canon tab
  useEffect(() => {
    if (activeTab === 'canon') {
      stopWebcamPreview();
    }
  }, [activeTab, stopWebcamPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcamPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  const handleClose = useCallback(() => {
    stopWebcamPreview();
    onClose();
  }, [stopWebcamPreview, onClose]);

  const handleTabChange = (tab: CameraTab) => {
    setActiveTab(tab);
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  if (!isOpen) return null;

  return (
    <div className="camera-config-modal-overlay">
      <div className="camera-config-modal-content">
        <h2 className="camera-config-modal-title">ตั้งค่ากล้อง</h2>
        <p className="camera-config-modal-description">
          เลือกกล้องที่ต้องการใช้ในการถ่ายภาพ
        </p>

        {/* Tabs */}
        <div className="camera-config-tabs">
          <button
            type="button"
            className={`camera-config-tab ${activeTab === 'webcam' ? 'active' : ''}`}
            onClick={() => handleTabChange('webcam')}
          >
            <span className="tab-icon">📷</span>
            Webcam
          </button>
          <button
            type="button"
            className={`camera-config-tab ${activeTab === 'canon' ? 'active' : ''}`}
            onClick={() => handleTabChange('canon')}
          >
            <span className="tab-icon">📸</span>
            Canon DSLR/Mirrorless
          </button>
        </div>

        {isLoading ? (
          <div className="camera-config-loading">
            <div className="camera-config-spinner" />
            <p>กำลังโหลดรายการกล้อง...</p>
          </div>
        ) : (
          <>
            {/* ============= Webcam Tab ============= */}
            {activeTab === 'webcam' && (
              <div className="camera-config-tab-content">
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
                  <label
                    htmlFor="webcam-select"
                    className="camera-config-label"
                  >
                    เลือก Webcam
                  </label>
                  <select
                    id="webcam-select"
                    className="camera-config-select"
                    value={selectedWebcamId}
                    onChange={(e) => setSelectedWebcamId(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">-- เลือกกล้อง --</option>
                    {webcams.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                        {currentWebcamConfig?.deviceId === camera.deviceId
                          ? ' (ปัจจุบัน)'
                          : ''}
                      </option>
                    ))}
                  </select>

                  {webcamDisconnected && currentWebcamConfig && (
                    <div className="camera-config-warning" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: '#856404' }}>
                        ⚠️ กล้อง "{currentWebcamConfig.label}" ขาดการเชื่อมต่อ
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.9em', color: '#856404' }}>
                        กรุณาตรวจสอบสาย USB และเสียบกล้องใหม่ หรือเลือกกล้องตัวอื่น
                      </p>
                    </div>
                  )}

                {webcams.length === 0 && !webcamError && !webcamDisconnected && (
                    <p className="camera-config-warning">
                      ไม่พบ Webcam ที่เชื่อมต่ออยู่
                    </p>
                  )}

                  {currentWebcamConfig && !webcamDisconnected && (
                    <p className="camera-config-current">
                      กล้องปัจจุบัน:{' '}
                      <strong>{currentWebcamConfig.label}</strong>
                    </p>
                  )}
                </div>

                {webcamError && (
                  <p className="camera-config-error">{webcamError}</p>
                )}

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
                    onClick={handleSaveWebcam}
                    disabled={isSaving || !selectedWebcamId}
                  >
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>
            )}

            {/* ============= Canon Tab ============= */}
            {activeTab === 'canon' && (
              <div className="camera-config-tab-content">
                {/* Canon Status Card */}
                <div className="canon-status-card">
                  <div className="canon-status-header">
                    <span className="canon-status-title">
                      สถานะการเชื่อมต่อ
                    </span>
                    <button
                      type="button"
                      className="canon-refresh-btn"
                      onClick={refreshCanonCameras}
                      disabled={isLoading}
                      title="รีเฟรช"
                    >
                      🔄
                    </button>
                  </div>
                  <div className="canon-status-items">
                    <div className="canon-status-item">
                      <span className="status-label">SDK:</span>
                      <span
                        className={`status-badge ${canonCameras.length >= 0 ? 'success' : 'error'}`}
                      >
                        พร้อมใช้งาน
                      </span>
                    </div>
                    <div className="canon-status-item">
                      <span className="status-label">กล้อง:</span>
                      <span
                        className={`status-badge ${canonConnected ? 'success' : 'warning'}`}
                      >
                        {canonConnected ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'}
                      </span>
                    </div>
                    <div className="canon-status-item">
                      <span className="status-label">Session:</span>
                      <span
                        className={`status-badge ${canonSessionOpen ? 'success' : 'warning'}`}
                      >
                        {canonSessionOpen ? 'เปิดอยู่' : 'ปิดอยู่'}
                      </span>
                    </div>
                    {canonBatteryLevel !== null && (
                      <div className="canon-status-item">
                        <span className="status-label">แบตเตอรี่:</span>
                        <span
                          className={`status-badge ${canonBatteryLevel > 20 ? 'success' : 'error'}`}
                        >
                          {canonBatteryLevel}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Canon Camera Selection */}
                <div className="camera-config-form">
                  <label htmlFor="canon-select" className="camera-config-label">
                    เลือกกล้อง Canon
                  </label>
                  <select
                    id="canon-select"
                    className="camera-config-select"
                    value={selectedCanonIndex}
                    onChange={(e) =>
                      setSelectedCanonIndex(Number(e.target.value))
                    }
                    disabled={isSaving || canonConnected}
                  >
                    <option value={-1}>-- เลือกกล้อง --</option>
                    {canonCameras.map((camera, index) => (
                      <option key={camera.portName} value={index}>
                        {camera.name} ({camera.portName})
                      </option>
                    ))}
                  </select>

                  {canonDisconnected && (
                    <div className="camera-config-warning" style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: '#856404' }}>
                        ⚠️ กล้อง Canon ที่ตั้งค่าไว้ขาดการเชื่อมต่อ
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.9em', color: '#856404' }}>
                        กรุณาตรวจสอบสาย USB ว่าเสียบอยู่ และเปิดกล้องแล้ว
                      </p>
                    </div>
                  )}

                  {canonCameras.length === 0 && !canonError && !canonDisconnected && (
                    <p className="camera-config-warning">
                      ไม่พบกล้อง Canon ที่เชื่อมต่อผ่าน USB
                      <br />
                      <small>• ตรวจสอบว่าเปิดกล้องแล้ว</small>
                      <br />
                      <small>• ต่อสาย USB เข้ากับคอมพิวเตอร์</small>
                      <br />
                      <small>• ติดตั้ง Canon EOS Utility แล้ว</small>
                    </p>
                  )}
                </div>

                {canonError && (
                  <p className="camera-config-error">{canonError}</p>
                )}

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
                  {canonConnected ? (
                    <>
                      <button
                        type="button"
                        className="camera-config-btn camera-config-btn-disconnect"
                        onClick={disconnectCanonCamera}
                        disabled={isSaving}
                      >
                        ยกเลิกการเชื่อมต่อ
                      </button>
                      {canonSessionOpen && (
                        <button
                          type="button"
                          className="camera-config-btn camera-config-btn-save"
                          onClick={handleSaveCanon}
                          disabled={isSaving}
                        >
                          {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="camera-config-btn camera-config-btn-save"
                      onClick={connectCanonCamera}
                      disabled={isSaving || selectedCanonIndex < 0}
                    >
                      {isSaving ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อ'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
