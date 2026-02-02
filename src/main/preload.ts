// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example' | 'print-photo' | 'print-response' | 'theme-loaded' | 'machine-init' | 'navigate-to' | 'show-print-test-password-modal' | 'show-quit-app-password-modal' | 'show-clear-config-password-modal' | 'show-camera-config-modal' | 'show-printer-config-modal' | 'quit-app' | 'sse-connected' | 'sse-disconnected' | 'sse-status-502' | 'shutdown-log' | 'shutdown-countdown-update' | 'shutdown-starting' | 'shutdown-cancelled' | 'shutdown-countdown-reset' | 'app-close-countdown-update' | 'app-close-starting' | 'app-close-cancelled' | 'app-close-countdown-reset' | 'home-page-active' | 'home-page-inactive' | 'check-camera-availability' | 'camera-availability-result' | 'get-machine-data' | 'native-camera-frame';

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
    printPhoto: (printConfig: { imageDataUrl: string; frameId: string; frameName: string; copies?: number; orientation?: 'portrait' | 'landscape'; imageSize?: string; horizontal?: number; vertical?: number }) => {
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
    createPhotoSession: (
      transactionId: string,
      transactionCode?: string,
    ) => {
      return ipcRenderer.invoke(
        'create-photo-session',
        transactionId,
        transactionCode,
      );
    },
    uploadFilesToSession: (
      sessionId: string,
      photos: string[],
      videos?: string[],
    ) => {
      return ipcRenderer.invoke(
        'upload-files-to-session',
        sessionId,
        photos,
        videos || [],
      );
    },
    // Background upload - ส่ง job ไป queue และ return ทันที
    // ถ้าส่ง webmVideoPath มาด้วย จะแปลง WebM→MP4 ในเบื้องหลังก่อน upload
    queueBackgroundUpload: (
      sessionId: string,
      photos: string[],
      videos?: string[],
      webmVideoPath?: string,
    ) => {
      return ipcRenderer.invoke(
        'queue-background-upload',
        sessionId,
        photos,
        videos || [],
        webmVideoPath,
      );
    },
    // ตรวจสอบสถานะ upload job
    getUploadJobStatus: (jobId: string) => {
      return ipcRenderer.invoke('get-upload-job-status', jobId);
    },
    // ตรวจสอบจำนวน pending uploads
    getPendingUploadsCount: () => {
      return ipcRenderer.invoke('get-pending-uploads-count');
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
    savePaperPositionConfig: (config: { landscapeWidth: number; landscapeHeight: number; portraitWidth: number; portraitHeight: number; landscapeScale?: number; portraitScale?: number; type: number }) => {
      return ipcRenderer.invoke('save-paper-position-config', config);
    },
    resetPaperPositionConfig: () => {
      return ipcRenderer.invoke('reset-paper-position-config');
    },
    getDefaultPaperPositionConfig: () => {
      return ipcRenderer.invoke('get-default-paper-position-config');
    },
    getCameraConfig: () => {
      return ipcRenderer.invoke('get-camera-config');
    },
    saveCameraConfig: (config: {
      type: 'webcam' | 'canon';
      // Webcam fields
      deviceId?: string;
      label?: string;
      // Canon fields
      cameraIndex?: number;
      cameraName?: string;
      portName?: string;
      bodyId?: string;
    }) => {
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
    savePrinterConfig: (config: {
      main: { printerName: string; displayName: string; paperSize: string; canCut: boolean };
      secondary?: { printerName: string; displayName: string; paperSize: string; canCut: boolean };
    }) => {
      return ipcRenderer.invoke('save-printer-config', config);
    },
    hasPrinterConfig: () => {
      return ipcRenderer.invoke('has-printer-config');
    },
    deletePrinterConfig: () => {
      return ipcRenderer.invoke('delete-printer-config');
    },
    getPrintTestPosition: () => {
      return ipcRenderer.invoke('get-print-test-position');
    },
    savePrintTestPosition: (position: {
      landscapeHorizontal: number;
      landscapeVertical: number;
      portraitHorizontal: number;
      portraitVertical: number;
    }) => {
      return ipcRenderer.invoke('save-print-test-position', position);
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
    /**
     * Convert WebM video to MP4 for iPhone/Safari compatibility
     * @param videoPath - Path to WebM video file
     * @param returnBase64 - If true, returns base64 data URL instead of file path
     */
    convertToMp4: (videoPath: string, returnBase64: boolean = false) => {
      return ipcRenderer.invoke('convert-to-mp4', videoPath, returnBase64);
    },
  },
  // Sharp Image Encoding API (ใช้ libjpeg-turbo/libpng แทน canvas.toDataURL)
  imageEncode: {
    /**
     * Encode raw RGBA pixel data to PNG/JPEG using Sharp
     * @param rawData - RGBA pixel data array
     * @param width - Image width
     * @param height - Image height
     * @param format - Output format: 'png' or 'jpeg'
     * @param quality - JPEG quality 1-100 (default: 92)
     */
    encode: (
      rawData: number[],
      width: number,
      height: number,
      format: 'png' | 'jpeg',
      quality?: number
    ) => {
      return ipcRenderer.invoke('encode-image-sharp', {
        rawData,
        width,
        height,
        format,
        quality
      });
    },
  },
  canonCamera: {
    /** Initialize Canon EDSDK */
    initialize: () => ipcRenderer.invoke('canon:initialize'),
    /** Terminate Canon EDSDK */
    terminate: () => ipcRenderer.invoke('canon:terminate'),
    /** Check if SDK is initialized */
    isInitialized: () => ipcRenderer.invoke('canon:isInitialized'),
    /** Get list of connected Canon cameras */
    getCameraList: () => ipcRenderer.invoke('canon:getCameraList'),
    /** Connect to first available camera */
    connect: () => ipcRenderer.invoke('canon:connect'),
    /** Connect to camera by index */
    connectByIndex: (index: number) => ipcRenderer.invoke('canon:connectByIndex', index),
    /** Open camera session */
    openSession: () => ipcRenderer.invoke('canon:openSession'),
    /** Close camera session */
    closeSession: () => ipcRenderer.invoke('canon:closeSession'),
    /** Check if camera is connected */
    isConnected: () => ipcRenderer.invoke('canon:isConnected'),
    /** Check if session is open */
    isSessionOpen: () => ipcRenderer.invoke('canon:isSessionOpen'),
    /** Take a picture and save to path */
    takePicture: (savePath: string) => ipcRenderer.invoke('canon:takePicture', savePath),
    /** Capture to buffer */
    captureToBuffer: () => ipcRenderer.invoke('canon:captureToBuffer'),
    /** Start live view */
    startLiveView: () => ipcRenderer.invoke('canon:startLiveView'),
    /** Stop live view */
    stopLiveView: () => ipcRenderer.invoke('canon:stopLiveView'),
    /** Get live view frame */
    getLiveViewFrame: () => ipcRenderer.invoke('canon:getLiveViewFrame'),
    /** Get camera property */
    getProperty: (propertyId: number) => ipcRenderer.invoke('canon:getProperty', propertyId),
    /** Set camera property */
    setProperty: (propertyId: number, value: number) => ipcRenderer.invoke('canon:setProperty', propertyId, value),
    /** Get battery level */
    getBatteryLevel: () => ipcRenderer.invoke('canon:getBatteryLevel'),
    /** Get available shots */
    getAvailableShots: () => ipcRenderer.invoke('canon:getAvailableShots'),
    /** Get ISO */
    getIso: () => ipcRenderer.invoke('canon:getIso'),
    /** Set ISO */
    setIso: (value: number) => ipcRenderer.invoke('canon:setIso', value),
    /** Get SDK version */
    getSdkVersion: () => ipcRenderer.invoke('canon:getSdkVersion'),
    /** Get property IDs */
    getPropertyIds: () => ipcRenderer.invoke('canon:getPropertyIds'),
    /** Full connect flow: initialize -> get list -> connect -> open session */
    fullConnect: () => ipcRenderer.invoke('canon:fullConnect'),
    /** Full disconnect flow: close session -> terminate */
    fullDisconnect: () => ipcRenderer.invoke('canon:fullDisconnect'),
  },
  // Canon Camera V2 API using @brick-a-brack/napi-canon-cameras
  canonCameraV2: {
    /** Initialize Canon EDSDK V2 */
    initialize: () => ipcRenderer.invoke('canon-v2:initialize'),
    /** Check if SDK is initialized */
    isInitialized: () => ipcRenderer.invoke('canon-v2:isInitialized'),
    /** Get list of connected Canon cameras */
    getCameraList: () => ipcRenderer.invoke('canon-v2:getCameraList'),
    /** Connect to camera by index */
    connect: (cameraIndex?: number) => ipcRenderer.invoke('canon-v2:connect', cameraIndex),
    /** Disconnect from camera */
    disconnect: () => ipcRenderer.invoke('canon-v2:disconnect'),
    /** Check if camera is connected */
    isConnected: () => ipcRenderer.invoke('canon-v2:isConnected'),
    /** Take a picture and get base64 image */
    takePicture: () => ipcRenderer.invoke('canon-v2:takePicture'),
    /** Take a picture and save to path */
    takePictureToFile: (savePath: string) => ipcRenderer.invoke('canon-v2:takePictureToFile', savePath),
    /** Start live view */
    startLiveView: () => ipcRenderer.invoke('canon-v2:startLiveView'),
    /** Stop live view */
    stopLiveView: () => ipcRenderer.invoke('canon-v2:stopLiveView'),
    /** Get live view frame as base64 */
    getLiveViewImage: () => ipcRenderer.invoke('canon-v2:getLiveViewImage'),
    /** Get camera info */
    getCameraInfo: () => ipcRenderer.invoke('canon-v2:getCameraInfo'),
    /** Set save directory for captured images */
    setSaveDirectory: (directory: string) => ipcRenderer.invoke('canon-v2:setSaveDirectory', directory),
  },
  /**
   * Native Camera API - FFmpeg dshow based
   *
   * Architecture:
   *   Camera
   *     ↓
   *   FFmpeg (dshow)
   *     ├─ pipe → raw frames → Electron (Live View)
   *     └─ encode → MP4/JPEG (Record / Capture)
   */
  nativeCamera: {
    /** List available DirectShow video devices */
    listDevices: () => ipcRenderer.invoke('list-video-devices'),

    // ========== Live View (FFmpeg pipes JPEG frames to Electron) ==========

    /** Start live view - FFmpeg pipes JPEG frames via 'native-camera-frame' event */
    startLiveView: (deviceName: string, options?: {
      width?: number;
      height?: number;
      frameRate?: number;
      quality?: number;
    }) => ipcRenderer.invoke('native-camera-start-live-view', deviceName, options),

    /** Stop live view */
    stopLiveView: () => ipcRenderer.invoke('native-camera-stop-live-view'),

    /** Get live view status */
    getLiveViewStatus: () => ipcRenderer.invoke('native-camera-get-live-view-status'),

    /**
     * Subscribe to live view frames
     * @returns Unsubscribe function
     */
    onFrame: (callback: (frameDataUrl: string) => void) => {
      const handler = (_event: IpcRendererEvent, frameData: string) => {
        callback(frameData);
      };
      ipcRenderer.on('native-camera-frame', handler);
      return () => {
        ipcRenderer.removeListener('native-camera-frame', handler);
      };
    },

    // ========== Recording (FFmpeg encodes directly to MP4) ==========

    /** Start recording to MP4 file */
    startRecording: (deviceName: string, outputPath: string, options?: {
      width?: number;
      height?: number;
      frameRate?: number;
      duration?: number;
      saturation?: number;
      contrast?: number;
      brightness?: number;
      gamma?: number;
    }) => ipcRenderer.invoke('native-camera-start-recording', deviceName, outputPath, options),

    /** Stop recording - returns output file path */
    stopRecording: () => ipcRenderer.invoke('native-camera-stop-recording'),

    /** Get recording status */
    getRecordingStatus: () => ipcRenderer.invoke('native-camera-get-recording-status'),

    // ========== Capture (Single JPEG frame) ==========

    /** Capture single JPEG frame - returns base64 data URL */
    captureFrame: (deviceName: string, options?: {
      width?: number;
      height?: number;
      quality?: number;
    }) => ipcRenderer.invoke('native-camera-capture-frame', deviceName, options),

    /** Capture single frame to file */
    captureFrameToFile: (deviceName: string, outputPath: string, options?: {
      width?: number;
      height?: number;
      quality?: number;
    }) => ipcRenderer.invoke('native-camera-capture-frame-to-file', deviceName, outputPath, options),

    // ========== Combined Operations ==========

    /** Start live view AND recording simultaneously */
    startLiveAndRecord: (deviceName: string, recordingPath: string, liveViewOptions?: {
      width?: number;
      height?: number;
      frameRate?: number;
      quality?: number;
    }, recordingOptions?: {
      width?: number;
      height?: number;
      frameRate?: number;
      duration?: number;
      saturation?: number;
      contrast?: number;
      brightness?: number;
      gamma?: number;
    }) => ipcRenderer.invoke('native-camera-start-live-and-record', deviceName, recordingPath, liveViewOptions, recordingOptions),

    /** Stop all (live view + recording) */
    stopAll: () => ipcRenderer.invoke('native-camera-stop-all'),
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
