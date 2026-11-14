import { gameConfig } from "../config/gameConfig";
import {
  generateDungeon,
  type GeneratedCorridor,
  type GeneratedRoom,
} from "./DungeonGenerator";

export interface DrawnRoom {
  image: HTMLImageElement;
  x: number;
  y: number;
}

export class DungeonMap {
  readonly rooms: DrawnRoom[];
  readonly corridors: GeneratedCorridor[];
  readonly solid: boolean[][];
  readonly tileSize: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly seed: number;
  private readonly spawnPoint: { x: number; y: number };

  private constructor(
    rooms: DrawnRoom[],
    corridors: GeneratedCorridor[],
    solid: boolean[][],
    tileSize: number,
    seed: number,
    spawn: { x: number; y: number },
  ) {
    this.rooms = rooms;
    this.corridors = corridors;
    this.solid = solid;
    this.tileSize = tileSize;
    this.tilesX = solid[0]?.length ?? 0;
    this.tilesY = solid.length;
    this.seed = seed;
    this.spawnPoint = spawn;
  }

  get width(): number {
    return this.tilesX * this.tileSize;
  }

  get height(): number {
    return this.tilesY * this.tileSize;
  }

  isSolidTile(tx: number, ty: number): boolean {
    if (ty < 0 || tx < 0 || ty >= this.tilesY || tx >= this.tilesX) {
      return true;
    }
    return this.solid[ty][tx];
  }

  // True when the rectangle touches a wall tile or leaves the dungeon image.
  overlapsSolid(x: number, y: number, width: number, height: number): boolean {
    if (width <= 0 || height <= 0) {
      return false;
    }
    const tile = this.tileSize;
    const x0 = Math.floor(x / tile);
    const y0 = Math.floor(y / tile);
    const x1 = Math.floor((x + width - 0.001) / tile);
    const y1 = Math.floor((y + height - 0.001) / tile);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidTile(tx, ty)) {
          return true;
        }
      }
    }
    return false;
  }

  static async load(): Promise<DungeonMap> {
    const dungeon = generateDungeon();
    const tileSize = gameConfig.tileSize;
    const images = new Map<string, HTMLImageElement>();
    for (const room of dungeon.rooms) {
      if (!images.has(room.imageUrl)) {
        images.set(room.imageUrl, await loadImage(room.imageUrl));
      }
    }

    let maxX = 0;
    let maxY = 0;
    for (const room of dungeon.rooms) {
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    }
    for (const corridor of dungeon.corridors) {
      maxX = Math.max(maxX, corridor.x + corridor.width);
      maxY = Math.max(maxY, corridor.y + corridor.height);
    }
    const tilesX = Math.round(maxX / tileSize);
    const tilesY = Math.round(maxY / tileSize);
    const solid = Array.from({ length: tilesY }, () => Array<boolean>(tilesX).fill(true));

    const drawn: DrawnRoom[] = [];
    for (const room of dungeon.rooms) {
      const image = images.get(room.imageUrl);
      if (!image) {
        throw new Error(`Missing ${room.imageUrl}`);
      }
      if (image.width !== room.width || image.height !== room.height) {
        throw new Error(`${room.imageUrl} is ${image.width}x${image.height}, expected ${room.width}x${room.height}.`);
      }
      stampRoom(solid, room, tilesForImage(image, tileSize), tileSize);
      drawn.push({ image, x: room.x, y: room.y });
    }
    for (const corridor of dungeon.corridors) {
      stampWalkable(solid, corridor, tileSize);
    }

    return new DungeonMap(drawn, dungeon.corridors, solid, tileSize, dungeon.seed, dungeon.spawn);
  }

  findSpawn(): { x: number; y: number } {
    const { x, y } = this.spawnPoint;
    const box = gameConfig.hitbox;
    if (!this.overlapsSolid(x + box.offsetX, y + box.offsetY, box.width, box.height)) {
      return { x, y };
    }
    throw new Error("The starting room spawn is blocked.");
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

function tilesForImage(image: HTMLImageElement, tileSize: number): boolean[][] {
  return solidFromArtwork(image, tileSize);
}

function stampRoom(solid: boolean[][], room: GeneratedRoom, tiles: boolean[][], tileSize: number): void {
  const originX = Math.round(room.x / tileSize);
  const originY = Math.round(room.y / tileSize);
  for (let ty = 0; ty < tiles.length; ty++) {
    for (let tx = 0; tx < tiles[ty].length; tx++) {
      solid[originY + ty][originX + tx] = tiles[ty][tx];
    }
  }
}

function stampWalkable(solid: boolean[][], corridor: GeneratedCorridor, tileSize: number): void {
  const x0 = Math.round(corridor.x / tileSize);
  const y0 = Math.round(corridor.y / tileSize);
  const x1 = Math.round((corridor.x + corridor.width) / tileSize);
  const y1 = Math.round((corridor.y + corridor.height) / tileSize);
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      solid[ty][tx] = false;
    }
  }
}

function solidFromArtwork(image: HTMLImageElement, tileSize: number): boolean[][] {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not read the dungeon image.");
  }
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const tilesX = image.width / tileSize;
  const tilesY = image.height / tileSize;
  const solid: boolean[][] = [];
  const ambiguous: string[] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    const row: boolean[] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const red = averageRed(pixels, image.width, tx, ty, tileSize);
      if (red < gameConfig.wallRedMax) {
        row.push(true);
      } else if (red >= gameConfig.floorRedMin) {
        row.push(false);
      } else {
        ambiguous.push(`${tx},${ty} (red ${red.toFixed(1)})`);
        row.push(true);
      }
    }
    solid.push(row);
  }

  if (ambiguous.length > 0) {
    throw new Error(
      `Could not tell wall from floor on ${ambiguous.length} tile(s): ${ambiguous.slice(0, 6).join(", ")}.`,
    );
  }
  return solid;
}

function averageRed(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  tx: number,
  ty: number,
  tileSize: number,
): number {
  const inset = 6;
  let total = 0;
  let count = 0;
  const x0 = tx * tileSize + inset;
  const y0 = ty * tileSize + inset;
  const x1 = (tx + 1) * tileSize - inset;
  const y1 = (ty + 1) * tileSize - inset;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * imageWidth + x) * 4;
      if (pixels[index + 3] < 32) {
        continue;
      }
      total += pixels[index];
      count++;
    }
  }
  return count === 0 ? 0 : total / count;
}
