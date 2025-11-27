import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

// รับ theme data จาก main process และตั้งค่า background
window.electron?.ipcRenderer.on('theme-loaded', (...args: unknown[]) => {
  const theme = args[0] as { background?: string; primaryColor?: string; fontColor?: string };
  console.log('🎨 Theme received:', theme);
  
  if (theme?.background) {
    // ตั้งค่า background image ให้ body
    document.body.style.backgroundImage = `url(${theme.background})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    console.log('✅ Background set to:', theme.background);
  }
  
  if (theme?.primaryColor) {
    // ตั้งค่า primary color (ถ้าต้องการ)
    document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
  }
  
  if (theme?.fontColor) {
    // ตั้งค่า font color
    document.body.style.color = theme.fontColor;
  }
});

// calling IPC exposed from preload script
window.electron?.ipcRenderer.once('ipc-example', (arg) => {
  // eslint-disable-next-line no-console
  console.log(arg);
});
window.electron?.ipcRenderer.sendMessage('ipc-example', ['ping']);
