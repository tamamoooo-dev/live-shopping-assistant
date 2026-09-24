// End-to-end: run.mjs → readings.jsonl → analyze.mjs against a LOCAL FAKE of
// the chat-completions endpoint. This proves the plumbing only; the fake's
// answers are scripted, and the report must say it is not a Mistral result.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const MODEL = 'ministral-14b-2512';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const dir = mkdtempSync(join(tmpdir(), 'vtc-e2e-'));
const crops = {
  steady: { current: '12.95', old: '' },
  inverts: { current: '9.95', old: '15.95' },
  flaky: { current: '4.50', old: '6.00' },
};
const byHash = new Map();
for (const [id, c] of Object.entries(crops)) {
  const bytes = Buffer.concat([PNG, Buffer.from(`fake crop ${id}`)]);
  writeFileSync(join(dir, `${id}.png`), bytes);
  byHash.set(createHash('sha256').update(`data:image/png;base64,${bytes.toString('base64')}`).digest('hex'), id);
}
writeFileSync(
  join(dir, 'crops.csv'),
  `id,image,current_price,old_price,d4d_price,store,notes\n${Object.entries(crops).map(([id, c]) => `${id},${id}.png,${c.current},${c.old},${c.current},test,"fake, scripted"`).join('\n')}\n`,
);

// Scripted behaviour per crop and temperature.
let answerModel = MODEL;
let calls = 0;
const counters = new Map();
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    calls++;
    assert.equal(req.headers.authorization, 'Bearer test-key', 'key sent as bearer token');
    const body = JSON.parse(raw);
    assert.equal(body.model, MODEL, 'model sent unchanged');
    assert.equal(body.top_p, 1, 'other template fields sent unchanged');
    const image = body.messages[0].content[1].image_url;
    const id = byHash.get(createHash('sha256').update(image).digest('hex'));
    assert.ok(id, 'image sent as the crop data URL');
    const k = `${id}|${body.temperature}`;
    const n = (counters.get(k) || 0) + 1;
    counters.set(k, n);
    let content;
    if (id === 'steady') content = JSON.stringify({ current_price: 12.95 });
    else if (id === 'inverts') content = JSON.stringify({ current_price: body.temperature === 0 ? '15.95' : n % 2 ? '15.95' : '9.95' });
    else content = n % 3 === 0 ? 'I cannot read this' : JSON.stringify({ current_price: body.temperature === 0 ? 4.5 : n % 2 ? 4.5 : 6 });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: `fake-${calls}`,
      model: answerModel,
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;

writeFileSync(join(dir, 'config.json'), JSON.stringify({
  requiredModel: MODEL,
  endpoint,
  temperatures: [0, 0.5],
  readingsPerTemperature: 4,
  priceParser: { type: 'jsonPath', path: 'current_price' },
  concurrency: 2,
  minIntervalMs: 0,
  timeoutMs: 5000,
  maxRetries: 0,
  seed: 7,
  analysis: { headlineMaxReadings: 3, maxReadingsSweep: [2, 3, 4], referenceTemperature: 0, bootstrapIterations: 200 },
}));
writeFileSync(join(dir, 'template.json'), JSON.stringify({
  model: MODEL,
  top_p: 1,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the current price.' }, { type: 'image_url', image_url: '{{IMAGE_DATA_URL}}' }] }],
}));

const baseArgs = ['--config', join(dir, 'config.json'), '--manifest', join(dir, 'crops.csv'), '--template', join(dir, 'template.json')];
const env = { ...process.env, MISTRAL_API_KEY: 'test-key' };
const noKey = { ...process.env };
delete noKey.MISTRAL_API_KEY;

