// noon.js — the Noon provider, routed through the Serverless Connector.
//
// Identical in shape to the other providers; the ONLY difference is the
// connector `provider` parameter (noon). The connector performs the live Noon
// lookup server-side (Noon Minutes search) and returns the same normalized
// objects.

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

// Best-effort store: one client-side retry — a second connector request is a
// fresh Worker invocation (new egress IP), which clears most transient
// upstream refusals. Mirrors the Amazon provider.
const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=noon&q=${encodeURIComponent(query)}`;
    const attempt = async () => {
      const res = await fetch(url);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((json && json.error) || `Connector HTTP ${res.status}`);
      }
      if (!json || !Array.isArray(json.results)) {
        throw new Error('Unexpected connector response');
      }
      return json.results;
    };
    try {
      return await attempt();
    } catch {
      await new Promise((r) => setTimeout(r, 400));
      return attempt();
    }
  },
};

export const noonProvider = {
  id: 'noon',
  label: 'Noon',
  strategies: [connectorStrategy],
};
