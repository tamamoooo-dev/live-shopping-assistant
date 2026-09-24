import assert from 'node:assert/strict';
import { consensusOverOrderings, INVALID, observedConsensus } from '../lib/consensus.mjs';
import { createPriceExtractor, messageText, normalizePrice } from '../lib/price.mjs';
import { buildBody, checkTemplate, IMAGE_PLACEHOLDER, modelFamily, templateHash } from '../lib/request.mjs';
import { parseCsv } from '../lib/manifest.mjs';
import { bootstrap, wilson } from '../lib/stats.mjs';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// --- prices -----------------------------------------------------------------
assert.equal(normalizePrice(12.95), 1295, 'number');
assert.equal(normalizePrice('12.95'), 1295, 'string');
assert.equal(normalizePrice('12.95 SAR'), 1295, 'currency suffix');
assert.equal(normalizePrice('ر.س 12.95'), 1295, 'arabic currency');
assert.equal(normalizePrice('١٢٫٩٥'), 1295, 'arabic-indic digits and decimal separator');
assert.equal(normalizePrice('12,95'), 1295, 'decimal comma');
assert.equal(normalizePrice('1,299'), 129900, 'thousands comma');
assert.equal(normalizePrice('1,299.50'), 129950, 'thousands comma with decimals');
assert.equal(normalizePrice('12.955'), null, 'three decimals is refused');
assert.equal(normalizePrice('12.9.5'), null, 'garbage is refused');
assert.equal(normalizePrice('2 for 10'), null, 'multi-buy is refused, not guessed');
assert.equal(normalizePrice(0), null, 'zero is not a price');
assert.equal(normalizePrice(-3), null, 'negative is not a price');
assert.equal(normalizePrice(null), null, 'null');
assert.equal(normalizePrice(12.9), normalizePrice('12.90'), '12.9 and "12.90" are the same price');

assert.equal(messageText({ choices: [{ message: { content: 'x' } }] }), 'x', 'string content');
assert.equal(
  messageText({ choices: [{ message: { content: [{ type: 'thinking', thinking: [] }, { type: 'text', text: '{"a":1}' }] } }] }),
  '{"a":1}',
  'chunked content keeps only text chunks',
);

const ex = await createPriceExtractor({ type: 'jsonPath', path: 'price.current' }, '.');
assert.deepEqual(ex('{"price":{"current":"9.95"}}'), { cents: 995, error: null }, 'json path');
assert.equal(ex('not json').error, 'not-json', 'invalid json');
assert.equal(ex('{"price":{}}').error, 'field-missing', 'missing field');
assert.equal(ex('{"price":{"current":"n/a"}}').error, 'unreadable-price', 'unreadable');
assert.equal(ex('```json\n{"price":{"current":1}}\n```').error, 'not-json', 'fences are not stripped unless asked');
const exFences = await createPriceExtractor({ type: 'jsonPath', path: 'p', stripCodeFences: true }, '.');
assert.equal(exFences('```json\n{"p":1}\n```').cents, 100, 'fences stripped when asked');
await assert.rejects(createPriceExtractor({ type: 'jsonPath', path: '<SET: x>' }, '.'), /not set/, 'placeholder path refused');

// --- consensus: observed order ----------------------------------------------
assert.deepEqual(observedConsensus([100, 100, 200, 200], 4), { status: 'accepted', value: 100, calls: 2 }, 'first pair');
assert.deepEqual(observedConsensus([100, 200, 200, 100], 4), { status: 'accepted', value: 200, calls: 3 }, 'consecutive pair');
assert.deepEqual(observedConsensus([100, 200, 100, 200], 4), { status: 'no-consensus', value: null, calls: 4 }, 'alternating never agrees');
assert.deepEqual(observedConsensus([null, null, 100], 3), { status: 'no-consensus', value: null, calls: 3 }, 'two invalid readings are not agreement');
assert.deepEqual(observedConsensus([100, 200, 200], 2), { status: 'no-consensus', value: null, calls: 2 }, 'cap respected');
assert.equal(observedConsensus([100], 2).status, 'insufficient', 'too few readings');

