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
import { Game } from '../src/game/game.js';
import { moveOrAttack, pickUp, useItem, equipItem, descend } from '../src/game/actions.js';
import { Memorial, memoryStorage } from '../src/game/memorial.js';
import { effectiveSpeed } from '../src/game/status.js';
import { chebyshev } from '../src/engine/grid.js';
import { dijkstraMap, stepDownhill, UNREACHABLE } from '../src/engine/dijkstra.js';
import { MAX_DEPTH } from '../src/data/regions.js';
import { ITEMS } from '../src/data/items.js';

// A/B switch for tuning. `BALANCE_DISABLE=cleave,attune` strips those
// mechanics from the item data before any run, so their contribution to the
// win rate can be measured instead of guessed at.
const disabled = new Set((process.env.BALANCE_DISABLE ?? '').split(',').filter(Boolean));
if (disabled.size) {
  for (const item of Object.values(ITEMS)) {
    if (item.trait && disabled.has(item.trait)) item.trait = null;
    if (item.use?.attune && disabled.has('attune')) delete item.use.attune;
    if (item.use?.echo && disabled.has('echo')) delete item.use.echo;
  }
  console.log('disabled: ' + [...disabled].join(', '));
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
  console.log('map: ' + width + 'x' + height);
  return { width, height };
})();

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

function stepToward(game, tx, ty) {
  const level = game.level;
  const dist = dijkstraMap(level.width, level.height, [[tx, ty]],
    (x, y) => level.isWalkable(x, y));
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

function nearest(game, candidates) {
  const level = game.level;
  if (!candidates.length) return null;
  const dist = dijkstraMap(level.width, level.height,
    [[game.player.x, game.player.y]], (x, y) => level.isWalkable(x, y));
  let best = null;
  let bestD = UNREACHABLE;
  for (const e of candidates) {
    const d = dist[e.y * level.width + e.x];
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

function playOne(seed, policy, memorial) {
  const game = new Game({ seed, memorial, ...mapSize });
  let floorTurns = 0;
  let ending = 'turnlimit';

  while (game.state === 'playing' && floorTurns < TURNS_PER_FLOOR * MAX_DEPTH) {
    floorTurns++;
    let acted = false;

    const monsters = game.level.entities.filter((e) => e.ai && e.alive);
    const loot = game.level.entities.filter((e) => e.item && wants(game, e));
    const here = game.level.itemsAt(game.player.x, game.player.y).filter((e) => wants(game, e));

    // Once the door of a boss arena shuts, everything outside it is
    // unreachable. Resolve a reachable target first, then decide.
    const foe = monsters.length ? nearest(game, monsters) : null;
    const prize = loot.length ? nearest(game, loot) : null;

    if (upgrade(game) || useRelics(game, monsters)) {
      acted = true;
    } else if (restIfSafe(game, monsters)) {
      acted = true;                          // waiting is an action
    } else if (here.length) {
      acted = pickUp(game, game.player) || true;   // never stall on a full pack
    } else if (policy === 'clear' && foe) {
      acted = stepToward(game, foe.x, foe.y);
    } else if (policy === 'clear' && prize) {
      acted = stepToward(game, prize.x, prize.y);
    } else if (game.level.sealed || game.level.doorLocked) {
      // Sealed floor: the boss and its seal are the only way on.
      const target = foe ?? prize;
      acted = target ? stepToward(game, target.x, target.y) : false;
    } else if (game.level.stairs) {
      const { x, y } = game.level.stairs;
      acted = (game.player.x === x && game.player.y === y) ? descend(game) : stepToward(game, x, y);
    } else if (foe) {
      // Final floor: no way down but through.
      acted = stepToward(game, foe.x, foe.y);
    }

    if (!acted) {
      ending = 'stuck';
      if (process.env.BALANCE_DEBUG) {
        const tile = game.level.tiles.get(game.player.x, game.player.y).key;
        const reachable = (e) => {
          const d = dijkstraMap(game.level.width, game.level.height, [[e.x, e.y]],
            (x, y) => game.level.isWalkable(x, y));
          return d[game.player.y * game.level.width + game.player.x] !== UNREACHABLE;
        };
        console.error('STUCK depth ' + game.level.depth + ' tile ' + tile
          + ' sealed ' + game.level.sealed
          + ' monsters ' + monsters.length + '(' + monsters.filter(reachable).length + ' reachable)'
          + ' loot ' + loot.length + '(' + loot.filter(reachable).length + ' reachable)'
          + ' stairs ' + (game.level.stairs ? (reachable(game.level.stairs) ? 'reachable' : 'UNREACHABLE') : 'none')
          + ' onStairs ' + Boolean(game.level.stairs && game.player.x === game.level.stairs.x && game.player.y === game.level.stairs.y)
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

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report(policy) {
  const results = [];
  for (let i = 0; i < RUNS; i++) {
    // A fresh memorial per run: revenants would otherwise make later runs
    // harder in a way that muddies the reading.
    results.push(playOne((i + SEED_BLOCK * RUNS) * 7919 + 13, policy, new Memorial(memoryStorage())));
  }

  const depths = results.map((r) => r.depth);
  const levels = results.map((r) => r.level);
  const wins = results.filter((r) => r.won).length;

  console.log('policy: ' + policy + '  (' + RUNS + ' runs)');
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

  // Which levels each region is reached at, to see if the curve tracks the map.
  const byDepth = new Map();
  for (const r of results) {
    if (!byDepth.has(r.depth)) byDepth.set(r.depth, []);
    byDepth.get(r.depth).push(r.level);
  }
  console.log('');
}

report('clear');
report('dive');
