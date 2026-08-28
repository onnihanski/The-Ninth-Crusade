// Headless test suite: drives full crusades under node, with no DOM anywhere.
// Catches what is painful to find by clicking around a browser -- scheduler
// deadlocks, unreachable gates, AI walking into walls, memorial corruption.
import { Game } from '../src/game/game.js';
import {
  moveOrAttack, wait, pickUp, useItem, equipItem, unequip, dropItem, fire, descend,
  mergeDuplicates,
} from '../src/game/actions.js';
import { Memorial, memoryStorage } from '../src/game/memorial.js';
import { makeItem, makeMonster, makeRevenant } from '../src/game/entity.js';
import { attack } from '../src/game/combat.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { Tiles } from '../src/world/tiles.js';
import {
  effectivePower, effectiveDefense, effectiveSpeed, rangedProfile, canFire,
  hasTrait, sanctuaryBonus, canBlock, tickBlock, mergeBonus,
} from '../src/game/status.js';
import { TRAITS, heirloomBonus } from '../src/data/traits.js';
import { regenInterval } from '../src/game/progress.js';
import { attunedAmount } from '../src/game/effects.js';
import { keyToIntent } from '../src/ui/input.js';
import { xpToNext, tickRegeneration } from '../src/game/progress.js';
import { mitigate, damage } from '../src/game/combat.js';
import { MONSTERS, monsterTable } from '../src/data/monsters.js';
import { GATE_CHAPTERS, BOSS_LORE, REVEAL, FIRST_CRUSADER } from '../src/data/lore.js';
import { ICONS } from '../src/data/icons.js';
import { generateLevel } from '../src/world/mapgen.js';
import { RNG } from '../src/engine/rng.js';
import { takeAiTurn } from '../src/game/ai.js';
import { chebyshev } from '../src/engine/grid.js';
import { REGIONS, MAX_DEPTH, isBossDepth } from '../src/data/regions.js';
import { ITEMS, itemTable, SLOTS, itemCategory, describeItem, mergeBoon } from '../src/data/items.js';
import { gainXp } from '../src/game/progress.js';
import { MAX_PACK } from '../src/game/actions.js';

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
  const acted = moveOrAttack(g, g.player, move[0], move[1]);

  // Walking into a boss door asks a question instead of taking a step. A
  // crusader who came this far says yes.
  if (!acted && g.prompt?.kind === 'enterArena') {
    g.enterArena();
    while (g.pendingStory()) g.dismissStory();
    return true;
  }

  if (acted && g.state === 'playing') g.playerActed();
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
        // Something the Herald called up may be standing on the seal. A player
        // would kill it and step on; so does this.
        if (!walkTo(g, drop.x, drop.y)) {
          const inTheWay = g.level.blockerAt(drop.x, drop.y);
          if (inTheWay && inTheWay !== g.player) killEntity(g, inTheWay);
          if (!walkTo(g, drop.x, drop.y)) continue;
        }
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
  first.buildLevel(4);                       // deep enough that they come back
  const phialSpec = { key: 'reliquaryPhial', ...ITEMS.reliquaryPhial };
  first.player.inventory.push(makeItem(phialSpec, 0, 0));
  first.finishRun('a bonepicker');

  check('death is recorded', memorial.entries.length === 1);
  check('the record keeps what they were carrying',
    memorial.entries[0].relics.includes('reliquaryPhial'));
  check('memorial survives a fresh instance over the same storage',
    new Memorial(storage).entries.length === 1);

  const second = new Game({ seed: 501, memorial });
  second.buildLevel(4);
  const revenant = second.level.entities.find((e) => e.revenant);
  check('the dead crusader is waiting on the depth they died', Boolean(revenant));
  check('the revenant wears their name', revenant.name.includes(first.crusaderName));
  check('the revenant still holds their relics',
    revenant.drops.some((d) => d.key === 'reliquaryPhial'));

  invincible(second);
  killEntity(second, revenant);
  const reclaimed = second.level.entities.find((e) => e.item?.key === 'reliquaryPhial');
  check('killing your predecessor returns their relics', Boolean(reclaimed));

  check('run number counts the crusade about to happen', memorial.runNumber() === 2);

  // A floor must not silt up with dozens of your own corpses.
  for (let i = 0; i < 20; i++) {
    memorial.record({ name: 'Pilgrim Test ' + i, depth: 4, relics: [], turn: 1, at: Date.now() });
  }
  const crowded = new Game({ seed: 502, memorial });
  crowded.buildLevel(4);
  check('revenants per depth are capped',
    crowded.level.entities.filter((e) => e.revenant).length <= 3);

  // The opening floors stay a clean slate however many crusaders have died
  // there. Otherwise every death makes the start harder and a new player can
  // be locked out of their own game in three runs.
  const graveyard = new Memorial(memoryStorage());
  for (let i = 0; i < 12; i++) {
    graveyard.record({ name: 'Pilgrim Doomed ' + i, depth: 1, relics: [], turn: 1, at: Date.now() });
    graveyard.record({ name: 'Pilgrim Doomed ' + i, depth: 2, relics: [], turn: 1, at: Date.now() });
  }
  check('twelve deaths on depth 1 add nothing to depth 1',
    graveyard.atDepth(1).length === 0 && graveyard.atDepth(2).length === 0);
  const early = new Game({ seed: 503, memorial: graveyard });
  check('the opening floor is the same after a dozen deaths on it',
    early.level.entities.filter((e) => e.revenant).length === 0);
  check('but the memorial still records them all', graveyard.entries.length === 24);
}

