import React, { useState, useEffect, useCallback } from 'react';
import './PaperPositionConfigModal.css';

export interface PaperPositionConfig {
  landscapeWidth: number;
  landscapeHeight: number;
  portraitWidth: number;
  portraitHeight: number;
  type: number; // 1: landscape, 2: portrait
}

interface PaperPositionConfigModalProps {
  isOpen: boolean;
  onSave: (config: PaperPositionConfig) => void;
  onCancel: () => void;
}

// Helper function สำหรับปัดเศษเป็นทศนิยม 1 ตำแหน่ง
const roundToDecimal = (value: number, decimals: number = 1): number => {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
};

export default function PaperPositionConfigModal({
  isOpen,
  onSave,
  onCancel,
}: PaperPositionConfigModalProps): React.JSX.Element | null {
  const [landscapeWidth, setLandscapeWidth] = useState<number>(14);
  const [landscapeHeight, setLandscapeHeight] = useState<number>(16);
  const [portraitWidth, setPortraitWidth] = useState<number>(5);
  const [portraitHeight, setPortraitHeight] = useState<number>(5);
  const [type, setType] = useState<number>(1); // 1: landscape, 2: portrait
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      // @ts-ignore
      const result = await window.electron?.payment?.getPaperPositionConfig();
      if (result?.success && result.config) {
        setLandscapeWidth(roundToDecimal(result.config.landscapeWidth || 14));
        setLandscapeHeight(roundToDecimal(result.config.landscapeHeight || 16));
        setPortraitWidth(roundToDecimal(result.config.portraitWidth || 5));
        setPortraitHeight(roundToDecimal(result.config.portraitHeight || 5));
        setType(result.config.type || 1);
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
    // Validate values - อนุญาตให้มีค่าติดลบได้
    if (
      Number.isNaN(landscapeWidth) ||
      Number.isNaN(landscapeHeight) ||
      Number.isNaN(portraitWidth) ||
      Number.isNaN(portraitHeight)
    ) {
      setError('ค่าต้องเป็นตัวเลขที่ถูกต้อง');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const config: PaperPositionConfig = {
        landscapeWidth: roundToDecimal(landscapeWidth),
        landscapeHeight: roundToDecimal(landscapeHeight),
        portraitWidth: roundToDecimal(portraitWidth),
        portraitHeight: roundToDecimal(portraitHeight),
        type,
      };

      // @ts-ignore
      const result =
        await window.electron?.payment?.savePaperPositionConfig(config);
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
         ตั้งค่าขอบกระดาษ
        </h2>

        <p className="paper-position-config-modal-description">
          ปรับค่าขนาดภาพเพื่อลดขอบกระดาษ
        </p>

        {error && <p className="paper-position-config-error">{error}</p>}

        <div className="paper-position-config-inputs">
          <div className="paper-position-config-group">
            <h3 className="paper-position-config-group-title">{type === 1 ? 'ปรับขนาดภาพแนวตั้ง' : 'ปรับขนาดภาพแนวนอน'}</h3>
            <div className="paper-position-config-input-group">
              <label htmlFor="landscape-width" className="paper-position-config-label">
                Width (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() =>
                    setLandscapeWidth(roundToDecimal(landscapeWidth - 0.1))
                  }
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="landscape-width"
                  type="number"
                  step="0.1"
                  value={landscapeWidth}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setLandscapeWidth(roundToDecimal(value));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setLandscapeWidth(roundToDecimal(value));
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() =>
                    setLandscapeWidth(roundToDecimal(landscapeWidth + 0.1))
                  }
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
            <div className="paper-position-config-input-group">
              <label htmlFor="landscape-height" className="paper-position-config-label">
                Height (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() =>
                    setLandscapeHeight(roundToDecimal(landscapeHeight - 0.1))
                  }
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="landscape-height"
                  type="number"
                  step="0.1"
                  value={landscapeHeight}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setLandscapeHeight(roundToDecimal(value));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setLandscapeHeight(roundToDecimal(value));
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() =>
                    setLandscapeHeight(roundToDecimal(landscapeHeight + 0.1))
                  }
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="paper-position-config-group">
            <h3 className="paper-position-config-group-title">{type === 1 ? 'ปรับขนาดภาพแนวนอน' : 'ปรับขนาดภาพแนวตั้ง'}</h3>
            <div className="paper-position-config-input-group">
              <label htmlFor="portrait-width" className="paper-position-config-label">
                Width (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() =>
                    setPortraitWidth(roundToDecimal(portraitWidth - 0.1))
                  }
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="portrait-width"
                  type="number"
                  step="0.1"
                  value={portraitWidth}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setPortraitWidth(roundToDecimal(value));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setPortraitWidth(roundToDecimal(value));
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() =>
                    setPortraitWidth(roundToDecimal(portraitWidth + 0.1))
                  }
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
            <div className="paper-position-config-input-group">
              <label htmlFor="portrait-height" className="paper-position-config-label">
                Height (%):
              </label>
              <div className="paper-position-config-input-with-buttons">
                <button
                  type="button"
                  className="paper-position-config-button-decrement"
                  onClick={() =>
                    setPortraitHeight(roundToDecimal(portraitHeight - 0.1))
                  }
                  disabled={isLoading}
                  aria-label="ลดค่า"
                >
                  −
                </button>
                <input
                  id="portrait-height"
                  type="number"
                  step="0.1"
                  value={portraitHeight}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setPortraitHeight(roundToDecimal(value));
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!Number.isNaN(value)) {
                      setPortraitHeight(roundToDecimal(value));
                    }
                  }}
                  className="paper-position-config-input"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="paper-position-config-button-increment"
                  onClick={() =>
                    setPortraitHeight(roundToDecimal(portraitHeight + 0.1))
                  }
                  disabled={isLoading}
                  aria-label="เพิ่มค่า"
                >
                  +
                </button>
              </div>
            </div>
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
