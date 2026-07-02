// summary.js — the intelligent shopping summary shown ABOVE the results.
//
// Goal (HANDOFF "Search Intelligence"): let the user decide immediately, without
// scrolling every store. It answers three questions honestly:
//   • What's the cheapest option right now, and where?
//   • What's the best VALUE once pack sizes are accounted for (per litre/kg/pc)?
//   • Is a "lowest price" claim actually apples-to-apples? If not, say so.
//
// The hard rule (goal #3, "never mislead"): a strong "Lowest price" is claimed
// ONLY for a confidently-equivalent product (same brand + same size at ≥2
// stores). Different pack sizes/variants are compared by UNIT price and labelled
// as such, and when results are too heterogeneous to compare we show the range
// with a low-confidence note instead of a false "lowest".
//
// Pure logic (computeSummary) is separated from rendering (summaryElement) so it
// can be unit-tested. Price History (Pillar 3) is woven into the same panel.

import { unitPrice, sizeLabel, groupEquivalents, isRelevant, relevance } from './match.js';

const REL_FLOOR = 30; // ignore weak/look-alike matches when picking the "best"

// tagged: [{ store:{id,label,color}, it }] — priced, already ranked per store.
export function computeSummary(query, tagged, prices) {
  const priced = tagged.filter(
    (t) => t.it && t.it.price != null && isRelevant(t.it, query) && relevance(t.it, query) >= REL_FLOOR,
  );
  if (!priced.length) return null;

  const storeIds = new Set(priced.map((t) => t.store.id));
  const prices2 = priced.map((t) => t.it.price);
  const min = Math.min(...prices2);
  const max = Math.max(...prices2);

  // Cheapest single option (absolute price).
  const cheapest = priced.reduce((a, b) => (b.it.price < a.it.price ? b : a));

  // Best value per unit — compare within the most common unit family so we never
  // compare SAR/L against SAR/kg. Only meaningful with ≥2 sized items.
  const sized = priced
    .map((t) => ({ t, up: unitPrice(t.it) }))
    .filter((x) => x.up);
  let bestValue = null;
  let unitFamily = null;
  if (sized.length >= 2) {
    const byUnit = {};
    for (const x of sized) (byUnit[x.up.unit] = byUnit[x.up.unit] || []).push(x);
    const family = Object.values(byUnit).sort((a, b) => b.length - a.length)[0];
    if (family.length >= 2) {
      unitFamily = family[0].up.unit;
      bestValue = family.reduce((a, b) => (b.up.value < a.up.value ? b : a));
    }
  }

  // Equivalent-product lowest price (the only high-confidence "lowest" claim).
  // Find the group the cheapest item belongs to; if that group spans ≥2 stores,
  // we can honestly say "lowest price for THIS product".
  const groups = groupEquivalents(priced);
  let equivalent = null;
  for (const g of groups) {
    const stores = new Set(g.items.map((i) => i.store.id));
    if (stores.size >= 2 && g.items.some((i) => i === cheapest)) {
      const sorted = g.items.slice().sort((a, b) => a.it.price - b.it.price);
      equivalent = { group: g, sorted, stores: stores.size };
      break;
    }
  }
  // If the cheapest isn't in a multi-store group, still surface the strongest
  // multi-store group (helps when the absolute-cheapest is an odd size).
  if (!equivalent) {
    const multi = groups
      .map((g) => ({ g, stores: new Set(g.items.map((i) => i.store.id)).size }))
      .filter((x) => x.stores >= 2 && x.g.size && x.g.size.unit)
      .sort((a, b) => b.stores - a.stores)[0];
    if (multi) {
      const sorted = multi.g.items.slice().sort((a, b) => a.it.price - b.it.price);
      equivalent = { group: multi.g, sorted, stores: multi.stores };
    }
  }

  // Confidence in the headline claim.
  let confidence = 'low';
  if (equivalent) confidence = 'high';
  else if (bestValue) confidence = 'medium';

  // Price History verdict (tracked products only).
  let history = null;
  if (prices && prices.lowest && prices.lowest.price != null) {
    const low = prices.lowest;
    const delta = cheapest.it.price - low.price;
    let verdict;
    if (cheapest.it.price <= low.price + 1e-9) verdict = 'at-low';
    else if (delta / low.price <= 0.1) verdict = 'near-low';
    else verdict = 'above-low';
    const latest = (prices.latest || [])
      .filter((p) => p && p.price != null)
      .sort((a, b) => a.price - b.price);
    history = { low, todaysBest: cheapest.it.price, delta, verdict, latest };
  }

  return {
    query,
    offers: priced.length,
    stores: storeIds.size,
    range: { min, max },
    cheapest,
    bestValue,
    unitFamily,
    equivalent,
    confidence,
    history,
  };
}

