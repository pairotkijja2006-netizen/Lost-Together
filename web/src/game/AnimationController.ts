import { gameConfig } from "../config/gameConfig";
import type { DirectionSprites, Facing } from "../config/spriteConfig";

export class AnimationController {
  private frame = 0;
  private elapsed = 0;
  private key = "";

  constructor(
    private images: Map<string, HTMLImageElement>,
    private sprites: Record<Facing, DirectionSprites>,
    // Seconds each idle frame is held. 0 keeps idle on the shared run rate.
    private idleHold = 0,
  ) {}

  // Advances the run cycle from delta time. Idle frames stay crisp without blending two sprites together.
  update(facing: Facing, moving: boolean, dt: number): HTMLImageElement {
    const sprites = this.sprites[facing];
    const urls = moving ? sprites.run : sprites.idle;
    const key = `${moving ? "run" : "idle"}:${facing}`;
    if (key !== this.key) {
      this.key = key;
      this.frame = 0;
      this.elapsed = 0;
    }

    const holding = !moving && this.idleHold > 0 && urls.length > 1;
    const frameTime = holding ? this.idleHold : 1 / gameConfig.animationFps;
    if (urls.length > 1) {
      this.elapsed += dt;
      while (this.elapsed >= frameTime) {
        this.elapsed -= frameTime;
        this.frame = (this.frame + 1) % urls.length;
      }
    }

    const image = this.images.get(urls[this.frame]);
    if (!image) {
      throw new Error(`Missing sprite ${urls[this.frame]}`);
    }
    return image;
  }
}