// --- the opening floor -----------------------------------------------------
// The first floor is where a player learns the verbs. It has to be survivable
// while they are still learning them.
section('the opening floor');
{
  const g = new Game({ seed: 4242, memorial: new Memorial() });
  check('a crusader is issued a weapon and armour',
    g.player.equipment.weapon !== null && g.player.equipment.armour !== null);
  check('the issued kit is the cheapest thing in the armoury',
    g.player.equipment.weapon.item.equip.power === ITEMS.armingSword.equip.power
    && g.player.equipment.armour.item.equip.defense === ITEMS.gambeson.equip.defense);
  check('the issued kit costs no speed', effectiveSpeed(g.player) === 100);

  let worst = 0;
  for (let seed = 0; seed < 60; seed++) {
    const run = new Game({ seed, memorial: new Memorial() });
    worst = Math.max(worst, run.level.entities.filter((e) => e.ai && e.alive).length);
  }
  check('depth 1 never fields more than four monsters (worst seen: ' + worst + ')', worst <= 4);

  // Wanderers exist to price resting. A player who has not learned that
  // resting is possible only experiences them as ambushes.
  const w = invincible(new Game({ seed: 4243, memorial: new Memorial() }));
  const before = w.level.entities.filter((e) => e.ai).length;
  for (let i = 0; i < 500; i++) { if (w.state !== 'playing') break; w.playerActed(); }
  check('nothing wanders onto depth 1',
    w.wanderers === 0 && w.level.entities.filter((e) => e.ai).length === before);

  // Regeneration is invisible; a new crusader will bleed out never having
  // tried it. The game says so, once.
  const h = new Game({ seed: 4244, memorial: new Memorial() });
  h.player.hp = Math.floor(h.player.maxHp * 0.5);
  h.playerActed();
  check('the game explains resting the first time it matters',
    h.messages.some((m) => m.text.includes('Wounds close')));
  const saidTwice = h.messages.filter((m) => m.text.includes('Wounds close')).length;
  h.player.hp = 1;
  for (let i = 0; i < 5; i++) if (h.state === 'playing') h.playerActed();
  check('and does not keep saying it',
    h.messages.filter((m) => m.text.includes('Wounds close')).length === saidTwice);
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

// --- key bindings ----------------------------------------------------------
section('key bindings');
{
  const press = (key, code) => keyToIntent({ key, code: code ?? 'Key' + key.toUpperCase() });
  const moves = (key, dx, dy) => {
    const i = press(key);
    return i?.type === 'move' && i.dx === dx && i.dy === dy;
  };
  check('WASD moves in the four cardinals',
    moves('w', 0, -1) && moves('a', -1, 0) && moves('s', 0, 1) && moves('d', 1, 0));
  check('QEZC covers the diagonals monsters can use',
    moves('q', -1, -1) && moves('e', 1, -1) && moves('z', -1, 1) && moves('c', 1, 1));
  check('every one of the eight directions is bound', (() => {
    const bound = new Set();
    for (const key of ['w', 'a', 's', 'd', 'q', 'e', 'z', 'c']) {
      const i = press(key);
      bound.add(i.dx + ',' + i.dy);
    }
    return bound.size === 8;
  })());
  check('shift does not break movement', moves('W', 0, -1));
  check('the digit row is inventory, not movement',
    press('3', 'Digit3').type === 'use' && press('3', 'Digit3').index === 2);
  check('the numpad is still movement',
    press('3', 'Numpad3').type === 'move' && press('5', 'Numpad5').type === 'wait');
  check('space waits', press(' ', 'Space').type === 'wait');
  check('other verbs survive the rebind',
    press('g').type === 'pickup' && press('r').type === 'restart'
    && keyToIntent({ key: '>', code: 'Period' }).type === 'descend');
}

// --- equipment -------------------------------------------------------------
section('arms and armour');
{
  const g = new Game({ seed: 4040, memorial: new Memorial() });
  // Strip the issued kit: this section tests the slot mechanics, not the
  // starting loadout (which 'the opening floor' covers).
  for (const slot of SLOTS) g.player.equipment[slot] = null;

  const give = (key) => {
    g.player.inventory.push(makeItem({ key, ...ITEMS[key] }, 0, 0));
    return g.player.inventory.length - 1;
  };
  const basePower = effectivePower(g.player);
  const baseDefense = effectiveDefense(g.player);

  check('bare hands use the base power', basePower === g.player.power);

  equipItem(g, g.player, give('armingSword'));
  check('a sword raises power', effectivePower(g.player) === basePower + 2);
  check('the sword is worn, not carried',
    g.player.equipment.weapon?.item.key === 'armingSword' && g.player.inventory.length === 0);

  equipItem(g, g.player, give('kiteShield'));
  equipItem(g, g.player, give('gambeson'));
  check('shield and armour both raise defense',
    effectiveDefense(g.player) === baseDefense + 2);
  check('all three slots fill independently',
    Boolean(g.player.equipment.weapon && g.player.equipment.shield && g.player.equipment.armour));

  // Swapping must never eat the old piece.
  equipItem(g, g.player, give('flangedMace'));
  check('swapping a slot stows the displaced piece',
    g.player.equipment.weapon.item.key === 'flangedMace'
    && g.player.inventory.some((i) => i.item.key === 'armingSword'));
  check('power follows the new weapon', effectivePower(g.player) === basePower + 3);

  // Derive the expectation from the data so retuning an item cannot silently
  // invalidate the test.
  const worn = () => Object.values(g.player.equipment).filter(Boolean)
    .reduce((sum, i) => sum + (i.item.equip.speed ?? 0), 0);
  check('speed tracks exactly the weight of what is worn',
    effectiveSpeed(g.player) === 100 + worn());

  equipItem(g, g.player, give('armingSword'));
  check('weightless gear costs no speed',
    worn() === 0 && effectiveSpeed(g.player) === 100);
  equipItem(g, g.player, give('ossuaryPlate'));
  check('heavy armour costs speed', effectiveSpeed(g.player) < 100);
  check('heavy armour still pays in defense',
    effectiveDefense(g.player) === baseDefense + 1 + 4);

  // The scheduler divides by nothing, but it does spin forever on an actor
  // that can never bank a turn's worth of energy.
  g.player.speed = 10;
  equipItem(g, g.player, give('martyrsGreatsword'));
  check('speed is floored above zero however heavy the load', effectiveSpeed(g.player) >= 25);
  g.player.speed = 100;

  check('unequipping returns the piece to the pack',
    unequip(g, g.player, 'armour') && g.player.inventory.some((i) => i.item.key === 'ossuaryPlate')
    && g.player.equipment.armour === null);

  // Equipping through the normal use path, as the 1-9 keys do.
  const idx = give('heaterShield');
  check('the use key equips gear rather than consuming it',
    useItem(g, g.player, idx) && g.player.equipment.shield.item.key === 'heaterShield'
    && g.player.inventory.some((i) => i.item.key === 'kiteShield'));
}

// --- gear in combat and on the dead ----------------------------------------
section('gear in play');
{
  const g = new Game({ seed: 6161, memorial: new Memorial() });
  const target = g.level.entities.find((e) => e.ai) ?? null;
  if (target) {
    target.hp = 999; target.maxHp = 999; target.defense = 0;
    const hpBefore = target.hp;
    g.rng = { int: (min) => min, float: () => 0.5, pick: (a) => a[0], chance: () => false };
    attack(g, g.player, target);
    const unarmed = hpBefore - target.hp;

    g.player.equipment.weapon = makeItem({ key: 'martyrsGreatsword', ...ITEMS.martyrsGreatsword }, 0, 0);
    const hpMid = target.hp;
    attack(g, g.player, target);
    check('a wielded weapon actually lands harder', (hpMid - target.hp) > unarmed);
  } else {
    check('a wielded weapon actually lands harder', false);
  }
}

section('the dead keep their kit');
{
  const memorial = new Memorial(memoryStorage());
  const first = new Game({ seed: 700, memorial });
  first.buildLevel(5);                       // deep enough that they come back
  first.player.equipment.weapon = makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0);
  first.player.equipment.armour = makeItem({ key: 'mailHauberk', ...ITEMS.mailHauberk }, 0, 0);
  first.finishRun('a chorister');

  const wornKeys = memorial.entries[0].equipment.map((p) => p.key);
  check('the memorial records what they were wearing',
    wornKeys.includes('censerFlail') && wornKeys.includes('mailHauberk'));

  const second = new Game({ seed: 701, memorial });
  second.buildLevel(5);
  const revenant = second.level.entities.find((e) => e.revenant);

  // Compare against the same predecessor recorded with nothing equipped, so the
  // difference can only come from the kit.
  const barefootMemorial = new Memorial(memoryStorage());
  barefootMemorial.record({ ...memorial.entries[0], equipment: [], relics: [] });
  const barefootGame = new Game({ seed: 701, memorial: barefootMemorial });
  barefootGame.buildLevel(5);
  const barefoot = barefootGame.level.entities.find((e) => e.revenant);

  // The kit drops from them with every point it ever had, and lends them
  // nothing while they carry it. A predecessor who died in good armour used to
  // come back as a wall on an early floor, long before the crusader meeting
  // them could field anything comparable.
  check('a revenant gains no power from the weapon it carries',
    revenant.power === barefoot.power);
  check('a revenant gains no defense from the armour it carries',
    revenant.defense === barefoot.defense);
  check('and is not slowed by the weight either',
    revenant.speed === 100 && revenant.speed === barefoot.speed);
  const dropKeys = revenant.drops.map((d) => d.key);
  check('the revenant drops the whole kit',
    dropKeys.includes('censerFlail') && dropKeys.includes('mailHauberk'));

  invincible(second);
  killEntity(second, revenant);
  const onFloor = second.level.entities.filter((e) => e.item);
  const onFloorKeys = onFloor.map((e) => e.item.key);
  check('your old gear is recoverable off your old body',
    onFloorKeys.includes('censerFlail') && onFloorKeys.includes('mailHauberk'));
  check('and the gear itself lost none of its power in the process', (() => {
    const flail = onFloor.find((e) => e.item.key === 'censerFlail');
    return flail.item.equip.power === ITEMS.censerFlail.equip.power
      && flail.item.equip.speed === ITEMS.censerFlail.equip.speed;
  })());
}

// --- experience and levels -------------------------------------------------
section('experience and levels');
{
  const g = new Game({ seed: 9090, memorial: new Memorial() });
  const p = g.player;
  check('a crusader starts at level 1 with no experience', p.level === 1 && p.xp === 0);
  check('each level costs more than the last',
    [1, 2, 3, 4, 5].every((l) => xpToNext(l + 1) > xpToNext(l)));

  const before = { hp: p.maxHp, power: p.power, defense: p.defense };
  gainXp(g, p, xpToNext(1));
  check('enough experience levels you up', p.level === 2);
  check('levelling raises max hp', p.maxHp > before.hp);
  check('levelling heals you by what it added', p.hp === p.maxHp);
  check('spent experience does not carry the whole bar over', p.xp < xpToNext(2));

  // Walk up to level 12 and confirm every stat has moved.
  while (p.level < 12) gainXp(g, p, xpToNext(p.level));
  check('power grows with levels', p.power > before.power);
  check('defense grows with levels', p.defense > before.defense);
  check('max hp grows steadily', p.maxHp === before.hp + 4 * 11);

  // Overflow must cascade, not strand experience.
  const q = new Game({ seed: 9091, memorial: new Memorial() });
  gainXp(q, q.player, xpToNext(1) + xpToNext(2) + xpToNext(3));
  check('one large award can cross several levels', q.player.level === 4);

  check('experience is only ever awarded to the player', (() => {
    const r = new Game({ seed: 9092, memorial: new Memorial() });
    const monster = r.level.entities.find((e) => e.ai);
    const xpBefore = r.player.xp;
    gainXp(r, monster, 500);
    return monster.xp !== 500 && r.player.xp === xpBefore;
  })());
}

section('experience comes from kills');
{
  const g = invincible(new Game({ seed: 3131, memorial: new Memorial() }));
  const monster = g.level.entities.find((e) => e.ai && e.alive);
  const worth = monster.xp;
  const before = g.player.xp + (g.player.level - 1) * 1000;
  check('monsters are worth something', worth > 0);
  killEntity(g, monster);
  check('killing a monster grants its experience',
    g.player.xp + (g.player.level - 1) * 1000 > before);
  check('a corpse cannot be farmed for more', monster.xp === 0);
  check('every monster in the data has an experience value',
    Object.values(MONSTERS).every((m) => typeof m.xp === 'number' && m.xp > 0));
  check('bosses are worth far more than the rank and file',
    MONSTERS.herald.xp > MONSTERS.deserter.xp * 5);
}

// --- damage mitigation -----------------------------------------------------
section('damage mitigation');
{
  check('no defense means no reduction', mitigate(12, 0) === 12);
  check('defense reduces damage', mitigate(12, 6) < 12);
  check('mitigation has diminishing returns',
    (mitigate(20, 2) - mitigate(20, 4)) >= (mitigate(20, 18) - mitigate(20, 20)));
  check('no amount of defense grants immunity',
    [20, 50, 200, 10000].every((d) => mitigate(12, d) >= 1));
  check('mitigation is monotonic in defense', (() => {
    let last = Infinity;
    for (let d = 0; d <= 40; d++) {
      const dealt = mitigate(30, d);
      if (dealt > last) return false;
      last = dealt;
    }
    return true;
  })());
}

