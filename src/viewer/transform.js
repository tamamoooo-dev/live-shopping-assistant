// viewer/transform.js — the pure zoom/pan math for one page. A page's content
// is laid out at its FITTED size (contain-fit inside the stage) at (0,0) and
// rendered with `translate(tx, ty) scale(z)`, transform-origin 0 0. These
// helpers compute fitted sizes, clamped transforms, focal-point zooming and
// rect centering — all DOM-free and unit-tested, because getting this math
// wrong is what makes a viewer feel broken.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

// The contain-fit of a natural image inside the stage.
export function fitSize(natW, natH, stageW, stageH) {
  const s = Math.min(stageW / Math.max(1, natW), stageH / Math.max(1, natH));
  return { w: natW * s, h: natH * s };
}

// The centered transform for a zoom level (the "at rest" position).
export function centered(fitW, fitH, stageW, stageH, z = 1) {
  return { z, tx: (stageW - fitW * z) / 2, ty: (stageH - fitH * z) / 2 };
}

// Legal tx/ty ranges for a zoom level: an axis smaller than the stage is
// locked centered; a larger one pans within [stage - scaled, 0].
export function bounds(fitW, fitH, stageW, stageH, z) {
  const w = fitW * z;
  const h = fitH * z;
  return {
    minX: w <= stageW ? (stageW - w) / 2 : stageW - w,
    maxX: w <= stageW ? (stageW - w) / 2 : 0,
    minY: h <= stageH ? (stageH - h) / 2 : stageH - h,
    maxY: h <= stageH ? (stageH - h) / 2 : 0,
  };
}

const rubber = (x, min, max, dim) => {
  // iOS-style resistance: past an edge, displacement grows with diminishing
  // returns instead of stopping dead.
  if (x < min) return min - resist(min - x, dim);
  if (x > max) return max + resist(x - max, dim);
  return x;
};
const resist = (over, dim) => (over * dim * 0.55) / (dim + over);

// Clamp a transform. `soft` allows rubber-band overshoot during a live
// gesture; hard clamping is for settling.
export function clamp(t, fitW, fitH, stageW, stageH, { soft = false } = {}) {
  const b = bounds(fitW, fitH, stageW, stageH, t.z);
  if (soft) {
    return {
      z: t.z,
      tx: rubber(t.tx, b.minX, b.maxX, stageW),
      ty: rubber(t.ty, b.minY, b.maxY, stageH),
    };
  }
  return {
    z: t.z,
    tx: Math.min(b.maxX, Math.max(b.minX, t.tx)),
    ty: Math.min(b.maxY, Math.max(b.minY, t.ty)),
  };
}

// Zoom to z2 keeping the stage point (sx, sy) over the same content point.
export function zoomAt(t, z2, sx, sy) {
  const cx = (sx - t.tx) / t.z;
  const cy = (sy - t.ty) / t.z;
  return { z: z2, tx: sx - cx * z2, ty: sy - cy * z2 };
}

// Soft-clamped zoom for live pinches: resistance below MIN and above MAX.
export function pinchZoom(z0, scale) {
  let z = z0 * scale;
  if (z < MIN_ZOOM) z = MIN_ZOOM - (MIN_ZOOM - z) * 0.4;
  if (z > MAX_ZOOM) z = MAX_ZOOM + (z - MAX_ZOOM) * 0.25;
  return Math.max(0.55, Math.min(MAX_ZOOM * 1.35, z));
}

// Stage point -> page fractions (0..1). Used for hotspot hit-testing.
export function pointToFraction(t, fitW, fitH, sx, sy) {
  return { fx: (sx - t.tx) / (t.z * fitW), fy: (sy - t.ty) / (t.z * fitH) };
}

// The transform that centers a fractional page rect (a hotspot) in the stage
// at a zoom that shows it comfortably — the search-landing "fly to product".
export function centerOnRect(rect, fitW, fitH, stageW, stageH, { maxZ = 2.2 } = {}) {
  const pad = 2.6; // show the product plus surrounding flyer context
  const zFit = Math.min(stageW / Math.max(1e-6, rect.w * fitW * pad), stageH / Math.max(1e-6, rect.h * fitH * pad));
  const z = Math.max(MIN_ZOOM, Math.min(maxZ, zFit));
  const cx = (rect.x + rect.w / 2) * fitW;
  const cy = (rect.y + rect.h / 2) * fitH;
  return clamp(
    { z, tx: stageW / 2 - cx * z, ty: stageH / 2 - cy * z },
    fitW, fitH, stageW, stageH,
  );
}
