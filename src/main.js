import { Game } from './game/game.js';
import { moveOrAttack, wait, pickUp, useItem, descend } from './game/actions.js';
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

function newGame(seed) {
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
globalThis.crusade = { get game() { return game; }, memorial, newGame };

newGame();
    return;
  }
  if (game.state !== 'playing') return;

  let acted = false;
  switch (intent.type) {
    case 'move': acted = moveOrAttack(game, game.player, intent.dx, intent.dy); break;
    case 'wait': acted = wait(); break;
    case 'pickup': acted = pickUp(game, game.player); break;
    case 'use': acted = useItem(game, game.player, intent.index); break;
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
globalThis.crusade = { get game() { return game; }, memorial, newGame };

newGame();
