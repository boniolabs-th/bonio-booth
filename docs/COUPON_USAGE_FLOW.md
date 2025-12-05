# ขั้นตอนการใช้ Coupon และการเช็ค Payment Status

## Flow การใช้งาน Coupon

### 1. Validate Coupon Code (ตรวจสอบว่า coupon ใช้งานได้หรือไม่)

**Endpoint:** `POST /api/coupons/validate`

**Request Body:**
```json
{
  "code": "NEWYEAR2024001",
  "machineId": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "valid": true,
  "coupon": {
    "_id": "...",
    "name": "NEWYEAR2024",
    "discountType": "percent",
    "value": 20
  },
  "couponCode": {
    "_id": "...",
    "code": "NEWYEAR2024001",
    "type": "single_use",
    "status": "available"
  }
}
```

**หมายเหตุ:** 
- ถ้า `valid: false` จะมี `message` อธิบายเหตุผล
- ควร validate ก่อนสร้าง payment เพื่อให้แน่ใจว่า coupon ใช้งานได้

---

### 2. สร้าง Payment พร้อม Coupon

**Endpoint:** `POST /api/machines-public/payment`

**Headers:**
```
X-Machine-Id: <machine_id>
```

**Request Body:**
```json
{
  "amount": 100,
  "numberPhoto": 1,
  "paymentMethodId": "507f1f77bcf86cd799439011",
  "couponCodeId": "507f1f77bcf86cd799439012"
}
```

**Response (กรณีชำระเงิน):**
```json
{
  "success": true,
  "qr_code": "https://...",
  "reference_id": "MCH-1703123456789-ABC123",
  "order_id": "KSHER-123456",
  "transactionId": "507f1f77bcf86cd799439013",
  "paymentDetailsId": "507f1f77bcf86cd799439014",
  "numberPhoto": 1,
  "discountAmount": 20,
  "totalAmount": 100,
  "netAmount": 80,
  "couponCodeId": "507f1f77bcf86cd799439012",
  "isFree": false
}
```

**Response (กรณีฟรี - netAmount = 0):**
```json
{
  "success": true,
  "qr_code": null,
  "reference_id": "MCH-1703123456789-ABC123",
  "order_id": null,
  "transactionId": "507f1f77bcf86cd799439013",
  "paymentDetailsId": null,
  "numberPhoto": 1,
  "discountAmount": 100,
  "totalAmount": 100,
  "netAmount": 0,
  "couponCodeId": "507f1f77bcf86cd799439012",
  "isFree": true
}
```

**สิ่งที่เกิดขึ้น:**
1. ระบบจะ validate coupon code อีกครั้ง (เพื่อความปลอดภัย)
2. คำนวณ discount:
   - `percent`: `discountAmount = (amount * value) / 100`
   - `fixed_amount`: `discountAmount = value` (ไม่เกิน amount)
3. คำนวณ `netAmount = max(0, amount - discountAmount)`
4. สร้าง Transaction พร้อม `couponCodeId`
5. ถ้า `netAmount = 0`:
   - Transaction status = `SUCCESS` ทันที
   - Mark coupon code as used
   - ไม่ต้องสร้าง Ksher payment
6. ถ้า `netAmount > 0`:
   - สร้าง Ksher payment order
   - ส่ง `netAmount` (จำนวนเงินหลังหัก discount) ไปยัง Ksher
   - Transaction status = `PENDING`

---

### 3. เช็ค Payment Status

**Endpoint:** `GET /api/machines-public/payment/status/:mchOrderNo`

**ตัวอย่าง:** `GET /api/machines-public/payment/status/MCH-1703123456789-ABC123`

**Response (กรณีชำระเงินสำเร็จ):**
```json
{
  "success": true,
  "status": "SUCCESS",
  "amount": 80,
  "reference_id": "MCH-1703123456789-ABC123",
  "transactionStatus": "success",
  "isFree": false
}
```

**Response (กรณีฟรี - netAmount = 0):**
```json
{
  "success": true,
  "status": "SUCCESS",
  "amount": 0,
  "reference_id": "MCH-1703123456789-ABC123",
  "transactionStatus": "success",
  "isFree": true
}
```

**Response (กรณียังไม่ชำระเงิน):**
```json
{
  "success": true,
  "status": "NOTPAY",
  "amount": 80,
  "reference_id": "MCH-1703123456789-ABC123",
  "transactionStatus": "pending",
  "isFree": false
}
```

**Response (กรณีชำระเงินล้มเหลว):**
```json
{
  "success": true,
  "status": "FAIL",
  "amount": 80,
  "reference_id": "MCH-1703123456789-ABC123",
  "transactionStatus": "failed",
  "isFree": false
}
```

**Payment Status Values:**
- `SUCCESS`: ชำระเงินสำเร็จ
- `PROCESSING`: กำลังดำเนินการ
- `NOTPAY`: ยังไม่ชำระเงิน
- `FAIL`: ชำระเงินล้มเหลว

