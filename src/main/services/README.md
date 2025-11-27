# Machine Service

Service สำหรับเรียก Machine Local API ตามเอกสาร [MACHINE_LOCAL_API.md](../../../docs/MACHINE_LOCAL_API.md)

## 📦 Installation

Service นี้พร้อมใช้งานแล้ว ไม่ต้องติดตั้ง dependencies เพิ่มเติม

## 🚀 Quick Start

### Basic Usage

```typescript
import machineService from './services/machineService';

// เรียก API theme
const theme = await machineService.getTheme();
console.log('Theme:', theme.theme.name);
console.log('Background:', theme.theme.background);
```

### Custom Configuration

```typescript
import { MachineService } from './services/machineService';

const customService = new MachineService({
  apiBaseUrl: 'http://localhost:3000', // สำหรับ localhost testing
  machinePort: 33333,
  machineId: '6926008fb7f0df1d5093503b', // สำหรับ localhost testing
  timeout: 5000,
});
```

## 📚 API Methods

### 1. `verify(machineId?: string)`

ตรวจสอบว่า machine สามารถเข้าถึง API ได้หรือไม่

```typescript
const response = await machineService.verify();
console.log('Machine:', response.machine.machineName);
```

### 2. `getTheme(machineId?: string)`

ดึง theme ที่ตู้ถูก assign ปัจจุบัน

```typescript
const theme = await machineService.getTheme();
console.log('Background:', theme.theme.background);
console.log('Primary Color:', theme.theme.primaryColor);
```

### 3. `getFrames(machineId?: string)`

ดึง frames ที่ใช้ได้สำหรับ machine นี้

```typescript
const frames = await machineService.getFrames();
console.log('Frames:', frames.frames.length);
```

### 4. `checkCoupon(code: string, machineId?: string)`

ตรวจสอบว่า coupon code ใช้ได้หรือไม่

```typescript
const result = await machineService.checkCoupon('NEWYEAR001');
if (result.valid) {
  console.log('Coupon is valid!');
}
```

### 5. `useCoupon(code: string, transactionId?: string, machineId?: string)`

ใช้/redeem coupon code

```typescript
const result = await machineService.useCoupon('NEWYEAR001', 'TXN-123');
if (result.success) {
  console.log('Coupon used successfully!');
}
```

### 6. `getStatus(machineId?: string)`

ดึง config machine ทั้งหมด

```typescript
const status = await machineService.getStatus();
console.log('Paper Level:', status.machine.paperLevel);
console.log('Status:', status.machine.status);
```

### 7. `updatePaperLevel(paperLevel: number, machineId?: string)`

อัพเดท paper level ของ machine

```typescript
const result = await machineService.updatePaperLevel(85);
console.log('Updated:', result.machine.paperLevel);
```

## ⚙️ Configuration

### Environment Variables

- `API_URL` - Base URL ของ API (default: `https://api-booth.boniolabs.com`)
- `PORT` - Port ที่แอปรันอยู่ (default: `33333`)
- `MACHINE_ID` - Machine ID สำหรับ localhost testing (optional)

### Constructor Options

```typescript
interface MachineServiceOptions {
  apiBaseUrl?: string;    // Base URL ของ API
  machinePort?: number;   // Port ที่แอปรันอยู่
  machineId?: string;     // Machine ID สำหรับ localhost testing
  timeout?: number;       // Request timeout (ms, default: 10000)
}
```

## 🔍 Machine Identification

### Production Mode

ระบบจะระบุ machine จาก:
- **IP Address** - IP ที่ส่ง request มา
- **Port** - Port ที่ส่งมาใน header `X-Machine-Port`

### Localhost Testing

สำหรับการทดสอบจาก localhost:
- ใช้ `machineId` ใน query parameter หรือ header `X-Machine-Id`
- หรือใช้ `port` ใน query parameter หรือ header `X-Machine-Port`

```typescript
// วิธีที่ 1: ใช้ machineId
const service = new MachineService({
  machineId: '6926008fb7f0df1d5093503b',
});

// วิธีที่ 2: ใช้ port (สำหรับ localhost)
const service = new MachineService({
  machinePort: 33333,
});
```

## 📝 Examples

ดูตัวอย่างการใช้งานเพิ่มเติมได้ที่ [machineService.example.ts](./machineService.example.ts)

### Example: Initialize App with Theme

```typescript
import machineService from './services/machineService';

app.whenReady().then(async () => {
  try {
    // เรียก API theme ตอนเริ่ม app
    const themeResponse = await machineService.getTheme();
    
    // ส่ง theme ไปให้ renderer process
    if (mainWindow && themeResponse.theme.background) {
      mainWindow.webContents.send('theme-loaded', themeResponse.theme);
    }
    
    createWindow();
  } catch (error) {
    console.error('Failed to initialize machine:', error);
    createWindow(); // ยังคงสร้าง window แม้ API จะล้มเหลว
  }
});
```

### Example: Coupon Flow

```typescript
// 1. ตรวจสอบ coupon
const checkResult = await machineService.checkCoupon('NEWYEAR001');

if (!checkResult.valid) {
  console.log('Coupon is invalid');
  return;
}

// 2. ใช้ coupon
const useResult = await machineService.useCoupon('NEWYEAR001', 'TXN-123');
if (useResult.success) {
  console.log('Coupon used successfully!');
}
```

## 🛡️ Error Handling

Service จะ throw Error เมื่อ:
- HTTP status code ไม่ใช่ 2xx
- Request timeout
- Network error
- Parse error

```typescript
try {
  const theme = await machineService.getTheme();
  console.log('Theme:', theme);
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('404')) {
      console.error('Machine not found');
    } else if (error.message.includes('timeout')) {
      console.error('Request timeout');
    } else {
      console.error('API Error:', error.message);
    }
  }
}
```

## 📊 Logging

Service จะ log ข้อมูลต่อไปนี้:
- `🔍 [MachineService] Verifying machine...`
- `✅ [MachineService] Machine verified: Machine-001`
- `❌ [MachineService] Verify failed: ...`

## 🔗 Related Documentation

- [MACHINE_LOCAL_API.md](../../../docs/MACHINE_LOCAL_API.md) - API Documentation
- [machineService.example.ts](./machineService.example.ts) - Usage Examples

