import { gameConfig, scaledHitbox } from "../config/gameConfig";
import { hallwaySheetHorizontal, hallwaySheetVertical } from "../config/dungeonConfig";
import {
  East,
  generateDungeon,
  North,
  South,
  West,
  type GeneratedRoom,
} from "./DungeonGenerator";
import {
  corridorFootprint,
  hallwayCells,
  HallwayTiles,
  placeHallway,
  validateHallwaySheet,
  wallPadding,
  type PlacedHallway,
} from "./Hallway";

export const TileVoid = 0;
export const TileRoomWall = 1;
export const TileRoomFloor = 2;
export const TileHallWall = 3;
export const TileHallFloor = 4;

export interface DrawnRoom {
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  doors: number;
  type: string;
}

export interface Doorway {
  // Unit vector from this opening toward the room interior.
  inwardX: number;
  inwardY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class DungeonMap {
  readonly rooms: DrawnRoom[];
  readonly hallways: PlacedHallway[];
  readonly hallwayTiles: HallwayTiles;
  readonly kind: number[][];
  readonly tileSize: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly seed: number;
  private readonly spawnPoint: { x: number; y: number };
  private readonly lockedRooms = new Set<number>();
  private readonly doorKinds = new Map<string, number>();

  private constructor(
    rooms: DrawnRoom[],
    hallways: PlacedHallway[],
    hallwayTiles: HallwayTiles,
    kind: number[][],
    tileSize: number,
    seed: number,
    spawn: { x: number; y: number },
  ) {
    this.rooms = rooms;
    this.hallways = hallways;
    this.hallwayTiles = hallwayTiles;
    this.kind = kind;
    this.tileSize = tileSize;
    this.tilesX = kind[0]?.length ?? 0;
    this.tilesY = kind.length;
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
    const kind = this.kind[ty][tx];
    return kind === TileVoid || kind === TileRoomWall || kind === TileHallWall;
  }

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

  // Seals an enemy room's doorways until its goblins are gone, then opens them again.
  setRoomLocked(roomIndex: number, locked: boolean): void {
    const room = this.rooms[roomIndex];
    if (!room) {
      return;
    }
    const already = this.lockedRooms.has(roomIndex);
    if (locked === already) {
      return;
    }
    for (const cell of doorCells(room, this.tileSize)) {
      if (cell.ty < 0 || cell.tx < 0 || cell.ty >= this.tilesY || cell.tx >= this.tilesX) {
        continue;
      }
      const key = `${cell.tx},${cell.ty}`;
      if (locked) {
        this.doorKinds.set(key, this.kind[cell.ty][cell.tx]);
        this.kind[cell.ty][cell.tx] = TileRoomWall;
      } else {
        const previous = this.doorKinds.get(key);
        if (previous !== undefined) {
          this.kind[cell.ty][cell.tx] = previous;
          this.doorKinds.delete(key);
        }
      }
    }
    if (locked) {
      this.lockedRooms.add(roomIndex);
    } else {
      this.lockedRooms.delete(roomIndex);
    }
  }

  isRoomLocked(roomIndex: number): boolean {
    return this.lockedRooms.has(roomIndex);
  }

  // The three-tile opening on each side that has a door. East/west seals also
  // cover the horizontal hallway's depth wall so the closed door reaches its top.
  doorways(room: DrawnRoom): Doorway[] {
    const tile = this.tileSize;
    const originX = Math.round(room.x / tile);
    const originY = Math.round(room.y / tile);
    const tilesX = Math.round(room.width / tile);
    const tilesY = Math.round(room.height / tile);
    const midX = Math.floor(tilesX / 2);
    const midY = Math.floor(tilesY / 2);
    const span = tile * 3;
    const depth = wallPadding(hallwaySheetHorizontal);
    const depthHeight = (depth.start + 3 + depth.end) * tile;
    const doors: Doorway[] = [];
    if (room.doors & North) {
      doors.push({
        inwardX: 0,
        inwardY: 1,
        x: (originX + midX - 1) * tile,
        y: originY * tile,
        width: span,
        height: tile,
      });
    }
    if (room.doors & South) {
      doors.push({
        inwardX: 0,
        inwardY: -1,
        x: (originX + midX - 1) * tile,
        y: (originY + tilesY - 1) * tile,
        width: span,
        height: tile,
      });
    }
    if (room.doors & East) {
      doors.push({
        inwardX: -1,
        inwardY: 0,
        // Cover the room edge and the first hallway column so the plug fills the mouth.
        x: (originX + tilesX - 1) * tile,
        y: (originY + midY - 1 - depth.start) * tile,
        width: tile * 2,
        height: depthHeight,
      });
    }
    if (room.doors & West) {
      doors.push({
        inwardX: 1,
        inwardY: 0,
        x: (originX - 1) * tile,
        y: (originY + midY - 1 - depth.start) * tile,
        width: tile * 2,
        height: depthHeight,
      });
    }
    return doors;
  }

  static async load(): Promise<DungeonMap> {
    validateHallwaySheet();
    const dungeon = generateDungeon();
    const tileSize = gameConfig.tileSize;
    const images = new Map<string, HTMLImageElement>();
    const urls = new Set(dungeon.rooms.map((room) => room.imageUrl));
    urls.add(hallwaySheetHorizontal.url);
    urls.add(hallwaySheetVertical.url);
    await Promise.all(
      [...urls].map(async (url) => {
        images.set(url, await loadImage(url));
      }),
    );

    // Wall tiles sit one tile outside the floor. Shift the dungeon so they stay on the grid.
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    const include = (x: number, y: number, width: number, height: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, y + height);
    };
    for (const room of dungeon.rooms) {
      include(room.x, room.y, room.width, room.height);
    }
    for (const corridor of dungeon.corridors) {
      const footprint = corridorFootprint(corridor);
      include(footprint.x, footprint.y, footprint.width, footprint.height);
    }
    const shiftX = -minX;
    const shiftY = -minY;
    for (const room of dungeon.rooms) {
      room.x += shiftX;
      room.y += shiftY;
    }
    for (const corridor of dungeon.corridors) {
      corridor.x += shiftX;
      corridor.y += shiftY;
    }
    dungeon.spawn.x += shiftX;
    dungeon.spawn.y += shiftY;

    const hallways = dungeon.corridors.map(placeHallway);
    const tilesX = Math.round((maxX - minX) / tileSize);
    const tilesY = Math.round((maxY - minY) / tileSize);
    const kind = Array.from({ length: tilesY }, () => Array<number>(tilesX).fill(TileVoid));

    const drawn: DrawnRoom[] = [];
    for (const room of dungeon.rooms) {
      const image = images.get(room.imageUrl);
      if (!image) {
        throw new Error(`Missing ${room.imageUrl}`);
      }
      if (image.width !== room.width || image.height !== room.height) {
        throw new Error(`${room.imageUrl} is ${image.width}x${image.height}, expected ${room.width}x${room.height}.`);
      }
      stampRoom(kind, room, solidFromArtwork(image, tileSize), tileSize);
      const drawnRoom: DrawnRoom = {
        image,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        doors: room.doors,
        type: room.type,
      };
      // Doorway art can sit just under the floor threshold; keep the three-tile
      // openings walkable so hallways connect seamlessly.
      for (const cell of doorCells(drawnRoom, tileSize)) {
        kind[cell.ty][cell.tx] = TileRoomFloor;
      }
      drawn.push(drawnRoom);
    }
    for (const hallway of hallways) {
      stampHallway(kind, hallway, tileSize);
    }

    const horizontalSheet = images.get(hallwaySheetHorizontal.url);
    const verticalSheet = images.get(hallwaySheetVertical.url);
    if (!horizontalSheet) {
      throw new Error(`Missing ${hallwaySheetHorizontal.url}`);
    }
    if (!verticalSheet) {
      throw new Error(`Missing ${hallwaySheetVertical.url}`);
    }
    return new DungeonMap(
      drawn,
      hallways,
      new HallwayTiles(horizontalSheet, verticalSheet),
      kind,
      tileSize,
      dungeon.seed,
      dungeon.spawn,
    );
  }

