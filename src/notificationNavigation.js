// Notification navigation is intentionally independent from the URL captured
// when a price was observed. Retailer and brochure URLs expire; a fresh Super
// Search does not. Amazon exact-product watches are the sole exception.

const clean = (value) =>
  String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

function amazonProductUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const amazonHost =
      host === 'amazon.sa' ||
      host.endsWith('.amazon.sa') ||
      host === 'amazon.com' ||
      host.endsWith('.amazon.com') ||
      host === 'amzn.to';
    return url.protocol === 'https:' && amazonHost ? url.href : null;
  } catch {
    return null;
  }
}

function sourceStore(watch = {}, observation = {}) {
  return clean(observation.store || watch.lastStore || watch.provider).toLowerCase();
}

function searchQuery(watch = {}, observation = {}) {
  // Registry watches carry Super Search's internal identity. Keep it in the
  // route and pair it with the canonical display name as the current search
  // page's text-query fallback.
  const registry = watch.kind === 'registry' && /^pr_[a-z0-9]+$/i.test(clean(watch.productId));
  const candidates = registry
    ? [watch.label, observation.name, watch.query]
    : [watch.query, watch.label, observation.name];
  return clean(candidates.find((value) => clean(value)));
}

export function notificationTarget(watch = {}, observation = {}) {
  const observedLink = observation.link || watch.lastLink || watch.link;
  const amazonLink = sourceStore(watch, observation) === 'amazon'
    ? amazonProductUrl(observedLink)
    : null;
  if (amazonLink) return { kind: 'external', href: amazonLink };

  const params = new URLSearchParams();
  const query = searchQuery(watch, observation);
  if (query) params.set('q', query);
  const productId = clean(watch.productId);
  if (watch.kind === 'registry' && /^pr_[a-z0-9]+$/i.test(productId)) {
    params.set('product', productId);
  }
  const suffix = params.toString();
  return {
    kind: 'search',
    href: `#/search${suffix ? `?${suffix}` : ''}`,
    query,
  };
}
