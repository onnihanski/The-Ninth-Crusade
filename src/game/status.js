// Timed statuses. Deliberately tiny: a list of {kind, turns, amount} that ticks
// down once per turn of the actor carrying it. Everything that reads a stat
// goes through the accessors here rather than reading `.defense` directly, so
// new statuses never require hunting down call sites.
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

export function effectiveDefense(entity) {
  return entity.defense + statusAmount(entity, 'ward');
}
