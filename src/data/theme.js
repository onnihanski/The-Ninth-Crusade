// ---------------------------------------------------------------------------
// THE THEME SEAM
//
// Everything that decides what this game *feels* like lives in this file plus
// monsters.js and items.js. Palette, glyphs, flavour text, the name on the tin.
// Re-theming the game should never require touching engine/, world/ or game/.
//
// What is here now is a deliberately generic placeholder dungeon.
// ---------------------------------------------------------------------------
export const THEME = {
  name: 'Untitled Roguelike',
  tagline: 'a placeholder dungeon, awaiting a theme',

  font: '16px "DejaVu Sans Mono", "SF Mono", Menlo, Consolas, monospace',
  cell: { w: 14, h: 20 },
  fovRadius: 8,

  colors: {
    bg: '#0a0c11',
    wall: '#6b7280',
    floor: '#8b93a1',
    stairsDown: '#e9c46a',

    player: '#f2f4f8',
    monsterWeak: '#8fbf6f',
    monsterTough: '#d96b5c',
    corpse: '#6b4a52',
    item: '#7fb3d5',

    text: '#c9d0dc',
    textDim: '#6d7688',
    good: '#8fbf6f',
    bad: '#d96b5c',
    notable: '#e9c46a',
  },

  // Flavour strings, kept out of the logic so they can be rewritten wholesale.
  strings: {
    welcome: 'You descend into the dungeon. Something down here is worth the trip.',
    descend: (depth) => 'You take the stairs down to depth ' + depth + '.',
    noStairs: 'There are no stairs here.',
    death: 'You die. Press [r] to begin again.',
    floorLabel: 'Depth',
  },
};
