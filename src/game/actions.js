import { attack } from './combat.js';
import { applyEffect } from './effects.js';
import { Tiles } from '../world/tiles.js';

// Every action returns true if it consumed the actor's turn. Actions that fail
// for a reason the player could have known (walking into a wall) return false,
// so a misclick never costs a turn -- monsters do not get a free hit from it.

export function moveOrAttack(game, actor, dx, dy) {
  const nx = actor.x + dx;
  const ny = actor.y + dy;
  const level = game.level;

  const blocker = level.blockerAt(nx, ny);
  if (blocker && blocker !== actor) {
    attack(game, actor, blocker);
    return true;
  }

  if (!level.isWalkable(nx, ny)) {
    if (actor.isPlayer) game.log('Blocked.', 'textDim');
    return false;
  }

  actor.x = nx;
  actor.y = ny;

  if (actor.isPlayer) {
    const items = level.itemsAt(nx, ny);
    if (items.length) {
      game.log('At your feet: ' + items.map((i) => i.name).join(', ') + '. [g] to take.', 'textDim');
    }
  }
  return true;
}

export function wait() {
  return true;
}

export function pickUp(game, actor) {
  const items = game.level.itemsAt(actor.x, actor.y);
  if (!items.length) {
    game.log('Nothing here worth carrying.', 'textDim');
    return false;
  }
  if (actor.inventory.length >= 9) {
    game.log('Your pack is full. The crusade did not budget for this.', 'textDim');
    return false;
  }

  const item = items[0];
  game.level.remove(item);
  actor.inventory.push(item);
  game.log('Taken: ' + item.name + '.', 'notable');
  if (item.item.flavour) game.log(item.item.flavour, 'textDim');

  // Two things happen on pickup rather than on use: seals open gates, and the
  // Relic ends the crusade.
  if (item.item.victory) game.claimVictory();
  else game.tryUnseal(item);

  return true;
}

export function useItem(game, actor, index) {
  const item = actor.inventory[index];
  if (!item) {
    game.log('Nothing in that slot.', 'textDim');
    return false;
  }
  if (!item.item.use) {
    game.log('The ' + item.name + ' is for carrying, not for using.', 'textDim');
    return false;
  }

  const spent = applyEffect(game, actor, item.item.use);
  if (spent) actor.inventory.splice(index, 1);
  return spent;
}

export function descend(game) {
  const level = game.level;
  const tile = level.tiles.get(game.player.x, game.player.y);

  if (tile === Tiles.sealedGate) {
    const bossName = game.bossSpec?.name ?? 'something below';
    game.log(game.theme.strings.sealed(bossName), 'bad');
    return false;
  }

  if (tile !== Tiles.stairsDown) {
    game.log(game.theme.strings.noStairs, 'textDim');
    return false;
  }

  game.nextLevel();
  return true;
}
