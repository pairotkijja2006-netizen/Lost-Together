import { adventurerConfig, type AdventurerClass } from "../config/adventurerConfig";
import { combatConfig, combatSpriteUrls } from "../config/combatConfig";
import { gameConfig } from "../config/gameConfig";
import { spritesFor, spriteUrlsFor, type Facing } from "../config/spriteConfig";
import { AnimationController } from "./AnimationController";
import { Camera, type WorldView } from "./Camera";
import { CollisionSystem } from "./CollisionSystem";
import { Combat, type SlashDraw } from "./Combat";
import {
  DungeonMap,
  TileHallFloor,
  TileHallWall,
  TileRoomFloor,
  TileRoomWall,
  TileVoid,
} from "./DungeonMap";
import { East, North, South, West } from "./DungeonGenerator";
import { InputManager } from "./InputManager";
import { hallwayBounds } from "./Hallway";
import { Player } from "./Player";

export class Game {
  private map: DungeonMap | null = null;
  private player: Player | null = null;
  private animation: AnimationController | null = null;
  private camera = new Camera();
  private input: InputManager;
  private collision = new CollisionSystem();
  private combat: Combat | null = null;
  private frame: HTMLImageElement | null = null;
  private running = false;
  private disposed = false;
  private lastTime = 0;
  private debug = false;
  private defeated = false;
  private error: string | null = null;
  private onResize: () => void;
  private aim = { x: 0, y: 0 };
  private abilityWasReady = true;
  private abilityGlow = 0;
  // Integer-scaled copies of each frame, so the plume is not shaved off while moving.
  private scaledSprites = new Map<string, HTMLCanvasElement>();

  constructor(
    private canvas: HTMLCanvasElement,
    private adventurer: AdventurerClass,
    private onGameOver: () => void,
  ) {
    this.input = new InputManager(
      canvas,
      () => {
        this.debug = !this.debug;
      },
      (action) => this.camera.adjustZoom(action),
    );
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    try {
      const [map, images, combatImages] = await Promise.all([
        DungeonMap.load(),
        loadSprites(spriteUrlsFor(this.adventurer)),
        loadSprites(combatSpriteUrls),
      ]);
      this.map = map;
      this.combat = new Combat(map, combatImages, this.collision, this.adventurer);
      const spawn = map.findSpawn();
      this.player = new Player(spawn.x, spawn.y, this.adventurer);
      this.animation = new AnimationController(
        images,
        spritesFor(this.adventurer),
        this.adventurer === "wizard" ? 0.65 : 0,
      );
      this.frame = this.animation.update(this.player.facing, false, 0);
      this.camera.snap(spawn.x, spawn.y + this.focusOffset());
      if (this.disposed) {
        return;
      }
      this.resize();
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame(this.tick);
    } catch (caught) {
      this.error = caught instanceof Error ? caught.message : "Failed to start the game.";
      this.resize();
      this.draw();
    }
  }

  stop(): void {
    this.disposed = true;
    this.running = false;
    this.input.dispose();
    window.removeEventListener("resize", this.onResize);
  }

