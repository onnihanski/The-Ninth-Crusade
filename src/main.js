import { Game } from './game/game.js';
import {
  moveOrAttack, wait, pickUp, useItem, dropItem, fire, descend,
} from './game/actions.js';
import { Memorial, browserStorage } from './game/memorial.js';
import { makeItem, makeMonster } from './game/entity.js';
import { gainXp } from './game/progress.js';
import { ITEMS } from './data/items.js';
import { MONSTERS } from './data/monsters.js';
import { THEME } from './data/theme.js';
import { roman } from './data/names.js';
import { Renderer } from './ui/render.js';
import { Panel } from './ui/panel.js';
import { keyToIntent } from './ui/input.js';

// Bootstrap: owns the browser-facing bits and nothing else. All rules live in
// game/, which is why the whole game is testable under node.
const NAME_KEY = 'ninth-crusade.name.v1';

const stage = document.getElementById('stage');
const canvas = document.getElementById('screen');
const storyEl = document.getElementById('story');
const storyTitle = document.getElementById('story-title');
const storyLines = document.getElementById('story-lines');
const storyMechanic = document.getElementById('story-mechanic');
const crusaderEl = document.getElementById('crusader');
const renameButton = document.getElementById('rename');
const renameInput = document.getElementById('rename-input');

const renderer = new Renderer(canvas, THEME);
const panel = new Panel(document, THEME);

// One memorial for the whole browser: it outlives every run, which is the point.
const memorial = new Memorial(browserStorage());
let game;
let pendingDrop = false;   // `x` arms a drop; the next slot key resolves it
let renaming = false;

// -- naming -----------------------------------------------------------------

function storedName() {
  try {
    return globalThis.localStorage?.getItem(NAME_KEY) || null;
  } catch {
    return null;
  }
}

function storeName(name) {
  // Strip any numeral so the next crusader gets their own rather than stacking.
  const base = name.replace(/\s+[IVXLCDM]+$/i, '').trim();
  try {
    globalThis.localStorage?.setItem(NAME_KEY, base);
  } catch {
    // A disabled store costs us the preference, never the run.
  }
}

function startRename() {
  if (renaming || game.state !== 'playing') return;
  renaming = true;
  crusaderEl.hidden = true;
  renameButton.hidden = true;
  renameInput.hidden = false;
  renameInput.value = game.crusaderName;
  renameInput.focus();
  renameInput.select();
}

function finishRename(save) {
  if (!renaming) return;
  renaming = false;
  const value = renameInput.value;
  renameInput.hidden = true;
  crusaderEl.hidden = false;
  renameButton.hidden = false;
  if (save && value.trim()) {
    game.renameCrusader(value);
    storeName(value);
  }
  redraw();
}

renameButton.addEventListener('click', startRename);
renameInput.addEventListener('keydown', (event) => {
  event.stopPropagation();                     // the input owns the keyboard
  if (event.key === 'Enter') finishRename(true);
  if (event.key === 'Escape') finishRename(false);
});
renameInput.addEventListener('blur', () => finishRename(true));

// -- the story card ---------------------------------------------------------

function renderStory() {
  const card = game.pendingStory();
  if (!card) {
    storyEl.hidden = true;
    return;
  }
  storyTitle.textContent = card.title;
  storyLines.replaceChildren(...card.lines.map((line) => {
    const p = document.createElement('p');
    p.textContent = line;
    return p;
  }));
  storyMechanic.textContent = card.mechanic ?? '';
  storyEl.hidden = false;
}

// -- lifecycle --------------------------------------------------------------

function newGame(seed) {
  pendingDrop = false;
  game = new Game({ seed, theme: THEME, memorial });

  // A player who has named themselves gets that name, numbered.
  const base = storedName();
  if (base) game.renameCrusader(base + ' ' + roman(memorial.runNumber()));

  fitScreen();
}

/** Scale the map to whatever room the stage has, so the page never scrolls. */
function fitScreen() {
  const rect = stage.getBoundingClientRect();
  renderer.fit(rect.width - 2, rect.height - 2, game.level.width, game.level.height);
  redraw();
}

function redraw() {
  renderer.draw(game);
  panel.update(game);
  renderStory();
  document.body.classList.toggle('over', game.state !== 'playing');
}

function handleIntent(intent) {
  if (intent.type === 'restart') {
    newGame();
    return;
  }
  if (intent.type === 'rename') {
    startRename();
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
    case 'fire': acted = fire(game, game.player); break;
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
  if (renaming) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  // A story card holds the floor: any key reads on, and none of them is a turn.
  if (game.pendingStory()) {
    event.preventDefault();
    game.dismissStory();
    redraw();
    return;
  }

  const intent = keyToIntent(event);
  if (!intent) return;
  event.preventDefault();
  handleIntent(intent);
});

window.addEventListener('resize', () => fitScreen());

// Debug hook: poke at the live game from the browser console.
globalThis.crusade = {
  get game() { return game; },
  memorial, newGame, makeItem, makeMonster, ITEMS, MONSTERS, gainXp,
};

newGame();

// The canvas measures the font at draw time, so a first paint before IBM Plex
// Mono arrives would lay the glyph grid out in the fallback face.
globalThis.document?.fonts?.ready.then(fitScreen);
