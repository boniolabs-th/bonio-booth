/**
 * Script to copy Canon EDSDK native module to release/app
 * Run this before building Electron app for production
 */
const fs = require('fs');
const path = require('path');

// Source: can be from src/main/native or EDSDK_Wrapper project
const possibleSources = [
  path.join(__dirname, '../src/main/native'),
  path.join(__dirname, '../../EDSDK_Wrapper'),  // External wrapper project
];

// Target: release/app/dist/main/native (will be in asar.unpacked)
const targetDir = path.join(__dirname, '../release/app/dist/main/native');

// Files to copy
const filesToCopy = [
  'canon-edsdk.win32-x64-msvc.node',
  'index.js',
];

// DLLs location
const dllDir = path.join(__dirname, '../assets/EDSDK/Dll');
const dllsToCopy = [
  'EDSDK.dll',
  'EdsImage.dll'
];

// Find source directory
let sourceDir = null;
for (const src of possibleSources) {
  const nodePath = path.join(src, filesToCopy[0]);
  if (fs.existsSync(nodePath)) {
    sourceDir = src;
    console.log(`📁 Found source at: ${src}`);
    break;
  }
}

if (!sourceDir) {
  console.warn('⚠️ Canon EDSDK native module not found in any source location:');
  possibleSources.forEach(src => console.warn(`   - ${src}`));
  console.warn('⚠️ Skipping canon native copy. Build the EDSDK_Wrapper project first.');
  process.exit(0);
}

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });
console.log(`📁 Target directory: ${targetDir}`);

// Copy module files
for (const fileName of filesToCopy) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✅ Copied module: ${fileName}`);
  } else {
    console.warn(`⚠️ File not found (skipping): ${sourcePath}`);
  }
}

// Copy DLLs
console.log('\n📦 Copying DLL dependencies...');
if (fs.existsSync(dllDir)) {
  for (const dllName of dllsToCopy) {
    const sourcePath = path.join(dllDir, dllName);
    const targetPath = path.join(targetDir, dllName);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Copied DLL: ${dllName}`);
    } else {
      console.warn(`⚠️ DLL not found: ${sourcePath}`);
    }
  }
} else {
  console.warn(`⚠️ DLL directory not found: ${dllDir}`);
}

// Also copy DLLs to src/main/native for development (if it exists)
const devNativeDir = path.join(__dirname, '../src/main/native');
if (fs.existsSync(devNativeDir)) {
  console.log('\n🔧 Updating development directory (src/main/native)...');

  // Copy DLLs to dev dir
  if (fs.existsSync(dllDir)) {
    for (const dllName of dllsToCopy) {
      const sourcePath = path.join(dllDir, dllName);
      const targetPath = path.join(devNativeDir, dllName);

      try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✅ Copied to dev: ${dllName}`);
      } catch (e) {
        console.warn(`⚠️ Could not copy to dev: ${e.message}`);
      }
    }
  }
}

console.log('\n📷 Canon EDSDK native module copied successfully!');
