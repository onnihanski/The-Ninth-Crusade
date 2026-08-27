// Data-driven monster table. Add a key here and it shows up in the dungeon.
//
//   weight    relative spawn frequency at eligible depths
//   minDepth  earliest depth it can appear
//   speed     100 = one turn per player turn; 150 acts half again as often
export const MONSTERS = {
  rat: {
    name: 'giant rat', glyph: 'r', color: 'monsterWeak',
    weight: 12, minDepth: 1, maxHp: 4, power: 2, defense: 0, speed: 110,
  },
  kobold: {
    name: 'kobold', glyph: 'k', color: 'monsterWeak',
    weight: 10, minDepth: 1, maxHp: 6, power: 3, defense: 0, speed: 100,
  },
  jackal: {
    name: 'jackal', glyph: 'j', color: 'monsterWeak',
    weight: 8, minDepth: 2, maxHp: 5, power: 3, defense: 0, speed: 160,
  },
  orc: {
    name: 'orc', glyph: 'o', color: 'monsterTough',
    weight: 8, minDepth: 3, maxHp: 12, power: 5, defense: 1, speed: 100,
  },
  ogre: {
    name: 'ogre', glyph: 'O', color: 'monsterTough',
    weight: 4, minDepth: 5, maxHp: 20, power: 8, defense: 2, speed: 80,
  },
};

export function monsterTable(depth) {
  return Object.entries(MONSTERS)
    .filter(([, m]) => depth >= m.minDepth)
    .map(([key, m]) => ({ key, ...m }));
}
