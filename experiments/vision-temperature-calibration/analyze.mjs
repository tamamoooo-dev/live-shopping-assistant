#!/usr/bin/env node
// analyze.mjs — score a run of run.mjs. Pure: reads <run>/run-meta.json and
// <run>/readings.jsonl, writes <run>/report.md and <run>/report.json. No calls.
//
//   node analyze.mjs --run runs/2026-09-pilot [--cap 4] [--bootstrap 2000]
//
// It reports facts per temperature. It does not choose the temperature: that
// decision is made from this report, against the rule written down before the
// run (README "Decision rule").

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { consensusOverOrderings, countReadings, INVALID, observedConsensus } from './lib/consensus.mjs';
import { formatCents } from './lib/price.mjs';
import { bootstrap, mean, median, wilson } from './lib/stats.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const ci = ([lo, hi]) => (Number.isFinite(lo) ? `[${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}]` : '');
const signedPct = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pts` : '—');
const signedCi = ([lo, hi]) => (Number.isFinite(lo) ? `[${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]` : '');

// ---------------------------------------------------------------- load -----

function load(runDir) {
  const metaPath = resolve(runDir, 'run-meta.json');
  const readingsPath = resolve(runDir, 'readings.jsonl');
  if (!existsSync(metaPath) || !existsSync(readingsPath)) throw new Error(`${runDir} has no run-meta.json/readings.jsonl`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const records = readFileSync(readingsPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  return { meta, records };
}

// ------------------------------------------------------- per-crop facts ----

// Everything later tables need about one crop at one temperature.
function cropFacts(crop, readings, caps) {
  const n = readings.length;
  const truth = crop.currentPrice;
  const old = crop.oldPrice;
  let correct = 0;
  let oldRead = 0;
  let invalid = 0;
  for (const r of readings) {
    if (r == null) invalid++;
    else if (r === truth) correct++;
    else if (old != null && r === old) oldRead++;
  }
  const counts = countReadings(readings);
  let modal = 0;
  let modalValues = [];
  for (const [v, k] of counts) {
    if (k > modal) { modal = k; modalValues = [v]; }
    else if (k === modal) modalValues.push(v);
  }
  // Error repetition: for a wrong (valid) reading, the chance that another
  // reading of the same crop returns the SAME wrong price. This is exactly what
  // lets the two-reading rule accept an error: 1.0 means every error repeats.
  let repeatNum = 0;
  let wrongValid = 0;
  for (const [v, k] of counts) {
    if (v === INVALID || v === truth) continue;
    repeatNum += k * (k - 1);
    wrongValid += k;
  }

  const byCap = {};
  for (const cap of caps) {
    const exp = consensusOverOrderings(readings, cap);
    let pWrong = 0;
    for (const [v, p] of exp.accept) if (v !== truth) pWrong += p;
    const d4d = crop.d4dPrice;
    let wrongCaught = 0;
    let wrongSlipped = 0;
    if (d4d != null) {
      for (const [v, p] of exp.accept) {
        if (v === truth) continue;
        if (v === d4d) wrongSlipped += p;
        else wrongCaught += p;
      }
    }
    const pCorrect = exp.accept.get(truth) || 0;
    byCap[cap] = {
      pCorrect,
      pWrong,
      pOld: old != null ? exp.accept.get(old) || 0 : 0,
      pNone: exp.noConsensus,
      calls: exp.expectedCalls,
      observed: observedConsensus(readings, cap),
      d4d: d4d == null ? null : { wrongCaught, wrongSlipped, correctContradicted: d4d !== truth ? pCorrect : 0 },
    };
  }

  return {
    n,
    readings,
    counts,
    accuracy: correct / n,
    oldRate: old != null ? oldRead / n : null,
    invalidRate: invalid / n,
    otherWrongRate: (n - correct - oldRead - invalid) / n,
    stable: counts.size === 1,
    modalShare: modal / n,
    distinct: counts.size,
    pluralityCorrect: modalValues.length === 1 && modalValues[0] === truth,
    everCorrect: correct > 0,
    repeatNum,
    repeatDen: wrongValid * (n - 1),
    byCap,
  };
}

// ------------------------------------------------------------ analysis -----

function analyze(meta, records, opts) {
  const temps = meta.temperatures;
  const R = meta.readingsPerTemperature;
  const cropsById = new Map(meta.crops.map((c) => [c.id, c]));

  // First successful reading per (crop, temperature, index).
  const cell = new Map();
  const okRecords = [];
  let transportErrors = 0;
  for (const r of records) {
    if (!r.ok) { transportErrors++; continue; }
    const k = `${r.cropId}|${r.temperature}|${r.index}`;
    if (cell.has(k)) continue;
    cell.set(k, r);
    okRecords.push(r);
  }

  const complete = [];
  const incomplete = [];
  for (const crop of meta.crops) {
    const ok = temps.every((t) => Array.from({ length: R }, (_, i) => cell.has(`${crop.id}|${t}|${i}`)).every(Boolean));
    (ok ? complete : incomplete).push(crop);
  }
  if (!complete.length) throw new Error('no crop has all its readings yet — run (or resume) run.mjs first');

  const sweep = [...new Set([...(opts.sweep || []), opts.cap])].filter((c) => c >= 2 && c <= R).sort((a, b) => a - b);
  if (!sweep.includes(opts.cap)) throw new Error(`cap ${opts.cap} must be between 2 and ${R}`);

  // facts[t][i] for crop complete[i]
  const facts = {};
  for (const t of temps) {
    facts[t] = complete.map((crop) => {
      const readings = Array.from({ length: R }, (_, i) => cell.get(`${crop.id}|${t}|${i}`).cents ?? null);
      return cropFacts(crop, readings, sweep);
    });
  }

  const idxAll = complete.map((_, i) => i);
  const idxOld = idxAll.filter((i) => complete[i].oldPrice != null);
  const idxNoOld = idxAll.filter((i) => complete[i].oldPrice == null);
  const idxD4d = idxAll.filter((i) => complete[i].d4dPrice != null);
  const cap = opts.cap;

  // Metric definitions over a list of crop indices (with repeats, for bootstrap).
  const M = {
    accuracy: (t, ix) => mean(ix.map((i) => facts[t][i].accuracy)),
    oldRate: (t, ix) => mean(ix.map((i) => facts[t][i].oldRate).filter((x) => x != null)),
    invalidRate: (t, ix) => mean(ix.map((i) => facts[t][i].invalidRate)),
    otherWrongRate: (t, ix) => mean(ix.map((i) => facts[t][i].otherWrongRate)),
    correctAccept: (t, ix, k = cap) => mean(ix.map((i) => facts[t][i].byCap[k].pCorrect)),
    wrongAccept: (t, ix, k = cap) => mean(ix.map((i) => facts[t][i].byCap[k].pWrong)),
    oldAccept: (t, ix, k = cap) => mean(ix.map((i) => facts[t][i].byCap[k].pOld)),
    noConsensus: (t, ix, k = cap) => mean(ix.map((i) => facts[t][i].byCap[k].pNone)),
    calls: (t, ix, k = cap) => mean(ix.map((i) => facts[t][i].byCap[k].calls)),
    wrongAmongAccepted: (t, ix, k = cap) => {
      let w = 0;
      let a = 0;
      for (const i of ix) { const f = facts[t][i].byCap[k]; w += f.pWrong; a += f.pWrong + f.pCorrect; }
      return a ? w / a : NaN;
    },
    stable: (t, ix) => mean(ix.map((i) => (facts[t][i].stable ? 1 : 0))),
    modalShare: (t, ix) => mean(ix.map((i) => facts[t][i].modalShare)),
    distinct: (t, ix) => mean(ix.map((i) => facts[t][i].distinct)),
    pluralityCorrect: (t, ix) => mean(ix.map((i) => (facts[t][i].pluralityCorrect ? 1 : 0))),
    everCorrect: (t, ix) => mean(ix.map((i) => (facts[t][i].everCorrect ? 1 : 0))),
    errorRepeat: (t, ix) => {
      let num = 0;
      let den = 0;
      for (const i of ix) { num += facts[t][i].repeatNum; den += facts[t][i].repeatDen; }
      return den ? num / den : NaN;
    },
  };

  const B = opts.bootstrap;
  const ref = temps.includes(opts.reference) ? opts.reference : temps[0];
  const boot = (base, defs, seed) => {
    if (!base.length) return {};
    const stats = {};
    for (const [name, fn] of Object.entries(defs)) stats[name] = (idx) => fn(idx.map((j) => base[j]));
    return bootstrap(base.length, stats, { iterations: B, seed });
  };

  const perTemp = {};
  for (const t of temps) {
    const all = boot(idxAll, {
      accuracy: (ix) => M.accuracy(t, ix),
      correctAccept: (ix) => M.correctAccept(t, ix),
      wrongAccept: (ix) => M.wrongAccept(t, ix),
      noConsensus: (ix) => M.noConsensus(t, ix),
      errorRepeat: (ix) => M.errorRepeat(t, ix),
      dAccuracy: (ix) => M.accuracy(t, ix) - M.accuracy(ref, ix),
      dCorrectAccept: (ix) => M.correctAccept(t, ix) - M.correctAccept(ref, ix),
      dWrongAccept: (ix) => M.wrongAccept(t, ix) - M.wrongAccept(ref, ix),
    }, 101);
    const withOld = boot(idxOld, {
      accuracy: (ix) => M.accuracy(t, ix),
      oldRate: (ix) => M.oldRate(t, ix),
      wrongAccept: (ix) => M.wrongAccept(t, ix),
      oldAccept: (ix) => M.oldAccept(t, ix),
      dWrongAccept: (ix) => M.wrongAccept(t, ix) - M.wrongAccept(ref, ix),
    }, 202);

    const obs = complete.map((_, i) => facts[t][i].byCap[cap].observed);
    const obsAcceptedCorrect = obs.filter((o, i) => o.status === 'accepted' && o.value === complete[i].currentPrice).length;
    const obsAcceptedWrong = obs.filter((o, i) => o.status === 'accepted' && o.value !== complete[i].currentPrice).length;
    const obsNone = obs.filter((o) => o.status === 'no-consensus').length;

    const recs = okRecords.filter((r) => r.temperature === t && complete.some((c) => c.id === r.cropId));
    const parseErrors = {};
    const finish = {};
    for (const r of recs) {
      if (r.parseError) parseErrors[r.parseError] = (parseErrors[r.parseError] || 0) + 1;
      const fr = r.finishReason ?? 'unknown';
      finish[fr] = (finish[fr] || 0) + 1;
    }

    perTemp[t] = {
      all: {
        accuracy: M.accuracy(t, idxAll), accuracyCi: all.accuracy,
        invalidRate: M.invalidRate(t, idxAll),
        otherWrongRate: M.otherWrongRate(t, idxAll),
        correctAccept: M.correctAccept(t, idxAll), correctAcceptCi: all.correctAccept,
        wrongAccept: M.wrongAccept(t, idxAll), wrongAcceptCi: all.wrongAccept,
        wrongAmongAccepted: M.wrongAmongAccepted(t, idxAll),
        noConsensus: M.noConsensus(t, idxAll), noConsensusCi: all.noConsensus,
        calls: M.calls(t, idxAll),
        stable: M.stable(t, idxAll),
        modalShare: M.modalShare(t, idxAll),
        distinct: M.distinct(t, idxAll),
        pluralityCorrect: M.pluralityCorrect(t, idxAll),
        everCorrect: M.everCorrect(t, idxAll),
        errorRepeat: M.errorRepeat(t, idxAll), errorRepeatCi: all.errorRepeat,
      },
      vsReference: {
        accuracy: M.accuracy(t, idxAll) - M.accuracy(ref, idxAll), accuracyCi: all.dAccuracy,
        correctAccept: M.correctAccept(t, idxAll) - M.correctAccept(ref, idxAll), correctAcceptCi: all.dCorrectAccept,
        wrongAccept: M.wrongAccept(t, idxAll) - M.wrongAccept(ref, idxAll), wrongAcceptCi: all.dWrongAccept,
        wrongAcceptCrossedOut: idxOld.length ? M.wrongAccept(t, idxOld) - M.wrongAccept(ref, idxOld) : NaN,
        wrongAcceptCrossedOutCi: withOld.dWrongAccept || [NaN, NaN],
      },
      crossedOut: idxOld.length ? {
        accuracy: M.accuracy(t, idxOld), accuracyCi: withOld.accuracy,
        oldRate: M.oldRate(t, idxOld), oldRateCi: withOld.oldRate,
        wrongAccept: M.wrongAccept(t, idxOld), wrongAcceptCi: withOld.wrongAccept,
        oldAccept: M.oldAccept(t, idxOld), oldAcceptCi: withOld.oldAccept,
        correctAccept: M.correctAccept(t, idxOld),
      } : null,
      noCrossedOut: idxNoOld.length ? {
        accuracy: M.accuracy(t, idxNoOld),
        wrongAccept: M.wrongAccept(t, idxNoOld),
        correctAccept: M.correctAccept(t, idxNoOld),
      } : null,
      sweep: Object.fromEntries(sweep.map((k) => [k, {
        correctAccept: M.correctAccept(t, idxAll, k),
        wrongAccept: M.wrongAccept(t, idxAll, k),
        wrongAcceptCrossedOut: idxOld.length ? M.wrongAccept(t, idxOld, k) : NaN,
        noConsensus: M.noConsensus(t, idxAll, k),
        calls: M.calls(t, idxAll, k),
      }])),
      observed: {
        n: complete.length,
        acceptedCorrect: obsAcceptedCorrect, acceptedCorrectCi: wilson(obsAcceptedCorrect, complete.length),
        acceptedWrong: obsAcceptedWrong, acceptedWrongCi: wilson(obsAcceptedWrong, complete.length),
        noConsensus: obsNone,
      },
      d4d: idxD4d.length ? {
        crops: idxD4d.length,
        wrongCaught: mean(idxD4d.map((i) => facts[t][i].byCap[cap].d4d.wrongCaught)),
        wrongSlipped: mean(idxD4d.map((i) => facts[t][i].byCap[cap].d4d.wrongSlipped)),
        correctContradicted: mean(idxD4d.map((i) => facts[t][i].byCap[cap].d4d.correctContradicted)),
      } : null,
      usage: {
        readings: recs.length,
        medianLatencyMs: median(recs.map((r) => r.latencyMs).filter(Number.isFinite)),
        promptTokens: recs.reduce((s, r) => s + (r.usage?.prompt_tokens || 0), 0),
        completionTokens: recs.reduce((s, r) => s + (r.usage?.completion_tokens || 0), 0),
        parseErrors,
        finishReasons: finish,
      },
    };
  }

  const responseModels = {};
  for (const r of okRecords) responseModels[r.responseModel ?? 'not reported'] = (responseModels[r.responseModel ?? 'not reported'] || 0) + 1;

  const perCrop = complete.map((crop, i) => ({
    id: crop.id,
    store: crop.store,
    currentPrice: crop.currentPrice,
    oldPrice: crop.oldPrice,
    d4dPrice: crop.d4dPrice,
    notes: crop.notes,
    byTemperature: Object.fromEntries(temps.map((t) => {
      const f = facts[t][i];
      return [t, {
        readings: f.readings,
        accuracy: f.accuracy,
        pCorrectAccept: f.byCap[cap].pCorrect,
        pWrongAccept: f.byCap[cap].pWrong,
        pNoConsensus: f.byCap[cap].pNone,
      }];
    })),
  }));

  return {
    meta,
    cap,
    sweep,
    reference: ref,
    bootstrapIterations: B,
    crops: { complete: complete.length, incomplete: incomplete.map((c) => c.id), crossedOut: idxOld.length, noCrossedOut: idxNoOld.length, withD4dPrice: idxD4d.length },
    transportErrors,
    responseModels,
    perTemp,
    perCrop,
  };
}

// -------------------------------------------------------------- report -----

function describeReadings(readings, crop) {
  const counts = new Map();
  for (const r of readings) counts.set(r, (counts.get(r) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, k]) => {
      const tag = v === crop.currentPrice ? '✓' : v != null && v === crop.oldPrice ? ' OLD' : v == null ? '' : ' ✗';
      return `${formatCents(v)}${tag}×${k}`;
    })
    .join(' · ');
}

function renderMarkdown(a) {
  const { meta, perTemp, cap, reference: ref } = a;
  const temps = meta.temperatures;
  const L = [];
  const row = (cells) => L.push(`| ${cells.join(' | ')} |`);
  const header = (cells) => { row(cells); row(cells.map(() => '---')); };

  L.push('# Vision temperature calibration — report', '');
  if (!meta.officialEndpoint) {
    L.push(`> ⚠️ **NOT A MISTRAL RESULT.** Readings came from \`${meta.endpoint}\`, not api.mistral.ai. Nothing below may be used to choose a temperature.`, '');
  }
  const models = Object.entries(a.responseModels).map(([m, k]) => `\`${m}\` (${k})`).join(', ');
  L.push(
    `- **Model requested:** \`${meta.requiredModel}\` — answered by: ${models}`,
    `- **Request template:** sha256 \`${meta.templateHash}\` (everything but temperature is identical across calls)`,
    `- **Crops scored:** ${a.crops.complete} (${a.crops.crossedOut} with a visible crossed-out price, ${a.crops.noCrossedOut} without)` +
      (a.crops.incomplete.length ? ` — ${a.crops.incomplete.length} excluded as incomplete: ${a.crops.incomplete.join(', ')}` : ''),
    `- **Readings:** ${meta.readingsPerTemperature} independent calls per crop per temperature; ${a.transportErrors} transport errors (not readings)`,
    `- **Consensus rule:** accept when two consecutive readings are the same valid price, at most **${cap}** readings per decision`,
    `- **Intervals:** 95%, crop-level bootstrap (${a.bootstrapIterations} resamples); differences are paired on the same crops`,
    `- **Run started:** ${meta.createdAt}`,
    '',
  );
  if (Object.keys(a.responseModels).length > 1) {
    L.push('> ⚠️ More than one response model appears above — the alias moved during the run. Treat the comparison with care.', '');
  }

  L.push('## 1 · Current-price extraction and consensus outcome', '');
  L.push(`Consensus probabilities are exact averages over every order the observed readings could have arrived in (unbiased for independent calls). "Wrong accepted" is the rate at which the two-reading rule would hand the fallback a price that is not the current price.`, '');
  header(['T', 'Single read correct', 'Consensus: correct accepted', 'Consensus: **WRONG accepted**', 'Wrong per 1,000 decisions', 'Wrong among accepted', 'No consensus', 'Mean calls']);
  for (const t of temps) {
    const x = perTemp[t].all;
    row([
      `**${t}**`,
      `${pct(x.accuracy)} ${ci(x.accuracyCi)}`,
      `${pct(x.correctAccept)} ${ci(x.correctAcceptCi)}`,
      `**${pct(x.wrongAccept)}** ${ci(x.wrongAcceptCi)}`,
      (x.wrongAccept * 1000).toFixed(1),
      pct(x.wrongAmongAccepted),
      `${pct(x.noConsensus)} ${ci(x.noConsensusCi)}`,
      x.calls.toFixed(2),
    ]);
  }
  L.push('');

  if (a.crops.crossedOut) {
    L.push('## 2 · Crops with a visible crossed-out price', '');
    L.push('"Old price read" is a single reading returning the crossed-out price as the current price (role inversion). "Old accepted" is the consensus rule accepting it.', '');
    header(['T', 'Single read correct', 'Old price read', 'Consensus: correct accepted', 'Consensus: WRONG accepted', 'of which old price']);
    for (const t of temps) {
      const x = perTemp[t].crossedOut;
      row([`**${t}**`, `${pct(x.accuracy)} ${ci(x.accuracyCi)}`, `${pct(x.oldRate)} ${ci(x.oldRateCi)}`, pct(x.correctAccept), `**${pct(x.wrongAccept)}** ${ci(x.wrongAcceptCi)}`, `${pct(x.oldAccept)} ${ci(x.oldAcceptCi)}`]);
    }
    L.push('');
    if (a.crops.noCrossedOut) {
      L.push('Crops without a crossed-out price, for contrast:', '');
      header(['T', 'Single read correct', 'Consensus: correct accepted', 'Consensus: WRONG accepted']);
      for (const t of temps) {
        const x = perTemp[t].noCrossedOut;
        row([`**${t}**`, pct(x.accuracy), pct(x.correctAccept), pct(x.wrongAccept)]);
      }
      L.push('');
    }
  }

  L.push(`## 3 · Paired differences against T=${ref}`, '');
  L.push('Same crops, same readings budget. An interval that excludes 0 is a difference the data supports; one that spans 0 is not distinguishable at this sample size.', '');
  header(['T', 'Δ single read correct', 'Δ correct accepted', 'Δ WRONG accepted (all)', 'Δ WRONG accepted (crossed-out)']);
  for (const t of temps) {
    if (t === ref) continue;
    const d = perTemp[t].vsReference;
    row([`**${t}**`, `${signedPct(d.accuracy)} ${signedCi(d.accuracyCi)}`, `${signedPct(d.correctAccept)} ${signedCi(d.correctAcceptCi)}`, `${signedPct(d.wrongAccept)} ${signedCi(d.wrongAcceptCi)}`, `${signedPct(d.wrongAcceptCrossedOut)} ${signedCi(d.wrongAcceptCrossedOutCi)}`]);
  }
  L.push('');

  L.push('## 4 · Stability and independence of readings', '');
  L.push('"Error repeats" is the chance that, given a wrong reading, another reading of the same crop returns the same wrong price. It is what decides whether the two-reading rule can filter an error: at 100% every error repeats and gets accepted; lower means errors vary and the rule rejects them. Variation is only useful if it lowers this without lowering single-read correctness.', '');
  header(['T', 'Crops fully stable', 'Mean modal share', 'Mean distinct values', 'Error repeats', 'Plurality correct', 'Correct at least once', 'Invalid reads', 'Other wrong reads']);
  for (const t of temps) {
    const x = perTemp[t].all;
    row([`**${t}**`, pct(x.stable), pct(x.modalShare), x.distinct.toFixed(2), `${pct(x.errorRepeat)} ${ci(x.errorRepeatCi)}`, pct(x.pluralityCorrect), pct(x.everCorrect), pct(x.invalidRate), pct(x.otherWrongRate)]);
  }
  L.push('');

  L.push('## 5 · Sensitivity to the reading cap', '');
  L.push('The fallback\'s cap is not final; this shows how each temperature trades wrong accepts against no-consensus as the cap grows.', '');
  header(['T', ...a.sweep.map((k) => `cap ${k}: correct / WRONG / none / calls`)]);
  for (const t of temps) {
    row([`**${t}**`, ...a.sweep.map((k) => { const s = perTemp[t].sweep[k]; return `${pct(s.correctAccept)} / **${pct(s.wrongAccept)}** / ${pct(s.noConsensus)} / ${s.calls.toFixed(2)}`; })]);
  }
  L.push('');

  L.push('## 6 · Observed-order check', '');
  L.push(`The rule replayed once per crop on the readings in the order they were actually taken (cap ${cap}). Noisier than §1 but model-free; it should agree with §1 within its interval.`, '');
  header(['T', 'Accepted correct', 'Accepted WRONG', 'No consensus']);
  for (const t of temps) {
    const o = perTemp[t].observed;
    row([`**${t}**`, `${o.acceptedCorrect}/${o.n} ${ci(o.acceptedCorrectCi)}`, `**${o.acceptedWrong}/${o.n}** ${ci(o.acceptedWrongCi)}`, `${o.noConsensus}/${o.n}`]);
  }
  L.push('');

  if (a.crops.withD4dPrice) {
    L.push('## 7 · The D4D description as an independent check (secondary)', '');
    L.push(`On the ${a.crops.withD4dPrice} crops whose D4D description states a price. Not part of the temperature comparison above — it shows what the second signal would catch at each temperature.`, '');
    header(['T', 'Wrong accepts D4D contradicts (caught)', 'Wrong accepts D4D agrees with (slip through)', 'Correct accepts D4D contradicts']);
    for (const t of temps) {
      const d = perTemp[t].d4d;
      row([`**${t}**`, pct(d.wrongCaught), `**${pct(d.wrongSlipped)}**`, pct(d.correctContradicted)]);
    }
    L.push('');
  }

  L.push('## 8 · Cost and response health', '');
  header(['T', 'Readings', 'Median latency', 'Prompt tokens', 'Completion tokens', 'Parse failures', 'Finish reasons']);
  for (const t of temps) {
    const u = perTemp[t].usage;
    const pe = Object.entries(u.parseErrors).map(([k, v]) => `${k} ${v}`).join(', ') || '0';
    const fr = Object.entries(u.finishReasons).map(([k, v]) => `${k} ${v}`).join(', ');
    row([`**${t}**`, u.readings, `${Math.round(u.medianLatencyMs)} ms`, u.promptTokens, u.completionTokens, pe, fr]);
  }
  L.push('');

  const troubled = a.perCrop
    .map((c) => ({ c, wrong: temps.reduce((s, t) => s + (1 - c.byTemperature[t].accuracy), 0) }))
    .filter((x) => x.wrong > 0)
    .sort((x, y) => y.wrong - x.wrong);
  L.push('## 9 · Every crop with at least one wrong reading', '');
  if (!troubled.length) L.push('None — every reading of every crop was correct.', '');
  else {
    L.push('✓ current price · OLD the crossed-out price · ✗ another wrong price · invalid = no readable price. P(wrong) is the consensus wrong-accept probability.', '');
    header(['Crop', 'Current', 'Old', ...temps.map((t) => `T=${t}`)]);
    for (const { c } of troubled) {
      row([
        `\`${c.id}\`${c.store ? ` (${c.store})` : ''}`,
        formatCents(c.currentPrice),
        c.oldPrice != null ? formatCents(c.oldPrice) : '—',
        ...temps.map((t) => {
          const b = c.byTemperature[t];
          return `${describeReadings(b.readings, c)}${b.pWrongAccept > 0 ? ` · P(wrong) ${pct(b.pWrongAccept)}` : ''}`;
        }),
      ]);
    }
    L.push('');
  }

  L.push('## Caveats', '');
  L.push(
    `- ${meta.readingsPerTemperature} readings per crop cannot see an error the model makes less often than about 1 time in ${meta.readingsPerTemperature}. Aggregated over ${a.crops.complete} crops the rates are fair, but a single crop's P(wrong)=0 is not proof it never errs.`,
    '- Readings are independent calls, so the order-averaged consensus is unbiased. It assumes the fallback takes its readings as separate calls with this exact request body.',
    '- The crop set decides what these numbers mean. They describe these crops; the README says how the set was meant to be chosen.',
  );
  return `${L.join('\n')}\n`;
}

// ---------------------------------------------------------------- main -----

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.run) {
    console.error('usage: node analyze.mjs --run <run dir> [--cap <n>] [--bootstrap <n>] [--reference <T>]');
    process.exit(1);
  }
  const { meta, records } = load(args.run);
  const cfg = meta.analysis || {};
  const opts = {
    cap: Number(args.cap ?? cfg.headlineMaxReadings ?? 4),
    sweep: cfg.maxReadingsSweep || [2, 3, 4, 6, 8],
    bootstrap: Number(args.bootstrap ?? cfg.bootstrapIterations ?? 2000),
    reference: Number(args.reference ?? cfg.referenceTemperature ?? 0),
  };
  const a = analyze(meta, records, opts);
  const md = renderMarkdown(a);
  const json = JSON.stringify(a, (k, v) => (k === 'template' || k === 'crops' && Array.isArray(v) ? undefined : v), 2);
  writeFileSync(resolve(args.run, 'report.md'), md);
  writeFileSync(resolve(args.run, 'report.json'), `${json}\n`);
  process.stdout.write(md);
  console.error(`\nWrote ${resolve(args.run, 'report.md')} and report.json`);
}

main();
