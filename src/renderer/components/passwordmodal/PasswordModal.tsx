import React, { useState, useCallback } from 'react';
import './PasswordModal.css';

const TEST_PRINT_PASSWORD = '1212312121';

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

  // ใช้ custom password ถ้ามี ไม่เช่นนั้นใช้ default
  const targetPassword = expectedPassword || TEST_PRINT_PASSWORD;

  const handleNumberClick = useCallback((num: string) => {
    setPassword((prev) => {
      if (prev.length >= 20) {
        return prev;
      }
      return prev + num;
    });
    setPasswordError('');
  }, []);

  const handleBackspace = useCallback(() => {
    setPassword((prev) => prev.slice(0, -1));
    setPasswordError('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (password === targetPassword) {
      setPassword('');
      setPasswordError('');
      onSuccess();
    } else {
      setPasswordError('รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  }, [password, targetPassword, onSuccess]);

  const handleCancel = useCallback(() => {
    setPassword('');
    setPasswordError('');
    onCancel();
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div className="password-modal-overlay" onClick={handleCancel}>
      <div
        className="password-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="password-modal-title">{title}</h2>

        {/* Password Display */}
        <div className="password-display-container">
          <div className="password-display">
            {password.length > 0 ? (
              <span className="password-dots">
                {'•'.repeat(password.length)}
              </span>
            ) : (
              <span className="password-placeholder">กรอกรหัสผ่าน</span>
            )}
          </div>
        </div>

        {passwordError && (
          <p className="password-error">{passwordError}</p>
        )}

        {/* Number Pad */}
        <div className="number-pad-container">
          {/* Row 1: 1, 2, 3 */}
          <div className="number-pad-row">
            {['1', '2', '3'].map((num) => (
              <button
                key={num}
                type="button"
                className="number-pad-button"
                onClick={() => handleNumberClick(num)}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Row 2: 4, 5, 6 */}
          <div className="number-pad-row">
            {['4', '5', '6'].map((num) => (
              <button
                key={num}
                type="button"
                className="number-pad-button"
                onClick={() => handleNumberClick(num)}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Row 3: 7, 8, 9 */}
          <div className="number-pad-row">
            {['7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                className="number-pad-button"
                onClick={() => handleNumberClick(num)}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Row 4: Backspace, 0, Submit */}
          <div className="number-pad-row">
            <button
              type="button"
              className="number-pad-button number-pad-button-action"
              onClick={handleBackspace}
              disabled={password.length === 0}
              aria-label="ลบ"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                <line x1="18" y1="9" x2="12" y2="15" />
                <line x1="12" y1="9" x2="18" y2="15" />
              </svg>
            </button>
            <button
              type="button"
              className="number-pad-button"
              onClick={() => handleNumberClick('0')}
            >
              0
            </button>
            <button
              type="button"
              className="number-pad-button number-pad-button-submit"
              onClick={handleSubmit}
              disabled={password.length === 0}
              aria-label="ยืนยัน"
            >
              ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

