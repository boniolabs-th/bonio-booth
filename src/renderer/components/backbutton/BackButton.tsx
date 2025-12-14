import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BackButton.css';

interface BackButtonProps {
  onBackClick?: () => void;
  backButtonPath?: string;
  disabled?: boolean;
}

export default function BackButton({
  onBackClick,
  backButtonPath,
  disabled = false,
}: BackButtonProps): React.JSX.Element {
  const navigate = useNavigate();

  const handleBackClick = React.useCallback(() => {
    if (disabled) return;
    if (onBackClick) {
      onBackClick();
    } else if (backButtonPath) {
      navigate(backButtonPath);
    } else {
      navigate(-1); // Go back to previous page
    }
  }, [onBackClick, backButtonPath, navigate, disabled]);

  return (
    <button
      type="button"
      className="back-button"
      onClick={handleBackClick}
      disabled={disabled}
      aria-label="Go back"
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
        <path
          d="M15 18L9 12L15 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

