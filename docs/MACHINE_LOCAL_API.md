# Machine Local API Documentation

## 📋 Overview

Machine Local API เป็น public endpoints สำหรับเครื่องหน้าตู้ (local machines) ที่ไม่ต้องใช้ authentication โดยระบบจะระบุตัวตนของ machine จาก **IP address** และ **port** ที่เครื่องส่ง request มา

## 🔐 Authentication & Machine Identification

### วิธีการระบุตัวตน Machine

ระบบจะระบุตัวตนของ machine จาก:

1. **IP Address** - IP address ที่เครื่องส่ง request มา
2. **Port** - Port ที่เครื่องรันอยู่ (localPort ใน Machine schema)

### ลำดับความสำคัญในการดึง Port

1. Query parameter `?port=xxxxx` หรือ header `X-Machine-Port: xxxxx`
2. Origin header (port ของ frontend app เช่น `http://192.168.1.100:33333`)
3. Host header (port ของ backend - fallback)

### Localhost Testing

สำหรับการทดสอบจาก localhost (127.0.0.1, ::1, localhost):
- ระบบจะเช็คเฉพาะ **port** เท่านั้น (ไม่เช็ค IP)
- สามารถใช้ `machineId` ใน query parameter หรือ header `X-Machine-Id` ได้

### Production

สำหรับเครื่องจริง:
- ระบบจะเช็คทั้ง **IP address** และ **port**
- Machine ต้องมี `localIpAddress` และ `localPort` ที่ตรงกับ request

## 📡 API Endpoints

### 1. GET `/api/machines-public/verify`

ตรวจสอบว่า machine สามารถเข้าถึง API ได้หรือไม่

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing

**Response:**
```json
{
  "success": true,
  "message": "Machine verified successfully",
  "machine": {
    "id": "6926008fb7f0df1d5093503b",
    "machineName": "Machine-001",
    "serialNumber": "SN-123456",
    "localIpAddress": "192.168.1.100",
    "localPort": 33333,
    "status": "online"
  },
  "requestInfo": {
    "clientIp": "192.168.1.100",
    "clientPort": 33333,
    "origin": "http://192.168.1.100:33333"
  }
}
```

**Example:**
```bash
# Production
GET /api/machines-public/verify

# Localhost Testing
GET /api/machines-public/verify?machineId=6926008fb7f0df1d5093503b
```

---

### 2. GET `/api/machines-public/theme`

ดึง theme ที่ตู้ถูก assign ปัจจุบัน

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Response:**
```json
{
  "machineId": "6926008fb7f0df1d5093503b",
  "machineName": "Machine-001",
  "theme": {
    "_id": "6924816502dd728488995f69",
    "name": "Bonio Theme",
    "code": "THEME-001",
    "logo": "https://...",
    "background": "https://...",
    "primaryColor": "#FF5733",
    "fontColor": "#FFFFFF",
    "frames": ["frame1", "frame2"],
    "isActive": true
  }
}
```

**Example:**
```bash
# Production
GET /api/machines-public/theme

# Localhost Testing
GET /api/machines-public/theme?port=33333
# หรือ
GET /api/machines-public/theme?machineId=6926008fb7f0df1d5093503b
```

---

### 3. GET `/api/machines-public/frames`

ดึง frames ที่ใช้ได้สำหรับ machine นี้ (global + workspace + machine-specific)

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Response:**
```json
{
  "machineId": "6926008fb7f0df1d5093503b",
  "machineName": "Machine-001",
  "frames": [
    {
      "_id": "6924816502dd728488995f70",
      "name": "Classic Frame",
      "code": "FRAME-001",
      "imageUrl": "https://...",
      "imageSize": "1200x3600",
      "grid": {
        "rows": 3,
        "columns": 1,
        "slots": [...]
      },
      "isActive": true
    }
  ]
}
```

**Example:**
```bash
# Production
GET /api/machines-public/frames

# Localhost Testing
GET /api/machines-public/frames?port=33333
```

---

### 4. POST `/api/machines-public/coupon/check`

ตรวจสอบว่า coupon code ใช้ได้หรือไม่สำหรับ machine นี้

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Request Body:**
```json
{
  "code": "NEWYEAR001"
}
```

