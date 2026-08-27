import { attack } from './combat.js';
import { applyEffect } from './effects.js';
import { Tiles } from '../world/tiles.js';
import { effectiveSpeed } from './status.js';

export const MAX_PACK = 9;

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

  const item = items[0];

  // Seals and the Relic never occupy pack space. They are the way forward, and
  // a full pack must never be able to strand a crusader on a sealed floor with
  // the seal lying at their feet.
  if (item.item.victory) {
    game.level.remove(item);
    game.log('Taken: ' + item.name + '.', 'notable');
    if (item.item.flavour) game.log(item.item.flavour, 'textDim');
    game.claimVictory();
    return true;
  }

  if (item.item.seal) {
    game.level.remove(item);
    actor.seals.push(item);
    game.log('Taken: ' + item.name + '.', 'notable');
    if (item.item.flavour) game.log(item.item.flavour, 'textDim');
    game.tryUnseal(item);
    return true;
  }

  if (actor.inventory.length >= MAX_PACK) {
    game.log('Your pack is full. The crusade did not budget for this. [x] to drop.', 'textDim');
    return false;
  }

  game.level.remove(item);
  actor.inventory.push(item);
  game.log('Taken: ' + item.name + '.', 'notable');
  if (item.item.flavour) game.log(item.item.flavour, 'textDim');
  return true;
}

/** Put something down. The pack is small, so this is a real decision. */
export function dropItem(game, actor, index) {
  const item = actor.inventory[index];
  if (!item) {
    game.log('Nothing in that slot.', 'textDim');
    return false;
  }
  actor.inventory.splice(index, 1);
  item.x = actor.x;
  item.y = actor.y;
  game.level.add(item);
  game.log('You set down the ' + item.name + '.', 'textDim');
  return true;
}

const EQUIP_VERB = {
  weapon: 'You take up',
  shield: 'You strap on',
  armour: 'You put on',
};

export function useItem(game, actor, index) {
  const item = actor.inventory[index];
  if (!item) {
    game.log('Nothing in that slot.', 'textDim');
    return false;
  }
  if (item.item.equip) return equipItem(game, actor, index);
  if (!item.item.use) {
    game.log('The ' + item.name + ' is for carrying, not for using.', 'textDim');
    return false;
  }

  const spent = applyEffect(game, actor, item.item.use);
  if (spent) actor.inventory.splice(index, 1);
  return spent;
}

/**
 * Wear or wield the item in that slot, stowing whatever it displaces. Gear is
 * never destroyed by swapping -- the old piece goes straight back in the pack.
 */
export function equipItem(game, actor, index) {
  const item = actor.inventory[index];
  const slot = item.item.equip.slot;
  const displaced = actor.equipment[slot];
  const speedBefore = effectiveSpeed(actor);

  actor.inventory.splice(index, 1);
  actor.equipment[slot] = item;
  if (displaced) actor.inventory.push(displaced);

  game.log(
    EQUIP_VERB[slot] + ' the ' + item.name
      + (displaced ? ', and stow the ' + displaced.name + '.' : '.'),
    'notable',
  );

  // Weight is the trade, so say so plainly rather than hiding it in a stat.
  const delta = effectiveSpeed(actor) - speedBefore;
  if (delta < 0) game.log('You are slower under it.', 'textDim');
  else if (delta > 0) game.log('You move more freely without the weight.', 'textDim');

  return true;
}

export function unequip(game, actor, slot) {
  const item = actor.equipment[slot];
  if (!item) return false;
  if (actor.inventory.length >= MAX_PACK) {
    game.log('No room in the pack for it.', 'textDim');
    return false;
  }
  actor.equipment[slot] = null;
  actor.inventory.push(item);
  game.log('You set aside the ' + item.name + '.', 'textDim');
  return true;
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
