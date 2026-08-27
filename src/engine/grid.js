// Flat-array 2D grid. Used for tiles, FOV masks and the explored map.
export class Grid {
  constructor(width, height, fill) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(fill);
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.cells[y * this.width + x] : undefined;
  }

  set(x, y, value) {
    if (this.inBounds(x, y)) this.cells[y * this.width + x] = value;
  }

  fill(value) {
    this.cells.fill(value);
    return this;
  }

  forEach(fn) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) fn(x, y, this.cells[y * this.width + x]);
    }
  }
}

export const DIRS8 = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
