import { combatConfig } from "../config/combatConfig";
import { gameConfig, scaledHitbox } from "../config/gameConfig";
import type { Facing } from "../config/spriteConfig";
import type { CollisionSystem } from "./CollisionSystem";
import type { Doorway, DrawnRoom, DungeonMap } from "./DungeonMap";
import type { Rect } from "./Player";
import {
  facingVector,
  slashFrame,
  slashPivot,
  slashPoint,
  slashRotation,
  slashUrl,
  vectorAngle,
  type SlashDraw,
} from "./Slash";

type GoblinFacing = "left" | "right";
type GoblinState = "chase" | "windup" | "slash" | "recover" | "dead";

interface Images {
  get(url: string): HTMLImageElement | undefined;
}

export interface SpriteDraw {
  image: HTMLImageElement;
  feetX: number;
  feetY: number;
  anchorX: number;
  anchorY: number;
  tint: boolean;
  rotation: number;
}

export type { SlashDraw };

// Extra space past the door tile so the hitbox is not flush with the barrier.
const ENTRY_MARGIN = 6;

let nextGoblinId = 1;

export class Combat {
  readonly maxHearts = combatConfig.knight.hearts;
  hearts = combatConfig.knight.hearts;
  private flash = 0;
  private invincible = 0;
  private cooldown = 0;
  private slashTime = 0;
  private slashFacing: Facing = "right";
  private readonly struck = new Set<number>();
  private readonly goblins: Goblin[];
  private readonly engaged = new Set<number>();

  constructor(
    private map: DungeonMap,
    private images: Images,
    private collision: CollisionSystem,
  ) {
    this.goblins = spawnGoblins(map);
  }

  update(dt: number, knightX: number, knightY: number, facing: Facing, attackPressed: boolean): { x: number; y: number } {
    this.flash = Math.max(0, this.flash - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.slashTime > 0) {
      this.slashTime = Math.max(0, this.slashTime - dt);
    }

    const slash = combatConfig.knightSlash;
    if (attackPressed && this.cooldown <= 0 && this.slashTime <= 0) {
      this.slashTime = slash.duration;
      this.slashFacing = facing;
      this.struck.clear();
      this.cooldown = slash.cooldown;
    }

    const placed = this.enterEnemyRoom(knightX, knightY);
    const x = placed.x;
    const y = placed.y;

    if (this.swordActive()) {
      const sword = this.knightHitbox(x, y);
      for (const goblin of this.goblins) {
        if (goblin.dead || this.struck.has(goblin.id)) {
          continue;
        }
        if (rectsOverlap(sword, goblin.body())) {
          this.struck.add(goblin.id);
          goblin.takeHit();
        }
      }
    }

    const body = this.knightBody(x, y);
    for (const goblin of this.goblins) {
      goblin.update(dt, x, y, body, this.engaged.has(goblin.roomIndex), this.map, this.collision, () => {
        this.hurtKnight();
      });
    }

    this.syncRoomLocks();
    return placed;
  }

  knightFlashing(): boolean {
    return this.flash > 0;
  }

  worldSprites(): SpriteDraw[] {
    const draws: SpriteDraw[] = [];
    for (const goblin of this.goblins) {
      if (goblin.dead) {
        continue;
      }
      const image = this.images.get(goblin.imageUrl());
      if (!image) {
        continue;
      }
      draws.push({
        image,
        feetX: goblin.x,
        feetY: goblin.y,
        anchorX: combatConfig.goblin.footAnchorX,
        anchorY: combatConfig.goblin.footAnchorY,
        tint: goblin.flash > 0,
        rotation: 0,
      });
    }
    return draws;
  }

  goblinSlashes(): SlashDraw[] {
    const draws: SlashDraw[] = [];
    const style = combatConfig.goblinSlash;
    for (const goblin of this.goblins) {
      const pose = goblin.slashPose();
      if (!pose) {
        continue;
      }
      const image = this.images.get(slashUrl(pose.frame));
      if (!image) {
        continue;
      }
      const pivot = slashPivot(pose.frame);
      const point = slashPoint(goblin.x, goblin.y, pose.aimX, pose.aimY, style.originOffsetY, style.forwardOffset);
      draws.push({
        image,
        x: point.x,
        y: point.y,
        rotation: slashRotation(vectorAngle(pose.aimX, pose.aimY)),
        visualScale: style.visualScale,
        pivotX: pivot.x,
        pivotY: pivot.y,
      });
    }
    return draws;
  }

