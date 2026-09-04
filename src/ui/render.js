// ---------------------------------------------------------------------------
// Canvas renderer.
//
// Terrain is drawn as ground rather than lettering: walls are filled mass with
// a lit rim on every face that meets open floor, and floors are a tinted wash.
// Only things that are *objects* are drawn on top of it -- doors, gates,
// monsters, items and the crusader as icons, the stairs as the one piece of
// punctuation worth keeping.
//
// The view is not always the floor. Inside a boss arena it is the arena, scaled
// up to fill the same stage, with health bars in bands above and below it; see
// `layout` and `Game.arenaView`.
//
// This is what makes the four region silhouettes legible. In '#' and '.' the
// Choir's pillared halls and the Empty Tomb's caves look nearly identical; as
// solid mass they read as completely different places.
//
// Everything outside this file still talks in glyphs and colour keys, never
// pixels, so a tileset would replace `putGlyph` and the fills and touch nothing
// else.
// ---------------------------------------------------------------------------

import { ICONS, TILE_ICONS } from '../data/icons.js';
import { makePainter } from './painter.js';

/** Faces of a wall cell, and which side of the cell each one draws on. */
const FACES = [
  { dx: 0, dy: -1, side: 'top' },
  { dx: 1, dy: 0, side: 'right' },
  { dx: 0, dy: 1, side: 'bottom' },
  { dx: -1, dy: 0, side: 'left' },
];

const REMEMBERED = 0.62;      // how far unlit ground fades toward the background

// Light falloff. Visibility used to be a switch -- lit or remembered -- which
// made the edge of sight a hard line and gave the torch no presence at all.
// A lit cell now sits somewhere on a ramp between the two shades according to
// its distance from the crusader, so the two states became one continuum and
// no new colours were needed to do it.
const LIGHT_STEPS = 12;       // rungs on the ramp; enough to avoid banding
const EDGE_FADE = 0.82;       // how far the last ring of sight falls toward dark
const FALLOFF = 1.5;          // >1 keeps the near ring bright and drops off late

export class Renderer {
  constructor(canvas, theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = theme;
    this.cellW = theme.cell.w;
    this.cellH = theme.cell.h;
  }

  /**
   * Remember how much room there is. The cell size is not decided here any
   * more: it depends on how much of the map is being shown, and that changes
   * the moment a crusader steps into a boss arena.
   */
  fit(availableWidth, availableHeight, cols, rows) {
    this.available = { w: Math.max(1, availableWidth), h: Math.max(1, availableHeight) };
    this.mapCols = cols;
    this.mapRows = rows;
    this.laidOut = null;                      // force a re-layout on the next draw
  }

  /**
   * Work out the cell size for one view and size the canvas to match.
   *
   * A view of the whole floor gives small cells; a view of one room gives large
   * ones, from the same code and the same stage. Bands are reserved above and
   * below for the health bars when there are health bars to draw, so the bars
   * never sit on top of the floor being fought over.
   */
  layout(view, withBars) {
    const key = [view.x, view.y, view.w, view.h, withBars,
      this.available.w, this.available.h].join(':');
    if (this.laidOut === key) return;
    this.laidOut = key;

    // Sized from the stage rather than from the cell, because the cell size is
    // what we are about to work out.
    this.bandH = withBars ? Math.max(18, Math.round(this.available.h * 0.075)) : 0;

    // Square cells. They were taller than wide because a cell used to hold a
    // monospace letter; nothing depends on a text grid any more, and square
    // ground reads as tiles rather than as bricks stood on end.
    const cell = Math.min(
      Math.floor(this.available.w / view.w),
      Math.floor((this.available.h - this.bandH * 2) / view.h),
    );

    this.cellW = Math.max(4, cell);
    this.cellH = this.cellW;
    this.originX = view.x;
    this.originY = view.y;
    this.resize(view.w * this.cellW, view.h * this.cellH + this.bandH * 2);
  }

  resize(w, h) {
    const dpr = globalThis.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Cell coordinates to pixels, through whatever view is current. */
  px(x) { return (x - this.originX) * this.cellW; }

  py(y) { return (y - this.originY) * this.cellH + this.bandH; }

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
    const wallLit = mix(colors.wall, bg, 0.26);
    const wallDim = mix(colors.wall, bg, 0.74);
    const rimLit = mix(colors.wall, '#ffffff', 0.18);
    const rimDim = mix(colors.wall, bg, 0.62);
    const faceLit = mix(colors.wall, '#ffffff', 0.35);  // the side a light from above falls on
    const floorLit = mix(colors.floor, bg, 0.60);
    const floorDim = mix(colors.floor, bg, 0.90);

    // Each ramp runs from the lit shade to the remembered one, so a cell at
    // the edge of the torch arrives at exactly the colour it will keep once
    // the crusader walks away from it.
    return {
      wall: ramp(wallLit, wallDim),
      floor: ramp(floorLit, floorDim),
      rim: ramp(rimLit, rimDim),
      face: ramp(faceLit, rimDim),
      wallDim, floorDim, rimDim,
    };
  }

