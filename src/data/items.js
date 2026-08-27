// Relics are consumed; gear is worn. Both are pure data -- `use` is resolved in
// game/effects.js and `equip` in game/status.js.

// Rarity is a spawn-frequency band and a colour, not a stat. It reads at a
// glance on the floor, which is the whole point of colouring loot.
const RARITY_COLOR = {
  common: 'gearCommon',
  uncommon: 'gearUncommon',
  rare: 'gearRare',
  sacred: 'gearSacred',
};

/**
 * Sacred gear never rolls on a floor. The only way to hold it is to kill the
 * thing carrying it, which is what makes bosses worth more than their seal.
 */
function gear({ name, glyph, slot, rarity, power = 0, defense = 0, speed = 0,
  minDepth = 1, weight = 0, flavour }) {
  return {
    name, glyph, rarity,
    color: RARITY_COLOR[rarity],
    bossOnly: rarity === 'sacred',
    weight: rarity === 'sacred' ? 0 : weight,
    minDepth,
    equip: { slot, power, defense, speed },
    flavour,
  };
}

export const ITEMS = {
  // -- Relics: spent, not worn ----------------------------------------------
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

  // -- Weapons --------------------------------------------------------------
  armingSword: gear({
    name: 'arming sword', glyph: ')', slot: 'weapon', rarity: 'common',
    power: 2, minDepth: 1, weight: 12,
    flavour: 'Issued, not chosen.',
  }),
  flangedMace: gear({
    name: 'flanged mace', glyph: ')', slot: 'weapon', rarity: 'common',
    power: 3, speed: -5, minDepth: 2, weight: 10,
    flavour: 'Technically not a blade, so technically permitted.',
  }),
  pilgrimsFalchion: gear({
    name: "pilgrim's falchion", glyph: ')', slot: 'weapon', rarity: 'uncommon',
    power: 4, minDepth: 4, weight: 6,
    flavour: 'Carried a long way by someone who stopped.',
  }),
  censerFlail: gear({
    name: 'censer flail', glyph: ')', slot: 'weapon', rarity: 'uncommon',
    power: 5, speed: -10, minDepth: 6, weight: 5,
    flavour: 'Swung wide, it still smells of the service.',
  }),
  martyrsGreatsword: gear({
    name: "martyr's greatsword", glyph: ')', slot: 'weapon', rarity: 'rare',
    power: 7, speed: -25, minDepth: 8, weight: 3,
    flavour: 'Two hands, one conviction, no hurry.',
  }),
  heraldsPollaxe: gear({
    name: "the Herald's pollaxe", glyph: ')', slot: 'weapon', rarity: 'sacred',
    power: 6, speed: -5,
    flavour: 'He read your name off a list. This is the rest of the sentence.',
  }),

  // -- Shields --------------------------------------------------------------
  kiteShield: gear({
    name: 'battered kite shield', glyph: '(', slot: 'shield', rarity: 'common',
    defense: 1, minDepth: 1, weight: 12,
    flavour: 'Someone else stopped something with this.',
  }),
  heaterShield: gear({
    name: 'heater shield', glyph: '(', slot: 'shield', rarity: 'common',
    defense: 2, speed: -5, minDepth: 3, weight: 10,
    flavour: 'Painted with a wall, badly.',
  }),
  ossuaryBuckler: gear({
    name: 'ossuary buckler', glyph: '(', slot: 'shield', rarity: 'uncommon',
    defense: 2, speed: 5, minDepth: 5, weight: 6,
    flavour: 'Light, and it wants you to keep moving.',
  }),
  siegePavise: gear({
    name: 'siege pavise', glyph: '(', slot: 'shield', rarity: 'uncommon',
    defense: 3, speed: -15, minDepth: 5, weight: 5,
    flavour: 'A wall you have to carry.',
  }),
  towerShield: gear({
    name: 'tower shield', glyph: '(', slot: 'shield', rarity: 'rare',
    defense: 4, speed: -20, minDepth: 8, weight: 3,
    flavour: 'Behind this, very little happens to you. Slowly.',
  }),
  aegisOfAmbrose: gear({
    name: 'aegis of Saint Ambrose', glyph: '(', slot: 'shield', rarity: 'sacred',
    defense: 4, speed: -5,
    flavour: 'It did not work for him either, but it took longer.',
  }),

  // -- Armour ---------------------------------------------------------------
  gambeson: gear({
    name: 'padded gambeson', glyph: '[', slot: 'armour', rarity: 'common',
    defense: 1, minDepth: 1, weight: 12,
    flavour: 'Warm. That is the whole of it.',
  }),
  mailHauberk: gear({
    name: 'mail hauberk', glyph: '[', slot: 'armour', rarity: 'common',
    defense: 2, speed: -10, minDepth: 3, weight: 10,
    flavour: 'Four thousand rings, all of them yours to carry.',
  }),
  brigandine: gear({
    name: 'brigandine', glyph: '[', slot: 'armour', rarity: 'uncommon',
    defense: 3, speed: -12, minDepth: 5, weight: 6,
    flavour: 'Plates on the inside, so nobody can tell how frightened you are.',
  }),
  ossuaryPlate: gear({
    name: 'ossuary plate', glyph: '[', slot: 'armour', rarity: 'rare',
    defense: 4, speed: -25, minDepth: 7, weight: 4,
    flavour: 'Fitted to someone your size. He is not using it.',
  }),
  sepulchreHarness: gear({
    name: 'sepulchre harness', glyph: '[', slot: 'armour', rarity: 'rare',
    defense: 5, speed: -30, minDepth: 10, weight: 2,
    flavour: 'It was buried with someone. It got up anyway.',
  }),
  vestmentOfTheChoir: gear({
    name: 'vestment of the choir', glyph: '[', slot: 'armour', rarity: 'sacred',
    defense: 5,
    flavour: 'Weightless. Whatever is holding it up is not the cloth.',
  }),

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

/** Floor-spawnable only: sacred gear and seals are placed by bosses. */
export function itemTable(depth) {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.weight && !item.bossOnly && depth >= item.minDepth)
    .map(([key, item]) => ({ key, ...item }));
}

export const SLOTS = ['weapon', 'shield', 'armour'];
