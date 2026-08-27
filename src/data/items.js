// Data-driven item table. `use` is a tagged effect resolved in game/effects.js.
export const ITEMS = {
  healingPotion: {
    name: 'healing potion', glyph: '!', color: 'item',
    weight: 12, minDepth: 1, use: { kind: 'heal', amount: 8 },
  },
  scrollOfSparks: {
    name: 'scroll of sparks', glyph: '?', color: 'item',
    weight: 7, minDepth: 2, use: { kind: 'damageNearest', amount: 8, range: 6 },
  },
};

export function itemTable(depth) {
  return Object.entries(ITEMS)
    .filter(([, i]) => depth >= i.minDepth)
    .map(([key, i]) => ({ key, ...i }));
}