**Response:**
```json
{
  "valid": true,
  "message": "Coupon code is valid",
  "coupon": {
    "_id": "6924816502dd728488995f71",
    "name": "New Year Promotion",
    "discountType": "percent",
    "value": 20,
    "expiryDate": "2024-12-31T23:59:59.000Z"
  },
  "couponCode": {
    "_id": "6924816502dd728488995f72",
    "code": "NEWYEAR001",
    "type": "single_use",
    "maxUsage": null
  }
}
```

**Example:**
```bash
# Production
POST /api/machines-public/coupon/check
Content-Type: application/json
{
  "code": "NEWYEAR001"
}

# Localhost Testing
POST /api/machines-public/coupon/check?port=33333
Content-Type: application/json
{
  "code": "NEWYEAR001"
}
```

---

### 5. POST `/api/machines-public/coupon/use`

ใช้/redeem coupon code (สำหรับ single-use จะ mark เป็น used, multi-use จะเพิ่ม usage count)

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Request Body:**
```json
{
  "code": "NEWYEAR001",
  "transactionId": "6924816502dd728488995f73" // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Coupon code is valid and ready to use",
  "coupon": {
    "_id": "6924816502dd728488995f71",
    "name": "New Year Promotion",
    "discountType": "percent",
    "value": 20,
    "expiryDate": "2024-12-31T23:59:59.000Z"
  },
  "couponCode": {
    "_id": "6924816502dd728488995f72",
    "code": "NEWYEAR001",
    "type": "single_use",
    "maxUsage": null
  }
}
```

**Example:**
```bash
# Production
POST /api/machines-public/coupon/use
Content-Type: application/json
{
  "code": "NEWYEAR001"
}
```

---

### 6. GET `/api/machines-public/status`

ดึง config machine ทั้งหมด (theme, frames, paperLevel, etc.)

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Response:**
```json
{
  "machine": {
    "_id": "6926008fb7f0df1d5093503b",
    "machineName": "Machine-001",
    "serialNumber": "SN-123456",
    "status": "online",
    "paperLevel": 80,
    "softwareVersion": 1,
    "cameraCountdown": 3,
    "setTimer": "disabled",
    "timerSchedule": null,
    "isMaintenanceMode": false,
    "lastUpdate": "2024-11-26T12:00:00.000Z"
  },
  "theme": {
    "_id": "6924816502dd728488995f69",
    "name": "Bonio Theme",
    "code": "THEME-001"
  },
  "framesCount": 5
}
```

**Example:**
```bash
# Production
GET /api/machines-public/status

# Localhost Testing
GET /api/machines-public/status?port=33333
```

---

### 7. POST `/api/machines-public/paper-level`

อัพเดท paper level ของ machine

**Query Parameters:**
- `machineId` (optional) - Machine ID สำหรับ localhost testing
- `port` (optional) - Port ของ frontend สำหรับ localhost testing

**Request Body:**
```json
{
  "paperLevel": 80
}
```

**Response:**
```json
{
  "success": true,
  "message": "Paper level updated successfully",
  "machine": {
    "_id": "6926008fb7f0df1d5093503b",
    "machineName": "Machine-001",
    "paperLevel": 80
  }
}
```

**Example:**
```bash
# Production
POST /api/machines-public/paper-level
Content-Type: application/json
{
  "paperLevel": 80
}

# Localhost Testing
POST /api/machines-public/paper-level?port=33333
Content-Type: application/json
{
  "paperLevel": 80
}
```

---

## 🔍 Machine Identification Flow

### Production (เครื่องจริง)

1. ระบบดึง IP address จาก request headers (`X-Forwarded-For`, `X-Real-IP`, หรือ `req.ip`)
2. ระบบดึง port จาก:
   - Query parameter `?port=xxxxx` หรือ header `X-Machine-Port`
   - Origin header (port ของ frontend)
   - Host header (port ของ backend - fallback)
3. ระบบหา machine ที่มี:
   - `localIpAddress` = IP ที่ดึงมา
   - `localPort` = port ที่ดึงมา
4. ถ้าพบ → อนุญาต, ถ้าไม่พบ → Reject (404)

### Localhost Testing

1. ระบบตรวจสอบว่า IP เป็น localhost (127.0.0.1, ::1, localhost)
2. ถ้าเป็น localhost → เช็คเฉพาะ port (ไม่เช็ค IP)
3. ระบบหา machine ที่มี `localPort` = port ที่ดึงมา
4. หรือใช้ `machineId` ใน query parameter/header

