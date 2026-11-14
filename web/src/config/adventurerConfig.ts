import { combatConfig } from "./combatConfig";
import { gameConfig } from "./gameConfig";

export type AdventurerClass = "knight" | "wizard";

export interface AdventurerStats {
  label: string;
  description: string;
  attackType: string;
  cooldown: number;
  maxHealth: number;
  movementSpeed: number;
  scale: number;
  footAnchorX: number;
  footAnchorY: number;
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
    scale: gameConfig.sprite.scale,
    footAnchorX: gameConfig.sprite.footAnchorX,
    footAnchorY: gameConfig.sprite.footAnchorY,
    bodyRadius: 10,
    preview: "/characters/knight_down_idle.png",
  },
  wizard: {
    label: "Wizard",
    description: "A ranged spellcaster who launches fireballs that explode and damage nearby enemies.",
    attackType: "Ranged / Area Damage",
    cooldown: combatConfig.wizard.fireball.cooldown,
    maxHealth: combatConfig.wizard.maxHealth,
    movementSpeed: combatConfig.wizard.movementSpeed,
    // The wizard art is taller in the frame than the knight, so a slightly lower scale matches their height.
    scale: 0.62,
    footAnchorX: 64,
    footAnchorY: 121,
    bodyRadius: 10,
    preview: "/characters/wizard_down_idle.png",
  },
};
