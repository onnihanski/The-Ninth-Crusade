// Auto-plays the game many times and reports how far a crusader gets.
//
// Levelling and gear both feed the same stats, so their numbers cannot be tuned
// by eye -- a change that looks small on paper moves where runs end. Two
// policies bracket the real player:
//
//   clear  a thorough player: fights the floor, takes the loot, then descends
//   dive   a hurried player: fights what is in the way and little else
//
// Usage: node tools/balance.mjs [runs]
//
// Runs are independent and seeded from their index, so the sweep is sharded
// across cores and each shard is still exactly reproducible. `BALANCE_WORKERS=1`
// forces the old single-threaded path, which is what you want under a profiler
// or with BALANCE_DEBUG.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Game } from '../src/game/game.js';
import { moveOrAttack, pickUp, useItem, equipItem, descend } from '../src/game/actions.js';
import { Memorial, memoryStorage } from '../src/game/memorial.js';
import { effectiveSpeed } from '../src/game/status.js';
import { chebyshev, DIRS8 } from '../src/engine/grid.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { MAX_DEPTH } from '../src/data/regions.js';
import { ITEMS } from '../src/data/items.js';

// A/B switch for tuning. `BALANCE_DISABLE=cleave,attune` strips those
// mechanics from the item data before any run, so their contribution to the
// win rate can be measured instead of guessed at. Workers inherit the
// environment, so each shard strips the same mechanics; only the main thread
// says so out loud.
const disabled = new Set((process.env.BALANCE_DISABLE ?? '').split(',').filter(Boolean));
if (disabled.size) {
  for (const item of Object.values(ITEMS)) {
    if (item.trait && disabled.has(item.trait)) item.trait = null;
    if (item.use?.attune && disabled.has('attune')) delete item.use.attune;
    if (item.use?.echo && disabled.has('echo')) delete item.use.echo;
  }
  if (isMainThread) console.log('disabled: ' + [...disabled].join(', '));
}

const RUNS = Number(process.argv[2] ?? 300);
const TURNS_PER_FLOOR = 1500;

// `BALANCE_MAP=72x34` runs the sweep at a different floor shape, so a reshape
// can be measured against the shape it replaced rather than argued about.
// `BALANCE_SEED=1` runs a disjoint block of seeds. Seeds are derived from the
// run index, so re-running the same sweep reproduces it exactly -- which is
// what you want when reading a change, and useless when you need a second
// independent sample to tell a real shift from a lucky seed set.
const SEED_BLOCK = Number(process.env.BALANCE_SEED ?? 0);

const mapSize = (() => {
  const raw = process.env.BALANCE_MAP;
  if (!raw) return {};
  const [width, height] = raw.split('x').map(Number);
  if (isMainThread) console.log('map: ' + width + 'x' + height);
  return { width, height };
})();

/** The seed for run `i`. Kept in one place: the shards have to agree on it. */
const seedFor = (i) => (i + SEED_BLOCK * RUNS) * 7919 + 13;

/** Rough combat value: damage per turn, plus survivability. */
function score(player, equipment) {
  const worn = Object.values(equipment).filter(Boolean);
  const bonus = (field) => worn.reduce((sum, i) => sum + (i.item.equip[field] ?? 0), 0);
  const speed = Math.max(25, player.speed + bonus('speed'));
  return (player.power + bonus('power')) * (speed / 100)
    + (player.defense + bonus('defense')) * 1.5;
}

/** Equip anything in the pack that beats what is in its slot. */
function upgrade(game) {
  const p = game.player;
  for (let i = 0; i < p.inventory.length; i++) {
    const item = p.inventory[i];
    if (!item.item.equip) continue;
    const slot = item.item.equip.slot;
    const candidate = { ...p.equipment, [slot]: item };
    if (score(p, candidate) > score(p, p.equipment) + 0.01) {
      equipItem(game, p, i);
      return true;
    }
  }
  return false;
}

/**
 * What a sane player actually stoops for. A bot that takes everything fills its
 * pack by depth 4 and then stands on loot it cannot lift, which reads as a
 * balance result and is not one.
 */
function wants(game, entity) {
  const p = game.player;
  const item = entity.item;
  if (item.seal || item.victory) return true;   // never pack-limited
  if (p.inventory.length >= 9) return false;

  if (item.equip) {
    const slot = item.equip.slot;
    return score(p, { ...p.equipment, [slot]: entity }) > score(p, p.equipment) + 0.01;
  }

  // Consumables: carry a couple, leave the rest.
  const held = p.inventory.filter((i) => i.item.key === item.key).length;
  return held < 2;
}

