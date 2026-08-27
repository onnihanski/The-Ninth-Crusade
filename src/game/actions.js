import { meleeStrike, attack } from './combat.js';
import { applyEffect } from './effects.js';
import { Tiles } from '../world/tiles.js';
import { effectiveSpeed, rangedProfile, canFire, hasTrait } from './status.js';
import { shoot } from './combat.js';
import { chebyshev, line } from '../engine/grid.js';

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
    meleeStrike(game, actor, blocker);
    return true;
  }

  // Reach: strike over the empty tile in front of you. You hit first, and you
  // keep hitting while giving ground -- which is what makes it worth the slot.
  if (hasTrait(actor, 'reach') && level.isWalkable(nx, ny)) {
    const far = level.blockerAt(actor.x + dx * 2, actor.y + dy * 2);
    if (far && far !== actor && far.alive) {
      meleeStrike(game, actor, far);
      return true;
    }
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

/**
 * Shoot the nearest thing you can see inside your weapon's range. Auto-target
 * rather than a cursor: with one shot every few turns, choosing the target is
 * rarely the interesting decision -- choosing when to give ground is.
 */
export function fire(game, actor) {
  const profile = rangedProfile(actor);
  if (!profile) {
    game.log('You have nothing that shoots.', 'textDim');
    return false;
  }
  if (!canFire(actor)) {
    game.log('Still reloading.', 'textDim');
    return false;
  }

  if (hasTrait(actor, 'pierce')) return firePiercing(game, actor, profile);

  const target = nearestTargetInRange(game, actor, profile.range);
  if (!target) {
    game.log('Nothing in range.', 'textDim');
    return false;
  }

  shoot(game, actor, target, profile);
  return true;
}

/**
 * A piercing bolt runs on through everything in its line, so it aims at
 * whichever visible target puts the most bodies on one line rather than simply
 * the nearest. Lining them up in a corridor is the reward.
 */
function firePiercing(game, actor, profile) {
  const level = game.level;
  const candidates = visibleTargets(game, actor, profile.range);
  if (!candidates.length) {
    game.log('Nothing in range.', 'textDim');
    return false;
  }

  let best = null;
  for (const candidate of candidates) {
    const path = line(actor.x, actor.y, candidate.x, candidate.y);
    const struck = [];
    for (const [x, y] of path) {
      if (level.isOpaque(x, y)) break;          // the bolt is stopped by stone
      const foe = level.blockerAt(x, y);
      if (foe && foe.ai && foe.alive) struck.push(foe);
    }
    if (!struck.length) continue;
    if (!best || struck.length > best.length) best = struck;
  }

  if (!best) {
    game.log('Nothing in range.', 'textDim');
    return false;
  }

  if (best.length > 1) {
    game.log('The bolt goes through ' + best.length + ' of them.', 'notable');
  }
  // One shot, one reload, however many it passes through.
  for (const foe of best) {
    if (foe.alive) attack(game, actor, foe, { power: profile.power, verb: 'shoot' });
  }
  startReloadFor(actor, profile);
  return true;
}

function startReloadFor(actor, profile) {
  actor.reloadLeft = profile.reload;
}

function visibleTargets(game, actor, range) {
  return game.level.entities.filter((entity) =>
    entity.ai && entity.alive
    && game.level.visible.get(entity.x, entity.y)
    && chebyshev(actor.x, actor.y, entity.x, entity.y) <= range);
}

function nearestTargetInRange(game, actor, range) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of game.level.entities) {
    if (!entity.ai || !entity.alive) continue;
    if (!game.level.visible.get(entity.x, entity.y)) continue;
    const distance = chebyshev(actor.x, actor.y, entity.x, entity.y);
    if (distance <= range && distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

export function pickUp(game, actor) {
  const items = game.level.itemsAt(actor.x, actor.y);
  if (!items.length) {
    game.log('Nothing here worth carrying.', 'textDim');
    return false;
  }

  // Take what matters first. A boss drops its seal onto the same tile as the
  // rest of its kit, and a seal buried under a crossbow is a progression item
  // the player has to know to dig for.
  const item = items.find((e) => e.item.victory)
    ?? items.find((e) => e.item.seal)
    ?? items[0];

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

  const spent = applyEffect(game, actor, item);
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
