// Entities are plain bags of optional fields rather than a class hierarchy.
// A thing is a monster because it has `ai`, an item because it has `item`, a
// combatant because it has `maxHp`. Adding a new kind of thing means adding a
// field, never editing a base class.
let nextId = 1;

export function makeEntity(props = {}) {
  return {
    id: nextId++,
    x: 0, y: 0,
    glyph: '?',
    color: 'text',
    name: 'something',
    blocks: false,
    alive: true,
    speed: 0,     // 0 = never takes turns (items, corpses)
    energy: 0,
    ...props,
  };
}

export function makePlayer(x, y) {
  return makeEntity({
    x, y,
    glyph: '@', color: 'player', name: 'you',
    blocks: true, speed: 100,
    maxHp: 20, hp: 20, power: 5, defense: 1,
    inventory: [],
    isPlayer: true,
  });
}

export function makeMonster(spec, x, y) {
  return makeEntity({
    x, y,
    glyph: spec.glyph, color: spec.color, name: spec.name,
    blocks: true, speed: spec.speed,
    maxHp: spec.maxHp, hp: spec.maxHp,
    power: spec.power, defense: spec.defense,
    ai: { hunting: false },
  });
}

export function makeItem(spec, x, y) {
  return makeEntity({
    x, y,
    glyph: spec.glyph, color: spec.color, name: spec.name,
    item: { use: spec.use },
  });
}
