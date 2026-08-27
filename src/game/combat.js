import { effectiveDefense } from './status.js';

// Deliberately simple: power vs defense with a small random spread. The first
// thing worth deepening once the content settles -- to-hit rolls, damage types,
// resistances all slot in here without touching anything else.
export function attack(game, attacker, defender) {
  if (defender.isPlayer) game.lastAttacker = article(attacker);
  const roll = game.rng.int(attacker.power - 1, attacker.power + 1);
  const dealt = Math.max(0, roll - effectiveDefense(defender));
  const subject = attacker.isPlayer ? 'You' : capitalize(article(attacker));
  const object = defender.isPlayer ? 'you' : article(defender);
  const verb = attacker.isPlayer ? 'hit' : 'hits';

  if (dealt <= 0) {
    game.log(subject + ' ' + verb + ' ' + object + ', to no effect.', 'textDim');
    return;
  }

  game.log(
    subject + ' ' + verb + ' ' + object + ' for ' + dealt + '.',
    attacker.isPlayer ? 'text' : 'bad',
  );
  damage(game, defender, dealt);
}

export function damage(game, target, amount) {
  target.hp -= amount;
  if (target.hp > 0) return;

  if (target.isPlayer) {
    target.alive = false;
    game.state = 'dead';
    game.log(game.theme.strings.death, 'bad');
    return;
  }

  game.log(capitalize(article(target)) + ' is finished.', 'good');
  game.spillDrops(target);

  target.alive = false;
  target.blocks = false;
  target.speed = 0;
  target.ai = null;
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
