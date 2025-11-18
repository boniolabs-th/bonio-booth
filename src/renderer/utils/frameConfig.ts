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
  }[];
  previewSlots?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  }[];
}

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: 'classic_2x3',
    name: '2x3 Classic',
    image: classic2x3,
    width: 2400,
    height: 3600,
    orientation: 'landscape' as const,
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
    orientation: 'landscape' as const,
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
    orientation: 'landscape' as const,
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
    orientation: 'landscape' as const,
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

export const FILTERS = [
  { id: 'none', name: 'Original', filter: '' },
  { id: 'sepia', name: 'Sepia', filter: 'sepia(100%)' },
  { id: 'grayscale', name: 'B&W', filter: 'grayscale(100%)' },
  {
    id: 'vintage',
    name: 'Vintage',
    filter: 'sepia(50%) contrast(1.2) brightness(1.1)',
  },
  { id: 'cool', name: 'Cool', filter: 'hue-rotate(90deg) saturate(1.2)' },
  {
    id: 'warm',
    name: 'Warm',
    filter: 'hue-rotate(-30deg) saturate(1.1) brightness(1.1)',
  },
];
