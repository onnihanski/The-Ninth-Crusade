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

| Action     | Keys                              |
|------------|-----------------------------------|
| Move       | arrows, `hjkl` + `yubn`, numpad   |
| Wait       | `.` or `5`                        |
| Pick up    | `g`                               |
| Use relic  | `1`–`9`                           |
| Descend    | `>` while standing on `>`         |
| Restart    | `r`                               |

Walk into something to attack it. Find the way down. On a boss floor the way
down is a `=`, and it does not open for anything except the seal the boss is
carrying.

Seals are kept, not spent. Relics are spent: a **reliquary phial** heals, a
**spark of the choir** smites the nearest thing you can see, a **psalm of ward**
makes you harder to reach for a while, and a **step of the absent** puts you
somewhere else entirely.

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
    status.js      timed statuses (wards)
    memorial.js    THE DUNGEON REMEMBERS -- persistence across runs
  ui/        browser layer
    render.js      canvas glyph renderer
    input.js       key bindings
    panel.js       stats, seals, pack, message log
  data/      >>> the theme seam <<<
    theme.js       palette, flavour strings, tone
    regions.js     the four regions and their bosses
    monsters.js    monster roster
    items.js       relics and seals
    names.js       crusader name generation
tools/build.mjs    inlines everything into one dist/index.html
tests/smoke.mjs    42 assertions, including a full run to depth 12
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
- **Progression** — XP, equipment, and a reason to take the long way round
- **Bosses with mechanics** — right now they are large monsters; they should
  each break one rule of the game

## Playable build

`node tools/build.mjs` writes two files:

- `dist/index.html` — the whole game in one self-contained file; open it directly
- `dist/embed.html` — the same, without the document wrapper, for hosts that
  supply their own `<head>`
