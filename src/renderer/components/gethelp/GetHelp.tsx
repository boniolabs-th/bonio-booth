import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BackButton from '../backbutton';
import Countdown from '../countdown/Countdown';
import { COUNTDOWN } from '../../utils/appConfig';
import './GetHelp.css';
import getHelp from '../../../../assets/images/get-help.png';

const TEST_PRINT_PASSWORD = '1212312121';

export default function GetHelp() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMaintenanceMode = location.state?.maintenance;
  const [lineUrl, setLineUrl] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleCountdownComplete = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleTestPrintClick = useCallback(() => {
    setShowPasswordModal(true);
    setPassword('');
    setPasswordError('');
  }, []);

  const handlePasswordSubmit = useCallback(() => {
    if (password === TEST_PRINT_PASSWORD) {
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError('');
      navigate('/print-test');
    } else {
      setPasswordError('รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  }, [password, navigate]);

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
  }, []);

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

  // Generate QR Code for LINE
  const generateQRCode = () => {
    if (lineUrl) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(lineUrl)}`;
    }
    // Fallback if no URL available (or use a placeholder)
    return '';
  };

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
          กรุณาติดต่อเจ้าหน้าที่ใกล้เคียง หรือ สแกน Line QR
          ด้านล่างเพื่อขอความช่วยเหลือเพิ่มเติม
        </p>
        <p className="help-instruction-en">
          Please contact nearby staff or scan the Line QR code below for
          support.
        </p>

        <div className="help-qr-section">
          <div className="qr-code-container">
            <img
              src={generateQRCode()}
              alt="LINE QR Code"
              className="qr-code-image"
            />
          </div>
        </div>

        {/* Test Print Button */}
        <div className="help-test-print-section">
          <button
            type="button"
            onClick={handleTestPrintClick}
            className="test-print-button"
            aria-label="Test Print"
          >
            🖨️ เทสปริ้น
          </button>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="password-modal-overlay" onClick={handlePasswordCancel}>
          <div
            className="password-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="password-modal-title">กรอกรหัสผ่าน</h2>

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
                  aria-label="0"
                >
                  0
                </button>
                <button
                  type="button"
                  className="number-pad-button number-pad-button-submit"
                  onClick={handlePasswordSubmit}
                  disabled={password.length === 0}
                  aria-label="ยืนยัน"
                >
                  ✓
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="password-modal-actions">
              <button
                type="button"
                className="password-modal-button cancel"
                onClick={handlePasswordCancel}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

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
