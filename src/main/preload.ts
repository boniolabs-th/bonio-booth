// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'print-photo' | 'print-response' | 'theme-loaded' | 'machine-init';

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
    printPhoto: (printConfig: { imageDataUrl: string; frameId: string; frameName: string; copies?: number }) => {
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
    createMachinePayment: (amount: number, numberPhoto: number, channel?: string) => {
      return ipcRenderer.invoke('create-machine-payment', amount, numberPhoto, channel || 'promptpay');
    },
    checkMachinePaymentStatus: (mchOrderNo: string) => {
      return ipcRenderer.invoke('check-machine-payment-status', mchOrderNo);
    },
    getMachinePrices: () => {
      return ipcRenderer.invoke('get-machine-prices');
    },
  },
  video: {
    createBoomerang: (videoPath: string, format: 'video' | 'gif' = 'video') => {
      return ipcRenderer.invoke('create-boomerang', videoPath, format);
    },
    extractFrames: (videoPath: string, frameCount: number = 12) => {
      return ipcRenderer.invoke('extract-frames', videoPath, frameCount);
    },
    cleanupTemp: (filePaths: string[]) => {
      return ipcRenderer.invoke('cleanup-temp', filePaths);
    },
    saveTempVideo: (arrayBuffer: ArrayBuffer) => {
      return ipcRenderer.invoke('save-temp-video', arrayBuffer);
    },
    applyLutToVideo: (videoPath: string, lutFileName: string) => {
      return ipcRenderer.invoke('apply-lut-to-video', videoPath, lutFileName);
    },
    createBoomerangWithLut: (videoPath: string, lutFileName: string) => {
      return ipcRenderer.invoke('create-boomerang-with-lut', videoPath, lutFileName);
    },
    readVideoFile: (filePath: string) => {
      return ipcRenderer.invoke('read-video-file', filePath);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
