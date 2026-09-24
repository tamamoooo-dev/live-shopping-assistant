#!/usr/bin/env node
// run.mjs — collect repeated Vision readings of labelled D4D crops at several
// temperatures. Read-only with respect to everything except its own output
// directory: it calls the Mistral chat-completions endpoint and appends what
// comes back to <out>/readings.jsonl. It never touches the engine, D1, KV or
// any production setting.
//
//   MISTRAL_API_KEY=… node run.mjs --manifest crops.csv --template request-template.json --out runs/2026-09-pilot
//   node run.mjs … --dry-run        validate everything and print the plan, no calls, no key needed
//
// Options: --config <file> (default: experiment.config.json next to this script)
//          --limit-crops <n>  only the first n crops (use a separate --out for a pilot)
//          --allow-random-seed  only if the fallback itself sends random_seed
// Interrupt with Ctrl-C at any time; rerunning with the same arguments resumes.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cropRecord, loadManifest } from './lib/manifest.mjs';
import { buildBody, checkTemplate, IMAGE_PLACEHOLDER, modelFamily, templateHash } from './lib/request.mjs';
import { createPriceExtractor, formatCents, messageText } from './lib/price.mjs';
import { createPacer, FatalRequestError, postChat } from './lib/client.mjs';
import { mulberry32, shuffle } from './lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = 'vision-temperature-calibration/1';

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    if (['dry-run', 'allow-random-seed'].includes(key)) args.flags.add(key);
    else args[key] = argv[++i];
  }
  return args;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function checkConfig(c) {
  const problems = [];
  if (!Array.isArray(c.temperatures) || !c.temperatures.length) problems.push('temperatures must be a non-empty list');
  else if (c.temperatures.some((t) => typeof t !== 'number' || t < 0 || t > 2)) problems.push('temperatures must be numbers in [0, 2]');
  else if (new Set(c.temperatures).size !== c.temperatures.length) problems.push('temperatures must be distinct');
  if (!Number.isInteger(c.readingsPerTemperature) || c.readingsPerTemperature < 2) {
    problems.push('readingsPerTemperature must be an integer >= 2');
  }
  if (typeof c.endpoint !== 'string' || !/^https?:\/\//.test(c.endpoint)) problems.push('endpoint must be an http(s) URL');
  for (const k of ['concurrency', 'minIntervalMs', 'timeoutMs', 'maxRetries']) {
    if (!Number.isInteger(c[k]) || c[k] < 0) problems.push(`${k} must be a non-negative integer`);
  }
  if (c.concurrency < 1) problems.push('concurrency must be >= 1');
  return problems;
}

const key = (cropId, temperature, index) => `${cropId}\u0000${temperature}\u0000${index}`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.flags.has('dry-run');
  if (!args.manifest || !args.template || !args.out) {
    fail('usage: node run.mjs --manifest <crops.csv|json> --template <request-template.json> --out <dir> [--dry-run]');
  }

  const configPath = resolve(args.config || resolve(HERE, 'experiment.config.json'));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const configProblems = checkConfig(config);

  const templatePath = resolve(args.template);
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const { problems: templateProblems, warnings } = checkTemplate(template, {
    requiredModel: config.requiredModel,
    allowRandomSeed: args.flags.has('allow-random-seed'),
  });

  let extractor;
  const parserProblems = [];
  try {
    extractor = await createPriceExtractor(config.priceParser, dirname(configPath));
  } catch (e) {
    parserProblems.push(`priceParser: ${e.message}`);
  }

  let crops;
  try {
    crops = loadManifest(args.manifest);
  } catch (e) {
    parserProblems.push(e.message);
  }

  const problems = [...configProblems, ...templateProblems, ...parserProblems];
  for (const w of warnings) console.error(`⚠ ${w}`);
  if (problems.length) fail(`not ready to run:\n  - ${problems.join('\n  - ')}`);

  if (args['limit-crops']) crops = crops.slice(0, Number(args['limit-crops']));
  const temps = config.temperatures;
  const R = config.readingsPerTemperature;
  const officialEndpoint = /^https:\/\/api\.mistral\.ai\//.test(config.endpoint);
  const tHash = templateHash(template);

  const outDir = resolve(args.out);
  const metaPath = resolve(outDir, 'run-meta.json');
  const readingsPath = resolve(outDir, 'readings.jsonl');
  const meta = {
    harness: HARNESS,
    createdAt: new Date().toISOString(),
    requiredModel: config.requiredModel,
    endpoint: config.endpoint,
    officialEndpoint,
    templateHash: tHash,
    template,
    temperatures: temps,
    readingsPerTemperature: R,
    priceParser: config.priceParser,
    seed: config.seed,
    analysis: config.analysis || {},
    manifest: resolve(args.manifest),
    crops: crops.map(cropRecord),
  };

  // Resume only into an identical experiment.
  const done = new Set();
  if (existsSync(metaPath)) {
    const prev = JSON.parse(readFileSync(metaPath, 'utf8'));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const mismatch = [
      ['model', prev.requiredModel, meta.requiredModel],
      ['request template (excluding temperature)', prev.templateHash, meta.templateHash],
      ['temperatures', prev.temperatures, meta.temperatures],
      ['readings per temperature', prev.readingsPerTemperature, meta.readingsPerTemperature],
      ['price parser', prev.priceParser, meta.priceParser],
      ['endpoint', prev.endpoint, meta.endpoint],
      ['crops (ids and image bytes)', prev.crops.map((c) => [c.id, c.imageSha256]), meta.crops.map((c) => [c.id, c.imageSha256])],
    ].filter(([, a, b]) => !same(a, b));
    if (mismatch.length) {
      fail(`${outDir} holds a different experiment (${mismatch.map((m) => m[0]).join(', ')} changed). Use a new --out.`);
    }
    if (existsSync(readingsPath)) {
      for (const line of readFileSync(readingsPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        if (r.ok) done.add(key(r.cropId, r.temperature, r.index));
      }
    }
  }

  // Interleave everything in time: round r takes reading #r of every crop at
  // every temperature, crops and temperatures shuffled per round. Model or API
  // drift during a long run then lands on every temperature equally.
  const rand = mulberry32(config.seed ?? 1);
  const tasks = [];
  for (let r = 0; r < R; r++) {
    for (const crop of shuffle(crops, rand)) {
      for (const t of shuffle(temps, rand)) tasks.push({ crop, temperature: t, index: r });
    }
  }
  const pending = tasks.filter((t) => !done.has(key(t.crop.id, t.temperature, t.index)));

  const withOld = crops.filter((c) => c.oldPrice != null).length;
  console.log(`
Vision temperature calibration — ${dryRun ? 'DRY RUN (no calls)' : 'RUN'}
  model            ${config.requiredModel}${officialEndpoint ? '' : `   ⚠ endpoint is NOT api.mistral.ai: ${config.endpoint}`}
  template sha256  ${tHash.slice(0, 16)}… (excluding temperature)
  crops            ${crops.length} (${withOld} with a visible crossed-out price, ${crops.length - withOld} without)
  temperatures     ${temps.join(', ')}
  readings         ${R} per crop per temperature
  calls            ${tasks.length} total, ${done.size} already done, ${pending.length} to go
  pacing           ${config.concurrency} concurrent, ≥ ${config.minIntervalMs} ms between call starts (≈ ${Math.ceil((pending.length * config.minIntervalMs) / 60000)} min minimum)
  output           ${outDir}
`);

  if (dryRun) {
    const sample = buildBody(template, { imageDataUrl: `data:${crops[0].mime};base64,…(${crops[0].bytes.length} bytes)…`, temperature: temps[0] });
    console.log('Sample request body (first crop, first temperature). Compare it with what the fallback sends:\n');
    console.log(JSON.stringify(sample, null, 2));
    console.log(`\nDry run OK. The image replaces "${IMAGE_PLACEHOLDER}"; only "temperature" varies between calls.`);
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) fail('MISTRAL_API_KEY is not set in the environment');
  if (!pending.length) {
    console.log('Nothing to do — every reading is already collected. Run analyze.mjs.');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  if (!existsSync(metaPath)) writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  const pace = createPacer(config.minIntervalMs);
  const wantFamily = modelFamily(config.requiredModel);
  const dataUrls = new Map(crops.map((c) => [c.id, `data:${c.mime};base64,${c.bytes.toString('base64')}`]));
  let stopping = false;
  let fatal = null;
  let finished = 0;
  let transportErrors = 0;
  let warnedNoModel = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.error('\nStopping after in-flight calls finish (Ctrl-C again to quit now). Rerun to resume.');
  });

  const queue = pending.slice();
  const worker = async () => {
    while (!stopping && !fatal && queue.length) {
      const { crop, temperature, index } = queue.shift();
      const body = buildBody(template, { imageDataUrl: dataUrls.get(crop.id), temperature });
      const base = { cropId: crop.id, temperature, index, at: new Date().toISOString() };
      let res;
      try {
        res = await postChat({
          endpoint: config.endpoint,
          apiKey,
          body,
          timeoutMs: config.timeoutMs,
          maxRetries: config.maxRetries,
          pace,
          log: (m) => console.error(m),
        });
      } catch (e) {
        if (e instanceof FatalRequestError) {
          fatal = e.message;
          return;
        }
        throw e;
      }
      let record;
      if (!res.ok) {
        transportErrors++;
        record = { ...base, ok: false, status: res.status, attempts: res.attempts, error: res.error };
      } else {
        const responseModel = res.response.model ?? null;
        if (!responseModel && !warnedNoModel) {
          warnedNoModel = true;
          console.error('⚠ the API does not report which model answered — the model guard cannot check responses');
        }
        if (responseModel && modelFamily(responseModel) !== wantFamily) {
          fatal = `the API answered with model "${responseModel}" but "${config.requiredModel}" was requested — refusing to record readings from a different model`;
          return;
        }
        const text = messageText(res.response);
        const { cents, error } = extractor(text, res.response);
        record = {
          ...base,
          ok: true,
          status: res.status,
          attempts: res.attempts,
          latencyMs: res.latencyMs,
          responseModel,
          responseId: res.response.id ?? null,
          finishReason: res.response.choices?.[0]?.finish_reason ?? null,
          usage: res.response.usage ?? null,
          content: text,
          cents,
          parseError: error,
        };
      }
      appendFileSync(readingsPath, `${JSON.stringify(record)}\n`);
      finished++;
      const shown = record.ok ? formatCents(record.cents) : `transport error: ${record.error}`;
      const mark = record.ok && record.cents === crop.currentPrice ? '✓' : record.ok && record.cents != null && record.cents === crop.oldPrice ? '✗ old' : record.ok ? '✗' : '!';
      console.log(`[${done.size + finished}/${tasks.length}] ${crop.id} T=${temperature} #${index + 1} → ${shown} ${mark}`);
    }
  };
  await Promise.all(Array.from({ length: config.concurrency }, worker));

  if (fatal) fail(`stopped: ${fatal}`);
  console.log(`\n${finished} readings recorded${transportErrors ? `, ${transportErrors} transport errors (rerun to retry them)` : ''}.`);
  if (stopping) console.log('Interrupted — rerun the same command to resume.');
  else console.log(`Next: node analyze.mjs --run ${args.out}`);
}

main().catch((e) => fail(e.stack || e.message));
