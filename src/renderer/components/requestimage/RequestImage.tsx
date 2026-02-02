import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../backbutton';
import PaperPositionConfigModal from '../paperpositionconfigmodal';
import Countdown from '../countdown';
import './RequestImage.css';
import AlertModal from '../alertmodal';

interface EnvConfig {
  apiUrl: string;
  machinePort: string;
  machineId: string;
}

export default function RequestImage(): React.JSX.Element {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [orientation, setOrientation] = useState<
    'portrait' | 'landscape' | 'portrait-cut'
  >('portrait');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [imageError, setImageError] = useState<string>('');
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);

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
  const [isPaperPositionConfigModalOpen, setIsPaperPositionConfigModalOpen] =
    useState(false);

  const [alertText, setAlertText] = useState('');

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
          console.log('🔍 [RequestImage] paperPos from IPC:', paperPos);

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

          setScale(finalScale);
          setHorizontal(finalHorizontal);
          setVertical(finalVertical);
          setOriginalScale(finalScale);
          setOriginalHorizontal(finalHorizontal);
          setOriginalVertical(finalVertical);
        }
      } catch (error) {
        console.error(
          '❌ [RequestImage] Failed to load env config or paper position:',
          error,
        );
      }
    };
    loadEnvConfigAndPaperPosition();
  }, []);

  const handleCountdownComplete = useCallback(() => {
    console.log(
      '⏰ [RequestImage] Countdown completed, auto-navigating to home',
    );
    navigate('/');
  }, [navigate]);

  const handleBack = () => {
    navigate('/');
  };

  const handleImageUrlChange = (url: string) => {
    setImageUrl(url);
    setImageError('');
    setImageLoaded(false);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError('');
  };

  const handleImageError = () => {
    setImageLoaded(false);
    setImageError('ไม่สามารถโหลดรูปภาพได้ กรุณาตรวจสอบ URL');
  };

  const handleOpenPositionModal = () => {
    setOriginalScale(scale);
    setOriginalHorizontal(horizontal);
    setOriginalVertical(vertical);
    setIsPositionModalOpen(true);
  };

  const handleClosePositionModal = () => {
    setScale(originalScale);
    setHorizontal(originalHorizontal);
    setVertical(originalVertical);
    setIsPositionModalOpen(false);
  };

  const handleSavePosition = async () => {
    if (!envConfig) {
      console.error('❌ [RequestImage] Environment config not loaded');
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
      console.log('✅ [RequestImage] Paper position updated:', data);

      setOriginalScale(scale);
      setOriginalHorizontal(horizontal);
      setOriginalVertical(vertical);
      setIsPositionModalOpen(false);
    } catch (error) {
      console.error('❌ [RequestImage] Error updating paper position:', error);
      setAlertText('ไม่สามารถบันทึกการตั้งค่าได้ กรุณาลองอีกครั้ง');
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

  const convertImageUrlToDataUrl = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
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
      console.log('⚠️ [RequestImage] Already printing, skipping...');
      return;
    }

    if (!imageUrl.trim()) {
      setPrintStatus('error');
      setErrorMessage('กรุณาระบุ URL รูปภาพ');
      return;
    }

    if (!imageLoaded) {
      setPrintStatus('error');
      setErrorMessage('กรุณารอให้รูปภาพโหลดเสร็จก่อน');
      return;
    }

    setIsPrinting(true);
    setPrintStatus('printing');
    setErrorMessage('');

    try {
      console.log('🖨️ [RequestImage] Starting print...', {
        copies,
        orientation,
        imageUrl,
      });

      // แปลง image URL เป็น data URL
      console.log('📥 [RequestImage] Converting image URL to data URL...');
      let imageDataUrl = await convertImageUrlToDataUrl(imageUrl);
      console.log('✅ [RequestImage] Image converted successfully');

      // ตรวจสอบว่าเป็น portrait-cut (2x6) หรือไม่
      const isPortraitCut = orientation === 'portrait-cut';
      const imageSize = isPortraitCut ? '1200x3600' : undefined; // 2x6 frame = 1200x3600

      // ถ้าเป็น portrait-cut ให้ duplicate ภาพ 2x6 ให้เป็น 4x6
      if (isPortraitCut) {
        console.log('=== DUPLICATING IMAGE FOR PRINT (2x6 -> 4x6) ===');
        const doubleCanvas = document.createElement('canvas');
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // 2x6 frame = 1200x3600, 4x6 = 2400x3600
            const frameWidth = 1200;
            const frameHeight = 3600;

            doubleCanvas.width = frameWidth * 2; // 2400
            doubleCanvas.height = frameHeight; // 3600
            // ใช้ srgb color space เพื่อให้สีถูกต้อง
            const dCtx = doubleCanvas.getContext('2d', { colorSpace: 'srgb' });

            if (dCtx) {
              // Fill with white background
              dCtx.fillStyle = '#ffffff';
              dCtx.fillRect(0, 0, doubleCanvas.width, doubleCanvas.height);

              // Draw image twice: left and right
              dCtx.drawImage(img, 0, 0, frameWidth, frameHeight);
              dCtx.drawImage(img, frameWidth, 0, frameWidth, frameHeight);

              // ใช้ quality 1.0 สำหรับ print output - คุณภาพสูงสุด
              imageDataUrl = doubleCanvas.toDataURL('image/jpeg', 1.0);
              console.log(
                '✅ [RequestImage] Image duplicated successfully (2x6 -> 4x6)',
              );
              resolve();
            } else {
              reject(new Error('Failed to get canvas context'));
            }
          };

          img.onerror = () => {
            reject(new Error('Failed to load image for duplication'));
          };

          img.src = imageDataUrl;
        });
      }

      // เรียก print function
      console.log('🖨️ [RequestImage] Calling print function...', {
        orientation,
        isPortraitCut,
        imageSize,
      });
      // @ts-ignore
      if (window.electron?.print?.printPhoto) {
        // ลบ listener เก่าก่อนเพื่อป้องกัน listener ซ้อน
        // @ts-ignore
        window.electron.print.removePrintResponseListener();

        // @ts-ignore
        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          let resolved = false;

          // @ts-ignore
          window.electron.print.onPrintResponse(
            (result: { success: boolean; error?: string }) => {
              if (!resolved) {
                resolved = true;
                console.log(
                  '🖨️ [RequestImage] Print response received:',
                  result,
                );
                // @ts-ignore
                window.electron.print.removePrintResponseListener();
                resolve(result);
              }
            },
          );

          // @ts-ignore
          window.electron.print.printPhoto({
            imageDataUrl,
            frameId: 'request-image',
            frameName: 'Request Image Print',
            copies,
            orientation: isPortraitCut ? 'portrait' : orientation, // ส่ง portrait สำหรับ portrait-cut
            imageSize, // ส่ง imageSize เพื่อให้ระบบรู้ว่าเป็น 2x6 และจะตัดได้
            horizontal, // ค่า horizontal จาก paper position
            vertical, // ค่า vertical จาก paper position
          });

          // Timeout after 60 seconds
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.warn('⚠️ [RequestImage] Print timeout after 60 seconds');
              // @ts-ignore
              window.electron.print.removePrintResponseListener();
              resolve({
                success: false,
                error: 'Print timeout after 60 seconds',
              });
            }
          }, 60000);
        });

        if (response.success) {
          console.log('✅ [RequestImage] Print successful!');
          setPrintStatus('success');
        } else {
          const error = response.error || 'Unknown error';
          console.error('❌ [RequestImage] Print failed:', error);
          setPrintStatus('error');
          setErrorMessage(error);
        }
      } else {
        throw new Error('Print function not available');
      }
    } catch (error) {
      console.error('❌ [RequestImage] Error:', error);
      setPrintStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="request-image-container">
      <div className="request-image-back-btn-container">
        <BackButton onBackClick={handleBack} disabled={isPrinting} />
      </div>

      {/* Header */}
      <div className="request-image-header">
        <h1 className="request-image-title">ปริ้นย้อนหลัง</h1>
      </div>

      {/* Countdown Timer - นับถอยหลัง 10 นาที แล้วไปหน้าแรกอัตโนมัติ */}
      <Countdown
        seconds={600}
        onComplete={handleCountdownComplete}
        visible={isPrinting || printStatus === 'success'}
      />

      {/* Main Content */}
      <div className="request-image-content">
        {/* Image URL Input */}
        <div className="request-image-url-section">
          <h2 className="section-title">ระบุ URL รูปภาพ</h2>
          <div className="url-input-group">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => handleImageUrlChange(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="url-input"
              disabled={isPrinting}
            />
            {imageError && <p className="error-message">{imageError}</p>}
          </div>
        </div>

        {/* Image Preview */}
        {imageUrl && (
          <div className="request-image-preview-section">
            <h2 className="section-title">Preview รูปภาพ</h2>
            <div className="image-preview-container">
              {!imageLoaded && !imageError && (
                <div className="image-loading">
                  <div className="loading-spinner" />
                  <p>กำลังโหลดรูปภาพ...</p>
                </div>
              )}
              {imageError && (
                <div className="image-error">
                  <p>❌ {imageError}</p>
                </div>
              )}
              <img
                src={imageUrl}
                alt="Preview"
                className="preview-image"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ display: imageLoaded ? 'block' : 'none' }}
              />
            </div>
          </div>
        )}

        {/* Print Settings */}
        <div className="request-image-settings">
          {/* <div className="section-header">
            <h2 className="section-title">ตั้งค่าการพิมพ์</h2>
            <div>
              <button
                type="button"
                className="position-paper-button"
                onClick={() => setIsPaperPositionConfigModalOpen(true)}
                disabled={isPrinting}
              >
                Developer Config
              </button>
            </div>
          </div> */}

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
                max="5"
                value={copies}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!Number.isNaN(value) && value >= 1 && value <= 5) {
                    setCopies(value);
                  }
                }}
                className="copies-input"
                disabled={isPrinting}
              />
              <button
                type="button"
                className="copies-button"
                onClick={() => setCopies(Math.min(5, copies + 1))}
                disabled={isPrinting || copies >= 5}
              >
                +
              </button>
            </div>
          </div>

          <div className="setting-group">
            <label htmlFor="orientation" className="setting-label">
              Orientation:
            </label>
            <select
              id="orientation"
              value={orientation}
              onChange={(e) =>
                setOrientation(
                  e.target.value as 'portrait' | 'landscape' | 'portrait-cut',
                )
              }
              className="orientation-select"
              disabled={isPrinting}
            >
              <option value="portrait">Portrait (ตั้ง) 4x6</option>
              <option value="portrait-cut">Portrait Cut (ตั้ง-ตัด) 2x6</option>
              <option value="landscape">Landscape (นอน) 6x4</option>
            </select>
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
            disabled={isPrinting || !imageUrl.trim() || !imageLoaded}
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

      {/* Paper Position Config Modal */}
      <PaperPositionConfigModal
        isOpen={isPaperPositionConfigModalOpen}
        onSave={() => {
          setIsPaperPositionConfigModalOpen(false);
          setAlertText('บันทึกการตั้งค่าสำเร็จ');
        }}
        onCancel={() => setIsPaperPositionConfigModalOpen(false)}
      />

      <AlertModal
        isOpen={!!alertText}
        title={printStatus === 'error' ? 'เกิดข้อผิดพลาด' : 'สำเร็จ'}
        message={alertText}
        onConfirm={() => {
          setAlertText('');
        }}
      />
    </div>
  );
}
