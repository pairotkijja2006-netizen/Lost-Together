import { adventurerConfig, type AdventurerClass } from "../config/adventurerConfig";
import { combatConfig } from "../config/combatConfig";
import { gameConfig, scaledHitbox } from "../config/gameConfig";
import type { Facing } from "../config/spriteConfig";
import type { CollisionSystem } from "./CollisionSystem";
import type { Doorway, DrawnRoom, DungeonMap } from "./DungeonMap";
import { separateBodies } from "./EntityCollision";
import { GoblinArcher, type ArrowShot } from "./GoblinArcher";
import type { Rect } from "./Player";
import { gameAudio } from "./Sound";
import {
  facingVector,
  KNIGHT_SLASH_PIVOT_NATIVE,
  KNIGHT_SLASH_SOURCE,
  knightSlashUrl,
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
  alpha: number;
}

export type { SlashDraw };

// Extra space past the door tile so the hitbox is not flush with the barrier.
const ENTRY_MARGIN = 6;

let nextGoblinId = 1;

interface Arrow {
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  distanceTraveled: number;
  active: boolean;
  hit: boolean;
}

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
  private slashCrit = false;
  private critTime = 0;
  private castTimer = 0;
  private castFacing: Facing = "down";
  private readonly struck = new Set<number>();
  private readonly goblins: (Goblin | GoblinArcher)[] = [];
  private readonly engaged = new Set<number>();
  private readonly spawned = new Set<number>();
  private readonly cleared = new Set<number>();
  private readonly fireballs: Fireball[] = [];
  private readonly arrows: Arrow[] = [];
  private readonly blasts: Blast[] = [];
  private readonly spawnMarks: { x: number; y: number }[] = [];
  private readonly entryDoors: { x: number; y: number; width: number; height: number }[] = [];

  constructor(
    private map: DungeonMap,
    private images: Images,
    private collision: CollisionSystem,
    private adventurer: AdventurerClass,
  ) {
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
    this.critTime = Math.max(0, this.critTime - dt);
    if (this.slashTime > 0) {
      this.slashTime = Math.max(0, this.slashTime - dt);
    }

    const slash = combatConfig.knightSlash;
    if (this.adventurer === "knight" && attackPressed && this.cooldown <= 0 && this.slashTime <= 0) {
      this.slashTime = slash.duration;
      this.slashFacing = facing;
      this.struck.clear();
      this.cooldown = slash.cooldown;
      const vertical = facing === "up" || facing === "down";
      this.slashCrit = vertical && Math.random() < slash.critChance;
      this.critTime = this.slashCrit ? 0.9 : 0;
      gameAudio.slash(this.slashCrit);
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
        if (rectsOverlap(sword, goblin.body()) && !this.blockedByWall(x, y + combatConfig.knightSlash.originOffsetY, goblin.body())) {
          this.struck.add(goblin.id);
          const slashDamage = combatConfig.knightSlash;
          goblin.takeHit(this.slashCrit ? slashDamage.critDamage : slashDamage.damage);
        }
      }
    }

    const body = this.knightBody(x, y);
    for (const goblin of this.goblins) {
      const allies = this.goblins
        .filter((other) => other !== goblin && !other.dead)
        .map((other) => ({ x: other.x, y: other.y }));
      goblin.update(
        dt,
        x,
        y,
        body,
        this.engaged.has(goblin.roomIndex),
        allies,
        this.map,
        this.collision,
        () => {
          this.hurtKnight();
        },
        (shot) => {
          this.launchArrow(shot);
        },
      );
    }
    this.advanceArrows(dt, x, y);

    const stats = adventurerConfig[this.adventurer];
    const playerBody = { x, y, radius: stats.bodyRadius };
    const goblinBodies = this.goblins
      .filter((goblin) => !goblin.dead)
      .map((goblin) => ({ goblin, x: goblin.x, y: goblin.y, radius: goblin.radius() }));
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

  // The class cooldown the bar fills across. The remaining time is attackCooldown().
  attackCooldownTotal(): number {
    return this.adventurer === "wizard" ? combatConfig.wizard.fireball.cooldown : combatConfig.knightSlash.cooldown;
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
        circles.push({ x: goblin.x, y: goblin.y, radius: goblin.radius() });
      }
    }
    return circles;
  }

  flyingArrows(): { x: number; y: number; directionX: number; directionY: number; size: number }[] {
    const size = combatConfig.archerArrow.hitSize;
    return this.arrows
      .filter((arrow) => arrow.active)
      .map((arrow) => ({
        x: arrow.x,
        y: arrow.y,
        directionX: arrow.directionX,
        directionY: arrow.directionY,
        size,
      }));
  }

  arrowSprite(): HTMLImageElement | null {
    return this.images.get("/combat/archer_arrow.png") ?? null;
  }

  debugArchers(): {
    x: number;
    y: number;
    state: string;
    distance: number;
    draw: number;
    cooldown: number;
    sinceShot: number;
    inRange: boolean;
    los: boolean;
    hold: string;
  }[] {
    const rows: {
      x: number;
      y: number;
      state: string;
      distance: number;
      draw: number;
      cooldown: number;
      sinceShot: number;
      inRange: boolean;
      los: boolean;
      hold: string;
    }[] = [];
    for (const goblin of this.goblins) {
      if (!(goblin instanceof GoblinArcher) || goblin.dead) {
        continue;
      }
      const info = goblin.debug();
      rows.push({ x: goblin.x, y: goblin.y, ...info });
    }
    return rows;
  }

  debugSpawns(): { x: number; y: number }[] {
    return this.spawnMarks;
  }

  debugDoors(): { x: number; y: number; width: number; height: number }[] {
    return this.entryDoors;
  }

  livingEnemies(): number {
    return this.goblins.filter((goblin) => !goblin.dead).length;
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
    gameAudio.fireball();
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

  private launchArrow(shot: ArrowShot): void {
    let x = shot.x;
    let y = shot.y;
    const size = combatConfig.archerArrow.hitSize;
    for (let step = 0; step < 4; step += 1) {
      if (!this.map.overlapsSolid(x - size / 2, y - size / 2, size, size)) {
        break;
      }
      x += shot.directionX * 6;
      y += shot.directionY * 6;
    }
    this.arrows.push({
      x,
      y,
      directionX: shot.directionX,
      directionY: shot.directionY,
      distanceTraveled: 0,
      active: true,
      hit: false,
    });
  }

  // Straight flight. The aim is the player's position at release, and a fast arrow cannot skip a wall.
  private advanceArrows(dt: number, knightX: number, knightY: number): void {
    const shot = combatConfig.archerArrow;
    const step = 6;
    const knight = this.knightBody(knightX, knightY);
    for (const arrow of this.arrows) {
      let remaining = shot.speed * dt;
      while (remaining > 0 && arrow.active) {
        const move = Math.min(step, remaining);
        if (arrow.distanceTraveled + move >= shot.maxRange) {
          arrow.active = false;
          break;
        }
        const nextX = arrow.x + arrow.directionX * move;
        const nextY = arrow.y + arrow.directionY * move;
        if (this.map.overlapsSolid(nextX - shot.hitSize / 2, nextY - shot.hitSize / 2, shot.hitSize, shot.hitSize)) {
          arrow.active = false;
          break;
        }
        if (rectsOverlap(projectileBox(nextX, nextY, shot.hitSize), knight)) {
          arrow.x = nextX;
          arrow.y = nextY;
          arrow.active = false;
          if (!arrow.hit) {
            arrow.hit = true;
            this.hurtKnight(shot.damage);
          }
          break;
        }
        arrow.x = nextX;
        arrow.y = nextY;
        arrow.distanceTraveled += move;
        remaining -= move;
      }
    }
    for (let index = this.arrows.length - 1; index >= 0; index -= 1) {
      if (!this.arrows[index].active) {
        this.arrows.splice(index, 1);
      }
    }
  }

  // Damage is applied once, here. The orange circle drawn afterward is only a visual.
  private explode(ball: Fireball): void {
    if (!ball.active) {
      return;
    }
    ball.active = false;
    gameAudio.explosion();
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
      const pose = goblin.sprite();
      if (!pose) {
        continue;
      }
      const image = this.images.get(pose.url);
      if (!image) {
        continue;
      }
      draws.push({
        image,
        feetX: goblin.x,
        feetY: goblin.y,
        anchorX: pose.anchorX,
        anchorY: pose.anchorY,
        tint: goblin.flash > 0,
        rotation: 0,
        scale: pose.scale,
        alpha: pose.alpha,
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

  // Pre-aimed slash art. Up and down use the vertical swing; every other facing has its own.
  // One crisp frame replaces the last at equal steps so the swing whips through quickly.
  knightSlash(knightX: number, knightY: number): SlashDraw | null {
    if (this.slashTime <= 0) {
      return null;
    }
    const style = combatConfig.knightSlash;
    const progress = Math.min(1, this.slashElapsed() / style.duration);
    const frame = Math.min(3, Math.floor(progress * 4));
    const image = this.images.get(knightSlashUrl(this.slashFacing, frame));
    if (!image) {
      return null;
    }
    const alpha = progress <= 0.85 ? 1 : Math.max(0, (1 - progress) / 0.15);
    if (alpha <= 0.02) {
      return null;
    }
    const dir = facingVector(this.slashFacing);
    const forward = this.slashFacing.includes("-") ? style.diagonalForwardOffset : style.forwardOffset;
    const point = slashPoint(knightX, knightY, dir.x, dir.y, style.originOffsetY, forward);
    return {
      image,
      x: point.x,
      y: point.y,
      rotation: 0,
      visualScale: style.visualScale,
      pivotX: KNIGHT_SLASH_PIVOT_NATIVE.x,
      pivotY: KNIGHT_SLASH_PIVOT_NATIVE.y,
      sourceSize: KNIGHT_SLASH_SOURCE,
      alpha,
    };
  }

  criticalTime(): number {
    return this.critTime;
  }

  healthBars(): { x: number; y: number; fraction: number }[] {
    return this.goblins
      .filter((goblin) => !goblin.dead)
      .map((goblin) => ({
        x: goblin.x,
        y: goblin.y - goblin.barOffset(),
        fraction: goblin.hp / (goblin instanceof GoblinArcher ? combatConfig.archer.maxHealth : combatConfig.goblin.maxHealth),
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

  private hurtKnight(amount = 1): void {
    if (this.invincible > 0 || this.hearts <= 0) {
      return;
    }
    this.hearts = Math.max(0, this.hearts - amount);
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
    const point = slashPoint(x, y, dir.x, dir.y, style.originOffsetY, style.hitForwardOffset);
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
      if (this.cleared.has(index)) {
        return;
      }
      const doors = this.map.doorways(room);
      const box = playerBox(x, y);
      const crossed = contains(room, x, y) || doors.some((door) => rectsOverlap(box, door));
      if (!crossed) {
        return;
      }
      const entry = nearestDoor(box, doors) ?? doors[0];
      if (!this.spawned.has(index)) {
        this.spawnEncounter(room, index, entry, x, y);
        this.spawned.add(index);
        if (entry) {
          this.entryDoors.push({ x: entry.x, y: entry.y, width: entry.width, height: entry.height });
        }
      }
      const alive = this.goblins.some((goblin) => goblin.roomIndex === index && !goblin.dead);
      if (!alive) {
        this.cleared.add(index);
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
      if (!alive) {
        this.cleared.add(index);
      }
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

  // Places the configured mix on the side of the room opposite the door the player used.
  private spawnEncounter(
    room: DrawnRoom,
    index: number,
    door: Doorway | undefined,
    playerX: number,
    playerY: number,
  ): void {
    const roster = combatConfig.enemyRoomConfig;
    const inwardX = door?.inwardX ?? 0;
    const inwardY = door?.inwardY ?? 1;
    const archers = this.encounterSpots(room, inwardX, inwardY, roster.archerGoblinCount, playerX, playerY);
    const melee = this.scatteredSpots(room, index, roster.meleeGoblinCount, playerX, playerY, archers);
    for (const spot of melee) {
      this.spawnMarks.push(spot);
      this.goblins.push(new Goblin(spot.x, spot.y, index));
    }
    archers.forEach((spot, archerNumber) => {
      this.spawnMarks.push(spot);
      const lane = (archerNumber - (archers.length - 1) / 2) * 78;
      this.goblins.push(new GoblinArcher(nextGoblinId++, spot.x, spot.y, index, room, lane, archerNumber * 0.2));
    });
  }

  // Melee goblins use the rest of the floor, away from the archers and the player.
  private scatteredSpots(
    room: DrawnRoom,
    roomIndex: number,
    count: number,
    playerX: number,
    playerY: number,
    reserved: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (let gy = 1; gy < 8; gy += 1) {
      for (let gx = 1; gx < 8; gx += 1) {
        cells.push({
          x: room.x + (room.width * gx) / 8,
          y: room.y + (room.height * gy) / 8,
        });
      }
    }
    let seed = roomIndex * 997 + 13;
    for (let i = cells.length - 1; i > 0; i -= 1) {
      seed = (seed * 16807) % 2147483647;
      const swap = seed % (i + 1);
      const cell = cells[i];
      cells[i] = cells[swap];
      cells[swap] = cell;
    }
    const placed = [...reserved];
    const chosen: { x: number; y: number }[] = [];
    for (const point of cells) {
      if (chosen.length >= count) {
        break;
      }
      if (this.spotFree(room, point, placed, playerX, playerY)) {
        placed.push(point);
        chosen.push(point);
      }
    }
    return chosen;
  }

  private encounterSpots(
    room: DrawnRoom,
    inwardX: number,
    inwardY: number,
    count: number,
    playerX: number,
    playerY: number,
  ): { x: number; y: number }[] {
    const perpX = -inwardY;
    const perpY = inwardX;
    const candidates: { x: number; y: number }[] = [];
    for (const back of [0, 0.08, 0.16, 0.24, 0.34]) {
      for (const slot of [-1, 0, 1, -0.55, 0.55, -1.45, 1.45]) {
        candidates.push({
          x: room.x + room.width * (0.5 + inwardX * (0.3 - back)) + perpX * slot * 76,
          y: room.y + room.height * (0.5 + inwardY * (0.3 - back)) + perpY * slot * 76,
        });
      }
    }
    const grid: { x: number; y: number }[] = [];
    for (let gy = 1; gy < 7; gy += 1) {
      for (let gx = 1; gx < 7; gx += 1) {
        grid.push({
          x: room.x + (room.width * gx) / 7,
          y: room.y + (room.height * gy) / 7,
        });
      }
    }
    grid.sort((a, b) => {
      const depthA = (a.x - room.x) * inwardX + (a.y - room.y) * inwardY;
      const depthB = (b.x - room.x) * inwardX + (b.y - room.y) * inwardY;
      return depthB - depthA;
    });
    candidates.push(...grid);
    const placed: { x: number; y: number }[] = [];
    for (const point of candidates) {
      if (placed.length >= count) {
        break;
      }
      if (this.spotFree(room, point, placed, playerX, playerY)) {
        placed.push(point);
      }
    }
    return placed;
  }

  private spotFree(
    room: DrawnRoom,
    point: { x: number; y: number },
    placed: { x: number; y: number }[],
    playerX: number,
    playerY: number,
  ): boolean {
    const margin = 56;
    if (point.x < room.x + margin || point.x > room.x + room.width - margin) {
      return false;
    }
    if (point.y < room.y + margin || point.y > room.y + room.height - margin) {
      return false;
    }
    const feet = scaledHitbox();
    if (this.map.overlapsSolid(point.x + feet.offsetX, point.y + feet.offsetY, feet.width, feet.height)) {
      return false;
    }
    if (Math.hypot(point.x - playerX, point.y - playerY) < 72) {
      return false;
    }
    if (placed.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 56)) {
      return false;
    }
    const box = {
      x: point.x + feet.offsetX,
      y: point.y + feet.offsetY,
      width: feet.width,
      height: feet.height,
    };
    return !this.map.doorways(room).some((door) => rectsOverlap(box, door));
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

  takeHit(amount = 1): void {
    if (this.dead) {
      return;
    }
    this.hp -= amount;
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
    onShoot: (shot: ArrowShot) => void,
  ): void {
    void onShoot;
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

  radius(): number {
    return combatConfig.goblin.bodyRadius;
  }

  barOffset(): number {
    const render = combatConfig.goblin.spriteRendering;
    return (render.anchorY * 128 + render.offsetY) * render.scale + 8;
  }

  sprite(): { url: string; anchorX: number; anchorY: number; scale: number; alpha: number } | null {
    if (this.dead) {
      return null;
    }
    const render = combatConfig.goblin.spriteRendering;
    return {
      url: this.imageUrl(),
      anchorX: render.anchorX * 128 + render.offsetX,
      anchorY: render.anchorY * 128 + render.offsetY,
      scale: render.scale,
      alpha: 1,
    };
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

function projectileBox(x: number, y: number, size = 8): Rect {
  return { x: x - size / 2, y: y - size / 2, width: size, height: size };
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
