import { gameConfig } from "../config/gameConfig";
import { allSpriteUrls, type Facing } from "../config/spriteConfig";
import { AnimationController } from "./AnimationController";
import { CollisionSystem } from "./CollisionSystem";
import { DungeonMap } from "./DungeonMap";
import { InputManager } from "./InputManager";
import { Player } from "./Player";

export class Game {
  private map: DungeonMap | null = null;
  private player: Player | null = null;
  private animation: AnimationController | null = null;
  private input: InputManager;
  private collision = new CollisionSystem();
  private frame: HTMLImageElement | null = null;
  private running = false;
  private disposed = false;
  private lastTime = 0;
  private debug = false;
  private error: string | null = null;
  private onResize: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.input = new InputManager(() => {
      this.debug = !this.debug;
    });
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
  }

  async start(): Promise<void> {
    try {
      const [map, images] = await Promise.all([DungeonMap.load(), loadSprites(allSpriteUrls)]);
      this.map = map;
      const spawn = map.findSpawn();
      this.player = new Player(spawn.x, spawn.y);
      this.animation = new AnimationController(images);
      this.frame = this.animation.update(this.player.facing, false, 0);
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

    const fit = Math.min(this.canvas.width / map.width, this.canvas.height / map.height);
    // Integer scale keeps pixels square when the dungeon fits. Smaller windows
    // fall back to a uniform fractional scale instead of stretching.
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    const originX = (this.canvas.width - map.width * scale) / 2;
    const originY = (this.canvas.height - map.height * scale) / 2;

    context.save();
    context.translate(originX, originY);
    context.scale(scale, scale);
    context.fillStyle = gameConfig.corridorColor;
    for (const corridor of map.corridors) {
      context.fillRect(corridor.x, corridor.y, corridor.width, corridor.height);
    }
    for (const room of map.rooms) {
      context.drawImage(room.image, room.x, room.y);
    }

    if (this.debug) {
      this.drawCollisionOverlay(context, map);
    }

    context.drawImage(
      frame,
      player.x - gameConfig.sprite.footAnchorX,
      player.y - gameConfig.sprite.footAnchorY,
    );
    if (this.debug) {
      const box = player.hitbox();
      context.strokeStyle = "#ffe14a";
      context.lineWidth = 1;
      context.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
    }
    context.restore();

    if (this.debug) {
      this.drawDebugText(context, player, scale);
    }
  }

  private drawCollisionOverlay(context: CanvasRenderingContext2D, map: DungeonMap): void {
    for (let ty = 0; ty < map.tilesY; ty++) {
      for (let tx = 0; tx < map.tilesX; tx++) {
        context.fillStyle = map.solid[ty][tx] ? "rgba(220, 40, 40, 0.38)" : "rgba(40, 180, 70, 0.14)";
        context.fillRect(tx * map.tileSize, ty * map.tileSize, map.tileSize, map.tileSize);
      }
    }
  }

  private drawDebugText(
    context: CanvasRenderingContext2D,
    player: Player,
    scale: number,
  ): void {
    const state = player.moving ? "running" : "idle";
    const lines = [
      `x ${player.x.toFixed(1)}   y ${player.y.toFixed(1)}`,
      `facing ${player.facing}`,
      `animation ${state}`,
      `speed ${gameConfig.moveSpeed} px/s`,
      `seed ${this.map?.seed ?? "-"}   rooms ${this.map?.rooms.length ?? 0}`,
      `scale ${scale.toFixed(2)}`,
      "F3 hides this overlay",
    ];
    context.font = "16px ui-monospace, monospace";
    context.textBaseline = "top";
    lines.forEach((line, index) => {
      const y = 16 + index * 22;
      context.fillStyle = "rgba(0, 0, 0, 0.7)";
      context.fillRect(12, y - 2, context.measureText(line).width + 12, 20);
      context.fillStyle = "#ffffff";
      context.fillText(line, 18, y);
    });
  }

  private drawMessage(context: CanvasRenderingContext2D, message: string): void {
    context.fillStyle = "#ffffff";
    context.font = "16px ui-monospace, monospace";
    context.textBaseline = "top";
    const maxWidth = this.canvas.width - 48;
    const words = message.split(" ");
    let line = "";
    let y = 24;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth) {
        context.fillText(line, 24, y);
        line = word;
        y += 22;
      } else {
        line = next;
      }
    }
    if (line) {
      context.fillText(line, 24, y);
    }
  }
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
