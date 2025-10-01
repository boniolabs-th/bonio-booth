import classic4x6 from '../../../assets/frames/4x6_classic.png';
import modern6x8 from '../../../assets/frames/6x8_modern.png';

export interface FrameConfig {
  id: string;
  name: string;
  image: string;
  width: number; // Canvas width in pixels (300 DPI)
  height: number; // Canvas height in pixels (300 DPI)
  slots: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: 'classic_4x6',
    name: '4x6 Classic',
    image: classic4x6,
    width: 600, // 4 inches × 300 DPI
    height: 1800, // 6 inches × 300 DPI
    slots: [
      { id: 'classic_slot_1', x: 39, y: 36, width: 518.4, height: 297 }, // Top left photo slot
      { id: 'classic_slot_2', x: 39, y: 378, width: 518.4, height: 297 }, // Top right photo slot
      { id: 'classic_slot_3', x: 39, y: 718.2, width: 518.4, height: 297 }, // Middle left photo slot
      { id: 'classic_slot_4', x: 39, y: 1056.6, width: 518.4, height: 297 },
    ],
  },
  {
    id: 'modern_6x8',
    name: '6x8 Modern',
    image: modern6x8,
    width: 1200, // 6 inches × 300 DPI
    height: 1800, // 8 inches × 300 DPI
    slots: [
      { id: 'modern_slot_1', x: 150, y: 150, width: 450, height: 300 }, // Top left
      { id: 'modern_slot_2', x: 675, y: 150, width: 450, height: 300 }, // Top middle
      { id: 'modern_slot_3', x: 1200, y: 150, width: 450, height: 300 }, // Top right
      { id: 'modern_slot_4', x: 150, y: 600, width: 450, height: 300 }, // Bottom left
      { id: 'modern_slot_5', x: 675, y: 600, width: 450, height: 300 }, // Bottom middle
      { id: 'modern_slot_6', x: 1200, y: 600, width: 450, height: 300 }, // Bottom right
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
