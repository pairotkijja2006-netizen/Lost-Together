// Combat timings are in seconds. Distances are dungeon pixels.
export const combatConfig = {
  knight: {
    hearts: 5,
    // Body box used when a goblin slash connects. Offset from the feet.
    bodyWidth: 28,
    bodyHeight: 36,
    bodyOffsetX: -14,
    bodyOffsetY: -40,
  },
  // Cooldown is the minimum time between swing starts. The swing itself is shorter.
  knightSlash: {
    visualScale: 1.5,
    forwardOffset: 54,
    duration: 0.15,
    cooldown: 0.7,
    activeStart: 0.02,
    activeEnd: 0.13,
    hitWidth: 48,
    hitHeight: 34,
    // Torso height above the feet. The arc is then pushed forward from here.
    originOffsetY: -30,
  },
  goblin: {
    maxHealth: 3,
    moveSpeed: 78,
    attackRange: 56,
    bodyWidth: 30,
    bodyHeight: 40,
    bodyOffsetX: -15,
    bodyOffsetY: -44,
    // Feet sit near the bottom of the 128px frame.
    footAnchorX: 64,
    footAnchorY: 121,
    // The goblin art is taller than the knight's. 0.58 draws it just under the knight's height.
    scale: 0.58,
    // Circle around the feet used so goblins cannot occupy the same space.
    bodyRadius: 9,
  },
  goblinSlash: {
    visualScale: 0.8,
    forwardOffset: 36,
    duration: 0.13,
    activeStart: 0.04,
    activeEnd: 0.16,
    hitWidth: 32,
    hitHeight: 22,
    originOffsetY: -30,
  },
  // attackCooldown is the gap between the starts of two swings.
  // Windup, the swing, and recovery all happen inside that window.
  goblinCombat: {
    attackCooldown: 0.8,
    attackWindup: 0.3,
    attackDuration: 0.2,
    attackRecovery: 0.15,
  },
  wizard: {
    maxHealth: 5,
    movementSpeed: 140,
    fireball: {
      cooldown: 1,
      speed: 450,
      maxRange: 350,
      // The blast is the only damage. A direct hit is not counted a second time.
      directDamage: 0,
      splashDamage: 1,
      explosionRadius: 65,
      explosionDuration: 0.25,
      // How far in front of the feet the projectile appears.
      muzzle: 22,
      originOffsetY: -28,
      visualRadius: 6,
      // Drawn size in world pixels. The art faces right; pivot sits on the bright core.
      visualWidth: 48,
      pivotX: 0.791,
      pivotY: 0.478,
      // Distance traveled, in pixels, before the fireball swaps to its other frame.
      frameLength: 28,
    },
  },
  damageFeedback: {
    goblin: {
      redFlashDuration: 0.2,
      hitstunDuration: 0,
      interruptAttackOnHit: true,
    },
    knight: {
      redFlashDuration: 0.2,
      hitstunDuration: 0,
      interruptAttackOnHit: false,
      invincibilityDuration: 0.7,
    },
  },
};

const combatRoot = "/combat";

export const combatSpriteUrls = [
  `${combatRoot}/slash_left_1.png`,
  `${combatRoot}/slash_left_2.png`,
  `${combatRoot}/slash_left_3.png`,
  `${combatRoot}/slash_right_1.png`,
  `${combatRoot}/slash_right_2.png`,
  `${combatRoot}/slash_right_3.png`,
  `${combatRoot}/goblin_left_idle.png`,
  `${combatRoot}/goblin_left_run_1.png`,
  `${combatRoot}/goblin_left_run_2.png`,
  `${combatRoot}/goblin_left_run_3.png`,
  `${combatRoot}/goblin_right_idle.png`,
  `${combatRoot}/goblin_right_run_1.png`,
  `${combatRoot}/goblin_right_run_2.png`,
  `${combatRoot}/goblin_right_run_3.png`,
  `${combatRoot}/fireball_1.png`,
  `${combatRoot}/fireball_2.png`,
];
