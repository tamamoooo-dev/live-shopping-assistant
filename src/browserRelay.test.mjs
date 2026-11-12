// "Use my browser": the code, the note on a blocked store's chip, and what the
// Lulu provider sends with and without a code.
import assert from 'node:assert/strict';
import { _setProfileStorage } from './profile.js';
import { cleanRelayKey, relayKey, setRelayKey, relayNote, noteRelayState, RELAY_HEADER } from './browserRelay.js';
import { luluProvider } from './providers/lulu.js';
import { t } from './i18n.js';

const memory = new Map();
const storage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
_setProfileStorage(storage);
globalThis.localStorage = storage;

// --- the code as people type it ---------------------------------------------------
assert.equal(cleanRelayKey('abcd-efgh-2345'), 'ABCDEFGH2345');
assert.equal(cleanRelayKey('a0cd ef1h 2345'), 'AOCDEFIH2345', '0 is read as O and 1 as I');
assert.equal(cleanRelayKey('ABCD-EFGH-234'), null);
assert.equal(cleanRelayKey(''), null);

// --- no code: the chip offers the browser; the provider behaves as before ----------
assert.equal(relayKey(), null);
assert.equal(relayNote('lulu'), t('relay.offer'));
assert.equal(relayNote('panda'), null, 'only stores the extension can read');

const calls = [];
let answer = () => ({ status: 403, body: { blocked: true, error: 'Lulu refuses automated requests.' } });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: (init && init.headers) || {} });
  const { status, body } = answer();
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
};
const run = () => luluProvider.strategies[0].run('milk');

await assert.rejects(run, (err) => err.blocked === true);
assert.deepEqual(calls[0].headers, {}, 'no code, no header');
await assert.rejects(run, (err) => err.blocked === true);
assert.equal(calls.length, 1, 'without a code a blocked Lulu is not asked again for hours');

// --- with a code ---------------------------------------------------------------------
assert.equal(setRelayKey('abcd-efgh-2345'), 'ABCDEFGH2345');
assert.equal(relayKey(), 'ABCDEFGH2345');
assert.equal(relayNote('lulu'), null, 'nothing to say before a search');

answer = () => ({ status: 403, body: { blocked: true, relay: 'offline' } });
await assert.rejects(run, (err) => err.blocked === true);
assert.equal(calls.length, 2, 'with a code Lulu is asked every time');
assert.equal(calls[1].headers[RELAY_HEADER], 'ABCDEFGH2345');
assert.equal(relayNote('lulu'), t('relay.state.offline'));

answer = () => ({ status: 403, body: { blocked: true, relay: 'no-price' } });
await assert.rejects(run);
assert.equal(relayNote('lulu'), t('relay.state.no-price'));

answer = () => ({ status: 403, body: { blocked: true, relay: 'something new' } });
await assert.rejects(run);
assert.equal(relayNote('lulu'), t('relay.state.error'), 'an unknown reason reads as a plain failure');

answer = () => ({ status: 200, body: { results: [{ id: 1, name: 'حليب', price: 12.5 }] } });
assert.equal((await run()).length, 1);
assert.equal(relayNote('lulu'), null, 'an answer clears the reason');
assert.equal(calls.length, 5);

// --- every state has its words in both languages ------------------------------------------
for (const state of ['offline', 'refused', 'stopped', 'paused', 'busy', 'timeout', 'no-price', 'error']) {
  noteRelayState('lulu', state);
  assert.notEqual(relayNote('lulu'), `relay.state.${state}`, `words for ${state}`);
}

// --- removing the code -------------------------------------------------------------------
assert.equal(setRelayKey(''), null);
assert.equal(relayKey(), null);
assert.equal(relayNote('lulu'), t('relay.offer'));

console.log('browserRelay.test: ok');
