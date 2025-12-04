import React from 'react';
import { useNavigate } from 'react-router-dom';
import icon from '../../../../assets/icons/default_full.svg';
import './Home.css';

function Home(): React.JSX.Element {
  const navigate = useNavigate();

  const handleStartClick = React.useCallback(() => {
    navigate('/select-print');
  }, [navigate]);

  const handleTermsClick = React.useCallback(() => {
    navigate('/terms-and-services');
  }, [navigate]);

  const handleHelpClick = React.useCallback(() => {
    navigate('/get-help');
  }, [navigate]);

  return (
    <main className="home-container">
      <section className="logo-section">
        <img
          src={icon}
          alt="Bonio Booth Logo"
          className="logo-image"
          width="100%"
          height="auto"
        />
      </section>

      <section className="action-section">
        <button
          type="button"
          onClick={handleStartClick}
          className="start-button"
          aria-label="Start using Bonio Booth"
        >
          TAP TO START
        </button>
      </section>

      <footer className="footer-section">
        <button
          type="button"
          onClick={handleTermsClick}
          className="terms-link"
          aria-label="Open Terms and Services"
        >
          Terms & Services
        </button>
        <button
          type="button"
          onClick={handleHelpClick}
          className="terms-link"
          aria-label="Open Help"
        >
          ช่วยเหลือ
        </button>
      </footer>
    </main>
  );
}

export default Home;
