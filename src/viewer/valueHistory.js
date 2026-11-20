// viewer/valueHistory.js — the lowest price per kg / L / piece this EXACT
// product has had, in any size, at this store and at any store (owner,
// 2026-11-20: "the least price in this supermarket .. the least price
// globally .. same product .. the size does not matter the value matters").
//
// The lines come from the engine (GET /prices/lines): every saved flyer price,
// priced per kg / L / piece by the engine's own read path. This module only
// keeps the lines that are the same product (sameProduct.js, the rule the store
// comparison uses) and picks the lowest. It never works a value out itself.

import { sameProduct, valueOf } from './sameProduct.js';

// A line whose value is less than half or more than twice this offer's is a
// misread size or a multi-buy price on one side, not a real low: the lowest of
// many lines is exactly where one misread lands, so the band is tighter than
// the store comparison's.
const BAND = { min: 0.5, max: 2 };

// And a low must be CONFIRMED: another flyer (another store or another week)
// within 10% of it, or this offer itself. Measured 2026-11-20 on Kiri's 458
// saved lines: the lowest was "Kiri Cheese Cream 30x99g" at 30.99 = 10.43/kg,
// a misread count no other flyer came near; the confirmed low was 15.90/kg
// (Al Madina, Grand Hyper). A genuine one-flyer low is passed over for the
// next confirmed one: refuse rather than guess.
const CONFIRM = 0.1;
const flyerKey = (p) => (p.line ? `${p.line.store}|${p.line.validFrom}` : 'this offer');

// { mine, here, anywhere, count, stores, since } or null.
//   here / anywhere — { value, unit, line } of the lowest confirmed value, or
//   the card's own offer ({ line: null }) when nothing saved is lower.
export function valueHistory(anchor, lines) {
  const mine = valueOf(anchor);
  if (!anchor || !mine) return null;
  const points = [];
  let since = null;
  const stores = new Set();
  for (const l of lines || []) {
    if (!l || l.id === anchor.id || !(l.price > 0)) continue;
    const v = valueOf(l);
    if (!v || v.unit !== mine.unit) continue;
    const ratio = v.value / mine.value;
    if (ratio < BAND.min || ratio > BAND.max) continue;
    if (!sameProduct(anchor, l).same) continue;
    stores.add(l.store);
    if (l.validFrom && (!since || l.validFrom < since)) since = l.validFrom;
    points.push({ value: v.value, unit: v.unit, line: l });
  }
  if (!points.length) return null;
  const own = { value: mine.value, unit: mine.unit, line: null };
  const all = [...points, own];
  const confirmed = (p) => all.some((q) => flyerKey(q) !== flyerKey(p)
    && Math.abs(q.value - p.value) / p.value <= CONFIRM);
  // Lines arrive newest first and the sort is stable: on a tie the newest wins.
  const lowest = (keep) => points.filter(keep).sort((x, y) => x.value - y.value).find(confirmed) || null;
  const lower = (p) => (p && p.value < mine.value ? p : own);
  return {
    mine,
    here: lower(lowest((p) => p.line.store === anchor.store)),
    anywhere: lower(lowest(() => true)),
    count: points.length,
    stores: stores.size,
    since,
  };
}
