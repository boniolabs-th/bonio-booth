# Countdown Component

Component สำหรับนับถอยหลังที่สามารถใช้ได้ทุก component ในแอปพลิเคชัน

## คุณสมบัติ

- ✅ นับถอยหลังเป็นวินาที
- ✅ แสดงผลที่มุมบนขวาของจอ (fixed position)
- ✅ รองรับ callback function เมื่อนับถึง 0
- ✅ สามารถซ่อน/แสดงได้
- ✅ มี warning และ critical states เมื่อเหลือเวลาน้อย
- ✅ Responsive design

## การใช้งาน

### ตัวอย่างพื้นฐาน

```tsx
import { Countdown } from '../components';

function MyComponent() {
  const navigate = useNavigate();

  const handleCountdownComplete = () => {
    // ทำอะไรบางอย่างเมื่อนับถึง 0
    navigate('/home');
  };

  return (
    <div>
      <Countdown
        seconds={60}
        onComplete={handleCountdownComplete}
      />
      {/* ... content อื่นๆ ... */}
    </div>
  );
}
```

### ตัวอย่าง: กลับไปหน้า home เมื่อหมดเวลา

```tsx
import { Countdown } from '../components';
import { useNavigate } from 'react-router-dom';

function PaymentPage() {
  const navigate = useNavigate();

  const handleTimeout = () => {
    console.log('⏰ หมดเวลาแล้ว กลับไปหน้า home');
    navigate('/');
  };

  return (
    <div>
      <Countdown
        seconds={300} // 5 นาที
        onComplete={handleTimeout}
      />
      {/* ... content ... */}
    </div>
  );
}
```

### ตัวอย่าง: ไปหน้าถัดไปเมื่อหมดเวลา

```tsx
import { Countdown } from '../components';
import { useNavigate } from 'react-router-dom';

function PhotoPreparePage() {
  const navigate = useNavigate();

  const handleAutoNext = () => {
    console.log('⏰ หมดเวลาแล้ว ไปหน้าถัดไป');
    navigate('/main-shooting', { state: { /* ... */ } });
  };

  return (
    <div>
      <Countdown
        seconds={10}
        onComplete={handleAutoNext}
      />
      {/* ... content ... */}
    </div>
  );
}
```

### ตัวอย่าง: ซ่อน countdown เมื่อเงื่อนไขบางอย่าง

```tsx
import { Countdown } from '../components';
import { useState } from 'react';

function MyComponent() {
  const [showTimer, setShowTimer] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);

  const handleComplete = () => {
    setIsCompleted(true);
    // ทำอะไรบางอย่าง
  };

  return (
    <div>
      <Countdown
        seconds={60}
        onComplete={handleComplete}
        visible={showTimer && !isCompleted}
      />
      
      {isCompleted && (
        <div>เสร็จสิ้น!</div>
      )}
      
      <button onClick={() => setShowTimer(!showTimer)}>
        {showTimer ? 'ซ่อน Timer' : 'แสดง Timer'}
      </button>
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `seconds` | `number` | `60` | จำนวนวินาทีที่ต้องการนับถอยหลัง |
| `onComplete` | `() => void` | `undefined` | Callback function ที่จะถูกเรียกเมื่อนับถึง 0 |
| `visible` | `boolean` | `true` | แสดง countdown หรือไม่ |
| `className` | `string` | `''` | CSS class เพิ่มเติม |

## สไตล์

Component จะแสดงผลที่มุมบนขวาของจอ (fixed position) และมี:
- **ปกติ**: พื้นหลังสีดำโปร่งแสง
- **Warning** (≤10 วินาที): พื้นหลังสีส้ม + animation pulse
- **Critical** (≤5 วินาที): พื้นหลังสีแดง + animation pulse เร็วขึ้น

## หมายเหตุ

- Component จะเรียก `onComplete` แค่ครั้งเดียวเมื่อนับถึง 0
- เมื่อ `seconds` prop เปลี่ยน countdown จะ reset ใหม่
- Component จะ cleanup interval อัตโนมัติเมื่อ unmount

