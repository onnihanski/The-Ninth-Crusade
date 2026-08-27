export const Tiles = {
  wall: { key: 'wall', glyph: '#', walkable: false, transparent: false },
  floor: { key: 'floor', glyph: '.', walkable: true, transparent: true },
  stairsDown: { key: 'stairsDown', glyph: '>', walkable: true, transparent: true },
  // Stands where the stairs will be, on every boss floor, until a seal turns it.
  sealedGate: { key: 'sealedGate', glyph: '=', walkable: true, transparent: true },

  // The only way into a boss arena. Opaque on purpose: whatever is waiting in
  // there should not be visible from the corridor.
  door: { key: 'door', glyph: '+', walkable: true, transparent: false },
  doorLocked: { key: 'doorLocked', glyph: '+', walkable: false, transparent: false },
};
