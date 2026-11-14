// Supplied corridor artwork, cropped to its tile grid and served from /hallways.
// The sheet is 11 columns by 5 rows. It is a horizontal hallway:
// row 0 is the upper wall (light edge faces up, away from the floor),
// rows 1–3 are floor, and row 4 is the lower wall (light edge faces down).
// Tiles are sampled with nearest-neighbor onto the 32px dungeon grid.
// Replace the PNG in assets/hallways/corridor.png and update these sizes if the sheet changes.
export const hallwaySheet = {
  url: "/hallways/corridor.png",
  columns: 11,
  rows: 5,
  cellWidth: 79,
  cellHeight: 73,
  // One entry per row, top to bottom. true means that row is a wall.
  // The open rows must stay contiguous so the floor lines up with a doorway.
  solidRows: [true, false, false, false, true],
};
