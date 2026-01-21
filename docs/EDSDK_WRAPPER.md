# Canon EDSDK Wrapper Documentation

## Overview

ระบบ Photobooth ใช้ Canon EDSDK (External Digital SDK) สำหรับเชื่อมต่อกับกล้อง Canon EOS รวมถึง EOS R50 ผ่าน USB connection โดยใช้ Rust wrapper ที่เขียนขึ้นเองผ่าน NAPI-RS

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     bonio-booth (Electron App)                       │
├─────────────────────────────────────────────────────────────────────┤
│  src/main/services/canonCameraServiceV2.ts                          │
│    ├── initializeCanonCameraV2()                                    │
│    ├── getCameraList()                                              │
│    ├── connectCamera()                                              │
│    ├── takePicture()                                                │
│    └── startLiveView() / stopLiveView()                             │
├─────────────────────────────────────────────────────────────────────┤
│  src/main/native/                                                    │
│    ├── index.js          (NAPI-RS generated loader)                 │
│    └── canon-edsdk.win32-x64-msvc.node  (Compiled Rust binary)      │
├─────────────────────────────────────────────────────────────────────┤
│  assets/EDSDK/Dll/                                                   │
│    ├── EDSDK.dll         (Canon SDK main library)                   │
│    ├── EdsImage.dll      (Image processing library)                 │
│    ├── DPP4Lib/          (Digital Photo Professional library)       │
│    └── IHL/              (Image handling library)                    │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ LoadLibraryA (Dynamic loading)
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                     EDSDK_Wrapper (Rust)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Cargo.toml              - Project configuration                     │
│  src/lib.rs              - Main N-API exports                        │
│  src/edsdk_sys.rs        - FFI bindings for Canon EDSDK             │
├─────────────────────────────────────────────────────────────────────┤
│  Key Functions:                                                      │
│    initializeSdk(dllPath) - Load EDSDK.dll dynamically              │
│    getCameraList()         - List connected Canon cameras            │
│    connectCamera()         - Connect to first camera                 │
│    openSession()           - Open camera session                     │
│    takePicture(path)       - Capture image                           │
│    startLiveView()         - Enable EVF (live view)                  │
│    getLiveViewFrame()      - Get JPEG frame from live view          │
└─────────────────────────────────────────────────────────────────────┘
```

## File Locations

### Development Mode
```
bonio-booth/
├── src/main/native/
│   ├── index.js                         # Native loader
│   └── canon-edsdk.win32-x64-msvc.node  # Compiled binary
└── assets/EDSDK/Dll/
    └── EDSDK.dll                        # Canon SDK DLL
```

### Production Mode (after packaging)
```
resources/
├── app.asar.unpacked/dist/main/native/
│   ├── index.js
│   └── canon-edsdk.win32-x64-msvc.node
└── assets/EDSDK/Dll/
    └── EDSDK.dll
```

## Loading Flow

### 1. Native Module Loading
```typescript
// canonCameraServiceV2.ts
const isPackaged = app.isPackaged;
let nativePath: string;

if (isPackaged) {
  // Production
  nativePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'native', 'index.js');
} else {
  // Development
  nativePath = path.join(app.getAppPath(), 'src', 'main', 'native', 'index.js');
}

// IMPORTANT: Use __non_webpack_require__ to bypass webpack bundling
const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;
sdk = nodeRequire(nativePath);
```

### 2. SDK Initialization
```typescript
// Get FULL PATH to EDSDK.dll (not just folder!)
let edsdkDllPath: string;

if (isPackaged) {
  edsdkDllPath = path.join(process.resourcesPath, 'assets', 'EDSDK', 'Dll', 'EDSDK.dll');
} else {
  edsdkDllPath = path.join(app.getAppPath(), 'assets', 'EDSDK', 'Dll', 'EDSDK.dll');
}

// Initialize with full DLL path
sdk.initializeSdk(edsdkDllPath);
```

## EDSDK_Wrapper Build

### Prerequisites
- Rust toolchain (via rustup)
- MSVC build tools
- Node.js 18+ with N-API support

### Build Commands
```powershell
cd EDSDK_Wrapper

# Development build
cargo build

# Release build (optimized)
cargo build --release