  private tick = (now: number): void => {
    if (!this.running) {
      return;
    }
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.tick);
  };

  private update(dt: number): void {
    const player = this.player;
    const map = this.map;
    const animation = this.animation;
    if (!player || !map || !animation) {
      return;
    }

    if (this.defeated) {
      return;
    }

    const stats = adventurerConfig[player.classType];
    const axis = this.input.axis();
    if (axis.facing) {
      player.facing = axis.facing;
      player.moving = true;
      const next = this.collision.move(
        map,
        player.hitbox(),
        axis.x * stats.movementSpeed * dt,
        axis.y * stats.movementSpeed * dt,
      );
      player.x += next.x;
      player.y += next.y;
    } else {
      player.moving = false;
    }

    const pointer = this.input.mouse();
    this.aim = this.camera.screenToWorld(pointer.x, pointer.y, this.canvas.clientWidth, this.canvas.clientHeight);
    const placed = this.combat?.update(
      dt,
      player.x,
      player.y,
      player.facing,
      this.input.consumeAttack(),
      this.input.attackDown(),
      this.aim.x,
      this.aim.y,
    );
    let displayFacing = player.facing;
    if (placed) {
      const dx = placed.x - player.x;
      const dy = placed.y - player.y;
      if (dx !== 0 || dy !== 0) {
        player.x = placed.x;
        player.y = placed.y;
        // Doorway corrections are large. Body separation is a few pixels and should not yank the camera.
        if (Math.hypot(dx, dy) > 8) {
          this.camera.shift(dx, dy);
        }
      }
      if (placed.facing) {
        displayFacing = placed.facing;
      }
    }
    this.camera.update(dt, player.x, player.y + this.focusOffset());
    this.frame = animation.update(displayFacing, player.moving, dt);
    const ready = (this.combat?.attackCooldown() ?? 0) <= 0;
    if (ready && !this.abilityWasReady) {
      this.abilityGlow = 0.18;
    }
    this.abilityWasReady = ready;
    this.abilityGlow = Math.max(0, this.abilityGlow - dt);
    if (this.combat?.isDefeated()) {
      this.defeated = true;
      this.onGameOver();
    }
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (!this.running) {
      this.draw();
    }
  }

  private draw(): void {
    const context = this.canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.error) {
      this.drawMessage(context, this.error);
      return;
    }
    const map = this.map;
    const player = this.player;
    const frame = this.frame;
    if (!map || !player || !frame) {
      this.drawMessage(context, "Loading dungeon...");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const view = this.camera.view(this.canvas.width, this.canvas.height, dpr);
    const stats = adventurerConfig[player.classType];
    context.setTransform(view.scale, 0, 0, view.scale, view.originX, view.originY);
    context.imageSmoothingEnabled = false;

    for (const hallway of map.hallways) {
      const bounds = hallwayBounds(hallway);
      if (overlapsView(bounds.x, bounds.y, bounds.width, bounds.height, view)) {
        map.hallwayTiles.draw(context, hallway);
      }
    }
    for (const room of map.rooms) {
      if (overlapsView(room.x, room.y, room.width, room.height, view)) {
        context.drawImage(room.image, room.x, room.y);
      }
    }

    if (this.combat) {
      context.fillStyle = "#243044";
      for (const door of this.combat.lockedDoorTiles()) {
        context.fillRect(door.x, door.y, door.width, door.height);
      }
      this.drawExplosions(context);
    }

    if (this.debug) {
      this.drawCollisionOverlay(context, map, view);
      this.drawConnectionMarkers(context, map);
      this.drawCameraCenter(context);
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.imageSmoothingEnabled = false;
    if (this.combat) {
      for (const sprite of this.combat.worldSprites()) {
        this.drawActor(
          context,
          sprite.image,
          view,
          sprite.feetX,
          sprite.feetY,
          sprite.anchorX,
          sprite.anchorY,
          sprite.tint,
          sprite.rotation,
          sprite.scale,
          sprite.alpha,
        );
      }
      for (const slash of this.combat.goblinSlashes()) {
        this.drawSlash(context, view, slash, gameConfig.sprite.scale);
      }
      this.drawHealthBars(context, view);
    }
    const render = stats.spriteRendering;
    this.drawActor(
      context,
      frame,
      view,
      player.x,
      player.y,
      render.anchorX * frame.width + render.offsetX,
      render.anchorY * frame.height + render.offsetY,
      this.combat?.knightFlashing() ?? false,
      0,
      render.scale,
    );
    const knightSlash = this.combat?.knightSlash(player.x, player.y);
    if (knightSlash) {
      this.drawSlash(context, view, knightSlash, 1);
    }
    this.drawCritical(context, view, dpr, player.x, player.y);
    if (this.combat) {
      this.drawFireballs(context, view);
    this.drawArrows(context, view);
    }
    this.drawHearts(context, dpr);
    this.drawAbility(context, dpr);
    if (this.debug && this.combat) {
      const box = player.hitbox();
      context.strokeStyle = "#ffe14a";
      context.lineWidth = 1;
      context.strokeRect(
        box.x * view.scale + view.originX,
        box.y * view.scale + view.originY,
        box.width * view.scale,
        box.height * view.scale,
      );
      this.drawCombatDebug(context, view, player);
    }
    if (this.debug) {
      this.drawViewport(context);
      this.drawDebugText(context, player, dpr);
    }
  }

  // Spins a crescent around its own center, placed in front of the attacker.
  private drawSlash(context: CanvasRenderingContext2D, view: WorldView, slash: SlashDraw, characterScale: number): void {
    const scale = characterScale * slash.visualScale;
    const source = slash.sourceSize ?? gameConfig.sprite.frameSize;
    const exactSize = source * scale * view.scale;
    const size = Math.max(1, Math.round(exactSize));
    const bitmap = this.crispFrame(slash.image, size);
    const pivotX = (slash.pivotX / source) * size;
    const pivotY = (slash.pivotY / source) * size;
    const screenX = slash.x * view.scale + view.originX;
    const screenY = slash.y * view.scale + view.originY;
    context.save();
    context.imageSmoothingEnabled = false;
    context.globalAlpha = slash.alpha ?? 1;
    context.translate(screenX, screenY);
    context.rotate(slash.rotation);
    context.scale(slash.acrossScale ?? 1, 1);
    context.drawImage(bitmap, -pivotX, -pivotY);
    context.restore();
  }

  // Red label above the knight after a vertical swing lands as a critical.
  private drawCritical(
    context: CanvasRenderingContext2D,
    view: WorldView,
    dpr: number,
    feetX: number,
    feetY: number,
  ): void {
    const life = this.combat?.criticalTime() ?? 0;
    if (life <= 0) {
      return;
    }
    const rise = (0.9 - life) * 36;
    const screenX = feetX * view.scale + view.originX;
    const screenY = feetY * view.scale + view.originY - 78 * view.scale - rise;
    context.save();
    context.globalAlpha = life < 0.25 ? life / 0.25 : 1;
    context.font = `${Math.round(10 * dpr)}px "Press Start 2P", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = Math.max(2, Math.round(3 * dpr));
    context.strokeStyle = "#3a0000";
    context.strokeText("CRITICAL", screenX, screenY);
    context.fillStyle = "#ff2a2a";
    context.fillText("CRITICAL", screenX, screenY);
    context.restore();
  }

  // Draws a frame in device pixels, at a single rounded size so rows and columns never shimmer while moving.
  private drawActor(
    context: CanvasRenderingContext2D,
    frame: HTMLImageElement,
    view: WorldView,
    feetX: number,
    feetY: number,
    anchorX: number,
    anchorY: number,
    tint: boolean,
    rotation: number,
    scale: number,
    alpha = 1,
  ): void {
    const exactLeft = (feetX - anchorX * scale) * view.scale + view.originX;
    const exactTop = (feetY - anchorY * scale) * view.scale + view.originY;
    const width = Math.max(1, Math.round(frame.width * scale * view.scale));
    const height = Math.max(1, Math.round(frame.height * scale * view.scale));
    const left = Math.round(exactLeft);
    const top = Math.round(exactTop);
    const bitmap = tint ? this.redFrame(frame, width, height) : this.crispFrame(frame, width, height);
    const faded = alpha < 0.999;
    if (faded) {
      context.save();
      context.globalAlpha = alpha;
    }
    if (rotation === 0) {
      context.drawImage(bitmap, left, top);
      if (faded) {
        context.restore();
      }
      return;
    }
    context.save();
    context.translate(left + width / 2, top + height / 2);
    context.rotate(rotation);
    context.drawImage(bitmap, -width / 2, -height / 2);
    context.restore();
    if (faded) {
      context.restore();
    }
  }

  private redFrame(frame: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
    const key = `${frame.src}@${width}x${height}@red`;
    const cached = this.scaledSprites.get(key);
    if (cached) {
      return cached;
    }
    const source = this.crispFrame(frame, width, height);
    const dest = document.createElement("canvas");
    dest.width = width;
    dest.height = height;
    const destContext = dest.getContext("2d");
    if (!destContext) {
      return source;
    }
    destContext.imageSmoothingEnabled = false;
    destContext.drawImage(source, 0, 0);
    destContext.globalCompositeOperation = "source-atop";
    destContext.fillStyle = "#ff1a1a";
    destContext.fillRect(0, 0, width, height);
    this.scaledSprites.set(key, dest);
    return dest;
  }

  private crispFrame(frame: HTMLImageElement, width: number, height = width): HTMLCanvasElement {
    const key = `${frame.src}@${width}x${height}`;
    const cached = this.scaledSprites.get(key);
    if (cached) {
      return cached;
    }
    const source = document.createElement("canvas");
    source.width = frame.width;
    source.height = frame.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const dest = document.createElement("canvas");
    dest.width = width;
    dest.height = height;
    const destContext = dest.getContext("2d");
    if (!sourceContext || !destContext) {
      return dest;
    }
    sourceContext.drawImage(frame, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, frame.width, frame.height);
    const scaled = destContext.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(frame.height - 1, Math.floor((y * frame.height) / height));
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(frame.width - 1, Math.floor((x * frame.width) / width));
        const from = (sourceY * frame.width + sourceX) * 4;
        const to = (y * width + x) * 4;
        scaled.data[to] = pixels.data[from];
        scaled.data[to + 1] = pixels.data[from + 1];
        scaled.data[to + 2] = pixels.data[from + 2];
        scaled.data[to + 3] = pixels.data[from + 3];
      }
    }
    destContext.putImageData(scaled, 0, 0);
    this.scaledSprites.set(key, dest);
    return dest;
  }

  private drawExplosions(context: CanvasRenderingContext2D): void {
    if (!this.combat) {
      return;
    }
    for (const blast of this.combat.explosions()) {
      context.beginPath();
      context.arc(blast.x, blast.y, blast.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 140, 0, ${0.25 * blast.alpha})`;
      context.fill();
      context.strokeStyle = `rgba(255, 180, 0, ${0.75 * blast.alpha})`;
      context.lineWidth = 2;
      context.stroke();
    }
  }

  private drawFireballs(context: CanvasRenderingContext2D, view: WorldView): void {
    if (!this.combat) {
      return;
    }
    const style = combatConfig.wizard.fireball;
    for (const ball of this.combat.projectiles()) {
      const image = this.combat.fireballSprite(ball.traveled);
      if (!image) {
        continue;
      }
      const destW = Math.max(1, Math.round(style.visualWidth * view.scale));
      const destH = Math.max(1, Math.round(destW * (image.height / image.width)));
      const bitmap = this.crispFrame(image, destW, destH);
      const x = ball.x * view.scale + view.originX;
      const y = ball.y * view.scale + view.originY;
      context.save();
      context.imageSmoothingEnabled = false;
      context.translate(x, y);
      // The sprite points right, so this rotation aims the core along the shot.
      context.rotate(Math.atan2(ball.directionY, ball.directionX));
      context.drawImage(bitmap, -style.pivotX * destW, -style.pivotY * destH);
      context.restore();
    }
  }

  private drawArrows(context: CanvasRenderingContext2D, view: WorldView): void {
    if (!this.combat) {
      return;
    }
    const image = this.combat.arrowSprite();
    if (!image) {
      return;
    }
    const style = combatConfig.archerArrow;
    for (const arrow of this.combat.flyingArrows()) {
      const destW = Math.max(1, Math.round(style.visualWidth * view.scale));
      const destH = Math.max(1, Math.round(destW * (image.height / image.width)));
      const bitmap = this.crispFrame(image, destW, destH);
      const x = arrow.x * view.scale + view.originX;
      const y = arrow.y * view.scale + view.originY;
      context.save();
      context.imageSmoothingEnabled = false;
      context.translate(x, y);
      // Rotates the sprite's forward tip (archer_arrow.png points along -X) onto the flight vector.
      context.rotate(Math.atan2(arrow.directionY, arrow.directionX) - style.spriteForwardAngle);
      context.drawImage(bitmap, -style.pivotX * destW, -style.pivotY * destH);
      context.restore();
    }
  }

  private drawCombatDebug(context: CanvasRenderingContext2D, view: WorldView, player: Player): void {
    if (!this.combat) {
      return;
    }
    context.lineWidth = 1;
    for (const circle of this.combat.bodyCircles(player.x, player.y)) {
      const x = circle.x * view.scale + view.originX;
      const y = circle.y * view.scale + view.originY;
      context.strokeStyle = "#7dffb2";
      context.beginPath();
      context.arc(x, y, circle.radius * view.scale, 0, Math.PI * 2);
      context.stroke();
    }
    for (const ball of this.combat.projectiles()) {
      const x = ball.x * view.scale + view.originX;
      const y = ball.y * view.scale + view.originY;
      context.strokeStyle = "#ff9a3c";
      context.beginPath();
      context.arc(x, y, 4 * view.scale, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + ball.directionX * 28 * view.scale, y + ball.directionY * 28 * view.scale);
      context.stroke();
    }
    for (const blast of this.combat.explosions()) {
      context.strokeStyle = "#ff6a00";
      context.beginPath();
      context.arc(
        blast.x * view.scale + view.originX,
        blast.y * view.scale + view.originY,
        blast.radius * view.scale,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
    const aimX = this.aim.x * view.scale + view.originX;
    const aimY = this.aim.y * view.scale + view.originY;
    context.strokeStyle = "#ffffff";
    context.strokeRect(aimX - 3, aimY - 3, 6, 6);
    const preferred = combatConfig.archer.preferredDistance;
    for (const archer of this.combat.debugArchers()) {
      const x = archer.x * view.scale + view.originX;
      const y = archer.y * view.scale + view.originY;
      context.strokeStyle = "#d2b4ff";
      context.beginPath();
      context.arc(x, y, preferred * view.scale, 0, Math.PI * 2);
      context.stroke();
      const body = combatConfig.archer;
      context.strokeRect(
        (archer.x + body.bodyOffsetX) * view.scale + view.originX,
        (archer.y + body.bodyOffsetY) * view.scale + view.originY,
        body.bodyWidth * view.scale,
        body.bodyHeight * view.scale,
      );
    }
    for (const arrow of this.combat.flyingArrows()) {
      const x = arrow.x * view.scale + view.originX;
      const y = arrow.y * view.scale + view.originY;
      context.strokeStyle = "#ffe27a";
      context.strokeRect(x - (arrow.size / 2) * view.scale, y - (arrow.size / 2) * view.scale, arrow.size * view.scale, arrow.size * view.scale);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + arrow.directionX * 36 * view.scale, y + arrow.directionY * 36 * view.scale);
      context.stroke();
    }
    context.strokeStyle = "#7dffb2";
    for (const spawn of this.combat.debugSpawns()) {
      const x = spawn.x * view.scale + view.originX;
      const y = spawn.y * view.scale + view.originY;
      context.beginPath();
      context.moveTo(x - 6, y);
      context.lineTo(x + 6, y);
      context.moveTo(x, y - 6);
      context.lineTo(x, y + 6);
      context.stroke();
    }
    context.strokeStyle = "#ffd25a";
    for (const door of this.combat.debugDoors()) {
      context.strokeRect(door.x * view.scale + view.originX, door.y * view.scale + view.originY, door.width * view.scale, door.height * view.scale);
    }
  }

  private drawHealthBars(context: CanvasRenderingContext2D, view: WorldView): void {
    if (!this.combat) {
      return;
    }
    const width = 28 * view.scale;
    const height = Math.max(3, 4 * view.scale);
    for (const bar of this.combat.healthBars()) {
      const x = bar.x * view.scale + view.originX - width / 2;
      const y = bar.y * view.scale + view.originY;
      context.fillStyle = "#1a1a1a";
      context.fillRect(x, y, width, height);
      context.fillStyle = "#d42323";
      context.fillRect(x, y, width * bar.fraction, height);
    }
  }

  private drawHearts(context: CanvasRenderingContext2D, dpr: number): void {
    if (!this.combat) {
      return;
    }
    const size = Math.round(14 * dpr);
    const gap = Math.round(6 * dpr);
    const originX = this.canvas.width - (size * this.combat.maxHearts + gap * (this.combat.maxHearts - 1)) - Math.round(16 * dpr);
    const originY = Math.round(16 * dpr);
    for (let index = 0; index < this.combat.maxHearts; index++) {
      this.drawHeart(
        context,
        originX + index * (size + gap),
        originY,
        size,
        index < this.combat.hearts ? "#e23b3b" : "#3a3a3a",
      );
    }
  }

  // Screen-fixed ability slot. Fill comes from the combat cooldown, not a second timer.
  private drawAbility(context: CanvasRenderingContext2D, dpr: number): void {
    const combat = this.combat;
    const player = this.player;
    if (!combat || !player) {
      return;
    }
    const total = combat.attackCooldownTotal();
    const remaining = combat.attackCooldown();
    const progress = total <= 0 ? 1 : Math.max(0, Math.min(1, 1 - remaining / total));
    const ready = progress >= 1;

    const slot = Math.round(52 * dpr);
    const pad = Math.round(4 * dpr);
    const barH = Math.round(5 * dpr);
    const label = Math.round(12 * dpr);
    const x = Math.round((this.canvas.width - slot) / 2);
    const y = this.canvas.height - slot - label - Math.round(18 * dpr);

    context.fillStyle = "#140e0a";
    context.fillRect(x, y, slot, slot);
    context.strokeStyle = this.abilityGlow > 0 ? "#fff1b0" : "#8a6420";
    context.lineWidth = Math.max(2, Math.round(2 * dpr));
    context.strokeRect(x + 1, y + 1, slot - 2, slot - 2);

    const icon = slot - pad * 2 - barH - pad;
    context.save();
    context.globalAlpha = ready ? 1 : 0.45;
    if (player.classType === "wizard") {
      const image = combat.fireballSprite(0);
      if (image) {
        const bitmap = this.crispFrame(image, icon, Math.round(icon * (image.height / image.width)));
        context.drawImage(bitmap, x + pad, y + pad + (icon - bitmap.height) / 2);
      }
    } else {
      const iconX = x + Math.round((slot - icon) / 2);
      const iconTop = y + pad;
      const iconArea = slot - pad * 2 - barH - pad;
      const iconY = iconTop + Math.round((iconArea - icon) / 2);
      this.drawSwordIcon(context, iconX, iconY, icon);
    }
    context.restore();

    const barX = x + pad;
    const barY = y + slot - pad - barH;
    const barW = slot - pad * 2;
    context.fillStyle = "#2a2118";
    context.fillRect(barX, barY, barW, barH);
    context.fillStyle = ready ? "#ffe14a" : "#c8962e";
    context.fillRect(barX, barY, barW * progress, barH);

    context.font = `${Math.round(8 * dpr)}px "Press Start 2P", monospace`;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = "#f4e7c5";
    context.fillText("SPACE", x + slot / 2, y + slot + Math.round(4 * dpr));
    context.textAlign = "start";
  }

  private drawSwordIcon(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const u = size / 16;
    context.fillStyle = "#f2efe6";
    context.fillRect(x + u * 7, y, u * 2, u);
    context.fillRect(x + u * 6, y + u, u * 4, u * 8);
    context.fillStyle = "#b7b2a8";
    context.fillRect(x + u * 7, y + u * 2, u * 2, u * 6);
    context.fillStyle = "#e6b84a";
    context.fillRect(x + u * 2, y + u * 9, u * 12, u * 2);
    context.fillStyle = "#6b3a22";
    context.fillRect(x + u * 6, y + u * 11, u * 4, u * 3);
    context.fillStyle = "#c8962e";
    context.fillRect(x + u * 5, y + u * 14, u * 6, u * 2);
  }

  private drawHeart(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
    context.fillStyle = color;
    const u = size / 7;
    context.fillRect(x + u, y + u, u * 2, u * 2);
    context.fillRect(x + u * 4, y + u, u * 2, u * 2);
    context.fillRect(x, y + u * 2, u * 7, u * 2);
    context.fillRect(x + u, y + u * 4, u * 5, u);
    context.fillRect(x + u * 2, y + u * 5, u * 3, u);
    context.fillRect(x + u * 3, y + u * 6, u, u);
  }

  private drawCollisionOverlay(context: CanvasRenderingContext2D, map: DungeonMap, view: WorldView): void {
    const tile = map.tileSize;
    const x0 = Math.max(0, Math.floor(view.x / tile) - 1);
    const y0 = Math.max(0, Math.floor(view.y / tile) - 1);
    const x1 = Math.min(map.tilesX - 1, Math.floor((view.x + view.width) / tile) + 1);
    const y1 = Math.min(map.tilesY - 1, Math.floor((view.y + view.height) / tile) + 1);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        context.fillStyle = kindColor(map.kind[ty][tx]);
        context.fillRect(tx * tile, ty * tile, tile, tile);
      }
    }
  }

  private drawConnectionMarkers(context: CanvasRenderingContext2D, map: DungeonMap): void {
    for (const room of map.rooms) {
      for (const door of doorwayPoints(room)) {
        mark(context, door.x, door.y, "#ffffff");
      }
    }
    for (const hallway of map.hallways) {
      mark(context, hallway.entrance.x, hallway.entrance.y, "#3ec6ff");
      mark(context, hallway.exit.x, hallway.exit.y, "#3ec6ff");
    }
  }

  private drawCameraCenter(context: CanvasRenderingContext2D): void {
    const arm = 10;
    context.strokeStyle = "#ff4ad8";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(this.camera.x - arm, this.camera.y);
    context.lineTo(this.camera.x + arm, this.camera.y);
    context.moveTo(this.camera.x, this.camera.y - arm);
    context.lineTo(this.camera.x, this.camera.y + arm);
    context.stroke();
  }

  private drawViewport(context: CanvasRenderingContext2D): void {
    context.strokeStyle = "rgba(255, 255, 255, 0.85)";
    context.lineWidth = 2;
    context.strokeRect(8, 8, this.canvas.width - 16, this.canvas.height - 16);
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    context.beginPath();
    context.moveTo(cx - 14, cy);
    context.lineTo(cx + 14, cy);
    context.moveTo(cx, cy - 14);
    context.lineTo(cx, cy + 14);
    context.stroke();
  }

  private drawDebugText(context: CanvasRenderingContext2D, player: Player, dpr: number): void {
    const state = player.moving ? "running" : "idle";
    const rotations = this.map?.hallways.map((hallway) => `${hallway.rotation}°`).join(" ") || "none";
    const shots = this.combat?.projectiles() ?? [];
    const blasts = this.combat?.explosions() ?? [];
    const lines = [
      `class ${player.classType}   player ${player.x.toFixed(1)}, ${player.y.toFixed(1)}   facing ${player.facing}   ${state}`,
      `camera ${this.camera.x.toFixed(1)}, ${this.camera.y.toFixed(1)}   zoom ${this.camera.zoom.toFixed(2)}`,
      `mouse world ${this.aim.x.toFixed(1)}, ${this.aim.y.toFixed(1)}   cooldown ${(this.combat?.attackCooldown() ?? 0).toFixed(2)}s`,
      `fireballs ${shots.map((shot) => `${shot.traveled.toFixed(0)}/${shot.maxRange}`).join(" ") || "none"}`,
      `explosions ${blasts.map((blast) => `r${blast.radius} hits ${blast.hits}`).join(" ") || "none"}`,
      `speed ${adventurerConfig[player.classType].movementSpeed} px/s   seed ${this.map?.seed ?? "-"}`,
      `rooms ${this.map?.rooms.length ?? 0}   hallways ${this.map?.hallways.length ?? 0}   enemies ${this.combat?.livingEnemies() ?? 0}`,
      ...(this.combat?.debugArchers().map(
        (archer) =>
          `archer ${archer.state}   dist ${archer.distance.toFixed(0)}   draw ${(archer.draw * 100).toFixed(0)}%   cd ${archer.cooldown.toFixed(2)}s   since ${archer.sinceShot.toFixed(2)}s   ${archer.inRange ? "in range" : "out of range"}   ${archer.los ? "los" : "blocked"}   ${archer.hold}`,
      ) ?? []),
      `hallway rotations ${rotations}`,
      "+ / - zoom    R reset    F3 hides this overlay",
    ];
    const fontSize = Math.round(16 * dpr);
    context.font = `${fontSize}px ui-monospace, monospace`;
    context.textBaseline = "top";
    const lineHeight = Math.round(22 * dpr);
    lines.forEach((line, index) => {
      const y = Math.round(16 * dpr) + index * lineHeight;
      context.fillStyle = "rgba(0, 0, 0, 0.72)";
      context.fillRect(Math.round(12 * dpr), y - 2, context.measureText(line).width + Math.round(12 * dpr), lineHeight - 2);
      context.fillStyle = "#ffffff";
      context.fillText(line, Math.round(18 * dpr), y);
    });
  }

  private focusOffset(): number {
    const stats = adventurerConfig[this.adventurer];
    const render = stats.spriteRendering;
    const footY = render.anchorY * stats.frameHeight + render.offsetY;
    return -(footY - stats.frameHeight / 2) * render.scale;
  }

  private drawMessage(context: CanvasRenderingContext2D, message: string): void {
    const dpr = window.devicePixelRatio || 1;
    context.fillStyle = "#ffffff";
    context.font = `${Math.round(12 * dpr)}px "Press Start 2P", monospace`;
    context.textBaseline = "top";
    const maxWidth = this.canvas.width - 48 * dpr;
    const words = message.split(" ");
    let line = "";
    let y = 24 * dpr;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth) {
        context.fillText(line, 24 * dpr, y);
        line = word;
        y += 22 * dpr;
      } else {
        line = next;
      }
    }
    if (line) {
      context.fillText(line, 24 * dpr, y);
    }
  }
}

