import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../index';
import './PrintTest.css';

const TEST_IMAGE_URL =
  'https://sgp1.digitaloceanspaces.com/boniolabs/transactions/69399f7d3b0aa02cd9576618/photos/05042e81-94ac-448c-9fcb-7d500034dfb0.png';

interface EnvConfig {
  apiUrl: string;
  machinePort: string;
  machineId: string;
}

export default function PrintTest(): React.JSX.Element {
  const navigate = useNavigate();
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Position Paper Modal States
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [scale, setScale] = useState<number>(100);
  const [horizontal, setHorizontal] = useState<number>(0);
  const [vertical, setVertical] = useState<number>(0);
  const [originalScale, setOriginalScale] = useState<number>(100);
  const [originalHorizontal, setOriginalHorizontal] = useState<number>(0);
  const [originalVertical, setOriginalVertical] = useState<number>(0);
  const [envConfig, setEnvConfig] = useState<EnvConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load environment config and paper position
  useEffect(() => {
    const loadEnvConfigAndPaperPosition = async () => {
      try {
        // @ts-ignore
        const env = await window.electron?.payment?.getEnvVars();
        if (!env) {
          throw new Error('Failed to get environment variables');
        }

        const config: EnvConfig = {
          apiUrl: env.API_BASE_URL,
          machinePort: env.PORT,
          machineId: env.MACHINE_ID,
        };

        setEnvConfig(config);

        // ดึงค่า paperPosition จาก main process ผ่าน IPC
        // @ts-ignore
        const paperPositionResult =
          await window.electron?.payment?.getPaperPosition();

        if (paperPositionResult?.success && paperPositionResult.paperPosition) {
          const paperPos = paperPositionResult.paperPosition;
          console.log('🔍 [PrintTest] paperPos from IPC:', paperPos);

          // ใช้ค่า default ถ้าเป็น undefined หรือ null เท่านั้น (ไม่ใช้ || เพราะ 0 และ -16 เป็น falsy)
          const finalScale =
            paperPos.scale !== undefined && paperPos.scale !== null
              ? paperPos.scale
              : 100;
          const finalHorizontal =
            paperPos.horizontal !== undefined && paperPos.horizontal !== null
              ? paperPos.horizontal
              : 0;
          const finalVertical =
            paperPos.vertical !== undefined && paperPos.vertical !== null
              ? paperPos.vertical
              : 0;

          console.log('🔍 [PrintTest] Setting values:', {
            finalScale,
            finalHorizontal,
            finalVertical,
          });

          setScale(finalScale);
          setHorizontal(finalHorizontal);
          setVertical(finalVertical);
          setOriginalScale(finalScale);
          setOriginalHorizontal(finalHorizontal);
          setOriginalVertical(finalVertical);

          console.log('✅ [PrintTest] Paper position loaded from IPC:', {
            scale: finalScale,
            horizontal: finalHorizontal,
            vertical: finalVertical,
          });
        } else {
          console.log(
            '⚠️ [PrintTest] No paperPosition from IPC, using defaults',
          );
        }
      } catch (error) {
        console.error(
          '❌ [PrintTest] Failed to load env config or paper position:',
          error,
        );
        // ไม่ต้อง set fallback เพราะ env.config.ts จะมี default values อยู่แล้ว
      }
    };
    loadEnvConfigAndPaperPosition();
  }, []);

  // Debug: Log state changes
  useEffect(() => {
    console.log('🔄 [PrintTest] State updated:', {
      scale,
      horizontal,
      vertical,
      originalScale,
      originalHorizontal,
      originalVertical,
    });
  }, [
    scale,
    horizontal,
    vertical,
    originalScale,
    originalHorizontal,
    originalVertical,
  ]);

  const handleBack = () => {
    navigate('/');
  };

  const handleOpenPositionModal = () => {
    console.log('🔍 [PrintTest] Opening modal with current values:', {
      scale,
      horizontal,
      vertical,
    });
    setOriginalScale(scale);
    setOriginalHorizontal(horizontal);
    setOriginalVertical(vertical);
    setIsPositionModalOpen(true);
  };

  const handleClosePositionModal = () => {
    // Reset to original values
    setScale(originalScale);
    setHorizontal(originalHorizontal);
    setVertical(originalVertical);
    setIsPositionModalOpen(false);
  };

  const handleSavePosition = async () => {
    if (!envConfig) {
      console.error('❌ [PrintTest] Environment config not loaded');
      return;
    }

    setIsSaving(true);
    try {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('X-Machine-Port', String(envConfig.machinePort));
      headers.set('X-Machine-Id', envConfig.machineId || '');

      const response = await fetch(
        `${envConfig.apiUrl}/api/machines-public/paperPosition`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            scale,
            horizontal,
            vertical,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to update paper position: ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log('✅ [PrintTest] Paper position updated:', data);

      // Update original values
      setOriginalScale(scale);
      setOriginalHorizontal(horizontal);
      setOriginalVertical(vertical);
      setIsPositionModalOpen(false);
    } catch (error) {
      console.error('❌ [PrintTest] Error updating paper position:', error);
      alert('ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองอีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    return (
      scale !== originalScale ||
      horizontal !== originalHorizontal ||
      vertical !== originalVertical
    );
  };

  const convertImageUrlToDataUrl = async (
    imageUrl: string,
  ): Promise<string> => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error(
        `Failed to convert image URL to data URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  const handlePrint = async () => {
    if (isPrinting) {
      console.log('⚠️ [PrintTest] Already printing, skipping...');
      return;
    }

    setIsPrinting(true);
    setPrintStatus('printing');
    setErrorMessage('');

    try {
      console.log('🖨️ [PrintTest] Starting print test...', {
        copies,
        imageUrl: TEST_IMAGE_URL,
      });

      // แปลง image URL เป็น data URL
      console.log('📥 [PrintTest] Converting image URL to data URL...');
      const imageDataUrl = await convertImageUrlToDataUrl(TEST_IMAGE_URL);
      console.log('✅ [PrintTest] Image converted successfully');

      // เรียก print function
      console.log('🖨️ [PrintTest] Calling print function...');
      // @ts-ignore
      if (window.electron?.print?.printPhoto) {
        // @ts-ignore
        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          // @ts-ignore
          window.electron.print.onPrintResponse(
            (result: { success: boolean; error?: string }) => {
              // @ts-ignore
              window.electron.print.removePrintResponseListener();
              resolve(result);
            },
          );

          // @ts-ignore
          window.electron.print.printPhoto({
            imageDataUrl,
            frameId: 'test',
            frameName: 'Test Print',
            copies,
            orientation: 'portrait', // ใช้ portrait ตามที่ต้องการ
          });

          // Timeout after 60 seconds
          setTimeout(() => {
            // @ts-ignore
            window.electron.print.removePrintResponseListener();
            resolve({
              success: false,
              error: 'Print timeout after 60 seconds',
            });
          }, 60000);
        });

        if (response.success) {
          console.log('✅ [PrintTest] Print successful!');
          setPrintStatus('success');
        } else {
          const error = response.error || 'Unknown error';
          console.error('❌ [PrintTest] Print failed:', error);
          setPrintStatus('error');
          setErrorMessage(error);
        }
      } else {
        throw new Error('Print function not available');
      }
    } catch (error) {
      console.error('❌ [PrintTest] Error:', error);
      setPrintStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="print-test-container">
      {/* Header */}
      <div className="print-test-header">
        <BackButton onBackClick={handleBack} disabled={isPrinting} />
        <h1 className="print-test-title">เทสปริ้น</h1>
      </div>

      {/* Main Content */}
      <div className="print-test-content">
        {/* Image Preview */}
        <div className="print-test-image-section">
          <h2 className="section-title">รูปภาพทดสอบ</h2>
          <div className="image-preview-container">
            <img src={TEST_IMAGE_URL} alt="Test print" className="test-image" />
          </div>
        </div>

        {/* Print Settings */}
        <div className="print-test-settings">
          <div className="section-header">
            <h2 className="section-title">ตั้งค่าการพิมพ์</h2>
            <button
              type="button"
              className="position-paper-button"
              onClick={handleOpenPositionModal}
              disabled={isPrinting}
            >
              Position Paper
            </button>
          </div>

          <div className="setting-group">
            <label htmlFor="copies" className="setting-label">
              จำนวนที่จะพิมพ์:
            </label>
            <div className="copies-input-group">
              <button
                type="button"
                className="copies-button"
                onClick={() => setCopies(Math.max(1, copies - 1))}
                disabled={isPrinting || copies <= 1}
              >
                −
              </button>
              <input
                id="copies"
                type="number"
                min="1"
                max="3"
                value={copies}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 3);
                  if (!Number.isNaN(value) && value >= 1 && value <= 3) {
                    setCopies(value);
                  }
                }}
                className="copies-input"
                disabled={isPrinting}
              />
              <button
                type="button"
                className="copies-button"
                onClick={() => setCopies(Math.min(3, copies + 1))}
                disabled={isPrinting || copies >= 3}
              >
                +
              </button>
            </div>
            <p className="setting-hint">เลือกจำนวน 1-3 แผ่น</p>
          </div>

          <div className="setting-group">
            <p className="setting-info">
              <strong>Orientation:</strong> Portrait (ตั้ง)
            </p>
          </div>

          {/* Print Status */}
          {printStatus === 'printing' && (
            <div className="print-status printing">
              <div className="loading-spinner" />
              <p>กำลังพิมพ์...</p>
            </div>
          )}

          {printStatus === 'success' && (
            <div className="print-status success">
              <p>✅ พิมพ์สำเร็จ!</p>
            </div>
          )}

          {printStatus === 'error' && (
            <div className="print-status error">
              <p>❌ พิมพ์ไม่สำเร็จ</p>
              {errorMessage && <p className="error-message">{errorMessage}</p>}
            </div>
          )}

          {/* Print Button */}
          <button
            type="button"
            className="print-button"
            onClick={handlePrint}
            disabled={isPrinting}
          >
            {isPrinting ? 'กำลังพิมพ์...' : `พิมพ์ ${copies} แผ่น`}
          </button>
        </div>
      </div>

      {/* Position Paper Modal */}
      {isPositionModalOpen && (
        <div
          className="modal-overlay"
          onClick={handleClosePositionModal}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleClosePositionModal();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="position-paper-title"
            aria-describedby="position-paper-description"
          >
            <h2 id="position-paper-title" className="modal-title">
              Position Paper
            </h2>
            <p id="position-paper-description" className="modal-description">
              Use to center your print on paper if the print out is not
              correctly aligned or cropped.
            </p>

            <div className="slider-group">
              <div className="slider-item">
                <label htmlFor="scale-slider" className="slider-label">
                  Scale
                </label>
                <div className="slider-container">
                  <input
                    id="scale-slider"
                    type="range"
                    min="50"
                    max="150"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="slider slider-horizontal"
                  />
                  <span className="slider-value">{scale}</span>
                </div>
              </div>

              <div className="slider-item">
                <label htmlFor="horizontal-slider" className="slider-label">
                  Horizontal position
                </label>
                <div className="slider-container">
                  <input
                    id="horizontal-slider"
                    type="range"
                    min="-50"
                    max="50"
                    value={horizontal}
                    onChange={(e) => setHorizontal(Number(e.target.value))}
                    className="slider slider-horizontal"
                  />
                  <span className="slider-value">{horizontal}</span>
                </div>
              </div>

              <div className="slider-item">
                <label htmlFor="vertical-slider" className="slider-label">
                  Vertical position
                </label>
                <div className="slider-container-vertical">
                  <input
                    id="vertical-slider"
                    type="range"
                    min="-50"
                    max="50"
                    value={vertical}
                    onChange={(e) => setVertical(Number(e.target.value))}
                    className="slider slider-vertical"
                  />
                  <span className="slider-value">{vertical}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-button modal-button-cancel"
                onClick={handleClosePositionModal}
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="modal-button modal-button-confirm"
                onClick={handleSavePosition}
                disabled={isSaving || !hasChanges()}
              >
                {isSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
