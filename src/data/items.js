// Relics are consumed; gear is worn. Both are pure data -- `use` is resolved in
// game/effects.js, `equip` in game/status.js, and `ranged` in game/combat.js.
//
// Every entry carries `flavour` (one line, shown when you pick it up) and
// `lore` (a couple of sentences, shown when you hover it in the pack). Between
// them they are the only place the world gets described at any length, so they
// are worth writing properly.

import { TRAITS, heirloomBonus, heirloomLabel, CLINCH_PENALTY } from './traits.js';

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
  ranged = null, trait = null, minDepth = 1, weight = 0, flavour, lore }) {
  return {
    name, glyph, rarity, trait,
    color: RARITY_COLOR[rarity],
    bossOnly: rarity === 'sacred',
    weight: rarity === 'sacred' ? 0 : weight,
    minDepth,
    equip: { slot, power, defense, speed, ranged },
    flavour, lore,
  };
}

export const ITEMS = {
  // -- Relics: spent, not worn ----------------------------------------------
  reliquaryPhial: {
    name: 'reliquary phial', glyph: '!', color: 'item',
    weight: 12, minDepth: 1, use: { kind: 'heal', amount: 10, attune: { per: 20, max: 6 } },
    flavour: 'Contents: mostly saint.',
    lore: 'Ground bone in consecrated water, bottled by an order that kept '
      + 'excellent records and no explanations. It works. Nobody has ever '
      + 'written down why.',
  },
  sparkOfTheChoir: {
    name: 'spark of the choir', glyph: '?', color: 'item',
    weight: 8, minDepth: 2,
    use: { kind: 'smite', amount: 12, range: 6, attune: { per: 20, max: 6 }, echo: 3 },
    flavour: 'One held note, released.',
    lore: 'A single note from the Choir, caught in wax before it could finish. '
      + 'Breaking the seal finishes it. Whatever it was aimed at when it was '
      + 'sung is no longer the point.',
  },
  psalmOfWard: {
    name: 'psalm of ward', glyph: '?', color: 'item',
    weight: 7, minDepth: 3,
    use: { kind: 'ward', amount: 3, turns: 12, attune: { per: 30, max: 3 } },
    flavour: 'Sung badly, it still works.',
    lore: 'Twelve lines that make you harder to reach. The crusade issues them '
      + 'to everyone and teaches the tune to nobody, on the theory that panic '
      + 'carries a melody well enough.',
  },
  stepOfTheAbsent: {
    name: 'step of the absent', glyph: '?', color: 'item',
    weight: 6, minDepth: 4, use: { kind: 'blink' },
    flavour: 'The floor forgets you were standing on it.',
    lore: 'A prayer for people who have decided to be elsewhere. It does not '
      + 'ask where. It has never yet put anyone inside a wall, which the order '
      + 'that made it considered sufficient testing.',
  },

  // -- Melee weapons --------------------------------------------------------
  armingSword: gear({
    name: 'arming sword', glyph: ')', slot: 'weapon', rarity: 'common',
    power: 2, minDepth: 1, weight: 12,
    flavour: 'Issued, not chosen.',
    lore: 'Standard issue, stamped with a quartermaster\'s mark and the year, '
      + 'which is older than you expected. It has killed things before. It is '
      + 'not sentimental about it.',
  }),
  flangedMace: gear({
    name: 'flanged mace', glyph: ')', slot: 'weapon', rarity: 'common',
    power: 3, speed: -5, minDepth: 2, weight: 10,
    flavour: 'Technically not a blade, so technically permitted.',
    lore: 'Clergy were forbidden to shed blood, so they carried these instead '
      + 'and shed something else. The distinction mattered enormously to '
      + 'everyone except the people on the receiving end.',
  }),
  pilgrimsFalchion: gear({
    name: "pilgrim's falchion", glyph: ')', slot: 'weapon', rarity: 'uncommon',
    power: 4, minDepth: 4, weight: 6,
    flavour: 'Carried a long way by someone who stopped.',
    lore: 'Single-edged, heavy at the tip, made for people who walk further '
      + 'than they fight. The grip is worn to the shape of a hand that is not '
      + 'yours.',
  }),
  censerFlail: gear({
    name: 'censer flail', glyph: ')', slot: 'weapon', rarity: 'uncommon',
    power: 5, speed: -10, minDepth: 6, weight: 5,
    flavour: 'Swung wide, it still smells of the service.',
    lore: 'A thurible on a longer chain than liturgy requires. Somewhere '
      + 'between the third and fourth crusade, someone noticed how it moved '
      + 'and stopped thinking about incense.',
  }),
  martyrsGreatsword: gear({
    name: "martyr's greatsword", glyph: ')', slot: 'weapon', rarity: 'rare',
    power: 7, speed: -25, trait: 'cleave', minDepth: 8, weight: 3,
    flavour: 'Two hands, one conviction, no hurry.',
    lore: 'Too long to draw in a corridor and too heavy to swing twice, which '
      + 'has never once discouraged anyone. Every martyr it is named for died '
      + 'holding it, and the name is plural.',
  }),
  heraldsPollaxe: gear({
    name: "the Herald's pollaxe", glyph: ')', slot: 'weapon', rarity: 'sacred',
    power: 5, speed: -5, trait: 'reach',
    flavour: 'He read your name off a list. This is the rest of the sentence.',
    lore: 'Axe, hammer and spike on one shaft: an argument with three '
      + 'conclusions. The Herald kept it immaculate and used it rarely, which '
      + 'is the most frightening way to own a weapon.',
  }),

  // -- Ranged weapons -------------------------------------------------------
  //
  // These occupy the same slot as a sword and are nearly useless in it. The
  // trade is the whole design: enormous damage at distance, a reload you have
  // to buy with retreating, and almost nothing if something reaches you.
  pilgrimsSling: gear({
    name: "pilgrim's sling", glyph: '}', slot: 'weapon', rarity: 'common',
    power: 1, ranged: { power: 4, range: 4, reload: 1 },
    minDepth: 1, weight: 10,
    flavour: 'A strap, a stone, and a great deal of confidence.',
    lore: 'The cheapest ranged weapon in the world and the oldest. Pilgrims '
      + 'carry them because they are legal everywhere and because there is '
      + 'always another stone.',
  }),
  huntingCrossbow: gear({
    name: 'hunting crossbow', glyph: '}', slot: 'weapon', rarity: 'uncommon',
    power: 1, ranged: { power: 6, range: 6, reload: 2 },
    minDepth: 3, weight: 7,
    flavour: 'Made for deer. Adapted.',
    lore: 'A hunting piece, not a war piece: light, quiet, and slow to crank. '
      + 'It was requisitioned from a village that had been using it for its '
      + 'intended purpose quite happily.',
  }),
  arbalest: gear({
    name: 'arbalest', glyph: '}', slot: 'weapon', rarity: 'rare',
    power: 2, ranged: { power: 9, range: 7, reload: 3 }, speed: -10, trait: 'pierce',
    minDepth: 7, weight: 3,
    flavour: 'Punches through a wall\'s worth of argument.',
    lore: 'Steel-limbed, cranked with a windlass, banned twice by councils '
      + 'that had seen what it does and unbanned twice by people who had not. '
      + 'Three turns to reload. Worth every one of them.',
  }),

  // -- Shields --------------------------------------------------------------
  kiteShield: gear({
    name: 'battered kite shield', glyph: '(', slot: 'shield', rarity: 'common',
    defense: 1, minDepth: 1, weight: 12,
    flavour: 'Someone else stopped something with this.',
    lore: 'Long enough to cover a leg on horseback, which is of no use to you '
      + 'at all. The splintering on the left side is the shape of something '
      + 'that got through.',
  }),
  heaterShield: gear({
    name: 'heater shield', glyph: '(', slot: 'shield', rarity: 'common',
    defense: 2, speed: -5, minDepth: 3, weight: 10,
    flavour: 'Painted with a wall, badly.',
    lore: 'Shorter and squarer than a kite, and much easier to walk with. The '
      + 'device painted on it is the Third Wall, rendered by someone who had '
      + 'clearly never seen it.',
  }),
  ossuaryBuckler: gear({
    name: 'ossuary buckler', glyph: '(', slot: 'shield', rarity: 'uncommon',
    defense: 2, speed: 5, minDepth: 5, weight: 6,
    flavour: 'Light, and it wants you to keep moving.',
    lore: 'A fist-sized disc of bone laminate, no wider than the hand behind '
      + 'it. It protects almost nothing and encourages you to be somewhere '
      + 'else, which protects everything.',
  }),
  siegePavise: gear({
    name: 'siege pavise', glyph: '(', slot: 'shield', rarity: 'uncommon',
    defense: 3, speed: -15, minDepth: 5, weight: 5,
    flavour: 'A wall you have to carry.',
    lore: 'Designed to be propped up so a crossbowman can reload behind it. '
      + 'Carrying one by hand was never the intention and remains, on the '
      + 'evidence, a bad idea done anyway.',
  }),
  towerShield: gear({
    name: 'tower shield', glyph: '(', slot: 'shield', rarity: 'rare',
    defense: 4, speed: -20, trait: 'block', minDepth: 8, weight: 3,
    flavour: 'Behind this, very little happens to you. Slowly.',
    lore: 'Chest to shin, banded in iron, heavy enough to change how you '
      + 'stand. Men have won fights behind these by simply outlasting the '
      + 'other person\'s patience.',
  }),
  aegisOfAmbrose: gear({
    name: 'aegis of Saint Perpetua', glyph: '(', slot: 'shield', rarity: 'sacred',
    defense: 4, speed: -5, trait: 'riposte',
    flavour: 'It did not work for her either, but it took longer.',
    lore: 'The saint was interred holding it and declined to let go. It weighs '
      + 'a quarter of what it looks like, and the arm straps adjust themselves '
      + 'to the wearer, which nobody has asked it to stop doing.',
  }),

  // -- Armour ---------------------------------------------------------------
  gambeson: gear({
    name: 'padded gambeson', glyph: '[', slot: 'armour', rarity: 'common',
    defense: 1, minDepth: 1, weight: 12,
    flavour: 'Warm. That is the whole of it.',
    lore: 'Twenty layers of linen quilted together, which stops more than it '
      + 'has any right to. Everyone wears one under everything else. You are '
      + 'wearing one under nothing else.',
  }),
  mailHauberk: gear({
    name: 'mail hauberk', glyph: '[', slot: 'armour', rarity: 'common',
    defense: 2, speed: -10, minDepth: 3, weight: 10,
    flavour: 'Four thousand rings, all of them yours to carry.',
    lore: 'Riveted mail to the knee, the standard of three centuries. It '
      + 'turns edges beautifully and does nothing whatever about being hit '
      + 'with a mace, which is why maces caught on.',
  }),
  brigandine: gear({
    name: 'brigandine', glyph: '[', slot: 'armour', rarity: 'uncommon',
    defense: 3, speed: -12, minDepth: 5, weight: 6,
    flavour: 'Plates on the inside, so nobody can tell how frightened you are.',
    lore: 'Small steel plates riveted between cloth, the rivet heads showing '
      + 'in neat rows. From outside it is a coat. It is not a coat.',
  }),
  ossuaryPlate: gear({
    name: 'ossuary plate', glyph: '[', slot: 'armour', rarity: 'rare',
    defense: 4, speed: -25, minDepth: 7, weight: 4,
    flavour: 'Fitted to someone your size. He is not using it.',
    lore: 'Full harness, taken off a rack in a room where the racks were '
      + 'arranged by height. It fits you exactly, which is the part worth '
      + 'thinking about, and then not thinking about.',
  }),
  sepulchreHarness: gear({
    name: 'sepulchre harness', glyph: '[', slot: 'armour', rarity: 'rare',
    defense: 5, speed: -30, minDepth: 10, weight: 2,
    flavour: 'It was buried with someone. It got up anyway.',
    lore: 'Grave-goods, and heavy ones: the dead were not expected to walk in '
      + 'this. Something has worn it since it was interred. The inside is '
      + 'polished smooth.',
  }),
  vestmentOfTheChoir: gear({
    name: 'vestment of the choir', glyph: '[', slot: 'armour', rarity: 'sacred',
    defense: 5, trait: 'sanctuary',
    flavour: 'Weightless. Whatever is holding it up is not the cloth.',
    lore: 'Plain white wool, unadorned, of a weight that suggests nothing is '
      + 'inside it. Blows land on it and stop. The wool does not move, and '
      + 'neither does anything under the wool.',
  }),

  // -- Seals: not usable, only carried. Their whole function is opening gates.
  brassSeal: {
    name: 'brass seal', glyph: '=', color: 'seal', seal: 'siegeYards',
    flavour: 'Stamped with a wall that no longer exists.',
    lore: 'The die that struck this was destroyed with the wall it depicts. '
      + 'The gate below does not know that and would not care.',
  },
  silverSeal: {
    name: 'silver seal', glyph: '=', color: 'seal', seal: 'reliquary',
    flavour: 'Warm, which is not a thing silver does.',
    lore: 'It was warm when Saint Ambrose was holding it and it has not cooled '
      + 'since. The Reliquary catalogued it under "pending".',
  },
  goldSeal: {
    name: 'gold seal', glyph: '=', color: 'seal', seal: 'choir',
    flavour: 'It hums the note you have been trying to forget.',
    lore: 'Soft enough to mark with a thumbnail, and marked all over. Every '
      + 'crusader who carried it did the same thing while listening to it.',
  },
  theRelic: {
    name: 'the Relic', glyph: '*', color: 'notable', victory: true,
    flavour: 'You came a long way for this.',
    lore: 'Nine crusades were called for this. The songs are longer than it '
      + 'is. You are the one holding it now, and it is still not clear what '
      + 'it is for.',
  },
};

