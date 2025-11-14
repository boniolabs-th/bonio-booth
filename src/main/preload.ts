// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'print-photo' | 'print-response';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke<T = any>(channel: string, ...args: unknown[]): Promise<T> {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
  print: {
    printPhoto: (printConfig: { imageDataUrl: string; frameId: string; frameName: string }) => {
      ipcRenderer.send('print-photo', printConfig);
    },
    onPrintResponse: (
      callback: (response: { success: boolean; error?: string }) => void,
    ) => {
      ipcRenderer.on('print-response', (_event, response) =>
        callback(response),
      );
    },
    removePrintResponseListener: () => {
      ipcRenderer.removeAllListeners('print-response');
    },
  },
  payment: {
    createPayment: (amount: number, orderNo: string) => {
      return ipcRenderer.invoke('create-payment', amount, orderNo);
    },
    checkPaymentStatus: (referenceId: string) => {
      return ipcRenderer.invoke('check-payment-status', referenceId);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
