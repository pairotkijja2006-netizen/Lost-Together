export type HallwaySheetConfig = {
  url: string;
  // horizontal: sheet rows run across the path. vertical: sheet columns run across.
  orientation: "horizontal" | "vertical";
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  // Wall/floor pattern across the path. Contiguous open cells are the walkway.
  solidAcross: boolean[];
};

// Horizontal hallways keep the full depth wall (2 tiles on the north side).
export const hallwaySheetHorizontal: HallwaySheetConfig = {
  url: "/hallways/corridor.png",
  orientation: "horizontal",
  columns: 6,
  rows: 6,
  cellWidth: 32,
  cellHeight: 32,
  solidAcross: [true, true, false, false, false, true],
};

// Vertical hallways use the authored upright strip: wall, 3 floors, wall.
export const hallwaySheetVertical: HallwaySheetConfig = {
  url: "/hallways/corridor_vertical.png",
  orientation: "vertical",
  columns: 5,
  rows: 8,
  cellWidth: 32,
  cellHeight: 32,
  solidAcross: [true, false, false, false, true],
};

/** @deprecated Prefer hallwaySheetFor(). */
export const hallwaySheet = hallwaySheetHorizontal;

export function hallwaySheetFor(horizontal: boolean): HallwaySheetConfig {
  return horizontal ? hallwaySheetHorizontal : hallwaySheetVertical;
}
