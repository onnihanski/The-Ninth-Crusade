// Recursive shadowcasting field of view (the eight-octant classic).
//
// `isOpaque(x, y)` reports whether a cell blocks sight; `markVisible(x, y)` is
// called once for every cell the origin can see, including the origin itself.
const OCTANTS = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
];

export function computeFov(originX, originY, radius, isOpaque, markVisible) {
  markVisible(originX, originY);
  for (const [xx, xy, yx, yy] of OCTANTS) {
    castLight(originX, originY, radius, 1, 1.0, 0.0, xx, xy, yx, yy, isOpaque, markVisible);
  }
}

function castLight(ox, oy, radius, row, startSlope, endSlope, xx, xy, yx, yy, isOpaque, mark) {
  if (startSlope < endSlope) return;
  let nextStart = startSlope;

  for (let distance = row; distance <= radius; distance++) {
    let blocked = false;
    const dy = -distance;

    for (let dx = -distance; dx <= 0; dx++) {
      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (startSlope < rightSlope) continue;
      if (endSlope > leftSlope) break;

      const x = ox + dx * xx + dy * xy;
      const y = oy + dx * yx + dy * yy;

      if (dx * dx + dy * dy <= radius * radius) mark(x, y);

      if (blocked) {
        if (isOpaque(x, y)) {
          nextStart = rightSlope;
          continue;
        }
        blocked = false;
        startSlope = nextStart;
      } else if (isOpaque(x, y) && distance < radius) {
        // Wall found: recurse into the still-open wedge to its left, then
        // continue scanning this row for the wedge to its right.
        blocked = true;
        castLight(ox, oy, radius, distance + 1, startSlope, leftSlope, xx, xy, yx, yy, isOpaque, mark);
        nextStart = rightSlope;
      }
    }

    if (blocked) break;
  }
}
