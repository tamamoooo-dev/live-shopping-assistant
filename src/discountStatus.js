import { t } from './i18n.js';

// A discount is displayable only when both prices are finite and the struck
// price is genuinely higher than the current price. Anything else is unknown,
// so the shopper sees no dot rather than a guessed/misleading band.
export function discountPercent(product = {}) {
  if (product.price == null || product.oldPrice == null || product.price === '' || product.oldPrice === '') return null;
  const price = Number(product.price);
  const oldPrice = Number(product.oldPrice);
  if (!Number.isFinite(price) || !Number.isFinite(oldPrice) || price < 0 || oldPrice <= 0 || oldPrice <= price) {
    return null;
  }
  return ((oldPrice - price) / oldPrice) * 100;
}

export function discountState(product = {}) {
  const percent = discountPercent(product);
  if (percent == null) return null;
  if (percent < 15) return 'low';
  if (percent <= 45) return 'mid';
  return 'high';
}

export function discountLabel(product = {}) {
  const state = discountState(product);
  if (!state) return '';
  return t(`discountDot.${state}`, { percent: Math.round(discountPercent(product)) });
}

export function discountDot(product = {}, extraClass = '') {
  const state = discountState(product);
  if (!state) return null;
  const label = discountLabel(product);
  const dot = document.createElement('span');
  dot.className = `product-discount-dot is-${state}${extraClass ? ` ${extraClass}` : ''}`;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', label);
  dot.title = label;
  return dot;
}

export function discountDotHtml(product = {}, extraClass = '') {
  const state = discountState(product);
  if (!state) return '';
  const label = discountLabel(product).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<span class="product-discount-dot is-${state}${extraClass ? ` ${extraClass}` : ''}" role="img" aria-label="${label}" title="${label}"></span>`;
}
