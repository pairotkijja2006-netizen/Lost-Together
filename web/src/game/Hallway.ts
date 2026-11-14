import { gameConfig } from "../config/gameConfig";
import { hallwaySheet } from "../config/dungeonConfig";
import { East, North, South, West, type GeneratedCorridor } from "./DungeonGenerator";

export type Rotation = 0 | 90 | 180 | 270;

export interface PlacedHallway {
  // Top-left of the hallway including both walls, in world pixels.
  x: number;
  y: number;
  rotation: Rotation;
  lengthTiles: number;
  columnOffset: number;
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
}

export interface HallwayCell {
  x: number;
  y: number;
  column: number;
  row: number;
  rotation: Rotation;
  solid: boolean;
}

interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validateHallwaySheet(): void {
  const rows = hallwaySheet.solidRows;
  const open = rows.filter((solid) => !solid).length;
  if (open * gameConfig.tileSize !== gameConfig.doorWidth) {
    throw new Error(
      `Hallway floor is ${open} tile(s), but doorways are ${gameConfig.doorWidth}px wide.`,
    );
  }
  if (!rows[0] || !rows[rows.length - 1] || rows.slice(1, -1).some((solid) => solid)) {
    throw new Error("Hallway walls must be the outer rows, with floor rows between them.");
  }
}

export function hallwayBounds(hallway: PlacedHallway): Footprint {
  const tile = gameConfig.tileSize;
  const across = hallwaySheet.solidRows.length * tile;
  const along = hallway.lengthTiles * tile;
  const horizontal = hallway.rotation === 0 || hallway.rotation === 180;
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
  if (horizontal) {
    return {
      x: corridor.x,
      y: corridor.y - tile,
      width: corridor.width,
      height: corridor.height + tile * 2,
    };
  }
  return {
    x: corridor.x - tile,
    y: corridor.y,
    width: corridor.width + tile * 2,
    height: corridor.height,
  };
}

export function placeHallway(corridor: GeneratedCorridor): PlacedHallway {
  const tile = gameConfig.tileSize;
  const footprint = corridorFootprint(corridor);
  const horizontal = corridor.direction === East || corridor.direction === West;
  const span = horizontal ? corridor.width : corridor.height;
  const tiles = span / tile;
  if (Math.abs(tiles - Math.round(tiles)) > 0.001) {
    throw new Error("A hallway length is not a whole number of tiles.");
  }
  const midX = corridor.x + corridor.width / 2;
  const midY = corridor.y + corridor.height / 2;
  const entrance = endPoint(corridor, true, midX, midY);
  const exit = endPoint(corridor, false, midX, midY);
  return {
    x: footprint.x,
    y: footprint.y,
    rotation: rotationFor(corridor.direction),
    lengthTiles: Math.round(tiles),
    columnOffset: Math.abs(corridor.x * 3 + corridor.y) % hallwaySheet.columns,
    entrance,
    exit,
  };
}

// Same cells used for drawing and for collision, so a rotation moves both.
export function hallwayCells(hallway: PlacedHallway): HallwayCell[] {
  const across = hallwaySheet.solidRows.length;
  const cells: HallwayCell[] = [];
  for (let along = 0; along < hallway.lengthTiles; along++) {
    for (let row = 0; row < across; row++) {
      const placed = placeCell(hallway, along, row, across);
      cells.push({
        x: placed.x,
        y: placed.y,
        column: (along + hallway.columnOffset) % hallwaySheet.columns,
        row,
        rotation: hallway.rotation,
        solid: hallwaySheet.solidRows[row],
      });
    }
  }
  return cells;
}

export class HallwayTiles {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private sheet: HTMLImageElement) {
    const expectedWidth = hallwaySheet.columns * hallwaySheet.cellWidth;
    const expectedHeight = hallwaySheet.rows * hallwaySheet.cellHeight;
    if (sheet.width !== expectedWidth || sheet.height !== expectedHeight) {
      throw new Error(
        `${hallwaySheet.url} is ${sheet.width}x${sheet.height}, expected ${expectedWidth}x${expectedHeight}.`,
      );
    }
  }

  draw(context: CanvasRenderingContext2D, hallway: PlacedHallway): void {
    for (const cell of hallwayCells(hallway)) {
      context.drawImage(this.tile(cell.column, cell.row, cell.rotation), cell.x, cell.y);
    }
  }

  private tile(column: number, row: number, rotation: Rotation): HTMLCanvasElement {
    const key = `${column}:${row}:${rotation}`;
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
    context.translate(size / 2, size / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(
      this.sheet,
      column * hallwaySheet.cellWidth,
      row * hallwaySheet.cellHeight,
      hallwaySheet.cellWidth,
      hallwaySheet.cellHeight,
      -size / 2,
      -size / 2,
      size,
      size,
    );
    this.cache.set(key, canvas);
    return canvas;
  }
}

function rotationFor(direction: number): Rotation {
  if (direction === East) return 0;
  if (direction === South) return 90;
  if (direction === West) return 180;
  if (direction === North) return 270;
  throw new Error(`Unknown hallway direction ${direction}.`);
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
  row: number,
  across: number,
): { x: number; y: number } {
  const tile = gameConfig.tileSize;
  const lastAcross = across - 1;
  const lastAlong = hallway.lengthTiles - 1;
  if (hallway.rotation === 0) {
    return { x: hallway.x + along * tile, y: hallway.y + row * tile };
  }
  if (hallway.rotation === 90) {
    return { x: hallway.x + (lastAcross - row) * tile, y: hallway.y + along * tile };
  }
  if (hallway.rotation === 180) {
    return { x: hallway.x + (lastAlong - along) * tile, y: hallway.y + (lastAcross - row) * tile };
  }
  return { x: hallway.x + row * tile, y: hallway.y + (lastAlong - along) * tile };
}
