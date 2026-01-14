import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BackButton from '../backbutton';
import Countdown from '../countdown/Countdown';
import PasswordModal from '../passwordmodal';
import { COUNTDOWN } from '../../utils/appConfig';
import './GetHelp.css';
import getHelp from '../../../../assets/images/get-help.png';

export default function GetHelp() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMaintenanceMode = location.state?.maintenance;
  const [lineUrl, setLineUrl] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleCountdownComplete = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleTestPrintClick = useCallback(() => {
    setShowPasswordModal(true);
  }, []);

  const handlePasswordSuccess = useCallback(() => {
    setShowPasswordModal(false);
    navigate('/print-test');
  }, [navigate]);

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordModal(false);
  }, []);

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
      }, 10000);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isMaintenanceMode, navigate]);

  // Generate QR Code for LINE using library
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (lineUrl) {
      import('../../utils/qrCodeUtils').then(({ generateQRCodeDataUrl }) => {
        generateQRCodeDataUrl(lineUrl, 200, 'M')
          .then((dataUrl) => {
            setQrCodeDataUrl(dataUrl);
          })
          .catch((error) => {
            console.error('❌ [GetHelp] Failed to generate QR code:', error);
            setQrCodeDataUrl(null);
          });
      });
    } else {
      setQrCodeDataUrl(null);
    }
  }, [lineUrl]);

  return (
    <div className="get-help-container">
      {!isMaintenanceMode && <BackButton onBackClick={handleBack} />}

      {!isMaintenanceMode && (
        <Countdown
          seconds={COUNTDOWN.GET_HELP.DURATION}
          onComplete={handleCountdownComplete}
          visible={COUNTDOWN.GET_HELP.VISIBLE}
        />
      )}

      <div className="help-content">
        <div className="help-illustration">
          <img src={getHelp} alt="Get Help" width="100%" height="auto" />
        </div>

        <h1 className="help-title">ติดต่อขอความช่วยเหลือ</h1>
        <p className="help-title-en">GET HELP</p>

        <p className="help-instruction-thai">
          สแกน Line QR ด้านล่างเพื่อขอความช่วยเหลือเพิ่มเติม
        </p>
        <p className="help-instruction-en">
          Scan the Line QR code below for support.
        </p>

        <div className="help-qr-section">
          <div className="qr-code-container">
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="LINE QR Code"
                className="qr-code-image"
              />
            ) : (
              <div className="qr-code-loading">กำลังสร้าง QR Code...</div>
            )}
          </div>
        </div>
      </div>

      {/* Password Modal */}
      <PasswordModal
        isOpen={showPasswordModal}
        onSuccess={handlePasswordSuccess}
        onCancel={handlePasswordCancel}
        title="กรอกรหัสผ่าน"
      />

      {/* <div className="help-back-button">
        <button type="button" onClick={handleBack} className="back-home-button">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          กลับไปหน้าหลัก
        </button>
      </div> */}
    </div>
  );
}