  /** Which rung of the light ramp a cell sits on. 0 is at the crusader's feet. */
  lightAt(x, y) {
    const distance = Math.hypot(x - this.eye.x, y - this.eye.y);
    const t = Math.min(1, distance / this.radius);
    return Math.min(LIGHT_STEPS, Math.round((t ** FALLOFF) * EDGE_FADE * LIGHT_STEPS));
  }

  draw(game) {
    const { ctx } = this;
    const level = game.level;
    const colors = game.palette();
    const shade = this.shades(colors);

    this.available ??= { w: level.width * this.cellW, h: level.height * this.cellH };

    // Inside a boss arena the screen is the arena. Everywhere else it is the
    // floor. The bars come with the fight, not with the zoom, so a room the
    // boss is already dead in still reads as a room.
    const arena = game.arenaView();
    const view = arena ?? { x: 0, y: 0, w: level.width, h: level.height };
    this.layout(view, Boolean(arena));
    this.view = view;

    this.eye = { x: game.player.x, y: game.player.y };
    this.radius = Math.max(1, game.theme.fovRadius);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGround(level, shade);
    this.drawWallFaces(level, shade);
    this.drawTileGlyphs(level, colors);
    this.drawEntities(level, colors);
    if (arena) this.drawArenaBars(game, colors);
  }

  /** The cells this view covers, clamped to the map. */
  bounds(level) {
    return {
      x0: Math.max(0, this.view.x),
      y0: Math.max(0, this.view.y),
      x1: Math.min(level.width, this.view.x + this.view.w),
      y1: Math.min(level.height, this.view.y + this.view.h),
    };
  }

