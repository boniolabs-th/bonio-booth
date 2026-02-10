# Presigned Upload API - Photo Session

API สำหรับให้หน้าตู้ upload ไฟล์โดยตรงไปยัง Storage โดยไม่ต้องผ่าน Backend

## 📋 Overview

### ทำไมต้องใช้ Presigned Upload?

| วิธีเดิม (Two-Phase Upload) | วิธีใหม่ (Presigned Upload) |
|----------------------------|----------------------------|
| หน้าตู้ส่งไฟล์ไป Backend | หน้าตู้ upload ตรงไป Storage |
| Backend เป็น bottleneck | Backend แค่สร้าง URL |
| รอ upload นานกว่า | เร็วกว่า, parallel upload ได้ |

---

## 🔄 Flow Diagram

```
┌─────────────┐                    ┌─────────────┐                    ┌─────────────┐
│   หน้าตู้    │                    │   Backend   │                    │   Storage   │
└──────┬──────┘                    └──────┬──────┘                    └──────┬──────┘
       │                                  │                                  │
       │  1. POST /create-presign-upload  │                                  │
       │  { transactionId, files[] }      │                                  │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │                                  │  สร้าง PhotoSession              │
       │                                  │  สร้าง Presigned URLs            │
       │                                  │  Update paper level              │
       │                                  │                                  │
       │  { sessionId, qrcodeUrl,         │                                  │
       │    uploadUrls[] }                │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
       │  2. PUT file1 to uploadUrl[0]    │                                  │
       │─────────────────────────────────────────────────────────────────────>
       │                                  │                                  │
       │  2. PUT file2 to uploadUrl[1]    │                                  │
       │─────────────────────────────────────────────────────────────────────>
       │                                  │                                  │
       │  2. PUT file3 to uploadUrl[2]    │                                  │
       │─────────────────────────────────────────────────────────────────────>
       │                                  │                                  │
       │  3. POST /{sessionId}/confirm    │                                  │
       │  { uploadedFiles[] }             │                                  │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │                                  │  ตรวจสอบว่าไฟล์ถูก upload จริง   │
       │                                  │  สร้าง PhotoSessionDetails       │
       │                                  │  Update status → 'success'       │
       │                                  │                                  │
       │  { success, photoSession }       │                                  │
       │<─────────────────────────────────│                                  │
       │                                  │                                  │
```

---

## 📍 Endpoints

| Step | Method | Endpoint | Description |
|------|--------|----------|-------------|
| 1 | POST | `/api/machines-public/photo-session/create-presign-upload` | สร้าง PhotoSession และ Presigned URLs |
| 2 | PUT | `{uploadUrl}` (Storage) | หน้าตู้ upload ไฟล์โดยตรง |
| 3 | POST | `/api/machines-public/photo-session/{sessionId}/confirm-upload` | ยืนยันว่า upload เสร็จแล้ว |

---

## 🚀 Step 1: Create Presigned Upload URLs

### Endpoint

```
POST /api/machines-public/photo-session/create-presign-upload
```

### Request Body

```json
{
  "transactionId": "67890abcdef1234567890123",
  "files": [
    { "type": "photo", "contentType": "image/jpeg" },
    { "type": "photo", "contentType": "image/jpeg" },
    { "type": "video", "contentType": "video/mp4" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transactionId` | string | ✅ Yes | Transaction ID (MongoDB ObjectId) |
| `transactionCode` | string | ❌ No | Transaction Code (backward compatibility) |
| `files` | array | ✅ Yes | Array of files to upload |
| `files[].type` | string | ✅ Yes | `"photo"` หรือ `"video"` |
| `files[].contentType` | string | ✅ Yes | MIME type (เช่น `"image/jpeg"`, `"video/mp4"`) |

### Supported Content Types