# Build with NAPI (generates .node file)
npm run build
# หรือ
npx napi build --platform --release
```

### Output Files
- `canon-edsdk.win32-x64-msvc.node` - Compiled native module
- `index.js` - Auto-generated NAPI loader

### Copy to bonio-booth
```powershell
# Copy from EDSDK_Wrapper to bonio-booth
Copy-Item "EDSDK_Wrapper/canon-edsdk.win32-x64-msvc.node" "bonio-booth/src/main/native/"
Copy-Item "EDSDK_Wrapper/index.js" "bonio-booth/src/main/native/"
```

## Key N-API Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `initializeSdk(dllPath?)` | Initialize EDSDK with DLL path | `boolean` |
| `terminateSdk()` | Shutdown SDK | `boolean` |
| `isSdkInitialized()` | Check if SDK is ready | `boolean` |
| `getCameraList()` | List connected cameras | `CameraInfo[]` |
| `connectCamera()` | Connect to first camera | `CameraInfo` |
| `connectCameraByIndex(n)` | Connect to camera at index | `CameraInfo` |
| `openSession()` | Open camera session | `boolean` |
| `closeSession()` | Close camera session | `boolean` |
| `takePicture(path)` | Capture and save image | `Promise<CaptureResult>` |
| `startLiveView()` | Enable EVF output to PC | `boolean` |
| `stopLiveView()` | Disable EVF output | `boolean` |
| `getLiveViewFrame()` | Get JPEG frame data | `LiveViewFrame \| null` |
| `pressShutterButton(type)` | Control shutter (AF, capture) | `boolean` |

## Shutter Button Constants

```typescript
sdk.shutter_button.OFF              // 0x00000000 - Release
sdk.shutter_button.HALFWAY          // 0x00000001 - Half-press (AF)
sdk.shutter_button.COMPLETELY       // 0x00000003 - Full press (capture)
sdk.shutter_button.HALFWAY_NON_AF   // 0x00010001 - Half-press without AF
sdk.shutter_button.COMPLETELY_NON_AF // 0x00010003 - Full press without AF
```

## Property IDs

```typescript
sdk.property_ids.ISO_SPEED              // 0x00000402
sdk.property_ids.APERTURE               // 0x00000405
sdk.property_ids.SHUTTER_SPEED          // 0x00000406
sdk.property_ids.WHITE_BALANCE          // 0x00000106
sdk.property_ids.EXPOSURE_COMPENSATION  // 0x00000407
sdk.property_ids.BATTERY_LEVEL          // 0x00000008
sdk.property_ids.AVAILABLE_SHOTS        // 0x0000040A
```

## Common Issues & Solutions

### 1. Cannot find module error
**Symptom**: `Cannot find module '...native/index.js'`
**Cause**: Webpack transforms `require()` into webpack context
**Solution**: Use `__non_webpack_require__` instead of `require()`

### 2. EDSDK.dll not found
**Symptom**: `Failed to load EDSDK.dll`
**Cause**: Wrong path passed to `initializeSdk()`
**Solution**: Pass FULL path to `EDSDK.dll` file, not just the folder

### 3. DLL dependencies missing
**Symptom**: `EDSDK.dll` loads but fails
**Cause**: Missing dependent DLLs (EdsImage.dll, etc.)
**Solution**: Ensure all DLLs in same folder:
- EDSDK.dll
- EdsImage.dll
- DPP4Lib/ folder
- IHL/ folder

### 4. Camera not detected
**Symptom**: `getCameraList()` returns empty
**Cause**: Camera not in correct USB mode or driver issue
**Solution**:
1. Check USB connection
2. Set camera to "PC Connect" mode
3. Install Canon EOS Utility (installs drivers)
4. Ensure no other app is using the camera

### 5. Session errors
**Symptom**: `Session not open` errors
**Cause**: Must call `openSession()` after `connectCamera()`
**Solution**: 
```typescript
connectCamera();
openSession();  // Don't forget this!
// Now you can take pictures
```

## Development Workflow

1. **Make changes to Rust wrapper**
   ```powershell
   cd EDSDK_Wrapper
   code src/lib.rs
   ```

2. **Build the wrapper**
   ```powershell
   cargo build --release
   npx napi build --platform --release
   ```

3. **Copy to bonio-booth**
   ```powershell
   Copy-Item "canon-edsdk.win32-x64-msvc.node" "../bonio-booth/src/main/native/"
   Copy-Item "index.js" "../bonio-booth/src/main/native/"
   ```

4. **Test in bonio-booth**
   ```powershell
   cd ../bonio-booth
   npm start
   ```

## References

- [Canon EDSDK Official Documentation](https://developercommunity.usa.canon.com/s/)
- [NAPI-RS Documentation](https://napi.rs/)
- [Electron Native Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)