---

## 📝 ตัวอย่างการใช้งาน

### Production (เครื่องหน้าตู้จริง)

```javascript
// Frontend app รันที่ port 33333
// Machine ในระบบมี localIpAddress = "192.168.1.100", localPort = 33333

// เรียก API (ไม่ต้องส่งอะไร - ระบบจะหาเองจาก IP/port)
fetch('http://backend-server:3000/api/machines-public/theme')
  .then(res => res.json())
  .then(data => console.log(data));
```

### Localhost Testing

```javascript
// วิธีที่ 1: ใช้ port ใน query parameter
fetch('http://localhost:3000/api/machines-public/theme?port=33333')
  .then(res => res.json())
  .then(data => console.log(data));

// วิธีที่ 2: ใช้ machineId
fetch('http://localhost:3000/api/machines-public/theme?machineId=6926008fb7f0df1d5093503b')
  .then(res => res.json())
  .then(data => console.log(data));

// วิธีที่ 3: ใช้ header
fetch('http://localhost:3000/api/machines-public/theme', {
  headers: {
    'X-Machine-Port': '33333'
    // หรือ
    // 'X-Machine-Id': '6926008fb7f0df1d5093503b'
  }
})
  .then(res => res.json())
  .then(data => console.log(data));
```

---

## ⚠️ Error Responses

### Machine Not Found (404)

```json
{
  "message": "Machine not found for IP: 192.168.1.100, port: 33333. Please ensure the machine is registered with this IP address and port.",
  "error": "Not Found",
  "statusCode": 404
}
```

### Port Required (404)

```json
{
  "message": "Port is required. Please ensure the request includes port information.",
  "error": "Not Found",
  "statusCode": 404
}
```

---

## 🔒 Security Notes

1. **Production**: ระบบเช็คทั้ง IP และ port เพื่อความปลอดภัย
2. **Localhost**: เช็คเฉพาะ port (สำหรับ development)
3. **Machine Registration**: Machine ต้องมี `localIpAddress` และ `localPort` ที่ถูกต้องในฐานข้อมูล
4. **Port Uniqueness**: `localPort` ต้อง unique (30000-99999)

---

## 📊 Logging

ระบบจะ log ข้อมูลต่อไปนี้:

```
🔍 [getMachineFromRequest] machineId: undefined, clientIp: 192.168.1.100, clientPort: 33333, origin: http://192.168.1.100:33333
🔍 [getMachineFromRequest] Production mode, looking for machine with IP: 192.168.1.100, port: 33333
✅ [getMachineFromRequest] Found machine by IP/port: Machine-001 (IP: 192.168.1.100, port: 33333)
```

หรือถ้าหาไม่เจอ:

```
❌ [getMachineFromRequest] Machine not found for IP: 192.168.1.100, port: 33333. Available machines: Machine-001 (192.168.1.101:33334), Machine-002 (192.168.1.102:33335)
```

---

## 🛠️ Setup Machine

### 1. สร้าง Machine พร้อม IP และ Port

```bash
POST /api/machines
{
  "workspaceId": "507f1f77bcf86cd799439011",
  "machineName": "Machine-001",
  "siteName": "Ratchayothin",
  "serialNumber": "SN-123456",
  "localIpAddress": "192.168.1.100",
  "localPort": 33333
}
```

### 2. อัพเดท IP หรือ Port

```bash
PATCH /api/machines/:id
{
  "localIpAddress": "192.168.1.101",
  "localPort": 33334
}
```

---

## 📌 Important Notes

1. **Port Range**: `localPort` ต้องอยู่ระหว่าง 30000-99999
2. **Port Uniqueness**: `localPort` ต้อง unique (ไม่ซ้ำกับเครื่องอื่น)
3. **IP Address**: รองรับทั้ง IP address (เช่น `192.168.1.100`) และ `localhost`
4. **Origin Header**: Frontend ควรส่ง Origin header ที่มี port เพื่อให้ระบบดึง port อัตโนมัติ

---

## 🔗 Related Documentation

- [IP Whitelist and CORS](./IP_WHITELIST_AND_CORS.md)
- [Machine Management API](./api/API_DOCUMENTATION.md#4-machines-apimachines)

