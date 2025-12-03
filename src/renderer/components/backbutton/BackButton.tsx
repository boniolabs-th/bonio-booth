import React from 'react';
import { useNavigate } from 'react-router-dom';
import './BackButton.css';

interface BackButtonProps {
  onBackClick?: () => void;
  backButtonPath?: string;
}

export default function BackButton({
  onBackClick,
  backButtonPath,
}: BackButtonProps): React.JSX.Element {
  const navigate = useNavigate();

  const handleBackClick = React.useCallback(() => {
    if (onBackClick) {
      onBackClick();
    } else if (backButtonPath) {
      navigate(backButtonPath);
    } else {
      navigate(-1); // Go back to previous page
    }
  }, [onBackClick, backButtonPath, navigate]);

  return (
    <button
      type="button"
      className="back-button"
      onClick={handleBackClick}
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

