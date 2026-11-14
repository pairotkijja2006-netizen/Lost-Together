import type { DungeonMap } from "./DungeonMap";
import type { Rect } from "./Player";

// Largest single step. The room walls are one 32px tile thick, so a step
// smaller than that cannot skip over a wall between frames.
const MAX_STEP = 8;

export class CollisionSystem {
  // Moves the hitbox by dx/dy. A blocked axis is dropped so the other axis
  // can still slide along the wall.
  // Returns how far the body can move. Callers add this to their own foot position,
  // so a different sprite scale does not get converted back through the knight's offset.
  move(map: DungeonMap, box: Rect, dx: number, dy: number): { x: number; y: number } {
    const x = slide(map, box, dx, true);
    const y = slide(map, { ...box, x }, dy, false);
    return {
      x: x - box.x,
      y: y - box.y,
    };
  }
}

function slide(map: DungeonMap, box: Rect, delta: number, horizontal: boolean): number {
  let position = horizontal ? box.x : box.y;
  if (delta === 0) {
    return position;
  }
  let remaining = delta;

  const direction = Math.sign(remaining);
  while (Math.abs(remaining) > 0.0001) {
    const step = direction * Math.min(Math.abs(remaining), MAX_STEP);
    if (blocked(map, box, horizontal, position + step)) {
      // The full step hits a wall. Move up to the wall instead of leaving a gap.
      let low = 0;
      let high = Math.abs(step);
      for (let i = 0; i < 6; i++) {
        const mid = (low + high) / 2;
        if (blocked(map, box, horizontal, position + direction * mid)) {
          high = mid;
        } else {
          low = mid;
        }
      }
      position += direction * low;
      break;
    }
    position += step;
    remaining -= step;
  }
  return position;
}

function blocked(map: DungeonMap, box: Rect, horizontal: boolean, edge: number): boolean {
  const nextX = horizontal ? edge : box.x;
  const nextY = horizontal ? box.y : edge;
  return map.overlapsSolid(nextX, nextY, box.width, box.height);
}
