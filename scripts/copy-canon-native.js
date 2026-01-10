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
const nodeFileName = 'canon-edsdk.win32-x64-msvc.node';

// Find source directory
let sourceDir = null;
for (const src of possibleSources) {
  const nodePath = path.join(src, nodeFileName);
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

// Copy .node file
const sourcePath = path.join(sourceDir, nodeFileName);
const targetPath = path.join(targetDir, nodeFileName);

if (fs.existsSync(sourcePath)) {
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`✅ Copied: ${nodeFileName}`);
  console.log(`   From: ${sourcePath}`);
  console.log(`   To: ${targetPath}`);
} else {
  console.error(`❌ File not found: ${sourcePath}`);
  process.exit(1);
}

console.log('\n📷 Canon EDSDK native module copied successfully!');
