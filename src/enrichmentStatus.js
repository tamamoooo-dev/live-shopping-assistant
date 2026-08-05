import { t } from './i18n.js';

export function enrichmentState(product = {}) {
  if (!product.enriched) return 'missing';
  return /medium/i.test(String(product.enrichmentModel || '')) ? 'medium' : 'enriched';
}

export function enrichmentLabel(product = {}) {
  return t(`enrichment.${enrichmentState(product)}`);
}

export function enrichmentDot(product = {}, extraClass = '') {
  const state = enrichmentState(product);
  const label = enrichmentLabel(product);
  const dot = document.createElement('span');
  dot.className = `product-enrichment-dot is-${state}${extraClass ? ` ${extraClass}` : ''}`;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', label);
  dot.title = label;
  return dot;
}

export function enrichmentDotHtml(product = {}, extraClass = '') {
  const state = enrichmentState(product);
  const label = enrichmentLabel(product).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<span class="product-enrichment-dot is-${state}${extraClass ? ` ${extraClass}` : ''}" role="img" aria-label="${label}" title="${label}"></span>`;
}
