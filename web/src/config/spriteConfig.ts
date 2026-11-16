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
    idle: [1, 2, 3].map((frame) => `${character}/knight_${name}_idle_${frame}.png`),
    run: [1, 2, 3].map((frame) => `${character}/knight_${name}_run_${frame}.png`),
  };
}

// Three idle frames and three run frames for every direction.
export const spriteConfig: Record<Facing, DirectionSprites> = {
  up: direction("up"),
  down: direction("down"),
  left: direction("left"),
  right: direction("right"),
  "up-left": direction("up_left"),
  "up-right": direction("up_right"),
  "down-left": direction("down_left"),
  // The replacement run is two frames, both the same height as the idle.
  "down-right": {
    idle: direction("down_right").idle,
    run: [1, 2].map((frame) => `${character}/knight_down_right_run_${frame}.png`),
  },
};

export const allSpriteUrls: string[] = Object.values(spriteConfig).flatMap(
  (directionSprites) => [...directionSprites.idle, ...directionSprites.run],
);

function wizardDirection(name: string): DirectionSprites {
  return {
    idle: [1, 2].map((frame) => `${character}/wizard_${name}_idle_${frame}.png`),
    run: [1, 2, 3].map((frame) => `${character}/wizard_${name}_run_${frame}.png`),
  };
}

export const wizardSprites: Record<Facing, DirectionSprites> = {
  up: wizardDirection("up"),
  down: wizardDirection("down"),
  left: wizardDirection("left"),
  right: wizardDirection("right"),
  "up-left": wizardDirection("up_left"),
  "up-right": wizardDirection("up_right"),
  "down-left": wizardDirection("down_left"),
  "down-right": wizardDirection("down_right"),
};

export const wizardSpriteUrls: string[] = Object.values(wizardSprites).flatMap(
  (directionSprites) => [...directionSprites.idle, ...directionSprites.run],
);

export function spritesFor(adventurer: "knight" | "wizard"): Record<Facing, DirectionSprites> {
  return adventurer === "wizard" ? wizardSprites : spriteConfig;
}

export function spriteUrlsFor(adventurer: "knight" | "wizard"): string[] {
  return adventurer === "wizard" ? wizardSpriteUrls : allSpriteUrls;
}
