// Named special behaviours a piece of gear can carry. The data here is only
// the reader-facing half -- what each trait *does* lives in game/, and the
// briefs in the pack are generated from these strings so a trait can never be
// described in the UI without being implemented.
export const TRAITS = {
  cleave: {
    label: 'Cleave',
    text: 'Every swing hits everything next to you',
  },
  reach: {
    label: 'Reach',
    text: 'Strikes two tiles away — but unwieldy in a clinch, and weaker for it',
  },
  pierce: {
    label: 'Piercing',
    text: 'The bolt runs on through everything in its line',
  },
  block: {
    label: 'Block',
    text: 'Stops one blow outright, then needs a few turns to come back up',
  },
  riposte: {
    label: 'Riposte',
    text: 'A blow it turns aside completely is answered for free',
  },
  sanctuary: {
    label: 'Sanctuary',
    text: 'Hardens while you hold your ground, and forgets the moment you move',
  },
};

/**
 * A polearm's price. Reach lets you strike everything as it approaches, which
 * measured out at more than every other trait combined -- the balance harness
 * put it at thirty-four points of win rate on its own. Being poor once
 * something is actually on top of you is what pays for it, and gives melee
 * monsters a reason to close.
 */
export const CLINCH_PENALTY = 3;

/** A riposte answers at half strength: a counter, not a second sword. */
export const RIPOSTE_SHARE = 0.5;

/** How many turns a shield needs before it can stop another blow outright. */
export const BLOCK_RECOVERY = 6;

/** Sanctuary: one point of defense per this many turns held, up to the cap. */
export const SANCTUARY_EVERY = 2;
export const SANCTUARY_MAX = 4;

// -- Heirlooms ---------------------------------------------------------------
//
// Gear taken off your own revenant remembers who carried it. The bonus scales
// with how deep that crusader got, so reclaiming a piece from a predecessor who
// died at the bottom of the dungeon is worth considerably more than one who
// fell in the Reliquary.
export const HEIRLOOM_MAX = 4;

export function heirloomBonus(heirloom) {
  if (!heirloom) return 0;
  return Math.max(1, Math.min(HEIRLOOM_MAX, Math.floor(heirloom.deepest / 3)));
}

export function heirloomLabel(heirloom) {
  if (!heirloom) return '';
  const carried = heirloom.marks > 1 ? heirloom.marks + ' crusaders' : heirloom.of;
  return 'Carried by ' + carried + ', as deep as ' + heirloom.deepest;
}
