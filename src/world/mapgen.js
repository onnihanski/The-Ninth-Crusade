import { Grid, DIRS8 } from '../engine/grid.js';
import { Tiles } from './tiles.js';

// ---------------------------------------------------------------------------
// Level generation, one shape per region.
//
// Four regions that all had the same floor plan was the game's biggest missed
// opportunity: the palette and the monsters changed, and the place did not.
// Each generator below owns a silhouette, and every one of them must hand back
// a fully connected map -- that invariant is what the rest of the game leans
// on, and the test suite checks it across sixty seeds per region.
// ---------------------------------------------------------------------------

const GENERATORS = {
  siegeYards: siegeYards,
  reliquary: catacombs,
  choir: cathedral,
  emptyTomb: caves,
};

/**
 * @param {object} options
 *   region     the region definition, which picks the silhouette
 *   bossFloor  reserve and carve a sealed arena with a single door
 */
export function generateLevel(rng, width, height, options = {}) {
  const { region, bossFloor = false } = options;
  const build = GENERATORS[region?.key] ?? siegeYards;

  // The arena is reserved before anything else is drawn, so the region
  // generator simply never uses that ground and the arena cannot end up
  // straddling a corridor it would have to cut.
  const reserved = bossFloor ? reserveArena(rng, width, height) : null;

  const tiles = new Grid(width, height, Tiles.wall);
  const rooms = build(rng, tiles, width, height, reserved);

  if (!rooms.length) return generateLevel(rng, width, height, options);

  if (!reserved) {
    const last = rooms[rooms.length - 1];
    tiles.set(last.cx, last.cy, Tiles.stairsDown);
    return { tiles, rooms, stairs: { x: last.cx, y: last.cy }, bossRoom: null, door: null };
  }

  const door = openArena(tiles, reserved, rooms);
  if (!door) return generateLevel(rng, width, height, options);

  // Walling the ring can have severed a corridor that ran across the reserved
  // ground. Put the floor back together before anyone has to walk it.
  reconnectOutside(tiles, reserved, width, height);

  tiles.set(reserved.cx, reserved.cy, Tiles.stairsDown);
  return {
    tiles, rooms,
    stairs: { x: reserved.cx, y: reserved.cy },
    bossRoom: reserved,
    door,
  };
}

// -- The Siege Yards: rooms and corridors ------------------------------------
//
// The original, and right for a place built by an army in a hurry: rectangles
// with paths trodden between them.
function siegeYards(rng, tiles, width, height, reserved) {
  const rooms = [];
  for (let attempt = 0; attempt < 80 && rooms.length < 26; attempt++) {
    const room = randomRoom(rng, width, height, 5, 11, 4, 9);
    if (!fits(room, rooms, reserved, 1)) continue;
    carveRoom(tiles, room);
    if (rooms.length) connect(tiles, rooms[rooms.length - 1], room, rng);
    rooms.push(room);
  }
  return rooms;
}

// -- The Reliquary: catacombs ------------------------------------------------
//
// Many small chambers, packed tight, with more ways between them than you can
// hold in your head. Filed, in other words.
function catacombs(rng, tiles, width, height, reserved) {
  const rooms = [];
  for (let attempt = 0; attempt < 260 && rooms.length < 34; attempt++) {
    const room = randomRoom(rng, width, height, 3, 6, 3, 5);
    if (!fits(room, rooms, reserved, 1)) continue;
    carveRoom(tiles, room);
    if (rooms.length) {
      connect(tiles, rooms[rooms.length - 1], room, rng);
      // Extra doorways back into the warren, so it loops instead of branching.
      if (rooms.length > 2 && rng.chance(0.45)) {
        connect(tiles, rng.pick(rooms.slice(0, -1)), room, rng);
      }
    }
    rooms.push(room);
  }
  return rooms;
}

// -- The Choir: cathedral halls ----------------------------------------------
//
// Few rooms, enormous ones, joined by aisles two tiles wide, with pillars
// standing in the open floor. Built to carry a voice.
function cathedral(rng, tiles, width, height, reserved) {
  const rooms = [];
  for (let attempt = 0; attempt < 120 && rooms.length < 8; attempt++) {
    const room = randomRoom(rng, width, height, 11, 19, 7, 12);
    if (!fits(room, rooms, reserved, 2)) continue;
    carveRoom(tiles, room);
    if (rooms.length) {
      const previous = rooms[rooms.length - 1];
      connect(tiles, previous, room, rng);
      connect(tiles, previous, room, rng, 1);   // second lane, one tile over
    }
    rooms.push(room);
  }

  // Pillars: single blocks well inside a hall, which break line of sight
  // without ever closing a path.
  for (const room of rooms) {
    if (room.w < 9 || room.h < 6) continue;
    for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) {
        if (x === room.cx && y === room.cy) continue;
        tiles.set(x, y, Tiles.wall);
      }
    }
  }
  return rooms;
}

