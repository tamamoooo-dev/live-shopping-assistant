// ninja.js — the Ninja (نينجا) Market provider (routed through the connector).
//
// Ninja is a Saudi quick-commerce grocery app. All store-specific logic (the
// guest-token bootstrap + the fahras catalogue search) lives server-side in the
// connector's Ninja provider; this frontend provider just asks the connector and
// returns the SAME normalized result objects every provider produces.
//
//   Connector endpoint:  GET /search?provider=ninja&q=<query>
//   Connector response:  { provider, query, strategy, count, results: [ ...NormalizedResult ] }

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=ninja&q=${encodeURIComponent(query)}`;
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

export const ninjaProvider = {
  id: 'ninja',
  label: 'Ninja',
  strategies: [connectorStrategy],
};
