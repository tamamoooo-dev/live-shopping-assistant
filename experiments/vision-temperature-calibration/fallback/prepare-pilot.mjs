#!/usr/bin/env node
// prepare-pilot.mjs — build the pilot's inputs FROM the real fallback code, and
// prove the harness sends and scores exactly what the fallback would.
//
//   node fallback/prepare-pilot.mjs --engine <shopping-connector checkout> --out pilot-2026-09-24
//
// <engine> is a READ-ONLY checkout of shopping-connector at the fallback commit
// (branch claude/unpriced-flyer-items). Nothing in it is written, and no
// network call is made: every check below runs the engine's own code against a
// local fake fetch.
//
// It writes into --out:
//   data/NN.jpg + crops.csv   the 10 crops and their human-verified prices
//   request-template.json     buildVisionRequest()'s body, image replaced by the placeholder
//   parser.mjs                the fallback's reply parser (imports its real priceReading)
//   experiment.config.json    model, temperatures, readings, ±0.01 agreement
//   PROVENANCE.json           engine commit, hashes, selection, fidelity results
// and refuses (exit 1) if any fidelity check fails.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildBody, IMAGE_PLACEHOLDER } from '../lib/request.mjs';
import { createPriceExtractor } from '../lib/price.mjs';
import { mimeOf } from '../lib/manifest.mjs';
import { mulberry32, shuffle } from '../lib/stats.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!args.engine || !args.out) {
  console.error('usage: node fallback/prepare-pilot.mjs --engine <checkout> --out <dir> [--seed <text>]');
  process.exit(1);
}

const ENGINE = resolve(args.engine);
const OUT = resolve(args.out);
const SEED_TEXT = args.seed || 'vision-temperature-pilot-2026-09-24';
const REQUIRED = ['08', '37']; // the two crossed-out-price inversions of the 50-crop benchmark
const PICK = 8;
const TEMPERATURES = [0, 0.15, 0.3, 0.5, 0.7];
const READINGS = 6;
const BENCH = 'brochure-engine/benchmarks/mistral-medium-production-validation-50-2026-07-25';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); return ok; };

