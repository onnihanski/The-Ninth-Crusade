import { chebyshev } from '../engine/grid.js';
import { makeMonster, makeItem } from './entity.js';
import { effectivePower, effectiveDefense } from './status.js';
import { monsterTable } from '../data/monsters.js';
import { ITEMS } from '../data/items.js';

// Each boss does exactly what its lore panel says it does. The panel is written
// from the mechanic rather than the other way round, so a player who reads it
// knows what is about to happen and still has to solve it.
const ROLL_EVERY = 8;         // Herald: turns between names called
const ROLL_LIMIT = 2;         // and how many will answer in total
const RISEN_SHARE = 0.4;      // Perpetua: how much of her comes back up
const CARRY_RANGE = 99;       // Odo: a voice does not have a range

// Baudouin answers your build, but within bounds. Mirroring a crusader's stats
// outright makes the ending unwinnable at exactly the moment a player has
// earned it: he would always hit nearly as hard as you while carrying more
// health than you, and the better your run the worse your odds. He scales, and
// then he stops.
const MIRROR_POWER_CAP = 4;
const MIRROR_DEFENSE_CAP = 2;
const MIRROR_HP_MULTIPLE = 2;
const MIRROR_LAG = 5;         // how far behind your build he stays

/**
 * Spawn-time setup. Only Baudouin needs it: he has been down here through nine
 * crusades, and what he has been doing is watching how they fight.
 */
export function prepareBoss(game, boss) {
  if (boss.bossTrait !== 'mirrors') {
    if (boss.bossTrait === 'carries') {
      // A voice that reaches everywhere cannot also hit like a greatsword:
      // there is nowhere to stand that is safe from it.
      boss.ranged = { power: Math.max(4, boss.power - 5), range: CARRY_RANGE, reload: 4 };
    }
    return;
  }

  const player = game.player;

  // He fights the way you fight: your weapon, and stats that answer yours.
  const weapon = player.equipment?.weapon;
  boss.equipment = { weapon: null, shield: null, armour: null };
  if (weapon) {
    const spec = ITEMS[weapon.item.key];
    if (spec) boss.equipment.weapon = makeItem({ key: weapon.item.key, ...spec }, boss.x, boss.y);
  }

  // Never weaker than the crusader who found him, never a wall either: he is
  // one step behind your build, which is close enough to be frightening.
  const basePower = boss.power;
  const baseDefense = boss.defense;
  const baseHp = boss.maxHp;

  boss.power = clamp(effectivePower(player) - MIRROR_LAG, basePower, basePower + MIRROR_POWER_CAP);
  boss.defense = clamp(effectiveDefense(player) - MIRROR_LAG, baseDefense, baseDefense + MIRROR_DEFENSE_CAP);
  boss.maxHp = clamp(player.maxHp, baseHp, baseHp * MIRROR_HP_MULTIPLE);
  boss.hp = boss.maxHp;
  boss.mirrored = true;
}

/**
 * A boss's turn, before its ordinary behaviour. Returns true if the special
 * consumed the turn.
 */
export function takeBossTurn(game, boss) {
  if (boss.bossTrait !== 'callTheRoll') return false;

  boss.rollTimer = (boss.rollTimer ?? 0) + 1;
  if (boss.rollTimer % ROLL_EVERY !== 0) return false;
  if ((boss.called ?? 0) >= ROLL_LIMIT) return false;

  const spot = openSpotNear(game, boss);
  if (!spot) return false;

  const table = monsterTable(game.region, game.level.depth).filter((m) => !m.boss);
  if (!table.length) return false;

  const answered = makeMonster(game.rng.weighted(table), spot.x, spot.y);
  answered.ai.hunting = true;
  game.level.add(answered);
  boss.called = (boss.called ?? 0) + 1;

  game.log('He reads out a name. Something answers to it.', 'mythic');
  return true;                                 // reading the roll takes a turn
}

/**
 * Death, intercepted. Saint Perpetua declines it once. Returns true if she is
 * still standing, in which case the caller must not finish her.
 */
export function bossRises(game, boss) {
  if (boss.bossTrait !== 'risesAgain' || boss.hasRisen) return false;

  boss.hasRisen = true;
  boss.hp = Math.max(1, Math.round(boss.maxHp * RISEN_SHARE));
  boss.defense = Math.max(0, boss.defense - 1);
  game.log('Saint Perpetua gets up again, without complaint.', 'mythic');
  game.log('This was the first half of it.', 'textDim');
  return true;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function openSpotNear(game, boss) {
  const offsets = game.rng.shuffle([
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
    [0, -2], [2, 0], [0, 2], [-2, 0],
  ]);
  for (const [dx, dy] of offsets) {
    const x = boss.x + dx;
    const y = boss.y + dy;
    if (!game.level.isOpen(x, y)) continue;
    // Names answer inside the room, never through the wall.
    if (game.level.bossRoom && !game.level.inArena(x, y)) continue;
    return { x, y };
  }
  return null;
}

/** Used by the panel and the lore card. */
export function bossDistanceTo(boss, player) {
  return chebyshev(boss.x, boss.y, player.x, player.y);
}
