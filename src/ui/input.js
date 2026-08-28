// Key bindings -> intents.
//
// WASD for the cardinals, QEZC for the diagonals. The diagonals are not
// optional garnish: monsters move and attack on all eight directions, so a
// player limited to four would be flanked with no way to answer. The numpad
// and arrow keys stay bound for people who reach for them.
const MOVES = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

// Numpad only -- the digit row is inventory slots.
const NUMPAD_MOVES = {
  8: [0, -1], 2: [0, 1], 4: [-1, 0], 6: [1, 0],
  7: [-1, -1], 9: [1, -1], 1: [-1, 1], 3: [1, 1],
};

export function keyToIntent(event) {
  const raw = event.key;
  const key = raw.length === 1 ? raw.toLowerCase() : raw;
  const fromNumpad = event.code.startsWith('Numpad');

  if (fromNumpad) {
    if (NUMPAD_MOVES[key]) return { type: 'move', dx: NUMPAD_MOVES[key][0], dy: NUMPAD_MOVES[key][1] };
    if (key === '5') return { type: 'wait' };
  }

  if (MOVES[key]) return { type: 'move', dx: MOVES[key][0], dy: MOVES[key][1] };

  if (/^[1-9]$/.test(key)) return { type: 'use', index: Number(key) - 1 };
  if (key === ' ' || key === '.') return { type: 'wait' };
  if (key === 'g' || key === ',') return { type: 'pickup' };
  if (key === 'x') return { type: 'drop' };
  if (key === 'm') return { type: 'merge' };
  if (key === 'f') return { type: 'fire' };
  if (key === 'n') return { type: 'rename' };
  if (raw === '>') return { type: 'descend' };
  if (key === 'r') return { type: 'restart' };
  return null;
}

export const HELP = [
  ['move', 'W A S D'],
  ['diagonals', 'Q E Z C'],
  ['wait', 'space'],
  ['fire', 'f'],
  ['take', 'g'],
  ['use / wear', '1-9'],
  ['drop', 'x then 1-9'],
  ['merge', 'm'],
  ['descend', '>'],
  ['name', 'n'],
  ['dev menu', '0'],
  ['restart', 'r'],
];
