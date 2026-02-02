import React, { useCallback, useEffect, useRef } from 'react';
import './AlertModal.css';

interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export default function AlertModal({
  isOpen,
  title = 'แจ้งเตือน',
  message,
  onConfirm,
  onCancel,
}: AlertModalProps): React.JSX.Element | null {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  // ✅ Auto focus + Escape
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 150);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onCancel]);

  // ✅ click overlay -> ไม่ปิด แต่ focus กลับ
  const handleOverlayClick = useCallback(() => {
    setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="alert-modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div className="alert-modal-backdrop" aria-hidden="true" />

      <div
        className="alert-modal-content"
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <h2 className="alert-modal-title">{title}</h2>

        {!!message && <p className="alert-modal-message">{message}</p>}

        <div className="alert-modal-actions">
          {onCancel && (
            <button
              type="button"
              className="alert-modal-button cancel"
              onClick={handleCancel}
            >
              ยกเลิก
            </button>
          )}

          <button
            ref={confirmButtonRef}
            type="button"
            className="alert-modal-button confirm"
            onClick={handleConfirm}
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}
