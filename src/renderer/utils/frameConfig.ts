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
  { id: 'BW1', name: 'สุดหล่อ-1', lutFile: 'BW1.cube', type: 'lut' },
  { id: 'BW2', name: 'สุดหล่อ-2', lutFile: 'BW2.cube', type: 'lut' },
  { id: 'BW3', name: 'สุดหล่อ-3', lutFile: 'BW3.cube', type: 'lut' },
  { id: 'BW4', name: 'สุดหล่อ-4', lutFile: 'BW4.cube', type: 'lut' },
  { id: 'BW5', name: 'สุดหล่อ-5', lutFile: 'BW5.cube', type: 'lut' },
  { id: 'BW6', name: 'สุดสวย-1', lutFile: 'BW6.cube', type: 'lut' },
  { id: 'BW7', name: 'สุดสวย-2', lutFile: 'BW7.cube', type: 'lut' },
  { id: 'BW8', name: 'สุดสวย-3', lutFile: 'BW8.cube', type: 'lut' },
  { id: 'BW9', name: 'สุดสวย-4', lutFile: 'BW9.cube', type: 'lut' },
  { id: 'BW10', name: 'สุดสวย-5', lutFile: 'BW10.cube', type: 'lut' },
];
