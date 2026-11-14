import type { DungeonMap } from "./DungeonMap";

export interface CircleBody {
  x: number;
  y: number;
  radius: number;
}

// Pushes overlapping foot-circles apart without moving anyone into a wall.
// The player keeps most of their position so movement stays responsive.
export function separateBodies(map: DungeonMap, player: CircleBody, others: CircleBody[]): void {
  const ordered = [...others].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const other of ordered) {
    pushApart(map, player, other, 0.2);
  }
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      pushApart(map, ordered[i], ordered[j], 0.5);
    }
  }
}

function pushApart(map: DungeonMap, a: CircleBody, b: CircleBody, aShare: number): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  const minimum = a.radius + b.radius;
  if (distance >= minimum - 0.05) {
    return;
  }
  if (distance < 0.001) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  const nx = dx / distance;
  const ny = dy / distance;
  const penetration = minimum - distance;
  const moveA = penetration * aShare;
  const moveB = penetration * (1 - aShare);
  const aMoved = slideBody(map, a, -nx * moveA, -ny * moveA);
  const bMoved = slideBody(map, b, nx * moveB, ny * moveB);
  // If a wall blocked one side, give the leftover gap to the side that can still move.
  if (aMoved < moveA - 0.05) {
    slideBody(map, b, nx * (moveA - aMoved), ny * (moveA - aMoved));
  }
  if (bMoved < moveB - 0.05) {
    slideBody(map, a, -nx * (moveB - bMoved), -ny * (moveB - bMoved));
  }
}

// Returns how far the body actually moved along this correction.
function slideBody(map: DungeonMap, body: CircleBody, dx: number, dy: number): number {
  if (dx === 0 && dy === 0) {
    return 0;
  }
  if (!feetBlocked(map, body, body.x + dx, body.y + dy)) {
    body.x += dx;
    body.y += dy;
    return Math.hypot(dx, dy);
  }
  if (!feetBlocked(map, body, body.x + dx, body.y)) {
    body.x += dx;
    return Math.abs(dx);
  }
  if (!feetBlocked(map, body, body.x, body.y + dy)) {
    body.y += dy;
    return Math.abs(dy);
  }
  return 0;
}

// Tests the foot box, not the whole sprite, and refuses a push into a wall.
function feetBlocked(map: DungeonMap, body: CircleBody, x: number, y: number): boolean {
  return map.overlapsSolid(x - body.radius, y - body.radius, body.radius * 2, body.radius);
}
