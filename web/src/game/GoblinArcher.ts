import { combatConfig } from "../config/combatConfig";
import { gameConfig, scaledHitbox } from "../config/gameConfig";
import type { CollisionSystem } from "./CollisionSystem";
import type { DungeonMap } from "./DungeonMap";
import type { Rect } from "./Player";

export type ArcherState = "idle" | "reposition" | "draw" | "shoot" | "recovery" | "hurt" | "dead";

export interface ArrowShot {
  x: number;
  y: number;
  directionX: number;
  directionY: number;
}

export interface RoomBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}


// Stays at range and looses one arrow per shot interval. Draw and recovery fit inside that interval.
export class GoblinArcher {
  x: number;
  y: number;
  hp: number;
  flash = 0;
  hitstun = 0;
  cooldown: number;
  dead = false;
  private state: ArcherState = "idle";
  private actionTime = 0;
  private facing: "left" | "right" = "left";
  private walkFrame = 0;
  private walkTime = 0;
  private fade = 0;
  private moving = false;
  private distance = 0;
  private sinceShot = 0;
  private los = false;
  private inRange = false;
  private hold = "idle";
  private windupDelay: number;
  private readonly lane: number;
  private readonly room: RoomBounds;

  constructor(
    readonly id: number,
    x: number,
    y: number,
    readonly roomIndex: number,
    room: RoomBounds,
    lane: number,
    stagger: number,
  ) {
    this.x = x;
    this.y = y;
    this.room = room;
    this.lane = lane;
    this.hp = combatConfig.archer.maxHealth;
    this.cooldown = 0;
    // Counts down only once the archer is ready to shoot, so the first shots stay staggered.
    this.windupDelay = stagger;
  }

  body(): Rect {
    const body = combatConfig.archer;
    return {
      x: this.x + body.bodyOffsetX,
      y: this.y + body.bodyOffsetY,
      width: body.bodyWidth,
      height: body.bodyHeight,
    };
  }

  radius(): number {
    return combatConfig.archer.bodyRadius;
  }