/**
 * A flood from `goal` that stops as soon as the walker's own square and all
 * eight of its neighbours are final.
 *
 * Pathfinding is two thirds of this harness's runtime, and a full flood answers
 * a question nobody asked: the bot only ever reads its own cell and the eight
 * around it. BFS settles in distance order, so once the frontier passes
 * d(walker) + 1 every one of those nine values is already its final value and
 * the rest of the map cannot change the step. Cells left unsettled stay
 * UNREACHABLE, and `stepDownhill` only ever moves to a value below the
 * walker's own -- so a cell truncated away could not have been chosen anyway.
 * The step this returns is the step the full flood returns, tie-breaking
 * included.
 */
function stepFlood(width, height, gx, gy, wx, wy, isPassable) {
  const dist = new Int32Array(width * height).fill(UNREACHABLE);
  if (gx < 0 || gy < 0 || gx >= width || gy >= height) return dist;
  dist[gy * width + gx] = 0;
  const queue = [gx, gy];
  let cutoff = UNREACHABLE;

  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const d = dist[y * width + x];
    if (d > cutoff) break;

    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const i = ny * width + nx;
      if (dist[i] <= d + 1) continue;
      if (!isPassable(nx, ny)) continue;
      dist[i] = d + 1;
      queue.push(nx, ny);
      // The walker is settled: one more ring finalises its neighbours.
      if (nx === wx && ny === wy) cutoff = d + 1;
    }
  }

  return dist;
}

function stepToward(game, tx, ty, passable) {
  const level = game.level;
  const dist = stepFlood(level.width, level.height, tx, ty,
    game.player.x, game.player.y, passable);
  if (dist[game.player.y * level.width + game.player.x] === UNREACHABLE) return false;
  const move = stepDownhill(dist, level.width, level.height, game.player.x, game.player.y, game.rng);
  if (!move) return false;

  const acted = moveOrAttack(game, game.player, move[0], move[1]);

  // A boss door asks before it opens. The bot always says yes -- there is
  // nothing else on a sealed floor for it to do.
  if (!acted && game.prompt?.kind === 'enterArena') {
    game.enterArena();
    while (game.pendingStory()) game.dismissStory();
    return true;
  }
  return acted;
}

/**
 * Closest of `candidates` on a flood already rooted at the player. The flood is
 * the expensive part and monsters and loot are ranked against the same one, so
 * it is computed once a turn and handed in rather than rebuilt per question.
 */
