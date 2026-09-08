// Four regions, three floors each, a boss holding a seal at the bottom of every
// one. The seal is the whole progression spine: the way down is a gate, and the
// gate opens for exactly one thing.
//
// Each region retints the palette and swaps the monster pool, so descending
// feels like arriving somewhere rather than incrementing a counter.
export const REGIONS = [
  {
    key: 'siegeYards',
    name: 'The Siege Yards',
    arrival: 'Mud, and the smell of other people\'s campfires. The war was here recently and did not enjoy itself.',
    depths: [1, 3],
    monsters: ['campDog', 'deserter', 'flagellant', 'crossbowman'],
    boss: 'herald',
    palette: { wall: '#6a6156', floor: '#8b8071' },
  },
  {
    key: 'reliquary',
    name: 'The Reliquary',
    arrival: 'Shelves of saints, filed by which part of them survived. Someone kept excellent records and then stopped.',
    depths: [4, 6],
    monsters: ['bonepicker', 'reliquaryMoth', 'ossuaryWarden', 'boneSlinger'],
    boss: 'saintPerpetua',
    palette: { wall: '#5f5a63', floor: '#847d86' },
  },
  {
    key: 'choir',
    name: 'The Choir',
    arrival: 'The singing has been going on longer than the building. You try not to learn the words.',
    depths: [7, 9],
    monsters: ['chorister', 'censerbearer', 'wingedThing', 'psalmist'],
    boss: 'odoThePrecentor',
    palette: { wall: '#4d5a6b', floor: '#6f8199' },
  },
  {
    key: 'emptyTomb',
    name: 'The Empty Tomb',
    arrival: 'It is empty in the way a held breath is empty. You are, at last, expected.',
    depths: [10, 12],
    monsters: ['graveWraith', 'pilgrimHusk', 'sepulchreWorm', 'mourner'],
    boss: 'baudouin',
    final: true,
    // The dead here fight the way you fight. Baudouin is the only late enemy
    // that ever worked, and this is the reason -- his power is a function of
    // yours. His region now shares it: see mirrorToPlayer in game/status.js.
    remembers: true,
    palette: { wall: '#3f3a44', floor: '#5c5563' },
  },
];

export function regionForDepth(depth) {
  return REGIONS.find((r) => depth >= r.depths[0] && depth <= r.depths[1])
    ?? REGIONS[REGIONS.length - 1];
}

export function isBossDepth(depth) {
  const region = regionForDepth(depth);
  return depth === region.depths[1];
}

export const MAX_DEPTH = REGIONS[REGIONS.length - 1].depths[1];
