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

  // -- Arms and armour ------------------------------------------------------
  //
  // Every piece is a trade, never a straight upgrade: the heavy things cost
  // speed, and speed is turns. `slot` is what it displaces when worn.
  armingSword: {
    name: 'arming sword', glyph: ')', color: 'gear',
    weight: 9, minDepth: 1, equip: { slot: 'weapon', power: 2 },
    flavour: 'Issued, not chosen.',
  },
  flangedMace: {
    name: 'flanged mace', glyph: ')', color: 'gear',
    weight: 7, minDepth: 3, equip: { slot: 'weapon', power: 3 },
    flavour: 'Technically not a blade, so technically permitted.',
  },
  censerFlail: {
    name: 'censer flail', glyph: ')', color: 'gear',
    weight: 5, minDepth: 6, equip: { slot: 'weapon', power: 5, speed: -10 },
    flavour: 'Swung wide, it still smells of the service.',
  },
  martyrsGreatsword: {
    name: "martyr's greatsword", glyph: ')', color: 'gear',
    weight: 4, minDepth: 8, equip: { slot: 'weapon', power: 7, speed: -25 },
    flavour: 'Two hands, one conviction, no hurry.',
  },

  kiteShield: {
    name: 'battered kite shield', glyph: '(', color: 'gear',
    weight: 8, minDepth: 1, equip: { slot: 'shield', defense: 1 },
    flavour: 'Someone else stopped something with this.',
  },
  heaterShield: {
    name: 'heater shield', glyph: '(', color: 'gear',
    weight: 6, minDepth: 4, equip: { slot: 'shield', defense: 2, speed: -5 },
    flavour: 'Painted with a wall, badly.',
  },
  aegisOfAmbrose: {
    name: 'aegis of Saint Ambrose', glyph: '(', color: 'gear',
    weight: 3, minDepth: 7, equip: { slot: 'shield', defense: 3, speed: -10 },
    flavour: 'It did not work for him either, but it took longer.',
  },

  gambeson: {
    name: 'padded gambeson', glyph: '[', color: 'gear',
    weight: 9, minDepth: 1, equip: { slot: 'armour', defense: 1 },
    flavour: 'Warm. That is the whole of it.',
  },
  mailHauberk: {
    name: 'mail hauberk', glyph: '[', color: 'gear',
    weight: 7, minDepth: 3, equip: { slot: 'armour', defense: 2, speed: -10 },
    flavour: 'Four thousand rings, all of them yours to carry.',
  },
  ossuaryPlate: {
    name: 'ossuary plate', glyph: '[', color: 'gear',
    weight: 4, minDepth: 7, equip: { slot: 'armour', defense: 4, speed: -25 },
    flavour: 'Fitted to someone your size. He is not using it.',
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
