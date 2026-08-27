import { Grid } from '../engine/grid.js';
import { computeFov } from '../engine/fov.js';
import { Tiles } from './tiles.js';
import { generateLevel } from './mapgen.js';

// One dungeon floor: terrain, what the player has seen, and everything in it.
export class Level {
  constructor(rng, width, height, depth, options = {}) {
    const { tiles, rooms, stairs, bossRoom, door } =
      generateLevel(rng, width, height, options);
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.tiles = tiles;
    this.rooms = rooms;
    this.stairs = stairs;
    this.bossRoom = bossRoom;
    this.door = door;
    this.doorLocked = false;
    this.entities = [];

    this.visible = new Grid(width, height, false);
    this.explored = new Grid(width, height, false);
  }

  /** A boss arena is only a threshold while something in it is still alive. */
  arenaHolds() {
    return Boolean(this.bossRoom) && this.entities.some((e) => e.boss && e.alive);
  }

  /** Inside the boss arena, if this floor has one. */
  inArena(x, y) {
    const room = this.bossRoom;
    if (!room) return false;
    return x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
  }

  /** The arena is a closed fight: nothing may be placed or land inside it. */
  isSealedOff(x, y) {
    return Boolean(this.bossRoom) && this.inArena(x, y);
  }

  isWalkable(x, y) {
    return (this.tiles.get(x, y) ?? Tiles.wall).walkable;
  }

  isOpaque(x, y) {
    return !(this.tiles.get(x, y) ?? Tiles.wall).transparent;
  }

  /** Walkable and unoccupied by anything that blocks movement. */
  isOpen(x, y) {
    return this.isWalkable(x, y) && !this.blockerAt(x, y);
  }

  blockerAt(x, y) {
    return this.entities.find((e) => e.blocks && e.alive && e.x === x && e.y === y) ?? null;
  }

  itemsAt(x, y) {
    return this.entities.filter((e) => e.item && e.x === x && e.y === y);
  }

  actors() {
    return this.entities.filter((e) => e.alive && e.speed > 0);
  }

  add(entity) {
    this.entities.push(entity);
    return entity;
  }

  remove(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) this.entities.splice(i, 1);
  }

  /** Recompute what the viewer can see; anything seen stays on the map. */
  updateFov(viewer, radius) {
    this.visible.fill(false);
    computeFov(
      viewer.x, viewer.y, radius,
      (x, y) => this.isOpaque(x, y),
      (x, y) => {
        if (!this.visible.inBounds(x, y)) return;
        this.visible.set(x, y, true);
        this.explored.set(x, y, true);
      },
    );
  }
}