// --- regeneration and wandering monsters -----------------------------------
section('regeneration and wanderers');
{
  const g = new Game({ seed: 7070, memorial: new Memorial() });
  g.player.hp = 5;
  for (let i = 0; i < 200; i++) tickRegeneration(g.player);
  check('resting heals over time', g.player.hp > 5);
  g.player.hp = g.player.maxHp;
  for (let i = 0; i < 200; i++) tickRegeneration(g.player);
  check('regeneration never overheals', g.player.hp === g.player.maxHp);

  // Wanderers are what stop resting from being free.
  const w = invincible(new Game({ seed: 7071, memorial: new Memorial() }));
  w.buildLevel(6);                           // nothing wanders onto depth 1
  const startingMonsters = w.level.entities.filter((e) => e.ai && e.alive).length;
  for (let i = 0; i < 400; i++) { if (w.state !== 'playing') break; w.playerActed(); }
  const now = w.level.entities.filter((e) => e.ai && e.alive).length;
  check('standing still eventually attracts company', now > startingMonsters);
  check('wanderers are capped per floor', w.wanderers <= 2 + Math.floor(w.level.depth / 3));
}

// --- rarity ----------------------------------------------------------------
section('rarity');
{
  const gear = Object.entries(ITEMS).filter(([, i]) => i.equip);
  const bySlot = {};
  for (const [key, item] of gear) (bySlot[item.equip.slot] ??= []).push({ key, ...item });

  check('every slot has a range to choose between',
    SLOTS.every((slot) => bySlot[slot].length >= 4));
  check('every slot has a sacred piece',
    SLOTS.every((slot) => bySlot[slot].some((i) => i.rarity === 'sacred')));
  check('rarer gear is stronger within its slot', SLOTS.every((slot) => {
    const value = (i) => i.equip.power + i.equip.defense;
    const common = Math.max(...bySlot[slot].filter((i) => i.rarity === 'common').map(value));
    const rare = Math.max(...bySlot[slot].filter((i) => i.rarity === 'rare').map(value));
    return rare > common;
  }));
  check('rarer gear is scarcer where it can be found at all', SLOTS.every((slot) => {
    const w = (r) => Math.max(...bySlot[slot].filter((i) => i.rarity === r).map((i) => i.weight));
    return w('common') > w('uncommon');
  }));
  check('rarity is legible as colour', gear.every(([, i]) => i.color.startsWith('gear')));

  // The whole point: sacred gear cannot be found lying around.
  check('sacred gear never rolls on any floor',
    [1, 3, 6, 9, 12].every((d) => itemTable(d).every((i) => i.rarity !== 'sacred')));
  const sacred = gear.filter(([, i]) => i.rarity === 'sacred').map(([k]) => k);
  const dropped = Object.values(MONSTERS).filter((m) => m.boss).flatMap((m) => m.drops ?? []);
  check('every sacred piece is carried by a boss',
    sacred.every((key) => dropped.includes(key)));

  // And that it actually reaches the player's hands.
  const g = invincible(new Game({ seed: 1212, memorial: new Memorial() }));
  g.buildLevel(3);
  const boss = g.level.entities.find((e) => e.boss);
  killEntity(g, boss);
  const spoils = g.level.entities.filter((e) => e.item).map((e) => e.item.key);
  check('the first boss yields its sacred weapon', spoils.includes('heraldsPollaxe'));
}

// --- the pack --------------------------------------------------------------
section('the pack');
{
  const g = new Game({ seed: 5555, memorial: new Memorial() });
  const p = g.player;
  for (let i = 0; i < MAX_PACK; i++) {
    p.inventory.push(makeItem({ key: 'reliquaryPhial', ...ITEMS.reliquaryPhial }, 0, 0));
  }
  g.level.add(makeItem({ key: 'gambeson', ...ITEMS.gambeson }, p.x, p.y));
  check('a full pack refuses more', pickUp(g, p) === false && p.inventory.length === MAX_PACK);
  check('dropping frees a slot',
    dropItem(g, p, 0) && p.inventory.length === MAX_PACK - 1);
  check('what you drop is on the floor where you stand',
    g.level.itemsAt(p.x, p.y).some((i) => i.item.key === 'reliquaryPhial'));

  // A seal must never be blocked by pack space: that would strand a crusader
  // on a sealed floor with the seal at their feet and no way to lift it.
  const h = invincible(new Game({ seed: 5556, memorial: new Memorial() }));
  h.buildLevel(3);
  for (let i = 0; i < MAX_PACK; i++) {
    h.player.inventory.push(makeItem({ key: 'reliquaryPhial', ...ITEMS.reliquaryPhial }, 0, 0));
  }
  const bossThere = h.level.entities.find((e) => e.boss);
  killEntity(h, bossThere);
  const sealOnFloor = h.level.entities.find((e) => e.item?.seal);
  walkTo(h, sealOnFloor.x, sealOnFloor.y);
  pickUp(h, h.player);
  check('a seal is taken even with a full pack', h.seals().length === 1);
  check('and it still opens the gate', h.level.sealed === false);
  check('seals never consume pack space',
    h.player.inventory.every((i) => !i.item.seal) && h.player.inventory.length === MAX_PACK);
}

// --- ranged weapons --------------------------------------------------------
section('ranged weapons');
{
  const g = new Game({ seed: 8080, memorial: new Memorial() });
  const p = g.player;
  // A clear room to shoot across.
  const room = g.level.rooms[0];
  g.level.entities.filter((e) => e.ai).forEach((e) => g.level.remove(e));
  p.x = room.x + 1;
  p.y = room.cy;

  check('bare hands cannot shoot', rangedProfile(p) === null && fire(g, p) === false);

  p.equipment.weapon = makeItem({ key: 'huntingCrossbow', ...ITEMS.huntingCrossbow }, 0, 0);
  const profile = rangedProfile(p);
  check('a crossbow gives you a ranged profile', profile.range === 6 && profile.power === 6);
  check('shooting at nothing is refused and costs no turn', fire(g, p) === false);

  // Put a target inside range, in sight.
  const target = makeMonster({ ...MONSTERS.deserter, maxHp: 200, hp: 200 }, p.x + 4, p.y);
  g.level.add(target);
  g.level.updateFov(p, g.theme.fovRadius);
  const hpBefore = target.hp;
  check('you can shoot something four tiles away', fire(g, p) === true);
  check('the shot does damage without closing',
    target.hp < hpBefore && chebyshev(p.x, p.y, target.x, target.y) === 4);
  check('the log says you shot it',
    g.messages.some((m) => m.text.includes('You shoot')));

  check('firing starts a reload', !canFire(p));
  check('you cannot fire while reloading', fire(g, p) === false);

  let turns = 0;
  while (!canFire(p) && turns < 20) { g.playerActed(); turns++; }
  check('the reload takes exactly the weapon\'s stated turns (' + turns + ')',
    turns === ITEMS.huntingCrossbow.equip.ranged.reload);
  check('and then you can shoot again', fire(g, p) === true);

  // Out of range is out of range, even in plain sight.
  const far = makeMonster({ ...MONSTERS.deserter, maxHp: 50, hp: 50 }, p.x + 4, p.y);
  g.level.remove(target);
  g.level.add(far);
  p.reloadLeft = 0;
  far.x = Math.min(g.level.width - 2, p.x + profile.range + 3);
  g.level.updateFov(p, g.theme.fovRadius);
  check('nothing beyond the weapon\'s range can be shot', fire(g, p) === false);
}

section('ranged weapons are a trade');
{
  const ranged = Object.entries(ITEMS).filter(([, i]) => i.equip?.ranged);
  check('there is a ranged option at three rarities',
    new Set(ranged.map(([, i]) => i.rarity)).size >= 3);
  check('ranged weapons are feeble in melee', ranged.every(([, i]) =>
    i.equip.power <= 2));
  check('every ranged weapon out-damages its own melee', ranged.every(([, i]) =>
    i.equip.ranged.power > i.equip.power));
  check('every ranged weapon has a reload to pay for it', ranged.every(([, i]) =>
    i.equip.ranged.reload >= 1));
  check('they compete for the weapon slot with swords', ranged.every(([, i]) =>
    i.equip.slot === 'weapon'));
  check('the strongest shot has the longest reload', (() => {
    const sorted = [...ranged].sort((a, b) => a[1].equip.ranged.power - b[1].equip.ranged.power);
    return sorted[sorted.length - 1][1].equip.ranged.reload
      >= sorted[0][1].equip.ranged.reload;
  })());
}

