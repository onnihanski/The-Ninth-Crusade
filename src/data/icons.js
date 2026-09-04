// ---------------------------------------------------------------------------
// Creature icons.
//
// Drawn as single-colour silhouettes in unit space, filled with whatever colour
// the renderer has already worked out for that entity. That is the whole reason
// they are shapes rather than sprites: a fixed-colour bitmap could not fade
// along the torch ramp or take a region's tint, and would sit at full
// brightness while the floor around it went dark.
//
// There are only four monster colours, so *silhouette* has to carry identity.
// The set is built around that: low four-legged things, upright figures told
// apart by what they hold, wide winged things, and bosses that are simply
// bigger and carry an emblem. At sixteen pixels a shape gets three or four
// marks before it turns to mud, so none of these use more.
// ---------------------------------------------------------------------------

const head = (p, cx = 0.42, cy = 0.21, r = 0.125) => p.dot(cx, cy, r);

/** The standard upright body: shoulders down to a hem. */
const robe = (p, cx = 0.42, top = 0.35) => p.poly([
  [cx - 0.16, top], [cx + 0.16, top], [cx + 0.21, 0.96], [cx - 0.21, 0.96],
]);

/** A heavier, broader body, for things that are hard to move. */
const bulk = (p, cx = 0.46, top = 0.34) => p.poly([
  [cx - 0.26, top], [cx + 0.26, top], [cx + 0.3, 0.96], [cx - 0.3, 0.96],
]);

