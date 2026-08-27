import { DIRS8 } from './grid.js';

// Dijkstra maps: the roguelike community's favourite pathfinding trick.
//
// Flood-fill outward from a set of goals once per turn, and every monster on
// the level can path by simply stepping to its lowest-valued neighbour. One
// O(cells) pass replaces N separate A* searches, and inverting the map (see
// `fleeMap`) turns "chase the player" into "run away from the player" for free.
export const UNREACHABLE = 0x3fffffff;

export function dijkstraMap(width, height, goals, isPassable) {
  const dist = new Int32Array(width * height).fill(UNREACHABLE);
  const queue = [];

  for (const [gx, gy] of goals) {
    if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
    dist[gy * width + gx] = 0;
    queue.push(gx, gy);
  }

  // Uniform step cost, so a plain BFS queue is already in sorted order.
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const d = dist[y * width + x];

    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const i = ny * width + nx;
      if (dist[i] <= d + 1) continue;
      if (!isPassable(nx, ny)) continue;
      dist[i] = d + 1;
      queue.push(nx, ny);
    }
  }

  return dist;
}

/** Neighbour with the lowest value, or null if nothing improves on here. */
export function stepDownhill(dist, width, height, x, y, rng) {
  let best = dist[y * width + x];
  let candidates = [];

  for (const [dx, dy] of DIRS8) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const value = dist[ny * width + nx];
    if (value === UNREACHABLE) continue;
    if (value < best) {
      best = value;
      candidates = [[dx, dy]];
    } else if (value === best && candidates.length) {
      candidates.push([dx, dy]);
    }
  }

  if (!candidates.length) return null;
  return rng ? rng.pick(candidates) : candidates[0];
}
