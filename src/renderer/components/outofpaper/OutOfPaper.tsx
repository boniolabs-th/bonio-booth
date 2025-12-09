import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BackButton from '../backbutton';
import './OutOfPaper.css';
import outofpaper from '../../../../assets/images/out-of-paper.png';

import { REFETCH_INTERVAL } from '../../utils/appConfig';

export default function OutOfPaper() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMaintenanceMode = location.state?.maintenance;
  const [lineUrl, setLineUrl] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // Fetch machine data to get Line URL
  useEffect(() => {
    const fetchMachineData = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (window as any).electron.payment.getMachineData();
        if (data?.machine?.lineUrl) {
          setLineUrl(data.machine.lineUrl);
        }
      } catch (error) {
        console.error('Error fetching machine data:', error);
      }
    };

    fetchMachineData();
  }, []);

  useEffect(() => {
    // If it's manual navigation (not auto-redirect from App/Home), we might not want to poll?
    // But assuming isMaintenanceMode prop here works as "Auto Redirect" flag:
    if (isMaintenanceMode) {
      const interval = setInterval(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (window as any).electron.payment.forceInit();
          if (res.success && res.data?.machine) {
            if (res.data.machine.isMaintenanceMode) {
              // If maintenance turned on while validly out of paper, prioritize maintenance page
              navigate('/system-maintenance', { state: { maintenance: true } });
            } else if (res.data.machine.paperLevel !== 0) {
              // If paper is refilled (and not in maintenance), go home
              navigate('/');
            }
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, REFETCH_INTERVAL.OUT_OF_PAPER * 1000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isMaintenanceMode, navigate]);

  // Generate QR Code for LINE
  const generateQRCode = () => {
    if (lineUrl) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lineUrl)}`;
    }
    // Fallback if no URL available (or use a placeholder)
    return '';
  };

  return (
    <div className="get-outofpaper-container">
      {!isMaintenanceMode && <BackButton onBackClick={handleBack} />}

      <div className="outofpaper-content">
        <div className="outofpaper-illustration">
          <img src={outofpaper} alt="Out of Paper" width="100%" height="auto" />
        </div>

        <h1 className="outofpaper-title">OUT OF PAPER</h1>

        <p className="outofpaper-instruction-thai">
          ขออภัยในความไม่สะดวก
          <br />
          กรุณาติดต่อพนักงาน หรือแอดไลน์ เพื่อแจ้งแอดมิน
        </p>

        <div className="outofpaper-qr-section">
          <div className="qr-code-container">
            <img
              src={generateQRCode()}
              alt="LINE QR Code"
              className="qr-code-image"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
