// ---------------------------------------------------------------------------
// THE THEME SEAM
//
// Tone: deadpan and mythic at once. The prose is sparse, second-person and
// slightly too calm about what is happening. The comedy is never a joke told
// by the game -- it is the gap between the enormity of the crusade and the
// bureaucratic indifference with which it treats the crusader.
//
// Rule of thumb for new strings: say the smallest true thing, and do not
// explain it.
// ---------------------------------------------------------------------------
export const THEME = {
  name: 'The Ninth Crusade',
  tagline: 'descend, unseal, be remembered',

  font: '16px "IBM Plex Mono", "DejaVu Sans Mono", "SF Mono", Menlo, Consolas, monospace',
  fontFamily: '"IBM Plex Mono", "DejaVu Sans Mono", "SF Mono", Menlo, Consolas, monospace',
  cell: { w: 14, h: 20 },
  fovRadius: 8,

  // Base palette. Regions tint this -- see data/regions.js.
  colors: {
    bg: '#0a0a0c',
    wall: '#6a6156',
    floor: '#8b8071',
    stairsDown: '#e0b25c',
    sealedGate: '#a8452f',
    altar: '#cbb27a',

    player: '#f4efe2',
    revenant: '#9a7fb8',
    monsterWeak: '#8f9a6f',
    monsterTough: '#c25a45',
    boss: '#e0b25c',
    corpse: '#5c4340',
    item: '#7fa8c9',
    // Rarity reads as colour before it reads as numbers.
    gearCommon: '#9a8f7a',
    gearUncommon: '#6f9fc4',
    gearRare: '#a888d4',
    gearSacred: '#e0b25c',
    gear: '#b9a06a',
    xp: '#8fbf6f',
    seal: '#e0b25c',

    text: '#cfc7b8',
    textDim: '#75705f',
    good: '#8fbf6f',
    bad: '#c25a45',
    notable: '#e0b25c',
    mythic: '#b49ad6',
  },

  strings: {
    death: 'You die. The crusade files you under martyr and continues without you.',
    levelUp: [
      'Something in you hardens.',
      'You have done this enough times to be good at it.',
      'The crusade notes your progress and revises its expectations.',
      'You stop flinching first.',
      'Whatever this is making of you, it is nearly finished.',
    ],
    noStairs: 'No way down here.',
    sealed: (boss) => 'The gate is sealed. ' + boss + ' keeps the seal.',
    unsealed: 'The seal turns. Somewhere below, a gate remembers how to open.',
    victory: 'You have it. Whatever it is. Press [r] to send the next one down.',
    floorLabel: 'Depth',
  },
};
