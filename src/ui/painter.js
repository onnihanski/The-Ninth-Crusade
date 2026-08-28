// A tiny drawing surface for creature icons.
//
// Icons are described in unit space -- 0..1 across and 0..1 down -- so one
// definition serves every cell size the renderer picks, and the shapes stay
// crisp instead of being resampled from a bitmap. The painter holds the
// current origin, scale and colour so the definitions themselves stay short
// enough to read as drawings rather than as code.
export function makePainter(ctx) {
  let ox = 0;
  let oy = 0;
  let sx = 1;
  let sy = 1;

  const X = (v) => ox + v * sx;
  const Y = (v) => oy + v * sy;
  const thickness = (w) => Math.max(1, w * Math.min(sx, sy));

  const trace = (points) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  };

  return {
    /** Aim the painter at one cell, at one size, in one colour. */
    place(originX, originY, width, height, color) {
      ox = originX;
      oy = originY;
      sx = width;
      sy = height;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
    },

    poly(points) {
      trace(points);
      ctx.closePath();
      ctx.fill();
    },

    /** An open path, for limbs, chains, blades and wisps. */
    line(points, width = 0.09) {
      trace(points);
      ctx.lineWidth = thickness(width);
      ctx.stroke();
    },

    rect(x, y, w, h) {
      ctx.fillRect(X(x), Y(y), w * sx, h * sy);
    },

    dot(cx, cy, r) {
      ctx.beginPath();
      ctx.ellipse(X(cx), Y(cy), r * sx, r * sy, 0, 0, Math.PI * 2);
      ctx.fill();
    },

    /** An unfilled circle -- a halo, or a hollow where a head should be. */
    ring(cx, cy, r, width = 0.07) {
      ctx.beginPath();
      ctx.ellipse(X(cx), Y(cy), r * sx, r * sy, 0, 0, Math.PI * 2);
      ctx.lineWidth = thickness(width);
      ctx.stroke();
    },

    /** A part-circle, for sound carrying and for things swung on a chain. */
    arc(cx, cy, r, from, to, width = 0.07) {
      ctx.beginPath();
      ctx.ellipse(X(cx), Y(cy), r * sx, r * sy, 0, from, to);
      ctx.lineWidth = thickness(width);
      ctx.stroke();
    },
  };
}
