import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './PrintTest.css';

const TEST_IMAGE_URL =
  'https://sgp1.digitaloceanspaces.com/boniolabs/transactions/69399f7d3b0aa02cd9576618/photos/05042e81-94ac-448c-9fcb-7d500034dfb0.png';

export default function PrintTest(): React.JSX.Element {
  const navigate = useNavigate();
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<
    'idle' | 'printing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

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
          const listener = window.electron.print.onPrintResponse(
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
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          disabled={isPrinting}
        >
          ← กลับ
        </button>
        <h1 className="print-test-title">เทสปริ้น</h1>
      </div>

      {/* Main Content */}
      <div className="print-test-content">
        {/* Image Preview */}
        <div className="print-test-image-section">
          <h2 className="section-title">รูปภาพทดสอบ</h2>
          <div className="image-preview-container">
            <img
              src={TEST_IMAGE_URL}
              alt="Test print image"
              className="test-image"
            />
          </div>
        </div>

        {/* Print Settings */}
        <div className="print-test-settings">
          <h2 className="section-title">ตั้งค่าการพิมพ์</h2>

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
                max="10"
                value={copies}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) && value >= 1 && value <= 10) {
                    setCopies(value);
                  }
                }}
                className="copies-input"
                disabled={isPrinting}
              />
              <button
                type="button"
                className="copies-button"
                onClick={() => setCopies(Math.min(10, copies + 1))}
                disabled={isPrinting || copies >= 10}
              >
                +
              </button>
            </div>
            <p className="setting-hint">เลือกจำนวน 1-10 แผ่น</p>
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
    </div>
  );
}

