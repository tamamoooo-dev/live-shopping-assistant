// amazon.js — the Amazon (Experimental) provider, routed through the connector.
//
// Identical in shape to the Panda provider; the ONLY difference is the
// connector `provider` parameter (amazon vs panda). The connector performs the
// live Amazon lookup server-side (PA-API when configured, best-effort HTML
// otherwise) and returns the same normalized result objects.
//
// Amazon is experimental: it may hit an anti-bot challenge or return nothing.
// In those cases the connector responds with an error, this strategy throws,
// and the UI shows a friendly "Amazon temporarily unavailable" message.

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

// Amazon's anti-bot interstitial still gets through occasionally (~10% of
// Worker invocations, even after the connector's own in-Worker retries). A
// SECOND connector request is a fresh Worker invocation — new egress IP, a
// fresh retry budget — so one client-side retry converts most of those
// residual failures into results instead of an "unavailable" note.
const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const url = `${CONNECTOR_BASE}/search?provider=amazon&q=${encodeURIComponent(query)}`;
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

export const amazonProvider = {
  id: 'amazon',
  label: 'Amazon',
  strategies: [connectorStrategy],
};
