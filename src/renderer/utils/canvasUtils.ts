/**
 * Canvas utility functions for drawing photos into frame slots
 */

export interface SlotConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  id?: string;
  rotate?: number; // Rotation in degrees (0-360)
}

export interface DrawPhotoInSlotOptions {
  ctx: CanvasRenderingContext2D;
  photoImg: HTMLImageElement;
  slot: SlotConfig;
  scaleX: number;
  scaleY: number;
}

/**
 * Draw a rounded rectangle clipping path on the canvas context
 */
export function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Calculate crop dimensions for cover behavior (crop to fit slot while maintaining aspect ratio)
 */
export function calculateCoverCrop(
  imgWidth: number,
  imgHeight: number,
  slotWidth: number,
  slotHeight: number,
): { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number } {
  const photoAspect = imgWidth / imgHeight;
  const slotAspect = slotWidth / slotHeight;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = imgWidth;
  let sourceHeight = imgHeight;

  if (photoAspect > slotAspect) {
    // Photo is wider - crop sides
    sourceWidth = imgHeight * slotAspect;
    sourceX = (imgWidth - sourceWidth) / 2;
  } else {
    // Photo is taller - crop top/bottom
    sourceHeight = imgWidth / slotAspect;
    sourceY = (imgHeight - sourceHeight) / 2;
  }

  return { sourceX, sourceY, sourceWidth, sourceHeight };
}

/**
 * Draw a photo into a frame slot with rounded corners, rotation, and cover crop behavior
 * This is the centralized logic used by both PhotoDecorate and PhotoFilter components
 */
export function drawPhotoInSlot({
  ctx,
  photoImg,
  slot,
  scaleX,
  scaleY,
}: DrawPhotoInSlotOptions): void {
  ctx.save();

  const targetX = slot.x * scaleX;
  const targetY = slot.y * scaleY;
  const targetWidth = slot.width * scaleX;
  const targetHeight = slot.height * scaleY;
  const targetRadius = (slot.radius || 0) * scaleX; // Scale radius with scaleX
  const rotation = slot.rotate || 0; // Rotation in degrees

  // Calculate center point for rotation
  const centerX = targetX + targetWidth / 2;
  const centerY = targetY + targetHeight / 2;

  // Apply rotation around center if needed
  if (rotation !== 0) {
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  // Create rounded rectangle clipping path if radius is specified
  if (targetRadius > 0) {
    drawRoundedRectPath(ctx, targetX, targetY, targetWidth, targetHeight, targetRadius);
    ctx.clip();
  }

  // Calculate crop dimensions (cover behavior - crop to fit slot)
  const { sourceX, sourceY, sourceWidth, sourceHeight } = calculateCoverCrop(
    photoImg.width,
    photoImg.height,
    slot.width,
    slot.height,
  );

  // Draw cropped photo in slot
  ctx.drawImage(
    photoImg,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    targetX,
    targetY,
    targetWidth,
    targetHeight,
  );

  ctx.restore();
}

/**
 * Load an image from a URL and return a promise
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
