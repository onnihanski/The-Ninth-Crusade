// Entities are plain bags of optional fields rather than a class hierarchy.
// A thing is a monster because it has `ai`, an item because it has `item`, a
// combatant because it has `maxHp`. Adding a new kind of thing means adding a
// field, never editing a base class.
import { ITEMS, itemIcon } from '../data/items.js';

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
  const player = makeEntity({
    x, y,
    glyph: '@', color: 'player', name: name ?? 'you', iconKey: 'player',
    blocks: true, speed: 100,
    maxHp: 26, hp: 26, power: 5, defense: 1,
    level: 1, xp: 0,
    inventory: [],
    seals: [],
    merges: [],
    equipment: { weapon: null, shield: null, armour: null },
    isPlayer: true,
  });

  // The crusade issues you the cheapest thing in the armoury and wishes you
  // well. Starting with nothing meant the first floor was decided before the
  // player had learned a single system.
  player.equipment.weapon = makeItem({ key: 'armingSword', ...ITEMS.armingSword }, x, y);
  player.equipment.armour = makeItem({ key: 'gambeson', ...ITEMS.gambeson }, x, y);
  return player;
}

export function makeMonster(spec, x, y) {
  return makeEntity({
    x, y,
    glyph: spec.glyph, color: spec.color, name: spec.name, iconKey: spec.key,
    blocks: true, speed: spec.speed,
    maxHp: spec.maxHp, hp: spec.maxHp,
    power: spec.power, defense: spec.defense,
    xp: spec.xp ?? 0,
    ranged: spec.ranged ?? null,
    reloadLeft: 0,
    boss: spec.boss ?? false,
    bossTrait: spec.bossTrait ?? null,
    iconScale: spec.boss ? 1.5 : 1,            // a boss overflows its own cell
    drops: spec.drops ? [...spec.drops] : [],
    ai: { hunting: Boolean(spec.boss) },  // bosses are awake and waiting
  });
}

/**
 * A dead crusader from a previous run. Stats scale with how far they got --
 * a crusader who died on depth 10 is a genuinely dangerous thing to meet.
 */
/**
 * Memorial entries used to record equipment as bare keys. They now record
 * `{ key, heirloom }`, because a piece can carry the history of everyone who
 * has died in it. Old entries still read cleanly.
 */
function normaliseKit(equipment) {
  return (equipment ?? []).map((piece) =>
    typeof piece === 'string' ? { key: piece, heirloom: null } : piece);
}

/** One more crusader has died holding this, and it got as deep as they did. */
function deepenHeirloom(previous, entry) {
  return {
    of: entry.name,
    deepest: Math.max(previous?.deepest ?? 0, entry.depth ?? 1),
    marks: (previous?.marks ?? 0) + 1,
  };
}

export function makeRevenant(entry, x, y) {
  const depth = entry.depth;
  // They are still wearing it, so it still counts -- and it is still on them
  // when they go down again.
  const kitEntries = normaliseKit(entry.equipment);

  // A revenant is the crusader as they actually were -- the stats they levelled
  // to -- and nothing their equipment was doing for them.
  //
  // Their gear used to buff them as well as drop from them, which meant a
  // predecessor who died in good armour came back as a wall on floor three,
  // long before the crusader meeting them could field anything comparable.
  // The kit keeps every point it ever had. It just does not lend them any.
  // The fallbacks cover memorial entries written before levelling existed.
  const hp = entry.maxHp ?? 14 + depth * 3;
  const level = entry.level ?? 1;

  return makeEntity({
    x, y,
    glyph: '@', color: 'revenant', iconKey: 'revenant',
    name: 'the revenant of ' + entry.name,
    blocks: true,
    speed: 100,
    maxHp: hp, hp,
    power: entry.power ?? 4 + Math.floor(depth / 2),
    defense: entry.defense ?? 1 + Math.floor(depth / 4),
    xp: 20 + depth * 8 + level * 10,
    drops: [
      ...(entry.relics ?? []).map((key) => ({ key, heirloom: null })),
      // Take it back off them and it carries their name from here on.
      ...kitEntries.map((piece) => ({
        key: piece.key,
        heirloom: deepenHeirloom(piece.heirloom, entry),
      })),
    ],
    revenant: true,
    level,
    ai: { hunting: false },
  });
}

export function makeItem(spec, x, y) {
  return makeEntity({
    x, y,
    glyph: spec.glyph, color: spec.color, name: spec.name,
    iconKey: itemIcon(spec),
    iconScale: 0.76,                           // loot sits smaller than a body
    item: {
      key: spec.key, use: spec.use, equip: spec.equip, trait: spec.trait ?? null,
      seal: spec.seal, victory: spec.victory, flavour: spec.flavour,
      heirloom: spec.heirloom ?? null,
      carried: 0,                 // turns spent unused in a pack -- see attunement
    },
  });
}
