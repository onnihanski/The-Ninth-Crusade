import { chebyshev } from '../engine/grid.js';
import { stepDownhill, stepAway, UNREACHABLE } from '../engine/dijkstra.js';
import { attack, shoot } from './combat.js';
import { rangedProfile, canFire, tickReload } from './status.js';
import { takeBossTurn } from './bosses.js';

// Monster behaviour. Two shapes so far: things that close, and things that
// keep their distance and shoot. The "can I see the player" test reuses the
// player's own FOV -- sight is symmetric in this game, which is a real
// simplification and worth revisiting if monsters ever get their own senses.
export function takeAiTurn(game, monster) {
  tickReload(monster);

  const level = game.level;
  const player = game.player;
  const canSeePlayer = level.visible.get(monster.x, monster.y);

  if (canSeePlayer) monster.ai.hunting = true;
  if (!monster.ai.hunting) {
    wander(game, monster);
    return;
  }

  // A boss's special comes before anything ordinary it might have done.
  if (monster.boss && takeBossTurn(game, monster)) return;

  const profile = rangedProfile(monster);
  if (profile) {
    takeShooterTurn(game, monster, profile, canSeePlayer);
    return;
  }

  const distance = chebyshev(monster.x, monster.y, player.x, player.y);
  if (distance <= 1) {
    attack(game, monster, player);
    return;
  }
  approach(game, monster);
}

// How often a cornered shooter chooses to skip back rather than swing. Not
// every turn: an archer that always retreats is uncatchable at equal speed,
// because you spend your turn closing and it spends its turn undoing that.
const SKIP_BACK_CHANCE = 0.5;

/**
 * Archers want one specific distance: inside their range, outside your reach.
 * They shoot when loaded, stand and crank when they are not, and fight badly
 * with whatever they are holding once you arrive.
 *
 * Standing still to reload is the whole reason they are beatable. The first
 * version gave ground on every reload turn, which at equal speed made the
 * distance between you mathematically constant -- the balance harness went
 * from a 34% win rate to zero. Reloading in place is what buys the player
 * their approach, and turns a shooter into a problem with an answer.
 */
function takeShooterTurn(game, monster, profile, canSeePlayer) {
  const player = game.player;
  const distance = chebyshev(monster.x, monster.y, player.x, player.y);

  // An archer holds its ground; a boss does not. Odo's voice has no range, so
  // `distance <= profile.range` is true from anywhere in the arena and he never
  // reached the approach below -- he stood on his spot for the whole fight and
  // backed away when reached. The balance harness read the result plainly: the
  // floors leading to him killed 17.6% and 23.0% of the crusaders who arrived,
  // and Odo himself killed 5.3%. He was the safest room in his own region.
  //
  // A boss now closes while it reloads and never gives ground. The rule stays
  // exactly as it was for everything else, because holding still to crank is
  // what makes an ordinary shooter beatable at all.
  const holdsGround = !monster.boss;

  if (distance <= 1) {
    if (holdsGround && game.rng.chance(SKIP_BACK_CHANCE) && retreat(game, monster)) return;
    attack(game, monster, player);
    return;
  }

  if (canSeePlayer && distance <= profile.range) {
    if (canFire(monster)) {
      shoot(game, monster, player, profile);
      return;
    }
    if (holdsGround) return;                   // an archer cranks where it stands
    approach(game, monster);                   // he sings, and he walks
    return;
  }

  approach(game, monster);
}

function approach(game, monster) {
  const level = game.level;
  const dist = game.playerDistanceMap();
  if (dist[monster.y * level.width + monster.x] === UNREACHABLE) {
    monster.ai.hunting = false;
    return;
  }

  const step = stepDownhill(dist, level.width, level.height, monster.x, monster.y, game.rng);
  if (!step) return;
  moveIfOpen(game, monster, step);
}

function retreat(game, monster) {
  const level = game.level;
  const dist = game.playerDistanceMap();
  const step = stepAway(
    dist, level.width, level.height, monster.x, monster.y,
    (x, y) => level.isOpen(x, y), game.rng,
  );
  if (!step) return false;
  return moveIfOpen(game, monster, step);
}

function moveIfOpen(game, monster, [dx, dy]) {
  const x = monster.x + dx;
  const y = monster.y + dy;
  if (!game.level.isOpen(x, y)) return false;
  // A boss belongs to its room and does not follow you out of it.
  if (monster.boss && game.level.bossRoom && !game.level.inArena(x, y)) return false;
  monster.x = x;
  monster.y = y;
  return true;
}

function wander(game, monster) {
  if (!game.rng.chance(0.25)) return;
  const step = game.rng.pick([[0, -1], [1, 0], [0, 1], [-1, 0]]);
  moveIfOpen(game, monster, step);
}
