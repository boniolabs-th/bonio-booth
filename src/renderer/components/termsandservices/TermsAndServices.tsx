import { useNavigate } from 'react-router-dom';
import { BackButton, Countdown } from '..';
import './TermsAndServices.css';
import { useCallback } from 'react';

export default function TermsAndServices() {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

  const handleCountdownComplete = useCallback(() => {
    handleBack();
  }, [handleBack]);

  return (
    <div className="terms-container">
      <BackButton onBackClick={handleBack} />
      <Countdown
        seconds={30}
        onComplete={handleCountdownComplete}
        visible={false}
      />

      <div className="terms-content">
        <h1 className="terms-title">
          ข้อตกลงในการใช้บริการ Terms and Services
        </h1>

        <p className="terms-draft">ฉบับร่างเพื่อการทดสอบระบบเท่านั้น</p>

        <div className="terms-section">
          <p className="terms-welcome">
            ยินดีต้อนรับสู่บริการ Photo Booth System
          </p>

          <p className="terms-instruction">
            โปรดอ่านข้อตกลงนี้อย่างละเอียดก่อนเริ่มใช้งาน
            โดยการใช้บริการนี้ถือว่าคุณยอมรับเงื่อนไข
            ทั้งหมดที่ระบุไว้ดังต่อไปนี้
          </p>
        </div>

        <div className="terms-list">
          <div className="term-item">
            <h2 className="term-title">1. การใช้งานทั่วไป (General Use)</h2>
            <p className="term-content">
              คุณสามารถถ่ายภาพและวิดีโอผ่านระบบได้
              คุณตกลงที่จะไม่ใช้บริการนี้เพื่อวัตถุประสงค์ที่ผิดกฎหมายหรือเป็นอันตรายต่อผู้อื่น
              เรา ขอสงวนสิทธิ์ในการระงับการใช้งานของผู้ใช้ที่ละเมิดข้อตกลงนี้
            </p>
          </div>

          <div className="term-item">
            <h2 className="term-title">
              2. การจัดเก็บและใช้ข้อมูล (Data Storage and Use)
            </h2>
            <p className="term-content">
              ระบบอาจจัดเก็บภาพถ่าย วิดีโอ หรือข้อมูลส่วนบุคคล (เช่น อีเมล
              หมายเลขโทรศัพท์) เพื่อวัตถุประสงค์ในการให้บริการ
              การจัดการข้อมูลจะดำเนินการตามนโยบายความเป็นส่วนตัว
              คุณมีสิทธิ์ในการขอให้ลบข้อมูลของคุณได้
            </p>
          </div>

          <div className="term-item">
            <h2 className="term-title">
              3. การแชร์และเผยแพร่ภาพ (Image Sharing and Publication)
            </h2>
            <p className="term-content">
              คุณสามารถแชร์ภาพผ่าน QR Code อีเมล หรือโซเชียลมีเดียได้
              หากได้รับอนุญาต
              ภาพของคุณอาจถูกนำไปใช้ในแกลเลอรีของงานอีเวนต์หรือกิจกรรมส่งเสริมการขาย
            </p>
          </div>

          <div className="term-item">
            <h2 className="term-title">4. ความรับผิดชอบ (Responsibility)</h2>
            <p className="term-content">
              เราไม่รับผิดชอบต่อความเสียหายที่เกิดจากการใช้งานที่ไม่เหมาะสม
              ปัญหาอินเทอร์เน็ต หรือเหตุการณ์ที่อยู่นอกเหนือการควบคุม
              คุณมีความรับผิดชอบต่อเนื้อหาที่คุณสร้างขึ้น
            </p>
          </div>

          <div className="term-item">
            <h2 className="term-title">
              5. การเปลี่ยนแปลงข้อตกลง (Changes to Agreement)
            </h2>
            <p className="term-content">
              เราอาจปรับปรุงข้อตกลงนี้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า
              เวอร์ชันล่าสุดจะถูกเผยแพร่บนหน้าจอระบบหรือเว็บไซต์
            </p>
          </div>
        </div>

        <div className="terms-contact">
          <p>
            หากมีคำถามเกี่ยวกับการใช้งานหรือข้อตกลงนี้ สามารถติดต่อได้ที่อีเมล:
            support@photobooth-demo.com
          </p>
        </div>

        <div className="terms-footer">
          <p className="terms-version">ปรับปรุงล่าสุด: 14 ตุลาคม 2025</p>
          <p className="terms-copyright">
            © 2025 Photo Booth System. All Rights Reserved.
          </p>
        </div>
      </div>

      {/* <div className="terms-back-button">
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
