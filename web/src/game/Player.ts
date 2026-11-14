import { adventurerConfig, type AdventurerClass } from "../config/adventurerConfig";
import { gameConfig } from "../config/gameConfig";
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
  readonly classType: AdventurerClass;

  constructor(x: number, y: number, classType: AdventurerClass) {
    this.x = x;
    this.y = y;
    this.classType = classType;
  }

  hitbox(): Rect {
    const scale = adventurerConfig[this.classType].scale;
    const box = gameConfig.hitbox;
    return {
      x: this.x + box.offsetX * scale,
      y: this.y + box.offsetY * scale,
      width: box.width * scale,
      height: box.height * scale,
    };
  }
}
