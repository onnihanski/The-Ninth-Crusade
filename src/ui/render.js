// ---------------------------------------------------------------------------
// Canvas renderer.
//
// Terrain is drawn as ground rather than lettering: walls are filled mass with
// a lit rim on every face that meets open floor, and floors are a tinted wash.
// Only things that are *objects* -- stairs, gates, doors, monsters, items, the
// crusader -- are still drawn as glyphs.
//
// This is what makes the four region silhouettes legible. In '#' and '.' the
// Choir's pillared halls and the Empty Tomb's caves look nearly identical; as
// solid mass they read as completely different places.
//
// Everything outside this file still talks in glyphs and colour keys, never
// pixels, so a tileset would replace `putGlyph` and the fills and touch nothing
// else.
// ---------------------------------------------------------------------------

/** Faces of a wall cell, and which side of the cell each one draws on. */
const FACES = [
  { dx: 0, dy: -1, side: 'top' },
  { dx: 1, dy: 0, side: 'right' },
  { dx: 0, dy: 1, side: 'bottom' },
  { dx: -1, dy: 0, side: 'left' },
];

const REMEMBERED = 0.62;      // how far unlit ground fades toward the background

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

  /**
   * The shades this floor is drawn in, derived from the region's own two
   * colours. Regions keep defining just `wall` and `floor`; the mass, the rim
   * and the wash all fall out of those, so a new region needs no new palette.
   */
  shades(colors) {
    const bg = colors.bg;

    // Rock reads as lit mass and floor as the dark you walk on, so the two
    // are pushed apart rather than sitting at the same value. The region's
    // `floor` colour is the lighter of its two, so it takes the heavier fade.
    return {
      wallLit: mix(colors.wall, bg, 0.38),
      wallDim: mix(colors.wall, bg, 0.60),
      rimLit: mix(colors.wall, '#ffffff', 0.18),
      rimDim: mix(colors.wall, bg, 0.50),
      faceLit: mix(colors.wall, '#ffffff', 0.35),   // the side a light from above falls on
      floorLit: mix(colors.floor, bg, 0.76),
      floorDim: mix(colors.floor, bg, 0.84),
    };
  }

  draw(game) {
    const { ctx } = this;
    const level = game.level;
    const colors = game.palette();
    const shade = this.shades(colors);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGround(level, shade);
    this.drawWallFaces(level, shade);
    this.drawTileGlyphs(level, colors);
    this.drawEntities(level, colors);
  }

  /** Pass one: every known cell is filled, as mass or as floor. */
  drawGround(level, shade) {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const visible = level.visible.get(x, y);
        if (!visible && !level.explored.get(x, y)) continue;

        const tile = level.tiles.get(x, y);
        if (tile.walkable) {
          // A touch of grain, fixed per tile, so a floor is not a flat slab.
          const grain = (hash(x, y) - 0.5) * 0.022;
          this.fillCell(x, y, shiftLightness(visible ? shade.floorLit : shade.floorDim, grain));
        } else {
          this.fillCell(x, y, visible ? shade.wallLit : shade.wallDim);
        }
      }
    }
  }

  /**
   * Pass two: a lit rim on every wall face that meets open ground. This is the
   * whole trick -- an unbroken block of colour reads as nothing, and the same
   * block with its edges picked out reads as architecture.
   */
  drawWallFaces(level, shade) {
    const { ctx } = this;
    const thickness = Math.max(1, Math.round(this.cellH * 0.09));

    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const visible = level.visible.get(x, y);
        if (!visible && !level.explored.get(x, y)) continue;
        if (level.tiles.get(x, y).walkable) continue;

        for (const { dx, dy, side } of FACES) {
          const nx = x + dx;
          const ny = y + dy;
          if (!level.tiles.inBounds(nx, ny)) continue;

          const neighbourKnown = level.visible.get(nx, ny) || level.explored.get(nx, ny);
          if (!neighbourKnown || !level.tiles.get(nx, ny).walkable) continue;

          // The south face is the one a light from above would fall on, so it
          // gets the brightest treatment and the block gains a little depth.
          const lit = visible || level.visible.get(nx, ny);
          ctx.fillStyle = side === 'bottom'
            ? (lit ? shade.faceLit : shade.rimDim)
            : (lit ? shade.rimLit : shade.rimDim);

          const px = x * this.cellW;
          const py = y * this.cellH;
          if (side === 'top') ctx.fillRect(px, py, this.cellW, thickness);
          if (side === 'bottom') ctx.fillRect(px, py + this.cellH - thickness, this.cellW, thickness);
          if (side === 'left') ctx.fillRect(px, py, thickness, this.cellH);
          if (side === 'right') ctx.fillRect(px + this.cellW - thickness, py, thickness, this.cellH);
        }
      }
    }
  }

  /** Pass three: terrain that is an object rather than ground keeps its glyph. */
  drawTileGlyphs(level, colors) {
    this.prepareText();
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const visible = level.visible.get(x, y);
        if (!visible && !level.explored.get(x, y)) continue;

        const tile = level.tiles.get(x, y);
        if (!tile.drawGlyph) continue;
        const base = colors[tile.key] ?? colors.text;
        this.putGlyph(x, y, tile.glyph, visible ? base : mix(base, colors.bg, REMEMBERED));
      }
    }
  }

  /**
   * Pass four: entities, only where the player can actually see. Corpses and
   * items draw under anything standing on them.
   */
  drawEntities(level, colors) {
    this.prepareText();
    const sorted = [...level.entities].sort((a, b) => layer(a) - layer(b));
    for (const e of sorted) {
      if (!level.visible.get(e.x, e.y)) continue;
      this.putGlyph(e.x, e.y, e.glyph, colors[e.color] ?? colors.text);
    }
  }

  prepareText() {
    const { ctx } = this;
    ctx.font = Math.round(this.cellH * 0.78) + 'px '
      + (this.theme.fontFamily ?? 'monospace');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
  }

  fillCell(x, y, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x * this.cellW, y * this.cellH, this.cellW, this.cellH);
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

/** Stable per-tile noise, so floor grain never shimmers between frames. */
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Blend `hex` toward `toward` by `amount`. */
function mix(hex, toward, amount) {
  const a = parseHex(hex);
  const b = parseHex(toward);
  return 'rgb(' + a.map((channel, i) =>
    Math.round(channel + (b[i] - channel) * amount)).join(',') + ')';
}

function shiftLightness(color, amount) {
  const [r, g, b] = parseColor(color);
  const shift = Math.round(255 * amount);
  return 'rgb(' + [r, g, b]
    .map((channel) => Math.max(0, Math.min(255, channel + shift)))
    .join(',') + ')';
}

function parseColor(color) {
  return color.startsWith('#') ? parseHex(color) : parseRgb(color);
}

function parseHex(hex) {
  if (!hex.startsWith('#')) return parseRgb(hex);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseRgb(value) {
  const parts = value.match(/-?\d+/g);
  return parts ? parts.slice(0, 3).map(Number) : [0, 0, 0];
}
