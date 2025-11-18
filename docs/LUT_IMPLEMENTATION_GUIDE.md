# LUT Filter Implementation Guide

## ✅ สิ่งที่ทำเสร็จแล้ว

### 1. Backend (Main Process)
- ✅ **videoService.ts** - เพิ่ม FFmpeg LUT functions:
  - `applyLutToVideo()` - Apply LUT กับวิดีโอ
  - `createBoomerangWithLut()` - Boomerang + LUT ในคำสั่งเดียว
  
- ✅ **main.ts** - เพิ่ม IPC handlers:
  - `apply-lut-to-video` 
  - `create-boomerang-with-lut`

- ✅ **preload.ts** - เพิ่ม API methods:
  - `window.electron.video.applyLutToVideo()`
  - `window.electron.video.createBoomerangWithLut()`

### 2. Frontend (Renderer Process)
- ✅ **lutProcessor.ts** - Canvas-based LUT processor สำหรับภาพนิ่ง:
  - `parseCubeLUT()` - อ่านไฟล์ .cube
  - `applyLUTToCanvas()` - Apply LUT กับ canvas
  - `getCachedLUT()` - Cache LUT ที่โหลดแล้ว

- ✅ **frameConfig.ts** - เพิ่ม LUT filters:
  - Timelab 1-5 (type: 'lut')
  - FilterConfig interface รองรับ `lutFile` property

- ✅ **assets.d.ts** - Type declaration สำหรับ .cube files

---

## 🎨 การใช้งาน

### ในหน้า PhotoFilter (เลือก Filter)

Filter ทั้งหมดแสดงในรายการแล้ว รวมทั้ง Timelab 1-5

```typescript
// ใน PhotoFilter.tsx
import { FILTERS } from '../../utils/frameConfig';

{FILTERS.map((filter) => (
  <button
    onClick={() => setSelectedFilter(filter.id)}
    className={selectedFilter === filter.id ? 'active' : ''}
  >
    {filter.name}
  </button>
))}
```

### Preview Filter (ใช้ CSS หรือ Canvas)

#### วิธีที่ 1: CSS Filter (เร็ว แต่จำกัด)
```typescript
const getFilterStyle = () => {
  const filter = FILTERS.find((f) => f.id === selectedFilter);
  
  // CSS filters (sepia, grayscale, etc.)
  if (filter?.type === 'css' && filter.filter) {
    return filter.filter;
  }
  
  // LUT filters ต้องใช้ Canvas (ช้ากว่า)
  // สำหรับ preview อาจใช้ CSS approximation
  if (filter?.type === 'lut') {
    // Fallback: ใช้ neutral filter หรือ skip
    return '';
  }
  
  return '';
};

// Apply to image
<img 
  src={photo} 
  style={{ filter: getFilterStyle() }} 
/>
```

#### วิธีที่ 2: Canvas LUT (แม่นยำ แต่ช้ากว่า)
```typescript
import { getCachedLUT, applyLUTToCanvas, getLUTFilePath } from '../../utils/lutProcessor';

const applyLUTPreview = async (imageElement: HTMLImageElement) => {
  const filter = FILTERS.find((f) => f.id === selectedFilter);
  
  if (filter?.type === 'lut' && filter.lutFile) {
    try {
      // Load LUT
      const lutPath = getLUTFilePath(filter.lutFile);
      const lut = await getCachedLUT(lutPath);
      
      // Create canvas from image
      const canvas = document.createElement('canvas');
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(imageElement, 0, 0);
      
      // Apply LUT
      const processedCanvas = applyLUTToCanvas(canvas, lut);
      
      // Use processed image
      return processedCanvas.toDataURL();
    } catch (error) {
      console.error('Failed to apply LUT:', error);
    }
  }
};
```

---

## 📸 Apply LUT กับ Photo Strip

### ใน PhotoResult.tsx - Generate Final Image

```typescript
const generateFinalImage = async (
  captures: Capture[],
  frame: FrameConfig,
  selectedFilterId: string,
): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');
  
  // Draw frame
  const frameImg = await loadImage(frame.image);
  ctx.drawImage(frameImg, 0, 0, frame.width, frame.height);
  
  // Get filter
  const filter = FILTERS.find((f) => f.id === selectedFilterId);
  
  // Draw each photo into slots
  for (let i = 0; i < captures.length; i++) {
    const capture = captures[i];
    const slot = frame.slots[i];
    
    const photoImg = await loadImage(capture.photo);
    
    // Create temp canvas for photo
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = slot.width;
    tempCanvas.height = slot.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) continue;
    
    // Draw photo
    tempCtx.drawImage(photoImg, 0, 0, slot.width, slot.height);
    
    // Apply LUT if needed
    let finalCanvas = tempCanvas;
    if (filter?.type === 'lut' && filter.lutFile) {
      try {
        const lutPath = getLUTFilePath(filter.lutFile);
        const lut = await getCachedLUT(lutPath);
        finalCanvas = applyLUTToCanvas(tempCanvas, lut);
      } catch (error) {
        console.error('Failed to apply LUT to photo:', error);
      }
    } else if (filter?.type === 'css' && filter.filter) {
      // Apply CSS filter via canvas
      tempCtx.filter = filter.filter;
      tempCtx.drawImage(tempCanvas, 0, 0);
    }
    
    // Draw processed photo into main canvas
    ctx.drawImage(finalCanvas, slot.x, slot.y, slot.width, slot.height);
  }
  
  return canvas.toDataURL('image/jpeg', 0.95);
};
```

---

## 🎥 Apply LUT กับวิดีโอ

### Boomerang + LUT (แนะนำ - เร็วที่สุด)

