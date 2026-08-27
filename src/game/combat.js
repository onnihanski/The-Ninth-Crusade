import { effectiveDefense, effectivePower } from './status.js';
import { gainXp, xpValue } from './progress.js';

// Defense mitigates a *proportion* of the blow rather than subtracting from it.
//
// Flat subtraction cannot survive two systems feeding the same stat: levelling
// and gear together reach defense 14 by the Empty Tomb, which is more than the
// deepest monster's power, and the crusader simply stops being hurt. Running
// the balance harness against the subtractive version put every late monster
// on exactly the minimum-damage floor.
//
// This curve gives diminishing returns instead: each point of defense is worth
// a lot at 0 and a little at 20, and the total never reaches immunity.
const ARMOUR_SCALE = 9;
const MIN_DAMAGE = 1;

export function mitigate(rawDamage, defense) {
  const kept = ARMOUR_SCALE / (ARMOUR_SCALE + Math.max(0, defense));
  return Math.max(MIN_DAMAGE, Math.round(rawDamage * kept));
}

export function attack(game, attacker, defender) {
  if (defender.isPlayer) game.lastAttacker = article(attacker);

  const power = effectivePower(attacker);
  const roll = game.rng.int(power - 1, power + 1);
  const dealt = mitigate(roll, effectiveDefense(defender));
  const absorbed = dealt <= MIN_DAMAGE && roll > MIN_DAMAGE;

  const subject = attacker.isPlayer ? 'You' : capitalize(article(attacker));
  const object = defender.isPlayer ? 'you' : article(defender);
  const verb = attacker.isPlayer ? 'hit' : 'hits';

  game.log(
    absorbed
      ? subject + ' ' + verb + ' ' + object + ', and it barely tells.'
      : subject + ' ' + verb + ' ' + object + ' for ' + dealt + '.',
    absorbed ? 'textDim' : attacker.isPlayer ? 'text' : 'bad',
  );
  damage(game, defender, dealt, attacker);
}

/** `source` is whoever caused this, and is who collects the experience. */
export function damage(game, target, amount, source = null) {
  target.hp -= amount;
  if (target.hp > 0) return;

  if (target.isPlayer) {
    target.alive = false;
    game.state = 'dead';
    game.log(game.theme.strings.death, 'bad');
    return;
  }

  game.log(capitalize(article(target)) + ' is finished.', 'good');
  if (source?.isPlayer) gainXp(game, source, xpValue(target));
  game.spillDrops(target);

  target.alive = false;
  target.blocks = false;
  target.speed = 0;
  target.ai = null;
  target.xp = 0;
  target.glyph = '%';
  target.color = 'corpse';
  target.name = 'the remains of ' + bareName(target);

  if (target.boss) game.onBossDefeated(target);
}

/** Proper nouns (bosses, revenants) do not take an article. */
function article(entity) {
  return entity.properName || /^(the|What|Saint)\b/.test(entity.name)
    ? entity.name
    : 'the ' + entity.name;
}

function bareName(entity) {
  return entity.name.replace(/^the /, '');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
