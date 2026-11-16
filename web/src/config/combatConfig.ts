import { knightSlashUrls } from "../game/Slash";

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
    // Center of the slash image, in front of the torso. Diagonal frames already sit out in their corner.
    forwardOffset: 46,
    diagonalForwardOffset: 18,
    // The new frames are 144px and already fill the swing, so they are not stretched.
    visualScale: 0.98,
    acrossScale: 1,
    damage: 1,
    // Straight up or down uses the vertical slash. Those swings crit 30% of the time, for 50% more damage.
    critChance: 0.3,
    critDamage: 1.5,
    duration: 0.14,
    cooldown: 1,
    activeStart: 0.02,
    activeEnd: 0.13,
    hitWidth: 200,
    hitHeight: 200,
    // Center of the hit box, farther forward than the chord so the wide tips are covered
    // and the near edge stays in front of the knight.
    hitForwardOffset: 136,
    // Torso height above the feet. The slash is measured forward from here.
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
    // Feet after the new frames were shifted onto a shared 128px canvas.
    footAnchorX: 64,
    footAnchorY: 123,
    spriteRendering: {
      anchorX: 0.5,
      anchorY: 123 / 128,
      offsetX: 0,
      offsetY: 0,
      scale: 0.58,
    },
    // Draws the goblin just under the knight's height.
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
  enemyRoomConfig: {
    meleeGoblinCount: 3,
    archerGoblinCount: 1,
  },
  archer: {
    maxHealth: 1,
    movementSpeed: 70,
    preferredDistance: 220,
    retreatDistance: 140,
    detectionRange: 450,
    bodyWidth: 28,
    bodyHeight: 36,
    bodyOffsetX: -14,
    bodyOffsetY: -40,
    footAnchorX: 64,
    footAnchorY: 118,
    scale: 0.7,
    bodyRadius: 13,
    hitstunDuration: 0.3,
    redFlashDuration: 0.2,
    fadeDuration: 0.3,
    // Where the arrow leaves the bow, in front of the facing and above the feet.
    muzzleForward: 22,
    muzzleUp: 34,
  },
  // shotInterval is the time from one release to the next.
  // Draw, release, and recovery add up to that interval, so they are not stacked on top of it.
  archerAttack: {
    drawDuration: 0.7,
    releaseDuration: 0.1,
    recoveryDuration: 0.2,
    shotInterval: 1.5,
    damage: 1,
  },
  archerArrow: {
    speed: 320,
    damage: 1,
    maxRange: 650,
    visualWidth: 42,
    pivotX: 0.5,
    pivotY: 0.5,
    // The arrowhead tip is on the left end of archer_arrow.png (-X, angle PI), with feathers on the right.
    spriteForwardAngle: Math.PI,
    hitSize: 8,
  },
  wizard: {
    maxHealth: 3,
    movementSpeed: 140,
    fireball: {
      cooldown: 2,
      speed: 450,
      maxRange: 350,
      // The blast is the only damage. A direct hit is not counted a second time.
      directDamage: 0,
      splashDamage: 1,
      explosionRadius: 55,
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
  `${combatRoot}/archer_left_idle.png`,
  `${combatRoot}/archer_left_walk_1.png`,
  `${combatRoot}/archer_left_walk_2.png`,
  `${combatRoot}/archer_left_walk_3.png`,
  `${combatRoot}/archer_right_idle.png`,
  `${combatRoot}/archer_right_walk_1.png`,
  `${combatRoot}/archer_right_walk_2.png`,
  `${combatRoot}/archer_right_walk_3.png`,
  `${combatRoot}/archer_left_draw_1.png`,
  `${combatRoot}/archer_left_draw_2.png`,
  `${combatRoot}/archer_left_draw_3.png`,
  `${combatRoot}/archer_left_draw_4.png`,
  `${combatRoot}/archer_right_draw_1.png`,
  `${combatRoot}/archer_right_draw_2.png`,
  `${combatRoot}/archer_right_draw_3.png`,
  `${combatRoot}/archer_right_draw_4.png`,
  `${combatRoot}/archer_arrow.png`,
  ...knightSlashUrls,
];
