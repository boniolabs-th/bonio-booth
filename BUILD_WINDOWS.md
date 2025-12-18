# คู่มือการ Build Windows .exe จาก macOS

## วิธีที่ 1: Build Portable .exe (แนะนำ - ไม่ต้องใช้ Wine)

Portable .exe คือไฟล์ .exe เดียวที่สามารถรันได้เลยโดยไม่ต้องติดตั้ง

```bash
npm run package:win:portable
```

ไฟล์ที่ได้จะอยู่ที่: `release/build/win-unpacked/Bonio Booth.exe`

## วิธีที่ 2: Build NSIS Installer (ต้องติดตั้ง Wine)

NSIS installer จะสร้างไฟล์ติดตั้งแบบ Windows installer

### ขั้นตอน:

1. **ติดตั้ง Wine** (สำหรับสร้าง NSIS installer บน macOS):
   ```bash
   # ใช้ Homebrew
   brew install wine-stable
   
   # หรือใช้ MacPorts
   # port install wine
   ```

2. **Build Windows installer**:
   ```bash
   npm run package:win
   ```

   ไฟล์ที่ได้จะอยู่ที่: `release/build/Bonio Booth Setup x.x.x.exe`

## วิธีที่ 3: Build ทั้งสองแบบ

```bash
npm run package:win
```

จะสร้างทั้ง NSIS installer และ Portable .exe

## หมายเหตุสำคัญ:

1. **Native Dependencies**: ถ้าโปรเจกต์ใช้ native modules (เช่น `@ffmpeg-installer/ffmpeg`, `@kshersolution/ksher`) อาจต้อง rebuild สำหรับ Windows:
   ```bash
   npm run rebuild
   ```

2. **Cross-compilation Limitations**: 
   - บาง native modules อาจไม่สามารถ cross-compile ได้
   - ถ้ามีปัญหาแนะนำให้ build บน Windows โดยตรง หรือใช้ CI/CD (GitHub Actions, etc.)

3. **Testing**: ควรทดสอบไฟล์ .exe บน Windows จริงเพื่อให้แน่ใจว่าทำงานได้ถูกต้อง

4. **Icon**: ตรวจสอบว่ามีไฟล์ `assets/icon.ico` อยู่ (สำหรับ Windows icon)

## Troubleshooting:

### ปัญหา: "Wine is not installed"
- ติดตั้ง Wine ตามวิธีที่ 2
- หรือใช้ `package:win:portable` แทน (ไม่ต้องใช้ Wine)

### ปัญหา: Native modules ไม่ทำงาน
- ลอง rebuild: `npm run rebuild`
- ตรวจสอบว่า native modules รองรับ Windows หรือไม่

### ปัญหา: Build ล้มเหลว
- ลบ `node_modules` และ `release` แล้วรัน `npm install` ใหม่
- ตรวจสอบ logs ใน `release/build` directory

