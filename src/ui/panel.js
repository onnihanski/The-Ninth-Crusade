import { HELP } from './input.js';
import { effectivePower, effectiveDefense, effectiveSpeed, rangedProfile } from '../game/status.js';
import { xpToNext } from '../game/progress.js';
import { ITEMS, SLOTS, itemCategory, describeItem } from '../data/items.js';

// The HTML side of the UI: who you are, where you are, what you are carrying,
// and what the dungeon has been saying.
export class Panel {
  constructor(root, theme) {
    this.theme = theme;
    this.el = {};
    for (const id of ['depth', 'region', 'hp-fill', 'hp-text', 'stats', 'statuses',
      'inventory', 'worn', 'seals', 'log', 'seed', 'help', 'title', 'tagline', 'crusader',
      'level', 'xp-fill', 'xp-text', 'tooltip']) {
      this.el[id] = root.querySelector('#' + id);
    }

    // The pack and kit lists are rebuilt only when their contents change, so a
    // tooltip does not blink out from under the pointer every turn.
    this.kitSignature = null;

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
      + stat('speed', speed, 100, colors)
      + (rangedProfile(p)
        ? '<span class="stat">' + (p.reloadLeft > 0
          ? '<b style="color:' + colors.bad + '">reloading</b>'
          : '<b style="color:' + colors.good + '">loaded</b>') + '</span>'
        : '');

    this.el.statuses.innerHTML = (p.statuses ?? [])
      .map((s) => '<span class="tag" style="color:' + colors.good + '">'
        + s.kind + ' +' + s.amount + ' (' + s.turns + ')</span>')
      .join(' ');

    this.renderKit(game, colors);

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

const SLOT_LABEL = { weapon: 'held', shield: 'shield', armour: 'worn' };

/** A stat, with its modified value called out when gear has changed it. */
function stat(label, value, base, colors) {
  const color = value === base ? colors.textDim : value > base ? colors.good : colors.bad;
  return '<span class="stat">' + label
    + ' <b style="color:' + color + '">' + value + '</b></span>';
}

Panel.prototype.renderKit = function renderKit(game, colors) {
  const p = game.player;
  const signature = p.inventory.map((i) => i.item.key).join(',')
    + '|' + SLOTS.map((slot) => p.equipment[slot]?.item.key ?? '-').join(',');
  if (signature === this.kitSignature) return;
  this.kitSignature = signature;

  this.el.worn.innerHTML = SLOTS.map((slot) => {
    const item = p.equipment[slot];
    const label = '<span class="slot">' + SLOT_LABEL[slot] + '</span>';
    if (!item) return '<li>' + label + '<span class="empty">—</span></li>';
    const color = colors[item.color] ?? colors.gear;
    return '<li data-item="' + item.item.key + '" tabindex="0">' + label
      + '<span style="color:' + color + '">' + escapeHtml(item.name) + '</span></li>';
  }).join('');

  this.el.inventory.innerHTML = p.inventory.length
    ? p.inventory.map((item, i) => {
      const spec = ITEMS[item.item.key] ?? item.item;
      const color = colors[item.color] ?? colors.text;
      return '<li data-item="' + item.item.key + '" tabindex="0">'
        + '<kbd>' + (i + 1) + '</kbd> '
        + '<span class="iname" style="color:' + color + '">' + escapeHtml(item.name) + '</span>'
        + '<span class="icat">' + escapeHtml(itemCategory(spec)) + '</span></li>';
    }).join('')
    : '<li class="empty">(empty)</li>';

  this.bindTooltips(colors);
};

/**
 * Hovering an item explains what it does and where it came from. The mechanics
 * half is derived from the item data rather than written out again, so it can
 * never drift from what the game actually does.
 */
Panel.prototype.bindTooltips = function bindTooltips(colors) {
  const tip = this.el.tooltip;
  const rows = [
    ...this.el.inventory.querySelectorAll('[data-item]'),
    ...this.el.worn.querySelectorAll('[data-item]'),
  ];

  const show = (row) => {
    const spec = ITEMS[row.dataset.item];
    if (!spec) return;
    const d = describeItem(spec);
    const meta = [d.category, d.rarity].filter(Boolean).join(' · ');
    tip.innerHTML =
      '<h3 style="color:' + (colors[spec.color] ?? colors.text) + '">'
      + escapeHtml(d.name) + '</h3>'
      + '<div class="tip-meta">' + escapeHtml(meta) + '</div>'
      + '<ul>' + d.effects.map((e) => '<li>' + escapeHtml(e) + '</li>').join('') + '</ul>'
      + '<p class="tip-lore">' + escapeHtml(d.lore) + '</p>';
    tip.hidden = false;
    tip.setAttribute('aria-hidden', 'false');

    // Sits to the left of the panel, clamped into the viewport.
    const rect = row.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const left = Math.max(8, rect.left - box.width - 12);
    const top = Math.min(
      Math.max(8, rect.top - 8),
      Math.max(8, window.innerHeight - box.height - 8),
    );
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };

  const hide = () => {
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
  };

  for (const row of rows) {
    row.addEventListener('mouseenter', () => show(row));
    row.addEventListener('focus', () => show(row));
    row.addEventListener('mouseleave', hide);
    row.addEventListener('blur', hide);
  }
  hide();
};

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
