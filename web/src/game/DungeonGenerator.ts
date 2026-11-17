import { gameConfig, scaledHitbox } from "../config/gameConfig";

export const North = 1;
export const East = 2;
export const South = 4;
export const West = 8;

export interface GeneratedRoom {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  doors: number;
  imageUrl: string;
}

export interface GeneratedCorridor {
  x: number;
  y: number;
  width: number;
  height: number;
  direction: number;
}

export interface GeneratedDungeon {
  seed: number;
  rooms: GeneratedRoom[];
  corridors: GeneratedCorridor[];
  spawn: { x: number; y: number };
}

interface RoomNode {
  type: string;
  paths: RoomNode[];
  x: number;
  y: number;
  width: number;
  height: number;
  doors: number;
  placed: boolean;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Same tree as Dungeon::generate: start, enemy rooms with side branches, then the final room.
export function generateDungeon(seed = randomSeed()): GeneratedDungeon {
  const random = mulberry32(seed);
  const start = buildTree(random);
  const corridors: GeneratedCorridor[] = [];
  let placed = false;
  for (let attempt = 0; attempt < 40 && !placed; attempt++) {
    corridors.length = 0;
    clearNode(start);
    const size = sizeFor(start.type);
    start.x = 0;
    start.y = 0;
    start.width = size.width;
    start.height = size.height;
    start.placed = true;
    start.doors = 0;
    placed = placeChildren(start, start, corridors, random);
  }
  if (!placed) {
    throw new Error(`Could not place a dungeon for seed ${seed} without overlapping rooms.`);
  }

  const rooms = flatten(start);
  const shiftX = -Math.min(...rooms.map((room) => room.x), ...corridors.map((corridor) => corridor.x));
  const shiftY = -Math.min(...rooms.map((room) => room.y), ...corridors.map((corridor) => corridor.y));
  for (const room of rooms) {
    room.x += shiftX;
    room.y += shiftY;
  }
  for (const corridor of corridors) {
    corridor.x += shiftX;
    corridor.y += shiftY;
  }

  const { width, height, offsetX, offsetY } = scaledHitbox();
  return {
    seed,
    rooms: rooms.map(toGenerated),
    corridors,
    spawn: {
      x: start.x + start.width / 2 - offsetX - width / 2,
      y: start.y + start.height / 2 - offsetY - height / 2,
    },
  };
}

function buildTree(random: () => number): RoomNode {
  const start = node("#");
  let current = start;
  const steps = gameConfig.mainPathSteps;
  for (let i = 0; i < steps; i++) {
    if (i === steps - 1) {
      current.paths.push(node("f"));
      break;
    }
    const enemy = node("e");
    current.paths.push(enemy);
    current = enemy;
    const extraPaths = randomInt(random, 1, 3) - 1;
    for (let j = 0; j < extraPaths; j++) {
      current.paths.push(node(randomInt(random, 0, 1) === 0 ? "b" : "t"));
    }
  }
  return start;
}

function placeChildren(
  root: RoomNode,
  room: RoomNode,
  corridors: GeneratedCorridor[],
  random: () => number,
): boolean {
  const directions = shuffle([North, East, South, West], random);
  return placeChildAt(root, room, 0, directions, corridors, random);
}

function placeChildAt(
  root: RoomNode,
  room: RoomNode,
  index: number,
  directions: number[],
  corridors: GeneratedCorridor[],
  random: () => number,
): boolean {
  if (index === room.paths.length) {
    return true;
  }
  const child = room.paths[index];
  const childSize = sizeFor(child.type);
  const gap = gameConfig.corridorGap;
  const door = gameConfig.doorWidth;
  const tile = gameConfig.tileSize;
  // Align on the middle door tile so even-height rooms stay on the grid and
  // corridor floors meet the three-tile openings in the room art.
  const parentMidX = Math.floor(room.width / tile / 2);
  const parentMidY = Math.floor(room.height / tile / 2);
  const childMidX = Math.floor(childSize.width / tile / 2);
  const childMidY = Math.floor(childSize.height / tile / 2);

  for (const direction of directions) {
    if (room.doors & direction) {
      continue;
    }
    let x = 0;
    let y = 0;
    const corridor: GeneratedCorridor = { x: 0, y: 0, width: 0, height: 0, direction };
    if (direction === East) {
      x = room.x + room.width + gap;
      y = room.y + (parentMidY - childMidY) * tile;
      corridor.x = room.x + room.width;
      corridor.y = room.y + (parentMidY - 1) * tile;
      corridor.width = gap;
      corridor.height = door;
    } else if (direction === West) {
      x = room.x - gap - childSize.width;
      y = room.y + (parentMidY - childMidY) * tile;
      corridor.x = x + childSize.width;
      corridor.y = room.y + (parentMidY - 1) * tile;
      corridor.width = gap;
      corridor.height = door;
    } else if (direction === South) {
      x = room.x + (parentMidX - childMidX) * tile;
      y = room.y + room.height + gap;
      corridor.x = room.x + (parentMidX - 1) * tile;
      corridor.y = room.y + room.height;
      corridor.width = door;
      corridor.height = gap;
    } else {
      x = room.x + (parentMidX - childMidX) * tile;
      y = room.y - gap - childSize.height;
      corridor.x = room.x + (parentMidX - 1) * tile;
      corridor.y = y + childSize.height;
      corridor.width = door;
      corridor.height = gap;
    }

    if (!fits(root, corridors, { x, y, w: childSize.width, h: childSize.height }, corridor)) {
      continue;
    }

    child.x = x;
    child.y = y;
    child.width = childSize.width;
    child.height = childSize.height;
    child.doors = opposite(direction);
    child.placed = true;
    room.doors |= direction;
    const mark = corridors.length;
    corridors.push(corridor);
    if (
      placeChildren(root, child, corridors, random) &&
      placeChildAt(root, room, index + 1, directions, corridors, random)
    ) {
      return true;
    }
    corridors.length = mark;
    room.doors &= ~direction;
    clearNode(child);
  }
  return false;
}

function fits(root: RoomNode, corridors: GeneratedCorridor[], room: Rect, corridor: GeneratedCorridor): boolean {
  const corridorRect = { x: corridor.x, y: corridor.y, w: corridor.width, h: corridor.height };
  for (const other of flatten(root).filter((placed) => placed.placed)) {
    const otherRect = { x: other.x, y: other.y, w: other.width, h: other.height };
    if (overlaps(room, otherRect) || overlaps(corridorRect, otherRect)) {
      return false;
    }
  }
  for (const existing of corridors) {
    const existingRect = { x: existing.x, y: existing.y, w: existing.width, h: existing.height };
    if (overlaps(room, existingRect) || overlaps(corridorRect, existingRect)) {
      return false;
    }
  }
  return true;
}

function toGenerated(room: RoomNode): GeneratedRoom {
  const size = sizeName(room.type);
  const openings = openingName(room.doors);
  return {
    type: room.type,
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
    doors: room.doors,
    imageUrl: `/rooms/room_${size}_${openings}.png`,
  };
}

function sizeName(type: string): string {
  if (type === "#") return "start";
  if (type === "e") return "large";
  if (type === "f") return "small";
  return "medium";
}

function openingName(doors: number): string {
  let name = "";
  if (doors & North) name += "N";
  if (doors & East) name += "E";
  if (doors & South) name += "S";
  if (doors & West) name += "W";
  return name || "none";
}

function sizeFor(type: string): { width: number; height: number } {
  if (type === "#") return { width: 288, height: 320 };
  if (type === "f") return { width: 416, height: 384 };
  if (type === "e") return { width: 672, height: 640 };
  return { width: 544, height: 512 };
}

function opposite(direction: number): number {
  if (direction === North) return South;
  if (direction === South) return North;
  if (direction === East) return West;
  return East;
}

function node(type: string): RoomNode {
  return { type, paths: [], x: 0, y: 0, width: 0, height: 0, doors: 0, placed: false };
}

function clearNode(room: RoomNode): void {
  room.x = 0;
  room.y = 0;
  room.width = 0;
  room.height = 0;
  room.doors = 0;
  room.placed = false;
  for (const child of room.paths) {
    clearNode(child);
  }
}

function flatten(room: RoomNode, out: RoomNode[] = []): RoomNode[] {
  out.push(room);
  for (const child of room.paths) {
    flatten(child, out);
  }
  return out;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function shuffle(directions: number[], random: () => number): number[] {
  const copy = directions.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = copy[i];
    copy[i] = copy[j];
    copy[j] = current;
  }
  return copy;
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function randomSeed(): number {
  const fromUrl = new URLSearchParams(window.location.search).get("seed");
  if (fromUrl && /^\d+$/.test(fromUrl)) {
    return Number(fromUrl);
  }
  return Math.floor(Math.random() * 1_000_000_000);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