**รูปภาพ:**
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/gif`
- `image/webp`

**วิดีโอ:**
- `video/mp4`
- `video/quicktime`
- `video/x-msvideo`
- `video/webm`

### Response (201 Created)

```json
{
  "success": true,
  "message": "PhotoSession created with presigned URLs. Upload files directly to the provided URLs.",
  "photoSession": {
    "id": "507f1f77bcf86cd799439011",
    "transactionId": "67890abcdef1234567890123",
    "formatId": "507f1f77bcf86cd799439012",
    "numPhotosSelected": 0,
    "status": "pending"
  },
  "qrcodeStorageUrl": "https://storage-booth.boniolabs.com/photosession/507f1f77bcf86cd799439011",
  "uploadUrls": [
    {
      "type": "photo",
      "order": 1,
      "uploadUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid1.jpg?X-Amz-Algorithm=...",
      "key": "transactions/67890abcdef1234567890123/photos/uuid1.jpg",
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid1.jpg",
      "contentType": "image/jpeg"
    },
    {
      "type": "photo",
      "order": 2,
      "uploadUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid2.jpg?X-Amz-Algorithm=...",
      "key": "transactions/67890abcdef1234567890123/photos/uuid2.jpg",
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid2.jpg",
      "contentType": "image/jpeg"
    },
    {
      "type": "video",
      "order": 1,
      "uploadUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../videos/uuid3.mp4?X-Amz-Algorithm=...",
      "key": "transactions/67890abcdef1234567890123/videos/uuid3.mp4",
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../videos/uuid3.mp4",
      "contentType": "video/mp4"
    }
  ],
  "expiresIn": 1800,
  "expiresAt": "2026-02-03T15:30:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `photoSession` | PhotoSession ที่สร้างขึ้น (status: pending) |
| `qrcodeStorageUrl` | URL สำหรับสร้าง QR code |
| `uploadUrls` | Array ของ presigned URLs สำหรับ upload |
| `uploadUrls[].uploadUrl` | Presigned URL สำหรับ PUT request |
| `uploadUrls[].key` | Storage key (ใช้ในขั้นตอน confirm) |
| `uploadUrls[].publicUrl` | Public URL หลังจาก upload เสร็จ |
| `expiresIn` | เวลาที่ URL หมดอายุ (วินาที) - 1800 = 30 นาที |
| `expiresAt` | วันเวลาที่ URL หมดอายุ (ISO 8601) |

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request (files array ว่าง, content type ไม่ถูกต้อง) |
| 404 | Transaction not found |

---

## 🚀 Step 2: Upload Files to Storage

หน้าตู้ใช้ **PUT request** ส่งไฟล์ไปที่ `uploadUrl` โดยตรง

### Request

```http
PUT {uploadUrl}
Content-Type: image/jpeg

[binary file data]
```

### JavaScript Example

```javascript
async function uploadFile(uploadUrl, fileBuffer, contentType) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: fileBuffer,
    headers: {
      'Content-Type': contentType
    }
  });
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
  
  return true;
}

// Upload all files (parallel)
async function uploadAllFiles(uploadUrls, files) {
  const uploadPromises = uploadUrls.map((urlInfo, index) => 
    uploadFile(urlInfo.uploadUrl, files[index].buffer, urlInfo.contentType)
  );
  
  await Promise.all(uploadPromises);
}
```

### cURL Example

```bash
curl -X PUT \
  "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid1.jpg?X-Amz-Algorithm=..." \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/photo.jpg
```

### สิ่งที่ต้องระวัง

1. **Content-Type ต้องตรงกัน**: ต้องใช้ Content-Type เดียวกับที่ระบุตอนสร้าง URL
2. **URL หมดอายุใน 30 นาที**: ต้อง upload ให้เสร็จก่อน URL หมดอายุ
3. **ไม่ต้อง Authorization**: Presigned URL มี signature อยู่แล้ว

---

## 🚀 Step 3: Confirm Upload

### Endpoint

```
POST /api/machines-public/photo-session/{sessionId}/confirm-upload
```

### Path Parameters

| Parameter | Description |
|-----------|-------------|
| `sessionId` | PhotoSession ID (ได้จาก Step 1) |

### Request Body

```json
{
  "uploadedFiles": [
    { "key": "transactions/67890abc.../photos/uuid1.jpg", "type": "photo", "order": 1 },
    { "key": "transactions/67890abc.../photos/uuid2.jpg", "type": "photo", "order": 2 },
    { "key": "transactions/67890abc.../videos/uuid3.mp4", "type": "video", "order": 1 }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uploadedFiles` | array | ✅ Yes | Array ของไฟล์ที่ upload แล้ว |
| `uploadedFiles[].key` | string | ✅ Yes | Storage key (จาก Step 1) |
| `uploadedFiles[].type` | string | ✅ Yes | `"photo"` หรือ `"video"` |
| `uploadedFiles[].order` | number | ✅ Yes | Order number (จาก Step 1) |

### Response (200 OK) - Success

```json
{
  "success": true,
  "message": "Upload confirmed successfully",
  "photoSession": {
    "id": "507f1f77bcf86cd799439011",
    "transactionId": "67890abcdef1234567890123",
    "numPhotosSelected": 2,
    "status": "success"
  },
  "verifiedFiles": [
    {
      "key": "transactions/67890abc.../photos/uuid1.jpg",
      "type": "photo",
      "order": 1,
      "verified": true,
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid1.jpg"
    },
    {
      "key": "transactions/67890abc.../photos/uuid2.jpg",
      "type": "photo",
      "order": 2,
      "verified": true,
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../photos/uuid2.jpg"
    },
    {
      "key": "transactions/67890abc.../videos/uuid3.mp4",
      "type": "video",
      "order": 1,
      "verified": true,
      "publicUrl": "https://sgp1.digitaloceanspaces.com/boniolabs/transactions/.../videos/uuid3.mp4"
    }
  ]
}
```

### Response (400) - Upload Failed

ถ้าไฟล์บางไฟล์ไม่ถูก upload จริง:

```json
{
  "statusCode": 400,
  "message": "Some files were not uploaded successfully: transactions/.../photos/uuid2.jpg"
}
```

**หมายเหตุ**: PhotoSession status จะถูก update เป็น `"failed"`

### Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request หรือไฟล์ไม่ถูก upload |
| 404 | PhotoSession not found |

---

## 📝 Complete Example (JavaScript)

```javascript
const API_BASE = 'http://localhost:3000/api';

async function uploadPhotosWithPresignedUrls(transactionId, files) {
  // Step 1: Get presigned URLs
  console.log('Step 1: Getting presigned URLs...');
  
  const createResponse = await fetch(
    `${API_BASE}/machines-public/photo-session/create-presign-upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: transactionId,
        files: files.map(f => ({
          type: f.type,
          contentType: f.contentType
        }))
      })
    }
  );
  
  const createData = await createResponse.json();
  
  if (!createData.success) {
    throw new Error('Failed to create presigned URLs');
  }
  
  console.log(`Got ${createData.uploadUrls.length} presigned URLs`);
  console.log(`Session ID: ${createData.photoSession.id}`);
  console.log(`QR Code URL: ${createData.qrcodeStorageUrl}`);
  
  // Step 2: Upload files directly to storage
  console.log('Step 2: Uploading files to storage...');
  
  const uploadPromises = createData.uploadUrls.map(async (urlInfo, index) => {
    console.log(`  Uploading ${urlInfo.type} #${urlInfo.order}...`);
    
    const response = await fetch(urlInfo.uploadUrl, {
      method: 'PUT',
      body: files[index].buffer,
      headers: { 'Content-Type': urlInfo.contentType }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload ${urlInfo.key}`);
    }
    
    console.log(`  ✅ Uploaded ${urlInfo.type} #${urlInfo.order}`);
    return urlInfo;
  });
  
  await Promise.all(uploadPromises);
  
  // Step 3: Confirm upload
  console.log('Step 3: Confirming upload...');
  
  const confirmResponse = await fetch(
    `${API_BASE}/machines-public/photo-session/${createData.photoSession.id}/confirm-upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadedFiles: createData.uploadUrls.map(u => ({
          key: u.key,
          type: u.type,
          order: u.order
        }))
      })
    }
  );
  
  const confirmData = await confirmResponse.json();
  
  if (!confirmData.success) {
    throw new Error('Failed to confirm upload');
  }
  
  console.log('✅ Upload completed successfully!');
  console.log(`PhotoSession status: ${confirmData.photoSession.status}`);
  
  return confirmData;
}

// Usage
const files = [
  { type: 'photo', contentType: 'image/jpeg', buffer: photoBuffer1 },
  { type: 'photo', contentType: 'image/jpeg', buffer: photoBuffer2 },
  { type: 'video', contentType: 'video/mp4', buffer: videoBuffer1 }
];

uploadPhotosWithPresignedUrls('67890abcdef1234567890123', files)
  .then(result => console.log('Done!', result))
  .catch(error => console.error('Error:', error));
```

---

## ⚠️ Important Notes

### 1. URL Expiration
- Presigned URLs หมดอายุใน **30 นาที** (1800 วินาที)
- ต้อง upload ให้เสร็จก่อน URL หมดอายุ
- ถ้า URL หมดอายุ ต้องเรียก Step 1 ใหม่

### 2. File Verification
- Backend จะตรวจสอบว่าไฟล์ถูก upload จริงในขั้นตอน confirm
- ถ้าไฟล์ไม่ครบ PhotoSession status จะเป็น `"failed"`

### 3. Order Matching
- รูปภาพและวิดีโอที่มี order เดียวกันจะถูก map กัน
- เช่น photo order 1 กับ video order 1 จะเป็นคู่กัน

### 4. Parallel Upload
- สามารถ upload หลายไฟล์พร้อมกันได้ (parallel)
- ช่วยลดเวลา upload โดยรวม

### 5. Content-Type
- ต้องใช้ Content-Type ตรงกับที่ระบุตอนสร้าง URL
- ถ้าไม่ตรง upload จะ fail

---

## 🔗 Related Documentation

- [Machine Upload Files API](./MACHINE_UPLOAD_FILES_API.md) - วิธีเดิม (Two-Phase Upload)
- [Transactions API](./TRANSACTIONS_API.md)
- [Storage API](../storage/STORAGE_API.md)

---

## 🧪 Testing Checklist

- [ ] เรียก Step 1 และได้ presigned URLs
- [ ] Upload ไฟล์ไป Storage สำเร็จ
- [ ] เรียก Step 3 confirm สำเร็จ
- [ ] PhotoSession status เป็น `"success"`
- [ ] ทดสอบ case ที่ upload ไม่ครบ (status เป็น `"failed"`)
- [ ] ทดสอบ URL หมดอายุ