export const ICONS = {
  // -- the crusader and what becomes of them ---------------------------------
  player: (p) => {
    head(p);
    robe(p);
    p.line([[0.5, 0.52], [0.78, 0.52]], 0.07);        // arm to the blade
    p.line([[0.82, 0.16], [0.82, 0.78]], 0.09);       // sword, held upright
    p.line([[0.7, 0.34], [0.94, 0.34]], 0.07);        // crossguard
  },
  // The same figure with nothing inside it. Meeting yourself should read as
  // recognition before it reads as a monster.
  revenant: (p) => {
    p.ring(0.42, 0.21, 0.125, 0.07);
    p.line([[0.26, 0.35], [0.21, 0.96]], 0.07);
    p.line([[0.58, 0.35], [0.63, 0.96]], 0.07);
    p.line([[0.26, 0.35], [0.58, 0.35]], 0.07);
    p.line([[0.82, 0.2], [0.82, 0.78]], 0.07);
  },
  corpse: (p) => {
    p.poly([[0.1, 0.78], [0.34, 0.62], [0.68, 0.62], [0.9, 0.78], [0.9, 0.88], [0.1, 0.88]]);
  },

  // -- The Siege Yards -------------------------------------------------------
  campDog: (p) => {
    p.poly([[0.16, 0.5], [0.7, 0.5], [0.7, 0.74], [0.16, 0.74]]);   // low body
    p.poly([[0.66, 0.36], [0.94, 0.36], [0.94, 0.58], [0.66, 0.58]]); // head, thrust forward
    p.line([[0.24, 0.74], [0.24, 0.96]], 0.09);
    p.line([[0.62, 0.74], [0.62, 0.96]], 0.09);
    p.line([[0.16, 0.5], [0.04, 0.3]], 0.08);                        // tail
  },
  deserter: (p) => {
    p.poly([[0.3, 0.3], [0.42, 0.1], [0.54, 0.3]]);                  // hood
    robe(p);
    p.rect(0.6, 0.42, 0.2, 0.26);                                    // the pack he took
  },
  flagellant: (p) => {
    head(p);
    robe(p);
    p.arc(0.6, 0.28, 0.3, Math.PI * 1.1, Math.PI * 1.9, 0.07);       // the scourge, mid-swing
  },
  crossbowman: (p) => {
    head(p);
    robe(p);
    p.line([[0.14, 0.5], [0.86, 0.5]], 0.1);                         // the stave, held level
    p.line([[0.5, 0.4], [0.5, 0.66]], 0.07);
  },
  herald: (p) => {
    p.poly([[0.26, 0.3], [0.4, 0.12], [0.54, 0.3]]);                 // helm
    bulk(p, 0.4);                                                    // very good armour
    p.line([[0.82, 0.06], [0.82, 0.96]], 0.07);                      // the pole
    p.poly([[0.82, 0.1], [0.99, 0.2], [0.82, 0.34]]);                // and the roll on it
  },

  // -- The Reliquary ---------------------------------------------------------
  bonepicker: (p) => {
    p.dot(0.36, 0.28, 0.12);
    p.line([[0.44, 0.28], [0.78, 0.36]], 0.07);                      // the beak
    p.poly([[0.22, 0.4], [0.5, 0.4], [0.58, 0.96], [0.16, 0.96]]);   // hunched
  },
  reliquaryMoth: (p) => {
    p.poly([[0.5, 0.5], [0.06, 0.26], [0.1, 0.7]]);                  // wings, wide and low
    p.poly([[0.5, 0.5], [0.94, 0.26], [0.9, 0.7]]);
    p.dot(0.5, 0.52, 0.11);
    p.line([[0.46, 0.36], [0.36, 0.18]], 0.05);                      // antennae
    p.line([[0.54, 0.36], [0.64, 0.18]], 0.05);
  },
  ossuaryWarden: (p) => {
    p.rect(0.3, 0.1, 0.36, 0.2);                                     // flat helm
    bulk(p, 0.48, 0.32);
    p.line([[0.2, 0.5], [0.76, 0.5]], 0.08);                         // the bar across it
  },
  boneSlinger: (p) => {
    head(p, 0.38);
    robe(p, 0.38);
    p.arc(0.72, 0.42, 0.24, Math.PI * 0.6, Math.PI * 1.7, 0.06);     // the sling, wound up
    p.dot(0.9, 0.3, 0.08);                                           // and what is in it
  },
  saintPerpetua: (p) => {
    p.ring(0.44, 0.18, 0.2, 0.055);                                  // halo
    p.dot(0.44, 0.24, 0.12);
    p.poly([[0.2, 0.38], [0.68, 0.38], [0.8, 0.96], [0.08, 0.96]]);  // shroud, still on her
  },
  // What gets up. The halo is broken, the shroud has come off one shoulder, and
  // she is standing a good deal straighter than a saint who has just been
  // killed ought to. You are meant to be able to see, across the room and
  // without reading the log, that this is not the fight you just won.
  saintPerpetuaRisen: (p) => {
    p.arc(0.44, 0.18, 0.2, Math.PI * 0.15, Math.PI * 1.5, 0.055);    // halo, cracked open
    p.dot(0.44, 0.24, 0.12);
    p.poly([[0.24, 0.38], [0.72, 0.44], [0.84, 0.96], [0.06, 0.96]]); // shroud, slipped
    p.line([[0.72, 0.5], [0.94, 0.32]], 0.07);                       // and an arm out of it
  },

  // -- The Choir -------------------------------------------------------------
  chorister: (p) => {
    p.poly([[0.3, 0.3], [0.44, 0.1], [0.58, 0.3]]);                  // cowl
    robe(p, 0.44);
    // The book has to reach past the shoulders or the robe swallows it.
    p.rect(0.1, 0.54, 0.68, 0.15);
    p.line([[0.44, 0.5], [0.44, 0.73]], 0.05);                       // its spine
  },
  censerbearer: (p) => {
    head(p, 0.38);
    robe(p, 0.38);
    p.line([[0.56, 0.36], [0.84, 0.52]], 0.05);                      // the chain
    p.dot(0.86, 0.62, 0.13);                                         // the censer, swinging
  },
  wingedThing: (p) => {
    p.poly([[0.5, 0.18], [0.02, 0.06], [0.24, 0.5]]);                // wings, up and angular
    p.poly([[0.5, 0.18], [0.98, 0.06], [0.76, 0.5]]);
    p.poly([[0.38, 0.24], [0.62, 0.24], [0.56, 0.94], [0.44, 0.94]]);
  },
  psalmist: (p) => {
    head(p, 0.34);
    robe(p, 0.34);
    p.arc(0.42, 0.3, 0.26, Math.PI * 1.75, Math.PI * 0.25, 0.055);   // a held note, carrying
    p.arc(0.42, 0.3, 0.42, Math.PI * 1.8, Math.PI * 0.2, 0.05);
  },
  odoThePrecentor: (p) => {
    p.dot(0.36, 0.2, 0.13);
    p.poly([[0.14, 0.34], [0.58, 0.34], [0.66, 0.96], [0.06, 0.96]]);
    p.line([[0.58, 0.4], [0.72, 0.18]], 0.07);                       // the hand that leads it
    p.arc(0.5, 0.3, 0.44, Math.PI * 1.7, Math.PI * 0.3, 0.055);
    p.arc(0.5, 0.3, 0.62, Math.PI * 1.75, Math.PI * 0.25, 0.05);
  },

  // -- The Empty Tomb --------------------------------------------------------
  graveWraith: (p) => {
    p.poly([                                                         // no feet, a torn hem
      [0.5, 0.06], [0.78, 0.3], [0.82, 0.8],
      [0.66, 0.68], [0.5, 0.9], [0.34, 0.68], [0.18, 0.8], [0.22, 0.3],
    ]);
  },
  pilgrimHusk: (p) => {
    p.ring(0.4, 0.22, 0.13, 0.06);                                   // hollow, where a face was
    robe(p, 0.4);
    p.line([[0.78, 0.14], [0.78, 0.96]], 0.06);                      // the staff, still walking
  },
  sepulchreWorm: (p) => {
    p.line([[0.08, 0.86], [0.3, 0.62], [0.56, 0.84], [0.8, 0.56], [0.86, 0.34]], 0.16);
    p.dot(0.86, 0.28, 0.12);                                         // the end that bites
  },
  mourner: (p) => {
    p.dot(0.44, 0.15, 0.11);                                         // bowed head
    p.poly([[0.44, 0.24], [0.86, 0.96], [0.02, 0.96]]);              // veiled to the floor
  },
  baudouin: (p) => {
    p.poly([[0.26, 0.3], [0.4, 0.1], [0.54, 0.3]]);                  // a crusader's helm
    bulk(p, 0.4);
    p.line([[0.4, 0.42], [0.4, 0.84]], 0.08);                        // the cross he came under
    p.line([[0.24, 0.56], [0.56, 0.56]], 0.08);
    p.line([[0.84, 0.14], [0.84, 0.9]], 0.08);                       // and the sword he stayed with
  },

  // -- What is lying on the floor -------------------------------------------
  //
  // One icon per *kind* rather than per item: twenty-nine distinct shapes would
  // be indistinguishable at this size, and the pack panel is where an item's
  // real identity lives. These only have to answer "is that worth walking to".
  itemPhial: (p) => {
    p.rect(0.42, 0.16, 0.16, 0.16);                                  // neck
    p.poly([[0.3, 0.34], [0.7, 0.34], [0.78, 0.82], [0.22, 0.82]]);  // and what is in it
  },
  itemSpark: (p) => {
    p.poly([[0.5, 0.04], [0.6, 0.4], [0.96, 0.5], [0.6, 0.6], [0.5, 0.96],
      [0.4, 0.6], [0.04, 0.5], [0.4, 0.4]]);
  },
  itemWard: (p) => {
    p.rect(0.14, 0.34, 0.72, 0.32);                                  // a rolled psalm
    p.ring(0.2, 0.5, 0.16, 0.08);
    p.ring(0.8, 0.5, 0.16, 0.08);
  },
  itemStep: (p) => {
    p.line([[0.2, 0.26], [0.56, 0.5], [0.2, 0.74]], 0.11);           // going, gone
    p.line([[0.56, 0.26], [0.9, 0.5], [0.56, 0.74]], 0.11);
  },
  itemSword: (p) => {
    p.line([[0.22, 0.84], [0.82, 0.2]], 0.11);                       // blade
    p.line([[0.56, 0.2], [0.84, 0.48]], 0.09);                       // crossguard
    p.dot(0.2, 0.86, 0.09);                                          // pommel
  },
  itemBow: (p) => {
    p.line([[0.2, 0.16], [0.2, 0.84]], 0.1);                         // the limb
    p.line([[0.14, 0.5], [0.9, 0.5]], 0.11);                         // the stock
    p.dot(0.86, 0.5, 0.1);
  },
  itemShield: (p) => {
    p.poly([[0.2, 0.14], [0.8, 0.14], [0.8, 0.54], [0.5, 0.9], [0.2, 0.54]]);
  },
  itemArmour: (p) => {
    p.poly([[0.28, 0.2], [0.42, 0.2], [0.5, 0.32], [0.58, 0.2], [0.72, 0.2],
      [0.84, 0.86], [0.16, 0.86]]);
  },
  itemSeal: (p) => {
    p.ring(0.5, 0.5, 0.36, 0.13);
    p.line([[0.5, 0.26], [0.5, 0.74]], 0.1);
    p.line([[0.32, 0.5], [0.68, 0.5]], 0.1);
  },
  itemRelic: (p) => {
    p.poly([[0.5, 0.02], [0.58, 0.38], [0.96, 0.5], [0.58, 0.62], [0.5, 0.98],
      [0.42, 0.62], [0.04, 0.5], [0.42, 0.38]]);
    p.ring(0.5, 0.5, 0.2, 0.07);                                     // whatever it is
  },
};

