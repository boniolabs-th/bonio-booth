import classic2x3 from '../../../assets/frames/2x3_classic.png';
import modern2x3 from '../../../assets/frames/2x3_modern.png';
import blvd1x3 from '../../../assets/frames/1x3_blvd.png';
import blvd2x3 from '../../../assets/frames/2x3_blvd.png';
import burningcity2x2 from '../../../assets/frames/2x2_burningcity.png';
import burningcity3x2 from '../../../assets/frames/3x2_burningcity.png';


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
  }[];
  previewSlots?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    zIndex?: number;
  }[];
}

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: 'classic_2x3',
    name: '2x3 Classic',
    image: classic2x3,
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'classic_slot_1', x: 35, y: 54, width: 1130, height: 1083, radius: 100 }, // Top left photo slot
      { id: 'classic_slot_2', x: 1237, y: 55, width: 1130, height: 1083, radius: 100 }, // Top right photo slot
      { id: 'classic_slot_3', x: 35, y: 1163, width: 1130, height: 1083, radius: 100 }, // Middle left photo slot
      { id: 'classic_slot_4', x: 1233, y: 1162, width: 1130, height: 1083, radius: 100 },
      { id: 'classic_slot_5', x: 37, y: 2275, width: 1130, height: 1083, radius: 100 },
      { id: 'classic_slot_6', x: 1238, y: 2272, width: 1130, height: 1083, radius: 100 },
    ],
    previewSlots: [
      { id: 'classic_slot_1', x: 35, y: 54, width: 1130, height: 1083, radius: 15 },
      { id: 'classic_slot_2', x: 1237, y: 55, width: 1130, height: 1083, radius: 15 },
      { id: 'classic_slot_3', x: 35, y: 1163, width: 1130, height: 1083, radius: 15 },
      { id: 'classic_slot_4', x: 1237, y: 1162, width: 1130, height: 1083, radius: 15 },
      { id: 'classic_slot_5', x: 35, y: 2275, width: 1130, height: 1083, radius: 15 },
      { id: 'classic_slot_6', x: 1237, y: 2272, width: 1130, height: 1083, radius: 15 },
    ],
  },
  {
    id: 'blvd_1x3',
    name: '1x3 BLVD',
    image: blvd1x3,
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'blvd_1x3_slot_1', x: 35, y: 54, width: 2330, height: 1083, radius: 0 },
      { id: 'blvd_1x3_slot_2', x: 35, y: 1163, width: 2330, height: 1083, radius: 0 },
      { id: 'blvd_1x3_slot_3', x: 37, y: 2275, width: 2330, height: 1083, radius: 0 },
    ],
    previewSlots: [
      { id: 'blvd_1x3_slot_1', x: 35, y: 54, width: 2330, height: 1083, radius: 15 },
      { id: 'blvd_1x3_slot_2', x: 35, y: 1163, width: 2330, height: 1083, radius: 15 },
      { id: 'blvd_1x3_slot_3', x: 37, y: 2275, width: 2330, height: 1083, radius: 15 },
    ],
  },
  {
    id: 'blvd_2x3',
    name: '2x3 BLVD',
    image: blvd2x3,
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'blvd_2x3_slot_1', x: 100, y: 100, width: 1000, height: 1000, radius: 50 },
      { id: 'blvd_2x3_slot_2', x: 1300, y: 100, width: 1000, height: 1000, radius: 50 },
      { id: 'blvd_2x3_slot_3', x: 100, y: 1200, width: 1000, height: 1000, radius: 50 },
      { id: 'blvd_2x3_slot_4', x: 1300, y: 1200, width: 1000, height: 1000, radius: 50 },
      { id: 'blvd_2x3_slot_5', x: 100, y: 2300, width: 1000, height: 1000, radius: 50 },
      { id: 'blvd_2x3_slot_6', x: 1300, y: 2300, width: 1000, height: 1000, radius: 50 },
    ],
  },
  {
    id: 'burningcity_2x2',
    name: '2x2 Burning City',
    image: burningcity2x2,
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'burningcity_2x2_slot_1', x: 62, y: 83, width: 1127, height: 1547, radius: 0 },
      { id: 'burningcity_2x2_slot_2', x: 1212, y: 76, width: 1127, height: 1547, radius: 0 },
      { id: 'burningcity_2x2_slot_3', x: 59, y: 1637, width: 1127, height: 1547, radius: 0 },
      { id: 'burningcity_2x2_slot_4', x: 1211, y: 1640, width: 1127, height: 1547, radius: 0 },
    ],
  },
  {
    id: 'burningcity_3x2',
    name: '3x2 Burning City',
    image: burningcity3x2,
    width: 1800,
    height: 1200,
    orientation: 'landscape' as const,
    slots: [
      { id: 'burningcity_3x2_slot_1', x: 25, y: 35, width: 577, height: 559, radius: 0 },
      { id: 'burningcity_3x2_slot_2', x: 610, y: 39, width: 577, height: 559, radius: 0 },
      { id: 'burningcity_3x2_slot_3', x: 1195, y: 37, width: 577, height: 559, radius: 0 },
      { id: 'burningcity_3x2_slot_4', x: 25, y: 600, width: 577, height: 559, radius: 0 },
      { id: 'burningcity_3x2_slot_5', x: 611, y: 601, width: 577, height: 559, radius: 0 },
      { id: 'burningcity_3x2_slot_6', x: 1192, y: 601, width: 577, height: 559, radius: 0 },
    ],
  },
  {
    id: 'modern_4x6',
    name: '4x6 Modern',
    image: modern2x3,
    width: 1200, // 6 inches × 300 DPI
    height: 1800, // 8 inches × 300 DPI
    orientation: 'portrait' as const,
    slots: [
      { id: 'modern_slot_1', x: 150, y: 150, width: 450, height: 300, radius: 15 }, // Top left
      { id: 'modern_slot_2', x: 675, y: 150, width: 450, height: 300, radius: 15 }, // Top middle
      { id: 'modern_slot_3', x: 1200, y: 150, width: 450, height: 300, radius: 15 }, // Top right
      { id: 'modern_slot_4', x: 150, y: 600, width: 450, height: 300, radius: 15 }, // Bottom left
      { id: 'modern_slot_5', x: 675, y: 600, width: 450, height: 300, radius: 15 }, // Bottom middle
      { id: 'modern_slot_6', x: 1200, y: 600, width: 450, height: 300, radius: 15 }, // Bottom right
    ],
  },
];

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
      zIndex: slot.zIndex
    })),
    // Use same slots for preview if not specified differently
    previewSlots: frame.grid.slots.map((slot, index) => ({
      id: `${frame.code}_slot_${index + 1}`,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      radius: slot.radius || 0,
      zIndex: slot.zIndex
    }))
  };
}

