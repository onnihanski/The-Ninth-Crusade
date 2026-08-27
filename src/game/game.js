import { RNG } from '../engine/rng.js';
import { dijkstraMap } from '../engine/dijkstra.js';
import { chebyshev } from '../engine/grid.js';
import { Level } from '../world/level.js';
import { Tiles } from '../world/tiles.js';
import { makePlayer, makeMonster, makeItem, makeRevenant } from './entity.js';
import { takeAiTurn } from './ai.js';
import { tickStatuses, effectiveSpeed, equipped } from './status.js';
import { tickRegeneration } from './progress.js';
import { Memorial } from './memorial.js';
import { MONSTERS, monsterTable } from '../data/monsters.js';
import { ITEMS, itemTable } from '../data/items.js';
import { regionForDepth, isBossDepth } from '../data/regions.js';
import { crusaderName, ordinal } from '../data/names.js';
import { THEME } from '../data/theme.js';

const ACT_COST = 100;
const MAX_LOG = 200;

// Something else comes down the corridor every so often. Without wanderers,
// regeneration makes health free: clear a floor, rest to full, repeat. This is
// what puts a price on standing still, and it is why resting is a decision
// rather than a formality.
const WANDER_EVERY = 45;
const WANDER_MIN_DISTANCE = 12;

// The Game owns all mutable state and knows nothing about the DOM, which is
// what lets tests/smoke.mjs drive full crusades headlessly under node.
export class Game {
  constructor({ seed, width = 72, height = 34, theme = THEME, memorial } = {}) {
    this.theme = theme;
    this.width = width;
    this.height = height;
    this.seed = seed ?? (Math.random() * 0xffffffff) >>> 0;
    this.rng = new RNG(this.seed);
    this.memorial = memorial ?? new Memorial();
    this.messages = [];
    this.state = 'playing';
    this.turn = 0;
    this.runRecorded = false;

    this.crusaderName = crusaderName(this.rng);
    this.player = makePlayer(0, 0, this.crusaderName);
    this.player.energy = ACT_COST; // start ready to act

    this.buildLevel(1);

    const nth = ordinal(this.memorial.runNumber());
    this.log('You are the ' + nth + ' crusader sent down.', 'notable');
    if (this.memorial.entries.length) {
      this.log('The others are still here, in their fashion.', 'mythic');
    }
    this.log(this.region.arrival, 'textDim');
  }

  // -- level lifecycle ------------------------------------------------------

  buildLevel(depth) {
    this.region = regionForDepth(depth);
    this.level = new Level(this.rng, this.width, this.height, depth);
    this.level.region = this.region;

    const start = this.level.rooms[0];
    this.player.x = start.cx;
    this.player.y = start.cy;
    this.level.add(this.player);

    this.wanderers = 0;
    this.setUpGate(depth);
    this.populate(depth);
    this.summonTheRemembered(depth);

    this._distCache = null;
    this.level.updateFov(this.player, this.theme.fovRadius);
  }

  /**
   * Boss floors replace their stairs with a sealed gate. The final region has
   * no way down at all -- the only exit is the thing you came for.
   */
  setUpGate(depth) {
    const { x, y } = this.level.stairs;
    if (!isBossDepth(depth)) {
      this.level.sealed = false;
      return;
    }

    if (this.region.final) {
      this.level.tiles.set(x, y, Tiles.floor);
      this.level.sealed = false;
      this.level.stairs = null;
      return;
    }

    this.level.tiles.set(x, y, Tiles.sealedGate);
    this.level.sealed = true;
  }

  nextLevel() {
    const depth = this.level.depth + 1;
    const previousRegion = this.region;
    // Carrying the player entity across means inventory, HP and wards persist.
    this.level.remove(this.player);
    this.buildLevel(depth);
    this.log('You go down. Depth ' + depth + '.', 'notable');
    if (this.region !== previousRegion) this.log(this.region.arrival, 'mythic');
  }