const commit = execFileSync('git', ['-C', ENGINE, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const src = (p) => pathToFileURL(resolve(ENGINE, 'brochure-engine/src', p)).href;
const enrich = await import(src('offers/enrich.js'));
const fallback = await import(src('offers/priceFallback.js'));
const keys = await import(src('offers/mistralKeys.js'));

// --- 1. the model and the frozen prompt ---------------------------------------
const MODEL = keys.MISTRAL_POOL_DEFINITIONS.ministral14.model;
const promptSha = sha(enrich.VISION_PROMPT);
const fileSha = sha(readFileSync(resolve(ENGINE, BENCH, 'production-prompt.txt')));
check(promptSha === enrich.VISION_PROMPT_SHA256, `VISION_PROMPT sha256 ${promptSha} != VISION_PROMPT_SHA256`);
check(promptSha === fileSha, `VISION_PROMPT sha256 ${promptSha} != production-prompt.txt ${fileSha}`);

// The parse lines of readOnce() are not exported; parser.mjs repeats them.
// Refuse if the engine's text has drifted from what is repeated.
const fallbackSrc = readFileSync(resolve(ENGINE, 'brochure-engine/src/offers/priceFallback.js'), 'utf8');
for (const line of [
  'const raw = response.body?.choices?.[0]?.message?.content ?? null;',
  "const match = /\\{[\\s\\S]*\\}/.exec(String(raw || ''));",
  'parsed = JSON.parse(match ? match[0] : raw);',
  'return { reading: priceReading(parsed), rateLimit: response.rateLimit };',
  'const body = { ...buildVisionRequest({ model, contentType: crop.contentType, base64: crop.base64 }), temperature };',
]) check(fallbackSrc.includes(line), `priceFallback.js no longer contains: ${line}`);

// --- 2. the crops ---------------------------------------------------------------
const truth = JSON.parse(readFileSync(resolve(ENGINE, BENCH, 'human-canonical.json'), 'utf8'));
const idOf = (index) => String(index).padStart(2, '0');
const values = (f) => ((f && f.accepted) || []).filter((v) => v != null);
const eligible = truth.samples.filter((s) => {
  const cur = values(s.current_price);
  const old = values(s.old_price);
  return !s.current_price?.unadjudicable && !s.old_price?.unadjudicable
    && cur.length === 1 && old.length === 1 && (s.old_price.accepted || []).length === 1;
});
const others = eligible.map((s) => idOf(s.index)).filter((id) => !REQUIRED.includes(id)).sort();
check(REQUIRED.every((id) => eligible.some((s) => idOf(s.index) === id)), 'crop 08 or 37 is not an eligible human-verified crop');
const seed = createHash('sha256').update(SEED_TEXT).digest().readUInt32BE(0);
const picked = shuffle(others, mulberry32(seed)).slice(0, PICK);
const selected = [...REQUIRED, ...picked].sort();

mkdirSync(resolve(OUT, 'data'), { recursive: true });
const rows = selected.map((id) => {
  const s = truth.samples.find((x) => idOf(x.index) === id);
  const from = resolve(ENGINE, BENCH, 'assets', `${id}.jpg`);
  copyFileSync(from, resolve(OUT, 'data', `${id}.jpg`));
  const bytes = readFileSync(from);
  check(mimeOf(bytes) === 'image/jpeg', `crop ${id} is not a JPEG`);
  return { id, store: s.store, current: values(s.current_price)[0], old: values(s.old_price)[0], sha256: sha(bytes), bytes, note: s.note || '' };
});
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(
  resolve(OUT, 'crops.csv'),
  `id,image,current_price,old_price,store,notes\n${rows.map((r) => [r.id, `data/${r.id}.jpg`, r.current.toFixed(2), r.old.toFixed(2), r.store, `benchmark crop ${r.id}, human-canonical-truth-v2${r.note ? `; ${r.note}` : ''}`].map(csvCell).join(',')).join('\n')}\n`,
);

// --- 3. the request template, from the engine's own builder -----------------------
const template = enrich.buildVisionRequest({ model: MODEL, contentType: 'image/jpeg', base64: 'X' });
check(template.messages[0].content[1].image_url === 'data:image/jpeg;base64,X', 'buildVisionRequest image shape changed');
template.messages[0].content[1].image_url = IMAGE_PLACEHOLDER;
writeFileSync(resolve(OUT, 'request-template.json'), `${JSON.stringify(template, null, 2)}\n`);

// --- 4. the parser: the fallback's own priceReading, behind readOnce's parse lines ---
writeFileSync(resolve(OUT, 'parser.mjs'), `// Generated by fallback/prepare-pilot.mjs from shopping-connector ${commit}.
// The fallback's reply parser. priceReading is IMPORTED from the engine; the
// three parse lines are readOnce()'s, verbatim (prepare-pilot.mjs refuses to
// run if the engine's text changes).
import { priceReading } from '${src('offers/priceFallback.js')}';

export function parseReading(_text, response) {
  const raw = response?.choices?.[0]?.message?.content ?? null;
  let parsed = null;
  try {
    const match = /\\{[\\s\\S]*\\}/.exec(String(raw || ''));
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    parsed = null; // an unparsable reply is an invalid reading, not an error
  }
  return priceReading(parsed); // { current, old } or null
}
`);

// --- 5. fidelity: run the REAL drain against a fake fetch --------------------------
// Captures the exact request the fallback sends, and the readings it records,
// then compares both with what the harness sends and parses.
async function engineDrain({ cropBytes, temperature, replies, maxReadings }) {
  const sent = [];
  let call = 0;
  const fetchImpl = async (url, init) => {
    if (!init) return new Response(cropBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    sent.push({ url, headers: init.headers, body: init.body });
    const content = replies[Math.min(call++, replies.length - 1)];
    return new Response(JSON.stringify({ model: MODEL, choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let audit = null;
  const offerStore = {
    listPricePending: async () => [{ id: 'fidelity:x:d4d:1', store: 'x', region: 'x', source: 'd4d', image_url: 'https://crop.invalid/x.jpg', raw_json: JSON.stringify({ description: '' }), attempts: 0 }],
    resolvePricePending: async (_id, r) => { audit = r.audit; },
    markPricePendingAttempt: async () => {},
    getById: async () => null,
    upsertMany: async () => {},
  };
  // A stub slot so withFailover calls through; it is not a key and goes nowhere but the fake fetch.
  const keyChain = { hasKeys: () => true, pick: () => ({ key: 'fidelity-check-stub', index: 0 }), markSuccess() {}, snapshot: () => [] };
  const report = await fallback.drainPriceFallback({ offerStore, keyChain }, { model: MODEL, currentOn: '2026-09-24', temperature, maxReadings, fetchImpl });
  return { sent, audit, report };
}

// 5a. request bytes, every crop x every temperature
let bodiesChecked = 0;
for (const r of rows) {
  for (const t of TEMPERATURES) {
    const { sent } = await engineDrain({ cropBytes: r.bytes, temperature: t, replies: ['{"current_price": 1}'], maxReadings: 2 });
    const harnessBody = JSON.stringify(buildBody(template, { imageDataUrl: `data:image/jpeg;base64,${r.bytes.toString('base64')}`, temperature: t }));
    check(sent.length === 2, `crop ${r.id} T=${t}: engine made ${sent.length} calls`);
    for (const s of sent) {
      check(s.url === enrich.MISTRAL_URL, `engine endpoint ${s.url}`);
      check(s.body === harnessBody, `crop ${r.id} T=${t}: harness body differs from the fallback's`);
      check(JSON.stringify(Object.keys(s.headers)) === JSON.stringify(['authorization', 'content-type']) && s.headers['content-type'] === 'application/json', 'engine headers changed');
      bodiesChecked++;
    }
  }
}

// 5b. parsing, on replies chosen to hit every branch of the parser
const extractor = await createPriceExtractor({ type: 'module', path: resolve(OUT, 'parser.mjs'), export: 'parseReading' }, OUT);
const replies = [
  '{"current_price": 30, "old_price": 44.99}',
  '{"current_price": 44.99, "old_price": 30}',
  '{"current_price": "12.95", "old_price": null}',
  '{"current_price": 12.955}',
  '```json\n{"current_price": 9.5}\n```',
  'Here it is: {"current_price": 7, "old_price": ""} thanks',
  '{"current_price": null, "old_price": 10}',
  '{"current_price": 0}',
  '{"current_price": 10, "old_price": 10}',
  '{"current_price": "SAR 10"}',
  'no json at all',
  '{"a": {"current_price": 3}} {"current_price": 4}',
];
let parsesChecked = 0;
for (const content of replies) {
  const { audit } = await engineDrain({ cropBytes: rows[0].bytes, temperature: 0.3, replies: [content], maxReadings: 2 });
  const engineReading = audit.readings[0]; // [current, old] | null
  const mine = extractor(null, { choices: [{ message: { content } }] });
  const expected = engineReading == null ? { cents: null, oldCents: null } : { cents: Math.round(engineReading[0] * 100), oldCents: engineReading[1] == null ? null : Math.round(engineReading[1] * 100) };
  check(mine.cents === expected.cents && mine.oldCents === expected.oldCents, `parse differs on ${JSON.stringify(content)}: engine ${JSON.stringify(engineReading)}, harness ${JSON.stringify(mine)}`);
  parsesChecked++;
}

// --- 6. config + provenance ----------------------------------------------------------
const config = {
  requiredModel: MODEL,
  endpoint: enrich.MISTRAL_URL,
  temperatures: TEMPERATURES,
  readingsPerTemperature: READINGS,
  priceParser: { type: 'module', path: './parser.mjs', export: 'parseReading' },
  agreement: { toleranceSar: 0.01 },
  concurrency: 1,
  minIntervalMs: 1100,
  timeoutMs: 60000,
  maxRetries: 6,
  seed,
  analysis: { headlineMaxReadings: READINGS, maxReadingsSweep: [2, 3, 4, 5, 6], referenceTemperature: 0, bootstrapIterations: 2000, spotlight: REQUIRED },
};
writeFileSync(resolve(OUT, 'experiment.config.json'), `${JSON.stringify(config, null, 2)}\n`);
const provenance = {
  engine: { repo: 'tamamoooo-dev/shopping-connector', branch: 'claude/unpriced-flyer-items', commit },
  model: MODEL,
  modelSource: 'mistralKeys.js MISTRAL_POOL_DEFINITIONS.ministral14.model (the PRICE_FALLBACK_MODEL default)',
  prompt: { sha256: promptSha, matchesConstant: promptSha === enrich.VISION_PROMPT_SHA256, matchesFrozenFile: promptSha === fileSha },
  fallbackDefaults: fallback.PRICE_FALLBACK_DEFAULTS,
  selection: { seedText: SEED_TEXT, seed, eligible: eligible.length, required: REQUIRED, pool: others.length, picked, selected },
  crops: rows.map(({ bytes, ...r }) => r),
  fidelity: { bodiesChecked, parsesChecked, problems },
  assumption: "The fallback encodes the crop with the CDN's Content-Type header; the benchmark's frozen bytes are JPEG, so image/jpeg is used, as the engine does when the header is image/jpeg or absent.",
};
writeFileSync(resolve(OUT, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`);

console.log(`engine        ${commit} (claude/unpriced-flyer-items)`);
console.log(`model         ${MODEL}`);
console.log(`prompt        sha256 ${promptSha}  constant ${promptSha === enrich.VISION_PROMPT_SHA256 ? '✓' : '✗'}  frozen file ${promptSha === fileSha ? '✓' : '✗'}`);
console.log(`selection     ${eligible.length} eligible; 08 + 37 required; ${PICK} of ${others.length} by seed "${SEED_TEXT}" (${seed})`);
for (const r of rows) console.log(`  ${r.id}  ${r.store.padEnd(10)} current ${r.current.toFixed(2).padStart(7)}   old ${r.old.toFixed(2).padStart(7)}${REQUIRED.includes(r.id) ? '   (known inversion)' : ''}`);
console.log(`fidelity      ${bodiesChecked} request bodies byte-identical to the fallback's; ${parsesChecked} replies parsed identically`);
if (problems.length) {
  console.error(`\n✖ ${problems.length} fidelity problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\n✓ harness matches the fallback');