  knightSlash(knightX: number, knightY: number): SlashDraw | null {
    if (this.slashTime <= 0) {
      return null;
    }
    const style = combatConfig.knightSlash;
    const frame = slashFrame(this.slashElapsed(), style.duration);
    const image = this.images.get(slashUrl(frame));
    if (!image) {
      return null;
    }
    const dir = facingVector(this.slashFacing);
    const pivot = slashPivot(frame);
    const point = slashPoint(knightX, knightY, dir.x, dir.y, style.originOffsetY, style.forwardOffset);
    return {
      image,
      x: point.x,
      y: point.y,
      rotation: slashRotation(vectorAngle(dir.x, dir.y)),
      visualScale: style.visualScale,
      pivotX: pivot.x,
      pivotY: pivot.y,
    };
  }

  healthBars(): { x: number; y: number; fraction: number }[] {
    return this.goblins
      .filter((goblin) => !goblin.dead)
      .map((goblin) => ({
        x: goblin.x,
        y: goblin.y - combatConfig.goblin.footAnchorY * gameConfig.sprite.scale - 8,
        fraction: goblin.hp / combatConfig.goblin.maxHealth,
      }));
  }

  lockedDoorTiles(): { x: number; y: number; width: number; height: number }[] {
    const tiles: { x: number; y: number; width: number; height: number }[] = [];
    this.map.rooms.forEach((room, index) => {
      if (!this.map.isRoomLocked(index)) {
        return;
      }
      for (const door of this.map.doorways(room)) {
        tiles.push({ x: door.x, y: door.y, width: door.width, height: door.height });
      }
    });
    return tiles;
  }

  private hurtKnight(): void {
    if (this.invincible > 0 || this.hearts <= 0) {
      return;
    }
    this.hearts -= 1;
    this.flash = combatConfig.damageFeedback.knight.redFlashDuration;
    this.invincible = combatConfig.damageFeedback.knight.invincibilityDuration;
  }

  private swordActive(): boolean {
    if (this.slashTime <= 0) {
      return false;
    }
    const elapsed = this.slashElapsed();
    const slash = combatConfig.knightSlash;
    return elapsed >= slash.activeStart && elapsed <= slash.activeEnd;
  }

  private slashElapsed(): number {
    return combatConfig.knightSlash.duration - this.slashTime;
  }

  private knightBody(x: number, y: number): Rect {
    const body = combatConfig.knight;
    return {
      x: x + body.bodyOffsetX,
      y: y + body.bodyOffsetY,
      width: body.bodyWidth,
      height: body.bodyHeight,
    };
  }

  private knightHitbox(x: number, y: number): Rect {
    const style = combatConfig.knightSlash;
    const dir = facingVector(this.slashFacing);
    const point = slashPoint(x, y, dir.x, dir.y, style.originOffsetY, style.forwardOffset);
    return {
      x: point.x - style.hitWidth / 2,
      y: point.y - style.hitHeight / 2,
      width: style.hitWidth,
      height: style.hitHeight,
    };
  }

  // Pulls the knight through the doorway they are crossing, then seals the room once.
  private enterEnemyRoom(knightX: number, knightY: number): { x: number; y: number } {
    let x = knightX;
    let y = knightY;
    this.map.rooms.forEach((room, index) => {
      if (room.type !== "e" || this.engaged.has(index)) {
        return;
      }
      const alive = this.goblins.some((goblin) => goblin.roomIndex === index && !goblin.dead);
      if (!alive) {
        return;
      }
      const doors = this.map.doorways(room);
      const box = playerBox(x, y);
      const crossed = contains(room, x, y) || doors.some((door) => rectsOverlap(box, door));
      if (!crossed) {
        return;
      }
      if (this.standClear(x, y, room, doors, index)) {
        this.engaged.add(index);
        this.map.setRoomLocked(index, true);
        return;
      }
      const door = nearestDoor(box, doors);
      if (!door) {
        return;
      }
      const spot = this.inwardSpot(x, y, door, room, doors, index);
      if (!spot) {
        return;
      }
      x = spot.x;
      y = spot.y;
      this.engaged.add(index);
      this.map.setRoomLocked(index, true);
    });
    return { x, y };
  }

  private syncRoomLocks(): void {
    this.map.rooms.forEach((room, index) => {
      if (room.type !== "e" || !this.engaged.has(index)) {
        return;
      }
      const alive = this.goblins.some((goblin) => goblin.roomIndex === index && !goblin.dead);
      this.map.setRoomLocked(index, alive);
    });
  }

  private standClear(x: number, y: number, room: DrawnRoom, doors: Doorway[], roomIndex: number): boolean {
    if (!contains(room, x, y)) {
      return false;
    }
    const box = playerBox(x, y);
    if (doors.some((door) => rectsOverlap(box, expandInward(door, ENTRY_MARGIN)))) {
      return false;
    }
    if (this.map.overlapsSolid(box.x, box.y, box.width, box.height)) {
      return false;
    }
    return !this.goblins.some(
      (goblin) => goblin.roomIndex === roomIndex && !goblin.dead && rectsOverlap(box, goblin.body()),
    );
  }

