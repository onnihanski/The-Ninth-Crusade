import { HELP } from './input.js';
import {
  effectivePower, effectiveDefense, effectiveSpeed, rangedProfile,
  sanctuaryBonus, hasTrait,
} from '../game/status.js';
import { heirloomBonus } from '../data/traits.js';
import { xpToNext } from '../game/progress.js';
import { ITEMS, SLOTS, itemCategory, describeItem } from '../data/items.js';

// The HTML side of the UI: who you are, where you are, what you are carrying,
// and what the dungeon has been saying.
export class Panel {
  constructor(root, theme) {
    this.theme = theme;
    this.el = {};
    for (const id of ['depth', 'region', 'hp-fill', 'hp-text', 'stats', 'statuses',
      'inventory', 'worn', 'seals', 'log', 'seed', 'help', 'title', 'crusader',
      'level', 'xp-fill', 'xp-text', 'tooltip', 'rename']) {
      this.el[id] = root.querySelector('#' + id);
    }

    // The pack and kit lists are rebuilt only when their contents change, so a
    // tooltip does not blink out from under the pointer every turn.
    this.kitSignature = null;

    this.el.title.textContent = theme.name;
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

    const stances = (p.statuses ?? []).map((s) =>
      '<span class="tag" style="color:' + colors.good + '">'
      + s.kind + ' +' + s.amount + ' (' + s.turns + ')</span>');

    const sanctuary = sanctuaryBonus(p);
    if (sanctuary > 0) {
      stances.push('<span class="tag" style="color:' + colors.mythic + '">sanctuary +'
        + sanctuary + '</span>');
    }
    if (hasTrait(p, 'block')) {
      stances.push(p.blockCooldown > 0
        ? '<span class="tag" style="color:' + colors.bad + '">shield down (' + p.blockCooldown + ')</span>'
        : '<span class="tag" style="color:' + colors.good + '">shield up</span>');
    }
    this.el.statuses.innerHTML = stances.join(' ');

    this.game = game;
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
  const stamp = (item) => item
    ? item.item.key + (item.item.heirloom ? '#' + item.item.heirloom.marks : '')
    : '-';
  const signature = p.inventory.map(stamp).join(',')
    + '|' + SLOTS.map((slot) => stamp(p.equipment[slot])).join(',');
  if (signature === this.kitSignature) return;
  this.kitSignature = signature;

  this.el.worn.innerHTML = SLOTS.map((slot) => {
    const item = p.equipment[slot];
    const label = '<span class="slot">' + SLOT_LABEL[slot] + '</span>';
    if (!item) return '<li>' + label + '<span class="empty">—</span></li>';
    const color = colors[item.color] ?? colors.gear;
    return '<li data-source="kit" data-slot="' + slot + '" tabindex="0">' + label
      + '<span style="color:' + color + '">' + escapeHtml(item.name) + '</span>'
      + heirloomMark(item, colors) + '</li>';
  }).join('');

  this.el.inventory.innerHTML = p.inventory.length
    ? p.inventory.map((item, i) => {
      const spec = ITEMS[item.item.key] ?? item.item;
      const color = colors[item.color] ?? colors.text;
      return '<li data-source="pack" data-index="' + i + '" tabindex="0">'
        + '<kbd>' + (i + 1) + '</kbd> '
        + '<span class="iname" style="color:' + color + '">' + escapeHtml(item.name)
        + '</span>' + heirloomMark(item, colors)
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
    ...this.el.inventory.querySelectorAll('[data-source]'),
    ...this.el.worn.querySelectorAll('[data-source]'),
  ];

  const instanceFor = (row) => {
    const p = this.game?.player;
    if (!p) return null;
    return row.dataset.source === 'kit'
      ? p.equipment[row.dataset.slot]
      : p.inventory[Number(row.dataset.index)];
  };

  const show = (row) => {
    const instance = instanceFor(row);
    const spec = instance && ITEMS[instance.item.key];
    if (!spec) return;
    const d = describeItem(spec, instance.item);
    const meta = [d.category, d.rarity].filter(Boolean).join(' · ');
    tip.innerHTML =
      '<h3 style="color:' + (colors[spec.color] ?? colors.text) + '">'
      + escapeHtml(d.name) + '</h3>'
      + '<div class="tip-meta">' + escapeHtml(meta) + '</div>'
      + (d.trait
        ? '<div class="tip-trait" style="color:' + colors.mythic + '">'
          + escapeHtml(d.trait.label) + '</div>'
          + '<p class="tip-trait-text">' + escapeHtml(d.trait.text) + '</p>'
        : '')
      + '<ul>' + d.effects.map((e) => '<li>' + escapeHtml(e) + '</li>').join('') + '</ul>'
      + (d.heirloom
        ? '<p class="tip-heirloom" style="color:' + colors.revenant + '">+'
          + d.heirloom.bonus + ' — ' + escapeHtml(d.heirloom.label) + '</p>'
        : '')
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

/** Gear taken off a predecessor wears its bonus openly in the list. */
function heirloomMark(item, colors) {
  const bonus = heirloomBonus(item.item.heirloom);
  if (!bonus) return '';
  return '<span class="heir" style="color:' + colors.revenant + '">+' + bonus + '</span>';
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
