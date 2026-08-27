// Derived stats and timed statuses.
//
// Nothing reads `.power`, `.defense` or `.speed` off an entity directly --
// every call site goes through the accessors here. That is what lets equipment
// and statuses both modify a stat without either knowing the other exists.
import { heirloomBonus, BLOCK_RECOVERY, SANCTUARY_EVERY, SANCTUARY_MAX } from '../data/traits.js';

const MIN_SPEED = 25;

export function addStatus(game, entity, status) {
  entity.statuses ??= [];
  const existing = entity.statuses.find((s) => s.kind === status.kind);
  if (existing) {
    // Refresh rather than stack -- stacking wards is a balance hole.
    existing.turns = Math.max(existing.turns, status.turns);
    existing.amount = Math.max(existing.amount, status.amount);
    return;
  }
  entity.statuses.push({ ...status });
}

export function tickStatuses(game, entity) {
  if (!entity.statuses?.length) return;
  for (const status of entity.statuses) status.turns--;

  const expired = entity.statuses.filter((s) => s.turns <= 0);
  entity.statuses = entity.statuses.filter((s) => s.turns > 0);

  if (entity.isPlayer) {
    for (const status of expired) {
      if (status.kind === 'ward') game.log('The psalm runs out of breath.', 'textDim');
    }
  }
}

export function statusAmount(entity, kind) {
  return entity.statuses?.find((s) => s.kind === kind)?.amount ?? 0;
}

/** Everything currently worn or held, in no particular order. */
export function equipped(entity) {
  return Object.values(entity.equipment ?? {}).filter(Boolean);
}

function gearBonus(entity, field) {
  return equipped(entity).reduce(
    (sum, item) => sum + (item.item.equip[field] ?? 0) + heirloomFor(item, field),
    0,
  );
}

/**
 * A piece taken off your own revenant carries a bonus to whatever it is for:
 * power on a weapon, defense on anything worn.
 */
function heirloomFor(item, field) {
  const bonus = heirloomBonus(item.item.heirloom);
  if (!bonus) return 0;
  const slot = item.item.equip.slot;
  if (field === 'power' && slot === 'weapon') return bonus;
  if (field === 'defense' && slot !== 'weapon') return bonus;
  return 0;
}

// -- Traits ------------------------------------------------------------------

export function traitsOf(entity) {
  return equipped(entity).map((item) => item.item.trait).filter(Boolean);
}

export function hasTrait(entity, name) {
  return traitsOf(entity).includes(name);
}

export function itemWithTrait(entity, name) {
  return equipped(entity).find((item) => item.item.trait === name) ?? null;
}

/**
 * Sanctuary hardens while you hold your ground and forgets the moment you
 * move, which makes it a stance rather than a stat.
 */
export function sanctuaryBonus(entity) {
  if (!hasTrait(entity, 'sanctuary')) return 0;
  return Math.min(SANCTUARY_MAX, Math.floor((entity.stillTurns ?? 0) / SANCTUARY_EVERY));
}

// -- Block -------------------------------------------------------------------

export function canBlock(entity) {
  return hasTrait(entity, 'block') && !(entity.blockCooldown > 0);
}

export function spendBlock(entity) {
  entity.blockCooldown = BLOCK_RECOVERY;
}

export function tickBlock(entity) {
  if (entity.blockCooldown > 0) entity.blockCooldown--;
}

export function effectivePower(entity) {
  return entity.power + gearBonus(entity, 'power');
}

export function effectiveDefense(entity) {
  return entity.defense + gearBonus(entity, 'defense')
    + statusAmount(entity, 'ward') + sanctuaryBonus(entity);
}

/**
 * Heavy gear costs turns, which is the whole trade. Floored well above zero:
 * an actor that never banks energy would spin the scheduler forever waiting
 * for a turn that cannot arrive.
 */
export function effectiveSpeed(entity) {
  return Math.max(MIN_SPEED, entity.speed + gearBonus(entity, 'speed'));
}

/**
 * How this actor shoots, if it does. The player's comes from the weapon in
 * their hand; a monster carries its own, because a bone slinger is not holding
 * a sling so much as being one.
 */
export function rangedProfile(entity) {
  const weapon = entity.equipment?.weapon;
  const ranged = weapon?.item.equip.ranged;
  if (!ranged) return entity.ranged ?? null;

  const bonus = heirloomBonus(weapon.item.heirloom);
  return bonus ? { ...ranged, power: ranged.power + bonus } : ranged;
}

export function canFire(entity) {
  return !entity.reloadLeft;
}

/**
 * Reload is counted in the actor's own turns, not the player's, so a fast
 * archer really does shoot more often than a slow one. `reload: 2` means two
 * turns spent not firing, no more -- the shot's own turn does not count.
 */
export function startReload(entity, profile) {
  entity.reloadLeft = profile.reload;
}

export function tickReload(entity) {
  if (entity.reloadLeft > 0) entity.reloadLeft--;
}
