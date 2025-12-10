import React from 'react';
import { useNavigate } from 'react-router-dom';
// import icon from '../../../../assets/icons/default_full.svg';
import './Home.css';

import { REFETCH_INTERVAL } from '../../utils/appConfig';

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

  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window as any).electron.payment.forceInit(); // forceInit retrieves fresh data
        if (res.success && res.data?.machine) {
          if (res.data.machine.isMaintenanceMode) {
            navigate('/system-maintenance', { state: { maintenance: true } });
          } else if (res.data.machine.paperLevel === 0) {
            navigate('/out-of-paper', { state: { maintenance: true } });
          }
        }
      } catch (error) {
        console.error('Error checking machine status in Home:', error);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 10 seconds
    const interval = setInterval(checkStatus, REFETCH_INTERVAL.HOME * 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <main
      className="home-container"
      onClick={handleStartClick}
      style={{ cursor: 'pointer' }}
    >
      {/* <section className="logo-section">
        <img
          src={icon}
          alt="Bonio Booth Logo"
          className="logo-image"
          width="100%"
          height="auto"
        />
      </section> */}

      <section className="action-section">
        {/* Removed TAP TO START button - click anywhere to start */}
      </section>

      <footer className="footer-section" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={handleTermsClick}
          className="terms-link"
          aria-label="Open Terms and Services"
        >
          ข้อตกลงในการใช้บริการ
        </button>
        <button
          type="button"
          onClick={handleHelpClick}
          className="terms-link"
          aria-label="Open Help"
        >
          ขอความช่วยเหลือ
        </button>
      </footer>
    </main>
  );
}

export default Home;
