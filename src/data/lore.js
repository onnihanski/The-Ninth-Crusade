// ---------------------------------------------------------------------------
// THE STORY OF THE FIRST CRUSADER
//
// Told in three chapters, one at each sealed gate, and finished at the bottom.
//
// The chapters are deliberately incomplete rather than misleading: everything
// they say about Sir Baudouin is true, and none of it is the point. The reveal
// works because the crusade's own records are admiring, and because a reader
// who is paying attention can feel the shape of what is missing without being
// told. Nothing before `reveal` may hint at what he became.
// ---------------------------------------------------------------------------
export const FIRST_CRUSADER = 'Sir Baudouin IX the Unreturned';

export const GATE_CHAPTERS = {
  // Keyed by region, shown the first time that region's gate comes into view.
  siegeYards: {
    title: 'The First Descent',
    lines: [
      'Sir Baudouin IX went down before the crusade had a number, a banner, or a '
      + 'reason it could write down. He took a sword, a lamp, and orders that no '
      + 'longer exist.',
      'The gate below this one was standing open when he reached it. Nobody has '
      + 'found it open since.',
    ],
  },
  reliquary: {
    title: 'What He Sent Up',
    lines: [
      'For eleven weeks he sent things up. A map. A list of the dead, in a good '
      + 'hand. A request for more lamp oil. One line about the singing, which the '
      + 'Reliquary filed under acoustics.',
      'Then the notes stopped, and the crusade sent a second man down to find out '
      + 'why. That was the second crusade. This is the ninth.',
    ],
  },
  choir: {
    title: 'The Last Note',
    lines: [
      'The last thing Sir Baudouin sent up was not written. A chorister carried '
      + 'it, and delivered it exactly, and would not say it twice:',
      '"Do not send the others. I am close."',
      'The crusade read this as encouragement, and sent six more.',
    ],
  },
};

/** Shown when you finally meet him. This is the only place the truth is told. */
export const REVEAL = {
  title: 'The Ninth Crusader',
  lines: [
    'He is still here. Still close. He has been down here longer than the church '
    + 'above him has stood, and he did not spend that time looking for the Relic.',
    'He spent it waiting for the second man, and the third, and the eighth. Every '
    + 'crusade the first one caused. He knows your name — he has known it since '
    + 'the Siege Yards, because he is the one who wrote it on the roll.',
    'He is not going to explain. He has been rehearsing this for nine crusades '
    + 'and he is only going to get one attempt at it.',
  ],
};

// ---------------------------------------------------------------------------
// BOSS LORE
//
// One panel each, the first time you lay eyes on them. Every entry states, in
// fiction, exactly what the thing is about to do to you -- the mechanic is
// never a surprise, only the fight is.
// ---------------------------------------------------------------------------
export const BOSS_LORE = {
  herald: {
    title: 'the Herald of the Third Wall',
    lines: [
      'The Third Wall fell forty years ago and took the register with it. He has '
      + 'kept the roll from memory ever since: every name that went down, and the '
      + 'considerably shorter list of names that came back up.',
      'He reads them aloud when he wants company. They are still down here, and '
      + 'they still answer to their names.',
    ],
    mechanic: 'He calls the roll. Names answer.',
  },
  saintPerpetua: {
    title: 'Saint Perpetua the Patient',
    lines: [
      'Martyred once, catalogued twice, and interred in a box that has been opened '
      + 'more often than it has been closed. Her patience was not a virtue the '
      + 'Reliquary awarded her. It was an observation.',
      'She has never once been in a hurry to stay dead.',
    ],
    mechanic: 'Killing her is the first half of it.',
  },
  odoThePrecentor: {
    title: 'Odo the Precentor',
    lines: [
      'He led the singing here when there was still a service to lead, and he has '
      + 'not stood down. The Choir follows him because he has never paused long '
      + 'enough to let them stop.',
      'Distance is not something that happens to a voice in a room built to carry '
      + 'one.',
    ],
    mechanic: 'He reaches you wherever he can be heard.',
  },
  baudouin: {
    title: FIRST_CRUSADER,
    lines: REVEAL.lines,
    mechanic: 'He fights the way you fight. He has had practice.',
  },
};
