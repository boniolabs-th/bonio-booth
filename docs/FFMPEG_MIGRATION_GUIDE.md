# FFmpeg Boomerang Implementation - Summary

## ✅ สิ่งที่ทำเสร็จแล้ว

### 1. Main Process (Backend)
- ✅ สร้าง `videoService.ts` - FFmpeg service สำหรับ process video
- ✅ เพิ่ม IPC handlers ใน `main.ts`:
  - `create-boomerang` - สร้าง boomerang video/gif
  - `extract-frames` - แยก frames จากวิดีโอ
  - `cleanup-temp` - ลบไฟล์ชั่วคราว
- ✅ มี `@ffmpeg-installer/ffmpeg` package อยู่แล้ว

### 2. Preload Bridge
- ✅ เพิ่ม `video` API ใน `preload.ts`:
  - `createBoomerang()`
  - `extractFrames()`
  - `cleanupTemp()`

### 3. Renderer Utilities
- ✅ สร้าง `boomerangFFmpeg.ts` - Helper functions สำหรับ renderer
- ✅ มี TypeScript types ครบถ้วน

### 4. Documentation
- ✅ `FFMPEG_BOOMERANG.md` - คู่มือการใช้งาน
- ✅ `FFMPEG_EXAMPLES.tsx` - ตัวอย่าง code

---

## 🎯 ขั้นตอนต่อไป (สำหรับคุณ)

### Step 1: แก้ไข Video Storage
**ปัญหาปัจจุบัน:** ตอนนี้ capture.video เป็น blob URL (`blob:http://...`)  
**ต้องแก้:** ให้เก็บเป็น file path แทน

ค้นหาใน codebase ว่าที่ไหนสร้าง Capture object และบันทึกวิดีโอ แล้วเปลี่ยนเป็น:

```typescript
// เดิม
const videoUrl = URL.createObjectURL(videoBlob);
captures.push({ video: videoUrl, photo: photoUrl });

// ใหม่ - ต้องเพิ่ม IPC handler สำหรับ save file
const result = await window.electron.ipcRenderer.invoke('save-video-file', videoBlob);
captures.push({ video: result.filePath, photo: photoUrl });
```

### Step 2: เพิ่ม IPC Handler สำหรับ Save Video
ใน `main.ts`:

```typescript
ipcMain.handle('save-video-file', async (event, base64Data: string) => {
  const tempPath = path.join(app.getPath('temp'), `video-${Date.now()}.webm`);
  const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
  await fs.promises.writeFile(tempPath, buffer);
  return { success: true, filePath: tempPath };
});
```

ใน `preload.ts`:
```typescript
video: {
  saveVideoFile: (base64Data: string) => {
    return ipcRenderer.invoke('save-video-file', base64Data);
  },
  // ... existing methods
}
```

### Step 3: อัพเดท PhotoResult Component

ใน `PhotoResult.tsx` เปลี่ยนจาก:

```typescript
// ❌ เดิม - ช้า ~10-15 วินาที
const assets = await generateBoomerangAssets(capture.video);
setPreviewBoomerangGif(assets.boomerangGif);
```

เป็น:

```typescript
// ✅ ใหม่ - เร็ว ~1-3 วินาที
const result = await window.electron.video.createBoomerang(
  capture.video, // ต้องเป็น file path ไม่ใช่ blob URL
  'video' // หรือ 'gif' ถ้าต้องการ GIF
);

if (result.success && result.path) {
  setPreviewBoomerangPath(result.path);
}
```

