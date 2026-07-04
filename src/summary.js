// summary.js — renders the Price Comparison Engine's model (compare.js) as the
// shopping summary shown ABOVE the results.
//
// The decision logic lives in compare.js (pure, unit-tested); this module is
// rendering only. What the panel answers, honestly:
//   • What is the genuinely BEST BUY right now — by per-unit value when sizes
//     are known, across BOTH online stores and this week's flyers?
//   • If a smaller pack costs less in total, where is it? (shown as its own
//     line — never silently hidden, never confused with the best value)
//   • Is the claim apples-to-apples? The confidence chip + "same product
//     elsewhere" say exactly how comparable the comparison is.
//   • Is today a good deal historically? (Price History verdict for tracked
//     products)
//
// Flyer-sourced picks stay clearly labelled ("this week's flyer at <store>")
// with the machine-extraction caveat — the user never mistakes an OCR price
// for a checked-out shelf price.

import { sizeLabel } from './match.js';
import { unitPriceLabel } from './compare.js';

// --- rendering helpers ---------------------------------------------------------
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
  medium: 'Medium confidence · compared by unit value',
  low: 'Low confidence · different sizes/variants',
};

const KICKER = {
  'best-buy': 'Best buy',
  'best-value': 'Best buy · best value per unit',
  cheapest: 'Cheapest option',
};

