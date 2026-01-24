import classic2x3 from '../../../assets/frames/2x3_classic.png';
import modern2x3 from '../../../assets/frames/2x3_modern.png';
import blvd1x3 from '../../../assets/frames/1x3_blvd.png';
import blvd2x3 from '../../../assets/frames/2x3_blvd.png';
import burningcity2x2 from '../../../assets/frames/2x2_burningcity.png';
import burningcity3x2 from '../../../assets/frames/3x2_burningcity.png';

// ตัวแปรสำหรับเก็บ environment variables (จะถูก set จาก IPC)
let envConfig: {
  apiUrl: string;
  machinePort: string;
  machineId: string;
} | null = null;

// ฟังก์ชันสำหรับดึง environment variables จาก main process
async function loadEnvConfig(): Promise<void> {
  if (envConfig) return; // ถ้ามีแล้วไม่ต้องโหลดซ้ำ

  try {
    const env = await window.electron?.payment.getEnvVars();

    console.log('🔧 [frameConfig] Environment config:', env);
    if (!env) {
      throw new Error('Failed to get environment variables');
    }

    envConfig = {
      apiUrl: env.API_BASE_URL,
      machinePort: env.PORT,
      machineId: env.MACHINE_ID,
    };
    console.log('✅ [frameConfig] Environment config loaded:', envConfig);
  } catch (error) {
    console.error('❌ [frameConfig] Failed to load env config:', error);
    // ไม่ต้อง set fallback เพราะ env.config.ts จะมี default values อยู่แล้ว
    throw error; // Throw เพื่อให้ caller จัดการ error
  }
}

export interface FrameConfig {
  id: string;
  name: string;
  image: string;
  width: number; // Canvas width in pixels (300 DPI)
  height: number; // Canvas height in pixels (300 DPI)
  orientation: 'portrait' | 'landscape'; // Camera orientation for shooting
  slots: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    zIndex?: number;
    rotate?: number; // Rotation in degrees (0-360)
  }[];
  previewSlots?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    zIndex?: number;
    rotate?: number; // Rotation in degrees (0-360)
  }[];
}

// API Response Interface
export interface FrameApiResponse {
  _id: string;
  name: string;
  code: string;
  imageUrl: string;
  imageSize: string; // Format: "widthxheight" เช่น "1200x1800" หรือ "1800x1200"
  orientation?: 'portrait' | 'landscape'; // Optional: ถ้า backend ส่งมาให้ใช้ค่านี้แทนการคำนวณ
  grid: {
    rows: number;
    columns: number;
    slots: {
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      zIndex: number;
      rotate?: number; // Rotation in degrees (0-360)
    }[];
  };
  isActive: boolean;
}

// Helper to map API response to FrameConfig
export function mapFrameApiResponseToConfig(frame: FrameApiResponse): FrameConfig {
  // Parse imageSize (format: "widthxheight" เช่น "1200x1800")
  const [widthStr, heightStr] = frame.imageSize.split('x');
  const width = parseInt(widthStr, 10);
  const height = parseInt(heightStr, 10);

  // Validate parsed values
  if (Number.isNaN(width) || Number.isNaN(height)) {
    console.error('❌ [frameConfig] Invalid imageSize format:', frame.imageSize, 'for frame:', frame.code);
    throw new Error(`Invalid imageSize format: ${frame.imageSize}`);
  }

  // คำนวณ orientation จาก width และ height
  // landscape: width > height (เช่น 1800x1200)
  // portrait: height > width (เช่น 1200x1800)
  // แต่ถ้า backend ส่ง orientation มาให้ใช้ค่านั้นแทน
  const orientation: 'portrait' | 'landscape' =
    frame.orientation || (width > height ? 'landscape' : 'portrait');

  console.log('🔍 [frameConfig] Mapping frame:', {
    code: frame.code,
    name: frame.name,
    imageSize: frame.imageSize,
    width,
    height,
    calculatedOrientation: width > height ? 'landscape' : 'portrait',
    apiOrientation: frame.orientation,
    finalOrientation: orientation,
    source: frame.orientation ? 'from API' : 'calculated from imageSize',
  });

  return {
    id: frame.code,
    name: frame.name,
    image: frame.imageUrl,
    width: width,
    height: height,
    orientation: orientation,
    slots: frame.grid.slots.map((slot, index) => ({
      id: `${frame.code}_slot_${index + 1}`,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      radius: slot.radius || 0,
      zIndex: slot.zIndex,
      rotate: slot.rotate || 0
    })),
    // Use same slots for preview if not specified differently
    previewSlots: frame.grid.slots.map((slot, index) => ({
      id: `${frame.code}_slot_${index + 1}`,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      radius: slot.radius || 0,
      zIndex: slot.zIndex,
      rotate: slot.rotate || 0
    }))
  };
}

// Function to fetch frames from API
export async function fetchFrameConfigs(): Promise<FrameConfig[]> {
  // โหลด environment config จาก main process
  await loadEnvConfig();

  if (!envConfig) {
    console.error('❌ [frameConfig] Environment config not loaded');
    return [];
  }

  const headers = new Headers();
  headers.set('X-Machine-Port', String(envConfig.machinePort));
  headers.set('X-Machine-Id', envConfig.machineId || '');

  try {
    const response = await fetch(`${envConfig.apiUrl}/api/machines-public/frames`, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch frames: ${response.statusText}`);
    }
    const { frames }: { frames: FrameApiResponse[] } = await response.json();

    console.log('Frames:', frames);


    return frames
      .filter((frame: FrameApiResponse) => frame.isActive)
      .map((frame: FrameApiResponse) => mapFrameApiResponseToConfig(frame));
  } catch (error) {
    console.error('Error fetching frames:', error);
    return []; // Fallback to local configs
  }
}

export interface FilterConfig {
  id: string;
  name: string;
  lutFile: string; // Filename of .cube LUT file (for FFmpeg)
  type: 'lut'; // Filter type - LUT only
}

export const FILTERS: FilterConfig[] = [
  // LUT-based filters (for high-quality color grading via FFmpeg)
  { id: 'matte-brown-mono', name: 'Matte Brown', lutFile: 'Matte_Brown_Mono.cube', type: 'lut' },
  { id: 'sepia-brown', name: 'Sepia', lutFile: 'Sepia_Brown.cube', type: 'lut' },
  { id: 'timelab-1', name: 'Classic', lutFile: 'Timelab 1.cube', type: 'lut' },
  { id: 'timelab-2', name: 'Cool', lutFile: 'Timelab 2.cube', type: 'lut' },
  { id: 'warm-light', name: 'Warm Light', lutFile: 'Warm Light.cube', type: 'lut' },
  { id: 'bw', name: 'Black & White', lutFile: 'B&W.cube', type: 'lut' },
  { id: 'evolution', name: 'Evolution', lutFile: 'Evolution.cube', type: 'lut' },
  { id: 'orange-teal', name: 'Orange & Teal', lutFile: 'Orange & Teal.cube', type: 'lut' },
];
