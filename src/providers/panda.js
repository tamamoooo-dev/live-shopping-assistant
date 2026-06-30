// panda.js — the Panda Provider (now routed through the Serverless Connector).
//
// Originally this called api.panda.sa directly from the browser. It now calls
// the deployed Cloudflare Worker connector, which performs the live Panda
// lookup server-side (adaptive strategies + normalization) and returns the
// SAME normalized result objects this provider always produced.
//
// Nothing else changes: the export shape is identical, so the Core and the UI
// are untouched. To the rest of the app this is still "the Panda provider".
//
//   Connector endpoint:  GET /search?provider=panda&q=<query>
//   Connector response:  { provider, query, strategy, count, results: [ ...NormalizedResult ] }

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

// One strategy: ask the connector. (The adaptive product-vs-suggestions logic
// now lives server-side inside the connector's Panda provider.)
const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=panda&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((json && json.error) || `Connector HTTP ${res.status}`);
    }
    if (!json || !Array.isArray(json.results)) {
      throw new Error('Unexpected connector response');
    }
    return json.results;
  },
};

export const pandaProvider = {
  id: 'panda',
  label: 'Panda',
  strategies: [connectorStrategy],
};
