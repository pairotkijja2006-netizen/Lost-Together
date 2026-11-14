import { cameraConfig } from "../config/cameraConfig";
import { combatSpriteUrls } from "../config/combatConfig";
import { gameConfig } from "../config/gameConfig";
import { allSpriteUrls, type Facing } from "../config/spriteConfig";
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
  private error: string | null = null;
  private onResize: () => void;
  // Integer-scaled copies of each frame, so the plume is not shaved off while moving.
  private scaledSprites = new Map<string, HTMLCanvasElement>();

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new InputManager(
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
        loadSprites(allSpriteUrls),
        loadSprites(combatSpriteUrls),
      ]);
      this.map = map;
      this.combat = new Combat(map, combatImages, this.collision);
      const spawn = map.findSpawn();
      this.player = new Player(spawn.x, spawn.y);
      this.animation = new AnimationController(images);
      this.frame = this.animation.update(this.player.facing, false, 0);
      this.camera.snap(spawn.x, spawn.y + cameraFocusOffset());
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

    const axis = this.input.axis();
    if (axis.facing) {
      player.facing = axis.facing;
      player.moving = true;
      const next = this.collision.move(
        map,
        player.hitbox(),
        axis.x * gameConfig.moveSpeed * dt,
        axis.y * gameConfig.moveSpeed * dt,
      );
      player.x = next.x;
      player.y = next.y;
    } else {
      player.moving = false;
    }

    const placed = this.combat?.update(dt, player.x, player.y, player.facing, this.input.consumeAttack());
    if (placed) {
      const dx = placed.x - player.x;
      const dy = placed.y - player.y;
      if (dx !== 0 || dy !== 0) {
        player.x = placed.x;
        player.y = placed.y;
        this.camera.shift(dx, dy);
      }
    }
    this.camera.update(dt, player.x, player.y + cameraFocusOffset());
    this.frame = animation.update(player.facing, player.moving, dt);
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
        this.drawActor(context, sprite.image, view, sprite.feetX, sprite.feetY, sprite.anchorX, sprite.anchorY, sprite.tint, sprite.rotation);
      }
      for (const slash of this.combat.goblinSlashes()) {
        this.drawSlash(context, view, slash);
      }
      this.drawHealthBars(context, view);
    }
    this.drawActor(
      context,
      frame,
      view,
      player.x,
      player.y,
      gameConfig.sprite.footAnchorX,
      gameConfig.sprite.footAnchorY,
      this.combat?.knightFlashing() ?? false,
      0,
    );
    const slash = this.combat?.knightSlash(player.x, player.y);
    if (slash) {
      this.drawSlash(context, view, slash);
    }
    this.drawHearts(context, dpr);
    if (this.debug) {
      const box = player.hitbox();
      context.strokeStyle = "#ffe14a";
      context.lineWidth = 1;
      context.strokeRect(
        box.x * view.scale + view.originX,
        box.y * view.scale + view.originY,
        box.width * view.scale,
        box.height * view.scale,
      );
    }
    if (this.debug) {
      this.drawViewport(context);
      this.drawDebugText(context, player, dpr);
    }
  }

  // Spins the crescent around its own center, placed in front of the attacker.
  private drawSlash(context: CanvasRenderingContext2D, view: WorldView, slash: SlashDraw): void {
    const scale = gameConfig.sprite.scale * slash.visualScale;
    const exactSize = gameConfig.sprite.frameSize * scale * view.scale;
    const size = Math.max(1, Math.round(exactSize));
    const bitmap = this.crispFrame(slash.image, size);
    const pivotX = (slash.pivotX / gameConfig.sprite.frameSize) * size;
    const pivotY = (slash.pivotY / gameConfig.sprite.frameSize) * size;
    const screenX = slash.x * view.scale + view.originX;
    const screenY = slash.y * view.scale + view.originY;
    context.save();
    context.imageSmoothingEnabled = false;
    context.translate(screenX, screenY);
    context.rotate(slash.rotation);
    context.drawImage(bitmap, -pivotX, -pivotY);
    context.restore();
  }

  // Draws a frame in device pixels, expanded to the outer pixel so the top is not shaved off.
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
  ): void {
    const scale = gameConfig.sprite.scale;
    const exactLeft = (feetX - anchorX * scale) * view.scale + view.originX;
    const exactTop = (feetY - anchorY * scale) * view.scale + view.originY;
    const exactSize = gameConfig.sprite.frameSize * scale * view.scale;
    const left = Math.floor(exactLeft);
    const top = Math.floor(exactTop);
    const size = Math.max(
      1,
      Math.ceil(exactLeft + exactSize) - left,
      Math.ceil(exactTop + exactSize) - top,
    );
    const bitmap = tint ? this.redFrame(frame, size) : this.crispFrame(frame, size);
    if (rotation === 0) {
      context.drawImage(bitmap, left, top);
      return;
    }
    context.save();
    context.translate(left + size / 2, top + size / 2);
    context.rotate(rotation);
    context.drawImage(bitmap, -size / 2, -size / 2);
    context.restore();
  }

  private redFrame(frame: HTMLImageElement, size: number): HTMLCanvasElement {
    const key = `${frame.src}@${size}@red`;
    const cached = this.scaledSprites.get(key);
    if (cached) {
      return cached;
    }
    const source = this.crispFrame(frame, size);
    const dest = document.createElement("canvas");
    dest.width = size;
    dest.height = size;
    const destContext = dest.getContext("2d");
    if (!destContext) {
      return source;
    }
    destContext.imageSmoothingEnabled = false;
    destContext.drawImage(source, 0, 0);
    destContext.globalCompositeOperation = "source-atop";
    destContext.fillStyle = "#ff1a1a";
    destContext.fillRect(0, 0, size, size);
    this.scaledSprites.set(key, dest);
    return dest;
  }

  private crispFrame(frame: HTMLImageElement, size: number): HTMLCanvasElement {
    const key = `${frame.src}@${size}`;
    const cached = this.scaledSprites.get(key);
    if (cached) {
      return cached;
    }
    const source = document.createElement("canvas");
    source.width = frame.width;
    source.height = frame.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const dest = document.createElement("canvas");
    dest.width = size;
    dest.height = size;
    const destContext = dest.getContext("2d");
    if (!sourceContext || !destContext) {
      return dest;
    }
    sourceContext.drawImage(frame, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, frame.width, frame.height);
    const scaled = destContext.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const sourceY = Math.min(frame.height - 1, Math.floor((y * frame.height) / size));
      for (let x = 0; x < size; x++) {
        const sourceX = Math.min(frame.width - 1, Math.floor((x * frame.width) / size));
        const from = (sourceY * frame.width + sourceX) * 4;
        const to = (y * size + x) * 4;
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
    const lines = [
      `player ${player.x.toFixed(1)}, ${player.y.toFixed(1)}   facing ${player.facing}   ${state}`,
      `camera ${this.camera.x.toFixed(1)}, ${this.camera.y.toFixed(1)}   zoom ${this.camera.zoom.toFixed(2)}`,
      `speed ${gameConfig.moveSpeed} px/s   seed ${this.map?.seed ?? "-"}`,
      `rooms ${this.map?.rooms.length ?? 0}   hallways ${this.map?.hallways.length ?? 0}`,
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

  private drawMessage(context: CanvasRenderingContext2D, message: string): void {
    const dpr = window.devicePixelRatio || 1;
    context.fillStyle = "#ffffff";
    context.font = `${Math.round(16 * dpr)}px ui-monospace, monospace`;
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

function cameraFocusOffset(): number {
  return cameraConfig.focusOffsetY * gameConfig.sprite.scale;
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