function overlapsView(x: number, y: number, width: number, height: number, view: WorldView): boolean {
  return x < view.x + view.width && x + width > view.x && y < view.y + view.height && y + height > view.y;
}

function kindColor(kind: number): string {
  if (kind === TileRoomWall) return "rgba(220, 40, 40, 0.4)";
  if (kind === TileRoomFloor) return "rgba(40, 180, 70, 0.16)";
  if (kind === TileHallWall) return "rgba(255, 140, 0, 0.5)";
  if (kind === TileHallFloor) return "rgba(40, 140, 255, 0.28)";
  if (kind === TileVoid) return "rgba(120, 0, 0, 0.28)";
  return "rgba(255, 255, 255, 0.2)";
}

function doorwayPoints(room: { x: number; y: number; width: number; height: number; doors: number }): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  if (room.doors & North) points.push({ x: room.x + room.width / 2, y: room.y });
  if (room.doors & East) points.push({ x: room.x + room.width, y: room.y + room.height / 2 });
  if (room.doors & South) points.push({ x: room.x + room.width / 2, y: room.y + room.height });
  if (room.doors & West) points.push({ x: room.x, y: room.y + room.height / 2 });
  return points;
}

function mark(context: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  context.fillStyle = color;
  context.fillRect(x - 4, y - 4, 8, 8);
}

function loadSprites(urls: string[]): Promise<Map<string, HTMLImageElement>> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve([url, image]);
          image.onerror = () => reject(new Error(`Could not load ${url}`));
          image.src = url;
        }),
    ),
  ).then((entries) => new Map(entries));
}

export type { Facing };
