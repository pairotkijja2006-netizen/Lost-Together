import { cameraConfig, type ZoomAction } from "../config/cameraConfig";

export interface WorldView {
  scale: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Camera {
  // World position that maps to the center of the canvas.
  x = 0;
  y = 0;
  zoom = cameraConfig.zoom;

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  // Moves the focus with the player so a small correction does not jerk the view.
  shift(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  update(dt: number, focusX: number, focusY: number): void {
    const blend = 1 - Math.exp(-cameraConfig.follow * dt);
    this.x += (focusX - this.x) * blend;
    this.y += (focusY - this.y) * blend;
  }

  adjustZoom(action: ZoomAction): void {
    if (action === "reset") {
      this.zoom = cameraConfig.zoom;
      return;
    }
    const step = action === "in" ? cameraConfig.zoomStep : -cameraConfig.zoomStep;
    const next = this.zoom + step;
    this.zoom = Math.min(cameraConfig.maxZoom, Math.max(cameraConfig.minZoom, next));
  }

  // CSS-pixel mouse position to world pixels. Zoom is the camera zoom, not the device-pixel scale.
  screenToWorld(cssX: number, cssY: number, cssWidth: number, cssHeight: number): { x: number; y: number } {
    return {
      x: (cssX - cssWidth / 2) / this.zoom + this.x,
      y: (cssY - cssHeight / 2) / this.zoom + this.y,
    };
  }

  // Screen position is (world - camera) * zoom, in device pixels, plus the canvas center.
  view(canvasWidth: number, canvasHeight: number, dpr: number): WorldView {
    const scale = this.zoom * dpr;
    const originX = Math.round(canvasWidth / 2 - this.x * scale);
    const originY = Math.round(canvasHeight / 2 - this.y * scale);
    return {
      scale,
      originX,
      originY,
      x: -originX / scale,
      y: -originY / scale,
      width: canvasWidth / scale,
      height: canvasHeight / scale,
    };
  }
}
