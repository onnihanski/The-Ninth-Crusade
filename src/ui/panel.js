import { HELP } from './input.js';

// The HTML side of the UI: stats, inventory, message log, help.
export class Panel {
  constructor(root, theme) {
    this.theme = theme;
    this.el = {
      depth: root.querySelector('#depth'),
      hpFill: root.querySelector('#hp-fill'),
      hpText: root.querySelector('#hp-text'),
      stats: root.querySelector('#stats'),
      inventory: root.querySelector('#inventory'),
      log: root.querySelector('#log'),
      seed: root.querySelector('#seed'),
      help: root.querySelector('#help'),
      title: root.querySelector('#title'),
      tagline: root.querySelector('#tagline'),
    };

    this.el.title.textContent = theme.name;
    this.el.tagline.textContent = theme.tagline;
    this.el.help.innerHTML = HELP
      .map(([label, keys]) => '<li><span>' + label + '</span><kbd>' + keys + '</kbd></li>')
      .join('');
  }

  update(game) {
    const p = game.player;
    const ratio = Math.max(0, p.hp) / p.maxHp;

    this.el.depth.textContent = this.theme.strings.floorLabel + ' ' + game.level.depth;
    this.el.hpFill.style.width = (ratio * 100).toFixed(1) + '%';
    this.el.hpFill.style.background =
      ratio > 0.5 ? this.theme.colors.good
        : ratio > 0.25 ? this.theme.colors.notable
          : this.theme.colors.bad;
    this.el.hpText.textContent = Math.max(0, p.hp) + ' / ' + p.maxHp;
    this.el.stats.textContent = 'power ' + p.power + '   defense ' + p.defense;
    this.el.seed.textContent = 'seed ' + game.seed;

    this.el.inventory.innerHTML = p.inventory.length
      ? p.inventory.map((item, i) =>
        '<li><kbd>' + (i + 1) + '</kbd> ' + escapeHtml(item.name) + '</li>').join('')
      : '<li class="empty">(empty)</li>';

    const recent = game.messages.slice(-12);
    this.el.log.innerHTML = recent.map((m, i) => {
      const color = this.theme.colors[m.color] ?? this.theme.colors.text;
      const faded = i < recent.length - 4 ? 0.55 : 1;
      const suffix = m.count > 1 ? ' <em>x' + m.count + '</em>' : '';
      return '<li style="color:' + color + ';opacity:' + faded + '">'
        + escapeHtml(m.text) + suffix + '</li>';
    }).join('');
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
