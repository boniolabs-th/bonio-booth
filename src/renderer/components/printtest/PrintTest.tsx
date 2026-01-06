/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BackButton from '../backbutton';
import PaperPositionConfigModal from '../paperpositionconfigmodal';
import './PrintTest.css';

const TEST_IMAGE_PORTRAIT_URL = '../../../assets/images/image-print-test.png';
const TEST_IMAGE_LANDSCAPE_URL =
  '../../../assets/images/image-print-lanscape-test.jpg';

export default function PrintTest(): React.JSX.Element {
  const navigate = useNavigate();
  const [copies, setCopies] = useState<number>(1);
  const [orientation, setOrientation] = useState<
    'portrait' | 'landscape' | 'portrait-cut'
  >('portrait');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Position Paper States
  const [scale, setScale] = useState<number>(100);
  const [horizontal, setHorizontal] = useState<number>(0);
  const [vertical, setVertical] = useState<number>(0);
  const [isPaperPositionConfigModalOpen, setIsPaperPositionConfigModalOpen] =
    useState(false);

  // Load paper position
  useEffect(() => {
    const loadPaperPosition = async () => {
      try {
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
    loadPaperPosition();
  }, []);

  // Debug: Log state changes
  useEffect(() => {
    console.log('🔄 [PrintTest] State updated:', {
      scale,
      horizontal,
      vertical,
    });
  }, [scale, horizontal, vertical]);

  const handleBack = () => {
    navigate('/');
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
      const testImageUrl =
        orientation === 'portrait' || orientation === 'portrait-cut'
          ? TEST_IMAGE_PORTRAIT_URL
          : TEST_IMAGE_LANDSCAPE_URL;
      console.log('🖨️ [PrintTest] Starting print test...', {
        copies,
        orientation,
        imageUrl: testImageUrl,
      });

      // แปลง image URL เป็น data URL
      console.log('📥 [PrintTest] Converting image URL to data URL...');
      const imageDataUrl = await convertImageUrlToDataUrl(testImageUrl);
      console.log('✅ [PrintTest] Image converted successfully');

      // ตรวจสอบว่าเป็น portrait-cut (2x6) หรือไม่ เพื่อส่ง imageSize
      const isPortraitCut = orientation === 'portrait-cut';
      const imageSize = isPortraitCut ? '1200x3600' : undefined; // 2x6 frame = 1200x3600

      // เรียก print function
      console.log('🖨️ [PrintTest] Calling print function...', {
        orientation,
        isPortraitCut,
        imageSize,
      });
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
            orientation: isPortraitCut ? 'portrait' : orientation, // ส่ง portrait สำหรับ portrait-cut
            imageSize, // ส่ง imageSize เพื่อให้ระบบรู้ว่าเป็น 2x6 และจะตัดได้
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
      <BackButton onBackClick={handleBack} disabled={isPrinting} />
      <div className="print-test-header">
        <h1 className="print-test-title">เทสปริ้น</h1>
      </div>

      {/* Main Content */}
      <div className="print-test-content">
        {/* Image Preview */}
        <div className="print-test-image-section">
          <h2 className="section-title">รูปภาพทดสอบ</h2>
          <div className="image-preview-container">
            <img
              src={
                orientation === 'portrait' || orientation === 'portrait-cut'
                  ? TEST_IMAGE_PORTRAIT_URL
                  : TEST_IMAGE_LANDSCAPE_URL
              }
              alt="Test print"
              className="test-image"
            />
          </div>
        </div>

        {/* Print Settings */}
        <div className="print-test-settings">
          <div className="section-header">
            <h2 className="section-title">ตั้งค่าการพิมพ์</h2>
            <div>
              <button
                type="button"
                className="position-paper-button"
                onClick={() => setIsPaperPositionConfigModalOpen(true)}
                disabled={isPrinting}
              >
                Deverper Config
              </button>
            </div>
          </div>

          <div className="setting-group">
            <label htmlFor="orientation" className="setting-label">
              ขนาดกระดาษ:
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

          <div className="position-paper-section">
            <h2 id="position-paper-title" className="section-title">
              Position Paper
            </h2>

            <div className="slider-group">
              <div className="slider-item">
                <div className="slider-container-label">
                  <label htmlFor="scale-slider" className="slider-label">
                    Scale
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="150"
                    value={scale}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value >= 50 && value <= 150) {
                        setScale(value);
                      }
                    }}
                    className="slider-value-input"
                    disabled={isPrinting}
                    aria-label="Scale value"
                    title="Scale value"
                  />
                </div>
                <div className="slider-container-with-buttons">
                  <button
                    type="button"
                    className="slider-button-decrement"
                    onClick={() => setScale(Math.max(50, scale - 1))}
                    disabled={isPrinting}
                    aria-label="ลดค่า"
                  >
                    −
                  </button>

                  <input
                    id="scale-slider"
                    type="range"
                    min="50"
                    max="150"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="slider slider-horizontal"
                  />
                  <button
                    type="button"
                    className="slider-button-increment"
                    onClick={() => setScale(Math.min(150, scale + 1))}
                    disabled={isPrinting}
                    aria-label="เพิ่มค่า"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="slider-item">
                <div className="slider-container-label">
                  <label htmlFor="horizontal-slider" className="slider-label">
                    Horizontal position
                  </label>
                  <input
                    type="number"
                    min="-50"
                    max="50"
                    value={horizontal}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value >= -50 && value <= 50) {
                        setHorizontal(value);
                      }
                    }}
                    className="slider-value-input"
                    disabled={isPrinting}
                    aria-label="Horizontal position value"
                    title="Horizontal position value"
                  />
                </div>
                <div className="slider-container-with-buttons">
                  <button
                    type="button"
                    className="slider-button-decrement"
                    onClick={() => setHorizontal(Math.max(-50, horizontal - 1))}
                    disabled={isPrinting}
                    aria-label="ลดค่า"
                  >
                    −
                  </button>

                  <input
                    id="horizontal-slider"
                    type="range"
                    min="-50"
                    max="50"
                    value={horizontal}
                    onChange={(e) => setHorizontal(Number(e.target.value))}
                    className="slider slider-horizontal"
                  />
                  <button
                    type="button"
                    className="slider-button-increment"
                    onClick={() => setHorizontal(Math.min(50, horizontal + 1))}
                    disabled={isPrinting}
                    aria-label="เพิ่มค่า"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="slider-item">
                <div className="slider-container-label">
                  <label htmlFor="vertical-slider" className="slider-label">
                    Vertical position
                  </label>

                  <input
                    type="number"
                    min="-50"
                    max="50"
                    value={vertical}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && value >= -50 && value <= 50) {
                        setVertical(value);
                      }
                    }}
                    className="slider-value-input-vertical"
                    disabled={isPrinting}
                    aria-label="Vertical position value"
                    title="Vertical position value"
                  />
                </div>
                <div className="slider-container-vertical-with-buttons">
                  <button
                    type="button"
                    className="slider-button-decrement-vertical"
                    onClick={() => setVertical(Math.max(-50, vertical - 1))}
                    disabled={isPrinting}
                    aria-label="ลดค่า"
                  >
                    −
                  </button>

                  <div className="slider-vertical-wrapper">
                    <input
                      id="vertical-slider"
                      type="range"
                      min="-50"
                      max="50"
                      value={vertical}
                      onChange={(e) => setVertical(Number(e.target.value))}
                      className="slider slider-vertical"
                    />
                  </div>
                  <button
                    type="button"
                    className="slider-button-increment-vertical"
                    onClick={() => setVertical(Math.min(50, vertical + 1))}
                    disabled={isPrinting}
                    aria-label="เพิ่มค่า"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
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

      {/* Paper Position Config Modal */}
      <PaperPositionConfigModal
        isOpen={isPaperPositionConfigModalOpen}
        onSave={() => {
          setIsPaperPositionConfigModalOpen(false);
          alert('บันทึกการตั้งค่าสำเร็จ');
        }}
        onCancel={() => setIsPaperPositionConfigModalOpen(false)}
      />
    </div>
  );
}
