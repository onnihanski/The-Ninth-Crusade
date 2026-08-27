// Crusader names. Generated from the run seed, so a given run always produces
// the same crusader -- which matters once that crusader is dead and the next
// run has to meet them again by name.
const TITLES = ['Brother', 'Sister', 'Pilgrim', 'Knight', 'Adept', 'Sibling'];

const NAMES = [
  'Aldric', 'Bertran', 'Casimir', 'Domitia', 'Eudoxia', 'Fulk', 'Gisela',
  'Hedwig', 'Ives', 'Jocelyn', 'Konrad', 'Leofric', 'Mahaut', 'Norbert',
  'Odilia', 'Peregrine', 'Quenilda', 'Raimund', 'Sibylla', 'Tancred',
  'Ulric', 'Verena', 'Waleran', 'Ysabeau',
];

const EPITHETS = [
  'of the Third Wall', 'the Unshriven', 'of Little Faith', 'the Punctual',
  'who was warned', 'of the Wet March', 'the Twice-Blessed', 'the Reluctant',
  'of no fixed parish', 'the Well-Meaning', 'who read the map wrong',
  'the Last to Volunteer', 'of the Broken Censer', 'the Merely Devout',
];

export function crusaderName(rng) {
  return rng.pick(TITLES) + ' ' + rng.pick(NAMES) + ' ' + rng.pick(EPITHETS);
}

const ORDINALS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth',
  'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth',
];

const ROMAN = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

/** A player who names themselves gets a numeral, not a duplicate. */
export function roman(n) {
  let left = Math.max(1, Math.floor(n));
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (left >= value) {
      out += numeral;
      left -= value;
    }
  }
  return out;
}

export function ordinal(n) {
  return ORDINALS[n - 1] ?? String(n) + 'th';
}
