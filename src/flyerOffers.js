// flyerOffers.js — the "In this week's flyers" panel on the search page.
//
// The Brochure Engine now extracts STRUCTURED per-product offers from the
// physical stores' current flyers (price, was-price, validity, the product's
// own flyer image crop, flyer deep-link). This panel puts those physical-store
// prices next to the live online results, which is the whole point of the
// price-comparison milestone: one search shows both worlds.
//
// Honesty rules (same spirit as the summary's, HANDOFF §18):
//   • Flyer prices are machine-extracted from flyer images — the panel says so
//     and every card clicks through to the flyer itself (in-app viewer when the
//     engine holds that edition, else the offer's flyer page).
//   • Flyer offers NEVER take over the summary's "Lowest price" headline claim
//     — they are presented as their own clearly-labelled group.
//
// Engine knowledge stays in brochure.js (project rule 2); this module only
// renders what searchOffers() returns.

import { searchOffers, brochureForOffer, storeLabel } from './brochure.js';
import { openBrochureViewer } from './viewer.js';

const MAX_CARDS = 8;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function money(v, c = 'SAR') {
  return v == null ? '' : `${Number(v).toFixed(2)} ${c}`;
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function offerCard(offer) {
  const card = el('button', 'fo-card');
  card.type = 'button';
  const displayName = offer.name || offer.nameAr || offer.category || 'Flyer offer';
  card.title = `${displayName} — view the flyer`;

  const imgWrap = el('div', 'fo-img');
  if (offer.imageUrl) {
    const img = new Image();
    img.loading = 'lazy';
    img.alt = displayName;
    img.src = offer.imageUrl;
    img.addEventListener('error', () => imgWrap.classList.add('no-img'));
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('no-img');
  }
  card.appendChild(imgWrap);

  const body = el('div', 'fo-body');
  const name = el('div', 'fo-name', displayName);
  name.dir = 'auto';
  body.appendChild(name);

  const priceRow = el('div', 'fo-price-row');
  priceRow.appendChild(el('span', 'fo-price', money(offer.price, offer.currency)));
  if (offer.oldPrice != null) {
    priceRow.appendChild(el('s', 'fo-old', money(offer.oldPrice, offer.currency)));
  }
  body.appendChild(priceRow);

  const meta = el('div', 'fo-meta');
  meta.appendChild(el('span', 'fo-store', storeLabel(offer.store)));
  if (offer.validTo) meta.appendChild(el('span', 'fo-until', `until ${fmtDateShort(offer.validTo)}`));
  body.appendChild(meta);
  card.appendChild(body);

  card.addEventListener('click', async () => {
    // Prefer the in-app viewer when the engine holds this offer's edition —
    // the user never leaves Souq; otherwise fall back to the flyer page.
    const b = await brochureForOffer(offer).catch(() => null);
    if (b && b.sourceType === 'images') {
      openBrochureViewer(b, storeLabel(offer.store));
    } else if (offer.sourceUrl) {
      window.open(offer.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  });
  return card;
}

// Fill `slot` with the flyer-deals panel for `query`, or remove the slot when
// there is nothing to show. Token-guarded by the caller's live-search token
// (`isStale()` true -> a newer search superseded this render). Never throws.
export async function fillFlyerOffers(slot, query, isStale) {
  const data = await searchOffers(query, 24).catch(() => null);
  if (isStale()) return;
  if (!data || !data.offers.length) {
    slot.remove();
    return;
  }

  const offers = data.offers.slice(0, MAX_CARDS);
  const panel = el('section', 'flyer-offers');

  const head = el('div', 'fo-head');
  head.appendChild(el('span', 'fo-title', "In this week's flyers"));
  head.appendChild(
    el('span', 'fo-count', `${data.offers.length} offer${data.offers.length === 1 ? '' : 's'} · physical stores`),
  );
  panel.appendChild(head);

  const row = el('div', 'fo-row');
  for (const offer of offers) row.appendChild(offerCard(offer));
  panel.appendChild(row);

  panel.appendChild(
    el('div', 'fo-note', 'Flyer prices are read automatically from the flyer images — tap an offer to verify on the flyer itself.'),
  );

  slot.replaceChildren(panel);
}
