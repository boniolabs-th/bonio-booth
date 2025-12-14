import React, { useState, useCallback } from 'react';
import './MachineConfigModal.css';

interface MachineConfigModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export default function MachineConfigModal({
  isOpen,
  onSuccess,
}: MachineConfigModalProps): React.JSX.Element | null {
  const [machineId, setMachineId] = useState('');
  const [machinePort, setMachinePort] = useState('');
  const [error, setError] = useState('');
  const [portError, setPortError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    // Validate
    if (!machineId.trim()) {
      setError('กรุณากรอก Machine ID');
      return;
    }

    if (!machinePort.trim()) {
      setError('กรุณากรอก Port');
      return;
    }

    // Validate port เป็นตัวเลข
    const portNum = parseInt(machinePort, 10);
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port ต้องเป็นตัวเลขระหว่าง 1-65535');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // @ts-ignore
      const result = await window.electron?.payment?.saveMachineConfig({
        machineId: machineId.trim(),
        machinePort: machinePort.trim(),
      });

      if (result?.success) {
        // Reset form
        setMachineId('');
        setMachinePort('');
        setError('');
        onSuccess();
      } else {
        setError(result?.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('❌ [MachineConfigModal] Error saving config:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsSaving(false);
    }
  }, [machineId, machinePort, onSuccess]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent, field: 'machineId' | 'machinePort') => {
      if (e.key === 'Enter') {
        if (field === 'machineId') {
          // Focus to port field
          const portInput = document.getElementById('machine-port-input');
          portInput?.focus();
        } else {
          handleSubmit();
        }
      }
    },
    [handleSubmit],
  );

  if (!isOpen) return null;

  return (
    <div className="machine-config-modal-overlay">
      <div className="machine-config-modal-content">
        <h2 className="machine-config-modal-title">
          ตั้งค่าเครื่องครั้งแรก
        </h2>
        <p className="machine-config-modal-description">
          กรุณากรอกข้อมูลเครื่องของคุณเพื่อเริ่มใช้งาน
        </p>

        <div className="machine-config-form">
          <div className="machine-config-field">
            <label htmlFor="machine-id-input" className="machine-config-label">
              Machine ID
            </label>
            <input
              id="machine-id-input"
              type="text"
              className="machine-config-input"
              value={machineId}
              onChange={(e) => {
                setMachineId(e.target.value);
                setError('');
              }}
              onKeyPress={(e) => handleKeyPress(e, 'machineId')}
              placeholder="เช่น 69247c9602dd728488995e3c"
              disabled={isSaving}
              autoFocus
            />
          </div>

          <div className="machine-config-field">
            <label htmlFor="machine-port-input" className="machine-config-label">
              Port
            </label>
            <input
              id="machine-port-input"
              type="text"
              className="machine-config-input"
              value={machinePort}
              onChange={(e) => {
                // อนุญาตเฉพาะตัวเลข
                const value = e.target.value.replace(/\D/g, '');
                setMachinePort(value);
                setError('');
                
                // Validate port แบบ real-time
                if (value) {
                  const portNum = parseInt(value, 10);
                  if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
                    setPortError('Port ต้องเป็นตัวเลขระหว่าง 1-65535');
                  } else {
                    setPortError('');
                  }
                } else {
                  setPortError('');
                }
              }}
              onKeyPress={(e) => handleKeyPress(e, 'machinePort')}
              placeholder="เช่น 44444"
              disabled={isSaving}
              maxLength={5}
            />
          </div>
          
          {portError && (
            <p className="machine-config-error" style={{ marginTop: '-16px', marginBottom: '8px' }}>
              {portError}
            </p>
          )}

          {error && <p className="machine-config-error">{error}</p>}

          <button
            type="button"
            className="machine-config-submit-button"
            onClick={handleSubmit}
            disabled={isSaving || !machineId.trim() || !machinePort.trim() || !!portError}
          >
            {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

