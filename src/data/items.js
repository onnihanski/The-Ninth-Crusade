// Relics are the game's magic: no spellbook, no mana, just consumable objects
// with one clear verb each. `use` is a tagged effect resolved in game/effects.js.
export const ITEMS = {
  reliquaryPhial: {
    name: 'reliquary phial', glyph: '!', color: 'item',
    weight: 12, minDepth: 1, use: { kind: 'heal', amount: 10 },
    flavour: 'Contents: mostly saint.',
  },
  sparkOfTheChoir: {
    name: 'spark of the choir', glyph: '?', color: 'item',
    weight: 8, minDepth: 2, use: { kind: 'smite', amount: 12, range: 6 },
    flavour: 'One held note, released.',
  },
  psalmOfWard: {
    name: 'psalm of ward', glyph: '?', color: 'item',
    weight: 7, minDepth: 3, use: { kind: 'ward', amount: 3, turns: 12 },
    flavour: 'Sung badly, it still works.',
  },
  stepOfTheAbsent: {
    name: 'step of the absent', glyph: '?', color: 'item',
    weight: 6, minDepth: 4, use: { kind: 'blink' },
    flavour: 'The floor forgets you were standing on it.',
  },

  // -- Seals: not usable, only carried. Their whole function is opening gates.
  brassSeal: {
    name: 'brass seal', glyph: '=', color: 'seal', seal: 'siegeYards',
    flavour: 'Stamped with a wall that no longer exists.',
  },
  silverSeal: {
    name: 'silver seal', glyph: '=', color: 'seal', seal: 'reliquary',
    flavour: 'Warm, which is not a thing silver does.',
  },
  goldSeal: {
    name: 'gold seal', glyph: '=', color: 'seal', seal: 'choir',
    flavour: 'It hums the note you have been trying to forget.',
  },
  theRelic: {
    name: 'the Relic', glyph: '*', color: 'notable', victory: true,
    flavour: 'You came a long way for this.',
  },
};

/** Only floor-spawnable relics -- seals are placed by bosses, never rolled. */
export function itemTable(depth) {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.weight && depth >= item.minDepth)
    .map(([key, item]) => ({ key, ...item }));
}
