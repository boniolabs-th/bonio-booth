import classic2x6 from '../../../assets/frames/2x6_classic.png';
import modern4x6 from '../../../assets/frames/4x8_modern.png';

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
  }[];
  previewSlots?: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: 'classic_2x6',
    name: '2x6 Classic',
    image: classic2x6,
    width: 2400,
    height: 3600,
    orientation: 'landscape' as const,
    slots: [
      { id: 'classic_slot_1', x: 35, y: 54, width: 1130, height: 1083 }, // Top left photo slot
      { id: 'classic_slot_2', x: 1237, y: 55, width: 1130, height: 1083 }, // Top right photo slot
      { id: 'classic_slot_3', x: 35, y: 1163, width: 1130, height: 1083 }, // Middle left photo slot
      { id: 'classic_slot_4', x: 1233, y: 1162, width: 1130, height: 1083 },
      { id: 'classic_slot_5', x: 37, y: 2275, width: 1130, height: 1083 },
      { id: 'classic_slot_6', x: 1238, y: 2272, width: 1130, height: 1083 },
    ],
    previewSlots: [
      { id: 'classic_slot_1', x: 151, y: 54, width: 1018, height: 1083 },
      { id: 'classic_slot_2', x: 1237, y: 55, width: 1018, height: 1083 },
      { id: 'classic_slot_3', x: 151, y: 1163, width: 1018, height: 1083 },
      { id: 'classic_slot_4', x: 1237, y: 1162, width: 1018, height: 1083 },
      { id: 'classic_slot_5', x: 151, y: 2275, width: 1018, height: 1083 },
      { id: 'classic_slot_6', x: 1237, y: 2272, width: 1018, height: 1083 },
    ],
  },
  {
    id: 'modern_4x6',
    name: '4x6 Modern',
    image: modern4x6,
    width: 1200, // 6 inches × 300 DPI
    height: 1800, // 8 inches × 300 DPI
    orientation: 'landscape' as const,
    slots: [
      { id: 'modern_slot_1', x: 150, y: 150, width: 450, height: 300 }, // Top left
      { id: 'modern_slot_2', x: 675, y: 150, width: 450, height: 300 }, // Top middle
      { id: 'modern_slot_3', x: 1200, y: 150, width: 450, height: 300 }, // Top right
      { id: 'modern_slot_4', x: 150, y: 600, width: 450, height: 300 }, // Bottom left
      { id: 'modern_slot_5', x: 675, y: 600, width: 450, height: 300 }, // Bottom middle
      { id: 'modern_slot_6', x: 1200, y: 600, width: 450, height: 300 }, // Bottom right
    ],
  },
  // Mock additional frames
  {
    id: 'frame_3_slots',
    name: '3 Slots Vertical',
    image: classic2x6, // Using existing image as placeholder
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'slot_1', x: 100, y: 100, width: 1000, height: 800 },
      { id: 'slot_2', x: 100, y: 1000, width: 1000, height: 800 },
      { id: 'slot_3', x: 100, y: 1900, width: 1000, height: 800 },
    ],
  },
  {
    id: 'frame_4_slots',
    name: '4 Slots Vertical',
    image: classic2x6,
    width: 2400,
    height: 3600,
    orientation: 'portrait' as const,
    slots: [
      { id: 'slot_1', x: 100, y: 50, width: 1000, height: 700 },
      { id: 'slot_2', x: 100, y: 800, width: 1000, height: 700 },
      { id: 'slot_3', x: 100, y: 1550, width: 1000, height: 700 },
      { id: 'slot_4', x: 100, y: 2300, width: 1000, height: 700 },
    ],
  },
  {
    id: 'frame_single',
    name: 'Single Large',
    image: modern4x6,
    width: 1200,
    height: 1800,
    orientation: 'portrait' as const,
    slots: [
      { id: 'slot_1', x: 100, y: 100, width: 1000, height: 1600 },
    ],
  },
  {
    id: 'frame_2_horizontal',
    name: '2 Slots Horizontal',
    image: modern4x6,
    width: 1200,
    height: 1800,
    orientation: 'landscape' as const,
    slots: [
      { id: 'slot_1', x: 50, y: 200, width: 500, height: 1400 },
      { id: 'slot_2', x: 650, y: 200, width: 500, height: 1400 },
    ],
  },
  {
    id: 'frame_4_grid',
    name: '4 Grid',
    image: modern4x6,
    width: 1200,
    height: 1800,
    orientation: 'landscape' as const,
    slots: [
      { id: 'slot_1', x: 50, y: 50, width: 500, height: 800 },
      { id: 'slot_2', x: 650, y: 50, width: 500, height: 800 },
      { id: 'slot_3', x: 50, y: 950, width: 500, height: 800 },
      { id: 'slot_4', x: 650, y: 950, width: 500, height: 800 },
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