// -- The Empty Tomb: caves ---------------------------------------------------
//
// Not built by anyone. Cellular automata, then everything but the largest
// cavern is filled back in, which is what guarantees the floor is walkable end
// to end without a single corridor being drawn.
function caves(rng, tiles, width, height, reserved) {
  const WALL_CHANCE = 0.45;
  const PASSES = 4;

  let cells = new Grid(width, height, true);
  cells.forEach((x, y) => {
    const edge = x < 1 || y < 1 || x >= width - 1 || y >= height - 1;
    cells.set(x, y, edge ? true : rng.chance(WALL_CHANCE));
  });

  for (let pass = 0; pass < PASSES; pass++) {
    const next = new Grid(width, height, true);
    cells.forEach((x, y) => {
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return;
      let walls = 0;
      for (const [dx, dy] of DIRS8) if (cells.get(x + dx, y + dy) !== false) walls++;
      next.set(x, y, walls >= 5);
    });
    cells = next;
  }

  if (reserved) blockOut(cells, reserved, 2);

  const region = largestCavern(cells, width, height);
  if (region.length < width * height * 0.16) return [];   // too cramped; regenerate

  for (const [x, y] of region) tiles.set(x, y, Tiles.floor);
  return pocketsFrom(region, rng, width);
}

function largestCavern(cells, width, height) {
  const seen = new Grid(width, height, false);
  let best = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (cells.get(x, y) !== false || seen.get(x, y)) continue;
      const region = [];
      const queue = [[x, y]];
      seen.set(x, y, true);
      for (let head = 0; head < queue.length; head++) {
        const [cx, cy] = queue[head];
        region.push([cx, cy]);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (cells.get(nx, ny) !== false || seen.get(nx, ny)) continue;
          seen.set(nx, ny, true);
          queue.push([nx, ny]);
        }
      }
      if (region.length > best.length) best = region;
    }
  }
  return best;
}

/**
 * Caves have no rooms, but the rest of the game asks for some: where to start
 * the player, where to scatter monsters, where a predecessor is waiting. These
 * are open pockets spread across the cavern, kept apart so the floor populates
 * evenly instead of piling everything into one corner.
 */
function pocketsFrom(region, rng, width) {
  const MIN_GAP = 9;
  const pockets = [];
  const shuffled = rng.shuffle([...region]);

  for (const [x, y] of shuffled) {
    if (pockets.length >= 18) break;
    if (pockets.some((p) => Math.abs(p.cx - x) + Math.abs(p.cy - y) < MIN_GAP)) continue;
    pockets.push({ x: x - 1, y: y - 1, w: 3, h: 3, cx: x, cy: y });
  }
  void width;
  return pockets;
}

// -- The boss arena ----------------------------------------------------------

/** A rectangle set aside before anything else is drawn on the map. */
function reserveArena(rng, width, height) {
  const w = rng.int(11, 15);
  const h = rng.int(7, 9);
  const x = rng.int(2, width - w - 3);
  const y = rng.int(2, height - h - 3);
  return { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), arena: true };
}

/**
 * Carve the arena and cut exactly one way in. Everything on the ring around it
 * is walled afterwards, so however the corridor wandered there is precisely one
 * door -- which is the whole point: a fight you choose to start and cannot walk
 * out of.
 */
function openArena(tiles, arena, rooms) {
  carveRoom(tiles, arena);

  const target = nearestFloorOutside(tiles, arena);
  if (!target) return null;

  carveLine(tiles, arena.cx, arena.cy, target.x, target.y);

  // The ring is every tile immediately around the arena. Keep the one nearest
  // the corridor as the door; wall the rest.
  const ring = ringAround(arena, tiles);
  const opened = ring.filter(([x, y]) => tiles.get(x, y)?.walkable);
  if (!opened.length) return null;

  let door = opened[0];
  let bestDistance = Infinity;
  for (const [x, y] of opened) {
    const distance = Math.abs(x - target.x) + Math.abs(y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      door = [x, y];
    }
  }

  for (const [x, y] of ring) {
    if (x === door[0] && y === door[1]) continue;
    tiles.set(x, y, Tiles.wall);
  }
  tiles.set(door[0], door[1], Tiles.door);

  void rooms;
  return { x: door[0], y: door[1] };
}

// Cardinals only: a tunnel dug on the diagonal reads as a mistake even though
// the game would let you walk it.
const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Rejoin whatever the ring cut off.
 *
 * The arena is reserved before the region generator runs, so no *room* is ever
 * drawn on that ground -- `fits` sees to that. The corridors between rooms are
 * not checked against it, though, and one that happened to thread across the
 * reserved rectangle is cut in half the moment the ring is walled. The floor is
 * then in two pieces with the arena opening onto only one of them, and a
 * crusader who arrives on the wrong side can reach neither the gate nor the
 * boss nor anything else: a dead run on a floor that looks perfectly ordinary.
 *
 * So dig the shortest way from each stranded piece back to the largest one,
 * around the arena rather than through it. The arena and its ring are off
 * limits to the digging, which is what keeps the fight to exactly one door.
 */
