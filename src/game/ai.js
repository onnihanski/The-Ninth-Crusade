import { chebyshev } from '../engine/grid.js';
import { stepDownhill, UNREACHABLE } from '../engine/dijkstra.js';
import { attack } from './combat.js';

// Bare-bones hostile AI, and the most rewarding file in the project to grow:
// ranged attackers, pack tactics, fleeing at low HP, monsters that open doors.
//
// The "can I see the player" test reuses the player's own FOV. That is a real
// simplification (sight is symmetric here), and worth revisiting if monsters
// ever get their own senses.
export function takeAiTurn(game, monster) {
  const level = game.level;
  const player = game.player;
  const canSeePlayer = level.visible.get(monster.x, monster.y);

  if (canSeePlayer) monster.ai.hunting = true;
  if (!monster.ai.hunting) {
    wander(game, monster);
    return;
  }

  if (chebyshev(monster.x, monster.y, player.x, player.y) <= 1) {
    attack(game, monster, player);
    return;
  }

  const dist = game.playerDistanceMap();
  if (dist[monster.y * level.width + monster.x] === UNREACHABLE) {
    monster.ai.hunting = false;
    return;
  }

  const step = stepDownhill(dist, level.width, level.height, monster.x, monster.y, game.rng);
  if (!step) return;
  const [dx, dy] = step;
  if (level.isOpen(monster.x + dx, monster.y + dy)) {
    monster.x += dx;
    monster.y += dy;
  }
}

function wander(game, monster) {
  if (!game.rng.chance(0.25)) return;
  const [dx, dy] = game.rng.pick([[0, -1], [1, 0], [0, 1], [-1, 0]]);
  if (game.level.isOpen(monster.x + dx, monster.y + dy)) {
    monster.x += dx;
    monster.y += dy;
  }
}
