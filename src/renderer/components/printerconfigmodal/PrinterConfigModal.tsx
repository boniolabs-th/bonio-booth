import React, { useState, useEffect, useCallback } from 'react';
import './PrinterConfigModal.css';

type PaperSize = '2x6' | '6x4';
type TabType = 'main' | 'secondary';

interface PrinterDevice {
  name: string;
  displayName: string;
  isDefault: boolean;
}

interface SinglePrinterConfig {
  printerName: string;
  displayName: string;
  paperSize: PaperSize;
  canCut: boolean;
}

interface PrinterConfig {
  main: SinglePrinterConfig;
  secondary?: SinglePrinterConfig;
}

interface PrinterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PAPER_SIZES: { value: PaperSize; label: string }[] = [
  { value: '2x6', label: '2x6 นิ้ว (5x15 ซม.)' },
  { value: '6x4', label: '6x4 นิ้ว (15x10 ซม.)' },
];

export default function PrinterConfigModal({
  isOpen,
  onClose,
  onSuccess,
}: PrinterConfigModalProps): React.JSX.Element | null {
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('main');

  // Main Printer
  const [mainPrinterName, setMainPrinterName] = useState<string>('');
  const [mainPaperSize, setMainPaperSize] = useState<PaperSize>('6x4');
  const [mainCanCut, setMainCanCut] = useState<boolean>(true);

  // Secondary Printer
  const [secondaryPrinterName, setSecondaryPrinterName] = useState<string>('');
  const [secondaryPaperSize, setSecondaryPaperSize] = useState<PaperSize>('6x4');
  const [secondaryCanCut, setSecondaryCanCut] = useState<boolean>(true);

  const [currentConfig, setCurrentConfig] = useState<PrinterConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // โหลดรายการเครื่องปริ้นและ config ปัจจุบัน
  const loadPrinters = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      // ดึงรายการเครื่องปริ้น
      // @ts-ignore
      const printersResult = await window.electron?.payment?.getPrinters();
      if (printersResult?.success && printersResult.printers) {
        const printerList: PrinterDevice[] = printersResult.printers.map(
          (p: any) => ({
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: p.isDefault || false,
          }),
        );
        setPrinters(printerList);

        // ดึง config ปัจจุบัน
        // @ts-ignore
        const configResult = await window.electron?.payment?.getPrinterConfig();
        if (configResult?.success && configResult.config) {
          const config = configResult.config as PrinterConfig;
          setCurrentConfig(config);

          // Main printer
          setMainPrinterName(config.main.printerName);
          setMainPaperSize(config.main.paperSize || '6x4');
          setMainCanCut(config.main.canCut ?? true);

          // Secondary printer
          if (config.secondary) {
            setSecondaryPrinterName(config.secondary.printerName);
            setSecondaryPaperSize(config.secondary.paperSize || '6x4');
            setSecondaryCanCut(config.secondary.canCut ?? true);
          }
        } else if (printerList.length > 0) {
          // ถ้าไม่มี config ให้เลือก default printer หรือตัวที่มี qw410 ในชื่อ
          const qw410Printer = printerList.find((p) =>
            p.name.toLowerCase().includes('qw410'),
          );
          const defaultPrinter = printerList.find((p) => p.isDefault);
          const selectedPrinter =
            qw410Printer || defaultPrinter || printerList[0];
          setMainPrinterName(selectedPrinter.name);
        }
      } else {
        setError('ไม่สามารถดึงรายการเครื่องปริ้นได้');
      }
    } catch (err) {
      console.error('Failed to load printers:', err);
      setError('เกิดข้อผิดพลาดในการโหลดรายการเครื่องปริ้น');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // โหลดเครื่องปริ้นเมื่อ modal เปิด
  useEffect(() => {
    if (isOpen) {
      loadPrinters();
    }
  }, [isOpen, loadPrinters]);

  const handleSave = useCallback(async () => {
    if (!mainPrinterName) {
      setError('กรุณาเลือกเครื่องปริ้นหลัก (Main)');
      return;
    }

    const mainPrinter = printers.find((p) => p.name === mainPrinterName);
    if (!mainPrinter) {
      setError('ไม่พบเครื่องปริ้นหลักที่เลือก');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const config: PrinterConfig = {
        main: {
          printerName: mainPrinter.name,
          displayName: mainPrinter.displayName,
          paperSize: mainPaperSize,
          canCut: mainCanCut,
        },
      };

      // เพิ่ม secondary ถ้ามี
      if (secondaryPrinterName) {
        const secondaryPrinter = printers.find((p) => p.name === secondaryPrinterName);
        if (secondaryPrinter) {
          config.secondary = {
            printerName: secondaryPrinter.name,
            displayName: secondaryPrinter.displayName,
            paperSize: secondaryPaperSize,
            canCut: secondaryCanCut,
          };
        }
      }

      // @ts-ignore
      const result = await window.electron?.payment?.savePrinterConfig(config);

      if (result?.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('Failed to save printer config:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsSaving(false);
    }
  }, [
    mainPrinterName,
    mainPaperSize,
    mainCanCut,
    secondaryPrinterName,
    secondaryPaperSize,
    secondaryCanCut,
    printers,
    onSuccess,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="printer-config-modal-overlay">
      <div className="printer-config-modal-content">
        <h2 className="printer-config-modal-title">⚙️ ตั้งค่าเครื่องปริ้น</h2>
        <p className="printer-config-modal-description">
          ตั้งค่าเครื่องปริ้นหลักและเครื่องปริ้นรอง
        </p>

        {isLoading ? (
          <div className="printer-config-loading">
            <div className="printer-config-spinner" />
            <p>กำลังโหลดรายการเครื่องปริ้น...</p>
          </div>
        ) : (
          <>
            {/* ======== TABS ======== */}
            <div className="printer-config-tabs">
              <button
                type="button"
                className={`printer-config-tab ${activeTab === 'main' ? 'active' : ''}`}
                onClick={() => setActiveTab('main')}
              >
                🖨️ Main
              </button>
              <button
                type="button"
                className={`printer-config-tab ${activeTab === 'secondary' ? 'active' : ''}`}
                onClick={() => setActiveTab('secondary')}
              >
                🖨️ Secondary
              </button>
            </div>

            {/* ======== MAIN TAB CONTENT ======== */}
            {activeTab === 'main' && (
              <div className="printer-config-tab-content">
                <div className="printer-config-form">
                  <label htmlFor="main-printer-select" className="printer-config-label">
                    เลือกเครื่องปริ้น
                  </label>
                  <select
                    id="main-printer-select"
                    className="printer-config-select"
                    value={mainPrinterName}
                    onChange={(e) => setMainPrinterName(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">-- เลือกเครื่องปริ้น --</option>
                    {printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.displayName}
                        {printer.isDefault ? ' (Default)' : ''}
                        {currentConfig?.main?.printerName === printer.name ? ' ✓' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="printer-config-form">
                  <label htmlFor="main-paper-size" className="printer-config-label">
                    ขนาดกระดาษ
                  </label>
                  <select
                    id="main-paper-size"
                    className="printer-config-select"
                    value={mainPaperSize}
                    onChange={(e) => setMainPaperSize(e.target.value as PaperSize)}
                    disabled={isSaving}
                  >
                    {PAPER_SIZES.map((size) => (
                      <option key={size.value} value={size.value}>
                        {size.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="printer-config-form">
                  <label className="printer-config-label">ตัดกระดาษอัตโนมัติ</label>
                  <div className="printer-config-toggle-container">
                    <label className="printer-config-toggle">
                      <input
                        type="checkbox"
                        checked={mainCanCut}
                        onChange={(e) => setMainCanCut(e.target.checked)}
                        disabled={isSaving}
                      />
                      <span className="printer-config-toggle-slider" />
                    </label>
                    <span className="printer-config-toggle-label">
                      {mainCanCut ? 'เครื่องตัดกระดาษได้' : 'เครื่องตัดกระดาษไม่ได้'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ======== SECONDARY TAB CONTENT ======== */}
            {activeTab === 'secondary' && (
              <div className="printer-config-tab-content">
                <div className="printer-config-form">
                  <label htmlFor="secondary-printer-select" className="printer-config-label">
                    เลือกเครื่องปริ้น
                  </label>
                  <select
                    id="secondary-printer-select"
                    className="printer-config-select"
                    value={secondaryPrinterName}
                    onChange={(e) => setSecondaryPrinterName(e.target.value)}
                    disabled={isSaving}
                  >
                    <option value="">-- เลือกเครื่องปริ้น --</option>
                    {printers
                      .filter((p) => p.name !== mainPrinterName)
                      .map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.displayName}
                          {printer.isDefault ? ' (Default)' : ''}
                          {currentConfig?.secondary?.printerName === printer.name ? ' ✓' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="printer-config-form">
                  <label htmlFor="secondary-paper-size" className="printer-config-label">
                    ขนาดกระดาษ
                  </label>
                  <select
                    id="secondary-paper-size"
                    className="printer-config-select"
                    value={secondaryPaperSize}
                    onChange={(e) => setSecondaryPaperSize(e.target.value as PaperSize)}
                    disabled={isSaving || !secondaryPrinterName}
                  >
                    {PAPER_SIZES.map((size) => (
                      <option key={size.value} value={size.value}>
                        {size.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="printer-config-form">
                  <label className="printer-config-label">ตัดกระดาษอัตโนมัติ</label>
                  <div className="printer-config-toggle-container">
                    <label className="printer-config-toggle">
                      <input
                        type="checkbox"
                        checked={secondaryCanCut}
                        onChange={(e) => setSecondaryCanCut(e.target.checked)}
                        disabled={isSaving || !secondaryPrinterName}
                      />
                      <span className="printer-config-toggle-slider" />
                    </label>
                    <span className="printer-config-toggle-label">
                      {secondaryCanCut ? 'เครื่องตัดกระดาษได้' : 'เครื่องตัดกระดาษไม่ได้'}
                    </span>
                  </div>
                </div>

                {!secondaryPrinterName && (
                  <p className="printer-config-hint" style={{ paddingLeft: 0 }}>
                    💡 เลือกเครื่องปริ้นรองเพื่อใช้เป็นเครื่องสำรอง
                  </p>
                )}
              </div>
            )}

            {/* Auto Printer Selection Info */}
            {mainPrinterName && (
              <div className="printer-config-info">
                <div className="printer-config-info-icon">ℹ️</div>
                <div className="printer-config-info-text">
                  <p className="printer-config-info-name">
                    <strong>การเลือกเครื่องปริ้นอัตโนมัติ:</strong>
                  </p>
                  <p className="printer-config-info-status">
                    • Frame 2x6 + Secondary ตัดกระดาษได้ → ใช้ Secondary
                  </p>
                  <p className="printer-config-info-status">
                    • นอกนั้น → ใช้ Main
                  </p>
                </div>
              </div>
            )}

            {printers.length === 0 && (
              <p className="printer-config-warning">
                ⚠️ ไม่พบเครื่องปริ้นที่เชื่อมต่ออยู่
              </p>
            )}

            {error && <p className="printer-config-error">{error}</p>}

            {/* Actions */}
            <div className="printer-config-actions">
              <button
                type="button"
                className="printer-config-btn printer-config-btn-cancel"
                onClick={onClose}
                disabled={isSaving}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="printer-config-btn printer-config-btn-save"
                onClick={handleSave}
                disabled={isSaving || !mainPrinterName}
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
