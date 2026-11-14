import { scaledHitbox } from "../config/gameConfig";
import type { Facing } from "../config/spriteConfig";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Player {
  // World position of the character's feet, in dungeon pixels.
  x: number;
  y: number;
  facing: Facing = "down";
  moving = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  hitbox(): Rect {
    const { width, height, offsetX, offsetY } = scaledHitbox();
    return {
      x: this.x + offsetX,
      y: this.y + offsetY,
      width,
      height,
    };
  }
}
