import type { Facing } from "../config/spriteConfig";

// slash_right is a crescent whose thick side sits on the left of the frame
// and whose opening faces right. These pivots are that crescent's center.
const PIVOTS = [
  { x: 52, y: 67 },
  { x: 52, y: 63 },
  { x: 52, y: 59 },
];

// Added to the facing angle so the thick side points along the attack direction.
const BULGE_OFFSET = Math.PI;

export interface SlashDraw {
  image: HTMLImageElement;
  x: number;
  y: number;
  rotation: number;
  visualScale: number;
  pivotX: number;
  pivotY: number;
}

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

export function slashRotation(directionAngle: number): number {
  return directionAngle + BULGE_OFFSET;
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