  populate(depth) {
    const boss = isBossDepth(depth);
    const monsters = monsterTable(this.region);
    const relics = itemTable(depth);
    const rooms = this.level.rooms.slice(1); // room 0 is the player's one safe breath
    if (!rooms.length) return;

    // A budget for the whole floor, not dice per room: room count is whatever
    // mapgen happened to fit, and letting it set the population made shallow
    // floors unsurvivable.
    const monsterCount = boss
      ? 2 + Math.floor(depth / 4)
      : 3 + Math.round(depth * 0.8);
    for (let i = 0; i < monsterCount; i++) {
      const spot = this.freeSpotInRoom(this.rng.pick(rooms));
      if (spot) this.level.add(makeMonster(this.rng.weighted(monsters), spot.x, spot.y));
    }

    const relicCount = relics.length ? this.rng.int(2, 4) : 0;
    for (let i = 0; i < relicCount; i++) {
      const spot = this.freeSpotInRoom(this.rng.pick(rooms));
      if (spot) this.level.add(makeItem(this.rng.weighted(relics), spot.x, spot.y));
    }

    if (boss) this.placeBoss();
  }

  /** The boss stands on the way out, because of course it does. */
  placeBoss() {
    const spec = { key: this.region.boss, ...MONSTERS[this.region.boss] };
    const lastRoom = this.level.rooms[this.level.rooms.length - 1];
    const spot = this.freeSpotInRoom(lastRoom) ?? this.freeSpotInRoom(this.level.rooms[1]);
    if (!spot) return;
    this.level.add(makeMonster(spec, spot.x, spot.y));
    this.bossSpec = spec;
  }

  /**
   * THE DUNGEON REMEMBERS. Everyone who died on this depth is still down here,
   * holding what they were holding.
   */
  summonTheRemembered(depth) {
    const dead = this.memorial.atDepth(depth);
    if (!dead.length) return;

    const rooms = this.level.rooms.slice(1);
    for (const entry of dead) {
      const room = this.rng.pick(rooms.length ? rooms : this.level.rooms);
      const spot = this.freeSpotInRoom(room);
      if (spot) this.level.add(makeRevenant(entry, spot.x, spot.y));
    }
    this.log(
      dead.length === 1
        ? 'Someone you used to be is down here.'
        : dead.length + ' of your predecessors are down here.',
      'mythic',
    );
  }

