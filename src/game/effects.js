import { chebyshev } from '../engine/grid.js';
import { damage } from './combat.js';

// Item effects are tagged unions resolved here, so items.js stays pure data.
// Returns true if the item was consumed.
export function applyEffect(game, user, effect) {
  switch (effect.kind) {
    case 'heal': {
      if (user.hp >= user.maxHp) {
        game.log('You are already at full health.', 'textDim');
        return false;
      }
      const healed = Math.min(effect.amount, user.maxHp - user.hp);
      user.hp += healed;
      game.log('You recover ' + healed + ' hit points.', 'good');
      return true;
    }

    case 'damageNearest': {
      const target = nearestVisibleMonster(game, user, effect.range);
      if (!target) {
        game.log('Nothing within range. The scroll crumbles anyway.', 'textDim');
        return true;
      }
      game.log('Sparks arc into the ' + target.name + '!', 'notable');
      damage(game, target, effect.amount);
      return true;
    }

    default:
      game.log('Nothing happens.', 'textDim');
      return false;
  }
}

function nearestVisibleMonster(game, from, range) {
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
