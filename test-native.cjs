const { app } = require('electron');
const path = require('path');

app.on('ready', () => {
  try {
    const nativePath = path.join(__dirname, 'src', 'main', 'native', 'canon-edsdk.win32-x64-msvc.node');
    console.log('Loading:', nativePath);
    const m = require(nativePath);
    console.log('SUCCESS! Keys:', Object.keys(m).slice(0, 5));
    app.quit();
  } catch (e) {
    console.error('FAIL:', e.message);
    app.quit();
  }
});
