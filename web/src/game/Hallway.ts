import { gameConfig } from "../config/gameConfig";
import {
  hallwaySheetFor,
  hallwaySheetHorizontal,
  hallwaySheetVertical,
  type HallwaySheetConfig,
} from "../config/dungeonConfig";
import { East, North, South, West, type GeneratedCorridor } from "./DungeonGenerator";

export type Rotation = 0 | 90;

export interface PlacedHallway {
  // Top-left of the hallway including both walls, in world pixels.
  x: number;
  y: number;
  // 0 = east-west (depth sheet). 90 = north-south (upright vertical sheet).
  rotation: Rotation;
  reverseAlong: boolean;
  lengthTiles: number;
  columnOffset: number;
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
}

export interface HallwayCell {
  x: number;
  y: number;
  // Source tile on the sheet. For horizontal sheets this is the along-axis column.
  // For vertical sheets this is the along-axis row.
  alongIndex: number;
  acrossIndex: number;
  rotation: Rotation;
  solid: boolean;
}

interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

function validateSheet(sheet: HallwaySheetConfig, label: string): void {
  const across = sheet.solidAcross;
  const open = across.filter((solid) => !solid).length;
  const expectedDoor = open * gameConfig.tileSize;
  const door =
    sheet.orientation === "horizontal" ? gameConfig.doorWidth : gameConfig.verticalDoorWidth;
  if (expectedDoor !== door) {
    throw new Error(`${label} floor is ${open} tile(s), but doorways are ${door}px wide.`);
  }
  const firstFloor = across.findIndex((solid) => !solid);
  const lastFloor = across.length - 1 - [...across].reverse().findIndex((solid) => !solid);
  if (firstFloor < 0 || across.slice(firstFloor, lastFloor + 1).some((solid) => solid)) {
    throw new Error(`${label} floor cells must be contiguous between the walls.`);
  }
  if (firstFloor === 0 || lastFloor === across.length - 1) {
    throw new Error(`${label} walls must frame the floor on both sides.`);
  }
}

export function validateHallwaySheet(): void {
  validateSheet(hallwaySheetHorizontal, "Horizontal hallway");
  validateSheet(hallwaySheetVertical, "Vertical hallway");
}

export function wallPadding(sheet: HallwaySheetConfig): { start: number; end: number } {
  const across = sheet.solidAcross;
  let start = 0;
  while (start < across.length && across[start]) {
    start += 1;
  }
  let end = 0;
  while (end < across.length - start && across[across.length - 1 - end]) {
    end += 1;
  }
  return { start, end };
}

function sheetForHallway(hallway: PlacedHallway): HallwaySheetConfig {
  return hallwaySheetFor(hallway.rotation === 0);
}

export function hallwayBounds(hallway: PlacedHallway): Footprint {
  const tile = gameConfig.tileSize;
  const sheet = sheetForHallway(hallway);
  const across = sheet.solidAcross.length * tile;
  const along = hallway.lengthTiles * tile;
  const horizontal = hallway.rotation === 0;
  return {
    x: hallway.x,
    y: hallway.y,
    width: horizontal ? along : across,
    height: horizontal ? across : along,
  };
}

export function corridorFootprint(corridor: GeneratedCorridor): Footprint {
  const tile = gameConfig.tileSize;
  const horizontal = corridor.direction === East || corridor.direction === West;
  const sheet = hallwaySheetFor(horizontal);
  const { start, end } = wallPadding(sheet);
  if (horizontal) {
    return {
      x: corridor.x,
      y: corridor.y - start * tile,
      width: corridor.width,
      height: corridor.height + (start + end) * tile,
    };
  }
  return {
    x: corridor.x - start * tile,
    y: corridor.y,
    width: corridor.width + (start + end) * tile,
    height: corridor.height,
  };
}

export function placeHallway(corridor: GeneratedCorridor): PlacedHallway {
  const tile = gameConfig.tileSize;
  const footprint = corridorFootprint(corridor);
  const horizontal = corridor.direction === East || corridor.direction === West;
  const sheet = hallwaySheetFor(horizontal);
  const span = horizontal ? corridor.width : corridor.height;
  const tiles = span / tile;
  if (Math.abs(tiles - Math.round(tiles)) > 0.001) {
    throw new Error("A hallway length is not a whole number of tiles.");
  }
  const midX = corridor.x + corridor.width / 2;
  const midY = corridor.y + corridor.height / 2;
  const alongCount = sheet.orientation === "horizontal" ? sheet.columns : sheet.rows;
  return {
    x: footprint.x,
    y: footprint.y,
    rotation: horizontal ? 0 : 90,
    reverseAlong: corridor.direction === West || corridor.direction === North,
    lengthTiles: Math.round(tiles),
    columnOffset: Math.abs(corridor.x * 3 + corridor.y) % alongCount,
    entrance: endPoint(corridor, true, midX, midY),
    exit: endPoint(corridor, false, midX, midY),
  };
}