// --- rendering ---------------------------------------------------------------
function money(v, c = 'SAR') {
  return v == null ? '' : `${Number(v).toFixed(2)} ${c}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const CONF_LABEL = {
  high: 'High confidence · same product compared',
  medium: 'Medium confidence · compared by unit price',
  low: 'Low confidence · different sizes/variants',
};

export function summaryElement(s, storeLabelFn = (x) => x) {
  const wrap = el('div', `summary conf-${s.confidence}`);

  // Header: title + confidence chip
  const head = el('div', 'summary-head');
  head.appendChild(el('span', 'summary-title', 'Shopping summary'));
  const conf = el('span', `summary-conf conf-${s.confidence}`);
  conf.appendChild(el('span', 'conf-dot'));
  conf.appendChild(el('span', null, CONF_LABEL[s.confidence]));
  head.appendChild(conf);
  wrap.appendChild(head);

  // Overview
  const ov = el('div', 'summary-overview');
  ov.appendChild(el('span', null, `${s.offers} offer${s.offers === 1 ? '' : 's'} across ${s.stores} store${s.stores === 1 ? '' : 's'}`));
  ov.appendChild(el('span', 'summary-range', `${money(s.range.min)} – ${money(s.range.max)}`));
  wrap.appendChild(ov);

  // Headline claim
  const hero = el('div', 'summary-hero');
  if (s.equivalent) {
    const best = s.equivalent.sorted[0];
    hero.appendChild(el('span', 'summary-kicker', `Lowest price · ${sizeLabel(best.it._size) || 'same product'}`));
    const line = el('div', 'summary-line');
    line.appendChild(el('span', 'summary-price', money(best.it.price)));
    line.appendChild(el('span', 'summary-at', `at ${best.store.label}`));
    hero.appendChild(line);
    hero.appendChild(nameLink(best.it));
    // other stores for the SAME product
    if (s.equivalent.sorted.length > 1) {
      const others = s.equivalent.sorted
        .slice(1, 4)
        .map((i) => `${i.store.label} ${money(i.it.price)}`)
        .join(' · ');
      hero.appendChild(el('div', 'summary-others', `Same product elsewhere: ${others}`));
    }
  } else {
    // No confident equivalence — present the cheapest option honestly, not a
    // "lowest price" the user could misread as apples-to-apples.
    hero.appendChild(el('span', 'summary-kicker', 'Cheapest option'));
    const line = el('div', 'summary-line');
    line.appendChild(el('span', 'summary-price', money(s.cheapest.it.price)));
    line.appendChild(el('span', 'summary-at', `at ${s.cheapest.store.label}`));
    const sz = sizeLabel(s.cheapest.it._size);
    if (sz) line.appendChild(el('span', 'summary-size', sz));
    hero.appendChild(line);
    hero.appendChild(nameLink(s.cheapest.it));
    if (s.confidence === 'low') {
      hero.appendChild(el('div', 'summary-note', 'Results are different sizes or variants — compare carefully below.'));
    }
  }
  wrap.appendChild(hero);

  // Best value per unit (when it adds information beyond the headline)
  if (s.bestValue) {
    const bv = s.bestValue;
    const showBV =
      !s.equivalent || bv.t.it !== s.equivalent.sorted[0].it; // avoid repeating the same item
    if (showBV) {
      const row = el('div', 'summary-value');
      row.appendChild(el('span', 'summary-value-tag', 'Best value'));
      row.appendChild(el('span', 'summary-value-unit', `${money(bv.up.value)}/${bv.up.unit}`));
      const nm = el('span', 'summary-value-name');
      nm.dir = 'auto';
      nm.textContent = `${bv.t.it.name} · ${bv.t.store.label}`;
      row.appendChild(nm);
      wrap.appendChild(row);
    }
  }

  // Price History verdict
  if (s.history) {
    const h = s.history;
    const box = el('div', `summary-history verdict-${h.verdict}`);
    const title = el('div', 'sh-title');
    title.appendChild(el('span', 'sh-badge', 'Price history'));
    const vlabel =
      h.verdict === 'at-low'
        ? "Today's best matches the lowest ever recorded"
        : h.verdict === 'near-low'
        ? `Close to the record low (+${h.delta.toFixed(2)})`
        : `Above the record low (+${h.delta.toFixed(2)})`;
    title.appendChild(el('span', 'sh-verdict', vlabel));
    box.appendChild(title);
    const low = h.low;
    box.appendChild(
      el(
        'div',
        'sh-detail',
        `Lowest recorded: ${money(low.price)} at ${storeLabelFn(low.store)}${
          low.observedAt ? ` · ${fmtDate(low.observedAt)}` : low.edition ? ` · ${low.edition}` : ''
        }`,
      ),
    );
    // Latest weekly capture per store (cheapest first), each vs the record low.
    if (h.latest && h.latest.length) {
      const list = el('div', 'sh-latest');
      for (const p of h.latest) {
        const row = el('div', 'sh-row');
        row.appendChild(el('span', 'sh-store', storeLabelFn(p.store)));
        row.appendChild(el('span', 'sh-price', money(p.price)));
        const d = el('span', 'sh-delta');
        if (p.price <= low.price + 1e-9) {
          d.classList.add('is-best');
          d.textContent = 'record low';
        } else {
          d.classList.add('is-above');
          d.textContent = `+${(p.price - low.price).toFixed(2)}`;
        }
        row.appendChild(d);
        list.appendChild(row);
      }
      box.appendChild(list);
    }
    wrap.appendChild(box);
  }

  return wrap;
}

function nameLink(it) {
  const a = it.link ? document.createElement('a') : document.createElement('span');
  a.className = 'summary-name';
  a.dir = 'auto';
  a.textContent = it.name;
  if (it.link) {
    a.href = it.link;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}
