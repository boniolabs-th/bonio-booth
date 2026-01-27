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

  // keep latest onComplete
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // reset when seconds change
  useEffect(() => {
    setTimeLeft(seconds);
    hasCompletedRef.current = false;
  }, [seconds]);

  // main countdown interval (run once)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // stop interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
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
  }, []);

  // fire onComplete when reach 0
  useEffect(() => {
    if (timeLeft === 0 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;

      setTimeout(() => {
        onCompleteRef.current?.();
      }, 0);
    }
  }, [timeLeft]);

  if (!visible) {
    return null;
  }

  const minutes = Math.floor(timeLeft / 60);
  const remainingSeconds = timeLeft % 60;
  const displayTime = `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, '0')}`;

  const warningClass = timeLeft <= 10 && timeLeft > 5 ? 'warning' : '';
  const criticalClass = timeLeft <= 5 ? 'critical' : '';

  return (
    <div
      className={`countdown-container ${warningClass} ${criticalClass} ${className}`}
    >
      <div className="countdown-circle">
        <span className="countdown-text">{displayTime}</span>
      </div>
    </div>
  );
}
