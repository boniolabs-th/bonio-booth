/**
 * Script to copy Canon EDSDK native module to release/app
 * Run this before building Electron app for production
 */
const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../src/main/native/canon-edsdk-rs');
const targetDir = path.join(__dirname, '../release/app/dist/main/native/canon-edsdk-rs');

// Files to copy
const filesToCopy = [
  'canon-edsdk.win32-x64-msvc.node',
  'index.js',
  'index.d.ts',
];

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy files
filesToCopy.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✅ Copied: ${file}`);
  } else {
    console.warn(`⚠️ File not found: ${sourcePath}`);
  }
});

console.log('\n📷 Canon EDSDK native module copied to release/app');
console.log('📁 Target:', targetDir);
