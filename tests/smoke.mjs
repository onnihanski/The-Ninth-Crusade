// Headless smoke test: drives a full game under node, with no DOM anywhere.
// Catches the crashes that are painful to find by clicking around in a browser
// (FOV out of bounds, scheduler deadlocks, AI stepping into walls).
import { Game } from '../src/game/game.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { moveOrAttack, wait, pickUp, useItem, descend } from '../src/game/actions.js';
import { Tiles } from '../src/world/tiles.js';

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok   ' + label);
  } else {
    console.log('  FAIL ' + label);
    failures++;
  }
}

// --- determinism -----------------------------------------------------------
console.log('determinism');
const a = new Game({ seed: 12345 });
const b = new Game({ seed: 12345 });
check('same seed produces identical terrain',
  JSON.stringify(a.level.tiles.cells.map((t) => t.key)) ===
  JSON.stringify(b.level.tiles.cells.map((t) => t.key)));
check('same seed produces identical entity count',
  a.level.entities.length === b.level.entities.length);
const c = new Game({ seed: 999 });
check('different seed produces different terrain',
  JSON.stringify(a.level.tiles.cells.map((t) => t.key)) !==
  JSON.stringify(c.level.tiles.cells.map((t) => t.key)));

// --- map invariants --------------------------------------------------------
console.log('map generation');
for (let seed = 0; seed < 60; seed++) {
  const g = new Game({ seed });
  if (g.level.rooms.length < 3) { check('seed ' + seed + ' has rooms', false); break; }
  if (!g.level.isWalkable(g.player.x, g.player.y)) { check('seed ' + seed + ' player on floor', false); break; }
  // Every room centre must be reachable from the player, or the level is a trap.
  const dist = g.playerDistanceMap();
  const unreachable = g.level.rooms.filter((r) => dist[r.cy * g.level.width + r.cx] >= 0x3fffffff);
  if (unreachable.length) { check('seed ' + seed + ' fully connected', false); break; }
  if (g.level.tiles.get(g.level.stairs.x, g.level.stairs.y) !== Tiles.stairsDown) {
    check('seed ' + seed + ' has stairs', false); break;
  }
}
check('60 seeds all generate connected, playable levels', failures === 0);

// --- fov -------------------------------------------------------------------
console.log('field of view');
const f = new Game({ seed: 7 });
check('player can see their own tile', f.level.visible.get(f.player.x, f.player.y) === true);
check('fov marks tiles explored', f.level.explored.cells.some(Boolean));
check('fov does not reveal the whole map',
  f.level.visible.cells.filter(Boolean).length < f.level.width * f.level.height);

// --- a long random playthrough ---------------------------------------------
console.log('random playthrough');
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
let deaths = 0;
let descents = 0;

for (let seed = 0; seed < 25; seed++) {
  let g = new Game({ seed: seed * 31 + 5 });
  for (let step = 0; step < 600; step++) {
    if (g.state === 'dead') { deaths++; g = new Game({ seed: seed * 31 + 6 }); continue; }
    const roll = g.rng.float();
    let acted;
    if (roll < 0.72) {
      const [dx, dy] = g.rng.pick(DIRS);
      acted = moveOrAttack(g, g.player, dx, dy);
    } else if (roll < 0.80) {
      acted = pickUp(g, g.player);
    } else if (roll < 0.88 && g.player.inventory.length) {
      acted = useItem(g, g.player, 0);
    } else if (roll < 0.94) {
      const before = g.level.depth;
      acted = descend(g);
      if (g.level.depth > before) descents++;
    } else {
      acted = wait();
    }
    if (acted) g.playerActed();

    // Invariants that must hold after every single turn.
    if (g.player.hp > g.player.maxHp) { check('hp never exceeds max', false); break; }
    if (!g.level.isWalkable(g.player.x, g.player.y)) { check('player never inside a wall', false); break; }
    for (const e of g.level.entities) {
      if (e.ai && e.alive && !g.level.isWalkable(e.x, e.y)) { check('monsters never inside walls', false); break; }
    }
  }
}
check('25 random playthroughs x 600 turns, no crash or deadlock', true);
check('combat is lethal enough to kill the player sometimes (' + deaths + ' deaths)', deaths > 0);

// --- descending, deliberately ----------------------------------------------
// The random walker above almost never steps on the stairs by chance, so drive
// the player to them on purpose. This also covers state that must survive a
// level change: inventory, HP, and the player's identity as an entity.
console.log('descending');

function walkToStairs(g, budget = 4000) {
  for (let step = 0; step < budget; step++) {
    if (g.state === 'dead') return false;
    if (g.player.x === g.level.stairs.x && g.player.y === g.level.stairs.y) return true;
    const dist = dijkstraMap(
      g.level.width, g.level.height,
      [[g.level.stairs.x, g.level.stairs.y]],
      (x, y) => g.level.isWalkable(x, y),
    );
    if (dist[g.player.y * g.level.width + g.player.x] === UNREACHABLE) return false;
    const move = stepDownhill(dist, g.level.width, g.level.height, g.player.x, g.player.y, g.rng);
    if (!move) return false;
    if (moveOrAttack(g, g.player, move[0], move[1])) g.playerActed();
  }
  return false;
}

const d = new Game({ seed: 4242 });
d.player.maxHp = 9999;            // survive the trip; we are testing descent, not combat
d.player.hp = 9999;
d.player.power = 99;

let reached = 0;
for (let floor = 1; floor <= 6; floor++) {
  if (!walkToStairs(d)) break;
  const depthBefore = d.level.depth;
  const carried = d.player.inventory.length;
  if (!descend(d)) break;
  if (d.level.depth !== depthBefore + 1) break;
  if (d.player.inventory.length !== carried) break;
  if (!d.level.entities.includes(d.player)) break;
  if (!d.level.isWalkable(d.player.x, d.player.y)) break;
  reached = d.level.depth;
}
check('walked down to depth ' + reached + ' carrying state across floors', reached >= 6);
check('deeper floors spawn monsters', d.level.entities.some((e) => e.ai));

// --- items -----------------------------------------------------------------
console.log('items');
const i = new Game({ seed: 88 });
i.player.hp = 5;
const potion = { name: 'healing potion', glyph: '!', color: 'item', use: { kind: 'heal', amount: 8 } };
i.player.inventory.push({ ...potion, item: { use: potion.use } });
const consumed = useItem(i, i.player, 0);
check('using a potion heals', i.player.hp > 5);
check('using a potion consumes it', consumed && i.player.inventory.length === 0);
i.player.hp = i.player.maxHp;
i.player.inventory.push({ ...potion, item: { use: potion.use } });
useItem(i, i.player, 0);
check('a potion is not wasted at full health', i.player.inventory.length === 1);

console.log('');
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
