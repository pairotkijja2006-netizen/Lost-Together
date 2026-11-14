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

function wizardDirection(name: string, runSteps: string[]): DirectionSprites {
  return {
    idle: [`${character}/wizard_${name}_idle.png`],
    run: runSteps.map((step) => `${character}/wizard_${name}_run_${step}.png`),
  };
}

// Down plays right-step then left-step so the walk cycle matches her facing.
// Up-left and up-right each use two run poses. Up-right is the up-left art mirrored.
export const wizardSprites: Record<Facing, DirectionSprites> = {
  up: wizardDirection("up", ["left", "right"]),
  down: wizardDirection("down", ["right", "left"]),
  left: wizardDirection("left", ["left", "right"]),
  right: wizardDirection("right", ["left", "right"]),
  "up-left": wizardDirection("up_left", ["left", "right"]),
  "up-right": wizardDirection("up_right", ["left", "right"]),
  "down-left": wizardDirection("down_left", ["left", "right"]),
  "down-right": wizardDirection("down_right", ["left", "right"]),
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