try {
  // Dry run needs no key and makes no call.
  const dry = await run('node', [join(ROOT, 'run.mjs'), ...baseArgs, '--out', join(dir, 'out'), '--dry-run'], { env: noKey });
  assert.match(dry.stdout, /Dry run OK/, 'dry run passes');
  assert.match(dry.stdout, /24 total/, 'plan counts crops × temperatures × readings');
  assert.equal(calls, 0, 'dry run makes no call');

  // Real run against the fake.
  await run('node', [join(ROOT, 'run.mjs'), ...baseArgs, '--out', join(dir, 'out')], { env });
  const lines = readFileSync(join(dir, 'out', 'readings.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 24, 'every reading recorded');
  assert.equal(calls, 24, 'one call per reading');
  assert.ok(!readFileSync(join(dir, 'out', 'run-meta.json'), 'utf8').includes('test-key'), 'API key never written');
  assert.ok(!readFileSync(join(dir, 'out', 'readings.jsonl'), 'utf8').includes('test-key'), 'API key never written to readings');

  // Resume: nothing left, no new calls.
  const again = await run('node', [join(ROOT, 'run.mjs'), ...baseArgs, '--out', join(dir, 'out')], { env });
  assert.match(again.stdout, /Nothing to do/, 'resume finds the run complete');
  assert.equal(calls, 24, 'resume makes no call');

  // Analysis.
  await run('node', [join(ROOT, 'analyze.mjs'), '--run', join(dir, 'out')]);
  const md = readFileSync(join(dir, 'out', 'report.md'), 'utf8');
  const report = JSON.parse(readFileSync(join(dir, 'out', 'report.json'), 'utf8'));
  assert.match(md, /NOT A MISTRAL RESULT/, 'fake endpoint is flagged in the report');
  assert.equal(report.crops.complete, 3, 'all crops complete');
  // T=0: steady always right, inverts always the old price (consensus accepts
  // it: P(wrong)=1), flaky right twice then invalid on the third call.
  const t0 = report.perTemp['0'].all;
  assert.ok(Math.abs(t0.wrongAccept - 1 / 3) < 1e-9, `T=0 wrong accept is the inverting crop: ${t0.wrongAccept}`);
  assert.ok(Math.abs(report.perTemp['0'].crossedOut.oldRate - 0.5) < 1e-9, 'T=0 old-price rate over crossed-out crops');
  assert.equal(report.perTemp['0'].observed.acceptedWrong, 1, 'observed order agrees at T=0');
  // T=0.5: inverts alternates old/right, so errors do not repeat consecutively.
  assert.ok(report.perTemp['0.5'].all.wrongAccept < t0.wrongAccept, 'variation lowered wrong accepts in the script');
  assert.equal(report.perTemp['0'].d4d.crops, 3, 'D4D signal scored');
  assert.ok(report.perTemp['0'].d4d.wrongCaught > 0, 'D4D catches the scripted inversion');
  assert.match(md, /Every crop with at least one wrong reading/, 'per-crop detail rendered');

  // A different model answering is refused, not recorded.
  answerModel = 'mistral-medium-2508';
  await assert.rejects(
    run('node', [join(ROOT, 'run.mjs'), ...baseArgs, '--out', join(dir, 'out-wrong-model')], { env }),
    (e) => /refusing to record readings from a different model/.test(e.stderr),
    'wrong response model stops the run',
  );
  let recorded = '';
  try { recorded = readFileSync(join(dir, 'out-wrong-model', 'readings.jsonl'), 'utf8'); } catch {}
  assert.equal(recorded.trim(), '', 'nothing recorded from the wrong model');

  // A changed template cannot resume into an existing run.
  writeFileSync(join(dir, 'template2.json'), readFileSync(join(dir, 'template.json'), 'utf8').replace('Read the current price.', 'Different prompt.'));
  await assert.rejects(
    run('node', [join(ROOT, 'run.mjs'), '--config', join(dir, 'config.json'), '--manifest', join(dir, 'crops.csv'), '--template', join(dir, 'template2.json'), '--out', join(dir, 'out')], { env }),
    (e) => /different experiment/.test(e.stderr),
    'changed template refused on resume',
  );

  console.log('vision temperature calibration end-to-end test passed');
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
