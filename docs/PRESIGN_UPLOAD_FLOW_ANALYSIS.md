# การวิเคราะห์ FLOW ของ Presign Upload

## 📋 Flow Overview

### Step 1: Create Presign Session
**Location:** `src/renderer/components/photoresult/PhotoResult.tsx` (line 1176-1271)

**Process:**
1. เมื่อมี `transactionId` จะเรียก `createPresignUpload`
2. สร้าง `filesMeta` โดยนับ:
   - `finalImage` → 1 photo (order 1)
   - `selectedCaptures` แต่ละตัวที่มี `photo` → N photos (order 2, 3, ...)
   - `selectedCaptures` (ถ้ามี) → 1 video
3. ส่ง `filesMeta` ไป API
4. ได้ `sessionId`, `qrcodeStorageUrl`, `uploadUrls[]` กลับมา

**Code:**
```typescript
// Line 1192-1215
const filesMeta = [];
if (state.finalImage) {
  filesMeta.push({ type: 'photo', contentType: 'image/jpeg' });
}
if (state.selectedCaptures && state.selectedCaptures.length > 0) {
  state.selectedCaptures.forEach((capture) => {
    if (capture.photo) {
      filesMeta.push({ type: 'photo', contentType: 'image/jpeg' });
    }
  });
}
if (state.selectedCaptures && state.selectedCaptures.length > 0) {
  filesMeta.push({ type: 'video', contentType: 'video/mp4' });
}
```

### Step 2: Queue Background Upload
**Location:** `src/renderer/components/photoresult/PhotoResult.tsx` (line 1860-1974, 2250-2348)

**Process:**
1. สร้าง `photos` array:
   - `finalImage` → `photos[0]`
   - `selectedCaptures` แต่ละตัว → `photos[1]`, `photos[2]`, ...
2. สร้าง `videos` array: **ว่างเปล่า** (เพราะส่ง `webmVideoPath` แทน)
3. ส่ง `photos`, `videos`, `webmVideoPath`, `uploadUrls` ไป `queueBackgroundUpload`

**Code:**
```typescript
// Line 1862-1912
const photos: string[] = [];
const videos: string[] = [];

// finalImage → photos[0]
if (state.finalImage) {
  photos.push(convertedImage);
}

// selectedCaptures → photos[1], photos[2], ...
if (state.selectedCaptures && state.selectedCaptures.length > 0) {
  for (let i = 0; i < state.selectedCaptures.length; i++) {
    const capture = state.selectedCaptures[i];
    if (capture.photo) {
      photos.push(filteredPhoto);
    }
  }
}

// videos array ว่างเปล่า - ส่ง webmVideoPath แทน
```

### Step 3: Execute Upload
**Location:** `src/main/services/backgroundUploadService.ts` (line 261-473)

**Process:**
1. Convert WebM → MP4 (ถ้ามี `webmVideoPath`)
2. แยก `uploadUrls` เป็น `photoUrls` และ `videoUrls` (sort by order)
3. Match `photos[i]` กับ `photoUrls[i]` (ใช้ index ไม่ใช่ order)
4. Match `videosToUpload[i]` กับ `videoUrls[i]` (ใช้ index ไม่ใช่ order)
5. PUT files ไปยัง presigned URLs (parallel)
6. Confirm upload

**Code:**
```typescript
// Line 321-326
const photoUrls = job.uploadUrls
  .filter((u) => u.type === 'photo')
  .sort((a, b) => a.order - b.order);
const videoUrls = job.uploadUrls
  .filter((u) => u.type === 'video')
  .sort((a, b) => a.order - b.order);

// Line 339-375
const photoCount = Math.min(job.photos.length, photoUrls.length);
for (let i = 0; i < photoCount; i++) {
  const urlInfo = photoUrls[i]; // i=0 → order=1, i=1 → order=2, ...
  const photoIndex = i; // Match photos[i] with photoUrls[i]
  // PUT photos[photoIndex] to urlInfo.uploadUrl
}
```

---

## ⚠️ ปัญหาที่พบ

### 1. **การนับจำนวนไฟล์ไม่ตรงกัน**

**ปัญหา:**
- ใน `createPresignSession`: นับ `filesMeta` โดยดูจาก `state.selectedCaptures.forEach((capture) => { if (capture.photo) ... })`
- แต่ใน `upload`: สร้าง `photos` array โดยดูจาก `state.selectedCaptures[i]` ที่มี `photo`
- ถ้า `selectedCaptures` มีบางตัวที่ไม่มี `photo` จะทำให้จำนวนไม่ตรงกัน

**ตัวอย่าง:**
```typescript
// createPresignSession
selectedCaptures = [
  { photo: 'blob:...' },      // ✅ นับ
  { photo: null },             // ❌ ไม่นับ
  { photo: 'blob:...' }        // ✅ นับ
]
// filesMeta = [photo, photo] → 2 photos

// upload
selectedCaptures = [
  { photo: 'blob:...' },       // ✅ เพิ่ม
  { photo: null },             // ❌ ข้าม
  { photo: 'blob:...' }        // ✅ เพิ่ม
]
// photos = [photo, photo] → 2 photos ✅ ตรงกัน

// แต่ถ้า...
selectedCaptures = [
  { photo: 'blob:...' },       // ✅ เพิ่ม
  { photo: null },             // ❌ ข้าม
  { photo: null }              // ❌ ข้าม
]
// filesMeta = [photo] → 1 photo
// photos = [photo] → 1 photo ✅ ตรงกัน
```

