# The Ninth Crusade

A traditional turn-based roguelike, built from scratch in vanilla JavaScript.
No dependencies, no build tooling, no framework.

You are the latest in a long line of crusaders sent down after something nobody
will describe clearly. Four regions, twelve floors, three sealed gates, and one
boss holding the seal at the bottom of each region.

**The dungeon remembers.** Every crusader who dies is written down. On later
runs they are still down there, on the floor where they fell, wearing their own
name and holding whatever they were carrying. Killing your predecessor is how
you get your relics back.

## Running it

ES modules need to be served over HTTP:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

Or build the single-file version and just open it:

```
node tools/build.mjs            # writes dist/index.html, no server needed
```

Tests are headless and dependency-free:

```
node tests/smoke.mjs
```

## Playing

| Action      | Keys                          |
|-------------|-------------------------------|
| Move        | `W` `A` `S` `D` (or arrows)     |
| Diagonals   | `Q` `E` `Z` `C` (or numpad)     |
| Wait        | space or `.`                  |
| Take        | `g`                           |
| Use / wear  | `1`–`9`                       |
| Drop        | `x` then `1`–`9`               |
| Descend     | `>` while standing on `>`     |
| Restart     | `r`                           |

Diagonals are not optional garnish. Monsters move and attack on all eight
directions, so a player limited to four would be flanked with no way to answer.

Walk into something to attack it. Find the way down. On a boss floor the way
down is a `=`, and it does not open for anything except the seal the boss is
carrying.

Seals are kept, not spent. Relics are spent: a **reliquary phial** heals, a
**spark of the choir** smites the nearest thing you can see, a **psalm of ward**
makes you harder to reach for a while, and a **step of the absent** puts you
somewhere else entirely.

## Levelling

Kills give experience; experience gives levels. Every level adds **+4 max hp**
and heals you by the same amount, **+1 power** on even levels, and **+1 defense**
every third. Each level costs a little more than the last, so a thorough
crusader reaches the Empty Tomb somewhere around level 9 or 10.

Health also comes back slowly on its own, one point every twenty turns. That
makes retreating worth doing — and it is exactly why something else wanders
onto the floor every so often. Resting is a decision, not a formality.

## Arms and armour

Three slots — one weapon, one shield, one body — and six pieces for each, in
four rarities you can read off the colour before you pick anything up:

- <b>common</b> — lying around from depth 1
- <b>uncommon</b> — the middle of the dungeon
- <b>rare</b> — deep floors only, and scarce there
- <b>sacred</b> — never spawns anywhere. A boss is carrying it.

Press the pack slot to wear or wield what is in it; whatever it displaces goes
straight back in the pack, so swapping never destroys a piece.

Nothing is a straight upgrade. The heavy things cost **speed**, and speed is
turns: ossuary plate and a martyr's greatsword nearly double your damage and
hand every monster on the floor two turns for each of yours. An ossuary buckler
gives you *back* five speed for less protection. The panel shows the numbers
your gear actually produces, green when the trade favours you and red when it
does not.

| Slot   | Common          | Uncommon                     | Rare                          | Sacred (boss) |
|--------|-----------------|------------------------------|-------------------------------|---------------|
| Weapon | arming sword +2 | pilgrim's falchion +4        | martyr's greatsword +7, −25 spd | the Herald's pollaxe +6, −5 spd |
| Shield | kite shield +1  | ossuary buckler +2, **+5 spd** | tower shield +4, −20 spd      | aegis of Saint Ambrose +4, −5 spd |
| Body   | gambeson +1     | brigandine +3, −12 spd       | sepulchre harness +5, −30 spd | vestment of the choir +5, **no weight** |

Sacred gear is the efficient kind: nearly the best numbers without the crippling
weight. It is the other reason to fight a boss, beyond the seal.

And gear closes the loop with the memorial: **you die wearing it, so your
revenant is wearing it.** A predecessor who fell in plate with a censer flail
is a genuinely dangerous thing to meet — and killing them is how you get it all
back.

## Balance

