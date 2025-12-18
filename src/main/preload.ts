// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'print-photo' | 'print-response' | 'theme-loaded' | 'machine-init' | 'navigate-to' | 'show-print-test-password-modal' | 'show-quit-app-password-modal' | 'show-clear-config-password-modal' | 'show-camera-config-modal' | 'show-printer-config-modal' | 'quit-app' | 'sse-status-502';

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
    printPhoto: (printConfig: { imageDataUrl: string; frameId: string; frameName: string; copies?: number; orientation?: 'portrait' | 'landscape' }) => {
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
    createMachinePayment: (amount: number, numberPhoto: number, channel?: string, couponCodeId?: string) => {
      return ipcRenderer.invoke('create-machine-payment', amount, numberPhoto, channel || 'promptpay', couponCodeId);
    },
    checkMachineCoupon: (code: string) => {
      return ipcRenderer.invoke('check-machine-coupon', code);
    },
    checkMachinePaymentStatus: (mchOrderNo: string) => {
      return ipcRenderer.invoke('check-machine-payment-status', mchOrderNo);
    },
    getMachinePrices: () => {
      return ipcRenderer.invoke('get-machine-prices');
    },
    getMachineData: () => {
      return ipcRenderer.invoke('get-machine-data');
    },
    forceInit: () => {
      return ipcRenderer.invoke('force-init');
    },
    getEnvVars: () => {
      return ipcRenderer.invoke('get-env-vars');
    },
    getThemeData: () => {
      return ipcRenderer.invoke('get-theme-data');
    },
    getPaperPosition: () => {
      return ipcRenderer.invoke('get-paper-position');
    },
    getResourcesPath: () => {
      return ipcRenderer.invoke('get-resources-path');
    },
    uploadMachineFiles: (
      transactionCode: string,
      photos: string[],
      videos?: string[],
      transactionId?: string,
    ) => {
      return ipcRenderer.invoke(
        'upload-machine-files',
        transactionCode,
        photos,
        videos || [],
        transactionId,
      );
    },
    getMachineConfig: () => {
      return ipcRenderer.invoke('get-machine-config');
    },
    saveMachineConfig: (config: { machineId: string; machinePort: string }) => {
      return ipcRenderer.invoke('save-machine-config', config);
    },
    hasMachineConfig: () => {
      return ipcRenderer.invoke('has-machine-config');
    },
    deleteMachineConfig: () => {
      return ipcRenderer.invoke('delete-machine-config');
    },
    getConfigFilePath: () => {
      return ipcRenderer.invoke('get-config-file-path');
    },
    getPaperPositionConfig: () => {
      return ipcRenderer.invoke('get-paper-position-config');
    },
    savePaperPositionConfig: (config: { landscapeWidth: number; landscapeHeight: number; portraitWidth: number; portraitHeight: number }) => {
      return ipcRenderer.invoke('save-paper-position-config', config);
    },
    resetPaperPositionConfig: () => {
      return ipcRenderer.invoke('reset-paper-position-config');
    },
    getCameraConfig: () => {
      return ipcRenderer.invoke('get-camera-config');
    },
    saveCameraConfig: (config: { deviceId: string; label: string }) => {
      return ipcRenderer.invoke('save-camera-config', config);
    },
    hasCameraConfig: () => {
      return ipcRenderer.invoke('has-camera-config');
    },
    deleteCameraConfig: () => {
      return ipcRenderer.invoke('delete-camera-config');
    },
    getPrinters: () => {
      return ipcRenderer.invoke('get-printers');
    },
    getPrinterConfig: () => {
      return ipcRenderer.invoke('get-printer-config');
    },
    savePrinterConfig: (config: { printerName: string; displayName: string; canCut: boolean }) => {
      return ipcRenderer.invoke('save-printer-config', config);
    },
    hasPrinterConfig: () => {
      return ipcRenderer.invoke('has-printer-config');
    },
    deletePrinterConfig: () => {
      return ipcRenderer.invoke('delete-printer-config');
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
