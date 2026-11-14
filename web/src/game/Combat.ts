import { adventurerConfig, type AdventurerClass } from "../config/adventurerConfig";
import { combatConfig } from "../config/combatConfig";
import { gameConfig, scaledHitbox } from "../config/gameConfig";
import type { Facing } from "../config/spriteConfig";
import type { CollisionSystem } from "./CollisionSystem";
import type { Doorway, DrawnRoom, DungeonMap } from "./DungeonMap";
import { separateBodies } from "./EntityCollision";
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
  scale: number;
}

export type { SlashDraw };

// Extra space past the door tile so the hitbox is not flush with the barrier.
const ENTRY_MARGIN = 6;

let nextGoblinId = 1;

interface Fireball {
  id: number;
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  distanceTraveled: number;
  active: boolean;
}

interface Blast {
  x: number;
  y: number;
  radius: number;
  age: number;
  hits: number;
}

let nextFireballId = 1;

export class Combat {
  readonly maxHearts: number;
  hearts: number;
  private flash = 0;
  private invincible = 0;
  private cooldown = 0;
  private slashTime = 0;
  private slashFacing: Facing = "right";
  private castTimer = 0;
  private castFacing: Facing = "down";
  private readonly struck = new Set<number>();
  private readonly goblins: Goblin[];
  private readonly engaged = new Set<number>();
  private readonly fireballs: Fireball[] = [];
  private readonly blasts: Blast[] = [];

  constructor(
    private map: DungeonMap,
    private images: Images,
    private collision: CollisionSystem,
    private adventurer: AdventurerClass,
  ) {
    this.goblins = spawnGoblins(map);
    this.maxHearts = adventurerConfig[adventurer].maxHealth;
    this.hearts = this.maxHearts;
  }

