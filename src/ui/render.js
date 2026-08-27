// Canvas glyph renderer. Draws a terminal, essentially: one monospace character
// per cell, three visibility states -- lit, remembered, unknown.
//
// Swapping this for a tileset later means changing only this file: everything
// else talks in glyphs and colour keys, never pixels.
export class Renderer {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;
    this.cellW = theme.cell.w;
    this.cellH = theme.cell.h;
  }

  /**
   * Scale the glyph grid to the space available rather than assuming a fixed
   * cell size. This is what keeps the whole game inside one viewport on any
   * screen instead of pushing the page into a scrollbar.
   */
  fit(availableWidth, availableHeight, cols, rows) {
    const RATIO = 0.62;                        // a monospace cell is taller than wide
    let cellH = Math.floor(availableHeight / rows);
    let cellW = Math.round(cellH * RATIO);

    if (cellW * cols > availableWidth) {
      cellW = Math.floor(availableWidth / cols);
      cellH = Math.round(cellW / RATIO);
    }

    this.cellW = Math.max(4, cellW);
    this.cellH = Math.max(7, cellH);
    this.resize(cols, rows);
  }

  resize(widthInCells, heightInCells) {
    const dpr = globalThis.devicePixelRatio || 1;
    const w = widthInCells * this.cellW;
    const h = heightInCells * this.cellH;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(game) {
    const { ctx, theme } = this;
    const level = game.level;
    const colors = game.palette();  // region tint applied

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = Math.round(this.cellH * 0.78) + 'px '
      + (theme.fontFamily ?? 'monospace');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Terrain, in two passes of brightness.
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const visible = level.visible.get(x, y);
        const explored = level.explored.get(x, y);
        if (!visible && !explored) continue;

        const tile = level.tiles.get(x, y);
        const base = colors[tile.key] ?? colors.text;
        this.putGlyph(x, y, tile.glyph, visible ? base : dim(base, colors.bg, 0.62));
      }
    }

    // Entities, but only where the player can actually see. Corpses and items
    // draw under anything standing on them.
    const sorted = [...level.entities].sort((a, b) => layer(a) - layer(b));
    for (const e of sorted) {
      if (!level.visible.get(e.x, e.y)) continue;
      this.putGlyph(e.x, e.y, e.glyph, colors[e.color] ?? colors.text);
    }
  }

  putGlyph(x, y, glyph, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillText(glyph, x * this.cellW + this.cellW / 2, y * this.cellH + this.cellH / 2 + 1);
  }
}

function layer(entity) {
  if (entity.isPlayer) return 3;
  if (entity.ai && entity.alive) return 2;
  if (entity.item) return 1;
  return 0;
}

/** Blend `hex` toward `toward` by `amount` -- how remembered tiles are dimmed. */
function dim(hex, toward, amount) {
  const a = parseHex(hex);
  const b = parseHex(toward);
  const mix = a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount));
  return 'rgb(' + mix.join(',') + ')';
}

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
