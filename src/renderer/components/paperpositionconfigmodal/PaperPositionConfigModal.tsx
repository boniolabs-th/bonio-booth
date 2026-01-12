import React, { useState, useEffect, useCallback } from 'react';
import './PaperPositionConfigModal.css';

export interface PaperPositionConfig {
  landscapeScale: number; // เปอร์เซ็นต์ (100 = 100%, 50 = 50%, 150 = 150%)
  portraitScale: number; // เปอร์เซ็นต์ (100 = 100%, 50 = 50%, 150 = 150%)
  type: number; // 1: landscape, 2: portrait
}

interface PaperPositionConfigModalProps {
  isOpen: boolean;
  onSave: (config: PaperPositionConfig) => void;
  onCancel: () => void;
}

export default function PaperPositionConfigModal({
  isOpen,
  onSave,
  onCancel,
}: PaperPositionConfigModalProps): React.JSX.Element | null {
  const [landscapeScale, setLandscapeScale] = useState<number>(100);
  const [portraitScale, setPortraitScale] = useState<number>(100);
  const [type, setType] = useState<number>(2); // 1: landscape, 2: portrait
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      // @ts-ignore
      const result = await window.electron?.payment?.getPaperPositionConfig();
      if (result?.success && result.config) {
        setLandscapeScale(result.config.landscapeScale ?? 100);
        setPortraitScale(result.config.portraitScale ?? 100);
        setType(result.config.type ?? 2);
      }
    } catch (err) {
      console.error(
        '❌ [PaperPositionConfigModal] Failed to load config:',
        err,
      );
      setError('ไม่สามารถโหลดการตั้งค่าได้');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async () => {
    try {
      setIsLoading(true);
      setError('');
      console.log('🔄 [PaperPositionConfigModal] Loading default config...');

      // @ts-ignore
      if (!window.electron?.payment?.getDefaultPaperPositionConfig) {
        console.error(
          '❌ [PaperPositionConfigModal] getDefaultPaperPositionConfig not available',
        );
        setError('ฟังก์ชันไม่พร้อมใช้งาน กรุณา restart แอป');
        return;
      }

      // @ts-ignore
      const result =
        await window.electron?.payment?.getDefaultPaperPositionConfig();

      console.log(
        '📋 [PaperPositionConfigModal] Default config result:',
        result,
      );

      if (result?.success && result.config) {
        console.log(
          '✅ [PaperPositionConfigModal] Setting default values:',
          result.config,
        );
        setLandscapeScale(result.config.landscapeScale ?? 100);
        setPortraitScale(result.config.portraitScale ?? 100);
        setType(result.config.type ?? 2);
      } else {
        const errorMsg = result?.error || 'ไม่สามารถโหลดค่าเริ่มต้นได้';
        console.error(
          '❌ [PaperPositionConfigModal] Failed to load default:',
          errorMsg,
        );
        setError(errorMsg);
      }
    } catch (err) {
      console.error(
        '❌ [PaperPositionConfigModal] Failed to load default config:',
        err,
      );
      setError(
        err instanceof Error ? err.message : 'ไม่สามารถโหลดค่าเริ่มต้นได้',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = useCallback(() => {
    setError('');
    onCancel();
  }, [onCancel]);

  // โหลด config เมื่อเปิด modal
  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  // จัดการ Escape key เพื่อปิด modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
    return undefined;
  }, [isOpen, handleCancel]);

  const handleSave = async () => {
    // Validate values
    if (
      Number.isNaN(landscapeScale) ||
      Number.isNaN(portraitScale) ||
      landscapeScale < 50 ||
      landscapeScale > 150 ||
      portraitScale < 50 ||
      portraitScale > 150
    ) {
      setError('ค่า Scale ต้องอยู่ระหว่าง 50-150%');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const config: PaperPositionConfig = {
        landscapeScale: Math.round(landscapeScale),
        portraitScale: Math.round(portraitScale),
        type,
      };

      // @ts-ignore - Service ยังต้องการ width/height แต่เราไม่ใช้แล้ว ส่งค่า default
      const result = await window.electron?.payment?.savePaperPositionConfig({
        ...config,
        landscapeWidth: 0,
        landscapeHeight: 0,
        portraitWidth: 0,
        portraitHeight: 0,
      });
      if (result?.success) {
        onSave(config);
      } else {
        setError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error(
        '❌ [PaperPositionConfigModal] Failed to save config:',
        err,
      );
      setError('ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="paper-position-config-modal-overlay"
      onClick={handleCancel}
      role="presentation"
      aria-label="ปิด modal"
    >
      <div
        className="paper-position-config-modal-content"
        onClick={(e) => e.stopPropagation()}
        // onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2 className="paper-position-config-modal-title">
          ตั้งค่า Scale และ Type
        </h2>

        <p className="paper-position-config-modal-description">
          ปรับค่า Scale สำหรับภาพแนวนอนและแนวตั้ง
        </p>

        {error && <p className="paper-position-config-error">{error}</p>}

        <div className="paper-position-config-inputs">
          <div className="paper-position-config-group">
            <h3 className="paper-position-config-group-title">
              Scale แนวนอน (Landscape)
            </h3>
            <div className="paper-position-config-input-group">
              <label
                htmlFor="landscape-scale"
                className="paper-position-config-label"
              >
                Scale (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() => {
                    const newValue = Math.max(50, landscapeScale - 1);
                    setLandscapeScale(newValue);
                  }}
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="landscape-scale"
                  type="number"
                  step="1"
                  min="50"
                  max="150"
                  value={landscapeScale}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) {
                      const clampedValue = Math.max(50, Math.min(150, value));
                      setLandscapeScale(clampedValue);
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) {
                      const clampedValue = Math.max(50, Math.min(150, value));
                      setLandscapeScale(clampedValue);
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() => {
                    const newValue = Math.min(150, landscapeScale + 1);
                    setLandscapeScale(newValue);
                  }}
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="paper-position-config-group">
            <h3 className="paper-position-config-group-title">
              Scale แนวตั้ง (Portrait)
            </h3>
            <div className="paper-position-config-input-group">
              <label
                htmlFor="portrait-scale"
                className="paper-position-config-label"
              >
                Scale (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() => {
                    const newValue = Math.max(50, portraitScale - 1);
                    setPortraitScale(newValue);
                  }}
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="portrait-scale"
                  type="number"
                  step="1"
                  min="50"
                  max="150"
                  value={portraitScale}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) {
                      const clampedValue = Math.max(50, Math.min(150, value));
                      setPortraitScale(clampedValue);
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (!Number.isNaN(value)) {
                      const clampedValue = Math.max(50, Math.min(150, value));
                      setPortraitScale(clampedValue);
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() => {
                    const newValue = Math.min(150, portraitScale + 1);
                    setPortraitScale(newValue);
                  }}
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="paper-position-config-group">
            <h3 className="paper-position-config-group-title">
              Type Transform
            </h3>
            <div className="paper-position-config-input-group">
              <span className="paper-position-config-label">
                Type Transform:
              </span>
              <div className="paper-position-config-toggle-group">
                <button
                  type="button"
                  className={`paper-position-config-toggle-button ${
                    type === 1 ? 'active' : ''
                  }`}
                  onClick={() => setType(1)}
                  disabled={isLoading}
                  aria-label="เลือก Landscape"
                >
                  Type 1
                </button>
                <button
                  type="button"
                  className={`paper-position-config-toggle-button ${
                    type === 2 ? 'active' : ''
                  }`}
                  onClick={() => setType(2)}
                  disabled={isLoading}
                  aria-label="เลือก Portrait"
                >
                  Type 2
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="paper-position-config-actions">
          <button
            type="button"
            className="paper-position-config-button paper-position-config-button-default"
            onClick={handleSetDefault}
            disabled={isLoading}
          >
            Set Default
          </button>
          <button
            type="button"
            className="paper-position-config-button paper-position-config-button-cancel"
            onClick={handleCancel}
            disabled={isLoading}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="paper-position-config-button paper-position-config-button-save"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'กำลังบันทึก...' : 'ตกลง'}
          </button>
        </div>
      </div>
    </div>
  );
}
