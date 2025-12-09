import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BackButton from '../backbutton';
import './SystemMaintenance.css';
import systemMaintenance from '../../../../assets/images/system-maintenance.png';

import { REFETCH_INTERVAL } from '../../utils/appConfig';

export default function SystemMaintenance() {
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
    if (isMaintenanceMode) {
      const interval = setInterval(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (window as any).electron.payment.forceInit();
          if (res.success && !res.data.machine.isMaintenanceMode) {
            navigate('/');
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, REFETCH_INTERVAL.SYSTEM_MAINTENANCE * 1000);

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
    <div className="get-maintenance-container">
      {!isMaintenanceMode && <BackButton onBackClick={handleBack} />}

      <div className="maintenance-content">
        <div className="maintenance-illustration">
          <img
            src={systemMaintenance}
            alt="System Maintenance"
            width="100%"
            height="auto"
          />
        </div>

        <h1 className="maintenance-title">SYSTEM MAINTENANCE</h1>

        <p className="maintenance-instruction-thai">
          ขออภัยในความไม่สะดวก
          <br />
          กรุณาติดต่อพนักงาน หรือแอดไลน์ เพื่อแจ้งแอดมิน
        </p>

        <div className="maintenance-qr-section">
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