function nearest(width, dist, candidates) {
  let best = null;
  let bestD = UNREACHABLE;
  for (const e of candidates) {
    const d = dist[e.y * width + e.x];
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/**
 * Spend relics the way a competent player would. Measuring the game against a
 * bot that only ever drinks heals measures the bot, not the game.
 */
function useRelics(game, monsters) {
  const p = game.player;
  const slot = (kind) => p.inventory.findIndex((it) => it.item.use?.kind === kind);
  const adjacent = monsters.filter((m) => chebyshev(m.x, m.y, p.x, p.y) <= 1);
  const nearby = monsters.filter((m) => chebyshev(m.x, m.y, p.x, p.y) <= 6);
  const hurt = p.hp / p.maxHp;

  if (hurt <= 0.45 && slot('heal') >= 0) return useItem(game, p, slot('heal'));

  // Cornered and out of heals: leave.
  if (hurt <= 0.3 && adjacent.length && slot('heal') < 0 && slot('blink') >= 0) {
    return useItem(game, p, slot('blink'));
  }

  // Brace before a real fight, not for trash.
  const seriousFight = nearby.some((m) => m.boss || m.maxHp >= 25);
  if (seriousFight && hurt <= 0.8 && !p.statuses.some((st) => st.kind === 'ward')
    && slot('ward') >= 0) {
    return useItem(game, p, slot('ward'));
  }

  if (seriousFight && adjacent.length && slot('smite') >= 0) {
    return useItem(game, p, slot('smite'));
  }
  return false;
}

/** Nothing nearby and hurt: sit down and heal, the way a person would. */
function restIfSafe(game, monsters) {
  const p = game.player;
  if (p.hp >= p.maxHp * 0.75) return false;
  const near = monsters.some((m) => chebyshev(m.x, m.y, p.x, p.y) <= 7);
  return !near;
}

export function playOne(seed, policy, memorial, onStuck) {
  const game = new Game({ seed, memorial, ...mapSize });
  let floorTurns = 0;
  let ending = 'turnlimit';

  while (game.state === 'playing' && floorTurns < TURNS_PER_FLOOR * MAX_DEPTH) {
    floorTurns++;
    let acted = false;

    const level = game.level;
    const passable = (x, y) => level.isWalkable(x, y);

    const monsters = level.entities.filter((e) => e.ai && e.alive);
    const loot = level.entities.filter((e) => e.item && wants(game, e));
    const here = level.itemsAt(game.player.x, game.player.y).filter((e) => wants(game, e));

    // Once the door of a boss arena shuts, everything outside it is
    // unreachable. Resolve a reachable target first, then decide. Monsters and
    // loot are both ranked from where the player stands, so that is one flood
    // a turn, not one per question.
    const reach = (monsters.length || loot.length)
      ? dijkstraMap(level.width, level.height, [[game.player.x, game.player.y]], passable)
      : null;
    const foe = monsters.length ? nearest(level.width, reach, monsters) : null;
    const prize = loot.length ? nearest(level.width, reach, loot) : null;

    if (upgrade(game) || useRelics(game, monsters)) {
      acted = true;
    } else if (restIfSafe(game, monsters)) {
      acted = true;                          // waiting is an action
    } else if (here.length) {
      acted = pickUp(game, game.player) || true;   // never stall on a full pack
    } else if (policy === 'clear' && foe) {
      acted = stepToward(game, foe.x, foe.y, passable);
    } else if (policy === 'clear' && prize) {
      acted = stepToward(game, prize.x, prize.y, passable);
    } else if (level.sealed || level.doorLocked) {
      // Sealed floor: the boss and its seal are the only way on.
      const target = foe ?? prize;
      acted = target ? stepToward(game, target.x, target.y, passable) : false;
    } else if (level.stairs) {
      const { x, y } = level.stairs;
      acted = (game.player.x === x && game.player.y === y)
        ? descend(game)
        : stepToward(game, x, y, passable);
    } else if (foe) {
      // Final floor: no way down but through.
      acted = stepToward(game, foe.x, foe.y, passable);
    }

    if (!acted) {
      ending = 'stuck';
      // A replay tool can ask to be handed the exact position the bot gave up
      // in, which is the only way to look at a stuck floor rather than at a
      // one-line summary of one.
      if (onStuck) onStuck(game, { seed, policy, reach });
      if (process.env.BALANCE_DEBUG) {
        const tile = level.tiles.get(game.player.x, game.player.y).key;
        const reachable = (e) => reach && reach[e.y * level.width + e.x] !== UNREACHABLE;
        console.error('STUCK seed ' + seed + ' policy ' + policy
          + ' depth ' + level.depth + ' tile ' + tile
          + ' sealed ' + level.sealed
          + ' monsters ' + monsters.length + '(' + monsters.filter(reachable).length + ' reachable)'
          + ' loot ' + loot.length + '(' + loot.filter(reachable).length + ' reachable)'
          + ' stairs ' + (level.stairs ? (reachable(level.stairs) ? 'reachable' : 'UNREACHABLE') : 'none')
          + ' onStairs ' + Boolean(level.stairs && game.player.x === level.stairs.x && game.player.y === level.stairs.y)
          + ' doorLocked ' + Boolean(level.doorLocked)
          + ' at ' + game.player.x + ',' + game.player.y
          + ' | ' + game.messages.slice(-2).map((m) => m.text).join(' / '));
      }
      break;
    }
    if (game.state === 'playing') game.playerActed();
  }
  if (game.state === 'dead') ending = 'dead';
  if (game.state === 'won') ending = 'won';

  return {
    ending,
    depth: game.level.depth,
    level: game.player.level,
    // Turns per floor is the hidden variable behind a lot of balance: it sets
    // how many wanderers arrive and how much free regeneration a floor pays
    // out. Map shape moves it without touching a single number in the data.
    turnsPerFloor: floorTurns / Math.max(1, game.level.depth),
    won: game.state === 'won',
    speed: effectiveSpeed(game.player),
    kit: Object.values(game.player.equipment).filter(Boolean).map((i) => i.item.key),
  };
}

// ---------------------------------------------------------------------------
// Shard worker. A run is a pure function of its seed and policy -- a fresh
// memorial every time, so nothing carries between them -- which is what makes
// splitting the sweep across cores safe rather than merely fast.
// ---------------------------------------------------------------------------
if (!isMainThread) {
  const { policy, indices } = workerData;
  for (const i of indices) {
    const result = playOne(seedFor(i), policy, new Memorial(memoryStorage()));
    parentPort.postMessage({ i, result });
  }
}

// ---------------------------------------------------------------------------
// Progress. A sweep is minutes long; a progress line is the difference between
// waiting and wondering whether it has hung.
// ---------------------------------------------------------------------------
const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
};

function progressReporter(policy, total) {
  const started = Date.now();
  const tty = process.stderr.isTTY;
  let lastDrawn = -1;

  const draw = (done, final) => {
    const elapsed = Date.now() - started;
    const frac = done / total;
    const eta = done ? clock(elapsed * (1 - frac) / frac) : '?';
    const bar = '#'.repeat(Math.round(24 * frac)).padEnd(24, '.');
    const line = policy.padEnd(6) + ' [' + bar + '] ' + String(done).padStart(String(total).length)
      + '/' + total + '  ' + clock(elapsed) + (final ? '' : '  eta ' + eta);
    if (tty) process.stderr.write('\r' + line + (final ? '\n' : ''));
    else if (final || done - lastDrawn >= Math.max(1, Math.floor(total / 10))) {
      process.stderr.write(line + '\n');
      lastDrawn = done;
    }
  };

  draw(0, false);
  return { draw, elapsed: () => Date.now() - started };
}

/** Fan the run indices out over `n` shards, round-robin so each gets a mix. */
function shard(total, n) {
  const shards = Array.from({ length: n }, () => []);
  for (let i = 0; i < total; i++) shards[i % n].push(i);
  return shards.filter((s) => s.length);
}

function runSweep(policy, workers) {
  const progress = progressReporter(policy, RUNS);
  const results = new Array(RUNS);
  let done = 0;

  if (workers === 1) {
    for (let i = 0; i < RUNS; i++) {
      results[i] = playOne(seedFor(i), policy, new Memorial(memoryStorage()));
      progress.draw(++done, false);
    }
    progress.draw(done, true);
    return { results, ms: progress.elapsed() };
  }

  const here = fileURLToPath(import.meta.url);
  return new Promise((resolve, reject) => {
    let live = 0;
    for (const indices of shard(RUNS, workers)) {
      const worker = new Worker(here, { workerData: { policy, indices }, argv: [RUNS] });
      live++;
      worker.on('message', ({ i, result }) => {
        results[i] = result;
        progress.draw(++done, false);
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        if (--live === 0) {
          progress.draw(done, true);
          resolve({ results, ms: progress.elapsed() });
        }
      });
    }
  });
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report(policy, results, ms) {
  const depths = results.map((r) => r.depth);
  const levels = results.map((r) => r.level);
  const wins = results.filter((r) => r.won).length;

  console.log('policy: ' + policy + '  (' + RUNS + ' runs in ' + clock(ms) + ')');
  console.log('  won            ' + wins + '/' + RUNS + '  (' + (100 * wins / RUNS).toFixed(1) + '%)');
  console.log('  depth  median ' + median(depths) + '   max ' + Math.max(...depths));
  console.log('  level  median ' + median(levels) + '   max ' + Math.max(...levels));
  console.log('  turns per floor  median '
    + median(results.map((r) => r.turnsPerFloor)).toFixed(0));
  const endings = new Map();
  for (const r of results) endings.set(r.ending, (endings.get(r.ending) ?? 0) + 1);
  console.log('  endings        ' + [...endings].map(([k, n]) => k + ' ' + n).join(', '));

  const hist = new Map();
  for (const d of depths) hist.set(d, (hist.get(d) ?? 0) + 1);
  const bar = [...hist.entries()].sort((a, b) => a[0] - b[0])
    .map(([d, n]) => '    depth ' + String(d).padStart(2) + ' ' + '#'.repeat(Math.round(40 * n / RUNS)) + ' ' + n);
  console.log(bar.join('\n'));
  console.log('');
}

const isEntry = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainThread && isEntry) {
  // One worker per core, but never more workers than runs, and never a second
  // thread for a sweep small enough that starting one costs more than it saves.
  // BALANCE_DEBUG writes from inside a run, so it stays single-threaded.
  const requested = Number(process.env.BALANCE_WORKERS ?? 0);
  const workers = (process.env.BALANCE_DEBUG || RUNS < 4) ? 1
    : Math.max(1, Math.min(requested || availableParallelism(), RUNS));

  if (workers > 1) console.log('workers: ' + workers);
  for (const policy of ['clear', 'dive']) {
    const { results, ms } = await runSweep(policy, workers);
    report(policy, results, ms);
  }
}