function reconnectOutside(tiles, arena, width, height) {
  const offLimits = (x, y) => within(arena, x, y, 1);
  const walkableOutside = (x, y) => !offLimits(x, y) && Boolean(tiles.get(x, y)?.walkable);

  // Label the ground outside the arena, piece by piece.
  const label = new Int32Array(width * height).fill(-1);
  const members = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (label[y * width + x] !== -1 || !walkableOutside(x, y)) continue;
      const id = members.length;
      const cells = [];
      const stack = [x, y];
      label[y * width + x] = id;
      while (stack.length) {
        const cy = stack.pop();
        const cx = stack.pop();
        cells.push([cx, cy]);
        for (const [dx, dy] of DIRS8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!tiles.inBounds(nx, ny) || label[ny * width + nx] !== -1) continue;
          if (!walkableOutside(nx, ny)) continue;
          label[ny * width + nx] = id;
          stack.push(nx, ny);
        }
      }
      members.push(cells);
    }
  }
  if (members.length <= 1) return;

  let main = 0;
  for (let i = 1; i < members.length; i++) {
    if (members[i].length > members[main].length) main = i;
  }

  for (let id = 0; id < members.length; id++) {
    if (id !== main) tunnelTo(tiles, width, height, members[id], label, main, offLimits);
  }
}

/**
 * Dig from one stranded piece to the main one by the shortest route that stays
 * clear of the arena. A route always exists: the arena is reserved with a
 * margin on every side, so there is ground to go around it.
 */
function tunnelTo(tiles, width, height, sources, label, main, offLimits) {
  const from = new Int32Array(width * height).fill(-2);   // -2 unvisited, -1 start
  const queue = [];
  for (const [x, y] of sources) {
    from[y * width + x] = -1;
    queue.push(x, y);
  }

  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];

    if (label[y * width + x] === main) {
      // Walk the route back, turning every wall along it into floor.
      for (let i = y * width + x; i >= 0; i = from[i]) {
        const cx = i % width;
        const cy = (i - cx) / width;
        if (tiles.get(cx, cy) === Tiles.wall) tiles.set(cx, cy, Tiles.floor);
      }
      return;
    }

    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!tiles.inBounds(nx, ny) || offLimits(nx, ny)) continue;
      const i = ny * width + nx;
      if (from[i] !== -2) continue;
      from[i] = y * width + x;
      queue.push(nx, ny);
    }
  }
}

function ringAround(rect, tiles) {
  const ring = [];
  for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
    for (const y of [rect.y - 1, rect.y + rect.h]) {
      if (tiles.inBounds(x, y)) ring.push([x, y]);
    }
  }
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (const x of [rect.x - 1, rect.x + rect.w]) {
      if (tiles.inBounds(x, y)) ring.push([x, y]);
    }
  }
  return ring;
}

function nearestFloorOutside(tiles, arena) {
  let best = null;
  let bestDistance = Infinity;
  tiles.forEach((x, y, tile) => {
    if (!tile.walkable) return;
    if (within(arena, x, y, 1)) return;
    const distance = Math.abs(x - arena.cx) + Math.abs(y - arena.cy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y };
    }
  });
  return best;
}

// -- shared carving ----------------------------------------------------------

function randomRoom(rng, width, height, minW, maxW, minH, maxH) {
  const w = rng.int(minW, maxW);
  const h = rng.int(minH, maxH);
  const x = rng.int(1, Math.max(1, width - w - 2));
  const y = rng.int(1, Math.max(1, height - h - 2));
  return { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };
}

function fits(room, rooms, reserved, pad) {
  if (reserved && overlaps(room, reserved, 2)) return false;
  return !rooms.some((other) => overlaps(room, other, pad));
}

function overlaps(a, b, pad) {
  return (
    a.x - pad < b.x + b.w && a.x + a.w + pad > b.x
    && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
  );
}

function within(rect, x, y, pad = 0) {
  return x >= rect.x - pad && x < rect.x + rect.w + pad
    && y >= rect.y - pad && y < rect.y + rect.h + pad;
}

function blockOut(cells, rect, pad) {
  for (let y = rect.y - pad; y < rect.y + rect.h + pad; y++) {
    for (let x = rect.x - pad; x < rect.x + rect.w + pad; x++) cells.set(x, y, true);
  }
}

function carveRoom(tiles, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) tiles.set(x, y, Tiles.floor);
  }
}

function connect(tiles, from, to, rng, offset = 0) {
  const fx = from.cx + offset;
  const fy = from.cy + offset;
  if (rng.chance(0.5)) {
    carveH(tiles, fx, to.cx, fy);
    carveV(tiles, fy, to.cy, to.cx);
  } else {
    carveV(tiles, fy, to.cy, fx);
    carveH(tiles, fx, to.cx, to.cy);
  }
}

function carveLine(tiles, x1, y1, x2, y2) {
  carveH(tiles, x1, x2, y1);
  carveV(tiles, y1, y2, x2);
}

function carveH(tiles, x1, x2, y) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    if (tiles.get(x, y) === Tiles.wall) tiles.set(x, y, Tiles.floor);
  }
}

function carveV(tiles, y1, y2, x) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
    if (tiles.get(x, y) === Tiles.wall) tiles.set(x, y, Tiles.floor);
  }
}
