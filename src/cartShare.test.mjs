// Sharing the cart: the link alone goes to the share sheet (no text beside
// it), else the link is copied.
import assert from 'node:assert/strict';
import { shareLink } from './cartShare.js';

const url = 'https://example.test/app/#/cart?l=zAB';
const setNav = (nav) => Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });

const calls = [];
setNav({ share: async (d) => { calls.push(d); }, canShare: () => true });
assert.equal(await shareLink({ title: 'Shopping list', url }), 'shared');
assert.deepEqual(calls[0], { title: 'Shopping list', url }, 'the link goes to the share sheet with no text');
assert.ok(!('text' in calls[0]), 'no message text is added');

setNav({ share: async () => { throw Object.assign(Error('no'), { name: 'AbortError' }); } });
assert.equal(await shareLink({ title: 'T', url }), 'cancelled', 'closing the sheet does nothing');

let copied = null;
setNav({
  share: async () => { throw Object.assign(Error('no'), { name: 'NotAllowedError' }); },
  clipboard: { writeText: async (v) => { copied = v; } },
});
assert.equal(await shareLink({ title: 'T', url }), 'copied');
assert.equal(copied, url, 'a refused share copies the link itself');

copied = null;
setNav({ clipboard: { writeText: async (v) => { copied = v; } } });
assert.equal(await shareLink({ title: 'T', url }), 'copied', 'no share sheet: copy');
assert.equal(copied, url);

setNav({ canShare: () => false, share: async () => assert.fail('not called'), clipboard: { writeText: async (v) => { copied = v; } } });
assert.equal(await shareLink({ title: 'T', url }), 'copied', 'a sheet that cannot take it: copy');

console.log('cart share tests passed');
