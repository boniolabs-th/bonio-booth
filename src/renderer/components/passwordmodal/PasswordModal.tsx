import React, { useState, useCallback, useRef, useEffect } from 'react';
import './PasswordModal.css';

const TEST_PRINT_PASSWORD = '7053';

interface PasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  password?: string;
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
      // ✅ เพิ่ม delay สำหรับ AnyDesk
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.click();
      }, 200);
    }
  }, [inputValue, targetPassword, onSuccess]);

  const handleCancel = useCallback(() => {
    setInputValue('');
    setPasswordError('');
    onCancel();
  }, [onCancel]);

  // ✅ จัดการ focus และ Escape
  useEffect(() => {
    if (!isOpen) return;

    // ✅ เพิ่ม delay เพื่อให้ modal render เสร็จก่อน (สำคัญสำหรับ AnyDesk)
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.click();
    }, 150);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(focusTimer);
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

  // ✅ จัดการเมื่อ click overlay -> focus กลับมาที่ input
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, []);

  // ✅ จัดการเมื่อ click backdrop -> focus กลับมาที่ input
  const handleBackdropClick = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="password-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      {/* ✅ เพิ่ม backdrop แยกต่างหาก */}
      <div
        className="password-modal-backdrop"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

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
            autoFocus // ✅ เพิ่ม native autofocus
            className="password-input"
            value={inputValue}
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
            disabled={inputValue.length === 0}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
