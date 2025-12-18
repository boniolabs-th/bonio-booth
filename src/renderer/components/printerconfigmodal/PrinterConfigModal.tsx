import React, { useState, useEffect, useCallback } from 'react';
import './PrinterConfigModal.css';

interface PrinterDevice {
  name: string;
  displayName: string;
  isDefault: boolean;
}

interface PrinterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PrinterConfigModal({
  isOpen,
  onClose,
  onSuccess,
}: PrinterConfigModalProps): React.JSX.Element | null {
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState<string>('');
  const [canCut, setCanCut] = useState<boolean>(true);
  const [currentConfig, setCurrentConfig] = useState<{
    printerName: string;
    displayName: string;
    canCut?: boolean;
  } | null>(null);
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
        const configResult =
          await window.electron?.payment?.getPrinterConfig();
        if (configResult?.success && configResult.config) {
          setCurrentConfig(configResult.config);
          setSelectedPrinterName(configResult.config.printerName);
          setCanCut(configResult.config.canCut ?? true);
        } else if (printerList.length > 0) {
          // ถ้าไม่มี config ให้เลือก default printer หรือตัวที่มี qw410 ในชื่อ
          const qw410Printer = printerList.find((p) =>
            p.name.toLowerCase().includes('qw410'),
          );
          const defaultPrinter = printerList.find((p) => p.isDefault);
          const selectedPrinter =
            qw410Printer || defaultPrinter || printerList[0];
          setSelectedPrinterName(selectedPrinter.name);
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
    if (!selectedPrinterName) {
      setError('กรุณาเลือกเครื่องปริ้น');
      return;
    }

    const selectedPrinter = printers.find(
      (p) => p.name === selectedPrinterName,
    );
    if (!selectedPrinter) {
      setError('ไม่พบเครื่องปริ้นที่เลือก');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // @ts-ignore
      const result = await window.electron?.payment?.savePrinterConfig({
        printerName: selectedPrinter.name,
        displayName: selectedPrinter.displayName,
        canCut,
      });

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
  }, [selectedPrinterName, printers, onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="printer-config-modal-overlay">
      <div className="printer-config-modal-content">
        <h2 className="printer-config-modal-title">ตั้งค่าเครื่องปริ้น</h2>
        <p className="printer-config-modal-description">
          เลือกเครื่องปริ้นที่ต้องการใช้ในการพิมพ์รูป
        </p>

        {isLoading ? (
          <div className="printer-config-loading">
            <div className="printer-config-spinner" />
            <p>กำลังโหลดรายการเครื่องปริ้น...</p>
          </div>
        ) : (
          <>
            {/* Printer Selection */}
            <div className="printer-config-form">
              <label htmlFor="printer-select" className="printer-config-label">
                เลือกเครื่องปริ้น
              </label>
              <select
                id="printer-select"
                className="printer-config-select"
                value={selectedPrinterName}
                onChange={(e) => setSelectedPrinterName(e.target.value)}
                disabled={isSaving}
              >
                <option value="">-- เลือกเครื่องปริ้น --</option>
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.displayName}
                    {printer.isDefault ? ' (Default)' : ''}
                    {currentConfig?.printerName === printer.name
                      ? ' (ปัจจุบัน)'
                      : ''}
                  </option>
                ))}
              </select>

              {printers.length === 0 && (
                <p className="printer-config-warning">
                  ไม่พบเครื่องปริ้นที่เชื่อมต่ออยู่
                </p>
              )}

              {currentConfig && (
                <p className="printer-config-current">
                  เครื่องปริ้นปัจจุบัน:{' '}
                  <strong>{currentConfig.displayName}</strong>
                </p>
              )}
            </div>

            {/* Can Cut Toggle */}
            <div className="printer-config-form">
              <label className="printer-config-label">
                ความสามารถในการตัดกระดาษ
              </label>
              <div className="printer-config-toggle-container">
                <label className="printer-config-toggle">
                  <input
                    type="checkbox"
                    checked={canCut}
                    onChange={(e) => setCanCut(e.target.checked)}
                    disabled={isSaving}
                  />
                  <span className="printer-config-toggle-slider" />
                </label>
                <span className="printer-config-toggle-label">
                  {canCut ? 'เครื่องปริ้นตัดกระดาษได้' : 'เครื่องปริ้นตัดกระดาษไม่ได้'}
                </span>
              </div>
              <p className="printer-config-hint">
                {canCut
                  ? 'ระบบจะพิมพ์แบบแยกแผ่น (ตัดอัตโนมัติหลังพิมพ์แต่ละรูป)'
                  : 'ระบบจะพิมพ์แบบต่อเนื่อง (ไม่ตัดกระดาษ)'}
              </p>
            </div>

            {/* Printer Info */}
            {selectedPrinterName && (
              <div className="printer-config-info">
                <div className="printer-config-info-icon">🖨️</div>
                <div className="printer-config-info-text">
                  <p className="printer-config-info-name">
                    {
                      printers.find((p) => p.name === selectedPrinterName)
                        ?.displayName
                    }
                  </p>
                  <p className="printer-config-info-status">พร้อมใช้งาน</p>
                </div>
              </div>
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
                disabled={isSaving || !selectedPrinterName}
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
