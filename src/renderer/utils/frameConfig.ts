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
  imageSize: string;
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
  const [widthStr, heightStr] = frame.imageSize.split('x');
  const width = parseInt(widthStr, 10);
  const height = parseInt(heightStr, 10);

  return {
    id: frame.code,
    name: frame.name,
    image: frame.imageUrl,
    width: width,
    height: height,
    orientation: width > height ? 'landscape' : 'portrait',
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
  filter?: string; // CSS filter (for preview)
  lutFile?: string; // Filename of .cube LUT file (for FFmpeg)
  type: 'css' | 'lut'; // Filter type
}

export const FILTERS: FilterConfig[] = [
  // LUT-based filters (for high-quality color grading)
  { id: 'matte-brown-mono', name: 'Matte Brown Mono', lutFile: 'Matte_Brown_Mono.cube', type: 'lut' },
  { id: 'sepia-brown', name: 'Sepia Brown', lutFile: 'Sepia_Brown.cube', type: 'lut' },
  { id: 'timelab-1', name: 'Timelab 1', lutFile: 'Timelab 1.cube', type: 'lut' },
  { id: 'timelab-2', name: 'Timelab 2', lutFile: 'Timelab 2.cube', type: 'lut' },
  { id: 'timelab-3', name: 'Timelab 3', lutFile: 'Timelab 3.cube', type: 'lut' },
  { id: 'timelab-4', name: 'Timelab 4', lutFile: 'Timelab 4.cube', type: 'lut' },
  { id: 'timelab-5', name: 'Timelab 5', lutFile: 'Timelab 5.cube', type: 'lut' },
  { id: 'warm-vintage', name: 'Warm Vintage', lutFile: 'Warm_Vintage.cube', type: 'lut' },
];
