export const Tiles = {
  // `glyph` is still the identity of a tile -- the dev menu, the tests and any
  // future tileset all key off it. `drawGlyph` only says whether the renderer
  // letters it: walls and floors are drawn as filled ground instead.
  wall: { key: 'wall', glyph: '#', walkable: false, transparent: false },
  floor: { key: 'floor', glyph: '.', walkable: true, transparent: true },
  stairsDown: {
    key: 'stairsDown', glyph: '>', walkable: true, transparent: true, drawGlyph: true,
  },
  // Stands where the stairs will be, on every boss floor, until a seal turns it.
  sealedGate: {
    key: 'sealedGate', glyph: '=', walkable: true, transparent: true, drawGlyph: true,
  },

  // The only way into a boss arena. Opaque on purpose: whatever is waiting in
  // there should not be visible from the corridor.
  door: {
    key: 'door', glyph: '+', walkable: true, transparent: false, drawGlyph: true,
  },
  doorLocked: {
    key: 'doorLocked', glyph: '+', walkable: false, transparent: false, drawGlyph: true,
  },
};