  freeSpotInRoom(room) {
    for (let tries = 0; tries < 20; tries++) {
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.level.isOpen(x, y)) return { x, y };
    }
    return null;
  }

  randomOpenTile() {
    for (let tries = 0; tries < 400; tries++) {
      const x = this.rng.int(1, this.level.width - 2);
      const y = this.rng.int(1, this.level.height - 2);
      if (this.level.isOpen(x, y)) return { x, y };
    }
    return null;
  }

  // -- seals, bosses, endings -----------------------------------------------

  onBossDefeated(boss) {
    if (boss.entranceShown !== undefined) delete boss.entranceShown;
    this.log('The way is no longer being argued about.', 'mythic');
  }

  /** Called when a seal reaches the pack. Opens this floor's gate, if it fits. */
  tryUnseal(item) {
    if (!item.item?.seal || !this.level.sealed) return false;
    if (item.item.seal !== this.region.key) return false;

    const { x, y } = this.level.stairs;
    this.level.tiles.set(x, y, Tiles.stairsDown);
    this.level.sealed = false;
    this.log(this.theme.strings.unsealed, 'notable');
    return true;
  }

  claimVictory() {
    this.state = 'won';
    this.log(this.theme.strings.victory, 'notable');
    this.finishRun('walked out');
  }

  /** Spill a dead thing's drops onto the floor where it fell. */
  spillDrops(entity) {
    if (!entity.drops?.length) return;
    for (const key of entity.drops) {
      const spec = ITEMS[key];
      if (!spec) continue;
      const spot = this.level.isWalkable(entity.x, entity.y)
        ? { x: entity.x, y: entity.y }
        : this.randomOpenTile();
      if (!spot) continue;
      this.level.add(makeItem({ key, ...spec }, spot.x, spot.y));
      this.log('It drops ' + spec.name + '.', 'notable');
    }
    entity.drops = [];
  }

  /** Write this crusader into the memorial, once. */
  finishRun(killedBy) {
    if (this.runRecorded) return;
    this.runRecorded = true;
    this.memorial.record({
      name: this.crusaderName,
      depth: this.level.depth,
      level: this.player.level,
      power: this.player.power,
      defense: this.player.defense,
      maxHp: this.player.maxHp,
      region: this.region.name,
      killedBy,
      turn: this.turn,
      relics: this.player.inventory
        .filter((i) => i.item?.key && !i.item.victory)
        .map((i) => i.item.key),
      equipment: equipped(this.player).map((i) => i.item.key),
      at: Date.now(),
    });
  }

  // -- turn scheduling ------------------------------------------------------

  /**
   * Energy-based scheduler. Every actor banks `speed` energy per tick and acts
   * whenever it can afford ACT_COST, so a camp dog at speed 150 genuinely gets
   * extra turns rather than being special-cased.
   */
  playerActed() {
    this.player.energy -= ACT_COST;
    this.turn++;
    tickStatuses(this, this.player);
    tickRegeneration(this.player);
    this.maybeWander();
    this.runMonsterTurns();
    this._distCache = null;

    if (this.player.alive) {
      this.level.updateFov(this.player, this.theme.fovRadius);
      this.announceBoss();
    } else {
      this.finishRun(this.lastAttacker ?? 'the dungeon');
    }
  }

  /** Bosses get one line, the first time you actually lay eyes on them. */
  announceBoss() {
    for (const e of this.level.entities) {
      if (!e.boss || !e.alive || e.announced) continue;
      if (!this.level.visible.get(e.x, e.y)) continue;
      e.announced = true;
      const spec = MONSTERS[this.region.boss];
      if (spec?.entrance) this.log(spec.entrance, 'mythic');
    }
  }

  runMonsterTurns() {
    // Loop ticks until the player has banked enough energy to act again.
    while (this.player.alive && this.player.energy < ACT_COST) {
      for (const actor of this.level.actors()) actor.energy += effectiveSpeed(actor);

      // Snapshot: AI turns can kill entities and mutate the list.
      for (const actor of [...this.level.entities]) {
        if (actor === this.player || !actor.ai || !actor.alive) continue;
        while (actor.energy >= ACT_COST && actor.alive && this.player.alive) {
          actor.energy -= ACT_COST;
          tickStatuses(this, actor);
          takeAiTurn(this, actor);
        }
      }
      this._distCache = null;
    }
  }

  /**
   * Send something down the corridor, out of sight and far enough away that it
   * has to arrive rather than appear. Capped per floor so a slow crusader is
   * pressured, not buried.
   */
  maybeWander() {
    if (this.turn === 0 || this.turn % WANDER_EVERY !== 0) return;
    if (this.wanderers >= 2 + Math.floor(this.level.depth / 3)) return;

    const table = monsterTable(this.region);
    for (let tries = 0; tries < 60; tries++) {
      const spot = this.randomOpenTile();
      if (!spot) return;
      if (this.level.visible.get(spot.x, spot.y)) continue;
      if (chebyshev(spot.x, spot.y, this.player.x, this.player.y) < WANDER_MIN_DISTANCE) continue;

      this.level.add(makeMonster(this.rng.weighted(table), spot.x, spot.y));
      this.wanderers++;
      this.log('Something else is down here with you.', 'textDim');
      return;
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

  // -- presentation helpers -------------------------------------------------

  /** Theme palette with the current region's tint applied. */
  palette() {
    return { ...this.theme.colors, ...(this.region.palette ?? {}) };
  }

  seals() {
    return this.player.seals;
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
