import React, { useState, useCallback, useRef, useEffect } from 'react';
import './PasswordModal.css';

const TEST_PRINT_PASSWORD = '7053';

interface PasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  password?: string; // รองรับ custom password
}

export default function PasswordModal({
  isOpen,
  onSuccess,
  onCancel,
  title = 'กรอกรหัสผ่าน',
  password: expectedPassword,
}: PasswordModalProps): React.JSX.Element | null {
  const [inputValue, setInputValue] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ใช้ custom password ถ้ามี ไม่เช่นนั้นใช้ default
  const targetPassword = expectedPassword || TEST_PRINT_PASSWORD;

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      setPasswordError('');
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (inputValue === targetPassword) {
      setInputValue('');
      setPasswordError('');
      onSuccess();
    } else {
      setPasswordError('รหัสผ่านไม่ถูกต้อง');
      setInputValue('');
      // Focus input อีกครั้งหลังจาก clear
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [inputValue, targetPassword, onSuccess]);

  const handleCancel = useCallback(() => {
    setInputValue('');
    setPasswordError('');
    onCancel();
  }, [onCancel]);

  // ✅ รวม focus และ Escape handler ไว้ที่เดียว
  useEffect(() => {
    if (!isOpen) return;

    // Focus input เมื่อ modal เปิด
    inputRef.current?.focus();

    // จัดการ Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!isOpen) return null;

  return (
    <div className="password-modal-overlay" role="presentation">
      <div
        className="password-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
        tabIndex={-1}
      >
        <h2 id="password-modal-title" className="password-modal-title">
          {title}
        </h2>

        {/* Password Input */}
        <div className="password-input-container">
          <input
            ref={inputRef}
            type="password"
            className="password-input"
            value={inputValue} // ✅ ใช้ state ชื่อใหม่
            onChange={handlePasswordChange}
            onKeyDown={handleKeyDown}
            placeholder="กรอกรหัสผ่าน"
            maxLength={50}
            aria-label="กรอกรหัสผ่าน"
          />
        </div>

        {passwordError && <p className="password-error">{passwordError}</p>}

        {/* Action Buttons */}
        <div className="password-modal-actions">
          <button
            type="button"
            className="password-modal-button password-modal-button-cancel"
            onClick={handleCancel}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="password-modal-button password-modal-button-submit"
            onClick={handleSubmit}
            disabled={inputValue.length === 0} // ✅ ใช้ state ชื่อใหม่
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