  findSpawn(): { x: number; y: number } {
    const { x, y } = this.spawnPoint;
    const box = scaledHitbox();
    if (!this.overlapsSolid(x + box.offsetX, y + box.offsetY, box.width, box.height)) {
      return { x, y };
    }
    throw new Error("The starting room spawn is blocked.");
  }
}

function doorCells(room: DrawnRoom, tileSize: number): { tx: number; ty: number }[] {
  const originX = Math.round(room.x / tileSize);
  const originY = Math.round(room.y / tileSize);
  const tilesX = Math.round(room.width / tileSize);
  const tilesY = Math.round(room.height / tileSize);
  const midX = Math.floor(tilesX / 2);
  const midY = Math.floor(tilesY / 2);
  const cells: { tx: number; ty: number }[] = [];
  const across = [-1, 0, 1];
  const depth = wallPadding(hallwaySheetHorizontal);
  if (room.doors & North) {
    for (const offset of across) cells.push({ tx: originX + midX + offset, ty: originY });
  }
  if (room.doors & South) {
    for (const offset of across) cells.push({ tx: originX + midX + offset, ty: originY + tilesY - 1 });
  }
  if (room.doors & East) {
    // Seal the floor opening plus the depth-wall rows so collision matches the tall door.
    for (let row = -depth.start; row <= 2 + depth.end; row++) {
      cells.push({ tx: originX + tilesX - 1, ty: originY + midY - 1 + row });
      cells.push({ tx: originX + tilesX, ty: originY + midY - 1 + row });
    }
  }
  if (room.doors & West) {
    for (let row = -depth.start; row <= 2 + depth.end; row++) {
      cells.push({ tx: originX, ty: originY + midY - 1 + row });
      cells.push({ tx: originX - 1, ty: originY + midY - 1 + row });
    }
  }
  return cells;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

function stampRoom(kind: number[][], room: GeneratedRoom, tiles: boolean[][], tileSize: number): void {
  const originX = Math.round(room.x / tileSize);
  const originY = Math.round(room.y / tileSize);
  for (let ty = 0; ty < tiles.length; ty++) {
    for (let tx = 0; tx < tiles[ty].length; tx++) {
      const gx = originX + tx;
      const gy = originY + ty;
      if (gy < 0 || gx < 0 || gy >= kind.length || gx >= kind[0].length) {
        throw new Error("A room tile falls outside the dungeon grid.");
      }
      kind[gy][gx] = tiles[ty][tx] ? TileRoomWall : TileRoomFloor;
    }
  }
}

function stampHallway(kind: number[][], hallway: PlacedHallway, tileSize: number): void {
  for (const cell of hallwayCells(hallway)) {
    const gx = Math.round(cell.x / tileSize);
    const gy = Math.round(cell.y / tileSize);
    if (gy < 0 || gx < 0 || gy >= kind.length || gx >= kind[0].length) {
      throw new Error("A hallway tile falls outside the dungeon grid.");
    }
    const existing = kind[gy][gx];
    // Room doorway floors stay open. A hallway wall never covers them.
    if (existing === TileRoomFloor || existing === TileRoomWall) {
      continue;
    }
    kind[gy][gx] = cell.solid ? TileHallWall : TileHallFloor;
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
  // 1 = wall, 0 = floor, -1 = unresolved scuff/trim.
  const kind: number[][] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const red = averageRed(pixels, image.width, tx, ty, tileSize);
      if (red < gameConfig.wallRedMax) {
        row.push(1);
      } else if (red >= gameConfig.floorRedMin) {
        row.push(0);
      } else {
        row.push(-1);
      }
    }
    kind.push(row);
  }

  // Grow walkable floor into interior unknowns so floor cracks do not become
  // random barriers. Outer-edge unknowns stay walls.
  let changed = true;
  while (changed) {
    changed = false;
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        if (kind[ty][tx] !== -1) {
          continue;
        }
        const onEdge = tx === 0 || ty === 0 || tx === tilesX - 1 || ty === tilesY - 1;
        if (onEdge) {
          kind[ty][tx] = 1;
          changed = true;
          continue;
        }
        let floorNeighbors = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          if (kind[ty + dy][tx + dx] === 0) {
            floorNeighbors += 1;
          }
        }
        if (floorNeighbors >= 1) {
          kind[ty][tx] = 0;
          changed = true;
        }
      }
    }
  }

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      if (kind[ty][tx] === -1) {
        kind[ty][tx] = 1;
      }
    }
  }

  return kind.map((row) => row.map((value) => value === 1));
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
