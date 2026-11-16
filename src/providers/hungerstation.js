// hungerstation.js — the HungerStation Market (هنقرستيشن ماركت) provider
// (routed through the connector).
//
// HungerStation Market is HungerStation's own grocery darkstore. All
// store-specific logic (reading its website's search page) lives server-side
// in the connector's HungerStation provider; this frontend provider just asks
// the connector and returns the SAME normalized result objects every provider
// produces.
//
//   Connector endpoint:  GET /search?provider=hungerstation&q=<query>
//   Connector response:  { provider, query, strategy, count, results: [ ...NormalizedResult ] }

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=hungerstation&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((json && json.error) || `Connector HTTP ${res.status}`);
      if (json && json.blocked) err.blocked = true;
      throw err;
    }
    if (!json || !Array.isArray(json.results)) {
      throw new Error('Unexpected connector response');
    }
    return json.results;
  },
};

export const hungerstationProvider = {
  id: 'hungerstation',
  label: 'HungerStation',
  strategies: [connectorStrategy],
};
