import { chebyshev } from '../engine/grid.js';
import { damage } from './combat.js';
import { addStatus } from './status.js';

// Relic effects are tagged unions resolved here, so items.js stays pure data.
// Returns true if the relic was spent.
export function applyEffect(game, user, effect) {
  switch (effect.kind) {
    case 'heal': {
      if (user.hp >= user.maxHp) {
        game.log('You are as whole as you are going to get.', 'textDim');
        return false;
      }
      const healed = Math.min(effect.amount, user.maxHp - user.hp);
      user.hp += healed;
      game.log('Something knits. ' + healed + ' hit points.', 'good');
      return true;
    }

    case 'smite': {
      const target = nearestVisible(game, user, effect.range);
      if (!target) {
        game.log('The note goes out unanswered.', 'textDim');
        return true;
      }
      game.log('One held note breaks over the ' + target.name + '.', 'mythic');
      damage(game, target, effect.amount, user);
      return true;
    }

    case 'ward': {
      addStatus(game, user, { kind: 'ward', amount: effect.amount, turns: effect.turns });
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
