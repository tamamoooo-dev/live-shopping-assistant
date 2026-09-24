// viewer/priceStatus.js — is this flyer product priced?
//
// D4D publishes some flyers' products WITHOUT a price. The engine still serves
// them in /brochures/hotspots, so every product on the page stays tappable,
// with `price: null` and a `priceStatus`: 'pending' while its vision price
// enrichment may still price the product, 'unavailable' once it has rejected
// it. When a price is accepted the engine serves a normal offer in its place
// (same id, no priceStatus). Everything in the viewer that needs a real price
// (the price row, Add to list, comparison deltas, the history position) asks
// this one function instead of reading `offer.price` directly.
//
// A new module on purpose: its importers are versioned (?v=), and a brand-new
// URL can never be served from a stale cache without this export.

import { t } from '../i18n.js';

// 'priced' | 'pending' | 'unavailable'. An offer with no usable price that the
// engine did not mark pending is unavailable — never imply a price is coming.
export function priceStatus(offer) {
  if (Number(offer && offer.price) > 0) return 'priced';
  return offer && offer.priceStatus === 'pending' ? 'pending' : 'unavailable';
}

// The shopper-facing words for an unpriced offer ('' for a priced one).
export function priceStatusText(offer) {
  const status = priceStatus(offer);
  if (status === 'priced') return '';
  return t(status === 'pending' ? 'sheet.pricePending' : 'sheet.priceUnavailable');
}
