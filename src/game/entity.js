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
    statuses: [],
    ...props,
  };
}

export function makePlayer(x, y, name) {
  return makeEntity({
    x, y,
    glyph: '@', color: 'player', name: name ?? 'you',
    blocks: true, speed: 100,
    maxHp: 22, hp: 22, power: 5, defense: 1,
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
    boss: spec.boss ?? false,
    drops: spec.drops ? [...spec.drops] : [],
    ai: { hunting: Boolean(spec.boss) },  // bosses are awake and waiting
  });
}

/**
 * A dead crusader from a previous run. Stats scale with how far they got --
 * a crusader who died on depth 10 is a genuinely dangerous thing to meet.
 */
export function makeRevenant(entry, x, y) {
  const depth = entry.depth;
  return makeEntity({
    x, y,
    glyph: '@', color: 'revenant',
    name: 'the revenant of ' + entry.name,
    blocks: true, speed: 100,
    maxHp: 14 + depth * 3, hp: 14 + depth * 3,
    power: 4 + Math.floor(depth / 2),
    defense: 1 + Math.floor(depth / 4),
    drops: [...(entry.relics ?? [])],
    revenant: true,
    ai: { hunting: false },
  });
}

export function makeItem(spec, x, y) {
  return makeEntity({
    x, y,
    glyph: spec.glyph, color: spec.color, name: spec.name,
    item: { key: spec.key, use: spec.use, seal: spec.seal, victory: spec.victory, flavour: spec.flavour },
  });
}
