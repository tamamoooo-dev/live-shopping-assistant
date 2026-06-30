// tamimi.js — the Tamimi provider, routed through the Serverless Connector.
//
// Identical in shape to the Panda/Amazon providers; the ONLY difference is the
// connector `provider` parameter (tamimi). The connector performs the live
// Tamimi lookup server-side (ZopSmart public JSON API) and returns the same
// normalized result objects.

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=tamimi&q=${encodeURIComponent(query)}`;
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

export const tamimiProvider = {
  id: 'tamimi',
  label: 'Tamimi',
  strategies: [connectorStrategy],
};
