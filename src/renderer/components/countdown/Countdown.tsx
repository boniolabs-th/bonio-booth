import React, { useState, useEffect, useRef } from 'react';
import './Countdown.css';

interface CountdownProps {
  /** จำนวนวินาทีที่ต้องการนับถอยหลัง (default: 60) */
  seconds?: number;
  /** Callback function ที่จะถูกเรียกเมื่อนับถึง 0 */
  onComplete?: () => void;
  /** แสดง countdown หรือไม่ (default: true) */
  visible?: boolean;
  /** CSS class เพิ่มเติม */
  className?: string;
}

export default function Countdown({
  seconds = 60,
  onComplete,
  visible = true,
  className = '',
}: CountdownProps): React.JSX.Element | null {
  const [timeLeft, setTimeLeft] = useState<number>(seconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  // อัพเดท onComplete ref เมื่อ prop เปลี่ยน
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset countdown เมื่อ seconds prop เปลี่ยน
  useEffect(() => {
    setTimeLeft(seconds);
    hasCompletedRef.current = false;
  }, [seconds]);

  // เรียก onComplete เมื่อ timeLeft ถึง 0 (แยกออกจาก countdown logic เพื่อหลีกเลี่ยง setState ใน render)
  // ไม่ต้องเช็ค visible เพราะต้องการให้ onComplete ทำงานแม้ซ่อนอยู่
  useEffect(() => {
    if (timeLeft === 0 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      // ใช้ setTimeout เพื่อให้แน่ใจว่าไม่ได้เรียกในระหว่าง render cycle
      setTimeout(() => {
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, 0);
    }
  }, [timeLeft]);

  // Countdown logic - ทำงานแม้ visible={false} (แค่ซ่อนการแสดงผล)
  useEffect(() => {
    if (timeLeft <= 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timeLeft]);

  // Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (!visible) {
    return null;
  }

  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;
  const displayTime = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  // เพิ่ม warning และ critical classes
  const warningClass = timeLeft <= 10 && timeLeft > 5 ? 'warning' : '';
  const criticalClass = timeLeft <= 5 ? 'critical' : '';

  return (
    <div className={`countdown-container ${warningClass} ${criticalClass} ${className}`}>
      <div className="countdown-circle">
        <span className="countdown-text">{displayTime}</span>
      </div>
    </div>
  );
}

