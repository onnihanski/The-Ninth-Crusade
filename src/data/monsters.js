// Monster roster, grouped by the region that fields them. Anything with
// `boss: true` is placed deliberately rather than rolled, and `drops` is a list
// of item keys spilled on death.
//
//   speed     100 = one turn per player turn; 160 acts half again as often
//   minDepth  earliest floor it may be rolled on, within its region
//   ranged    { power, range, reload } -- shoots instead of closing, and backs
//             away when you get near. Nothing ranged appears on depth 1.
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
  crossbowman: {
    name: 'deserter with a crossbow', glyph: 'x', color: 'monsterTough',
    weight: 5, minDepth: 2, maxHp: 7, power: 2, defense: 0, speed: 100, xp: 16,
    ranged: { power: 4, range: 5, reload: 3 },
  },
  herald: {
    name: 'the Herald of the Third Wall', glyph: 'H', color: 'boss',
    boss: true, bossTrait: 'callTheRoll',
    maxHp: 21, power: 5, defense: 2, speed: 105, xp: 70,
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
  boneSlinger: {
    name: 'bone slinger', glyph: 'b', color: 'monsterTough',
    weight: 5, minDepth: 4, maxHp: 12, power: 3, defense: 1, speed: 100, xp: 26,
    ranged: { power: 5, range: 5, reload: 3 },
  },
  saintPerpetua: {
    name: 'Saint Perpetua the Patient', glyph: 'S', color: 'boss',
    boss: true, bossTrait: 'risesAgain',
    maxHp: 31, power: 7, defense: 3, speed: 100, xp: 140,
    drops: ['silverSeal', 'aegisOfAmbrose', 'reliquaryPhial'],
    entrance: 'A saint sits up, brushes herself off, and apologises for the state of the room.',
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
  psalmist: {
    name: 'psalmist', glyph: 'y', color: 'mythic',
    weight: 4, minDepth: 7, maxHp: 16, power: 3, defense: 1, speed: 110, xp: 36,
    ranged: { power: 6, range: 6, reload: 3 },
  },
  odoThePrecentor: {
    name: 'Odo the Precentor', glyph: 'V', color: 'boss',
    boss: true, bossTrait: 'carries',
    maxHp: 48, power: 9, defense: 4, speed: 115, xp: 220,
    drops: ['goldSeal', 'vestmentOfTheChoir', 'psalmOfWard'],
    entrance: 'The singing stops. This is much worse.',
  },

  // -- The Empty Tomb: quiet, personal ---------------------------------------
  graveWraith: {
    name: 'grave wraith', glyph: 'w', color: 'mythic',
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
  mourner: {
    name: 'mourner', glyph: 'M', color: 'mythic',
    weight: 4, minDepth: 10, maxHp: 20, power: 4, defense: 2, speed: 110, xp: 52,
    ranged: { power: 8, range: 6, reload: 3 },
  },
  baudouin: {
    name: 'Sir Baudouin IX the Unreturned', glyph: '@', color: 'boss',
    boss: true, bossTrait: 'mirrors',
    maxHp: 72, power: 11, defense: 5, speed: 100, xp: 400,
    drops: ['theRelic'],
    entrance: 'A crusader is sitting against the far wall, and he stands up when he sees you.',
  },
};

/** Weighted spawn table for a region's rank-and-file. */
/**
 * What this region can field on this floor. `minDepth` keeps the ranged units
 * off the opening floor, where being shot at by something you have not learned
 * to close with yet is simply unfair.
 */
export function monsterTable(region, depth) {
  return region.monsters
    .map((key) => ({ key, ...MONSTERS[key] }))
    .filter((m) => depth >= (m.minDepth ?? 1));
}