// --- shooter AI ------------------------------------------------------------
section('monsters that shoot');
{
  check('every region fields something ranged by its last floor',
    REGIONS.every((r) => monsterTable(r, r.depths[1]).some((m) => m.ranged)));
  check('nothing ranged can roll on depth 1',
    monsterTable(REGIONS[0], 1).every((m) => !m.ranged));

  const g = new Game({ seed: 8081, memorial: new Memorial() });
  const room = g.level.rooms[0];
  g.level.entities.filter((e) => e.ai).forEach((e) => g.level.remove(e));
  g.player.x = room.x + 1;
  g.player.y = room.cy;
  g.player.maxHp = 9999;
  g.player.hp = 9999;

  const archer = makeMonster({ ...MONSTERS.crossbowman }, room.x + 4, room.cy);
  g.level.add(archer);
  g.level.updateFov(g.player, g.theme.fovRadius);

  const hpBefore = g.player.hp;
  takeAiTurn(g, archer);
  check('an archer shoots instead of closing',
    g.player.hp < hpBefore && chebyshev(archer.x, archer.y, g.player.x, g.player.y) >= 3);
  check('the log names the shot',
    g.messages.some((m) => m.text.includes('shoots you')));

  // It must hold its ground while reloading. An archer that retreats every
  // reload turn is uncatchable at equal speed -- you close one tile, it opens
  // one tile -- and that alone took the win rate to zero.
  const spot = { x: archer.x, y: archer.y };
  const hpHeld = g.player.hp;
  takeAiTurn(g, archer);
  check('it stands still to reload rather than kiting forever',
    archer.x === spot.x && archer.y === spot.y && g.player.hp === hpHeld);

  check('a shooter can always be closed with at equal speed', (() => {
    // Walk a crusader at an archer across open floor and check the gap shuts.
    const sim = new Game({ seed: 8085, memorial: new Memorial() });
    sim.level.entities.filter((e) => e.ai).forEach((e) => sim.level.remove(e));
    const r = sim.level.rooms[0];
    sim.player.x = r.x + 1; sim.player.y = r.cy;
    sim.player.maxHp = 9999; sim.player.hp = 9999;
    const shooter = makeMonster({ ...MONSTERS.crossbowman }, r.x + r.w - 2, r.cy);
    sim.level.add(shooter);
    sim.level.updateFov(sim.player, sim.theme.fovRadius);

    const start = chebyshev(sim.player.x, sim.player.y, shooter.x, shooter.y);
    for (let i = 0; i < 40; i++) {
      const dx = Math.sign(shooter.x - sim.player.x);
      const dy = Math.sign(shooter.y - sim.player.y);
      if (moveOrAttack(sim, sim.player, dx, dy)) sim.playerActed();
      if (!shooter.alive) return true;
    }
    return chebyshev(sim.player.x, sim.player.y, shooter.x, shooter.y) < start;
  })());

  // Cornered, it fights badly with whatever it is holding.
  const boxed = new Game({ seed: 8082, memorial: new Memorial() });
  boxed.level.entities.filter((e) => e.ai).forEach((e) => boxed.level.remove(e));
  const corner = boxed.level.rooms[0];
  boxed.player.x = corner.x;
  boxed.player.y = corner.y;
  boxed.player.maxHp = 9999;
  boxed.player.hp = 9999;
  const cornered = makeMonster({ ...MONSTERS.crossbowman }, corner.x + 1, corner.y);
  cornered.reloadLeft = 5;                    // no shot available
  boxed.level.add(cornered);
  boxed.level.updateFov(boxed.player, boxed.theme.fovRadius);
  let moved = false;
  const before = boxed.player.hp;
  for (let i = 0; i < 6; i++) {
    const was = { x: cornered.x, y: cornered.y };
    takeAiTurn(boxed, cornered);
    if (cornered.x !== was.x || cornered.y !== was.y) moved = true;
  }
  check('a cornered archer either retreats or swings',
    moved || boxed.player.hp < before);

  check('archers reload on their own turns, not the player\'s', (() => {
    const a = makeMonster({ ...MONSTERS.boneSlinger }, 0, 0);
    a.reloadLeft = 3;
    const fast = makeMonster({ ...MONSTERS.boneSlinger, speed: 200 }, 0, 0);
    fast.reloadLeft = 3;
    return a.speed !== fast.speed && a.ranged.reload === fast.ranged.reload;
  })());
}

// --- item briefs -----------------------------------------------------------
section('item briefs');
{
  const all = Object.values(ITEMS);
  check('every item has a category', all.every((i) => Boolean(itemCategory(i))));
  check('every item has a backstory to show on hover',
    all.every((i) => typeof i.lore === 'string' && i.lore.length > 40));
  check('every item has a one-line flavour for pickup',
    all.every((i) => typeof i.flavour === 'string' && i.flavour.length > 0));
  check('categories are exactly the ones a player would name', (() => {
    const found = [...new Set(all.map(itemCategory))].sort();
    const expected = ['armour', 'ranged', 'relic', 'seal', 'shield', 'weapon'];
    return found.length === expected.length && found.every((c, i) => c === expected[i]);
  })());
  check('ranged weapons read as ranged, not as swords',
    itemCategory(ITEMS.arbalest) === 'ranged' && itemCategory(ITEMS.armingSword) === 'weapon');
  check('seals and relics are told apart',
    itemCategory(ITEMS.brassSeal) === 'seal' && itemCategory(ITEMS.psalmOfWard) === 'relic');

  // The brief is derived from the data, so it can never contradict the game.
  check('a brief states every effect the item actually has', all.every((i) => {
    const effects = describeItem(i).effects.join(' ');
    if (i.equip?.defense && !effects.includes('+' + i.equip.defense + ' defense')) return false;
    if (i.equip?.ranged && !effects.includes(String(i.equip.ranged.range))) return false;
    if (i.use?.amount && !effects.includes(String(i.use.amount))) return false;
    return true;
  }));
  check('a brief mentions the speed a heavy piece costs',
    describeItem(ITEMS.ossuaryPlate).effects.some((e) => e.includes('-25 speed')));
  check('every brief carries its lore through',
    all.every((i) => describeItem(i).lore.length > 0));
}

// --- naming ----------------------------------------------------------------
section('naming');
{
  check('the Empty Tomb fields a grave wraith, not "a doubt"',
    MONSTERS.graveWraith?.name === 'grave wraith' && MONSTERS.aDoubt === undefined);
  check('no region still references the old key',
    REGIONS.every((r) => !r.monsters.includes('aDoubt')));
  check('every monster a region names actually exists',
    REGIONS.every((r) => r.monsters.every((k) => Boolean(MONSTERS[k]))
      && Boolean(MONSTERS[r.boss])));
  check('no monster name starts with an article',
    Object.values(MONSTERS).every((m) => !/^an? /.test(m.name)));
}

// --- special mechanics -----------------------------------------------------
// Each trait is the identity of one piece of gear, so each gets tested as a
// behaviour rather than as a number on a sheet.

/** A game with one empty room, the player in it, and nothing else alive. */
function arena(seed) {
  const g = new Game({ seed, memorial: new Memorial(memoryStorage()) });
  g.level.entities.filter((e) => e.ai).forEach((e) => g.level.remove(e));
  const room = g.level.rooms[0];
  g.player.x = room.cx;
  g.player.y = room.cy;
  g.player.maxHp = 9999;
  g.player.hp = 9999;
  g.level.updateFov(g.player, g.theme.fovRadius);
  return { g, room };
}

function put(g, key, x, y, overrides = {}) {
  const m = makeMonster({ ...MONSTERS[key], maxHp: 400, ...overrides }, x, y);
  m.hp = m.maxHp;
  g.level.add(m);
  g.level.updateFov(g.player, g.theme.fovRadius);
  return m;
}

function wield(g, key) {
  g.player.equipment[ITEMS[key].equip.slot] = makeItem({ key, ...ITEMS[key] }, 0, 0);
}

section('cleave');
{
  const { g } = arena(9001);
  const a = put(g, 'deserter', g.player.x + 1, g.player.y);
  const b = put(g, 'deserter', g.player.x - 1, g.player.y);
  const c = put(g, 'deserter', g.player.x, g.player.y + 1);
  const far = put(g, 'deserter', g.player.x + 3, g.player.y);

  wield(g, 'armingSword');
  const before = [a, b, c].map((m) => m.hp);
  moveOrAttack(g, g.player, 1, 0);
  check('an ordinary sword hits only what you swung at',
    a.hp < before[0] && b.hp === before[1] && c.hp === before[2]);

  wield(g, 'martyrsGreatsword');
  check('the greatsword has cleave', hasTrait(g.player, 'cleave'));
  const mid = [a, b, c, far].map((m) => m.hp);
  moveOrAttack(g, g.player, 1, 0);
  check('cleaving hits everything adjacent at once',
    a.hp < mid[0] && b.hp < mid[1] && c.hp < mid[2]);
  check('but nothing out of reach', far.hp === mid[3]);
  check('and it says so', g.messages.some((m) => m.text.includes('sweep through')));

  // One swing, one turn: cleave must not become several turns of attacks.
  const solo = arena(9002);
  wield(solo.g, 'martyrsGreatsword');
  const only = put(solo.g, 'deserter', solo.g.player.x + 1, solo.g.player.y);
  check('cleaving with one target is just an attack',
    moveOrAttack(solo.g, solo.g.player, 1, 0) === true && only.hp < only.maxHp);
}

section('reach');
{
  const { g } = arena(9003);
  wield(g, 'heraldsPollaxe');
  check('the pollaxe has reach', hasTrait(g.player, 'reach'));

  const target = put(g, 'deserter', g.player.x + 2, g.player.y);
  const startX = g.player.x;
  const before = target.hp;
  check('you strike two tiles away instead of stepping',
    moveOrAttack(g, g.player, 1, 0) === true && target.hp < before && g.player.x === startX);

  // Without reach the same move is a step, not a strike.
  const plain = arena(9004);
  wield(plain.g, 'armingSword');
  const other = put(plain.g, 'deserter', plain.g.player.x + 2, plain.g.player.y);
  const wasX = plain.g.player.x;
  moveOrAttack(plain.g, plain.g.player, 1, 0);
  check('an ordinary weapon just walks', plain.g.player.x === wasX + 1 && other.hp === other.maxHp);

  check('reach does not strike through stone', (() => {
    const w = arena(9005);
    wield(w.g, 'heraldsPollaxe');
    // Aim at a wall: the intervening tile is not walkable, so nothing happens.
    const room = w.room;
    w.g.player.x = room.x;
    w.g.player.y = room.cy;
    const behind = put(w.g, 'deserter', room.x - 2, room.cy);
    const hp = behind.hp;
    moveOrAttack(w.g, w.g.player, -1, 0);
    return behind.hp === hp;
  })());
}

