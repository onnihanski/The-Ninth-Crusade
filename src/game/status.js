// Derived stats and timed statuses.
//
// Nothing reads `.power`, `.defense` or `.speed` off an entity directly --
// every call site goes through the accessors here. That is what lets equipment
// and statuses both modify a stat without either knowing the other exists.
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
  return equipped(entity).reduce((sum, item) => sum + (item.item.equip[field] ?? 0), 0);
}

export function effectivePower(entity) {
  return entity.power + gearBonus(entity, 'power');
}

export function effectiveDefense(entity) {
  return entity.defense + gearBonus(entity, 'defense') + statusAmount(entity, 'ward');
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
  return weapon?.item.equip.ranged ?? entity.ranged ?? null;
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