  private inwardSpot(
    knightX: number,
    knightY: number,
    door: Doorway,
    room: DrawnRoom,
    doors: Doorway[],
    roomIndex: number,
  ): { x: number; y: number } | null {
    const feet = scaledHitbox();
    const reach =
      gameConfig.tileSize +
      ENTRY_MARGIN +
      Math.abs(door.inwardX) * (feet.width + 8) +
      Math.abs(door.inwardY) * (feet.height + 8);
    const perpX = -door.inwardY;
    const perpY = door.inwardX;
    for (const perp of [0, 4, -4, 8, -8, 12, -12]) {
      for (let dist = 2; dist <= reach; dist += 2) {
        const x = knightX + door.inwardX * dist + perpX * perp;
        const y = knightY + door.inwardY * dist + perpY * perp;
        if (this.standClear(x, y, room, doors, roomIndex)) {
          return { x, y };
        }
      }
    }
    return null;
  }
}

class Goblin {
  readonly id = nextGoblinId++;
  readonly roomIndex: number;
  x: number;
  y: number;
  hp: number;
  flash = 0;
  hitstun = 0;
  cooldown = 0;
  private state: GoblinState = "chase";
  private actionTime = 0;
  private facing: GoblinFacing = "left";
  private aimX = 1;
  private aimY = 0;
  private frame = 0;
  private frameTime = 0;
  private dealt = false;
  private moving = false;
  dead = false;

  constructor(x: number, y: number, roomIndex: number) {
    this.x = x;
    this.y = y;
    this.roomIndex = roomIndex;
    this.hp = combatConfig.goblin.maxHealth;
  }

  body(): Rect {
    const body = combatConfig.goblin;
    return {
      x: this.x + body.bodyOffsetX,
      y: this.y + body.bodyOffsetY,
      width: body.bodyWidth,
      height: body.bodyHeight,
    };
  }

  takeHit(): void {
    if (this.dead) {
      return;
    }
    this.hp -= 1;
    if (this.hp <= 0) {
      this.dead = true;
      this.state = "dead";
      this.hitstun = 0;
      this.flash = 0;
      return;
    }
    const feedback = combatConfig.damageFeedback.goblin;
    this.flash = feedback.redFlashDuration;
    this.hitstun = feedback.hitstunDuration;
    if (feedback.interruptAttackOnHit && (this.state === "windup" || this.state === "slash" || this.state === "recover")) {
      this.state = "chase";
      this.actionTime = 0;
      this.dealt = false;
    }
  }

  update(
    dt: number,
    knightX: number,
    knightY: number,
    knightBody: Rect,
    combatActive: boolean,
    map: DungeonMap,
    collision: CollisionSystem,
    hurtKnight: () => void,
  ): void {
    if (this.dead) {
      return;
    }
    this.flash = Math.max(0, this.flash - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.hitstun > 0) {
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.moving = false;
      return;
    }

    if (!combatActive) {
      this.moving = false;
      this.state = "chase";
      this.facing = knightX < this.x ? "left" : "right";
      return;
    }

    const stats = combatConfig.goblin;
    const timing = combatConfig.goblinCombat;
    const slash = combatConfig.goblinSlash;

    if (this.state === "windup") {
      this.moving = false;
      this.facing = knightX < this.x ? "left" : "right";
      this.actionTime += dt;
      if (this.actionTime >= timing.attackWindup) {
        const aim = aimAt(this.x, this.y, knightBody);
        this.aimX = aim.x;
        this.aimY = aim.y;
        this.state = "slash";
        this.actionTime = 0;
        this.dealt = false;
      }
      return;
    }

    if (this.state === "slash") {
      this.moving = false;
      this.facing = this.aimX < 0 ? "left" : "right";
      this.actionTime += dt;
      const hit = slashPoint(this.x, this.y, this.aimX, this.aimY, slash.originOffsetY, slash.forwardOffset);
      const blade = {
        x: hit.x - slash.hitWidth / 2,
        y: hit.y - slash.hitHeight / 2,
        width: slash.hitWidth,
        height: slash.hitHeight,
      };
      if (
        !this.dealt &&
        this.actionTime >= slash.activeStart &&
        this.actionTime <= slash.activeEnd &&
        rectsOverlap(blade, knightBody)
      ) {
        this.dealt = true;
        hurtKnight();
      }
      if (this.actionTime >= timing.attackDuration) {
        this.state = "recover";
        this.actionTime = 0;
      }
      return;
    }

    if (this.state === "recover") {
      this.moving = false;
      this.facing = this.aimX < 0 ? "left" : "right";
      this.actionTime += dt;
      if (this.actionTime >= timing.attackRecovery) {
        this.state = "chase";
        this.actionTime = 0;
      }
      return;
    }

    this.facing = knightX < this.x ? "left" : "right";
    const distance = Math.hypot(knightX - this.x, knightY - this.y);
    if (distance <= stats.attackRange && this.cooldown <= 0) {
      this.state = "windup";
      this.actionTime = 0;
      this.moving = false;
      this.cooldown = timing.attackCooldown;
      return;
    }

    const length = distance || 1;
    const stepX = ((knightX - this.x) / length) * stats.moveSpeed * dt;
    const stepY = ((knightY - this.y) / length) * stats.moveSpeed * dt;
    const feet = scaledHitbox();
    const box = {
      x: this.x + feet.offsetX,
      y: this.y + feet.offsetY,
      width: feet.width,
      height: feet.height,
    };
    const next = collision.move(map, box, stepX, stepY);
    this.moving = Math.hypot(next.x - this.x, next.y - this.y) > 0.2;
    this.x = next.x;
    this.y = next.y;
    if (this.moving) {
      this.frameTime += dt;
      const step = 1 / 8;
      while (this.frameTime >= step) {
        this.frameTime -= step;
        this.frame = (this.frame + 1) % 3;
      }
    }
  }