  /** Pass one: every known cell is filled, as mass or as floor. */
  drawGround(level, shade) {
    const { x0, y0, x1, y1 } = this.bounds(level);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const visible = level.visible.get(x, y);
        if (!visible && !level.explored.get(x, y)) continue;

        const tile = level.tiles.get(x, y);
        const rung = visible ? this.lightAt(x, y) : -1;

        if (tile.walkable) {
          // A touch of grain, fixed per tile, so a floor is not a flat slab.
          const grain = (hash(x, y) - 0.5) * 0.016;
          const base = visible ? shade.floor[rung] : shade.floorDim;
          this.fillCell(x, y, shiftLightness(base, grain));
        } else {
          this.fillCell(x, y, visible ? shade.wall[rung] : shade.wallDim);
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
    const { x0, y0, x1, y1 } = this.bounds(level);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
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
          // A face is lit by whichever of its two cells the torch reaches.
          const neighbourVisible = level.visible.get(nx, ny);
          const rung = visible ? this.lightAt(x, y)
            : neighbourVisible ? this.lightAt(nx, ny) : -1;
          ctx.fillStyle = rung < 0 ? shade.rimDim
            : (side === 'bottom' ? shade.face[rung] : shade.rim[rung]);

          const px = this.px(x);
          const py = this.py(y);
          if (side === 'top') ctx.fillRect(px, py, this.cellW, thickness);
          if (side === 'bottom') ctx.fillRect(px, py + this.cellH - thickness, this.cellW, thickness);
          if (side === 'left') ctx.fillRect(px, py, thickness, this.cellH);
          if (side === 'right') ctx.fillRect(px + this.cellW - thickness, py, thickness, this.cellH);
        }
      }
    }
  }

  /**
   * Pass three: terrain that is an object rather than ground. Doors and gates
   * are drawn as symbols -- the same unit-space silhouettes the creatures use --
   * because a barred door is a thing in the room, not a character in a sentence.
   * Anything without one falls back to its glyph, so a new tile is never blank.
   */
  drawTileGlyphs(level, colors) {
    this.prepareText();
    this.painter ??= makePainter(this.ctx);
    const { x0, y0, x1, y1 } = this.bounds(level);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const visible = level.visible.get(x, y);
        if (!visible && !level.explored.get(x, y)) continue;

        const tile = level.tiles.get(x, y);
        if (!tile.drawGlyph) continue;
        const base = colors[tile.key] ?? colors.text;
        const faded = mix(base, colors.bg, REMEMBERED);
        const tint = visible
          ? mix(base, faded, this.lightAt(x, y) / LIGHT_STEPS)
          : faded;

        const symbol = TILE_ICONS[tile.key];
        if (!symbol) {
          this.putGlyph(x, y, tile.glyph, tint);
          continue;
        }
        this.paintIcon(symbol, x, y, 0.88, tint);
      }
    }
  }

  /** Place the painter on one cell and run an icon into it. */
  paintIcon(icon, x, y, scale, color) {
    const w = this.cellW * scale;
    const h = this.cellH * scale;
    this.painter.place(
      this.px(x) + (this.cellW - w) / 2,
      this.py(y) + (this.cellH - h) / 2,
      w, h, color,
    );
    icon(this.painter);
  }

  /**
   * Pass four: entities, only where the player can actually see. Corpses and
   * items draw under anything standing on them.
   */
  drawEntities(level, colors) {
    this.prepareText();
    this.painter ??= makePainter(this.ctx);

    const { x0, y0, x1, y1 } = this.bounds(level);
    const sorted = [...level.entities].sort((a, b) => layer(a) - layer(b));
    for (const e of sorted) {
      if (!level.visible.get(e.x, e.y)) continue;
      if (e.x < x0 || e.x >= x1 || e.y < y0 || e.y >= y1) continue;

      // Something at the far edge of the torch is harder to make out, which is
      // most of what makes a lit radius feel like light rather than a mask.
      const base = colors[e.color] ?? colors.text;
      const rung = this.lightAt(e.x, e.y) / LIGHT_STEPS;
      const tint = mix(base, mix(base, colors.bg, 0.55), rung);

      // Anything without an icon -- items, and anything added later -- keeps
      // its glyph, so the map can never come up blank.
      const icon = ICONS[e.iconKey];
      if (!icon) {
        this.putGlyph(e.x, e.y, e.glyph, tint);
        continue;
      }

      // A boss draws past the edges of its own cell. It is the only thing that
      // does, and it is the cheapest way to make one loom without giving it a
      // second tile to stand on.
      this.paintIcon(icon, e.x, e.y, 0.94 * (e.iconScale ?? 1), tint);
    }
  }

  /**
   * The two bars a boss fight is actually fought on.
   *
   * The crusader's health has always been in the side panel, which is the right
   * place for it while you are walking a corridor and the wrong place for it
   * while something is hitting you: in a fight the eye does not leave the room.
   * The boss's health was nowhere at all -- you could only infer it from how
   * long you had been swinging. Both go on the screen for the length of the
   * fight, above and below the room, and nowhere else in the game.
   */
  drawArenaBars(game, colors) {
    const { ctx } = this;
    const player = game.player;
    const boss = game.arenaBoss();

    // A band dark enough that a bar drawn on it is a bar and not a smear.
    ctx.fillStyle = mix(colors.bg, '#000000', 0.45);
    ctx.fillRect(0, 0, this.width, this.bandH);
    ctx.fillRect(0, this.height - this.bandH, this.width, this.bandH);

    const font = Math.max(9, Math.round(this.bandH * 0.3));
    ctx.font = font + 'px ' + (this.theme.fontFamily ?? 'monospace');
    ctx.textBaseline = 'middle';

    if (boss) {
      const hp = Math.max(0, boss.hp);
      this.hpBar(0, colors, {
        label: boss.name,
        // A saint who has already declined once says so on the bar, because
        // that is the number the second half of the fight is fought against.
        note: boss.alive
          ? hp + ' / ' + boss.maxHp + (boss.hasRisen ? '   · risen' : '')
          : 'finished',
        ratio: hp / Math.max(1, boss.maxHp),
        fill: boss.alive ? (colors[boss.color] ?? colors.bad) : colors.textDim,
      });
    }

    const ratio = Math.max(0, player.hp) / Math.max(1, player.maxHp);
    this.hpBar(this.height - this.bandH, colors, {
      label: game.crusaderName,
      note: Math.max(0, player.hp) + ' / ' + player.maxHp,
      ratio,
      fill: ratio > 0.5 ? colors.good : ratio > 0.25 ? colors.notable : colors.bad,
    });
  }

  /** One labelled bar filling the width of a band. */
  hpBar(top, colors, { label, note, ratio, fill }) {
    const { ctx } = this;
    const pad = Math.max(5, Math.round(this.bandH * 0.16));
    const barH = Math.max(3, Math.round(this.bandH * 0.26));
    const barY = top + this.bandH - barH - Math.round(pad / 2);
    const barW = this.width - pad * 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = colors.text;
    ctx.fillText(label, pad, (top + barY) / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.textDim;
    ctx.fillText(note, this.width - pad, (top + barY) / 2);

    ctx.fillStyle = mix(colors.bg, '#ffffff', 0.14);
    ctx.fillRect(pad, barY, barW, barH);
    ctx.fillStyle = fill;
    ctx.fillRect(pad, barY, Math.max(0, Math.min(1, ratio)) * barW, barH);
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
    this.ctx.fillRect(this.px(x), this.py(y), this.cellW, this.cellH);
  }

  putGlyph(x, y, glyph, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillText(glyph, this.px(x) + this.cellW / 2, this.py(y) + this.cellH / 2 + 1);
  }
}

function layer(entity) {
  if (entity.isPlayer) return 3;
  if (entity.ai && entity.alive) return 2;
  if (entity.item) return 1;
  return 0;
}

/**
 * A precomputed run of shades from lit to remembered. Built once per draw
 * rather than blended per cell: a full floor is well over two thousand cells,
 * and each blend parses two colour strings.
 */
function ramp(from, to) {
  return Array.from({ length: LIGHT_STEPS + 1 },
    (_, i) => mix(from, to, i / LIGHT_STEPS));
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
