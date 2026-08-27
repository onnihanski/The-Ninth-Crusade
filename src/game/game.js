import { RNG } from '../engine/rng.js';
import { dijkstraMap } from '../engine/dijkstra.js';
import { Level } from '../world/level.js';
import { makePlayer, makeMonster, makeItem } from './entity.js';
import { takeAiTurn } from './ai.js';
import { monsterTable } from '../data/monsters.js';
import { itemTable } from '../data/items.js';
import { THEME } from '../data/theme.js';

const ACT_COST = 100;
const MAX_LOG = 200;

// The Game owns all mutable state and knows nothing about the DOM, which is
// what lets tests/smoke.mjs drive a full game headlessly under node.
export class Game {
  constructor({ seed, width = 72, height = 34, theme = THEME } = {}) {
    this.theme = theme;
    this.width = width;
    this.height = height;
    this.seed = seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.rng = new RNG(this.seed);
    this.messages = [];
    this.state = 'playing';
    this.turn = 0;

    this.player = makePlayer(0, 0);
    this.player.energy = ACT_COST; // start ready to act
    this.buildLevel(1);
    this.log(theme.strings.welcome, 'notable');
  }

  // -- level lifecycle ------------------------------------------------------

  buildLevel(depth) {
    this.level = new Level(this.rng, this.width, this.height, depth);

    const start = this.level.rooms[0];
    this.player.x = start.cx;
    this.player.y = start.cy;
    this.level.add(this.player);

    this.populate(depth);
    this._distCache = null;
    this.level.updateFov(this.player, this.theme.fovRadius);
  }

  nextLevel() {
    const depth = this.level.depth + 1;
    // Carrying the player entity across means inventory and HP persist.
    this.level.remove(this.player);
    this.buildLevel(depth);
    this.log(this.theme.strings.descend(depth), 'notable');
  }

  populate(depth) {
    const monsters = monsterTable(depth);
    const items = itemTable(depth);

    // Skip room 0 -- the player starts there and deserves one safe breath.
    for (const room of this.level.rooms.slice(1)) {
      const monsterCount = this.rng.int(0, Math.min(3, 1 + Math.floor(depth / 2)));
      for (let i = 0; i < monsterCount; i++) {
        const spot = this.freeSpotInRoom(room);
        if (spot) this.level.add(makeMonster(this.rng.weighted(monsters), spot.x, spot.y));
      }

      if (this.rng.chance(0.45)) {
        const spot = this.freeSpotInRoom(room);
        if (spot) this.level.add(makeItem(this.rng.weighted(items), spot.x, spot.y));
      }
    }
  }

  freeSpotInRoom(room) {
    for (let tries = 0; tries < 20; tries++) {
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.level.isOpen(x, y)) return { x, y };
    }
    return null;
  }

  // -- turn scheduling ------------------------------------------------------

  /**
   * Energy-based scheduler. Every actor banks `speed` energy per tick and acts
   * whenever it can afford ACT_COST, so a jackal at speed 160 genuinely gets
   * extra turns rather than being special-cased.
   */
  playerActed() {
    this.player.energy -= ACT_COST;
    this.turn++;
    this.runMonsterTurns();
    this._distCache = null;
    if (this.player.alive) this.level.updateFov(this.player, this.theme.fovRadius);
  }

  runMonsterTurns() {
    // Loop ticks until the player has banked enough energy to act again.
    while (this.player.alive && this.player.energy < ACT_COST) {
      for (const actor of this.level.actors()) actor.energy += actor.speed;

      // Snapshot: AI turns can kill entities and mutate the list.
      for (const actor of [...this.level.entities]) {
        if (actor === this.player || !actor.ai || !actor.alive) continue;
        while (actor.energy >= ACT_COST && actor.alive && this.player.alive) {
          actor.energy -= ACT_COST;
          takeAiTurn(this, actor);
        }
      }
      this._distCache = null;
    }
  }

  /** Distance-to-player map, rebuilt at most once per scheduler tick. */
  playerDistanceMap() {
    if (!this._distCache) {
      this._distCache = dijkstraMap(
        this.level.width,
        this.level.height,
        [[this.player.x, this.player.y]],
        (x, y) => this.level.isWalkable(x, y),
      );
    }
    return this._distCache;
  }

  // -- message log ----------------------------------------------------------

  log(text, color = 'text') {
    const last = this.messages[this.messages.length - 1];
    if (last && last.text === text) {
      last.count++;
      return;
    }
    this.messages.push({ text, color, count: 1 });
    if (this.messages.length > MAX_LOG) this.messages.shift();
  }
}