function nameLink(l) {
  const a = l.link ? document.createElement('a') : document.createElement('span');
  a.className = 'summary-name';
  a.dir = 'auto';
  a.textContent = l.name;
  if (l.link) {
    a.href = l.link;
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

// One price line: 12.50 SAR  at Lulu  ·  2 L  ·  6.25 SAR/L  [flyer]
// `shared` lists other stores selling the same thing at the same price — the
// best price is theirs too, never attributed to a single store.
function priceLine(l, { big = true, shared = null } = {}) {
  const line = el('div', 'summary-line');
  line.appendChild(el('span', big ? 'summary-price' : 'summary-price-sm', money(l.price, l.currency)));
  const stores =
    shared && shared.length
      ? [l.store.label, ...shared.map((s) => s.label)].join(' · ')
      : l.store.label;
  line.appendChild(el('span', 'summary-at', `at ${stores}`));
  const sz = sizeLabel(l.size);
  if (sz) line.appendChild(el('span', 'summary-size', sz));
  const up = unitPriceLabel(l);
  if (up) line.appendChild(el('span', 'summary-unit', up));
  if (l.source === 'flyer') line.appendChild(el('span', 'summary-flyer-badge', "this week's flyer"));
  return line;
}

// `s` is the compare.js model. `opts.onWatch(headlineListing)` (optional) adds
// the "Watch price" action that creates a Price Monitoring watch.
export function summaryElement(s, storeLabelFn = (x) => x, opts = {}) {
  const wrap = el('div', `summary conf-${s.confidence}`);

  // Header: title + confidence chip (+ the watch action)
  const head = el('div', 'summary-head');
  head.appendChild(el('span', 'summary-title', 'Shopping summary'));
  const conf = el('span', `summary-conf conf-${s.confidence}`);
  conf.appendChild(el('span', 'conf-dot'));
  conf.appendChild(el('span', null, CONF_LABEL[s.confidence]));
  head.appendChild(conf);
  if (opts.onWatch) {
    const btn = el('button', 'summary-watch');
    btn.type = 'button';
    btn.textContent = '🔔 Watch price';
    btn.title = 'Get an alert when this drops to your target price';
    btn.addEventListener('click', () => opts.onWatch(s));
    head.appendChild(btn);
  }
  wrap.appendChild(head);

  // Overview
  const ov = el('div', 'summary-overview');
  const parts = [`${s.offers} offer${s.offers === 1 ? '' : 's'} across ${s.stores} store${s.stores === 1 ? '' : 's'}`];
  if (s.flyerCount) parts.push(`${s.flyerCount} from this week's flyers`);
  ov.appendChild(el('span', null, parts.join(' · ')));
  ov.appendChild(el('span', 'summary-range', `${money(s.range.min)} – ${money(s.range.max)}`));
  wrap.appendChild(ov);

  // Headline — the recommendation
  const h = s.headline.listing;
  const hero = el('div', 'summary-hero');
  hero.appendChild(el('span', 'summary-kicker', KICKER[s.headline.kind] || 'Best buy'));
  hero.appendChild(priceLine(h, { shared: s.sharedWith }));
  if (s.sharedWith && s.sharedWith.length) {
    hero.appendChild(
      el('div', 'summary-shared-note', `Best price shared by ${s.sharedWith.length + 1} stores`),
    );
  }
  hero.appendChild(nameLink(h));
  if (h.source === 'flyer') {
    hero.appendChild(
      el('div', 'summary-note', 'Flyer price — read automatically from the flyer image; tap the name to verify on the flyer.'),
    );
  }
  // Same product elsewhere (only when the headline itself is the verified group)
  if (s.equivalent && h.it && s.equivalent.sorted.some((i) => i.it === h.it)) {
    const others = s.equivalent.sorted
      .filter((i) => i.it !== h.it)
      .slice(0, 3)
      .map((i) => `${i.store.label} ${money(i.it.price)}`)
      .join(' · ');
    if (others) hero.appendChild(el('div', 'summary-others', `Same product elsewhere: ${others}`));
  }
  if (s.confidence === 'low') {
    hero.appendChild(el('div', 'summary-note', 'Results are different sizes or variants — compare carefully below.'));
  }
  if (s.familyExcluded > 0) {
    hero.appendChild(
      el(
        'div',
        'summary-family-note',
        `${s.familyExcluded} similar-name product${s.familyExcluded === 1 ? '' : 's'} from a different category excluded from this comparison.`,
      ),
    );
  }
  if (s.typeExcluded > 0) {
    hero.appendChild(
      el(
        'div',
        'summary-family-note',
        `${s.typeExcluded} product${s.typeExcluded === 1 ? '' : 's'} of a different type excluded from this comparison.`,
      ),
    );
  }
  if (s.freshExcluded > 0) {
    hero.appendChild(
      el(
        'div',
        'summary-family-note',
        `${s.freshExcluded} frozen/processed or flavoured variant${s.freshExcluded === 1 ? '' : 's'} excluded — prices compare the fresh product (add e.g. "مجمد" to your search to compare those instead).`,
      ),
    );
  }
  if (s.identityExcluded > 0) {
    hero.appendChild(
      el(
        'div',
        'summary-family-note',
        `${s.identityExcluded} cheaper look-alike${s.identityExcluded === 1 ? '' : 's'} from a different brand or variant excluded — prices are compared only for the product identified above.`,
      ),
    );
  }
  wrap.appendChild(hero);

  // The lowest TOTAL price, when it is a different (smaller) item than the
  // best buy — never hidden, honestly framed.
  if (s.secondary) {
    const sec = el('div', 'summary-secondary');
    sec.appendChild(el('span', 'summary-sec-tag', 'Lowest price · if you need less'));
    sec.appendChild(priceLine(s.secondary.listing, { big: false }));
    const nm = el('span', 'summary-sec-name');
    nm.dir = 'auto';
    nm.textContent = s.secondary.listing.name;
    sec.appendChild(nm);
    wrap.appendChild(sec);
  }

  // A verified same-product group that ISN'T the headline still helps ("the
  // exact same 2L milk is at these stores"), shown compactly.
  if (s.equivalent && !(h.it && s.equivalent.sorted.some((i) => i.it === h.it))) {
    const g = s.equivalent;
    const row = el('div', 'summary-value');
    row.appendChild(el('span', 'summary-value-tag', `Same product · ${g.stores} stores`));
    const best = g.sorted[0];
    const nm = el('span', 'summary-value-name');
    nm.dir = 'auto';
    nm.textContent = `${best.it.name} — ${g.sorted.map((i) => `${i.store.label} ${money(i.it.price)}`).slice(0, 3).join(' · ')}`;
    row.appendChild(nm);
    wrap.appendChild(row);
  }

  // Price History verdict
  if (s.history) {
    const hh = s.history;
    const box = el('div', `summary-history verdict-${hh.verdict}`);
    const title = el('div', 'sh-title');
    title.appendChild(el('span', 'sh-badge', 'Price history'));
    const vlabel =
      hh.verdict === 'at-low'
        ? "Today's best matches the lowest ever recorded"
        : hh.verdict === 'near-low'
        ? `Close to the record low (+${hh.delta.toFixed(2)})`
        : `Above the record low (+${hh.delta.toFixed(2)})`;
    title.appendChild(el('span', 'sh-verdict', vlabel));
    box.appendChild(title);
    const low = hh.low;
    const sizeTag = hh.variant && hh.variant.label ? ` (${hh.variant.label})` : '';
    box.appendChild(
      el(
        'div',
        'sh-detail',
        `Lowest recorded${sizeTag}: ${money(low.price)} at ${storeLabelFn(low.store)}${
          low.observedAt ? ` · ${fmtDate(low.observedAt)}` : low.edition ? ` · ${low.edition}` : ''
        }`,
      ),
    );
    if (hh.latest && hh.latest.length) {
      const list = el('div', 'sh-latest');
      for (const p of hh.latest) {
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
    // Other tracked sizes, each with its own independent lowest-ever record.
    if (hh.otherVariants && hh.otherVariants.length) {
      const ov = el('div', 'sh-variants');
      ov.appendChild(el('span', 'sh-variants-label', 'Other sizes: '));
      ov.appendChild(
        el(
          'span',
          'sh-variants-list',
          hh.otherVariants
            .slice(0, 4)
            .map((v) => `${v.label} ${money(v.low.price)}`)
            .join(' · '),
        ),
      );
      box.appendChild(ov);
    }
    wrap.appendChild(box);
  }

  return wrap;
}
