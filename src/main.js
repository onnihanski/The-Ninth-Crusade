import { Game } from './game/game.js';
import { makeItem } from './game/entity.js';
import { ITEMS } from './data/items.js';
import { gainXp } from './game/progress.js';
import { moveOrAttack, wait, pickUp, useItem, dropItem, descend } from './game/actions.js';
import { Memorial, browserStorage } from './game/memorial.js';
import { THEME } from './data/theme.js';
import { Renderer } from './ui/render.js';
import { Panel } from './ui/panel.js';
import { keyToIntent } from './ui/input.js';

// Bootstrap: owns the browser-facing bits and nothing else. All rules live in
// game/, which is why the whole game is testable under node.
const canvas = document.getElementById('screen');
const renderer = new Renderer(canvas, THEME);
const panel = new Panel(document, THEME);

// One memorial for the whole browser: it outlives every run, which is the point.
const memorial = new Memorial(browserStorage());
let game;
// `x` arms a drop; the next slot key resolves it. Anything else cancels.
let pendingDrop = false;

function newGame(seed) {
  pendingDrop = false;
  game = new Game({ seed, theme: THEME, memorial });
  renderer.resize(game.level.width, game.level.height);
  redraw();
}

function redraw() {
  renderer.draw(game);
  panel.update(game);
  document.body.classList.toggle('over', game.state !== 'playing');
}

function handleIntent(intent) {
  if (intent.type === 'restart') {
    // Debug hook: poke at the live game from the browser console.
globalThis.crusade = { get game() { return game; }, memorial, newGame, makeItem, ITEMS, gainXp };

newGame();

// The canvas measures the font at draw time, so a first paint before IBM Plex
// Mono arrives would lay the glyph grid out in the fallback face.
globalThis.document?.fonts?.ready.then(redraw);
    return;
  }
  if (game.state !== 'playing') return;

  const wasPendingDrop = pendingDrop;
  pendingDrop = false;

  let acted = false;
  switch (intent.type) {
    case 'move': acted = moveOrAttack(game, game.player, intent.dx, intent.dy); break;
    case 'wait': acted = wait(); break;
    case 'pickup': acted = pickUp(game, game.player); break;
    case 'use':
      acted = wasPendingDrop
        ? dropItem(game, game.player, intent.index)
        : useItem(game, game.player, intent.index);
      break;
    case 'drop':
      if (!game.player.inventory.length) game.log('Your pack is already empty.', 'textDim');
      else { pendingDrop = true; game.log('Drop which? [1-9]', 'textDim'); }
      break;
    case 'descend': acted = descend(game); break;
  }

  // Claiming the Relic ends the run mid-action; do not hand the floor back.
  if (acted && game.state === 'playing') game.playerActed();
  redraw();
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const intent = keyToIntent(event);
  if (!intent) return;
  event.preventDefault();
  handleIntent(intent);
});

// Debug hook: poke at the live game from the browser console.
globalThis.crusade = { get game() { return game; }, memorial, newGame, makeItem, ITEMS, gainXp };

newGame();
