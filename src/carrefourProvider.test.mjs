// Carrefour is searched only through the owner's own browser: without a code
// the provider calls nothing; with one it sends the code and reports why the
// browser did not answer.
import assert from 'node:assert/strict';
import { _setProfileStorage } from './profile.js';
import { setRelayKey, relayNote, RELAY_HEADER, RELAY_STORES } from './browserRelay.js';
import { carrefourProvider } from './providers/carrefour.js';
import { ONLINE_STORE_BY_ID } from './onlineStores.js';
import { t } from './i18n.js';

const memory = new Map();
_setProfileStorage({ getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)) });

assert.equal(ONLINE_STORE_BY_ID.carrefour.provider, carrefourProvider);
assert.equal(RELAY_STORES.has('carrefour'), true);

const calls = [];
let answer = () => ({ status: 403, body: { blocked: true, relay: 'no-price' } });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: (init && init.headers) || {} });
  const { status, body } = answer();
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};
const run = () => carrefourProvider.strategies[0].run('حليب');

await assert.rejects(run, (err) => err.blocked === true);
assert.equal(calls.length, 0, 'no code: nothing is called');
assert.equal(relayNote('carrefour'), t('relay.offer'));

setRelayKey('abcd-efgh-2345');
await assert.rejects(run, (err) => err.blocked === true);
assert.equal(calls.length, 1);
assert.match(calls[0].url, /provider=carrefour&q=%D8/);
assert.equal(calls[0].headers[RELAY_HEADER], 'ABCDEFGH2345');
assert.equal(relayNote('carrefour'), t('relay.state.no-price'));

answer = () => ({ status: 200, body: { results: [{ id: '1', name: 'حليب', price: 11.5 }] } });
assert.equal((await run()).length, 1);
assert.equal(relayNote('carrefour'), null);

console.log('carrefourProvider.test: ok');