// Function to fetch frames from API
export async function fetchFrameConfigs(apiUrl: string = 'http://localhost:3000/api/frames'): Promise<FrameConfig[]> {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch frames: ${response.statusText}`);
    }
    const data: FrameApiResponse[] = await response.json();

    return data
      .filter(frame => frame.isActive)
      .map(frame => mapFrameApiResponseToConfig(frame));
  } catch (error) {
    console.error('Error fetching frames:', error);
    return FRAME_CONFIGS; // Fallback to local configs
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
  // { id: 'none', name: 'Original', filter: '', type: 'css' },
  // { id: 'sepia', name: 'Sepia', filter: 'sepia(100%)', type: 'css' },
  // { id: 'grayscale', name: 'B&W', filter: 'grayscale(100%)', type: 'css' },
  // {
  //   id: 'vintage',
  //   name: 'Vintage',
  //   filter: 'sepia(50%) contrast(1.2) brightness(1.1)',
  //   type: 'css',
  // },
  // { id: 'cool', name: 'Cool', filter: 'hue-rotate(90deg) saturate(1.2)', type: 'css' },
  // {
  //   id: 'warm',
  //   name: 'Warm',
  //   filter: 'hue-rotate(-30deg) saturate(1.1) brightness(1.1)',
  //   type: 'css',
  // },
  // LUT-based filters (for high-quality color grading)
  { id: 'timelab1', name: 'Timelab-1', lutFile: 'Timelab-1.cube', type: 'lut' },
  { id: 'timelab2', name: 'Timelab-2', lutFile: 'Timelab-2.cube', type: 'lut' },
  { id: 'timelab3', name: 'Timelab-3', lutFile: 'Timelab-3.cube', type: 'lut' },
  { id: 'timelab4', name: 'Timelab-4', lutFile: 'Timelab-4.cube', type: 'lut' },
  { id: 'timelab5', name: 'Timelab-5', lutFile: 'Timelab-5.cube', type: 'lut' },
];
