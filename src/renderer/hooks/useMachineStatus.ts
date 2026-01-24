import { useEffect, useState } from 'react';

type MachineStatus = string;

export function useMachineStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [machineStatus, setMachineStatus] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 📡 listen SSE status from main
  useEffect(() => {
    const offConnected = window.electron.ipcRenderer.on(
      'sse-connected',
      () => setIsConnected(true),
    );

    const offDisconnected = window.electron.ipcRenderer.on(
      'sse-disconnected',
      () => setIsConnected(false),
    );

    return () => {
      offConnected();
      offDisconnected();
    };
  }, []);

  // 📡 fetch machine status when connected
  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await window.electron.ipcRenderer.invoke(
          'get-machine-data',
        );
        console.log('get-machine-data:', data);

        if (!cancelled) {
          setMachineStatus(data.machine.status);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unknown error',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  return {
    isConnected,
    machineStatus,
    loading,
    error,
  };
}