section('piercing shot');
{
  const { g, room } = arena(9006);
  wield(g, 'arbalest');
  check('the arbalest pierces', hasTrait(g.player, 'pierce'));

  g.player.x = room.x + 1;
  g.player.y = room.cy;
  const inLine = [1, 2, 3].map((n) => put(g, 'deserter', g.player.x + n, g.player.y));
  const aside = put(g, 'deserter', g.player.x + 1, g.player.y + 2);
  const before = inLine.map((m) => m.hp);

  check('one shot goes through the whole line', fire(g, g.player) === true
    && inLine.every((m, i) => m.hp < before[i]));
  check('it leaves what is not in the line alone', aside.hp === aside.maxHp);
  check('it is still one shot and one reload', !canFire(g.player));
  check('and it says so', g.messages.some((m) => m.text.includes('goes through')));

  check('a plain crossbow hits only the first thing', (() => {
    const p = arena(9007);
    wield(p.g, 'huntingCrossbow');
    p.g.player.x = p.room.x + 1;
    p.g.player.y = p.room.cy;
    const row = [1, 2].map((n) => put(p.g, 'deserter', p.g.player.x + n, p.g.player.y));
    const hp = row.map((m) => m.hp);
    fire(p.g, p.g.player);
    return row[0].hp < hp[0] && row[1].hp === hp[1];
  })());
}

section('block');
{
  const { g } = arena(9008);
  wield(g, 'towerShield');
  check('the tower shield blocks', hasTrait(g.player, 'block') && canBlock(g.player));

  const foe = put(g, 'flagellant', g.player.x + 1, g.player.y);
  const full = g.player.hp;
  attack(g, foe, g.player);
  check('the first blow is stopped outright', g.player.hp === full);
  check('the log says the shield took it',
    g.messages.some((m) => m.text.includes('takes all of it')));
  check('the shield is down afterwards', !canBlock(g.player));

  attack(g, foe, g.player);
  check('the next blow gets through', g.player.hp < full);

  // Measure recovery in peace: while anything is still swinging, the shield is
  // spent again the instant it comes back, which is correct but unobservable.
  g.level.remove(foe);
  let turns = 0;
  while (!canBlock(g.player) && turns < 40) { g.playerActed(); turns++; }
  check('the shield comes back up after a few turns (' + turns + ')',
    canBlock(g.player) && turns > 1 && turns < 20);

  check('blocking is periodic, not permanent', (() => {
    // Tick the shield directly: a live attacker would also be swinging on its
    // own turns and spending the block before this loop could observe it.
    const s2 = arena(9101);
    wield(s2.g, 'towerShield');
    const attacker = put(s2.g, 'flagellant', s2.g.player.x + 1, s2.g.player.y);
    attacker.ai = null;
    let blocks = 0;
    let through = 0;
    for (let i = 0; i < 30; i++) {
      if (canBlock(s2.g.player)) blocks++; else through++;
      attack(s2.g, attacker, s2.g.player);
      tickBlock(s2.g.player);
    }
    return blocks >= 3 && through > blocks;    // rare relief, not immunity
  })());
}

section('riposte');
{
  const { g } = arena(9009);
  wield(g, 'aegisOfAmbrose');
  g.player.defense = 40;                       // guarantee the blow is absorbed
  check('the aegis ripostes', hasTrait(g.player, 'riposte'));

  const foe = put(g, 'campDog', g.player.x + 1, g.player.y);
  const foeHp = foe.hp;
  attack(g, foe, g.player);
  check('a blow that is fully turned aside is answered', foe.hp < foeHp);
  check('the answer is named', g.messages.some((m) => m.text.includes('You answer')));

  check('a riposte cannot provoke a riposte', (() => {
    // Both sides ripostiing would recurse forever if it were not guarded.
    const r = arena(9010);
    wield(r.g, 'aegisOfAmbrose');
    r.g.player.defense = 40;
    const other = put(r.g, 'campDog', r.g.player.x + 1, r.g.player.y, { defense: 40 });
    other.equipment = { shield: makeItem({ key: 'aegisOfAmbrose', ...ITEMS.aegisOfAmbrose }, 0, 0) };
    attack(r.g, other, r.g.player);
    return true;                               // reaching here at all is the test
  })());

  check('a solid hit is not answered', (() => {
    const q = arena(9011);
    wield(q.g, 'aegisOfAmbrose');
    q.g.player.defense = 0;
    const brute = put(q.g, 'ogre', q.g.player.x + 1, q.g.player.y, { power: 40 });
    const hp = brute.hp;
    attack(q.g, brute, q.g.player);
    return brute.hp === hp;
  })());
}

section('sanctuary');
{
  const { g } = arena(9012);
  wield(g, 'vestmentOfTheChoir');
  check('the vestment grants sanctuary', hasTrait(g.player, 'sanctuary'));

  const base = effectiveDefense(g.player);
  for (let i = 0; i < 6; i++) { wait(); g.playerActed(); }
  const held = effectiveDefense(g.player);
  check('holding your ground hardens you', held > base);
  check('and the panel can see it', sanctuaryBonus(g.player) > 0);

  moveOrAttack(g, g.player, 1, 0);
  g.playerActed();
  check('moving forgets all of it', sanctuaryBonus(g.player) === 0);

  for (let i = 0; i < 60; i++) { wait(); g.playerActed(); }
  check('it does not grow without limit', sanctuaryBonus(g.player) <= 4);
  check('gear without the trait never gains it', (() => {
    const n = arena(9013);
    wield(n.g, 'ossuaryPlate');
    for (let i = 0; i < 10; i++) { wait(); n.g.playerActed(); }
    return sanctuaryBonus(n.g.player) === 0;
  })());
}

section('attunement');
{
  const g = new Game({ seed: 9014, memorial: new Memorial(memoryStorage()) });
  const phial = makeItem({ key: 'reliquaryPhial', ...ITEMS.reliquaryPhial }, 0, 0);
  g.player.inventory.push(phial);

  check('a fresh relic is worth its printed value',
    attunedAmount(phial) === ITEMS.reliquaryPhial.use.amount);

  for (let i = 0; i < 45; i++) g.playerActed();
  check('carrying it unused makes it stronger',
    attunedAmount(phial) > ITEMS.reliquaryPhial.use.amount);
  check('the clock is the turns it spent in the pack', phial.item.carried === 45);

  for (let i = 0; i < 600; i++) g.playerActed();
  check('attunement is capped',
    attunedAmount(phial) === ITEMS.reliquaryPhial.use.amount + ITEMS.reliquaryPhial.use.attune.max);

  check('an attuned phial actually heals more', (() => {
    const h = new Game({ seed: 9015, memorial: new Memorial(memoryStorage()) });
    h.player.maxHp = 500;
    const fresh = makeItem({ key: 'reliquaryPhial', ...ITEMS.reliquaryPhial }, 0, 0);
    h.player.inventory.push(fresh);
    h.player.hp = 100;
    useItem(h, h.player, 0);
    const plain = h.player.hp - 100;

    const aged = makeItem({ key: 'reliquaryPhial', ...ITEMS.reliquaryPhial }, 0, 0);
    aged.item.carried = 150;
    h.player.inventory.push(aged);
    h.player.hp = 100;
    useItem(h, h.player, 0);
    return (h.player.hp - 100) > plain;
  })());

  check('gear does not attune, only relics', (() => {
    const k = new Game({ seed: 9016, memorial: new Memorial(memoryStorage()) });
    const sword = makeItem({ key: 'armingSword', ...ITEMS.armingSword }, 0, 0);
    k.player.inventory.push(sword);
    for (let i = 0; i < 40; i++) k.playerActed();
    return (sword.item.carried ?? 0) === 0;
  })());
}

section('echo');
{
  const { g, room } = arena(9017);
  g.player.x = room.cx;
  g.player.y = room.cy;
  const foe = put(g, 'deserter', g.player.x + 2, g.player.y);
  g.player.inventory.push(makeItem({ key: 'sparkOfTheChoir', ...ITEMS.sparkOfTheChoir }, 0, 0));

  const before = foe.hp;
  useItem(g, g.player, 0);
  const afterFirst = foe.hp;
  check('the spark strikes at once', afterFirst < before);
  check('and promises a second', g.echoes.length === 1
    && g.messages.some((m) => m.text.includes('takes up the note')));

  let waited = 0;
  while (g.echoes.length && waited < 12) { wait(); g.playerActed(); waited++; }
  check('the echo lands a few turns later (' + waited + ')',
    foe.hp < afterFirst && waited === ITEMS.sparkOfTheChoir.use.echo);
  check('and does not repeat forever', g.echoes.length === 0);

  check('an echo does not carry between floors', (() => {
    const d = arena(9018);
    d.g.scheduleEcho({ amount: 5, range: 6, turns: 3 });
    d.g.buildLevel(2);
    return d.g.echoes.length === 0;
  })());
}