```typescript
const createBoomerangWithFilter = async (
  videoPath: string,
  selectedFilterId: string,
): Promise<string> => {
  const filter = FILTERS.find((f) => f.id === selectedFilterId);
  
  // If LUT filter, use FFmpeg
  if (filter?.type === 'lut' && filter.lutFile) {
    try {
      const result = await window.electron.video.createBoomerangWithLut(
        videoPath,
        filter.lutFile,
      );
      
      if (result.success && result.path) {
        return result.path;
      }
    } catch (error) {
      console.error('Failed to create boomerang with LUT:', error);
    }
  }
  
  // CSS filters: use existing canvas-based method
  return generateFramedVideo(captures, frame, selectedFilterId, true);
};
```

---

## 🔄 การใช้งานจริงใน PhotoResult

### Update generateFramedVideo function

```typescript
const generateFramedVideo = async (
  captures: Capture[],
  frame: FrameConfig,
  selectedFilterId?: string,
  useBoomerang?: boolean,
): Promise<string> => {
  const filter = FILTERS.find((f) => f.id === selectedFilterId);
  
  // Check if we can use FFmpeg for LUT + Boomerang
  if (
    useBoomerang &&
    filter?.type === 'lut' &&
    filter.lutFile &&
    captures[0]?.video
  ) {
    try {
      console.log('Using FFmpeg for LUT + Boomerang');
      
      const result = await window.electron.video.createBoomerangWithLut(
        captures[0].video,
        filter.lutFile,
      );
      
      if (result.success && result.path) {
        return `file://${result.path}`;
      }
    } catch (error) {
      console.error('FFmpeg LUT failed, falling back to canvas:', error);
    }
  }
  
  // Fallback: use existing canvas-based method
  // ... existing code ...
};
```

---

## 🎯 ขั้นตอนการ Implement

### Step 1: แก้ไข PhotoResult.tsx

เพิ่ม imports:
```typescript
import {
  getCachedLUT,
  applyLUTToCanvas,
  getLUTFilePath,
} from '../../utils/lutProcessor';
```

### Step 2: แก้ generateFramedVideo

เพิ่ม LUT check ตามตัวอย่างด้านบน

### Step 3: แก้ final image generation

ใช้ `applyLUTToCanvas()` กับแต่ละ photo slot

### Step 4: Test

1. เลือก Timelab filter
2. ถ่ายภาพ
3. ตรวจสอบว่า:
   - ✅ Photo strip มี LUT applied
   - ✅ Boomerang video มี LUT applied
   - ✅ เร็วกว่าเดิม (FFmpeg)

---

## 💡 Performance Tips

### 1. Use FFmpeg for Videos
```typescript
// ✅ FAST - FFmpeg (1-3 seconds)
await window.electron.video.createBoomerangWithLut(videoPath, lutFile);

// ❌ SLOW - Canvas (10-15 seconds)
// Apply LUT frame by frame in browser
```

### 2. Cache LUTs
```typescript
// LUT files are ~7MB each
// Load once and cache
const lut = await getCachedLUT(lutPath); // Cached automatically
```

### 3. Preview Strategy
```typescript
// For live preview: Use CSS filter approximation
style={{ filter: 'sepia(30%) contrast(1.2)' }} // Fast

// For final result: Use actual LUT
const processed = applyLUTToCanvas(canvas, lut); // Accurate
```

---

## 🐛 Troubleshooting

### LUT not loading
```typescript
// Check file path
const lutPath = getLUTFilePath('Timelab 1.cube');
console.log('LUT path:', lutPath);

// Check file exists
fetch(lutPath).then(r => console.log('LUT status:', r.status));
```

### FFmpeg error
```typescript
// Check LUT file in assets
// Windows: C:\...\resources\assets\filters\Timelab 1.cube
// Mac: /Applications/.../Resources/assets/filters/Timelab 1.cube
```

### Canvas performance
```typescript
// Process in web worker if too slow
// Or use smaller canvas size for preview
```

---

## 📊 Performance Comparison

| Method | Time | Quality | Use Case |
|--------|------|---------|----------|
| **CSS Filter** | <0.1s | 🟡 Medium | Preview only |
| **Canvas LUT** | 2-5s | 🟢 High | Photos |
| **FFmpeg LUT** | 1-3s | 🟢 High | Videos |

---

## 🎉 Expected Result

หลังจาก implement เสร็จ:

✅ **PhotoFilter** - แสดง Timelab 1-5 ในรายการ  
✅ **Preview** - ใช้ CSS filter (เร็ว) หรือ Canvas LUT (แม่นยำ)  
✅ **Photo Strip** - Apply LUT ด้วย Canvas (คุณภาพสูง)  
✅ **Boomerang Video** - Apply LUT ด้วย FFmpeg (เร็ว + คุณภาพสูง)  

---

## 📚 API Reference

### lutProcessor.ts
- `parseCubeLUT(content: string): LUT3D`
- `loadCubeLUT(url: string): Promise<LUT3D>`
- `applyLUTToCanvas(canvas, lut): HTMLCanvasElement`
- `getCachedLUT(url: string): Promise<LUT3D>`
- `getLUTFilePath(filename: string): string`

### videoService.ts
- `applyLutToVideo(videoPath, lutFileName): Promise<string>`
- `createBoomerangWithLut(videoPath, lutFileName): Promise<string>`

### IPC API
- `window.electron.video.applyLutToVideo(videoPath, lutFileName)`
- `window.electron.video.createBoomerangWithLut(videoPath, lutFileName)`

---

คำแนะนำ: เริ่มจาก implement ง่ายๆ (preview ด้วย CSS) แล้วค่อย enhance ทีละส่วน!
