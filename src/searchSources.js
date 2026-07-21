// searchSources.js — the search-page source boundary.
//
// Online retailers carry a provider and are dispatched through adaptiveSearch.
// Brochures is deliberately different: it represents the Brochure Engine's
// cross-retailer /offers index and therefore has no online provider. Keeping
// this split explicit prevents the source chip from becoming a fake eighth
// retailer or leaking brochure results into retailer-only searches.

export const BROCHURES_SOURCE_ID = 'brochures';

export function splitSearchSources(selected) {
  const sources = Array.isArray(selected) ? selected : [];
  return {
    stores: sources.filter((source) => source && source.kind === 'online'),
    brochures: sources.some((source) => source && source.kind === 'brochures'),
  };
}
