
PHASE 2 (PRO) – VIDEO PIPELINE (PHOTObooth / ELECTRON / FFMPEG)

============================================================
1. PURPOSE
============================================================
เอกสารนี้สรุปเฉพาะระบบ VIDEO สำหรับ Phase 2 (Pro)
ใช้เป็น
- spec
- roadmap
- prompt สำหรับ AI
- source of truth สำหรับ dev

โฟกัส:
- สีวิดีโอให้ตรงกับรูป
- ลด color shift (แดง -> ส้ม, ซีด)
- live view + record พร้อมกัน
- performance ระดับ production

============================================================
2. CORE PROBLEM
============================================================
- รูปนิ่งชัด สีตรง
- วิดีโอสีเพี้ยน
- WebM -> MP4 แล้วสี drop
- video pipeline ผ่าน browser มากเกินไป

ROOT CAUSE:
- MediaRecorder (VP8/VP9)
- ไม่มี colorspace contract
- convert หลาย pass
- photo + video ใช้ filter คนละระบบ

============================================================
3. PHASE 2 IDEA
============================================================
แยกหน้าที่ชัดเจน

Live View  = Browser
Record     = FFmpeg (Native)
Encode     = FFmpeg
Color/LUT  = FFmpeg

Browser ห้าม encode video จริง

============================================================
4. TARGET VIDEO ARCHITECTURE
============================================================

Camera
 ├─ Live View (Browser / GPU)
 └─ FFmpeg Capture (Native)
        - Color Fix
        - LUT
        - Encode (H.264)
        - MP4 Output

============================================================
5. LIVE VIEW + RECORDING พร้อมกันได้อย่างไร
============================================================

OPTION A (Webcam – แนะนำ)
- Live view: getUserMedia
- Record: FFmpeg dshow
- Webcam ส่วนใหญ่เปิดได้ 2 consumer

OPTION B (DSLR)
- Live view: Canon EDSDK
- Record: FFmpeg ผ่าน HDMI Capture / Virtual Cam

============================================================
6. STANDARD RECORDING (FFMPEG)
============================================================

ffmpeg -f dshow -i video="CAMERA_NAME" \
-vf "eq=saturation=1.6:contrast=1.25:brightness=-0.06:gamma=0.85,format=yuv420p" \
-c:v libx264 \
-preset ultrafast \
-tune zerolatency \
-r 30 \
-y output.mp4

เหตุผล:
- คุมสีตั้งแต่ต้น
- realtime
- ไม่ผ่าน browser pipeline

============================================================
7. COLORSPACE CONTRACT (CRITICAL)
============================================================

ทุก video ต้องยึด:
- Colorspace: BT.709
- Primaries: BT.709
- Transfer: BT.709
- Pixel format: yuv420p
- Range: TV

FFmpeg flags:
-colorspace bt709
-color_primaries bt709
-color_trc bt709
-color_range tv

============================================================
8. WEBM -> MP4 (กรณีจำเป็น)
============================================================

ffmpeg -i input.webm \
-colorspace bt709 \
-color_primaries bt709 \
-color_trc bt709 \
-vf "scale=1280:-2,format=yuv420p" \
-c:v libx264 \
-crf 15 \
-preset slow \
-r 30 \
-y output.mp4

NOTE:
- แค่ “ใกล้” รูป
- ไม่มีทางเท่า capture ตรงจาก FFmpeg

============================================================
9. LUT STRATEGY (PRO)
============================================================

กฎ:
- Photo + Video ต้องใช้ LUT เดียวกัน
- apply ใน colorspace เดียวกัน

Video:
-vf "lut3d=cinematic.cube"

Photo:
- FFmpeg หรือ Sharp + LUT

ห้าม:
- canvas filter แยกจาก video LUT

============================================================
10. BOOMERANG / EFFECT
============================================================

-filter_complex
"[0:v]fps=30,reverse,fifo[r];
 [0:v]fps=30[o];
 [o][r]concat=n=2:v=1:a=0,lut3d=cinematic.cube"

เหตุผล:
- LUT pass เดียว
- สีไม่ drift

============================================================
11. PERFORMANCE RULE
============================================================

Browser  = UI only
FFmpeg  = Video brain
No multi-pass
No renderer encode

============================================================
12. ANTI-PATTERN
============================================================

- MediaRecorder เป็นไฟล์จริง
- Encode ใน renderer
- Convert หลายรอบ
- PNG -> video pipeline
- Photo/Video LUT คนละชุด

============================================================
13. FINAL GOAL
============================================================

- MP4 (H.264)
- 30 FPS
- สีตรงรูป
- Safari/iPhone OK
- ไฟล์คุมได้
- Live view ลื่น

============================================================
ONE LINE SUMMARY
============================================================

DSLRBooth ไม่ได้เก่งกว่า
มันแค่ไม่ให้ browser แตะ video pipeline
