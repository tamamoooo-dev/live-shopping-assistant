// stats.mjs — small, dependency-free statistics for a ~50–100 crop experiment.
//
// With this few crops every rate needs an interval next to it. Crops are the
// unit of resampling (readings of one crop are not independent evidence about
// the model — they share the image), so intervals come from a crop-level
// bootstrap, and temperature comparisons are PAIRED: the same resampled crops
// are scored under every temperature.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mean(xs) {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs) {
  if (!xs.length) return NaN;
  const a = xs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// Wilson score interval for k successes in n trials (95% by default).
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [NaN, NaN];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

// Crop-level bootstrap of several statistics at once, sharing resamples so
// that differences between statistics are paired.
//   n       number of crops
//   stats   { name: (indices) => number }
// Returns { name: [lo, hi] } (2.5th and 97.5th percentiles).
export function bootstrap(n, stats, { iterations = 2000, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  const names = Object.keys(stats);
  const samples = Object.fromEntries(names.map((k) => [k, []]));
  const idx = new Array(n);
  for (let b = 0; b < iterations; b++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(rand() * n);
    for (const k of names) {
      const v = stats[k](idx);
      if (Number.isFinite(v)) samples[k].push(v);
    }
  }
  const out = {};
  for (const k of names) {
    const s = samples[k].sort((x, y) => x - y);
    out[k] = [percentile(s, 0.025), percentile(s, 0.975)];
  }
  return out;
}