export const ICON_KEYS = Object.keys(ICONS);

// ---------------------------------------------------------------------------
// Terrain that is an object rather than ground.
//
// Doors, barred doors and sealed gates were the last things on the map still
// drawn as punctuation, which made the three tiles a crusader actually has to
// make a decision about look like syntax in the middle of a drawn room. Same
// unit space, same single colour, same rule about how many marks a shape can
// afford: these are read at a glance or not at all.
//
// The three of them are deliberately a family, and a single colour gives you
// exactly one lever to tell them apart with: hollow against solid. A door is an
// arch you can see the room through; the barred door is that arch with beams
// across it; the gate is a grating, and looks like nothing else on the map.
// ---------------------------------------------------------------------------

// A pointed arch, traced from one foot up over the crown and down to the other.
// Left open at the floor, because that is the part you walk through.
const ARCH = [[0.25, 0.96], [0.25, 0.46], [0.5, 0.17], [0.75, 0.46], [0.75, 0.96]];

export const TILE_ICONS = {
  // Hollow: you can see the room through it, and you can walk through it.
  door: (p) => p.line(ARCH, 0.1),

  // The same arch, barred. Two beams rather than one: a single beam across a
  // pointed arch is the letter A, which is precisely the thing this game took
  // off the map in the first place. Two is a barred door and reads as nothing
  // else.
  doorLocked: (p) => {
    p.line(ARCH, 0.1);
    p.rect(0.2, 0.52, 0.6, 0.11);
    p.rect(0.2, 0.74, 0.6, 0.11);
  },

  // Not an arch at all. A portcullis is a grating, and a grating is the one
  // shape that survives being sixteen pixels wide: two rails, three bars, and
  // the seal set where they cross.
  sealedGate: (p) => {
    p.line([[0.12, 0.28], [0.88, 0.28]], 0.09);
    p.line([[0.12, 0.74], [0.88, 0.74]], 0.09);
    p.line([[0.3, 0.12], [0.3, 0.9]], 0.08);
    p.line([[0.5, 0.12], [0.5, 0.9]], 0.08);
    p.line([[0.7, 0.12], [0.7, 0.9]], 0.08);
    p.dot(0.5, 0.51, 0.14);
  },
};

export const TILE_ICON_KEYS = Object.keys(TILE_ICONS);
