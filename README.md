# Untitled Roguelike

A traditional turn-based roguelike, built from scratch in vanilla JavaScript.
No dependencies, no build step, no framework.

## Running it

ES modules need to be served over HTTP (`file://` will not work):

```
python3 -m http.server 8000
# then open http://localhost:8000
```

Run the headless test suite with:

```
node tests/smoke.mjs
```

## Playing

| Action     | Keys                              |
|------------|-----------------------------------|
| Move       | arrows, `hjkl` + `yubn`, numpad   |
| Wait       | `.` or `5`                        |
| Pick up    | `g`                               |
| Use item   | `1`–`9`                           |
| Descend    | `>` while standing on `>`         |
| Restart    | `r`                               |

Walk into a monster to attack it. Find the `>` and go deeper.

## What is here

A complete vertical slice: seeded procedural levels, shadowcast field of view
with remembered terrain, energy-based turn scheduling (fast monsters really do
act more often), Dijkstra-map pathfinding AI, bump combat, items, and infinite
descending floors.

## Layout

```
src/
  engine/    generic, game-agnostic building blocks
    rng.js         seeded PRNG -- all randomness flows through this
    grid.js        2D grid + direction helpers
    fov.js         recursive shadowcasting field of view
    dijkstra.js    flood-fill pathfinding maps
  world/     terrain
    tiles.js       tile definitions
    mapgen.js      rooms-and-corridors generation
    level.js       one floor: terrain, entities, visibility
  game/      rules (no DOM anywhere -- this is why it is testable)
    game.js        state, turn scheduler, level lifecycle
    entity.js      entities as bags of optional components
    actions.js     move, attack, pick up, use, descend
    combat.js      damage resolution and death
    ai.js          monster behaviour
    effects.js     item effects
  ui/        browser layer
    render.js      canvas glyph renderer
    input.js       key bindings
    panel.js       stats, inventory, message log
  data/      >>> the theme seam <<<
    theme.js       palette, glyph colours, flavour text, title
    monsters.js    monster table
    items.js       item table
```

### Re-theming

`src/data/` is deliberately isolated. Changing the palette, the monster roster,
the item list and the flavour strings changes what the game *is* without
touching a line of engine, world or game code.

## Where to grow it

- **Map generation** — cave systems, BSP, prefab vaults, themed floors
- **AI** — ranged attackers, pack tactics, fleeing, monsters that use doors
- **Combat** — to-hit rolls, damage types, resistances, status effects
- **Progression** — XP and levels, equipment, character classes
- **Content** — the whole point; `data/` is built to absorb it