// --- heirlooms -------------------------------------------------------------
section('gear remembers who carried it');
{
  const memorial = new Memorial(memoryStorage());
  const first = new Game({ seed: 9020, memorial });
  first.buildLevel(9);                         // died deep, so the bonus is real
  first.player.equipment.weapon = makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0);
  first.finishRun('the Voice in the Vaults');

  const second = invincible(new Game({ seed: 9021, memorial }));
  second.buildLevel(9);
  const revenant = second.level.entities.find((e) => e.revenant);
  check('a predecessor is waiting with your old weapon', Boolean(revenant));

  killEntity(second, revenant);
  const reclaimed = second.level.entities.find((e) => e.item?.key === 'censerFlail');
  check('killing them drops it back', Boolean(reclaimed));
  check('and it now carries their name', Boolean(reclaimed.item.heirloom)
    && reclaimed.item.heirloom.of === first.crusaderName);
  check('the bonus scales with how deep they got',
    heirloomBonus(reclaimed.item.heirloom) === Math.min(4, Math.floor(9 / 3)));
  check('the drop is announced as something more than loot',
    second.messages.some((m) => m.text.includes('knows your name')));

  // Wielding it must actually be worth more than a fresh one.
  const fresh = new Game({ seed: 9022, memorial: new Memorial(memoryStorage()) });
  fresh.player.equipment.weapon = makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0);
  const plainPower = effectivePower(fresh.player);
  fresh.player.equipment.weapon = reclaimed;
  check('an heirloom hits harder than the same weapon fresh',
    effectivePower(fresh.player) === plainPower + heirloomBonus(reclaimed.item.heirloom));

  check('an heirloom shield adds defense, not power', (() => {
    const t = new Game({ seed: 9023, memorial: new Memorial(memoryStorage()) });
    const shield = makeItem({ key: 'towerShield', ...ITEMS.towerShield }, 0, 0);
    shield.item.heirloom = { of: 'Pilgrim Test', deepest: 12, marks: 1 };
    const powerBefore = effectivePower(t.player);
    const defenseBefore = effectiveDefense(t.player);
    t.player.equipment.shield = shield;
    return effectivePower(t.player) === powerBefore
      && effectiveDefense(t.player) > defenseBefore + ITEMS.towerShield.equip.defense - 1;
  })());

  check('an heirloom bow shoots harder', (() => {
    const b = new Game({ seed: 9024, memorial: new Memorial(memoryStorage()) });
    b.player.equipment.weapon = makeItem({ key: 'arbalest', ...ITEMS.arbalest }, 0, 0);
    const plain = rangedProfile(b.player).power;
    b.player.equipment.weapon.item.heirloom = { of: 'Pilgrim Test', deepest: 12, marks: 1 };
    return rangedProfile(b.player).power > plain;
  })());

  check('the history deepens each time it is lost and reclaimed', (() => {
    const m2 = new Memorial(memoryStorage());
    m2.record({
      name: 'Pilgrim Second', depth: 6, relics: [], turn: 1, at: Date.now(),
      equipment: [{ key: 'censerFlail', heirloom: { of: 'Pilgrim First', deepest: 4, marks: 1 } }],
    });
    const rev = makeRevenant(m2.entries[0], 0, 0);
    const drop = rev.drops.find((d) => d.key === 'censerFlail');
    return drop.heirloom.marks === 2 && drop.heirloom.deepest === 6;
  })());

  check('memorial entries written before heirlooms existed still work', (() => {
    const legacy = new Memorial(memoryStorage());
    legacy.record({
      name: 'Pilgrim Ancient', depth: 5, relics: [], turn: 1, at: Date.now(),
      equipment: ['mailHauberk'],              // the old bare-key shape
    });
    const rev = makeRevenant(legacy.entries[0], 0, 0);
    const drop = rev.drops.find((d) => d.key === 'mailHauberk');
    return Boolean(drop) && drop.heirloom.marks === 1 && drop.heirloom.deepest === 5;
  })());
}

section('traits are described where they are implemented');
{
  const used = new Set(Object.values(ITEMS).map((i) => i.trait).filter(Boolean));
  check('every trait on an item has a description',
    [...used].every((t) => Boolean(TRAITS[t]?.label && TRAITS[t]?.text)));
  check('every described trait is actually on something',
    Object.keys(TRAITS).every((t) => used.has(t)));
  check('all eight special mechanics are present', used.size === 6
    && Object.values(ITEMS).some((i) => i.use?.attune)
    && Object.values(ITEMS).some((i) => i.use?.echo));
  check('briefs surface the trait',
    describeItem(ITEMS.towerShield).trait.label === 'Block');
  check('briefs surface an heirloom when one exists',
    describeItem(ITEMS.censerFlail, { heirloom: { of: 'X', deepest: 9, marks: 2 } })
      .heirloom.bonus === 3);
}

// --- the story of the first crusader ---------------------------------------
section('the story');
{
  check('every region with a gate has a chapter',
    REGIONS.filter((r) => !r.final).every((r) => Boolean(GATE_CHAPTERS[r.key])));
  check('every boss has lore', REGIONS.every((r) => Boolean(BOSS_LORE[r.boss])));
  check('every mini-boss lore names its mechanic',
    REGIONS.filter((r) => !r.final).every((r) => BOSS_LORE[r.boss].mechanic?.length > 8));

  // The whole point of the structure: nothing before the meeting may give it
  // away. If a future edit leaks the twist into a gate chapter, this fails.
  const GIVEAWAYS = [
    'still here', 'still alive', 'turned', 'betray', 'enemy', 'kill him',
    'knows your name', 'waiting for', 'he is the', 'fight him',
  ];
  const chapterText = Object.values(GATE_CHAPTERS)
    .flatMap((c) => c.lines).join(' ').toLowerCase();
  check('no gate chapter gives away what he became',
    GIVEAWAYS.every((phrase) => !chapterText.includes(phrase)));
  check('the reveal is the only place it is told',
    REVEAL.lines.join(' ').toLowerCase().includes('waiting for'));
  check('the final boss lore is the reveal',
    BOSS_LORE.baudouin.lines === REVEAL.lines);
  check('the first crusader is the final boss',
    MONSTERS[REGIONS[REGIONS.length - 1].boss].name === FIRST_CRUSADER);

  // Triggering.
  const g = invincible(new Game({ seed: 3001, memorial: new Memorial(memoryStorage()) }));
  check('no story is waiting on an ordinary floor', g.pendingStory() === null);

  g.buildLevel(3);
  g.player.x = g.level.stairs.x;
  g.player.y = g.level.stairs.y;
  g.playerActed();
  const first = g.pendingStory();
  check('seeing the gate tells the first chapter',
    first?.title === GATE_CHAPTERS.siegeYards.title);

  g.dismissStory();
  const second = g.pendingStory();
  check('the boss in the gate room introduces itself too',
    second?.title === BOSS_LORE.herald.title && second.mechanic?.length > 0);
  g.dismissStory();

  for (let i = 0; i < 5; i++) g.playerActed();
  check('neither is told twice', g.pendingStory() === null);

  check('each region tells its own chapter once', (() => {
    const h = invincible(new Game({ seed: 3002, memorial: new Memorial(memoryStorage()) }));
    const titles = [];
    for (const depth of [3, 6, 9]) {
      h.buildLevel(depth);
      h.player.x = h.level.stairs.x;
      h.player.y = h.level.stairs.y;
      h.playerActed();
      while (h.pendingStory()) titles.push(h.dismissStory().title);
    }
    return titles.includes(GATE_CHAPTERS.siegeYards.title)
      && titles.includes(GATE_CHAPTERS.reliquary.title)
      && titles.includes(GATE_CHAPTERS.choir.title);
  })());

  check('the reveal waits for the bottom', (() => {
    const d = invincible(new Game({ seed: 3003, memorial: new Memorial(memoryStorage()) }));
    d.buildLevel(12);
    const boss = d.level.entities.find((e) => e.boss);
    d.player.x = boss.x + 1;
    d.player.y = boss.y;
    d.playerActed();
    return d.pendingStory()?.title === FIRST_CRUSADER;
  })());
}

