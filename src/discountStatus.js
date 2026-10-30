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

// The percentage as the whole number shoppers read beside the dot (at least 1,
// so a real discount never reads "0"), or null when there is no dot.
export function discountNumber(product = {}) {
  const percent = discountPercent(product);
  return percent == null ? null : Math.max(1, Math.round(percent));
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

// The brochure viewer's mark: the dot and its percentage as a bare number
// ("34"), drawn the same size as the dot. The dot keeps the spoken label.
export function discountMark(product = {}) {
  const dot = discountDot(product);
  if (!dot) return null;
  const mark = document.createElement('span');
  mark.className = `discount-mark is-${discountState(product)}`;
  const num = document.createElement('span');
  num.className = 'discount-num';
  num.textContent = String(discountNumber(product));
  num.setAttribute('aria-hidden', 'true');
  mark.append(dot, num);
  return mark;
}

export function discountMarkHtml(product = {}) {
  const dot = discountDotHtml(product);
  if (!dot) return '';
  return `<span class="discount-mark is-${discountState(product)}">${dot}<span class="discount-num" aria-hidden="true">${discountNumber(product)}</span></span>`;
}
