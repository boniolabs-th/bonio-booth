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
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ใช้ custom password ถ้ามี ไม่เช่นนั้นใช้ default
  const targetPassword = expectedPassword || TEST_PRINT_PASSWORD;

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      setPasswordError('');
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (password === targetPassword) {
      setPassword('');
      setPasswordError('');
      onSuccess();
    } else {
      setPasswordError('รหัสผ่านไม่ถูกต้อง');
      setPassword('');
      // Focus input อีกครั้งหลังจาก clear
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [password, targetPassword, onSuccess]);

  const handleCancel = useCallback(() => {
    setPassword('');
    setPasswordError('');
    onCancel();
  }, [onCancel]);

  // Focus input เมื่อ modal เปิด และจัดการ Escape key
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // รอสักครู่เพื่อให้ modal render เสร็จก่อน focus
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSubmit, handleCancel],
  );

  if (!isOpen) return null;

  return (
    <div className="password-modal-overlay" role="presentation">
      <button
        type="button"
        className="password-modal-backdrop"
        onClick={handleCancel}
        aria-label="ปิด modal"
      />
      <div
        className="password-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-modal-title"
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
            value={password}
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
            disabled={password.length === 0}
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