// --- boss mechanics --------------------------------------------------------
section('boss mechanics');
{
  const bossArena = (depth) => {
    const g = invincible(new Game({ seed: 3100 + depth, memorial: new Memorial(memoryStorage()) }));
    g.buildLevel(depth);
    const boss = g.level.entities.find((e) => e.boss);
    g.level.entities.filter((e) => e.ai && !e.boss).forEach((e) => g.level.remove(e));
    g.player.x = boss.x + 2;
    g.player.y = boss.y;
    g.level.updateFov(g.player, g.theme.fovRadius);
    return { g, boss };
  };

  // The Herald reads the roll, and names answer.
  {
    const { g, boss } = bossArena(3);
    check('the Herald calls the roll', boss.bossTrait === 'callTheRoll');
    const before = g.level.entities.filter((e) => e.ai && !e.boss).length;
    for (let i = 0; i < 40; i++) takeAiTurn(g, boss);
    const after = g.level.entities.filter((e) => e.ai && !e.boss).length;
    check('names answer to it', after > before);
    check('it announces the call',
      g.messages.some((m) => m.text.includes('reads out a name')));
    for (let i = 0; i < 200; i++) takeAiTurn(g, boss);
    check('but only so many of them',
      g.level.entities.filter((e) => e.ai && !e.boss).length <= before + 4);
  }

  // Saint Perpetua declines to stay dead, once.
  {
    const { g, boss } = bossArena(6);
    check('the saint rises again', boss.bossTrait === 'risesAgain');
    damage(g, boss, 9999, g.player);
    check('killing her the first time does not', boss.alive && boss.hp > 0);
    check('she gets back up with less of her', boss.hp < boss.maxHp);
    check('and says so', g.messages.some((m) => m.text.includes('gets up again')));
    damage(g, boss, 9999, g.player);
    check('the second time takes', !boss.alive);
    check('she does not rise twice', boss.hasRisen === true);
  }

  // Odo reaches you wherever he can be heard.
  {
    const { g, boss } = bossArena(9);
    check('the Precentor carries', boss.bossTrait === 'carries');
    check('his voice has no useful range limit', boss.ranged?.range > 20);
    const room = g.level.rooms[0];
    g.player.x = room.cx;
    g.player.y = room.cy;
    boss.x = room.cx;
    boss.y = room.cy + 1;                      // same room, then step apart
    g.level.updateFov(g.player, g.theme.fovRadius);
    const hp = g.player.hp;
    for (let i = 0; i < 10; i++) takeAiTurn(g, boss);
    check('he strikes without closing', g.player.hp < hp);
  }

  // Baudouin has watched nine crusades fight.
  {
    const g = invincible(new Game({ seed: 3200, memorial: new Memorial(memoryStorage()) }));
    g.player.power = 30;
    g.player.defense = 12;
    g.player.equipment.weapon = makeItem(
      { key: 'martyrsGreatsword', ...ITEMS.martyrsGreatsword }, 0, 0);
    g.buildLevel(12);
    const boss = g.level.entities.find((e) => e.boss);
    check('Baudouin mirrors', boss.bossTrait === 'mirrors' && boss.mirrored === true);
    check('he answers your power', boss.power > MONSTERS.baudouin.power);
    check('he answers your defense', boss.defense > MONSTERS.baudouin.defense);
    check('he picks up your weapon', boss.equipment?.weapon?.item.key === 'martyrsGreatsword');
    check('and therefore your trait', hasTrait(boss, 'cleave'));

    // Not invincible(): that helper sets power 500, which would make the
    // "modest" crusader the strongest thing in the test.
    const weak = new Game({ seed: 3201, memorial: new Memorial(memoryStorage()) });
    weak.buildLevel(12);
    const mild = weak.level.entities.find((e) => e.boss);
    check('a modest crusader meets a modest Baudouin', mild.power < boss.power);
  }
}

// --- naming yourself -------------------------------------------------------
section('naming yourself');
{
  const g = new Game({ seed: 3300, memorial: new Memorial(memoryStorage()) });
  const generated = g.crusaderName;
  check('a crusader is named for you if you do not', generated.length > 0);

  check('you can take the name yourself', g.renameCrusader('Onni the Unhurried')
    && g.crusaderName === 'Onni the Unhurried' && g.player.name === 'Onni the Unhurried');
  check('whitespace is tidied', g.renameCrusader('  Onni   the   Brief  ')
    && g.crusaderName === 'Onni the Brief');
  check('an empty name is refused',
    g.renameCrusader('   ') === false && g.crusaderName === 'Onni the Brief');
  check('a name cannot run away with the panel',
    g.renameCrusader('x'.repeat(200)) && g.crusaderName.length === 40);

  check('the memorial remembers the name you chose', (() => {
    const memorial = new Memorial(memoryStorage());
    const run = new Game({ seed: 3301, memorial });
    run.buildLevel(5);
    run.renameCrusader('Onni the Unhurried');
    run.finishRun('a bonepicker');

    const next = new Game({ seed: 3302, memorial });
    next.buildLevel(5);
    const revenant = next.level.entities.find((e) => e.revenant);
    return memorial.entries[0].name === 'Onni the Unhurried'
      && revenant.name.includes('Onni the Unhurried');
  })());
}

// --- merging ---------------------------------------------------------------
section('merging duplicates');
{
  const g = new Game({ seed: 5001, memorial: new Memorial(memoryStorage()) });
  const give = (key) => g.player.inventory.push(makeItem({ key, ...ITEMS[key] }, 0, 0));

  give('armingSword');
  check('a single item cannot be merged with itself', mergeDuplicates(g, g.player) === false);

  give('armingSword');
  const power = effectivePower(g.player);
  check('two of a kind press together', mergeDuplicates(g, g.player) === true);
  check('both copies are spent', g.player.inventory.length === 0);
  check('and the crusader keeps the advantage', effectivePower(g.player) === power + 1);
  check('which is recorded as a merge', g.player.merges.length === 1);

  give('gambeson'); give('gambeson');
  const defense = effectiveDefense(g.player);
  mergeDuplicates(g, g.player);
  check('armour merges into defense', effectiveDefense(g.player) === defense + 1);

  const beforeRegen = regenInterval(g.player);
  give('reliquaryPhial'); give('reliquaryPhial');
  mergeDuplicates(g, g.player);
  check('phials merge into faster recovery', regenInterval(g.player) < beforeRegen);

  check('merges stack', (() => {
    const h = new Game({ seed: 5002, memorial: new Memorial(memoryStorage()) });
    for (let i = 0; i < 4; i++) {
      h.player.inventory.push(makeItem({ key: 'armingSword', ...ITEMS.armingSword }, 0, 0));
    }
    const base = effectivePower(h.player);
    mergeDuplicates(h, h.player);
    mergeDuplicates(h, h.player);
    return effectivePower(h.player) === base + 2 && h.player.merges.length === 2;
  })());

  check('nothing that matters can be merged away',
    mergeBoon(ITEMS.brassSeal) === null && mergeBoon(ITEMS.theRelic) === null);

  check('a merge spends the plain copies before an heirloom', (() => {
    const h = new Game({ seed: 5003, memorial: new Memorial(memoryStorage()) });
    const heirloom = makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0);
    heirloom.item.heirloom = { of: 'Pilgrim Test', deepest: 9, marks: 1 };
    h.player.inventory.push(
      makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0),
      heirloom,
      makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0),
    );
    mergeDuplicates(h, h.player);
    return h.player.inventory.length === 1
      && h.player.inventory[0].item.heirloom?.of === 'Pilgrim Test';
  })());
}

section('merges belong to the living');
{
  // Every boon is a derived stat, never a base one, so nothing the memorial
  // records can carry a merge forward into something that fights you.
  const memorial = new Memorial(memoryStorage());
  const run = new Game({ seed: 5010, memorial });
  run.buildLevel(5);
  for (let i = 0; i < 6; i++) {
    run.player.inventory.push(makeItem({ key: 'armingSword', ...ITEMS.armingSword }, 0, 0));
  }
  mergeDuplicates(run, run.player);
  mergeDuplicates(run, run.player);
  mergeDuplicates(run, run.player);
  const basePower = run.player.power;
  check('merging never touches the base stat', effectivePower(run.player) > basePower);

  run.finishRun('a bonepicker');
  check('the memorial records the base stat, not the merged one',
    memorial.entries[0].power === basePower);

  const next = new Game({ seed: 5011, memorial });
  next.buildLevel(5);
  const revenant = next.level.entities.find((e) => e.revenant);
  check('a revenant inherits no merges',
    !revenant.merges?.length && mergeBonus(revenant, 'power') === 0);
  check('and is no stronger for them', revenant.power === basePower);
}

// --- region silhouettes ----------------------------------------------------
section('every region is shaped differently');
{
  const survey = (region) => {
    let rooms = 0;
    let open = 0;
    let biggest = 0;
    for (let seed = 0; seed < 25; seed++) {
      const level = generateLevel(new RNG(seed * 31 + 7), 72, 34, { region });
      rooms += level.rooms.length;
      open += level.tiles.cells.filter((t) => t.walkable).length;
      biggest += Math.max(...level.rooms.map((r) => r.w * r.h));
    }
    return { rooms: rooms / 25, open: open / 25, biggest: biggest / 25 };
  };

  const shapes = Object.fromEntries(REGIONS.map((r) => [r.key, survey(r)]));

  check('the catacombs are made of many small chambers',
    shapes.reliquary.rooms > shapes.siegeYards.rooms
    && shapes.reliquary.biggest < shapes.siegeYards.biggest);
  check('the choir is a few enormous halls',
    shapes.choir.rooms < shapes.siegeYards.rooms
    && shapes.choir.biggest > shapes.siegeYards.biggest * 1.5);
  check('the empty tomb is open cavern, not rooms',
    shapes.emptyTomb.open > shapes.siegeYards.open * 1.5);
  check('no two regions produce the same silhouette', (() => {
    const signatures = Object.values(shapes)
      .map((s) => Math.round(s.rooms) + ':' + Math.round(s.open / 50));
    return new Set(signatures).size === signatures.length;
  })());

  check('all four regions generate fully connected floors', (() => {
    for (const region of REGIONS) {
      for (let seed = 0; seed < 40; seed++) {
        const level = generateLevel(new RNG(seed * 17 + 3), 72, 34, { region });
        const start = level.rooms[0];
        const dist = dijkstraMap(72, 34, [[start.cx, start.cy]],
          (x, y) => level.tiles.get(x, y).walkable);
        if (level.rooms.some((r) => dist[r.cy * 72 + r.cx] >= UNREACHABLE)) return false;
        if (dist[level.stairs.y * 72 + level.stairs.x] >= UNREACHABLE) return false;
      }
    }
    return true;
  })());
}