  barOffset(): number {
    const body = combatConfig.archer;
    return body.footAnchorY * body.scale + 8;
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
      this.fade = combatConfig.archer.fadeDuration;
      return;
    }
    const stats = combatConfig.archer;
    this.flash = stats.redFlashDuration;
    this.hitstun = stats.hitstunDuration;
    // A hit during the draw drops the arrow. The shot interval keeps counting.
    if (this.state === "draw" || this.state === "shoot" || this.state === "recovery") {
      this.state = "hurt";
      this.actionTime = 0;
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
    _hurtKnight: () => void,
    onShoot: (shot: ArrowShot) => void,
  ): void {
    void _hurtKnight;
    if (this.dead) {
      this.fade = Math.max(0, this.fade - dt);
      return;
    }
    this.flash = Math.max(0, this.flash - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.sinceShot += dt;
    this.facing = knightX < this.x ? "left" : "right";
    this.distance = Math.hypot(knightX - this.x, knightY - this.y);

    if (this.hitstun > 0) {
      this.hitstun = Math.max(0, this.hitstun - dt);
      this.moving = false;
      this.state = "hurt";
      this.hold = "hitstun";
      if (this.hitstun <= 0) {
        this.state = "idle";
        this.hold = "idle";
      }
      return;
    }

    if (!combatActive) {
      this.moving = false;
      this.state = "idle";
      return;
    }

    const timing = combatConfig.archerAttack;
    if (this.state === "draw") {
      this.moving = false;
      this.hold = "drawing";
      this.actionTime += dt;
      if (this.actionTime >= timing.drawDuration) {
        onShoot(this.looseArrow(knightBody));
        this.sinceShot = 0;
        this.state = "shoot";
        this.actionTime = 0;
      }
      return;
    }

    if (this.state === "shoot") {
      this.moving = false;
      this.hold = "releasing";
      this.actionTime += dt;
      if (this.actionTime >= timing.releaseDuration) {
        this.state = "recovery";
        this.actionTime = 0;
      }
      return;
    }

    if (this.state === "recovery") {
      this.moving = false;
      this.hold = "recovering";
      this.actionTime += dt;
      if (this.actionTime >= timing.recoveryDuration) {
        this.state = "idle";
        this.actionTime = 0;
      }
      return;
    }

    const stats = combatConfig.archer;
    const awayX = this.x - knightX;
    const awayY = this.y - knightY;
    const away = Math.hypot(awayX, awayY) || 1;
    const sideX = -awayY / away;
    const sideY = awayX / away;
    const goalX = knightX + (awayX / away) * stats.preferredDistance + sideX * this.lane;
    const goalY = knightY + (awayY / away) * stats.preferredDistance + sideY * this.lane;
    const targetX = knightBody.x + knightBody.width / 2;
    const targetY = knightBody.y + knightBody.height / 2;
    this.los = this.clearLine(map, targetX, targetY);
    const tooClose = this.distance < stats.retreatDistance;
    this.inRange = !tooClose && this.distance <= stats.detectionRange;
    if (this.windupDelay > 0) {
      this.windupDelay = Math.max(0, this.windupDelay - dt);
    }

    // A clear shot starts or waits out the interval. It does not require standing on the lane.
    if (this.inRange && this.los) {
      this.moving = false;
      if (this.windupDelay > 0) {
        this.state = "idle";
        this.hold = "opening";
        return;
      }
      if (this.cooldown <= 0) {
        this.state = "draw";
        this.actionTime = 0;
        this.cooldown = combatConfig.archerAttack.shotInterval;
        this.hold = "drawing";
        return;
      }
      this.state = "idle";
      this.hold = "cooldown";
      return;
    }

    this.state = "reposition";
    if (tooClose) {
      this.hold = "too close";
    } else if (!this.los) {
      this.hold = "no line of sight";
    } else {
      this.hold = "too far";
    }
    let steerX = goalX - this.x;
    let steerY = goalY - this.y;
    for (const ally of allies) {
      const gapX = this.x - ally.x;
      const gapY = this.y - ally.y;
      const gap = Math.hypot(gapX, gapY);
      if (gap > 0.001 && gap < 48) {
        steerX += (gapX / gap) * ((48 - gap) / 48) * 36;
        steerY += (gapY / gap) * ((48 - gap) / 48) * 36;
      }
    }
    this.step(steerX, steerY, dt, map, collision);
  }

  sprite(): { url: string; anchorX: number; anchorY: number; scale: number; alpha: number } | null {
    const stats = combatConfig.archer;
    if (this.dead && this.fade <= 0) {
      return null;
    }
    return {
      url: this.imageUrl(),
      anchorX: stats.footAnchorX,
      anchorY: stats.footAnchorY,
      scale: stats.scale,
      alpha: this.dead ? this.fade / stats.fadeDuration : 1,
    };
  }

  slashPose(): null {
    return null;
  }

  debug(): {
    state: ArcherState;
    distance: number;
    draw: number;
    cooldown: number;
    sinceShot: number;
    inRange: boolean;
    los: boolean;
    hold: string;
  } {
    const drawing = this.state === "draw";
    return {
      state: this.state,
      distance: this.distance,
      draw: drawing ? Math.min(1, this.actionTime / combatConfig.archerAttack.drawDuration) : 0,
      cooldown: this.cooldown,
      sinceShot: this.sinceShot,
      inRange: this.inRange,
      los: this.los,
      hold: this.hold,
    };
  }

  private clearLine(map: DungeonMap, targetX: number, targetY: number): boolean {
    const originY = this.y - combatConfig.archer.muzzleUp;
    const dx = targetX - this.x;
    const dy = targetY - originY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / 16));
    const tile = gameConfig.tileSize;
    for (let step = 1; step < steps; step += 1) {
      const sampleX = this.x + (dx * step) / steps;
      const sampleY = originY + (dy * step) / steps;
      if (map.isSolidTile(Math.floor(sampleX / tile), Math.floor(sampleY / tile))) {
        return false;
      }
    }
    return true;
  }

  private looseArrow(knightBody: Rect): ArrowShot {
    const stats = combatConfig.archer;
    const sign = this.facing === "right" ? 1 : -1;
    const originX = this.x + sign * stats.muzzleForward;
    const originY = this.y - stats.muzzleUp;
    const targetX = knightBody.x + knightBody.width / 2;
    const targetY = knightBody.y + knightBody.height / 2;
    let dx = targetX - originX;
    let dy = targetY - originY;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) {
      dx = sign;
      dy = 0;
    } else {
      dx /= length;
      dy /= length;
    }
    return { x: originX, y: originY, directionX: dx, directionY: dy };
  }

  private step(
    dirX: number,
    dirY: number,
    dt: number,
    map: DungeonMap,
    collision: CollisionSystem,
  ): void {
    const speed = combatConfig.archer.movementSpeed;
    const length = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / length;
    const uy = dirY / length;
    const options: [number, number][] = [
      [ux, uy],
      [-uy, ux],
      [uy, -ux],
    ];
    let chosenX = 0;
    let chosenY = 0;
    let best = -1;
    for (const [dx, dy] of options) {
      const feet = scaledHitbox();
      const box = {
        x: this.x + feet.offsetX,
        y: this.y + feet.offsetY,
        width: feet.width,
        height: feet.height,
      };
      const moved = collision.move(map, box, dx * speed * dt, dy * speed * dt);
      const nextX = this.x + moved.x;
      const nextY = this.y + moved.y;
      if (!this.inside(nextX, nextY)) {
        continue;
      }
      const travel = Math.hypot(moved.x, moved.y);
      const primary = dx === ux && dy === uy;
      if (primary && travel > speed * dt * 0.45) {
        chosenX = moved.x;
        chosenY = moved.y;
        best = travel;
        break;
      }
      if (travel > best) {
        best = travel;
        chosenX = moved.x;
        chosenY = moved.y;
      }
    }
    this.x += chosenX;
    this.y += chosenY;
    this.moving = Math.hypot(chosenX, chosenY) > 0.2;
    if (!this.moving) {
      return;
    }
    this.walkTime += dt;
    while (this.walkTime >= 1 / 8) {
      this.walkTime -= 1 / 8;
      this.walkFrame = (this.walkFrame + 1) % 3;
    }
  }

  private inside(x: number, y: number): boolean {
    const margin = 52;
    return (
      x >= this.room.x + margin &&
      x <= this.room.x + this.room.width - margin &&
      y >= this.room.y + margin &&
      y <= this.room.y + this.room.height - margin
    );
  }

  private imageUrl(): string {
    const side = this.facing;
    if (this.state === "draw") {
      const frame = Math.min(4, Math.floor((this.actionTime / combatConfig.archerAttack.drawDuration) * 4) + 1);
      return `/combat/archer_${side}_draw_${frame}.png`;
    }
    if (this.state === "shoot") {
      return `/combat/archer_${side}_draw_4.png`;
    }
    if (this.state === "reposition" && this.moving) {
      return `/combat/archer_${side}_walk_${this.walkFrame + 1}.png`;
    }
    return `/combat/archer_${side}_idle.png`;
  }
}
