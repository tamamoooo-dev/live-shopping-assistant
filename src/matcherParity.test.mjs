// matcherParity.test.mjs — this mirror (frontend src/match.js) against the
// shared golden vectors. The engine runs the same file against matching.js;
// the format and the regenerate tool live in the engine repo
// (brochure-engine/matcher-parity.mjs). matcherParity.vectors.json must stay
// byte-identical in both repos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as frontend from './match.js';

const SIDE = 'frontend';
const vectors = JSON.parse(readFileSync(new URL('./matcherParity.vectors.json', import.meta.url), 'utf8'));

// Same decoding as the engine's runCase (matcher-parity.mjs).
const normalize = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value, (key, v) => (
  v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v === undefined ? null : v
)));
function runCase(side, fn, args, items) {
  if (fn === 'JOURNEY_POLICY') return normalize(side.JOURNEY_POLICY);
  if (fn === 'matchStage') return normalize(side.matchStage(items[args[0]], args[1]));
  if (fn === 'offerFamily') return normalize(side.offerFamily(items[args[0]]));
  if (fn === 'resolveJourneyPool') {
    const candidates = args[0].map(([i, stage, family, type]) => ({ i, stage, family, type, text: items[i].name }));
    const out = side.resolveJourneyPool(candidates, args[1], args[2]);
    return normalize({ ...out, kept: out.kept.map((c) => c.i) });
  }
  return normalize(side[fn](...args));
}

let checked = 0;
const failures = [];
for (const [fn, list] of Object.entries(vectors.cases)) {
  for (const [args, stored] of list) {
    const expected = stored && typeof stored === 'object' && '$diverge' in stored ? stored.$diverge[SIDE] : stored;
    const actual = runCase(frontend, fn, args, vectors.items);
    checked += 1;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ fn, args, expected, actual });
  }
}
for (const f of failures.slice(0, 10)) {
  console.error(`  DRIFT ${f.fn}(${JSON.stringify(f.args).slice(0, 120)})\n    expected ${JSON.stringify(f.expected).slice(0, 160)}\n    actual   ${JSON.stringify(f.actual).slice(0, 160)}`);
}
assert.equal(failures.length, 0, `${failures.length} matcher case(s) drifted from the shared vectors — change BOTH mirrors, then regenerate (brochure-engine/matcher-parity.mjs)`);
console.log(`matcherParity.test: ${checked} cases match the shared vectors (${Object.values(vectors.divergences).reduce((n, v) => n + v, 0)} pinned divergences)`);