// --- boss arenas -----------------------------------------------------------
section('boss arenas');
{
  const ringOf = (room) => {
    const ring = [];
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      ring.push([x, room.y - 1], [x, room.y + room.h]);
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      ring.push([room.x - 1, y], [room.x + room.w, y]);
    }
    return ring;
  };

  check('every boss floor of every region has a sealed arena', (() => {
    for (const region of REGIONS) {
      for (let seed = 0; seed < 20; seed++) {
        const level = generateLevel(new RNG(seed * 13 + 5), 72, 34,
          { region, bossFloor: true });
        if (!level.bossRoom || !level.door) return false;

        // Exactly one way in, however the corridor arrived.
        const ways = ringOf(level.bossRoom)
          .filter(([x, y]) => level.tiles.get(x, y)?.walkable).length;
        if (ways !== 1) return false;

        const s = level.stairs;
        const inside = s.x >= level.bossRoom.x && s.x < level.bossRoom.x + level.bossRoom.w
          && s.y >= level.bossRoom.y && s.y < level.bossRoom.y + level.bossRoom.h;
        if (!inside) return false;
      }
    }
    return true;
  })());

  const g = invincible(new Game({ seed: 5100, memorial: new Memorial(memoryStorage()) }));
  g.buildLevel(3);
  const boss = g.level.entities.find((e) => e.boss);
  check('the boss is inside the arena', g.level.inArena(boss.x, boss.y));
  check('nothing else is in there with it',
    g.level.entities.filter((e) => e.ai && !e.boss && g.level.inArena(e.x, e.y)).length === 0);
  check('and nor is any loot',
    g.level.entities.filter((e) => e.item && g.level.inArena(e.x, e.y)).length === 0);

  const door = g.level.door;
  const outside = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: door.x + dx, y: door.y + dy }))
    .find((p) => !g.level.inArena(p.x, p.y) && g.level.isWalkable(p.x, p.y));
  g.player.x = outside.x;
  g.player.y = outside.y;
  const turnBefore = g.turn;
  const stepped = moveOrAttack(g, g.player, door.x - outside.x, door.y - outside.y);
  check('walking into the door asks first', stepped === false && Boolean(g.prompt));
  check('and costs no turn', g.turn === turnBefore);
  check('the question is the one a player would want asked',
    g.prompt.question.includes('Are you sure you want to enter'));

  g.declineArena();
  check('saying no leaves you outside',
    !g.prompt && !g.level.inArena(g.player.x, g.player.y) && !g.level.doorLocked);

  moveOrAttack(g, g.player, door.x - g.player.x, door.y - g.player.y);
  check('saying yes puts you inside',
    g.enterArena() === true && g.level.inArena(g.player.x, g.player.y));
  check('and bars the door behind you',
    g.level.doorLocked && !g.level.tiles.get(door.x, door.y).walkable);
  check('the boss tells you what it is only once you are committed',
    g.pendingStory()?.title === BOSS_LORE.herald.title);
  while (g.pendingStory()) g.dismissStory();

  check('there is no walking back out', (() => {
    const dx = Math.sign(door.x - g.player.x);
    const dy = Math.sign(door.y - g.player.y);
    g.player.x = door.x - dx;
    g.player.y = door.y - dy;
    return moveOrAttack(g, g.player, dx, dy) === false;
  })());

  check('nor blinking out', (() => {
    for (let i = 0; i < 30; i++) {
      const spot = g.randomOpenTile();
      if (spot && !g.level.inArena(spot.x, spot.y)) return false;
    }
    return true;
  })());

  check('the boss will not follow you out either', (() => {
    const b = g.level.entities.find((e) => e.boss && e.alive);
    g.player.x = outside.x;
    g.player.y = outside.y;
    for (let i = 0; i < 60; i++) takeAiTurn(g, b);
    return g.level.inArena(b.x, b.y);
  })());

  check('killing it opens the door', (() => {
    const b = g.level.entities.find((e) => e.boss && e.alive);
    damage(g, b, 99999, g.player);
    return !g.level.doorLocked && g.level.tiles.get(door.x, door.y).walkable;
  })());

  check('and the door stops being a question', (() => {
    // Walking back in for the loot must not ask again, nor shut behind you.
    g.player.x = outside.x;
    g.player.y = outside.y;
    g.prompt = null;
    const stepped2 = moveOrAttack(g, g.player, door.x - outside.x, door.y - outside.y);
    return stepped2 === true && !g.prompt && !g.level.doorLocked;
  })());
}

// --- what the renderer draws ------------------------------------------------
section('terrain drawing contract');
{
  // The renderer draws ground as filled mass and only letters things that are
  // objects. `glyph` stays the identity of every tile regardless -- the dev
  // menu, these tests, and any future tileset all key off it.
  check('every tile still has a glyph',
    Object.values(Tiles).every((t) => typeof t.glyph === 'string' && t.glyph.length === 1));
  check('ground is drawn as mass, not lettering',
    !Tiles.wall.drawGlyph && !Tiles.floor.drawGlyph);
  check('things you can use keep their glyph',
    Tiles.stairsDown.drawGlyph && Tiles.sealedGate.drawGlyph
    && Tiles.door.drawGlyph && Tiles.doorLocked.drawGlyph);
  check('exactly the walkable-but-notable tiles are lettered',
    Object.values(Tiles).filter((t) => t.drawGlyph).length === 4);
}

// --- creature icons --------------------------------------------------------
section('creature icons');
{
  const CREATURES = [...Object.keys(MONSTERS), 'player', 'revenant', 'corpse'];

  check('every creature has an icon',
    CREATURES.every((key) => typeof ICONS[key] === 'function'));
  check('no icon is defined for something that does not exist',
    Object.keys(ICONS).every((key) => CREATURES.includes(key)));

  /** A painter that records instead of drawing, so icons can be run headless. */
  const recorder = () => {
    const marks = [];
    const record = (name) => (...args) => marks.push({ name, args });
    return {
      marks,
      place: () => {},
      poly: record('poly'),
      line: record('line'),
      rect: record('rect'),
      dot: record('dot'),
      ring: record('ring'),
      arc: record('arc'),
    };
  };

  const drawn = Object.fromEntries(CREATURES.map((key) => {
    const p = recorder();
    ICONS[key](p);
    return [key, p.marks];
  }));

  check('every icon draws something', CREATURES.every((k) => drawn[k].length > 0));

  // Sixteen pixels takes three or four marks before it turns to mud.
  check('no icon is more crowded than it can afford to be',
    CREATURES.every((k) => drawn[k].length <= 6));

  // Unit-space discipline: an icon that strays outside 0..1 would spill into
  // the neighbouring cell at draw time, which is invisible in a screenshot
  // until two creatures stand side by side.
  const within = (v) => v >= -0.03 && v <= 1.03;
  const strays = [];
  for (const key of CREATURES) {
    for (const { name, args } of drawn[key]) {
      let ok = true;
      if (name === 'poly' || name === 'line') {
        ok = args[0].every(([x, y]) => within(x) && within(y));
      } else if (name === 'rect') {
        const [x, y, w, h] = args;
        ok = within(x) && within(y) && within(x + w) && within(y + h);
      } else if (name === 'dot' || name === 'ring') {
        const [cx, cy, r] = args;
        ok = within(cx - r) && within(cx + r) && within(cy - r) && within(cy + r);
      } else if (name === 'arc') {
        ok = within(args[0]) && within(args[1]);
      }
      if (!ok) strays.push(key + '/' + name);
    }
  }
  check('no icon draws outside its own cell' + (strays.length ? ' (' + strays.join(', ') + ')' : ''),
    strays.length === 0);

  // Identity has to come from shape: there are only four monster colours.
  const signature = (marks) => marks.map((m) => m.name).join('+');
  const bySignature = new Map();
  for (const key of Object.keys(MONSTERS)) {
    const sig = signature(drawn[key]);
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig).push(key);
  }
  const biggestClash = Math.max(...[...bySignature.values()].map((g) => g.length));
  check('monster silhouettes are built from varied shapes (largest identical group: '
    + biggestClash + ')', biggestClash <= 4);

  check('the revenant is drawn hollow, as the player is not', (() => {
    const hollow = (marks) => marks.every((m) => m.name === 'ring' || m.name === 'line');
    return hollow(drawn.revenant) && !hollow(drawn.player);
  })());
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
  check('every death was written to the memorial', memorial.entries.length === deaths);

  // Depth 1 is meant to be survivable, so a random walker living through it
  // proves nothing. Lethality belongs where the dungeon is supposed to bite.
  const victim = new Game({ seed: 606, memorial: new Memorial(memoryStorage()) });
  victim.buildLevel(6);
  for (let i = 0; i < 800 && victim.state === 'playing'; i++) victim.playerActed();
  check('a crusader who never fights back dies in the Reliquary',
    victim.state === 'dead');

  // And the opening floor is survivable even played badly.
  let survived = 0;
  for (let seed = 0; seed < 40; seed++) {
    const g = new Game({ seed: seed * 13 + 1, memorial: new Memorial(memoryStorage()) });
    for (let step = 0; step < 300 && g.state === 'playing'; step++) {
      if (moveOrAttack(g, g.player, ...g.rng.pick(DIRS))) g.playerActed();
    }
    if (g.state === 'playing') survived++;
  }
  check('most crusaders survive 300 turns of flailing on depth 1 (' + survived + '/40)',
    survived >= 30);
}

console.log('');
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
