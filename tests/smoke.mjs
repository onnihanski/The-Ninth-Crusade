// Headless test suite: drives full crusades under node, with no DOM anywhere.
// Catches what is painful to find by clicking around a browser -- scheduler
// deadlocks, unreachable gates, AI walking into walls, memorial corruption.
import { Game } from '../src/game/game.js';
import { moveOrAttack, wait, pickUp, useItem, descend } from '../src/game/actions.js';
import { Memorial, memoryStorage } from '../src/game/memorial.js';
import { makeItem } from '../src/game/entity.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { Tiles } from '../src/world/tiles.js';
import { REGIONS, MAX_DEPTH, isBossDepth } from '../src/data/regions.js';
import { ITEMS } from '../src/data/items.js';

let failures = 0;
function check(label, condition) {
  console.log((condition ? '  ok   ' : '  FAIL ') + label);
  if (!condition) failures++;
}
function section(name) { console.log(name); }

// --- helpers ---------------------------------------------------------------
function stepToward(g, tx, ty) {
  const dist = dijkstraMap(g.level.width, g.level.height, [[tx, ty]],
    (x, y) => g.level.isWalkable(x, y));
  if (dist[g.player.y * g.level.width + g.player.x] === UNREACHABLE) return false;
  const move = stepDownhill(dist, g.level.width, g.level.height, g.player.x, g.player.y, g.rng);
  if (!move) return false;
  // moveOrAttack swings at anything standing in the way, which is what we want.
  if (moveOrAttack(g, g.player, move[0], move[1]) && g.state === 'playing') g.playerActed();
  return true;
}

function walkTo(g, tx, ty, budget = 500) {
  for (let i = 0; i < budget; i++) {
    if (g.state !== 'playing') return false;
    if (g.player.x === tx && g.player.y === ty) return true;
    if (!stepToward(g, tx, ty)) return false;
  }
  return false;
}

function killEntity(g, entity, budget = 500) {
  for (let i = 0; i < budget; i++) {
    if (!entity.alive) return true;
    if (g.state !== 'playing') return false;
    if (!stepToward(g, entity.x, entity.y)) return false;
  }
  return !entity.alive;
}

/** A crusader who cannot lose, for testing structure rather than balance. */
function invincible(g) {
  g.player.maxHp = 99999; g.player.hp = 99999; g.player.power = 500; g.player.defense = 99;
  return g;
}

// --- determinism -----------------------------------------------------------
section('determinism');
{
  const a = new Game({ seed: 12345, memorial: new Memorial() });
  const b = new Game({ seed: 12345, memorial: new Memorial() });
  const terrain = (g) => JSON.stringify(g.level.tiles.cells.map((t) => t.key));
  check('same seed produces identical terrain', terrain(a) === terrain(b));
  check('same seed names the same crusader', a.crusaderName === b.crusaderName);
  check('same seed produces identical entity count',
    a.level.entities.length === b.level.entities.length);
  const c = new Game({ seed: 999, memorial: new Memorial() });
  check('different seed produces different terrain', terrain(a) !== terrain(c));
}

// --- map invariants --------------------------------------------------------
section('map generation');
{
  let ok = true;
  for (let seed = 0; seed < 60; seed++) {
    const g = new Game({ seed, memorial: new Memorial() });
    const dist = g.playerDistanceMap();
    if (g.level.rooms.length < 3) { ok = false; break; }
    if (!g.level.isWalkable(g.player.x, g.player.y)) { ok = false; break; }
    // Every room centre reachable, or the level is a trap.
    if (g.level.rooms.some((r) => dist[r.cy * g.level.width + r.cx] >= UNREACHABLE)) { ok = false; break; }
    if (g.level.tiles.get(g.level.stairs.x, g.level.stairs.y) !== Tiles.stairsDown) { ok = false; break; }
  }
  check('60 seeds all generate connected, playable levels', ok);
}

// --- field of view ---------------------------------------------------------
section('field of view');
{
  const g = new Game({ seed: 7, memorial: new Memorial() });
  check('player sees their own tile', g.level.visible.get(g.player.x, g.player.y) === true);
  check('fov marks tiles explored', g.level.explored.cells.some(Boolean));
  check('fov does not reveal the whole map',
    g.level.visible.cells.filter(Boolean).length < g.level.width * g.level.height);
}

