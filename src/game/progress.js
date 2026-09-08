// Experience and levels.
//
// The curve is deliberately shallow and legible: each level costs a little more
// than the last, and a thorough crusader who fights what they meet should be
// arriving at the Empty Tomb around level 9 or 10. `tools/balance.mjs` is what
// keeps that claim honest -- re-run it after touching any number in here.
const XP_BASE = 30;
const XP_STEP = 25;

const HP_PER_LEVEL = 4;
const REGEN_TURNS = 20;
const POWER_EVERY = 2;    // levels
const DEFENSE_EVERY = 3;  // levels

// Getting there is worth something on its own.
//
// Kills were the only source of experience, which made "descend quickly" not a
// strategy but a way to lose: the balance harness ran 300 hurried crusaders and
// none of them won, with a median ending of depth 3 at level 1. A diver arrived
// at the first boss having earned nothing, because the only thing that pays is
// the fighting they skipped.
//
// Arriving on a floor now pays, and pays more the deeper the floor. It is well
// under what clearing that floor is worth, so thoroughness is still the richer
// line -- but speed becomes a trade with something on both sides of it rather
// than a slower death.
// First tried at 10 + 8*depth, which is 726 experience over a full descent and
// far too much: the thorough policy's win rate went from 21% to 39.5% and its
// median level from 9 to 18, while the hurried one still won nothing. The
// reward compounds -- levels buy survival, survival buys kills, kills buy
// levels -- so it has to be small enough that clearing stays the richer line.
const DESCENT_XP_BASE = 4;
const DESCENT_XP_STEP = 3;

/**
 * Slow regeneration, the traditional kind. Without it the only sustain is
 * phials, every scratch is permanent, and a floor of weak monsters kills by
 * accumulation rather than by any single mistake. It also gives retreating a
 * point, which is most of what makes a roguelike tactical.
 */
/** Merged phials shorten the wait between one point of healing and the next. */
export function regenInterval(actor) {
  const quickened = actor.merges
    ? actor.merges.reduce((sum, m) => sum + (m.boon.stat === 'regen' ? m.boon.amount : 0), 0)
    : 0;
  return Math.max(6, REGEN_TURNS - quickened);
}

export function tickRegeneration(actor) {
  if (actor.hp >= actor.maxHp) {
    actor.regenTimer = 0;
    return;
  }
  actor.regenTimer = (actor.regenTimer ?? 0) + 1;
  if (actor.regenTimer < regenInterval(actor)) return;
  actor.regenTimer = 0;
  actor.hp++;
}

/** What arriving on a floor is worth. Nothing for depth 1: you begin there. */
export function descentXp(depth) {
  return depth <= 1 ? 0 : DESCENT_XP_BASE + DESCENT_XP_STEP * depth;
}

/** XP needed to go from `level` to the next one. */
export function xpToNext(level) {
  return XP_BASE + XP_STEP * level;
}

/** What a monster is worth. Revenants are priced by the crusader they were. */
export function xpValue(entity) {
  return entity.xp ?? 0;
}

export function gainXp(game, actor, amount) {
  if (!actor.isPlayer || amount <= 0) return;
  actor.xp += amount;

  while (actor.xp >= xpToNext(actor.level)) {
    actor.xp -= xpToNext(actor.level);
    levelUp(game, actor);
  }
}

function levelUp(game, actor) {
  actor.level++;

  // HP every level; the other two on a slower cadence, so gear stays the
  // dominant source of power and levels stay a steady floor under it.
  actor.maxHp += HP_PER_LEVEL;
  actor.hp += HP_PER_LEVEL;

  const gains = ['+' + HP_PER_LEVEL + ' max hp'];
  if (actor.level % POWER_EVERY === 0) {
    actor.power++;
    gains.push('+1 power');
  }
  if (actor.level % DEFENSE_EVERY === 0) {
    actor.defense++;
    gains.push('+1 defense');
  }

  const lines = game.theme.strings.levelUp;
  game.log(lines[Math.min(actor.level - 2, lines.length - 1)] ?? lines[lines.length - 1], 'mythic');
  game.log('Level ' + actor.level + '. ' + gains.join(', ') + '.', 'notable');
}
