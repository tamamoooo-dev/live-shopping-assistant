// carrefour.js — Carrefour KSA, through the owner's own browser only.
//
// Carrefour's site answers a server with an empty shell, so the connector
// never asks it. With the owner's code ("use my browser", browserRelay.js) a
// search is run in the owner's own Chrome and comes back as the same
// normalized objects as every store. Without a code this provider does not
// call anything: the chip says the store blocks online checks and offers the
// browser.

import { RELAY_HEADER, noteRelayState, relayKey } from '../browserRelay.js';

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';

function blockedError(message) {
  const err = new Error(message || 'Carrefour answers only a browser.');
  err.blocked = true;
  return err;
}

const connectorStrategy = {
  name: 'connector',
  async run(query) {
    const key = relayKey();
    if (!key) throw blockedError();
    const url = `${CONNECTOR_BASE}/search?provider=carrefour&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { [RELAY_HEADER]: key } });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 403 && json && json.blocked) {
        noteRelayState('carrefour', json.relay || 'error');
        throw blockedError(json.error);
      }
      throw new Error((json && json.error) || `Connector HTTP ${res.status}`);
    }
    noteRelayState('carrefour', null);
    if (!json || !Array.isArray(json.results)) {
      throw new Error('Unexpected connector response');
    }
    return json.results;
  },
};

export const carrefourProvider = {
  id: 'carrefour',
  label: 'Carrefour',
  strategies: [connectorStrategy],
};