  update(
    dt: number,
    knightX: number,
    knightY: number,
    facing: Facing,
    attackPressed: boolean,
    attackHeld: boolean,
    aimX: number,
    aimY: number,
  ): { x: number; y: number; facing: Facing | null } {
    this.flash = Math.max(0, this.flash - dt);
    this.invincible = Math.max(0, this.invincible - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.castTimer = Math.max(0, this.castTimer - dt);
    if (this.slashTime > 0) {
      this.slashTime = Math.max(0, this.slashTime - dt);
    }

    const slash = combatConfig.knightSlash;
    if (this.adventurer === "knight" && attackPressed && this.cooldown <= 0 && this.slashTime <= 0) {
      this.slashTime = slash.duration;
      this.slashFacing = facing;
      this.struck.clear();
      this.cooldown = slash.cooldown;
    }
    if (this.adventurer === "wizard" && attackHeld && this.cooldown <= 0) {
      this.launchFireball(knightX, knightY, aimX, aimY, facing);
    }
    this.advanceFireballs(dt);

    const placed = this.enterEnemyRoom(knightX, knightY);
    const x = placed.x;
    const y = placed.y;

    if (this.adventurer === "knight" && this.swordActive()) {
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
      const allies = this.goblins
        .filter((other) => other !== goblin && !other.dead)
        .map((other) => ({ x: other.x, y: other.y }));
      goblin.update(dt, x, y, body, this.engaged.has(goblin.roomIndex), allies, this.map, this.collision, () => {
        this.hurtKnight();
      });
    }

    const stats = adventurerConfig[this.adventurer];
    const playerBody = { x, y, radius: stats.bodyRadius };
    const goblinBodies = this.goblins
      .filter((goblin) => !goblin.dead)
      .map((goblin) => ({ goblin, x: goblin.x, y: goblin.y, radius: combatConfig.goblin.bodyRadius }));
    separateBodies(this.map, playerBody, goblinBodies);
    for (const body of goblinBodies) {
      body.goblin.x = body.x;
      body.goblin.y = body.y;
    }

    this.syncRoomLocks();
    const blastDuration = combatConfig.wizard.fireball.explosionDuration;
    for (let index = this.blasts.length - 1; index >= 0; index--) {
      this.blasts[index].age += dt;
      if (this.blasts[index].age >= blastDuration) {
        this.blasts.splice(index, 1);
      }
    }
    return {
      x: playerBody.x,
      y: playerBody.y,
      facing: this.castTimer > 0 ? this.castFacing : null,
    };
  }

  isDefeated(): boolean {
    return this.hearts <= 0;
  }

  attackCooldown(): number {
    return this.cooldown;
  }

  explosions(): { x: number; y: number; radius: number; alpha: number; hits: number }[] {
    const duration = combatConfig.wizard.fireball.explosionDuration;
    return this.blasts.map((blast) => ({
      x: blast.x,
      y: blast.y,
      radius: blast.radius,
      alpha: 1 - blast.age / duration,
      hits: blast.hits,
    }));
  }

  // Alternates the two fireball drawings as the shot travels.
  fireballSprite(traveled: number): HTMLImageElement | null {
    const length = combatConfig.wizard.fireball.frameLength;
    const frame = Math.floor(traveled / length) % 2;
    return this.images.get(`/combat/fireball_${frame + 1}.png`) ?? null;
  }

  projectiles(): { x: number; y: number; directionX: number; directionY: number; traveled: number; maxRange: number }[] {
    return this.fireballs
      .filter((fireball) => fireball.active)
      .map((fireball) => ({
        x: fireball.x,
        y: fireball.y,
        directionX: fireball.directionX,
        directionY: fireball.directionY,
        traveled: fireball.distanceTraveled,
        maxRange: combatConfig.wizard.fireball.maxRange,
      }));
  }

  bodyCircles(playerX: number, playerY: number): { x: number; y: number; radius: number }[] {
    const circles = [{ x: playerX, y: playerY, radius: adventurerConfig[this.adventurer].bodyRadius }];
    for (const goblin of this.goblins) {
      if (!goblin.dead) {
        circles.push({ x: goblin.x, y: goblin.y, radius: combatConfig.goblin.bodyRadius });
      }
    }
    return circles;
  }

  // Captures the aim at launch. The projectile keeps that direction afterward.
  private launchFireball(feetX: number, feetY: number, aimX: number, aimY: number, facing: Facing): void {
    const shot = combatConfig.wizard.fireball;
    const originY = feetY + shot.originOffsetY;
    let dx = aimX - feetX;
    let dy = aimY - originY;
    let length = Math.hypot(dx, dy);
    if (length < 0.001) {
      const fallback = facingVector(facing);
      dx = fallback.x;
      dy = fallback.y;
      length = 1;
    }
    const directionX = dx / length;
    const directionY = dy / length;
    this.fireballs.push({
      id: nextFireballId++,
      x: feetX + directionX * shot.muzzle,
      y: originY + directionY * shot.muzzle,
      directionX,
      directionY,
      distanceTraveled: 0,
      active: true,
    });
    this.cooldown = shot.cooldown;
    this.castTimer = 0.18;
    this.castFacing = facingFromVector(directionX, directionY);
  }

  // Steps the projectile so a fast fireball cannot skip a thin wall or a goblin.
  private advanceFireballs(dt: number): void {
    const shot = combatConfig.wizard.fireball;
    const step = 6;
    for (const ball of this.fireballs) {
      let remaining = shot.speed * dt;
      while (remaining > 0 && ball.active) {
        const move = Math.min(step, remaining);
        if (ball.distanceTraveled + move >= shot.maxRange) {
          const left = shot.maxRange - ball.distanceTraveled;
          ball.x += ball.directionX * left;
          ball.y += ball.directionY * left;
          ball.distanceTraveled = shot.maxRange;
          this.explode(ball);
          break;
        }
        const nextX = ball.x + ball.directionX * move;
        const nextY = ball.y + ball.directionY * move;
        if (this.map.overlapsSolid(nextX - 3, nextY - 3, 6, 6)) {
          this.explode(ball);
          break;
        }
        const struck = this.goblins.find(
          (goblin) => !goblin.dead && rectsOverlap(projectileBox(nextX, nextY), goblin.body()),
        );
        if (struck) {
          ball.x = nextX;
          ball.y = nextY;
          this.explode(ball);
          break;
        }
        ball.x = nextX;
        ball.y = nextY;
        ball.distanceTraveled += move;
        remaining -= move;
      }
    }
    for (let index = this.fireballs.length - 1; index >= 0; index--) {
      if (!this.fireballs[index].active) {
        this.fireballs.splice(index, 1);
      }
    }
  }

  // Damage is applied once, here. The orange circle drawn afterward is only a visual.
  private explode(ball: Fireball): void {
    if (!ball.active) {
      return;
    }
    ball.active = false;
    const shot = combatConfig.wizard.fireball;
    let hits = 0;
    for (const goblin of this.goblins) {
      if (goblin.dead) {
        continue;
      }
      const body = goblin.body();
      if (!rectHitsCircle(body, ball.x, ball.y, shot.explosionRadius)) {
        continue;
      }
      if (this.blockedByWall(ball.x, ball.y, body)) {
        continue;
      }
      goblin.takeHit();
      hits += 1;
    }
    this.blasts.push({
      x: ball.x,
      y: ball.y,
      radius: shot.explosionRadius,
      age: 0,
      hits,
    });
  }

  private blockedByWall(x: number, y: number, body: Rect): boolean {
    const targetX = body.x + body.width / 2;
    const targetY = body.y + body.height / 2;
    const dx = targetX - x;
    const dy = targetY - y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / 8));
    for (let step = 1; step < steps; step++) {
      const sampleX = x + (dx * step) / steps;
      const sampleY = y + (dy * step) / steps;
      const tileX = Math.floor(sampleX / gameConfig.tileSize);
      const tileY = Math.floor(sampleY / gameConfig.tileSize);
      if (this.map.isSolidTile(tileX, tileY)) {
        return true;
      }
    }
    return false;
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
        scale: combatConfig.goblin.scale,
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
        y: goblin.y - combatConfig.goblin.footAnchorY * combatConfig.goblin.scale - 8,
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
    allies: { x: number; y: number }[],
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