// --- consensus: exact average over orderings --------------------------------
function bruteForce(readings, cap) {
  const out = new Map();
  let none = 0;
  let calls = 0;
  let total = 0;
  const idx = readings.map((_, i) => i);
  const permute = (arr, k, acc) => {
    if (acc.length === k) {
      const o = observedConsensus(acc.map((i) => readings[i]), cap);
      total++;
      calls += o.calls;
      if (o.status === 'accepted') out.set(o.value, (out.get(o.value) || 0) + 1);
      else none++;
      return;
    }
    for (const i of arr) if (!acc.includes(i)) permute(arr, k, [...acc, i]);
  };
  permute(idx, cap, []);
  return { accept: new Map([...out].map(([k, v]) => [k, v / total])), noConsensus: none / total, expectedCalls: calls / total };
}
const cases = [
  [[100, 100, 100, 100], 2],
  [[100, 100, 200, 200], 2],
  [[100, 100, 200, 200], 3],
  [[100, 100, 200, null, 300], 4],
  [[100, null, null, 200, 200, 100], 5],
  [[100, 200, 300, null, 100, 200], 6],
];
for (const [readings, cap] of cases) {
  const exact = consensusOverOrderings(readings, cap);
  const brute = bruteForce(readings, cap);
  const label = `${readings.join(',')} cap ${cap}`;
  for (const v of new Set([...exact.accept.keys(), ...brute.accept.keys()])) {
    close(exact.accept.get(v) || 0, brute.accept.get(v) || 0, `accept ${v} for ${label}`);
  }
  close(exact.noConsensus, brute.noConsensus, `no consensus for ${label}`);
  close(exact.expectedCalls, brute.expectedCalls, `expected calls for ${label}`);
  let sum = exact.noConsensus;
  for (const p of exact.accept.values()) sum += p;
  close(sum, 1, `probabilities sum to 1 for ${label}`);
}
// Cap 2 is the textbook U-statistic: n_v(n_v-1) / (n(n-1)).
const two = consensusOverOrderings([100, 100, 100, 100, 200, 200, 200, 200], 2);
close(two.accept.get(100), (4 * 3) / (8 * 7), 'cap-2 acceptance is the unbiased pair estimate');
assert.equal(consensusOverOrderings([null, null, null], 3).accept.size, 0, 'all-invalid never accepts');
assert.ok(!consensusOverOrderings([null, null, 100], 3).accept.has(INVALID), 'invalid is never an accepted value');
assert.throws(() => consensusOverOrderings([1, 2], 3), /exceeds/, 'cap above readings refused');
// 8 readings, 8 distinct values: memoized recursion must stay fast.
const t0 = Date.now();
consensusOverOrderings([1, 2, 3, 4, 5, 6, 7, 8], 8);
consensusOverOrderings([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 12);
assert.ok(Date.now() - t0 < 2000, 'worst case is fast');

// --- request template -------------------------------------------------------
const tpl = {
  model: 'ministral-14b-2512',
  temperature: 0.3,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'read the price' }, { type: 'image_url', image_url: IMAGE_PLACEHOLDER }] }],
};
assert.deepEqual(checkTemplate(tpl, { requiredModel: 'ministral-14b-2512' }).problems, [], 'valid template');
assert.match(checkTemplate(tpl, { requiredModel: 'ministral-14b-2512' }).warnings[0], /overridden/, 'template temperature is flagged as overridden');
assert.match(checkTemplate(tpl, { requiredModel: 'mistral-medium-latest' }).problems.join(), /refusing to run a different model/, 'model mismatch refused');
assert.match(checkTemplate({ ...tpl, model: '<SET: x>' }, { requiredModel: '<SET: x>' }).problems.join(), /not set/, 'placeholder model refused');
assert.match(checkTemplate({ ...tpl, random_seed: 7 }, { requiredModel: tpl.model }).problems.join(), /random seed/, 'random seed refused');
assert.equal(checkTemplate({ ...tpl, random_seed: 7 }, { requiredModel: tpl.model, allowRandomSeed: true }).problems.length, 0, 'random seed allowed explicitly');
assert.match(checkTemplate({ ...tpl, messages: [] }, { requiredModel: tpl.model }).problems.join(), /exactly once/, 'missing image placeholder refused');
assert.match(
  checkTemplate({ ...tpl, messages: [{ role: 'user', content: [{ type: 'text', text: '<PASTE: prompt>' }, { type: 'image_url', image_url: IMAGE_PLACEHOLDER }] }] }, { requiredModel: tpl.model }).problems.join(),
  /unfilled placeholders/,
  'unfilled prompt refused',
);
assert.match(checkTemplate({ ...tpl, n: 3 }, { requiredModel: tpl.model }).problems.join(), /n must be/, 'n > 1 refused');

const body = buildBody(tpl, { imageDataUrl: 'data:image/png;base64,AAAA', temperature: 0.7 });
assert.equal(body.temperature, 0.7, 'temperature set');
assert.equal(body.messages[0].content[1].image_url, 'data:image/png;base64,AAAA', 'image substituted');
assert.equal(tpl.messages[0].content[1].image_url, IMAGE_PLACEHOLDER, 'template not mutated');
assert.equal(templateHash(tpl), templateHash({ ...tpl, temperature: 0 }), 'hash ignores temperature');
assert.notEqual(templateHash(tpl), templateHash({ ...tpl, top_p: 0.9 }), 'hash sees every other field');
assert.equal(
  templateHash({ a: 1, b: { c: 2, d: 3 } }),
  templateHash({ b: { d: 3, c: 2 }, a: 1 }),
  'hash is key-order independent',
);

assert.equal(modelFamily('ministral-14b-latest'), modelFamily('ministral-14b-2512'), 'alias and pinned id are one family');
assert.notEqual(modelFamily('ministral-14b-latest'), modelFamily('mistral-medium-latest'), 'medium is another family');
assert.notEqual(modelFamily('ministral-14b-2512'), modelFamily('ministral-8b-2512'), '8b is another family');

// --- manifest CSV -----------------------------------------------------------
assert.deepEqual(
  parseCsv('id,image,notes\r\na,a.jpg,"has, comma"\nb,b.jpg,"say ""hi"""\n\n'),
  [{ id: 'a', image: 'a.jpg', notes: 'has, comma' }, { id: 'b', image: 'b.jpg', notes: 'say "hi"' }],
  'csv with quotes, CRLF and blank lines',
);

// --- stats ------------------------------------------------------------------
const [lo, hi] = wilson(0, 50);
assert.equal(lo, 0, 'wilson lower bound at 0');
assert.ok(hi > 0.05 && hi < 0.09, 'wilson 0/50 upper bound ≈ 7%');
const b = bootstrap(40, { m: (ix) => ix.length }, { iterations: 50, seed: 3 });
assert.deepEqual(b.m, [40, 40], 'bootstrap resamples n crops');

console.log('vision temperature calibration unit tests passed');
