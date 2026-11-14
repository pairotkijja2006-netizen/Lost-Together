export type ZoomAction = "in" | "out" | "reset";

// World pixels are multiplied by `zoom` when drawn. Lower values show more of the dungeon.
export const cameraConfig = {
  zoom: 0.8,
  minZoom: 0.4,
  maxZoom: 6,
  zoomStep: 0.25,
  // Higher values catch the player sooner. 12 settles in about a tenth of a second.
  follow: 12,
  // How far above the feet the camera aims, at sprite scale 1. Smaller sprites use a shorter offset.
  focusOffsetY: -51,
};