/** Floor-spawnable only: sacred gear and seals are placed by bosses. */
export function itemTable(depth) {
  return Object.entries(ITEMS)
    .filter(([, item]) => item.weight && !item.bossOnly && depth >= item.minDepth)
    .map(([key, item]) => ({ key, ...item }));
}

export const SLOTS = ['weapon', 'shield', 'armour'];

// ---------------------------------------------------------------------------
// MERGING
//
// Carry two of anything and they can be pressed into one lasting advantage.
// Every boon is a *derived* stat -- power, defense, speed, or how fast wounds
// close -- and never a change to a base stat. That is deliberate: base stats
// are what the memorial records and what a revenant is rebuilt from, so a
// crusader's merges die with them and can never come back wearing their face.
// ---------------------------------------------------------------------------
const MERGE_BOONS = {
  weapon: { stat: 'power', amount: 1, text: 'the hand remembers the weight' },
  shield: { stat: 'defense', amount: 1, text: 'you flinch a little later' },
  armour: { stat: 'defense', amount: 1, text: 'the fit is better than it was' },
  heal: { stat: 'regen', amount: 4, text: 'wounds close quicker than they did' },
  smite: { stat: 'power', amount: 1, text: 'the note stays in your hands' },
  ward: { stat: 'defense', amount: 1, text: 'the psalm no longer needs singing' },
  blink: { stat: 'speed', amount: 5, text: 'the floor lets go of you sooner' },
};

