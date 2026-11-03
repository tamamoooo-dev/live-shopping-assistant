// lulu.js — the Lulu provider, routed through the Serverless Connector.
//
// Identical in shape to the other providers; the ONLY difference is the
// connector `provider` parameter (lulu). The connector performs the live Lulu
// lookup server-side (Akinon list JSON) and returns the same normalized objects.

//
// Lulu's firewall refuses the connector (every Cloudflare Worker request gets
// 403, 2026-11-03), and its API refuses cross-origin browser calls too. The
// connector answers 403 + `blocked`; this provider then stops asking for a
// few hours and reports `blocked`, so Search shows "blocks online checks"
// instead of an error on every search. Lulu's flyers still come through.

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';
const BLOCKED_KEY = 'lsa.lulu.blockedAt';
const BLOCKED_RECHECK_MS = 6 * 3600 * 1000;

function blockedError(message) {
  const err = new Error(message || 'Lulu refuses automated requests.');
  err.blocked = true;
  return err;
}

function recentlyBlocked() {
  try {
    const at = Number(localStorage.getItem(BLOCKED_KEY));
    return at > 0 && Date.now() - at < BLOCKED_RECHECK_MS;
  } catch {
    return false;
  }
}

function rememberBlocked(blocked) {
  try {
    if (blocked) localStorage.setItem(BLOCKED_KEY, String(Date.now()));
    else localStorage.removeItem(BLOCKED_KEY);
  } catch {
    // storage unavailable: ask every time
  }
}

const connectorStrategy = {
  name: 'connector',
  async run(query) {
    if (recentlyBlocked()) throw blockedError();
    const url = `${CONNECTOR_BASE}/search?provider=lulu&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 403 && json && json.blocked) {
        rememberBlocked(true);
        throw blockedError(json.error);
      }
      throw new Error((json && json.error) || `Connector HTTP ${res.status}`);
    }
    rememberBlocked(false);
    if (!json || !Array.isArray(json.results)) {
      throw new Error('Unexpected connector response');
    }
    return json.results;
  },
};

export const luluProvider = {
  id: 'lulu',
  label: 'Lulu',
  strategies: [connectorStrategy],
};
