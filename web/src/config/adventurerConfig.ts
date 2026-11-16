import { combatConfig } from "./combatConfig";
import { gameConfig } from "./gameConfig";

export type AdventurerClass = "knight" | "wizard";

export interface SpriteRendering {
  anchorX: number;
  anchorY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface AdventurerStats {
  label: string;
  description: string;
  attackType: string;
  cooldown: number;
  maxHealth: number;
  movementSpeed: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
  footAnchorX: number;
  footAnchorY: number;
  spriteRendering: SpriteRendering;
  bodyRadius: number;
  preview: string;
}

// Shared presentation and movement numbers. Attack details stay in combatConfig.
export const adventurerConfig: Record<AdventurerClass, AdventurerStats> = {
  knight: {
    label: "Knight",
    description: "An agile melee fighter who defeats enemies with powerful sword slashes.",
    attackType: "Melee",
    cooldown: combatConfig.knightSlash.cooldown,
    maxHealth: combatConfig.knight.hearts,
    movementSpeed: gameConfig.moveSpeed,
    // Collision size stays put. The drawn frames are 181px, so the picture scale is separate.
    scale: gameConfig.sprite.scale,
    frameWidth: 181,
    frameHeight: 181,
    footAnchorX: 90,
    footAnchorY: 180,
    spriteRendering: {
      anchorX: 90 / 181,
      anchorY: 180 / 181,
      offsetX: 0,
      offsetY: 0,
      scale: 0.48,
    },
    bodyRadius: 10,
    preview: "/characters/knight_down_idle_1.png",
  },
  wizard: {
    label: "Wizard",
    description: "A ranged spellcaster who launches fireballs that explode and damage nearby enemies.",
    attackType: "Ranged / Area Damage",
    cooldown: combatConfig.wizard.fireball.cooldown,
    maxHealth: combatConfig.wizard.maxHealth,
    movementSpeed: combatConfig.wizard.movementSpeed,
    // Collision size stays at 0.42. The drawn frames share one 109px canvas and one foot.
    scale: 0.42,
    frameWidth: 109,
    frameHeight: 109,
    footAnchorX: 53,
    footAnchorY: 105,
    spriteRendering: {
      anchorX: 53 / 109,
      anchorY: 105 / 109,
      offsetX: 0,
      offsetY: 0,
      scale: 0.75,
    },
    bodyRadius: 10,
    preview: "/characters/wizard_down_idle_1.png",
  },
};
