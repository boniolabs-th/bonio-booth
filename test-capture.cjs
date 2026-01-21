/**
 * Test script for canon-edsdk capture functionality
 * Run: node test-capture.cjs
 */

const path = require('path');

// Load the native module
const nativeModulePath = path.join(__dirname, 'src', 'main', 'native', 'index.js');
console.log('Loading native module from:', nativeModulePath);

const sdk = require(nativeModulePath);

console.log('SDK functions:', Object.keys(sdk).slice(0, 10));

// Get EDSDK DLL path
const edsdkDllPath = path.join(__dirname, 'assets', 'EDSDK', 'Dll', 'EDSDK.dll');
console.log('EDSDK DLL path:', edsdkDllPath);

async function main() {
  try {
    // 1. Initialize SDK
    console.log('\n[1] Initializing SDK...');
    const initResult = sdk.initializeSdk(edsdkDllPath);
    console.log('Init result:', initResult);

    if (!initResult) {
      console.error('Failed to initialize SDK');
      return;
    }

    console.log('SDK Version:', sdk.getSdkVersion());

    // 2. Get camera list
    console.log('\n[2] Getting camera list...');
    const cameras = sdk.getCameraList();
    console.log('Cameras found:', cameras.length);

    if (cameras.length === 0) {
      console.log('No cameras found. Make sure camera is connected and turned on.');
      sdk.terminateSdk();
      return;
    }

    console.log('Camera:', cameras[0]);

    // 3. Connect to camera
    console.log('\n[3] Connecting to camera...');
    const camera = sdk.connectCamera();
    console.log('Connected to:', camera.name);

    // 4. Open session
    console.log('\n[4] Opening session...');
    const sessionResult = sdk.openSession();
    console.log('Session opened:', sessionResult);

    // 5. Try to capture
    console.log('\n[5] Taking picture...');
    console.log('This may take up to 30 seconds...');

    const startTime = Date.now();
    const captureResult = await sdk.captureToBuffer();
    const elapsed = Date.now() - startTime;

    console.log(`\nCapture completed in ${elapsed}ms`);
    console.log('Result:', {
      success: captureResult.success,
      error: captureResult.error,
      hasImageData: !!captureResult.imageData,
      imageSize: captureResult.imageData ? captureResult.imageData.length : 0
    });

    // 6. Cleanup
    console.log('\n[6] Cleaning up...');
    sdk.closeSession();
    sdk.disconnectCamera();
    sdk.terminateSdk();

    console.log('\nDone!');

  } catch (error) {
    console.error('Error:', error);

    // Try to cleanup
    try {
      sdk.terminateSdk();
    } catch (e) {
      // ignore
    }
  }
}

main();