// --- regions and gates -----------------------------------------------------
section('regions and sealed gates');
{
  check('four regions covering depths 1..' + MAX_DEPTH,
    REGIONS.length === 4 && MAX_DEPTH === 12);
  check('boss depths are the last floor of each region',
    [3, 6, 9, 12].every(isBossDepth) && ![1, 2, 4, 5, 7, 8, 10, 11].some(isBossDepth));

  const g = invincible(new Game({ seed: 2024, memorial: new Memorial() }));
  // Jump straight to a boss floor rather than playing three floors to reach it.
  g.buildLevel(3);
  check('boss floor has a sealed gate where the stairs would be',
    g.level.sealed && g.level.tiles.get(g.level.stairs.x, g.level.stairs.y) === Tiles.sealedGate);
  check('boss floor spawns its boss', g.level.entities.some((e) => e.boss && e.alive));

  walkTo(g, g.level.stairs.x, g.level.stairs.y);
  check('descending through a sealed gate is refused', descend(g) === false);

  const boss = g.level.entities.find((e) => e.boss);
  check('boss can be reached and killed', killEntity(g, boss));
  const seal = g.level.entities.find((e) => e.item?.seal);
  check('dead boss drops its seal', Boolean(seal));

  walkTo(g, seal.x, seal.y);
  pickUp(g, g.player);
  check('taking the seal opens the gate',
    !g.level.sealed && g.level.tiles.get(g.level.stairs.x, g.level.stairs.y) === Tiles.stairsDown);
  check('the seal is held, not consumed', g.seals().length === 1);

  walkTo(g, g.level.stairs.x, g.level.stairs.y);
  check('the gate now leads down', descend(g) === true && g.level.depth === 4);
  check('crossing into a new region changes the region', g.region.key === 'reliquary');
}

// --- a full crusade, floor 1 to the Relic -----------------------------------
section('a full crusade');
{
  const memorial = new Memorial(memoryStorage());
  const g = invincible(new Game({ seed: 31337, memorial }));
  let reached = 0;

  for (let floor = 1; floor <= MAX_DEPTH; floor++) {
    if (g.state !== 'playing') break;

    if (isBossDepth(g.level.depth)) {
      const boss = g.level.entities.find((e) => e.boss && e.alive);
      if (!boss || !killEntity(g, boss)) break;
      const loot = g.level.entities.filter((e) => e.item);
      for (const drop of loot) {
        if (!drop.item.seal && !drop.item.victory) continue;
        if (!walkTo(g, drop.x, drop.y)) continue;
        pickUp(g, g.player);
      }
    }

    reached = g.level.depth;
    if (g.state !== 'playing') break;
    if (!g.level.stairs) break;                      // final floor: no way down
    if (!walkTo(g, g.level.stairs.x, g.level.stairs.y)) break;
    if (!descend(g)) break;
  }

  check('reached the bottom of the dungeon (depth ' + reached + ')', reached === MAX_DEPTH);
  check('claiming the Relic wins the run', g.state === 'won');
  check('all three seals were collected on the way', g.seals().length === 3);
  check('a won run is written into the memorial',
    memorial.entries.length === 1 && memorial.entries[0].depth === MAX_DEPTH);
}

