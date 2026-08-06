// The shared online-retailer catalogue and relevance gate.
//
// Search and Browse both use this module so a brand opened in Browse searches
// the exact same providers and applies the exact same primary/related split as
// the main Search page. Provider dispatch still lives in core.js.

import { pandaProvider } from './providers/panda.js';
import { amazonProvider } from './providers/amazon.js';
import { tamimiProvider } from './providers/tamimi.js';
import { danubeProvider } from './providers/danube.js';
import { luluProvider } from './providers/lulu.js';
import { noonProvider } from './providers/noon.js';
import { ninjaProvider } from './providers/ninja.js';
import {
  rankItems, relevance, isRelevant, isPrimaryMatch,
} from './match.js';

export const ONLINE_STORES = [
  { id: 'panda', kind: 'online', label: 'Panda', color: '#16a34a', provider: pandaProvider },
  { id: 'amazon', kind: 'online', label: 'Amazon', color: '#f59e0b', provider: amazonProvider },
  { id: 'tamimi', kind: 'online', label: 'Tamimi', color: '#0ea5e9', provider: tamimiProvider },
  { id: 'danube', kind: 'online', label: 'Danube', color: '#ef4444', provider: danubeProvider },
  { id: 'lulu', kind: 'online', label: 'Lulu', color: '#6366f1', provider: luluProvider },
  { id: 'noon', kind: 'online', label: 'Noon', color: '#eab308', provider: noonProvider },
  { id: 'ninja', kind: 'online', label: 'Ninja', color: '#ec4899', provider: ninjaProvider },
];

export const ONLINE_STORE_BY_ID = Object.fromEntries(ONLINE_STORES.map((store) => [store.id, store]));

// These providers depend on public marketplace endpoints that can reject a
// browser temporarily; the marketplace renders their softer failure wording.
export const BEST_EFFORT_ONLINE_STORES = new Set(['amazon', 'noon']);

export function rankOnlineResults(items, query) {
  const ranked = rankItems(items, query); // attaches _size and _rel
  const relevant = ranked.filter((item) => isRelevant(item, query) && relevance(item, query) > 0);
  const primary = relevant.filter((item) => isPrimaryMatch(item, query));
  const related = relevant.filter((item) => !isPrimaryMatch(item, query));
  return { primary, related, hidden: ranked.length - relevant.length };
}
