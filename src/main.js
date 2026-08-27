import { Game } from './game/game.js';
import { moveOrAttack, wait, pickUp, useItem, descend } from './game/actions.js';
import { THEME } from './data/theme.js';
import { Renderer } from './ui/render.js';
import { Panel } from './ui/panel.js';
import { keyToIntent } from './ui/input.js';

// Bootstrap: owns the browser-facing bits and nothing else. All rules live in
// game/, which is why the whole game is testable under node.
const canvas = document.getElementById('screen');
const renderer = new Renderer(canvas, THEME);
const panel = new Panel(document, THEME);

let game;

function newGame(seed) {
  game = new Game({ seed, theme: THEME });
  renderer.resize(game.level.width, game.level.height);
  redraw();
}

function redraw() {
  renderer.draw(game);
  panel.update(game);
  document.body.classList.toggle('dead', game.state === 'dead');
}

function handleIntent(intent) {
  if (intent.type === 'restart') {
    newGame();
    return;
  }
  if (game.state === 'dead') return;

  let acted = false;
  switch (intent.type) {
    case 'move': acted = moveOrAttack(game, game.player, intent.dx, intent.dy); break;
    case 'wait': acted = wait(); break;
    case 'pickup': acted = pickUp(game, game.player); break;
    case 'use': acted = useItem(game, game.player, intent.index); break;
    case 'descend': acted = descend(game); break;
  }

  if (acted) game.playerActed();
  redraw();
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const intent = keyToIntent(event);
  if (!intent) return;
  event.preventDefault();
  handleIntent(intent);
});

newGame();
