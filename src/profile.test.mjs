// profile.test.mjs — offline, dependency-free tests for the local profile.
// Run with:  node src/profile.test.mjs  (repo root).
//
// Guards the milestone's promises (Local Profile):
//  • a profile is created automatically on first open, with a unique id,
//  • the SAME profile comes back on every later visit (same storage),
//  • a corrupt or foreign record is replaced, never crashes the app,
//  • blocked storage degrades to a session-only profile (app still works),
//  • profileGet/profileSet round-trip JSON values under the profile umbrella.

import {
  getProfile, initProfile, profileGet, profileSet, _setProfileStorage,
} from './profile.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', name); } };

// In-memory Storage stand-in so the tests are hermetic.
const makeMem = () => {
  const mem = new Map();
  return {
    mem,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
  };
};

// --- first open: automatic creation ---
let store = makeMem();
_setProfileStorage(store);
const first = initProfile();
ok('profile is created on first open', !!first && typeof first.id === 'string' && first.id.length > 0);
ok('profile has createdAt', typeof first.createdAt === 'string' && first.createdAt.length > 0);
ok('profile stamps lastSeenAt', typeof first.lastSeenAt === 'string');
ok('profile is persisted', store.mem.has('lsa.profile.v1'));

// --- returning: same browser, same profile ---
_setProfileStorage(store); // fresh module cache over the SAME storage = a return visit
const again = initProfile();
ok('same id on return', again.id === first.id);
ok('same createdAt on return', again.createdAt === first.createdAt);

// --- two browsers never share an id ---
_setProfileStorage(makeMem());
ok('different browser -> different id', getProfile().id !== first.id);

// --- corrupt record is replaced, not fatal ---
store = makeMem();
store.setItem('lsa.profile.v1', '{not json');
_setProfileStorage(store);
const healed = getProfile();
ok('corrupt record heals into a fresh profile', typeof healed.id === 'string' && healed.id.length > 0);
store = makeMem();
store.setItem('lsa.profile.v1', JSON.stringify({ hello: 'no id here' }));
_setProfileStorage(store);
ok('id-less record heals into a fresh profile', typeof getProfile().id === 'string');

// --- blocked storage: session-only profile, no crash ---
_setProfileStorage({
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
});
const ephemeral = initProfile();
ok('blocked storage still yields a profile', typeof ephemeral.id === 'string' && ephemeral.id.length > 0);
ok('blocked storage: profileGet returns fallback', profileGet('anything', 'fb') === 'fb');
profileSet('anything', { x: 1 }); // must not throw

// --- future personalization slots ---
_setProfileStorage(makeMem());
ok('profileGet default fallback is null', profileGet('missing') === null);
ok('profileGet honours fallback', profileGet('missing', 42) === 42);
profileSet('prefs', { theme: 'dark', n: 3 });
const back = profileGet('prefs');
ok('profileSet/profileGet round-trip', back && back.theme === 'dark' && back.n === 3);
profileSet('count', 7);
ok('scalar values round-trip', profileGet('count') === 7);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
