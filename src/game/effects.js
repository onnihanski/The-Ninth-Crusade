import { chebyshev } from '../engine/grid.js';
import { damage } from './combat.js';
import { addStatus } from './status.js';

// Relic effects are tagged unions resolved here, so items.js stays pure data.
// Returns true if the relic was spent.
export function applyEffect(game, user, item) {
  const effect = item.item.use;
  const amount = attunedAmount(item);

  switch (effect.kind) {
    case 'heal': {
      if (user.hp >= user.maxHp) {
        game.log('You are as whole as you are going to get.', 'textDim');
        return false;
      }
      const healed = Math.min(amount, user.maxHp - user.hp);
      user.hp += healed;
      game.log('Something knits. ' + healed + ' hit points.', 'good');
      return true;
    }

    case 'smite': {
      const struck = smiteNearest(game, user, amount, effect.range,
        'One held note breaks over');
      if (!struck) game.log('The note goes out unanswered.', 'textDim');
      // Echo: the choir does not stop when you do.
      if (effect.echo) {
        game.scheduleEcho({ amount: Math.round(amount * 0.6), range: effect.range, turns: effect.echo });
        game.log('Something in the dark takes up the note.', 'mythic');
      }
      return true;
    }

    case 'ward': {
      addStatus(game, user, { kind: 'ward', amount, turns: effect.turns });
      game.log('You are, for the moment, harder to reach.', 'good');
      return true;
    }

    case 'blink': {
      const spot = game.randomOpenTile();
      if (!spot) {
        game.log('Nowhere to be instead.', 'textDim');
        return false;
      }
      user.x = spot.x;
      user.y = spot.y;
      game.log('The floor forgets you were standing on it.', 'mythic');
      return true;
    }

    default:
      game.log('Nothing happens, at length.', 'textDim');
      return false;
  }
}

/**
 * Attunement: a relic carried and left alone grows into itself. It makes the
 * nine-slot pack a real decision -- what you keep, and for how long, rather
 * than what you drink the moment you find it.
 */
export function attunedAmount(item) {
  const effect = item.item.use;
  if (!effect?.attune) return effect?.amount ?? 0;
  const carried = item.item.carried ?? 0;
  const grown = Math.min(effect.attune.max, Math.floor(carried / effect.attune.per));
  return effect.amount + grown;
}

/** Strike the nearest thing the user can see. Returns the victim, or null. */
export function smiteNearest(game, user, amount, range, verb) {
  const target = nearestVisible(game, user, range);
  if (!target) return null;
  game.log(verb + ' the ' + target.name + '.', 'mythic');
  damage(game, target, amount, user);
  return target;
}

function nearestVisible(game, from, range) {
  let best = null;
  let bestDist = Infinity;
  for (const e of game.level.entities) {
    if (!e.ai || !e.alive) continue;
    if (!game.level.visible.get(e.x, e.y)) continue;
    const dist = chebyshev(from.x, from.y, e.x, e.y);
    if (dist <= range && dist < bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  return best;
}
