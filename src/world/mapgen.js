import { Grid } from '../engine/grid.js';
import { Tiles } from './tiles.js';

// Rooms-and-corridors generation: the Rogue original, and still the clearest
// starting point. Try to place N non-overlapping rectangles, then join each new
// room to the previous one with an L-shaped tunnel. Guaranteed connected,
// because every room is linked to the one before it.
//
// This is the obvious place to grow later: cellular-automata caves, BSP,
// prefab vaults, a cave/room mix chosen by depth.
export function generateLevel(rng, width, height, options = {}) {
  const {
    maxRooms = 26,
    minRoomSize = 5,
    maxRoomSize = 11,
  } = options;

  const tiles = new Grid(width, height, Tiles.wall);
  const rooms = [];

  for (let attempt = 0; attempt < maxRooms * 3 && rooms.length < maxRooms; attempt++) {
    const w = rng.int(minRoomSize, maxRoomSize);
    const h = rng.int(minRoomSize - 1, maxRoomSize - 2);
    const x = rng.int(1, width - w - 2);
    const y = rng.int(1, height - h - 2);
    const room = { x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) };

    // One cell of padding keeps rooms from fusing into blobs.
    if (rooms.some((other) => overlaps(room, other, 1))) continue;

    carveRoom(tiles, room);
    if (rooms.length > 0) {
      const prev = rooms[rooms.length - 1];
      carveCorridor(tiles, prev.cx, prev.cy, room.cx, room.cy, rng);
    }
    rooms.push(room);
  }

  const last = rooms[rooms.length - 1];
  tiles.set(last.cx, last.cy, Tiles.stairsDown);

  return { tiles, rooms, stairs: { x: last.cx, y: last.cy } };
}

function overlaps(a, b, pad) {
  return (
    a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
  );
}

function carveRoom(tiles, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) tiles.set(x, y, Tiles.floor);
  }
}

function carveCorridor(tiles, x1, y1, x2, y2, rng) {
  if (rng.chance(0.5)) {
    carveH(tiles, x1, x2, y1);
    carveV(tiles, y1, y2, x2);
  } else {
    carveV(tiles, y1, y2, x1);
    carveH(tiles, x1, x2, y2);
  }
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
