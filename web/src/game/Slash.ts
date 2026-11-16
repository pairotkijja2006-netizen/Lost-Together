import type { Facing } from "../config/spriteConfig";

// The crescent is a wide horizontal arch. Its outer edge points up, and the
// pivot is the visual center of that arch, not the corner of the 128px frame.
const PIVOTS = [
  { x: 52, y: 67 },
  { x: 52, y: 63 },
  { x: 52, y: 59 },
];

// Screen-space angle of the unrotated sprite's outer edge. Up is -PI/2.
const SPRITE_OUTWARD_ANGLE = -Math.PI / 2;

export interface SlashDraw {
  image: HTMLImageElement;
  x: number;
  y: number;
  rotation: number;
  visualScale: number;
  pivotX: number;
  pivotY: number;
  alpha?: number;
  // Stretches the crescent along the line between its tips. Goblin swings only.
  acrossScale?: number;
  // Pixel size of this image. Goblin crescents stay on the 128px frames.
  sourceSize?: number;
}

// The knight swings are already drawn in the facing they belong to.
export const KNIGHT_SLASH_SOURCE = 144;
export const KNIGHT_SLASH_PIVOT_NATIVE = { x: 72, y: 72 };

export function knightSlashUrl(facing: Facing, frame: number): string {
  return `/combat/knight_slash_${facing.replace("-", "_")}_${frame}.png`;
}

export const knightSlashUrls: string[] = (
  ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right"] as Facing[]
).flatMap((facing) => [0, 1, 2, 3].map((frame) => knightSlashUrl(facing, frame)));

export function facingVector(facing: Facing): { x: number; y: number } {
  switch (facing) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "up-left":
      return { x: -0.707, y: -0.707 };
    case "up-right":
      return { x: 0.707, y: -0.707 };
    case "down-left":
      return { x: -0.707, y: 0.707 };
    case "down-right":
      return { x: 0.707, y: 0.707 };
  }
}

// Clockwise from +X, in screen space where +Y points down.
export function vectorAngle(x: number, y: number): number {
  return Math.atan2(y, x);
}

// Turns the arch so its outer center lies along the attack direction.
export function slashRotation(directionAngle: number): number {
  return directionAngle - SPRITE_OUTWARD_ANGLE;
}

export function slashFrame(elapsed: number, duration: number): number {
  const index = Math.floor((elapsed / Math.max(duration, 0.001)) * 3) + 1;
  return Math.min(3, Math.max(1, index));
}

export function slashPivot(frame: number): { x: number; y: number } {
  return PIVOTS[Math.min(3, Math.max(1, frame)) - 1];
}

export function slashUrl(frame: number): string {
  return `/combat/slash_right_${frame}.png`;
}

// Crescent center, in front of the body rather than on the feet.
export function slashPoint(
  feetX: number,
  feetY: number,
  dirX: number,
  dirY: number,
  originOffsetY: number,
  forwardOffset: number,
): { x: number; y: number } {
  return {
    x: feetX + dirX * forwardOffset,
    y: feetY + originOffsetY + dirY * forwardOffset,
  };
}
