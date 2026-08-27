import { HELP } from './input.js';
import { effectivePower, effectiveDefense, effectiveSpeed } from '../game/status.js';
import { xpToNext } from '../game/progress.js';

// The HTML side of the UI: who you are, where you are, what you are carrying,
// and what the dungeon has been saying.
export class Panel {
  constructor(root, theme) {
    this.theme = theme;
    this.el = {};
    for (const id of ['depth', 'region', 'hp-fill', 'hp-text', 'stats', 'statuses',
      'inventory', 'worn', 'seals', 'log', 'seed', 'help', 'title', 'tagline', 'crusader',
      'level', 'xp-fill', 'xp-text']) {
      this.el[id] = root.querySelector('#' + id);
    }

    this.el.title.textContent = theme.name;
    this.el.tagline.textContent = theme.tagline;
    this.el.help.innerHTML = HELP
      .map(([label, keys]) => '<li><span>' + label + '</span><kbd>' + keys + '</kbd></li>')
      .join('');
  }

  update(game) {
    const p = game.player;
    const colors = game.palette();
    const ratio = Math.max(0, p.hp) / p.maxHp;

    this.el.crusader.textContent = game.crusaderName;
    this.el.region.textContent = game.region.name;
    this.el.region.style.color = colors.notable;
    this.el.depth.textContent = this.theme.strings.floorLabel + ' ' + game.level.depth
      + (game.level.sealed ? '  — sealed' : '');

    this.el['hp-fill'].style.width = (ratio * 100).toFixed(1) + '%';
    this.el['hp-fill'].style.background =
      ratio > 0.5 ? colors.good : ratio > 0.25 ? colors.notable : colors.bad;
    this.el['hp-text'].textContent = Math.max(0, p.hp) + ' / ' + p.maxHp;

    const need = xpToNext(p.level);
    this.el.level.textContent = 'Level ' + p.level;
    this.el['xp-fill'].style.width = (100 * Math.min(1, p.xp / need)).toFixed(1) + '%';
    this.el['xp-fill'].style.background = colors.xp;
    this.el['xp-text'].textContent = p.xp + ' / ' + need + ' xp';
    // Show the numbers gear actually produces, not the naked ones.
    const speed = effectiveSpeed(p);
    this.el.stats.innerHTML =
      stat('power', effectivePower(p), p.power, colors)
      + stat('defense', effectiveDefense(p), p.defense, colors)
      + stat('speed', speed, 100, colors);

    this.el.statuses.innerHTML = (p.statuses ?? [])
      .map((s) => '<span class="tag" style="color:' + colors.good + '">'
        + s.kind + ' +' + s.amount + ' (' + s.turns + ')</span>')
      .join(' ');

    this.el.inventory.innerHTML = p.inventory.length
      ? p.inventory.map((item, i) => {
        const color = colors[item.color] ?? colors.text;
        return '<li><kbd>' + (i + 1) + '</kbd> '
          + '<span style="color:' + color + '">' + escapeHtml(item.name) + '</span></li>';
      }).join('')
      : '<li class="empty">(empty)</li>';

    const SLOTS = [['weapon', 'held'], ['shield', 'shield'], ['armour', 'worn']];
    this.el.worn.innerHTML = SLOTS.map(([slot, label]) => {
      const item = p.equipment?.[slot];
      const value = item
        ? '<span style="color:' + (colors[item.color] ?? colors.gear) + '">'
          + escapeHtml(item.name) + '</span>'
        : '<span class="empty">—</span>';
      return '<li><span class="slot">' + label + '</span>' + value + '</li>';
    }).join('');

    const seals = game.seals();
    this.el.seals.innerHTML = seals.length
      ? seals.map((s) => '<span class="tag" style="color:' + colors.seal + '">'
        + escapeHtml(s.name) + '</span>').join(' ')
      : '<span class="empty">none yet</span>';

    const recent = game.messages.slice(-14);
    this.el.log.innerHTML = recent.map((m, i) => {
      const color = colors[m.color] ?? colors.text;
      const faded = i < recent.length - 5 ? 0.5 : 1;
      const suffix = m.count > 1 ? ' <em>x' + m.count + '</em>' : '';
      return '<li style="color:' + color + ';opacity:' + faded + '">'
        + escapeHtml(m.text) + suffix + '</li>';
    }).join('');
    this.el.log.scrollTop = this.el.log.scrollHeight;

    this.el.seed.textContent = 'seed ' + game.seed + '  ·  crusade #' + game.memorial.runNumber();
  }
}

/** A stat, with its modified value called out when gear has changed it. */
function stat(label, value, base, colors) {
  const color = value === base ? colors.textDim : value > base ? colors.good : colors.bad;
  return '<span class="stat">' + label
    + ' <b style="color:' + color + '">' + value + '</b></span>';
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