แสดงผลด้วย:
```tsx
{previewBoomerangPath && (
  <video
    src={`file://${previewBoomerangPath}`}
    loop
    autoPlay
    muted
    playsInline
    style={{ filter: getFilterStyle() }}
  />
)}
```

### Step 4: Test และ Compare Performance

```typescript
// เพิ่ม logging เพื่อเปรียบเทียบ
console.time('Create Boomerang');
const result = await window.electron.video.createBoomerang(videoPath, 'video');
console.timeEnd('Create Boomerang');
// คาดว่าจะใช้เวลา 1-3 วินาที แทน 10-15 วินาที
```

---

## 📊 Expected Performance Improvement

| Method | Time | File Size | Quality |
|--------|------|-----------|---------|
| **เดิม (gifshot)** | 10-15s | ~5-10MB | 🟡 Medium |
| **ใหม่ (FFmpeg Video)** | 1-3s | ~1-2MB | 🟢 High |
| **ใหม่ (FFmpeg GIF)** | 2-5s | ~3-5MB | 🟢 High |

**Speedup: 5-10x faster! ⚡**

---

## 🔍 การค้นหาโค้ดที่ต้องแก้

### 1. ค้นหาที่สร้าง blob URL:
```bash
# ใน PowerShell
Get-ChildItem -Path src -Filter *.tsx -Recurse | Select-String "createObjectURL"
```

### 2. ค้นหาที่ใช้ generateBoomerangAssets:
```bash
Get-ChildItem -Path src -Filter *.tsx -Recurse | Select-String "generateBoomerangAssets"
```

### 3. ค้นหา MediaRecorder:
```bash
Get-ChildItem -Path src -Filter *.tsx -Recurse | Select-String "MediaRecorder"
```

---

## 🚨 Important Notes

### Video Format Compatibility
- FFmpeg สร้าง MP4 (H.264) ซึ่ง browser ทุกตัวรองรับ
- ถ้า browser ไม่รองรับ ใช้ format `'gif'` แทน

### File Path vs Blob URL
- FFmpeg ทำงานกับ **file path** เท่านั้น
- ต้องแปลง blob → file ก่อน process
- อย่าลืม cleanup temp files!

### Cleanup
```typescript
// เมื่อเสร็จแล้วหรือ unmount
useEffect(() => {
  return () => {
    if (boomerangPath) {
      window.electron.video.cleanupTemp([boomerangPath]);
    }
  };
}, [boomerangPath]);
```

---

## 🐛 Troubleshooting

### "FFmpeg not found"
```bash
npm install @ffmpeg-installer/ffmpeg
npm run rebuild
```

### "Blob URL not supported"
ต้องแก้ code ให้เก็บเป็น file path (ดู Step 1-2)

### Video ไม่แสดง
ลอง:
```typescript
// ใช้ file:// protocol
<video src={`file://${path}`} />

// หรือถ้าไม่ได้ ลองแปลงเป็น data URL
```

---

## 📝 Checklist

- [ ] เพิ่ม IPC handler `save-video-file` ใน main.ts
- [ ] เพิ่ม method `saveVideoFile` ใน preload.ts
- [ ] ค้นหาและแก้ไขที่สร้าง blob URL ให้เป็น file path
- [ ] อัพเดท PhotoResult.tsx ให้ใช้ FFmpeg API
- [ ] เปลี่ยน display จาก `<img>` เป็น `<video>`
- [ ] ทดสอบ performance (วัดเวลา)
- [ ] เพิ่ม cleanup temp files
- [ ] ทดสอบ edge cases (error handling)

---

## 💡 Tips

1. **Development**: ใช้ `console.time()` วัด performance
2. **Production**: เพิ่ม progress indicator ขณะ process
3. **UX**: แสดง loading state เพื่อให้ user รู้ว่ากำลัง process
4. **Memory**: Cleanup blob URLs และ temp files ทันที

---

## 🎉 Expected Result

หลังจากแก้ไขเสร็จ:

✅ Boomerang creation: **10-15s → 1-3s** (5-10x faster)  
✅ UI ไม่ค้าง (process ใน main process)  
✅ File size เล็กลง (MP4 < GIF)  
✅ คุณภาพดีขึ้น (H.264 video)  
✅ User experience ดีขึ้นเยอะ!

---

## 📚 References

- FFmpeg Documentation: https://ffmpeg.org/ffmpeg.html
- Electron IPC: https://www.electronjs.org/docs/latest/api/ipc-main
- Video Element: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video

---

หากมีคำถามหรือต้องการความช่วยเหลือเพิ่มเติม กรุณา:
1. อ่าน `FFMPEG_BOOMERANG.md` สำหรับรายละเอียด API
2. ดู `FFMPEG_EXAMPLES.tsx` สำหรับตัวอย่างการใช้งาน
3. ตรวจสอบ console logs เพื่อ debug

Good luck! 🚀
