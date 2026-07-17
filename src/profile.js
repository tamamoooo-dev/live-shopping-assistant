// profile.js — the local profile: how Super Search remembers the same browser.
//
// One profile per browser. It is created automatically and silently the first
// time the app opens, and loaded on every visit after that. Not an account,
// not authentication, not cloud storage — just a stable local identity that
// all user-specific data belongs to. The user never sees it.
//
// Storage is the app's one persistence layer, localStorage. The profile OWNS
// every user-specific `lsa.*` key already there — one browser, one profile —
// so existing data is adopted as-is the day the profile first appears (no
// migration, no key renames, no behaviour change):
//   • lsa.cart.v1            — shopping cart               (src/cart.js)
//   • lsa.featured.learn.v1  — Featured-ranking learning   (src/featured.js)
//   • lsa.lang               — language                    (src/i18n.js)
//   • lsa.app.stores         — store scope / search preferences (src/app.js)
//   • lsa.app.rank           — preferred search (sort) mode     (src/app.js)
//   • lsa.app.recent         — recent searches                  (src/app.js)
//   • lsa.app.strategy.*     — per-store adaptive-search winners (src/core.js)
// Price watches live in the engine and re-appear on return by themselves.
//
// Future personalization goes through profileGet/profileSet below — one JSON
// value per name under `lsa.profile.data.*`, same storage, no new
// architecture.
//
// If localStorage is blocked (Safari private mode, quota), everything here
// quietly degrades to a session-only in-memory profile — same philosophy as
// createMemory in core.js: the app never breaks over storage.

const PROFILE_KEY = 'lsa.profile.v1';
const DATA_PREFIX = 'lsa.profile.data.';

let storage = typeof localStorage !== 'undefined' ? localStorage : null;
// Test hook: inject an in-memory Storage-like object ({getItem,setItem}).
export function _setProfileStorage(s) {
  storage = s;
  cached = null;
}

// A unique id for this browser. crypto.randomUUID everywhere modern; the
// fallback covers older WebViews (uniqueness per-browser is all we need).
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cached = null;

// The profile record: { v, id, createdAt, lastSeenAt }. Creates it on first
// call (first open of the app in this browser); returns the same one after.
export function getProfile() {
  if (cached) return cached;
  try {
    const raw = storage && storage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.id === 'string' && p.id) {
        cached = p;
        return p;
      }
    }
  } catch {
    /* blocked or corrupt — fall through to a fresh profile */
  }
  const p = { v: 1, id: newId(), createdAt: new Date().toISOString() };
  try {
    if (storage) storage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* private mode / quota — session-only profile, app works regardless */
  }
  cached = p;
  return p;
}

// Called once at boot (app.js). Ensures the profile exists and stamps the
// visit, so the profile always reflects "this browser was last here when".
export function initProfile() {
  const p = getProfile();
  p.lastSeenAt = new Date().toISOString();
  try {
    if (storage) storage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore — the stamp is best-effort */
  }
  return p;
}

// --- future personalization -----------------------------------------------------
// One JSON value per name, owned by the profile. New user-specific features
// store here instead of inventing their own keys.

export function profileGet(name, fallback = null) {
  try {
    const raw = storage && storage.getItem(DATA_PREFIX + name);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function profileSet(name, value) {
  try {
    if (storage) storage.setItem(DATA_PREFIX + name, JSON.stringify(value));
  } catch {
    /* quota/private mode — personalization silently off */
  }
}