Levelling and gear feed the same stats, so the numbers cannot be tuned by eye.
`tools/balance.mjs` auto-plays the game and reports where runs end:

```
node tools/balance.mjs 250
```

It runs two policies — `clear` (fights the floor, takes the loot, then descends)
and `dive` (fights what is in the way and little else). As of the current
numbers, a thorough crusader wins about **22%** of the time, reaches a median
depth of 9 at a median level of 10, and dies on every floor of the dungeon
rather than piling up against one wall. A hurried one dies at the first boss,
every time, which is the intended lesson.

Re-run it after touching any number in `data/` or `progress.js`. It has already
caught three things that reading the code did not: fourteen monsters on depth 1,
a defense stat that outran every monster in the game, and a softlock where a
full pack made a boss floor impossible to leave.

## The dungeon

| Depths | Region           | Boss                                    |
|--------|------------------|-----------------------------------------|
| 1–3    | The Siege Yards  | the Herald of the Third Wall            |
| 4–6    | The Reliquary    | Saint Ambrose, Who Would Not Stay Buried|
| 7–9    | The Choir        | the Voice in the Vaults                 |
| 10–12  | The Empty Tomb   | What You Came For                       |

Each region retints the palette and fields its own monsters, so descending
feels like arriving somewhere rather than incrementing a counter.

## Layout

```
src/
  engine/    generic, game-agnostic building blocks
    rng.js         seeded PRNG -- all randomness flows through this
    grid.js        2D grid + direction helpers
    fov.js         recursive shadowcasting field of view
    dijkstra.js    flood-fill pathfinding maps
  world/     terrain
    tiles.js       tile definitions, including the sealed gate
    mapgen.js      rooms-and-corridors generation
    level.js       one floor: terrain, entities, visibility
  game/      rules (no DOM anywhere -- this is why it is testable)
    game.js        state, turn scheduler, regions, gates, endings
    entity.js      entities as bags of optional components
    actions.js     move, attack, take, use, descend
    combat.js      damage resolution, death, drops
    ai.js          monster behaviour
    effects.js     relic effects
    status.js      derived stats -- gear + statuses -> power, defense, speed
    progress.js    experience, levels, regeneration
    memorial.js    THE DUNGEON REMEMBERS -- persistence across runs
  ui/        browser layer
    render.js      canvas glyph renderer
    input.js       key bindings
    panel.js       stats, seals, pack, message log
  data/      >>> the theme seam <<<
    theme.js       palette, flavour strings, tone
    regions.js     the four regions and their bosses
    monsters.js    monster roster
    items.js       relics, arms, armour and seals
    names.js       crusader name generation
tools/build.mjs    inlines everything into one dist/index.html
tools/balance.mjs  auto-plays hundreds of runs and reports where they end
tests/smoke.mjs    109 assertions, including a full run to depth 12
```

### Tone

Deadpan and mythic at once. The prose is sparse, second-person, and slightly too
calm about what is happening. The comedy is never a joke the game tells — it is
the gap between the enormity of the crusade and the bureaucratic indifference
with which it treats the crusader. When writing new strings: say the smallest
true thing, and do not explain it.

### Re-theming

`src/data/` is deliberately isolated. Palette, regions, monsters, relics and
flavour text define what the game *is*, with no changes needed anywhere in
`engine/`, `world/` or `game/`.

## Where to grow it

- **Ranged and special attacks** — `ai.js` only knows how to walk up and hit
  things; crossbows, breath weapons and spellcasters all want a turn here
- **Map generation** — catacomb mazes for the Reliquary, cathedral halls for
  the Choir; `mapgen.js` is one generator where it should eventually be several
- **Deeper memorial** — graves you can pray at, predecessors who remember how
  you died, a revenant that fights the way you played
- **Progression** — equipment that does something other than add numbers
- **Bosses with mechanics** — right now they are large monsters; they should
  each break one rule of the game

## Playable build

`node tools/build.mjs` writes two files:

- `dist/index.html` — the whole game in one self-contained file; open it directly
- `dist/embed.html` — the same, without the document wrapper, for hosts that
  supply their own `<head>`
