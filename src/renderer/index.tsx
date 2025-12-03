import { createRoot } from 'react-dom/client';
import App from './App';

interface ThemeData {
  _id?: string;
  name?: string;
  code?: string;
  background?: string;
  backgroundSecond?: string;
  primaryColor?: string;
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
  console.log('🎨 Theme received:', theme);

  // Cache theme data
  cachedTheme = theme;

  // Set initial background (home page)
  if (theme?.background) {
    document.body.style.backgroundImage = `url(${theme.background})`;
    document.body.style.backgroundSize = 'contain';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    console.log('✅ Background set to:', theme.background);
  }

  if (theme?.primaryColor) {
    document.documentElement.style.setProperty(
      '--primary-color',
      theme.primaryColor,
    );
  }

  if (theme?.fontColor) {
    document.body.style.color = theme.fontColor;
  }
});

// Listen for route changes to switch background
window.addEventListener('message', (event) => {
  if (event.data.type === 'ROUTE_CHANGE') {
    const pathname = event.data.pathname as string;
    console.log('🔄 Route changed to:', pathname);

    if (!cachedTheme) {
      console.log('⚠️ No cached theme data');
      return;
    }

    // Use background for home page ('/'), backgroundSecond for all other pages
    const isHomePage = pathname === '/';
    const backgroundUrl = isHomePage
      ? cachedTheme.background
      : cachedTheme.backgroundSecond;

    if (backgroundUrl) {
      document.body.style.backgroundImage = `url(${backgroundUrl})`;
      console.log(
        `✅ Background switched to: ${isHomePage ? 'background' : 'backgroundSecond'}`,
      );
    }
  }
});

// Request theme data on load if not received yet
setTimeout(() => {
  if (!cachedTheme) {
    console.log('🔍 Requesting theme data...');
    window.electron?.payment
      .getThemeData()
      .then((result: any) => {
        if (result.success && result.theme) {
          console.log('🎨 Theme data loaded from cache:', result.theme);
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
