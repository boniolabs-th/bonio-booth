/**
 * Canon Camera Types
 * Types for Canon EDSDK camera operations in renderer process
 */

export interface CameraInfo {
  name: string;
  portName: string;
  deviceSubType: number;
  bodyId?: string;
}

export interface CaptureSettings {
  /** ISO speed (e.g., 100, 200, 400, 800, etc.) */
  iso?: number;
  /** Aperture value in Av units */
  aperture?: number;
  /** Shutter speed in Tv units */
  shutterSpeed?: number;
  /** White balance setting */
  whiteBalance?: number;
  /** Image quality setting */
  imageQuality?: number;
}

export interface CaptureResult {
  success: boolean;
  filePath?: string;
  error?: string;
  imageData?: Buffer;
}

export interface LiveViewFrame {
  width: number;
  height: number;
  data: Buffer;
}

export enum CameraEventType {
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  PropertyChanged = 'PropertyChanged',
  ObjectCreated = 'ObjectCreated',
  CaptureComplete = 'CaptureComplete',
  ShutdownRequested = 'ShutdownRequested',
  Error = 'Error',
}

export interface CameraEvent {
  eventType: CameraEventType;
  message?: string;
  data?: string;
}

export interface FullConnectResult {
  success: boolean;
  error?: string;
  camera?: CameraInfo;
  batteryLevel?: number | null;
  availableShots?: number | null;
}

export interface PropertyIds {
  ISO_SPEED: number;
  APERTURE: number;
  SHUTTER_SPEED: number;
  WHITE_BALANCE: number;
  EXPOSURE_COMPENSATION: number;
  IMAGE_QUALITY: number;
  BATTERY_LEVEL: number;
  AVAILABLE_SHOTS: number;
  AE_MODE: number;
  DRIVE_MODE: number;
  METERING_MODE: number;
  AF_MODE: number;
}
