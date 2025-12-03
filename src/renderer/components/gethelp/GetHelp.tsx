import { useNavigate } from 'react-router-dom';
import { BackButton, Countdown } from '..';
import './GetHelp.css';
import { useCallback } from 'react';

export default function GetHelp() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

  const handleCountdownComplete = useCallback(() => {
    handleBack();
  }, [handleBack]);

  // Generate QR Code for LINE (placeholder - replace with actual LINE QR code URL)
  const generateQRCode = () => {
    // Simple QR code pattern placeholder
    // Replace this with actual LINE QR code image URL or use a QR code library
    const size = 200;
    const moduleSize = 10;
    const modules = size / moduleSize;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;

    // Generate a simple QR-like pattern
    for (let i = 0; i < modules; i++) {
      for (let j = 0; j < modules; j++) {
        // Create a pattern that looks like QR code
        const shouldFill =
          (i + j) % 3 === 0 ||
          (i * j) % 7 === 0 ||
          i === 0 ||
          j === 0 ||
          i === modules - 1 ||
          j === modules - 1;
        if (shouldFill) {
          svg += `<rect x="${i * moduleSize}" y="${j * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
        }
      }
    }

    // Add corner squares (QR code pattern)
    const cornerSize = moduleSize * 7;
    svg += `<rect x="0" y="0" width="${cornerSize}" height="${cornerSize}" fill="black"/>`;
    svg += `<rect x="${moduleSize}" y="${moduleSize}" width="${moduleSize * 5}" height="${moduleSize * 5}" fill="white"/>`;
    svg += `<rect x="${moduleSize * 2}" y="${moduleSize * 2}" width="${moduleSize * 3}" height="${moduleSize * 3}" fill="black"/>`;

    svg += `<rect x="${size - cornerSize}" y="0" width="${cornerSize}" height="${cornerSize}" fill="black"/>`;
    svg += `<rect x="${size - cornerSize + moduleSize}" y="${moduleSize}" width="${moduleSize * 5}" height="${moduleSize * 5}" fill="white"/>`;
    svg += `<rect x="${size - cornerSize + moduleSize * 2}" y="${moduleSize * 2}" width="${moduleSize * 3}" height="${moduleSize * 3}" fill="black"/>`;

    svg += `<rect x="0" y="${size - cornerSize}" width="${cornerSize}" height="${cornerSize}" fill="black"/>`;
    svg += `<rect x="${moduleSize}" y="${size - cornerSize + moduleSize}" width="${moduleSize * 5}" height="${moduleSize * 5}" fill="white"/>`;
    svg += `<rect x="${moduleSize * 2}" y="${size - cornerSize + moduleSize * 2}" width="${moduleSize * 3}" height="${moduleSize * 3}" fill="black"/>`;

    svg += '</svg>';
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };

  return (
    <div className="get-help-container">
      <BackButton onBackClick={handleBack} />

      <Countdown
        seconds={30}
        onComplete={handleCountdownComplete}
        visible={false}
      />

      <div className="help-content">
        <div className="help-illustration">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Tree */}
            <circle cx="60" cy="80" r="40" fill="#FFD700" />
            <rect x="50" y="120" width="20" height="40" fill="#8B4513" />

            {/* Bench */}
            <rect x="100" y="140" width="60" height="8" fill="#D2B48C" />
            <rect x="100" y="148" width="60" height="12" fill="#A0522D" />
            <line
              x1="100"
              y1="140"
              x2="100"
              y2="160"
              stroke="#8B4513"
              strokeWidth="2"
            />
            <line
              x1="160"
              y1="140"
              x2="160"
              y2="160"
              stroke="#8B4513"
              strokeWidth="2"
            />

            {/* Person */}
            <circle cx="150" cy="100" r="15" fill="#2c2c2c" />
            <rect x="140" y="115" width="20" height="30" fill="#2c2c2c" />
            <rect x="135" y="115" width="30" height="20" fill="#FFD700" />
            <rect x="145" y="145" width="10" height="15" fill="#000000" />

            {/* Clouds */}
            <ellipse cx="170" cy="50" rx="15" ry="10" fill="#E0E0E0" />
            <ellipse cx="180" cy="45" rx="12" ry="8" fill="#E0E0E0" />
            <ellipse cx="160" cy="45" rx="10" ry="7" fill="#E0E0E0" />
          </svg>
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
            <p className="qr-label">LINE</p>
          </div>
        </div>
      </div>

      <div className="help-back-button">
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
      </div>
    </div>
  );
}
