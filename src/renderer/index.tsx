import { createRoot } from 'react-dom/client';
import App from './App';

interface ThemeData {
  _id?: string;
  name?: string;
  code?: string;
  background?: string;
  backgroundSecond?: string;
  primaryColor?: string;
  textButtonColor?: string;
  fontColor?: string;
  frames?: any[];
  isActive?: boolean;
}

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);

// Cache theme data
let cachedTheme: ThemeData | null = null;

// รับ theme data จาก main process และตั้งค่า background
window.electron?.ipcRenderer.on('theme-loaded', (...args: unknown[]) => {
  const theme = args[0] as ThemeData;

  // Cache theme data
  cachedTheme = theme;

  // Set initial background (home page)
  if (theme?.background) {
    document.body.style.backgroundImage = `url(${theme.background})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
  }

  if (theme?.primaryColor) {
    document.documentElement.style.setProperty(
      '--primary-color',
      theme.primaryColor,
    );
  } else {
    document.documentElement.style.setProperty(
      '--primary-color',
      'transparent',
    );
  }

  if (theme?.fontColor) {
    document.body.style.color = theme.fontColor;
  }

  if (theme?.textButtonColor) {
    document.documentElement.style.setProperty(
      '--text-button-color',
      theme.textButtonColor,
    );
  }
});

// Listen for route changes to switch background
window.addEventListener('message', (event) => {
  if (event.data.type === 'ROUTE_CHANGE') {
    const pathname = event.data.pathname as string;

    if (!cachedTheme) {
      return;
    }

    // Use background for home page ('/'), backgroundSecond for all other pages
    const isHomePage = pathname === '/';
    const backgroundUrl = isHomePage
      ? cachedTheme.background
      : cachedTheme.backgroundSecond;

    if (backgroundUrl) {
      document.body.style.backgroundImage = `url(${backgroundUrl})`;
    }
  }
});

// Request theme data on load if not received yet
setTimeout(() => {
  if (!cachedTheme) {
    window.electron?.payment
      .getThemeData()
      .then((result: any) => {
        if (result.success && result.theme) {
          cachedTheme = result.theme;

          // Set initial background
          if (result.theme.background) {
            document.body.style.backgroundImage = `url(${result.theme.background})`;
            document.body.style.backgroundSize = 'contain';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
          }

          if (result.theme.primaryColor) {
            document.documentElement.style.setProperty(
              '--primary-color',
              result.theme.primaryColor,
            );
          }

          if (result.theme.fontColor) {
            document.body.style.color = result.theme.fontColor;
            document.documentElement.style.setProperty(
              '--font-color',
              result.theme.fontColor,
            );
          }
        }
        return result;
      })
      .catch((error: any) => {
        console.error('❌ Failed to get theme data:', error);
      });
  }
}, 1000);

// calling IPC exposed from preload script
window.electron?.ipcRenderer.once('ipc-example', (arg) => {
  // eslint-disable-next-line no-console
  console.log(arg);
});
window.electron?.ipcRenderer.sendMessage('ipc-example', ['ping']);

// Listen for shutdown logs from main process
(window as any).electron?.ipcRenderer.on('shutdown-log', (logData: any) => {
  const { level, message, data, timestamp } = logData;
  const logMessage = `[${timestamp}] ${message}`;

  // แสดง log ใน console ตาม level
  switch (level) {
    case 'error':
      console.error(logMessage, data || '');
      break;
    case 'warn':
      console.warn(logMessage, data || '');
      break;
    default:
      console.log(logMessage, data || '');
  }
});
