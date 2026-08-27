import { RNG } from '../engine/rng.js';
import { dijkstraMap } from '../engine/dijkstra.js';
import { chebyshev } from '../engine/grid.js';
import { Level } from '../world/level.js';
import { Tiles } from '../world/tiles.js';
import { makePlayer, makeMonster, makeItem, makeRevenant } from './entity.js';
import { smiteNearest } from './effects.js';
import { prepareBoss } from './bosses.js';
import { takeAiTurn } from './ai.js';
import { tickStatuses, tickReload, tickBlock, effectiveSpeed, equipped } from './status.js';
import { tickRegeneration } from './progress.js';
import { Memorial } from './memorial.js';
import { MONSTERS, monsterTable } from '../data/monsters.js';
import { ITEMS, itemTable } from '../data/items.js';
import { regionForDepth, isBossDepth } from '../data/regions.js';
import { crusaderName, ordinal } from '../data/names.js';
import { GATE_CHAPTERS, BOSS_LORE } from '../data/lore.js';
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
    this.echoes = [];

    // Story cards wait in a queue and are shown one at a time. Seen-sets are
    // per run: the story is told again to the next crusader, because it is the
    // crusade telling it and the crusade repeats itself.
    this.storyQueue = [];
    this.prompt = null;
    this.chaptersSeen = new Set();
    this.loreSeen = new Set();
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
    this.level = new Level(this.rng, this.width, this.height, depth, {
      region: this.region,
      bossFloor: isBossDepth(depth),
    });
    this.level.region = this.region;

    const start = this.level.rooms[0];
    this.player.x = start.cx;
    this.player.y = start.cy;
    this.level.add(this.player);

    this.wanderers = 0;
    this.prompt = null;
    this.echoes = [];              // a note does not carry between floors
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
    const monsters = monsterTable(this.region, depth);
    const relics = itemTable(depth);
    const rooms = this.level.rooms.slice(1); // room 0 is the player's one safe breath
    if (!rooms.length) return;

    // A budget for the whole floor, not dice per room: room count is whatever
    // mapgen happened to fit, and letting it set the population made shallow
    // floors unsurvivable.
    // Depth 1 is where a player learns the verbs; it gets three. The curve
    // catches up to the old numbers by the middle of the dungeon.
    const monsterCount = boss
      ? 2 + Math.floor(depth / 4)
      : 2 + Math.round(depth * 0.9);
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

  /** The boss waits in its own room, alone, on the way out. */
  placeBoss() {
    const spec = { key: this.region.boss, ...MONSTERS[this.region.boss] };
    const arena = this.level.bossRoom ?? this.level.rooms[this.level.rooms.length - 1];
    const spot = this.freeSpotInRoom(arena) ?? this.freeSpotInRoom(this.level.rooms[0]);
    if (!spot) return;
    const boss = makeMonster(spec, spot.x, spot.y);
    prepareBoss(this, boss);
    this.level.add(boss);
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
    const isArena = room === this.level.bossRoom;
    for (let tries = 0; tries < 20; tries++) {
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (!this.level.isOpen(x, y)) continue;
      // Nothing but the boss is placed inside a sealed arena.
      if (!isArena && this.level.isSealedOff(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  /**
   * Somewhere legal to put a thing. While a boss fight is sealed the arena is
   * the only legal ground -- otherwise a blink would step the player straight
   * out through a locked door.
   */
  randomOpenTile() {
    const confined = this.level.doorLocked;
    for (let tries = 0; tries < 400; tries++) {
      const x = this.rng.int(1, this.level.width - 2);
      const y = this.rng.int(1, this.level.height - 2);
      if (!this.level.isOpen(x, y)) continue;
      if (confined !== this.level.inArena(x, y)) continue;
      return { x, y };
    }
    return null;
  }

  // -- seals, bosses, endings -----------------------------------------------

  onBossDefeated(boss) {
    if (boss.entranceShown !== undefined) delete boss.entranceShown;
    this.log('The way is no longer being argued about.', 'mythic');
    this.unlockArena();
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

  /**
   * Spill a dead thing's drops onto the floor where it fell. A drop is either a
   * bare item key (bosses) or `{ key, heirloom }` (anything taken off a
   * revenant, which carries the history of who died in it).
   */
  spillDrops(entity) {
    if (!entity.drops?.length) return;
    for (const drop of entity.drops) {
      const { key, heirloom } = typeof drop === 'string' ? { key: drop, heirloom: null } : drop;
      const spec = ITEMS[key];
      if (!spec) continue;
      const spot = this.level.isWalkable(entity.x, entity.y)
        ? { x: entity.x, y: entity.y }
        : this.randomOpenTile();
      if (!spot) continue;

      this.level.add(makeItem({ key, ...spec, heirloom }, spot.x, spot.y));
      this.log('It drops ' + spec.name + (heirloom ? ', and it knows your name.' : '.'),
        heirloom ? 'mythic' : 'notable');
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
      equipment: equipped(this.player).map((i) => ({
        key: i.item.key,
        heirloom: i.item.heirloom ?? null,
      })),
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
    tickReload(this.player);
    tickBlock(this.player);
    tickRegeneration(this.player);
    this.hintRegeneration();
    this.tickStillness();
    this.tickAttunement();
    this.tickEchoes();
    this.maybeWander();
    this.runMonsterTurns();
    this._distCache = null;

    if (this.player.alive) {
      this.level.updateFov(this.player, this.theme.fovRadius);
      this.announceGate();
      this.announceBoss();
    } else {
      this.finishRun(this.lastAttacker ?? 'the dungeon');
    }
  }

  /**
   * The sealed gate is where the crusade's own account of the first crusader
   * is told, a chapter at a time. Triggered by seeing the gate rather than by
   * arriving on the floor, so the story lands where the obstacle is.
   */
  announceGate() {
    if (!this.level.sealed || !this.level.door) return;
    if (this.chaptersSeen.has(this.region.key)) return;
    if (!this.level.visible.get(this.level.door.x, this.level.door.y)) return;

    const chapter = GATE_CHAPTERS[this.region.key];
    if (!chapter) return;
    this.chaptersSeen.add(this.region.key);
    this.tellStory({ kind: 'chapter', title: chapter.title, lines: chapter.lines });
  }

  /** Bosses get their history, the first time you actually lay eyes on them. */
  announceBoss() {
    for (const e of this.level.entities) {
      if (!e.boss || !e.alive || e.announced) continue;
      if (!this.level.visible.get(e.x, e.y)) continue;
      e.announced = true;

      const key = this.region.boss;
      const spec = MONSTERS[key];
      if (spec?.entrance) this.log(spec.entrance, 'mythic');

      const lore = BOSS_LORE[key];
      if (lore && !this.loreSeen.has(key)) {
        this.loreSeen.add(key);
        this.tellStory({
          kind: 'boss', title: lore.title, lines: lore.lines, mechanic: lore.mechanic,
        });
      }
    }
  }

  /** The prompt shown at a boss door. Answered by enterArena/declineArena. */
  askToEnter() {
    if (this.prompt) return;
    this.prompt = {
      kind: 'enterArena',
      title: 'The door is shut.',
      question: 'Are you sure you want to enter?',
      note: 'It will not open again until whatever is behind it is finished.',
    };
  }

  declineArena() {
    this.prompt = null;
    this.log('You leave the door shut, for now.', 'textDim');
  }

  /** Step through, bar the door, and meet what is inside. */
  enterArena() {
    this.prompt = null;
    const door = this.level.door;
    const arena = this.level.bossRoom;
    if (!door || !arena) return false;

    const inside = this.insideDoor(door, arena);
    if (!inside) return false;

    this.player.x = inside.x;
    this.player.y = inside.y;
    if (this.level.arenaHolds()) {
      this.level.tiles.set(door.x, door.y, Tiles.doorLocked);
      this.level.doorLocked = true;
      this.log('The door shuts behind you.', 'bad');
    }
    this.level.updateFov(this.player, this.theme.fovRadius);

    const key = this.region.boss;
    const lore = BOSS_LORE[key];
    if (lore && !this.loreSeen.has(key)) {
      this.loreSeen.add(key);
      this.tellStory({
        kind: 'boss', title: lore.title, lines: lore.lines, mechanic: lore.mechanic,
      });
    }
    for (const e of this.level.entities) if (e.boss) e.announced = true;
    return true;
  }

  /**
   * Where the player lands on stepping through. Normally the tile straight
   * inward, but a boss standing in the doorway must not make the door
   * unopenable -- fall back to the nearest free ground inside.
   */
  insideDoor(door, arena) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = door.x + dx;
      const y = door.y + dy;
      if (this.level.inArena(x, y) && this.level.isOpen(x, y)) return { x, y };
    }

    let best = null;
    let bestDistance = Infinity;
    for (let y = arena.y; y < arena.y + arena.h; y++) {
      for (let x = arena.x; x < arena.x + arena.w; x++) {
        if (!this.level.isOpen(x, y)) continue;
        const distance = Math.abs(x - door.x) + Math.abs(y - door.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x, y };
        }
      }
    }
    return best;
  }

  /** Killing the boss unbars the door. */
  unlockArena() {
    if (!this.level.doorLocked || !this.level.door) return;
    this.level.doorLocked = false;
    this.level.tiles.set(this.level.door.x, this.level.door.y, Tiles.door);
    this.log('The door gives, and swings open.', 'good');
  }

  tellStory(card) {
    this.storyQueue.push(card);
  }

  /** The card currently waiting to be read, if any. */
  pendingStory() {
    return this.storyQueue[0] ?? null;
  }

  dismissStory() {
    return this.storyQueue.shift() ?? null;
  }

  /** A crusader may name themselves. Their revenants keep whatever they chose. */
  renameCrusader(name) {
    const cleaned = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!cleaned) return false;
    this.crusaderName = cleaned;
    this.player.name = cleaned;
    return true;
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
          takeAiTurn(this, actor);   // ticks its own reload
        }
      }
      this._distCache = null;
    }
  }

  /**
   * Sanctuary counts turns held in one place. Tracked here rather than in the
   * move action because every other way of spending a turn counts as standing
   * still, and only actually moving should reset it.
   */
  tickStillness() {
    const moved = this._lastPos
      && (this._lastPos.x !== this.player.x || this._lastPos.y !== this.player.y);
    this.player.stillTurns = moved ? 0 : (this.player.stillTurns ?? 0) + 1;
    this._lastPos = { x: this.player.x, y: this.player.y };
  }

  /** Relics grow while they sit unused in the pack. */
  tickAttunement() {
    for (const item of this.player.inventory) {
      if (item.item.use?.attune) item.item.carried = (item.item.carried ?? 0) + 1;
    }
  }

  /** A note sounded earlier, finishing on its own and picking its own target. */
  tickEchoes() {
    if (!this.echoes.length) return;
    const due = [];
    this.echoes = this.echoes.filter((echo) => {
      echo.turns--;
      if (echo.turns > 0) return true;
      due.push(echo);
      return false;
    });

    for (const echo of due) {
      const struck = smiteNearest(this, this.player, echo.amount, echo.range,
        'The note finishes itself against');
      if (!struck) this.log('Somewhere behind you, a note finishes alone.', 'textDim');
    }
  }

  scheduleEcho(echo) {
    this.echoes.push({ ...echo });
  }

  /**
   * A new crusader has no way to know that standing still closes wounds, and
   * will bleed out on the first floor never having tried it. Said once.
   */
  hintRegeneration() {
    if (this.hintedRegen || !this.player.alive) return;
    if (this.player.hp > this.player.maxHp * 0.6) return;
    this.hintedRegen = true;
    this.log('Wounds close if you give them time. [space] to wait.', 'mythic');
  }

  /**
   * Send something down the corridor, out of sight and far enough away that it
   * has to arrive rather than appear. Capped per floor so a slow crusader is
   * pressured, not buried.
   */
  maybeWander() {
    if (this.turn === 0 || this.turn % WANDER_EVERY !== 0) return;
    // Nothing wanders onto the first floor. Wandering monsters exist to price
    // resting, and a player who has not yet learned that resting is possible
    // only experiences them as ambushes.
    const depth = this.level.depth;
    if (depth < 2) return;
    if (this.wanderers >= 1 + Math.floor(depth / 3)) return;

    const table = monsterTable(this.region, this.level.depth);
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
