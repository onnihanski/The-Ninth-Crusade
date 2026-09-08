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

Nobody returns to the first two floors, though. Crusaders who died in the mud
outside the walls do not come back — see [Difficulty](#difficulty).

## Playing it

**Just want to play?** Open **`dist/index.html`**. That one file is the entire
game — copy it to any machine, double-click it, and it runs. No server, no
install, no network.

If you open the `index.html` in the top folder instead, it will tell you what
happened and send you to `dist/index.html` automatically. That top-level file
loads the game from `src/` as separate ES modules, and every browser refuses to
load modules from a folder opened directly — the console says
*"Cross-Origin Request Blocked ... CORS request not http"*. Nothing is wrong
with the copy; browsers simply will not do it.

### Working on it

To edit the source and refresh, serve the folder over http:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

Then rebuild the single file whenever you want to share it:

```
node tools/build.mjs            # writes dist/index.html and dist/embed.html
```

Tests are headless and dependency-free:

```
node tests/smoke.mjs
```

There is a `package.json`, but only to say `"type": "module"` and to name the
three commands — there are no dependencies and nothing to install. `npm run
build`, `npm test` and `npm run balance` are the same three lines above. The
file is load-bearing all the same: without it Node treats every `.js` under
`src/` as CommonJS, and both the build and the tests fail to import anything.

## Playing

| Action      | Keys                          |
|-------------|-------------------------------|
| Move        | `W` `A` `S` `D` (or arrows)     |
| Diagonals   | `Q` `E` `Z` `C` (or numpad)     |
| Wait        | space or `.`                  |
| Fire        | `f`                           |
| Take        | `g`                           |
| Use / wear  | `1`–`9`                       |
| Merge two   | `m`                           |
| Drop        | `x` then `1`–`9`               |
| Descend     | `>` while standing on `>`     |
| Restart     | `r`                           |
| Dev menu    | `0`                           |

Diagonals are not optional garnish. Monsters move and attack on all eight
directions, so a player limited to four would be flanked with no way to answer.

Walk into something to attack it. Find the way down. On a boss floor the way
down is a `=`, and it does not open for anything except the seal the boss is
carrying.

Seals are kept, not spent. Relics are spent: a **reliquary phial** heals, a
**spark of the choir** smites the nearest thing you can see, a **psalm of ward**
makes you harder to reach for a while, and a **step of the absent** puts you
somewhere else entirely.

## Naming yourself

Press `n`, or click **rename** in the panel. The name sticks for future runs and
picks up a numeral — name yourself once and your successors are II, III, IV.
Whatever you choose is what the memorial records, so your revenants come back
wearing it.

## Starting out

You are issued an arming sword and a padded gambeson, 26 hit points, and no
advice. Depth 1 carries three monsters and nothing wanders onto it.

Health comes back on its own, slowly — one point every twenty turns — so
backing out of a fight and waiting is a real move, and usually the right one.
The game mentions this the first time you are badly hurt.

## Levelling

Kills give experience; experience gives levels. Every level adds **+4 max hp**
and heals you by the same amount, **+1 power** on even levels, and **+1 defense**
every third. Each level costs a little more than the last, so a thorough
crusader reaches the Empty Tomb somewhere around level 9 or 10.

Health also comes back slowly on its own, one point every twenty turns. That
makes retreating worth doing — and it is exactly why something else wanders
onto the floor every so often. Resting is a decision, not a formality.

## Shooting

Ranged weapons take the same slot as a sword and are nearly useless in it. That
is the trade: a **pilgrim's sling**, a **hunting crossbow** or an **arbalest**
hits far harder at distance and leaves you holding a stick when something
arrives. `f` shoots the nearest thing you can see in range, then the weapon
reloads for a fixed number of your turns — the panel says *loaded* or
*reloading*.

Every region fields something that shoots back, from the second floor down: a
deserter with a crossbow, a bone slinger, a psalmist, a mourner. They shoot when
loaded and **stand still while they reload**, which is what makes them
beatable — walk at them and you eat a shot or two before you arrive, and then
they are holding a crossbow in a knife fight.

Nothing that shoots appears on depth 1.

## Arms and armour

Three slots — one weapon, one shield, one body — and six pieces for each, in
four rarities you can read off the colour before you pick anything up:

- <b>common</b> — lying around from depth 1
- <b>uncommon</b> — the middle of the dungeon
- <b>rare</b> — deep floors only, and scarce there
- <b>sacred</b> — never spawns anywhere. A boss is carrying it.

Press the pack slot to wear or wield what is in it; whatever it displaces goes
straight back in the pack, so swapping never destroys a piece. Hovering anything
in the pack or the kit opens a brief: what it does, in numbers derived from the
game's own data, and where it came from.

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

## Special mechanics

Six pieces of gear carry a named trait, and two relics behave unusually. Each
is the identity of one item rather than a stat on it, and every one is
explained in the item's brief when you hover it.

| Trait | On | What it does |
|---|---|---|
| **Cleave** | martyr's greatsword | Every swing hits everything adjacent |
| **Reach** | the Herald's pollaxe | Strikes two tiles away — but unwieldy in a clinch, and weaker for it |
| **Piercing** | arbalest | The bolt runs through everything in its line, so aim down a corridor |
| **Block** | tower shield | Stops one blow outright, then needs six turns to come back up |
| **Riposte** | aegis of Saint Ambrose | A blow it turns aside completely is answered at half strength |
| **Sanctuary** | vestment of the choir | Hardens while you hold your ground; forgets it the moment you move |

**Attunement.** Relics grow while they sit unused: a phial carried two hundred
turns heals half again as much as one drunk on sight. The nine-slot pack
becomes a question of what you keep rather than what you drink immediately.

**Echo.** The spark of the choir sounds twice — once when you use it, and again
three turns later against a target it picks itself.

## Merging

Carry two of anything and `m` presses them into one permanent advantage —
weapons into power, armour into defense, phials into faster recovery. Copies
with no history are spent first, so a merge never quietly eats the heirloom you
took off a predecessor when a plain duplicate would have done.

Every boon is a *derived* stat, never a change to a base one. That is
deliberate: base stats are what the memorial records and what a revenant is
rebuilt from, so a crusader's merges die with them and can never come back
wearing their face.

### Heirlooms

Gear taken off your own revenant remembers who carried it. It gains a permanent
bonus scaled by how deep that crusader got — up to +4 on a predecessor who died
at the bottom — and the history deepens every time the piece is lost and
reclaimed. The pack shows the bonus beside the name; the brief names who carried
it and how far.

This is the memorial paying you back: your best gear becomes gear with a
provenance, and getting it back means killing the version of you that had it.

A revenant carries your old kit and gains nothing from it. It used to wear the
gear *and* benefit from it, which meant a predecessor who died in good armour
came back as a wall on floor three, long before the crusader meeting them could
field anything comparable. The kit drops with every point it ever had. It just
does not lend them any.

## Dev menu

Press <kbd>0</kbd> or <kbd>F1</kbd>.

Every system in this game sits several floors behind a random dungeon, which
makes checking any one of them by playing to it impractical. The dev menu puts
each of them one click away, and prints the derived numbers beside the base
ones — most of this game's stats are computed from four or five sources at
once, and the only honest way to check one is to see the parts next to the
total:

```
POWER     8 base  →  14 effective   (merges +1)
DEFENSE   3 base  →  12 effective   (sanctuary +0, merges +0)
TRAITS    reach, riposte, sanctuary
FLOOR     The Siege Yards   depth 3   [gate sealed]   [arena, door open]
```

| Section | For checking |
|---|---|
| Depth | Jump to any floor; the last of each region is its boss. Region shortcuts and a reroll button for looking at silhouettes |
| Character | Levels, healing, invincible, glass cannon — for inspecting a fight at leisure or reaching a deep floor fast |
| Gear | Give any item, two of one (mergeable), or a version taken off a dead predecessor. "All sacred gear" hands you every trait at once |
| Spawn | Any monster or boss beside you, four at a time for cleave and piercing shots, or a revenant carrying gear it gains nothing from |
| Story | Replay any gate chapter, any boss's lore, or the reveal |
| Memorial | Record a predecessor on this floor, then reroll to meet them; clear it to test a fresh player's experience |
| World | Reveal the map, unbar an arena door, stand at one, unseal a gate |

It ships in the built game rather than being stripped out, which is deliberate:
it is as useful for looking at a live bug as it is for looking at a feature.

## Balance

Levelling and gear feed the same stats, so the numbers cannot be tuned by eye.
`tools/balance.mjs` auto-plays the game and reports where runs end:

```
node tools/balance.mjs 300
```

It runs two policies — `clear` (fights the floor, takes the loot, then descends)
and `dive` (fights what is in the way and little else) — and takes
`BALANCE_DISABLE=reach,attune` to strip named mechanics from the item data, so
any one of them can be measured rather than guessed at.

At 300 runs a piece, on the current numbers:

| | clear | dive |
|---|---|---|
| won | **20.7%** (62/300) | **0%** (0/300) |
| depth | median 8, max 12 | median 3, max 12 |
| level | median 9, max 17 | median 1, max 8 |
| turns per floor | median 620 | median 118 |

A thorough crusader wins about one run in five and dies on every floor of the
dungeon. The harness plays melee only and never picks up a bow, so that is a
floor on the real number, not the number. A hurried one dies at the first boss —
depth 3 is the median ending for `dive`. One hurried run in three hundred has
reached the bottom, and it died there.

Runs are independent and seeded from their index, so the sweep shards across
cores: 300 runs of both policies is a little over four minutes on four cores,
and it draws a progress bar while it works. `BALANCE_WORKERS=1` forces the old
single-threaded path, which is what you want under a profiler.

Re-run it after touching any number in `data/` or `progress.js`. It has caught
six things that reading the code did not: fourteen monsters on depth 1, a
defense stat that outran every monster in the game, a softlock where a full
pack made a boss floor impossible to leave, the difficulty spiral below, an
archer that could never be caught, and the split boss floor below.

`BALANCE_DEBUG=1` runs single-threaded and prints the seed, depth, door state
and position of any run the bot cannot find a move in, so a bad floor can be
replayed rather than guessed at.

### The floor that came apart

One run in ten used to end `stuck` — 30/300 for `clear`, 24/300 for `dive` —
and every one was the same shape: a **boss floor**, gate still sealed, and every
monster, every relic and the gate itself unreachable from where the crusader was
standing. A dead run on a floor that looked perfectly ordinary.

The arena is reserved before the region generator draws anything, and `fits()`
keeps every *room* off that ground. Corridors were never checked against it.
A corridor running between two rooms on opposite sides of the reserved
rectangle was carved straight across it, and then `openArena` walled the ring to
leave its single door — cutting that corridor in half and leaving the floor in
two pieces, with the arena opening onto only one of them. Arrive on the wrong
side and there was nothing you could reach and nothing you could do.

It was as common as the silhouette allowed: 18.7% of Siege Yards boss floors,
12.3% of the Choir's, 3.0% of the Reliquary's, and none at all in the Empty
Tomb, which is the one generator that already blocked the reserved ground out
of its cave fill.

`reconnectOutside` now labels the ground outside the arena, and digs the
shortest way from each stranded piece back to the largest one — around the
arena, never into it, so the fight still has exactly one door. Fixing it took
`stuck` to zero and the `clear` win rate from 14.7% to **20.7%**: six runs in
every hundred were being thrown away by a floor that could not be walked.

### What the special mechanics were worth

These numbers are a **historical reading**, taken on the dungeon as it stood
when the eight mechanics were added — before the floor was reshaped to 56x42
and before the traits were priced down in response to what the table showed.
The absolute win rate has moved a long way since (see the 20% above); what is
still worth reading is the *spacing* between the rows. Re-run the ablation
before quoting any of these figures as current.

Adding the eight special mechanics took the win rate from 28% to **80%**, which
is the sort of thing that is invisible when you read the diff. Disabling them
one at a time found the power was not spread evenly at all:

| Removed | Win rate (at the time) | Cost of the trait |
|---|---|---|
| nothing | 80% | — |
| reach | 46% | **34 points** |
| riposte | 66% | 14 points |
| attunement | 68% | 12 points |
| sanctuary / cleave / block / piercing | 80% each | within noise |
| all of them | 28% | (the pre-trait baseline) |

Reach on its own was worth more than every other mechanic combined: striking
everything as it walks toward you is simply better than striking it once it
arrives. It now costs 3 power against anything already adjacent, which gives
melee monsters a reason to close and pays for the free hit. Riposte answers at
half strength rather than with a whole extra attack, and attunement grows
slower and caps lower.

### Archers, and why they stand still

The first shooter AI gave ground on every reload turn. At equal speed that makes
the distance between you and it *mathematically constant* — you spend your turn
closing, it spends its turn undoing that — so it shoots forever and you never
arrive. The harness went from a 34% win rate to **zero**.

Shooters now hold their ground while they reload. That single turn of standing
still is what buys the player their approach, and it is the difference between
a tactical problem and a wall.

### Difficulty

The harness measures a bot that rests to full health whenever it is safe. A new
player does not know that resting is possible, so early playtesting told a very
different story: **95% of first runs died on depth 1**, and it got worse from
there, because every death put a revenant back on depth 1 for the next run.
Enemy hit points on the opening floor went from 30 to 95 across a handful of
runs, and the game became unwinnable in three deaths.

Four things fix it, and all four are load-bearing:

- a crusader is **issued a weapon and armour** instead of starting bare-handed
- **depth 1 carries three monsters**, and the curve catches up by mid-dungeon
- **nothing wanders onto depth 1** — wanderers price resting, and are only an
  ambush to someone who has not learned that resting exists
- **no revenant ever appears above depth 3**, so dying can never make the
  opening harder than it was the first time

A naive player who never rests now dies on depth 1 about 15% of the time, and
that number is flat across a session instead of climbing to 100%.

## The dungeon

Every boss does exactly what its lore panel says it does. The panel is written
from the mechanic rather than the other way round, so reading it tells you what
is about to happen and you still have to solve it.

| Depths | Region | Boss | What it does |
|---|---|---|---|
| 1–3 | The Siege Yards | the Herald of the Third Wall | Reads the roll. Names answer, and arrive. |
| 4–6 | The Reliquary | Saint Perpetua the Patient | Killing her is the first half of it. |
| 7–9 | The Choir | Odo the Precentor | Reaches you wherever he can be heard — range is not a thing that happens to a voice. |
| 10–12 | The Empty Tomb | **Sir Baudouin IX the Unreturned** | Fights the way you fight. He has had practice. |

## How it looks

Terrain is drawn as ground rather than lettering. Walls are filled mass with a
lit rim on every face that meets open floor — brightest on the south face, where
a light from above would fall — and floors are a tinted wash with a little fixed
grain so they are not flat slabs. Only things that are *objects* keep a glyph:
stairs, gates, doors, monsters, items, the crusader.

This is what makes the region silhouettes legible. In `#` and `.` the Choir's
pillared halls and the Empty Tomb's caves look nearly identical; as solid mass
they read as completely different places.

**Creatures are drawn as icons**, not letters — 24 single-colour silhouettes
for the twenty monsters, the crusader, the revenant, the corpse marker and the
one boss with a second shape to change into. They
are vector shapes in unit space rather than sprites, which is what lets them be
filled with whatever colour the renderer has already worked out and fade along
the torch ramp; a fixed-colour bitmap would sit at full brightness while the
floor around it went dark. There are only four monster colours, so silhouette
carries identity: low four-legged things, upright figures told apart by what
they hold, wide winged things, and bosses that are bigger and carry an emblem.
The revenant is the player's own icon drawn hollow.

**Doors and gates are symbols too.** They were the last things on the map still
drawn as punctuation, which made the three tiles a crusader actually has to make
a decision about look like syntax in the middle of a drawn room. A single colour
gives you exactly one lever — hollow against solid — and the set is built on it:

| | drawn as | means |
|---|---|---|
| door | a hollow pointed arch | you can see through it, and walk through it |
| barred door | the same arch, two beams across | the door that shut behind you |
| sealed gate | a portcullis — two rails, three bars, the seal where they cross | the way down, and why you are not taking it |

The first draft put a single beam across the arch and produced the letter `A`,
which is precisely the thing this game took off the map to begin with. Two beams
is a barred door and reads as nothing else. The stairs keep their `>`: it is the
one piece of punctuation every roguelike player already reads without being
taught.

Anything without an icon — items, and anything added later — keeps its glyph,
so the map can never come up blank. `tools`-free: no atlas, no image files, and
the single-file build stays self-contained.

**Light falls off with distance.** Visibility used to be a switch — lit or
remembered — which made the edge of sight a hard line and gave the torch no
presence at all. A lit cell now sits somewhere on a ramp between the two shades
according to how far it is from you, so the two states became one continuum: a
tile at the edge of the torch arrives at exactly the colour it will keep once
you walk away from it. Monsters and items fade the same way, which is most of
what makes a lit radius feel like light rather than a mask.

All of it falls out of the two colours a region already defines. A new region
needs no new palette: `wall` becomes the mass, its rim and its lit face, and
`floor` becomes the wash — and each of those becomes a ramp, built once per
draw rather than blended per cell, since a floor is well over two thousand of
them.

## Four regions, four shapes

Each region generates its own silhouette, not just its own palette:

| Region | Shape |
|---|---|
| The Siege Yards | Rooms and corridors — rectangles with paths trodden between them |
| The Reliquary | Catacombs — many small chambers, packed tight, with more ways between them than you can hold in your head |
| The Choir | Cathedral halls — few rooms, enormous ones, joined by two-tile aisles, with pillars standing in the open floor |
| The Empty Tomb | Caves — cellular automata, not built by anyone |

Every generator must hand back a fully connected floor. That invariant is what
the rest of the game leans on, and the suite checks it across forty seeds per
region.

## Boss arenas

A boss waits alone in a sealed room with exactly one door and the gate inside
it. Walking into that door asks **"Are you sure you want to enter?"** and costs
no turn if you say no. Say yes and the door bars behind you, the boss tells you
what it is, and neither of you leaves until one of you is finished. Nothing else
spawns in there — only what the Herald calls in — and you cannot blink out.

Once the boss is dead the door is just a door again: walk back in for the loot,
and nothing shuts behind you.

### The room fills the screen

Stepping through a boss door is the one moment the game stops being a floor
plan. The screen stops showing the floor and shows the **room** — the arena and
its own walls, scaled up to fill the stage, and nothing else. There is nowhere
else you can go and nothing else that can happen, so there is no reason to keep
drawing it.

The whole of it is `Game.arenaView()` returning a rectangle instead of null. The
renderer already scaled whatever it was handed to fill the space available, so
naming a smaller rectangle is the entire feature — and walking back out through
a dead boss's door returns the floor with no second code path.

Two **health bars** come with the fight, above the room and below it, and appear
nowhere else in the game. The crusader's health lives in the side panel, which
is the right place for it while you are walking a corridor and the wrong place
for it while something is hitting you: in a fight the eye does not leave the
room. The boss's health was nowhere at all — you could only infer it from how
long you had been swinging.

Fog of war is left alone in there. Lighting the whole room would have been the
prettier picture and a quiet rules change: `level.visible` is what monster
sight, firing and smite all read, so a fully lit arena is one you can shoot
across.

### Saint Perpetua gets up

The second boss does one thing, and for a long time it did not land. She
declines her own death: at zero she stands back up with 40% of her health and
one less armour. That arrived as two lines in a message log nobody reads during
a fight, and a health bar that quietly went back up — a player could finish the
floor without ever working out what had happened to them.

It now does what every other turn of this game's story does: it **stops
everything and says so**, on a card, the way her entrance does. And she changes
shape — the halo cracks open, the shroud slips off one shoulder, an arm comes
out of it — so the room carries the news for the rest of the fight instead of
the log carrying it for one turn. The bar above her says `· risen` next to the
numbers, because that is the number the second half is fought against.

## The story

Sir Baudouin IX went down first, before the crusade had a number. His story is
told in three chapters, one at each sealed gate — the crusade's own account of
him, which is admiring and incomplete — and finished when you reach the bottom
and find out why there were eight more crusades after his.

The panels appear along the bottom of the map on first sight and cost no turn to
read. A test asserts that no gate chapter contains any of the phrases that would
give the ending away, so a future edit cannot leak the twist into a chapter.

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
    mapgen.js      four region silhouettes, and the sealed boss arena
    level.js       one floor: terrain, entities, visibility
  game/      rules (no DOM anywhere -- this is why it is testable)
    game.js        state, turn scheduler, regions, gates, story triggers
    bosses.js      the four boss mechanics, one per story
    entity.js      entities as bags of optional components
    actions.js     move, attack, take, use, descend
    combat.js      damage resolution, death, drops
    ai.js          monster behaviour
    effects.js     relic effects
    status.js      derived stats -- gear, traits, statuses, heirlooms
    progress.js    experience, levels, regeneration
    memorial.js    THE DUNGEON REMEMBERS -- persistence across runs
  ui/        browser layer -- the whole game fits one viewport, never scrolls
    render.js      canvas renderer -- filled terrain, icons, the arena view
    painter.js     unit-space drawing surface the icons are described against
    input.js       key bindings
    panel.js       stats, seals, pack, message log
  data/      >>> the theme seam <<<
    theme.js       palette, flavour strings, tone
    lore.js        the first crusader's story, and each boss's history
    icons.js       one silhouette per creature, and one per door and gate
    regions.js     the four regions and their bosses
    monsters.js    monster roster
    items.js       relics, arms, armour and seals
    traits.js      the named special mechanics, and heirloom scaling
    names.js       crusader name generation
tools/build.mjs    inlines everything into one dist/index.html
tools/balance.mjs  auto-plays hundreds of runs and reports where they end
tests/smoke.mjs    334 assertions, including a full run to depth 12
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

- **More AI shapes** — `ai.js` knows how to close and how to shoot; pack
  tactics, fleeing at low health, and monsters that open doors are all next
- **Map generation** — prefab vaults, and terrain that does something (water,
  rubble, collapsing floors) rather than only shaping the walk
- **Deeper memorial** — graves you can pray at, predecessors who remember how
  you died, a revenant that fights the way you played
- **Progression** — equipment that does something other than add numbers
- **More rule-breaking bosses** — the four in `bosses.js` each break one rule
  (the Herald calls reinforcements, Perpetua rises once, Odo strikes from across
  the room, Baudouin mirrors your build); the next ones should break the map,
  the turn order, or the pack

## Builds

`node tools/build.mjs` writes two files:

- `dist/index.html` — the whole game in one self-contained file. This is the one
  to copy between machines; it works from `file://`.
- `dist/embed.html` — the same, without the document wrapper, for hosts that
  supply their own `<head>`.

Both inline all 31 modules, so neither has the module-loading problem the
top-level page has.

## Putting it online

The game is static files, so GitHub Pages hosts it for nothing — no account
beyond the one holding this repository, no card, no server to keep alive.
`.github/workflows/pages.yml` does the work: on every push to the default
branch it runs the tests, rebuilds `dist/`, checks that the committed `dist/`
matches what it just built, and publishes that folder.

The one thing a workflow cannot do for itself is turn Pages on:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push, or run the workflow by hand from the **Actions** tab.
3. The site appears at `https://<user>.github.io/<repo>/`, and the run's
   summary links to it.

Only `dist/` is published, so the site root *is* the single-file build — the
module-loading top-level page never reaches the web, and neither does `src/`,
`tests/` or `tools/`. Anyone who wants those reads them here.

Because the build is deterministic, the "dist/ is up to date" step is a real
check and not a formality: if it fails, someone changed `src/` and forgot
`node tools/build.mjs`, and the live site would otherwise have quietly stayed
one commit behind the source.
