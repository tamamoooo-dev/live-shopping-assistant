// viewer/state.js — reading-position memory. The viewer remembers, per
// brochure, the page and zoom the user left, so reopening a flyer lands
// exactly where they were (sessionStorage: per-tab, mirrors how a paper flyer
// stays open on the kitchen table; a new visit starts fresh). Pure over an
// injectable storage so the cap/merge rules are unit-testable.

const KEY = 'lsa.viewer.v2';
const CAP = 24; // remembered brochures per session — plenty, never unbounded

function read(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function rememberPosition(id, pos, storage = sessionStorage) {
  if (!id) return;
  try {
    const all = read(storage);
    all[id] = { page: pos.page || 0, zoom: pos.zoom || 1, ts: Date.now() };
    const ids = Object.keys(all);
    if (ids.length > CAP) {
      ids.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
      for (const stale of ids.slice(0, ids.length - CAP)) delete all[stale];
    }
    storage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full/blocked — memory is a nicety, never a failure */
  }
}

export function recallPosition(id, storage = sessionStorage) {
  if (!id) return null;
  const hit = read(storage)[id];
  return hit && Number.isInteger(hit.page) ? hit : null;
}