// --- the dungeon remembers -------------------------------------------------
section('the dungeon remembers');
{
  const storage = memoryStorage();
  const memorial = new Memorial(storage);

  const first = new Game({ seed: 500, memorial });
  const phialSpec = { key: 'reliquaryPhial', ...ITEMS.reliquaryPhial };
  first.player.inventory.push(makeItem(phialSpec, 0, 0));
  first.finishRun('a camp dog');

  check('death is recorded', memorial.entries.length === 1);
  check('the record keeps what they were carrying',
    memorial.entries[0].relics.includes('reliquaryPhial'));
  check('memorial survives a fresh instance over the same storage',
    new Memorial(storage).entries.length === 1);

  const second = new Game({ seed: 501, memorial });
  const revenant = second.level.entities.find((e) => e.revenant);
  check('the dead crusader is waiting on the depth they died', Boolean(revenant));
  check('the revenant wears their name', revenant.name.includes(first.crusaderName));
  check('the revenant still holds their relics', revenant.drops.includes('reliquaryPhial'));

  invincible(second);
  killEntity(second, revenant);
  const reclaimed = second.level.entities.find((e) => e.item?.key === 'reliquaryPhial');
  check('killing your predecessor returns their relics', Boolean(reclaimed));

  check('run number counts the crusade about to happen', memorial.runNumber() === 2);

  // Depth 1 must not silt up with dozens of your own corpses.
  for (let i = 0; i < 20; i++) {
    memorial.record({ name: 'Pilgrim Test ' + i, depth: 1, relics: [], turn: 1, at: Date.now() });
  }
  const crowded = new Game({ seed: 502, memorial });
  check('revenants per depth are capped',
    crowded.level.entities.filter((e) => e.revenant).length <= 3);
}

// --- relics ----------------------------------------------------------------
section('relics');
{
  const g = new Game({ seed: 88, memorial: new Memorial() });
  const give = (key) => {
    g.player.inventory.push(makeItem({ key, ...ITEMS[key] }, 0, 0));
    return g.player.inventory.length - 1;
  };

  g.player.hp = 5;
  check('a phial heals and is spent', useItem(g, g.player, give('reliquaryPhial')) && g.player.hp > 5);
  g.player.hp = g.player.maxHp;
  give('reliquaryPhial');
  useItem(g, g.player, 0);
  check('a phial is not wasted at full health', g.player.inventory.length === 1);
  g.player.inventory.length = 0;

  useItem(g, g.player, give('psalmOfWard'));
  check('a ward raises defense while it lasts',
    g.player.statuses.some((s) => s.kind === 'ward' && s.amount === 3));
  const before = { x: g.player.x, y: g.player.y };
  useItem(g, g.player, give('stepOfTheAbsent'));
  check('blink moves the player somewhere legal',
    (g.player.x !== before.x || g.player.y !== before.y) && g.level.isWalkable(g.player.x, g.player.y));

  for (let i = 0; i < 20; i++) g.playerActed();
  check('a ward expires', !g.player.statuses.some((s) => s.kind === 'ward'));

  g.player.inventory.push(makeItem({ key: 'brassSeal', ...ITEMS.brassSeal }, 0, 0));
  check('a seal cannot be used as a consumable',
    useItem(g, g.player, g.player.inventory.length - 1) === false);
}

// --- long random playthroughs ----------------------------------------------
section('random playthroughs');
{
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  const memorial = new Memorial(memoryStorage());
  let deaths = 0;
  let invariantsHeld = true;

  for (let run = 0; run < 25 && invariantsHeld; run++) {
    let g = new Game({ seed: run * 31 + 5, memorial });
    for (let step = 0; step < 500; step++) {
      if (g.state !== 'playing') { deaths++; g = new Game({ seed: run * 977 + step, memorial }); continue; }
      const roll = g.rng.float();
      let acted;
      if (roll < 0.70) acted = moveOrAttack(g, g.player, ...g.rng.pick(DIRS));
      else if (roll < 0.79) acted = pickUp(g, g.player);
      else if (roll < 0.88 && g.player.inventory.length) acted = useItem(g, g.player, 0);
      else if (roll < 0.94) acted = descend(g);
      else acted = wait();
      if (acted && g.state === 'playing') g.playerActed();

      if (g.player.hp > g.player.maxHp) { invariantsHeld = false; break; }
      if (g.player.alive && !g.level.isWalkable(g.player.x, g.player.y)) { invariantsHeld = false; break; }
      if (g.level.entities.some((e) => e.ai && e.alive && !g.level.isWalkable(e.x, e.y))) {
        invariantsHeld = false; break;
      }
    }
  }

  check('25 runs x 500 turns: no crash, no deadlock, no invariant broken', invariantsHeld);
  check('the dungeon is lethal (' + deaths + ' deaths)', deaths > 0);
  check('deaths accumulated in the memorial', memorial.entries.length === deaths);
}

console.log('');
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
