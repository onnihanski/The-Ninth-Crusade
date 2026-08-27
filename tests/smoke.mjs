// Headless test suite: drives full crusades under node, with no DOM anywhere.
// Catches what is painful to find by clicking around a browser -- scheduler
// deadlocks, unreachable gates, AI walking into walls, memorial corruption.
import { Game } from '../src/game/game.js';
import { moveOrAttack, wait, pickUp, useItem, equipItem, unequip, dropItem, descend } from '../src/game/actions.js';
import { Memorial, memoryStorage } from '../src/game/memorial.js';
import { makeItem } from '../src/game/entity.js';
import { attack } from '../src/game/combat.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { Tiles } from '../src/world/tiles.js';
import { effectivePower, effectiveDefense, effectiveSpeed } from '../src/game/status.js';
import { keyToIntent } from '../src/ui/input.js';
import { xpToNext, tickRegeneration } from '../src/game/progress.js';
import { mitigate } from '../src/game/combat.js';
import { MONSTERS } from '../src/data/monsters.js';
import { REGIONS, MAX_DEPTH, isBossDepth } from '../src/data/regions.js';
import { ITEMS, itemTable, SLOTS } from '../src/data/items.js';
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
  first.player.equipment.weapon = makeItem({ key: 'censerFlail', ...ITEMS.censerFlail }, 0, 0);
  first.player.equipment.armour = makeItem({ key: 'mailHauberk', ...ITEMS.mailHauberk }, 0, 0);
  first.finishRun('a chorister');

  check('the memorial records what they were wearing',
    memorial.entries[0].equipment.includes('censerFlail')
    && memorial.entries[0].equipment.includes('mailHauberk'));

  const second = new Game({ seed: 701, memorial });
  const revenant = second.level.entities.find((e) => e.revenant);

  // Compare against the same predecessor recorded with nothing equipped, so the
  // difference can only come from the kit.
  const barefootMemorial = new Memorial(memoryStorage());
  barefootMemorial.record({ ...memorial.entries[0], equipment: [], relics: [] });
  const barefoot = new Game({ seed: 701, memorial: barefootMemorial })
    .level.entities.find((e) => e.revenant);

  check('the revenant hits harder for the weapon',
    revenant.power === barefoot.power + ITEMS.censerFlail.equip.power);
  check('the revenant is tougher for the armour',
    revenant.defense === barefoot.defense + ITEMS.mailHauberk.equip.defense);
  check('the revenant is slowed by it, as you were',
    revenant.speed === 100 + ITEMS.censerFlail.equip.speed + ITEMS.mailHauberk.equip.speed);
  check('the revenant drops the whole kit',
    revenant.drops.includes('censerFlail') && revenant.drops.includes('mailHauberk'));

  invincible(second);
  killEntity(second, revenant);
  const onFloor = second.level.entities.filter((e) => e.item).map((e) => e.item.key);
  check('your old gear is recoverable off your old body',
    onFloor.includes('censerFlail') && onFloor.includes('mailHauberk'));
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
