import { chebyshev } from '../engine/grid.js';
import {
  effectiveDefense, effectivePower, startReload,
  hasTrait, itemWithTrait, canBlock, spendBlock,
} from './status.js';
import { gainXp, xpValue } from './progress.js';
import { CLINCH_PENALTY, RIPOSTE_SHARE } from '../data/traits.js';
import { bossRises } from './bosses.js';

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

/**
 * `options.power` overrides the attacker's melee power (a shot uses the
 * weapon's ranged figure, not the arm behind it) and `options.verb` names what
 * happened. Everything else -- mitigation, death, drops, experience -- is
 * shared, so a shot can never drift out of step with a swing.
 */
export function attack(game, attacker, defender, options = {}) {
  if (defender.isPlayer) game.lastAttacker = article(attacker);

  const power = options.power ?? effectivePower(attacker);
  const roll = game.rng.int(power - 1, power + 1);
  const dealt = mitigate(roll, effectiveDefense(defender));
  const absorbed = dealt <= MIN_DAMAGE && roll > MIN_DAMAGE;

  const subject = attacker.isPlayer ? 'You' : capitalize(article(attacker));
  const object = defender.isPlayer ? 'you' : article(defender);
  const stem = options.verb ?? 'hit';
  const verb = attacker.isPlayer ? stem : stem + 's';

  // A shield with Block stops the blow outright, then has to come back up.
  if (!options.noBlock && canBlock(defender)) {
    spendBlock(defender);
    const shield = itemWithTrait(defender, 'block');
    game.log(
      capitalize(article(attacker)) + ' ' + (attacker.isPlayer ? stem : stem + 's')
        + ' ' + object + '. The ' + shield.name + ' takes all of it.',
      defender.isPlayer ? 'good' : 'textDim',
    );
    return;
  }

  game.log(
    absorbed
      ? subject + ' ' + verb + ' ' + object + ', and it barely tells.'
      : subject + ' ' + verb + ' ' + object + ' for ' + dealt + '.',
    absorbed ? 'textDim' : attacker.isPlayer ? 'text' : 'bad',
  );
  damage(game, defender, dealt, attacker);

  // Riposte: armour that turns a blow aside completely answers for free. Never
  // recursive -- a riposte cannot provoke a riposte.
  if (absorbed && !options.noRiposte && defender.alive
    && hasTrait(defender, 'riposte')
    && chebyshev(defender.x, defender.y, attacker.x, attacker.y) <= 1) {
    attack(game, defender, attacker, {
      power: Math.max(1, Math.round(effectivePower(defender) * RIPOSTE_SHARE)),
      verb: 'answer', noRiposte: true, noBlock: true,
    });
  }
}

/** Everything hostile to `actor` standing next to it. */
function adjacentFoes(game, actor) {
  const foes = actor.isPlayer
    ? game.level.entities.filter((e) => e.ai && e.alive)
    : [game.player];
  return foes.filter((e) => chebyshev(actor.x, actor.y, e.x, e.y) <= 1);
}

/**
 * A melee swing, which for a cleaving weapon is several. Routed through here
 * rather than calling attack() directly so a trait can change what one blow
 * means without every caller knowing about it.
 */
export function meleeStrike(game, attacker, target) {
  // A polearm is at its worst with something already inside its arc.
  const clinched = hasTrait(attacker, 'reach')
    && chebyshev(attacker.x, attacker.y, target.x, target.y) <= 1;
  const options = clinched
    ? { power: Math.max(1, effectivePower(attacker) - CLINCH_PENALTY) }
    : {};

  if (!hasTrait(attacker, 'cleave')) {
    attack(game, attacker, target, options);
    return;
  }

  // Snapshot: a swing can kill, and killing mutates the entity list.
  const targets = [target, ...adjacentFoes(game, attacker).filter((e) => e !== target)];
  if (targets.length > 1) {
    game.log('You sweep through ' + targets.length + ' of them.', 'notable');
  }
  for (const foe of targets) {
    if (foe.alive) attack(game, attacker, foe, options);
  }
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

  // Some things decline to be finished the first time.
  if (target.boss && bossRises(game, target)) return;

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

/** Loose a shot at something you can see. The caller has checked the range. */
export function shoot(game, attacker, defender, profile) {
  attack(game, attacker, defender, { power: profile.power, verb: 'shoot' });
  startReload(attacker, profile);
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