  imageUrl(): string {
    const side = this.facing;
    if (this.hitstun > 0 || this.state !== "chase" || !this.moving) {
      return `/combat/goblin_${side}_idle.png`;
    }
    return `/combat/goblin_${side}_run_${this.frame + 1}.png`;
  }

  slashPose(): { frame: number; aimX: number; aimY: number } | null {
    if (this.dead || this.hitstun > 0 || this.state !== "slash") {
      return null;
    }
    return {
      frame: slashFrame(this.actionTime, combatConfig.goblinCombat.attackDuration),
      aimX: this.aimX,
      aimY: this.aimY,
    };
  }
}

function spawnGoblins(map: DungeonMap): Goblin[] {
  const goblins: Goblin[] = [];
  map.rooms.forEach((room, index) => {
    if (room.type !== "e") {
      return;
    }
    for (const side of [-1, 1]) {
      const point = goblinSpawn(map, room, side);
      goblins.push(new Goblin(point.x, point.y, index));
    }
  });
  return goblins;
}

function goblinSpawn(map: DungeonMap, room: DrawnRoom, side: number): { x: number; y: number } {
  const feet = scaledHitbox();
  const candidates = [
    { x: room.x + room.width * (0.5 + side * 0.22), y: room.y + room.height * 0.5 },
    { x: room.x + room.width * 0.5, y: room.y + room.height * (0.5 + side * 0.18) },
    { x: room.x + room.width * 0.5, y: room.y + room.height * 0.5 },
  ];
  for (const point of candidates) {
    if (!map.overlapsSolid(point.x + feet.offsetX, point.y + feet.offsetY, feet.width, feet.height)) {
      return point;
    }
  }
  return candidates[2];
}

function aimAt(goblinX: number, goblinY: number, knightBody: Rect): { x: number; y: number } {
  const targetX = knightBody.x + knightBody.width / 2;
  const targetY = knightBody.y + knightBody.height / 2;
  const originY = goblinY + combatConfig.goblinSlash.originOffsetY;
  const dx = targetX - goblinX;
  const dy = targetY - originY;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function playerBox(x: number, y: number): Rect {
  const feet = scaledHitbox();
  return {
    x: x + feet.offsetX,
    y: y + feet.offsetY,
    width: feet.width,
    height: feet.height,
  };
}

function nearestDoor(box: Rect, doors: Doorway[]): Doorway | null {
  let best: Doorway | null = null;
  let bestArea = 0;
  for (const door of doors) {
    const area = overlapArea(box, door);
    if (area > bestArea) {
      bestArea = area;
      best = door;
    }
  }
  return best;
}

function expandInward(door: Doorway, margin: number): Rect {
  return {
    x: door.x + Math.min(door.inwardX, 0) * margin,
    y: door.y + Math.min(door.inwardY, 0) * margin,
    width: door.width + Math.abs(door.inwardX) * margin,
    height: door.height + Math.abs(door.inwardY) * margin,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  return width * height;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function contains(room: DrawnRoom, x: number, y: number): boolean {
  return x >= room.x && y >= room.y && x < room.x + room.width && y < room.y + room.height;
}
