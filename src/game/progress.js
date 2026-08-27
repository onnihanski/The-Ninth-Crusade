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

/**
 * Slow regeneration, the traditional kind. Without it the only sustain is
 * phials, every scratch is permanent, and a floor of weak monsters kills by
 * accumulation rather than by any single mistake. It also gives retreating a
 * point, which is most of what makes a roguelike tactical.
 */
export function tickRegeneration(actor) {
  if (actor.hp >= actor.maxHp) {
    actor.regenTimer = 0;
    return;
  }
  actor.regenTimer = (actor.regenTimer ?? 0) + 1;
  if (actor.regenTimer < REGEN_TURNS) return;
  actor.regenTimer = 0;
  actor.hp++;
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
