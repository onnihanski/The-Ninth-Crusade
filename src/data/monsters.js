// Monster roster, grouped by the region that fields them. Anything with
// `boss: true` is placed deliberately rather than rolled, and `drops` is a list
// of item keys spilled on death.
//
//   speed   100 = one turn per player turn; 160 acts half again as often
export const MONSTERS = {
  // -- The Siege Yards: mundane, tired, hungry -------------------------------
  campDog: {
    name: 'camp dog', glyph: 'd', color: 'monsterWeak',
    weight: 12, maxHp: 5, power: 3, defense: 0, speed: 150, xp: 4,
  },
  deserter: {
    name: 'deserter', glyph: 'p', color: 'monsterWeak',
    weight: 10, maxHp: 8, power: 3, defense: 1, speed: 100, xp: 6,
  },
  flagellant: {
    name: 'flagellant', glyph: 'f', color: 'monsterTough',
    weight: 7, maxHp: 10, power: 4, defense: 0, speed: 100, xp: 10,
  },
  herald: {
    name: 'the Herald of the Third Wall', glyph: 'H', color: 'boss',
    boss: true, maxHp: 26, power: 5, defense: 2, speed: 105, xp: 70,
    drops: ['brassSeal', 'heraldsPollaxe'],
    entrance: 'A man in very good armour reads your name off a list and looks disappointed.',
  },

  // -- The Reliquary: patient, dry, well-catalogued --------------------------
  bonepicker: {
    name: 'bonepicker', glyph: 'z', color: 'monsterWeak',
    weight: 11, maxHp: 10, power: 4, defense: 1, speed: 100, xp: 14,
  },
  reliquaryMoth: {
    name: 'reliquary moth', glyph: 'm', color: 'monsterWeak',
    weight: 9, maxHp: 7, power: 4, defense: 0, speed: 170, xp: 12,
  },
  ossuaryWarden: {
    name: 'ossuary warden', glyph: 'w', color: 'monsterTough',
    weight: 6, maxHp: 18, power: 6, defense: 3, speed: 80, xp: 24,
  },
  saintAmbrose: {
    name: 'Saint Ambrose, Who Would Not Stay Buried', glyph: 'S', color: 'boss',
    boss: true, maxHp: 44, power: 8, defense: 3, speed: 100, xp: 140,
    drops: ['silverSeal', 'aegisOfAmbrose', 'reliquaryPhial'],
    entrance: 'A saint sits up, brushes himself off, and apologises for the state of the room.',
  },

  // -- The Choir: the floor where the game stops being mundane ---------------
  chorister: {
    name: 'chorister', glyph: 'c', color: 'monsterWeak',
    weight: 10, maxHp: 14, power: 5, defense: 1, speed: 110, xp: 24,
  },
  censerbearer: {
    name: 'censerbearer', glyph: 'C', color: 'monsterTough',
    weight: 7, maxHp: 20, power: 6, defense: 2, speed: 100, xp: 32,
  },
  wingedThing: {
    name: 'winged thing', glyph: 'A', color: 'monsterTough',
    weight: 5, maxHp: 16, power: 8, defense: 1, speed: 150, xp: 30,
  },
  theVoice: {
    name: 'the Voice in the Vaults', glyph: 'V', color: 'boss',
    boss: true, maxHp: 58, power: 10, defense: 4, speed: 115, xp: 220,
    drops: ['goldSeal', 'vestmentOfTheChoir', 'psalmOfWard'],
    entrance: 'The singing stops. This is much worse.',
  },

  // -- The Empty Tomb: quiet, personal ---------------------------------------
  aDoubt: {
    name: 'a doubt', glyph: 'g', color: 'mythic',
    weight: 10, maxHp: 18, power: 8, defense: 2, speed: 130, xp: 38,
  },
  pilgrimHusk: {
    name: 'pilgrim husk', glyph: 'P', color: 'monsterWeak',
    weight: 9, maxHp: 22, power: 8, defense: 2, speed: 100, xp: 40,
  },
  sepulchreWorm: {
    name: 'sepulchre worm', glyph: 'W', color: 'monsterTough',
    weight: 5, maxHp: 34, power: 11, defense: 4, speed: 90, xp: 58,
  },
  whatYouCameFor: {
    name: 'What You Came For', glyph: '&', color: 'boss',
    boss: true, maxHp: 84, power: 12, defense: 5, speed: 110, xp: 400,
    drops: ['theRelic'],
    entrance: 'It is smaller than the songs implied. It knows your name, and both of the others.',
  },
};

/** Weighted spawn table for a region's rank-and-file. */
export function monsterTable(region) {
  return region.monsters.map((key) => ({ key, ...MONSTERS[key] }));
}
