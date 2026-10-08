// core.test.mjs — adaptiveSearch: "no match" is an answer, not a failure.
import assert from 'node:assert/strict';
import { adaptiveSearch } from './core.js';

let passed = 0;
const ok = (condition, message) => { assert.ok(condition, message); passed += 1; };

const memory = () => {
  const values = new Map();
  return { get: (k) => values.get(k) ?? null, set: (k, v) => values.set(k, v), values };
};
const provider = (...strategies) => ({ id: 'store', label: 'Store', strategies });
const answers = (name, results) => ({ name, run: async () => results });
const throws = (name, message) => ({ name, run: async () => { throw new Error(message); } });

{
  const m = memory();
  const found = await adaptiveSearch(provider(answers('a', [{ id: '1' }])), 'milk', m);
  ok(found.results.length === 1 && found.strategy === 'a', 'results come back with their strategy');
  ok(m.values.get('strategy.store') === 'a', 'the winner is remembered');
}

{
  const m = memory();
  const empty = await adaptiveSearch(provider(answers('a', [])), 'milk', m);
  ok(empty.empty === true && empty.results.length === 0, 'an empty answer resolves, it does not throw');
}

{
  const m = memory();
  m.set('strategy.store', 'b');
  const mixed = await adaptiveSearch(provider(throws('a', 'HTTP 502'), answers('b', [])), 'milk', m);
  ok(mixed.empty === true && mixed.strategy === 'b', 'one method failing while another answers empty is still an answer');
  ok(m.values.get('strategy.store') === 'b', 'an empty answer keeps the remembered winner');
}

{
  const m = memory();
  m.set('strategy.store', 'a');
  await assert.rejects(
    adaptiveSearch(provider(throws('a', 'HTTP 502'), throws('b', 'blocked')), 'milk', m),
    (err) => err.details.length === 2,
  );
  passed += 1;
  ok(m.values.get('strategy.store') === '', 'a store that never answers forgets its stale winner');
}

console.log(`core.test: ${passed} passed, 0 failed`);