**Transaction Status Values:**
- `success`: ชำระเงินสำเร็จ
- `failed`: ชำระเงินล้มเหลว
- `pending`: กำลังรอชำระเงิน
- `refunded`: คืนเงินแล้ว

**สิ่งที่เกิดขึ้นเมื่อ status = SUCCESS:**
1. อัพเดต PaymentDetails status = `SUCCESS`
2. อัพเดต Transaction status = `success`
3. **Mark coupon code as used** (สำหรับ single-use coupon)
   - สำหรับ multi-use coupon จะไม่ mark status แต่จะนับจาก transaction

---

## Polling Strategy (แนะนำ)

หน้าตู้ควร polling endpoint นี้ทุก 2-3 วินาทีจนกว่าจะได้ status เป็น `SUCCESS` หรือ `FAIL`:

```javascript
async function checkPaymentStatus(mchOrderNo) {
  const maxAttempts = 60; // 60 attempts = ~3 minutes (if polling every 3 seconds)
  let attempts = 0;

  const poll = async () => {
    const response = await fetch(
      `/api/machines-public/payment/status/${mchOrderNo}`
    );
    const data = await response.json();

    if (data.status === 'SUCCESS' || data.status === 'FAIL') {
      return data;
    }

    if (attempts >= maxAttempts) {
      throw new Error('Payment timeout');
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    return poll();
  };

  return poll();
}
```

---

## Flow Diagram

```
1. Validate Coupon
   POST /api/coupons/validate
   ↓
   [valid: true/false]

2. Create Payment with Coupon
   POST /api/machines-public/payment
   {
     amount: 100,
     couponCodeId: "..."
   }
   ↓
   [Calculate discount]
   ↓
   [netAmount = amount - discount]
   ↓
   ┌─────────────────────────┐
   │ netAmount === 0?        │
   └─────────────────────────┘
         │              │
        YES            NO
         │              │
         ↓              ↓
   [Free Transaction]  [Paid Transaction]
   - Status: SUCCESS   - Status: PENDING
   - Mark coupon used  - Create Ksher payment
   - No QR code        - Return QR code
   ↓                    ↓
   [Return response]   [Return response with QR]

3. Check Payment Status (Polling)
   GET /api/machines-public/payment/status/:mchOrderNo
   ↓
   [Check Ksher status]
   ↓
   ┌─────────────────────────┐
   │ status === SUCCESS?      │
   └─────────────────────────┘
         │              │
        YES            NO
         │              │
         ↓              ↓
   [Update Transaction] [Continue polling]
   - Status: success
   - Mark coupon used
   ↓
   [Return SUCCESS]
```

---

## สรุปขั้นตอน

1. **Validate Coupon** (Optional แต่แนะนำ)
   - `POST /api/coupons/validate` - ตรวจสอบว่า coupon ใช้งานได้

2. **Create Payment**
   - `POST /api/machines-public/payment` - สร้าง payment พร้อม `couponCodeId`
   - ระบบจะคำนวณ discount และสร้าง transaction อัตโนมัติ
   - ถ้า `netAmount = 0` จะเป็น free transaction (ไม่ต้องชำระเงิน)

3. **Check Payment Status** (Polling)
   - `GET /api/machines-public/payment/status/:mchOrderNo` - เช็คสถานะการชำระเงิน
   - Polling ทุก 2-3 วินาทีจนกว่าจะได้ `SUCCESS` หรือ `FAIL`
   - เมื่อ `SUCCESS` ระบบจะ mark coupon code as used อัตโนมัติ

---

## หมายเหตุสำคัญ

1. **Coupon Types:**
   - `single_use`: ใช้ได้ครั้งเดียว เมื่อชำระเงินสำเร็จจะ mark status = `used`
   - `multi_use`: ใช้ได้หลายครั้ง (ตาม `maxUsage`) ไม่ mark status แต่จะนับจาก transaction

2. **Free Transaction:**
   - ถ้า `netAmount = 0` (discount >= amount) จะเป็น free transaction
   - Transaction status = `SUCCESS` ทันที
   - Coupon จะถูก mark as used ทันที
   - ไม่ต้องสร้าง Ksher payment

3. **Coupon Validation:**
   - ตรวจสอบ coupon group status = `active`
   - ตรวจสอบ coupon code status = `available`
   - ตรวจสอบ expiry date
   - ตรวจสอบว่า coupon group ถูก assign ให้ machine นี้หรือไม่
   - สำหรับ multi-use: ตรวจสอบว่าไม่เกิน `maxUsage`

4. **Error Handling:**
   - ถ้า coupon ไม่ valid จะได้ `400 Bad Request` พร้อม error message
   - ถ้า payment creation ล้มเหลว transaction status จะเป็น `failed`

