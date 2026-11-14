import type { ZoomAction } from "../config/cameraConfig";
import type { Facing } from "../config/spriteConfig";

const MOVE_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

export interface MoveAxis {
  x: number;
  y: number;
  facing: Facing | null;
}

export class InputManager {
  private held = new Set<string>();
  private onKeyDown: (event: KeyboardEvent) => void;
  private onKeyUp: (event: KeyboardEvent) => void;
  private onBlur: () => void;
  private onDebug: () => void;
  private onZoom: (action: ZoomAction) => void;
  private attackPressed = false;

  constructor(onDebug: () => void, onZoom: (action: ZoomAction) => void) {
    this.onDebug = onDebug;
    this.onZoom = onZoom;
    this.onKeyDown = (event) => {
      if (event.code === "F3") {
        event.preventDefault();
        if (!event.repeat) {
          this.onDebug();
        }
        return;
      }
      if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
        event.preventDefault();
        this.onZoom("in");
        return;
      }
      if (event.key === "-" || event.key === "_" || event.code === "Minus" || event.code === "NumpadSubtract") {
        event.preventDefault();
        this.onZoom("out");
        return;
      }
      if (event.code === "KeyR") {
        event.preventDefault();
        if (!event.repeat) {
          this.onZoom("reset");
        }
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          this.attackPressed = true;
        }
        return;
      }
      if (!MOVE_CODES.has(event.code)) {
        return;
      }
      // Keep the page from scrolling while the player is moving.
      event.preventDefault();
      this.held.add(event.code);
    };
    this.onKeyUp = (event) => {
      this.held.delete(event.code);
    };
    this.onBlur = () => {
      this.held.clear();
      this.attackPressed = false;
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.held.clear();
  }

  consumeAttack(): boolean {
    const pressed = this.attackPressed;
    this.attackPressed = false;
    return pressed;
  }

  // Unit vector. Diagonals are divided by sqrt(2) so they are not faster.
  axis(): MoveAxis {
    const x = (this.held.has("KeyD") ? 1 : 0) - (this.held.has("KeyA") ? 1 : 0);
    const y = (this.held.has("KeyS") ? 1 : 0) - (this.held.has("KeyW") ? 1 : 0);
    if (x === 0 && y === 0) {
      return { x: 0, y: 0, facing: null };
    }
    const length = Math.hypot(x, y);
    return {
      x: x / length,
      y: y / length,
      facing: facingFrom(x, y),
    };
  }
}

function facingFrom(x: number, y: number): Facing {
  if (y < 0 && x < 0) return "up-left";
  if (y < 0 && x > 0) return "up-right";
  if (y > 0 && x < 0) return "down-left";
  if (y > 0 && x > 0) return "down-right";
  if (y < 0) return "up";
  if (y > 0) return "down";
  if (x < 0) return "left";
  return "right";
}