export function hallwayCells(hallway: PlacedHallway): HallwayCell[] {
  const sheet = sheetForHallway(hallway);
  const across = sheet.solidAcross.length;
  const alongCount = sheet.orientation === "horizontal" ? sheet.columns : sheet.rows;
  const cells: HallwayCell[] = [];
  for (let along = 0; along < hallway.lengthTiles; along++) {
    for (let acrossIndex = 0; acrossIndex < across; acrossIndex++) {
      const placed = placeCell(hallway, along, acrossIndex);
      const alongSource = hallway.reverseAlong ? hallway.lengthTiles - 1 - along : along;
      cells.push({
        x: placed.x,
        y: placed.y,
        alongIndex: (alongSource + hallway.columnOffset) % alongCount,
        acrossIndex,
        rotation: hallway.rotation,
        solid: sheet.solidAcross[acrossIndex],
      });
    }
  }
  return cells;
}

export class HallwayTiles {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private horizontalSheet: HTMLImageElement,
    private verticalSheet: HTMLImageElement,
  ) {
    assertSheet(horizontalSheet, hallwaySheetHorizontal);
    assertSheet(verticalSheet, hallwaySheetVertical);
  }

  draw(context: CanvasRenderingContext2D, hallway: PlacedHallway): void {
    for (const cell of hallwayCells(hallway)) {
      context.drawImage(this.tile(hallway, cell), cell.x, cell.y);
    }
  }

  private tile(hallway: PlacedHallway, cell: HallwayCell): HTMLCanvasElement {
    const sheet = sheetForHallway(hallway);
    const image = hallway.rotation === 0 ? this.horizontalSheet : this.verticalSheet;
    const key = `${hallway.rotation}:${cell.alongIndex}:${cell.acrossIndex}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const size = gameConfig.tileSize;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare a hallway tile.");
    }
    context.imageSmoothingEnabled = false;
    const sx =
      sheet.orientation === "horizontal"
        ? cell.alongIndex * sheet.cellWidth
        : cell.acrossIndex * sheet.cellWidth;
    const sy =
      sheet.orientation === "horizontal"
        ? cell.acrossIndex * sheet.cellHeight
        : cell.alongIndex * sheet.cellHeight;
    // Horizontal depth sheet is authored left-to-right; rotate for north-south only when
    // using that sheet. The vertical sheet is already upright.
    if (sheet.orientation === "horizontal" && hallway.rotation === 90) {
      context.translate(size / 2, size / 2);
      context.rotate(Math.PI / 2);
      context.drawImage(
        image,
        sx,
        sy,
        sheet.cellWidth,
        sheet.cellHeight,
        -size / 2,
        -size / 2,
        size,
        size,
      );
    } else {
      context.drawImage(image, sx, sy, sheet.cellWidth, sheet.cellHeight, 0, 0, size, size);
    }
    this.cache.set(key, canvas);
    return canvas;
  }
}

function assertSheet(image: HTMLImageElement, sheet: HallwaySheetConfig): void {
  const expectedWidth = sheet.columns * sheet.cellWidth;
  const expectedHeight = sheet.rows * sheet.cellHeight;
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new Error(
      `${sheet.url} is ${image.width}x${image.height}, expected ${expectedWidth}x${expectedHeight}.`,
    );
  }
}

function endPoint(
  corridor: GeneratedCorridor,
  atParent: boolean,
  midX: number,
  midY: number,
): { x: number; y: number } {
  if (corridor.direction === East) {
    return { x: atParent ? corridor.x : corridor.x + corridor.width, y: midY };
  }
  if (corridor.direction === West) {
    return { x: atParent ? corridor.x + corridor.width : corridor.x, y: midY };
  }
  if (corridor.direction === South) {
    return { x: midX, y: atParent ? corridor.y : corridor.y + corridor.height };
  }
  return { x: midX, y: atParent ? corridor.y + corridor.height : corridor.y };
}

function placeCell(
  hallway: PlacedHallway,
  along: number,
  acrossIndex: number,
): { x: number; y: number } {
  const tile = gameConfig.tileSize;
  if (hallway.rotation === 0) {
    return { x: hallway.x + along * tile, y: hallway.y + acrossIndex * tile };
  }
  return { x: hallway.x + acrossIndex * tile, y: hallway.y + along * tile };
}
