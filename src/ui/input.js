// Key bindings -> intents. Arrows, vi keys (hjkl + yubn for diagonals) and the
// numpad all work, because roguelike players have strong opinions about this.
const MOVES = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '8': [0, -1], '2': [0, 1], '4': [-1, 0], '6': [1, 0],
  '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
};

export function keyToIntent(event) {
  const key = event.key;

  // Digits double as inventory slots, so only treat them as movement when the
  // numpad sent them.
  const fromNumpad = event.code.startsWith('Numpad');
  if (MOVES[key] && (!/^[1-9]$/.test(key) || fromNumpad)) {
    return { type: 'move', dx: MOVES[key][0], dy: MOVES[key][1] };
  }

  if (/^[1-9]$/.test(key) && !fromNumpad) return { type: 'use', index: Number(key) - 1 };
  if (key === '.' || key === '5' || key === 's') return { type: 'wait' };
  if (key === 'g' || key === ',') return { type: 'pickup' };
  if (key === '>') return { type: 'descend' };
  if (key === 'r') return { type: 'restart' };
  return null;
}

export const HELP = [
  ['move', 'arrows / hjkl+yubn / numpad'],
  ['wait', '. or 5'],
  ['pick up', 'g'],
  ['use item', '1-9'],
  ['descend', '>'],
  ['restart', 'r'],
];
