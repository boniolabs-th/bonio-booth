import { useEffect, useState } from 'react';

type SseState = {
  isConnected: boolean;
  maintenance: boolean;
};

export function useSseStatus() {
  const [state, setState] = useState<SseState>({
    isConnected: false,
    maintenance: false,
  });

  useEffect(() => {
    // initial check
    window.electron.ipcRenderer
      .invoke('get-sse-status')
      .then((status) => {
        setState({
          isConnected: status.isConnected,
          maintenance: false,
        });
      })
      .catch(console.error);

    const offConnected = window.electron.ipcRenderer.on(
      'sse-connected',
      () => {
        setState((s) => ({ ...s, isConnected: true }));
      },
    );

    const offDisconnected = window.electron.ipcRenderer.on(
      'sse-disconnected',
      () => {
        setState((s) => ({ ...s, isConnected: false }));
      },
    );

    const off502 = window.electron.ipcRenderer.on('sse-status-502', () => {
      setState({
        isConnected: false,
        maintenance: true,
      });
    });

    return () => {
      offConnected();
      offDisconnected();
      off502();
    };
  }, []);

  return state;
}