    // Seek the player, with a small push away from nearby goblins so they spread instead of stacking.
    let steerX = knightX - this.x;
    let steerY = knightY - this.y;
    for (const ally of allies) {
      const awayX = this.x - ally.x;
      const awayY = this.y - ally.y;
      const gap = Math.hypot(awayX, awayY);
      if (gap > 0.001 && gap < 40) {
        const push = (40 - gap) / 40;
        steerX += (awayX / gap) * push * 28;
        steerY += (awayY / gap) * push * 28;
      }
    }
    const length = Math.hypot(steerX, steerY) || 1;
    const stepX = (steerX / length) * stats.moveSpeed * dt;
    const stepY = (steerY / length) * stats.moveSpeed * dt;
    const feet = scaledHitbox();
    const box = {
      x: this.x + feet.offsetX,
      y: this.y + feet.offsetY,
      width: feet.width,
      height: feet.height,
    };
    const next = collision.move(map, box, stepX, stepY);
    this.moving = Math.hypot(next.x, next.y) > 0.2;
    this.x += next.x;
    this.y += next.y;
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
    const spots = [
      { x: 0.28, y: 0.42 },
      { x: 0.72, y: 0.42 },
      { x: 0.5, y: 0.68 },
    ];
    for (const spot of spots) {
      const point = goblinSpawn(map, room, spot.x, spot.y);
      goblins.push(new Goblin(point.x, point.y, index));
    }
  });
  return goblins;
}

function goblinSpawn(map: DungeonMap, room: DrawnRoom, fractionX: number, fractionY: number): { x: number; y: number } {
  const feet = scaledHitbox();
  const candidates = [
    { x: room.x + room.width * fractionX, y: room.y + room.height * fractionY },
    { x: room.x + room.width * 0.5, y: room.y + room.height * 0.5 },
  ];
  for (const point of candidates) {
    if (!map.overlapsSolid(point.x + feet.offsetX, point.y + feet.offsetY, feet.width, feet.height)) {
      return point;
    }
  }
  return candidates[1];
}

function projectileBox(x: number, y: number): Rect {
  return { x: x - 4, y: y - 4, width: 8, height: 8 };
}

function rectHitsCircle(rect: Rect, centerX: number, centerY: number, radius: number): boolean {
  const nearestX = Math.max(rect.x, Math.min(centerX, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(centerY, rect.y + rect.height));
  return Math.hypot(centerX - nearestX, centerY - nearestY) <= radius;
}

function facingFromVector(x: number, y: number): Facing {
  const names: Facing[] = ["right", "down-right", "down", "down-left", "left", "up-left", "up", "up-right"];
  const index = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return names[((index % 8) + 8) % 8];
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
