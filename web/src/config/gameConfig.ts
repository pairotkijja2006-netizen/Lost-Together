// Tunable gameplay values. Distances are in dungeon pixels (1 tile = 32px).
export const gameConfig = {
  // Pixels per second. Diagonal movement uses the same speed.
  moveSpeed: 140,
  // Running animation playback rate. This does not affect movement speed.
  animationFps: 10,
  tileSize: 32,

  // Measured from the room PNGs. Clear walls average about 35–89 red.
  // Clear floors average about 100–129 red. Values in between are usually
  // floor scuffs or wall trim; solidFromArtwork resolves those by neighbors.
  wallRedMax: 90,
  floorRedMin: 100,

  // Same shape as Dungeon::generate(3): start, two enemy rooms, side rooms, final room.
  mainPathSteps: 3,
  // Length of each hallway, in pixels. 128 is one segment; 384 is three segments end to end.
  corridorGap: 384,
  // Door openings and corridor floors are 3 tiles for every direction.
  doorWidth: 96,
  verticalDoorWidth: 96,

  sprite: {
    frameSize: 128,
    // Every supplied frame places the feet near this pixel.
    footAnchorX: 64,
    footAnchorY: 115,
    // 1 draws the knight at the frame's full 128px. Lower values draw a smaller character.
    scale: 0.7,
  },

  // Small box at the feet. The rest of the sprite may overlap a wall visually.
  hitbox: {
    width: 28,
    height: 14,
    // Offset from the foot anchor to the hitbox's top-left.
    offsetX: -14,
    offsetY: -14,
  },
};

// Hitbox at the feet, shrunk by the same amount as the drawn sprite.
export function scaledHitbox(): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  const scale = gameConfig.sprite.scale;
  const box = gameConfig.hitbox;
  return {
    width: box.width * scale,
    height: box.height * scale,
    offsetX: box.offsetX * scale,
    offsetY: box.offsetY * scale,
  };
}
