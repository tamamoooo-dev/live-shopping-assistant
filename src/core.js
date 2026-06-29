// core.js — the Core layer.
//
// The Core knows NOTHING about Panda. It only knows how to:
//   1. keep a tiny bit of memory (which method last worked),
//   2. take a "provider" that offers an ordered list of search strategies,
//   3. try those strategies until one returns results,
//   4. remember the winner so it is tried first next time,
//   5. forget the winner if it ever stops working, so a new one is found.
//
// A provider looks like:
//   { id: 'panda', label: 'Panda', strategies: [ Strategy, ... ] }
//
// A strategy looks like:
//   { name: 'products-v3', run(query) -> Promise<NormalizedResult[]> }
//
// A NormalizedResult looks like:
//   { id, name, image, price, oldPrice, currency, link, size, brand, discountLabel }
//
// Prices are always fetched live by the strategy. The Core never caches results,
// only the *name* of the method that worked.

const MEMORY_PREFIX = 'lsa';

// A small wrapper over localStorage that quietly no-ops if storage is blocked
// (e.g. Safari private mode). Scoped so different parts can't collide.
export function createMemory(scope) {
  const key = (name) => `${MEMORY_PREFIX}.${scope}.${name}`;
  const available = (() => {
    try {
      const probe = `${MEMORY_PREFIX}.__probe__`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  })();

  return {
    get(name) {
      if (!available) return null;
      try { return localStorage.getItem(key(name)); } catch { return null; }
    },
    set(name, value) {
      if (!available) return;
      try { localStorage.setItem(key(name), value); } catch { /* ignore */ }
    },
  };
}

// Try the remembered winner first, then everything else in declared order.
function orderStrategies(strategies, preferredName) {
  if (!preferredName) return strategies.slice();
  const preferred = strategies.filter((s) => s.name === preferredName);
  const rest = strategies.filter((s) => s.name !== preferredName);
  return [...preferred, ...rest];
}

// Run a live, adaptive search against one provider.
// Returns { results, strategy } where `strategy` is the method that worked.
export async function adaptiveSearch(provider, query, memory) {
  const q = (query || '').trim();
  if (!q) throw new Error('Please enter a product name.');

  const winnerKey = `strategy.${provider.id}`;
  const lastGood = memory.get(winnerKey);
  const ordered = orderStrategies(provider.strategies, lastGood);

  const failures = [];
  for (const strategy of ordered) {
    try {
      const results = await strategy.run(q);
      if (results && results.length) {
        memory.set(winnerKey, strategy.name); // remember what worked
        return { results, strategy: strategy.name };
      }
      failures.push(`${strategy.name}: no results`);
    } catch (err) {
      failures.push(`${strategy.name}: ${err.message}`);
    }
  }

  // Nothing worked. Forget the stale winner so next time we rediscover from
  // scratch instead of stubbornly retrying a dead method first.
  memory.set(winnerKey, '');

  const error = new Error('No working search method returned results.');
  error.details = failures;
  throw error;
}