/** What pressing two of this item together leaves you with, or null. */
export function mergeBoon(spec) {
  if (!spec || spec.seal || spec.victory) return null;
  if (spec.equip) return MERGE_BOONS[spec.equip.slot] ?? null;
  if (spec.use) return MERGE_BOONS[spec.use.kind] ?? null;
  return null;
}

export const MERGE_LABEL = {
  power: 'power', defense: 'defense', speed: 'speed', regen: 'recovery',
};

/** Short label shown beside the item's name in the pack. */
export function itemCategory(spec) {
  if (spec.seal) return 'seal';
  if (spec.victory) return 'relic';
  if (spec.use) return 'relic';
  if (spec.equip?.ranged) return 'ranged';
  return spec.equip?.slot ?? 'item';
}

/**
 * Everything the hover panel needs, derived from the data rather than written
 * twice: retuning a number in this file updates what the game says about it.
 */
export function describeItem(spec, instance = null) {
  const effects = [];
  const equip = spec.equip;

  if (equip) {
    if (equip.ranged) {
      const r = equip.ranged;
      effects.push('Shoots to ' + r.range + ' tiles for ' + r.power + ' damage');
      effects.push('Reloads for ' + r.reload + ' turn' + (r.reload === 1 ? '' : 's') + ' after firing');
      effects.push(equip.power + ' power in melee — it is not a sword');
    } else if (equip.power) {
      effects.push('+' + equip.power + ' power');
    }
    if (equip.defense) effects.push('+' + equip.defense + ' defense');
    if (equip.speed) {
      effects.push((equip.speed > 0 ? '+' : '') + equip.speed + ' speed'
        + (equip.speed < 0 ? ' — heavier things cost you turns' : ' — lighter than nothing'));
    }
    effects.push('Worn in the ' + equip.slot + ' slot');
  }

  const use = spec.use;
  if (use) {
    if (use.kind === 'heal') effects.push('Restores ' + use.amount + ' hit points');
    if (use.kind === 'smite') effects.push('Strikes the nearest thing you can see within ' + use.range + ' tiles for ' + use.amount);
    if (use.kind === 'ward') effects.push('+' + use.amount + ' defense for ' + use.turns + ' turns');
    if (use.kind === 'blink') effects.push('Moves you somewhere else on this floor');
    effects.push('Spent on use');
  }

  if (use?.attune) {
    effects.push('Grows stronger the longer it goes unused: +1 every '
      + use.attune.per + ' turns carried, up to +' + use.attune.max);
  }
  if (use?.echo) effects.push('Sounds a second time, ' + use.echo + ' turns later');

  if (spec.seal) effects.push('Opens this region\'s gate. Kept, never spent, and never takes pack space');
  if (spec.victory) effects.push('Ends the crusade the moment you pick it up');

  if (spec.trait === 'reach') {
    effects.push('Strikes at two tiles, and at ' + CLINCH_PENALTY
      + ' less power against anything already adjacent');
  }

  const trait = spec.trait ? TRAITS[spec.trait] : null;
  const heirloom = instance?.heirloom ?? null;

  return {
    name: spec.name,
    category: itemCategory(spec),
    rarity: spec.rarity ?? null,
    trait: trait ? { label: trait.label, text: trait.text } : null,
    heirloom: heirloom
      ? { bonus: heirloomBonus(heirloom), label: heirloomLabel(heirloom) }
      : null,
    effects,
    lore: spec.lore ?? spec.flavour ?? '',
  };
}
