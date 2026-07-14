// viewer/insights.js — "viewer intelligence": the short, human lines the
// product sheet shows ("This is the lowest recorded price", "Offer ends
// tomorrow", "Historical low reached 3 weeks ago"). Everything is DERIVED
// from data the backend already serves — the offer row itself and the Price
// History doc (/prices via pricesForQuery) — no new endpoints, no duplicated
// backend logic. Pure functions; missing data just means fewer lines.

import { parseSize, sizeLabel, unitPrice } from '../match.js';
import { cleanOfferName } from '../brochure.js';
import { t, tn } from '../i18n.js';

// The Price History query seed for an offer: its most name-like tokens
// (sizes/numbers dropped), same recipe the similar-products strip uses.
export function historyQuery(offer) {
  const base = cleanOfferName(offer.name) || cleanOfferName(offer.nameAr) || '';
  const tokens = base
    .split(/\s+/)
    .filter((t) => t && !/^\d/.test(t) && t.length > 2)
    .slice(0, 3);
  if (tokens.length) return tokens.join(' ');
  return offer.category ? offer.category.replace(/-/g, ' ') : null;
}

// The offer's parsed package size + per-unit price, for the meta line.
export function offerSize(offer) {
  const sz = parseSize(`${offer.name || ''} ${offer.nameAr || ''}`, '');
  if (!sz || !sz.unit || !sz.total) return { size: null, label: '', unit: null };
  const up = unitPrice({ _size: sz, price: offer.price });
  return { size: sz, label: sizeLabel(sz), unit: up };
}

// The history variant that actually matches THIS product's size (never mix a
// 200 ml history into a 2 L product): exact key first, then within ±25%.
export function matchVariant(prices, size) {
  if (!prices || !Array.isArray(prices.variants) || !prices.variants.length) return null;
  if (size && size.unit && size.total) {
    const exact = prices.variants.find((v) => v.key === `${size.unit}:${size.total}`);
    if (exact) return exact;
    const close = prices.variants.find((v) => {
      const m = /^(\w+):([\d.]+)$/.exec(v.key || '');
      if (!m || m[1] !== size.unit) return false;
      const total = Number(m[2]);
      return total > 0 && Math.abs(total - size.total) / size.total <= 0.25;
    });
    if (close) return close;
    return null; // sized product + no sized match: showing another size would lie
  }
  return prices.variants[0] || null;
}

const daysUntil = (ymd) => {
  if (!ymd) return null;
  const ms = new Date(`${ymd}T23:59:59`) - new Date();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
};

const weeksAgo = (week) => {
  if (!week) return null;
  const ms = Date.now() - new Date(`${week}T00:00:00`).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / (7 * 86400000));
};

// buildInsights({ offer, prices, storeLabel }) ->
//   { lines: [{ icon, text, tone }], history: {…} | null }
// `history` powers the sheet's Price History block; `lines` are the badges.
export function buildInsights({ offer, prices, storeLabel = (s) => s }) {
  const lines = [];
  const { size } = offerSize(offer);
  const variant = matchVariant(prices, size);
  const low = variant ? variant.lowest : prices && prices.lowest;

  // Historical position — the headline intelligence.
  let history = null;
  if (low && low.price > 0) {
    const weeks = (variant && variant.weeks) || (prices && prices.weeks) || 0;
    const trend = (variant && variant.trend) || (prices && prices.trend) || null;
    const delta = offer.price - low.price;
    const pct = Math.round((delta / low.price) * 100);
    history = {
      lowest: low,
      weeks,
      trend,
      delta,
      pct,
      atLowest: delta <= 0.01,
      label: variant ? variant.label || '' : '',
    };
    if (history.atLowest) {
      lines.push({ icon: '🏆', tone: 'good', text: t('insights.lowestPrice') });
    } else if (pct >= 3) {
      const ago = weeksAgo(low.week);
      lines.push({
        icon: '📉',
        tone: 'info',
        text: t('insights.historicalLow', {
          price: fmtMoney(low.price),
          at: low.store ? t('insights.atStore', { store: storeLabel(low.store) }) : '',
          ago: ago != null && ago > 0 ? tn('insights.weeksAgo', ago) : '',
          pct,
        }),
      });
    }
    if (trend === 'down' && !history.atLowest) {
      lines.push({ icon: '↘', tone: 'good', text: t('insights.trendingDown') });
    }
  }

  // Validity urgency.
  const left = daysUntil(offer.validTo);
  if (left === 0) lines.push({ icon: '⏳', tone: 'warn', text: t('insights.endsToday') });
  else if (left === 1) lines.push({ icon: '⏳', tone: 'warn', text: t('insights.endsTomorrow') });

  // A big printed discount is worth calling out even without history.
  if (offer.oldPrice && offer.oldPrice > offer.price) {
    const off = Math.round(((offer.oldPrice - offer.price) / offer.oldPrice) * 100);
    if (off >= 30) lines.push({ icon: '🔥', tone: 'good', text: t('insights.bigDrop', { off }) });
  }

  return { lines: lines.slice(0, 3), history };
}

export const fmtMoney = (n) =>
  `${Number.isInteger(n) ? n : Number(n).toFixed(2)} SAR`;