**สถานะ:** ✅ **ไม่ใช่ปัญหา** - Logic ตรงกัน

---

### 2. **การ Match Order vs Index**

**ปัญหา:**
- `uploadUrls` มี `order` (1, 2, 3, ...)
- แต่การ match ใน `backgroundUploadService` ใช้ `index` (0, 1, 2, ...)
- ถ้า `order` เริ่มที่ 1 แต่ `index` เริ่มที่ 0 อาจทำให้ match ผิด

**ตัวอย่าง:**
```typescript
// uploadUrls จาก API
[
  { type: 'photo', order: 1, uploadUrl: '...' },  // finalImage
  { type: 'photo', order: 2, uploadUrl: '...' },  // capture[0]
  { type: 'photo', order: 3, uploadUrl: '...' },  // capture[1]
  { type: 'video', order: 1, uploadUrl: '...' }   // video
]

// After sort by order
photoUrls = [
  { type: 'photo', order: 1, ... },  // index 0
  { type: 'photo', order: 2, ... },  // index 1
  { type: 'photo', order: 3, ... }   // index 2
]

// photos array
photos = [
  finalImage,      // index 0 → match with photoUrls[0] (order 1) ✅
  capture[0],      // index 1 → match with photoUrls[1] (order 2) ✅
  capture[1]      // index 2 → match with photoUrls[2] (order 3) ✅
]
```

**สถานะ:** ✅ **ไม่ใช่ปัญหา** - Match ถูกต้อง (index 0 → order 1, index 1 → order 2, ...)

---

### 3. **Video Handling - videos array ว่างเปล่า**

**ปัญหา:**
- ใน `upload`: สร้าง `videos` array **ว่างเปล่า** แล้วส่ง `webmVideoPath` แทน
- ใน `backgroundUploadService`: ถ้ามี `webmVideoPath` จะ convert แล้ว push เข้า `videosToUpload`
- แต่ถ้าไม่มี `video` URL ใน `uploadUrls` จะไม่ upload video

**Flow:**
```typescript
// upload (PhotoResult.tsx)
const videos: string[] = []; // ว่างเปล่า
const webmVideoPath = '...'; // ส่ง path แทน

// backgroundUploadService.ts
const videosToUpload = [...job.videos]; // [] (ว่างเปล่า)
if (job.webmVideoPath) {
  const mp4DataUrl = await convertWebmToMp4Base64(job.webmVideoPath);
  videosToUpload.push(mp4DataUrl); // เพิ่ม MP4 ที่ convert แล้ว
}

// Match videosToUpload[0] with videoUrls[0]
```

**สถานะ:** ✅ **ไม่ใช่ปัญหา** - Logic ถูกต้อง (convert แล้ว push เข้า array)

---

### 4. **Race Condition - sessionId/uploadUrls ยังไม่พร้อม**

**ปัญหา:**
- `createPresignSession` ทำงาน async
- `upload` อาจถูกเรียกก่อนที่ `sessionId` และ `uploadUrls` จะพร้อม

**Code:**
```typescript
// Line 2038-2048
if (!sessionId || uploadUrls.length === 0) {
  console.warn('⚠️ No sessionId/uploadUrls found! Waiting...');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!sessionId || uploadUrls.length === 0) {
    throw new Error('Session ID and uploadUrls are required...');
  }
}
```

**สถานะ:** ⚠️ **Potential Issue** - มี retry 1 วินาที แต่ถ้า API ช้าอาจไม่พอ

---

### 5. **Error Handling - ถ้า upload บางไฟล์ล้มเหลว**

**ปัญหา:**
- ใน `backgroundUploadService`: ถ้า upload บางไฟล์ล้มเหลว จะไม่ throw error แต่จะ log error
- ถ้าไม่มีไฟล์ที่ upload สำเร็จเลย จะ return `success: false`
- แต่ถ้ามีบางไฟล์สำเร็จ บางไฟล์ล้มเหลว จะ return `success: true` (จาก confirm)

**Code:**
```typescript
// Line 366-372
catch (error) {
  console.error(`❌ Failed to upload photo ${urlInfo.order}:`, error);
  // ไม่ throw - ให้ upload ไฟล์อื่นต่อ
}

// Line 424-429
if (uploadedFiles.length === 0) {
  return {
    success: false,
    error: 'No files were uploaded successfully',
  };
}
```

**สถานะ:** ⚠️ **Potential Issue** - ถ้า upload บางไฟล์ล้มเหลว user อาจไม่รู้

---

## ✅ สรุป

### Flow ที่ถูกต้อง:
1. ✅ Create presign session → ได้ uploadUrls
2. ✅ สร้าง photos/videos arrays → match กับ uploadUrls
3. ✅ PUT files → confirm upload

### ปัญหาที่ต้องแก้ไข:
1. ⚠️ **Race Condition**: เพิ่ม retry logic หรือรอให้ presign session พร้อมก่อน
2. ⚠️ **Error Handling**: แจ้งเตือน user ถ้า upload บางไฟล์ล้มเหลว

### คำแนะนำ:
1. เพิ่ม validation: ตรวจสอบว่า `photos.length === photoUrls.length` และ `videosToUpload.length === videoUrls.length`
2. เพิ่ม retry logic สำหรับ presign session
3. เพิ่ม error reporting สำหรับ partial upload failures
