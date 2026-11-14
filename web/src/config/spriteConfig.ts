export type Facing =
  | "up"
  | "down"
  | "left"
  | "right"
  | "up-left"
  | "up-right"
  | "down-left"
  | "down-right";

export interface DirectionSprites {
  idle: string[];
  run: string[];
}

const character = "/characters";

function direction(name: string): DirectionSprites {
  return {
    idle: [`${character}/knight_${name}_idle.png`],
    run: [
      `${character}/knight_${name}_run_left.png`,
      `${character}/knight_${name}_run_right.png`,
    ],
  };
}

// Filenames match the supplied frames. Each direction has one idle image
// and a two-frame run cycle. No extra frames are generated.
export const spriteConfig: Record<Facing, DirectionSprites> = {
  up: direction("up"),
  down: direction("down"),
  left: direction("left"),
  right: direction("right"),
  "up-left": direction("up_left"),
  "up-right": direction("up_right"),
  "down-left": direction("down_left"),
  "down-right": direction("down_right"),
};

export const allSpriteUrls: string[] = Object.values(spriteConfig).flatMap(
  (directionSprites) => [...directionSprites.idle, ...directionSprites.run],
);
