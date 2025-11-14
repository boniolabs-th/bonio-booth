import React from 'react';
import { useNavigate } from 'react-router-dom';
import icon from '../../../../assets/icons/default_full.svg';
import './Header.css';

interface HeaderProps {
  showBackButton?: boolean;
  onBackClick?: () => void;
  backButtonPath?: string;
  title?: string;
  showLogo?: boolean;
}

export default function Header({
  showBackButton = false,
  onBackClick,
  backButtonPath,
  title,
  showLogo = true,
}: HeaderProps): React.JSX.Element {
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
    <header className="header">
      {showBackButton && (
        <button
          type="button"
          className="back-button"
          onClick={handleBackClick}
          aria-label="Go back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </header>
  );
}
