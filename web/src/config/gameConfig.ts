// Tunable gameplay values. Distances are in dungeon pixels (1 tile = 32px).
export const gameConfig = {
  // Pixels per second. Diagonal movement uses the same speed.
  moveSpeed: 140,
  // Running animation playback rate. This does not affect movement speed.
  animationFps: 10,
  tileSize: 32,

  // Measured from the room PNGs. Wall tiles average about 77–85 red.
  // Floor and doorway tiles average about 101–143 red. Values in between
  // are treated as unknown and refuse to generate a collision map.
  wallRedMax: 90,
  floorRedMin: 100,

  // Same shape as Dungeon::generate(3): start, two enemy rooms, side rooms, final room.
  mainPathSteps: 3,
  corridorGap: 128,
  doorWidth: 96,
  corridorColor: "rgb(126, 163, 171)",

  sprite: {
    frameSize: 128,
    // Every supplied frame places the feet near this pixel.
    footAnchorX: 64,
    footAnchorY: 115,
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
