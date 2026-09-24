# Vision temperature calibration — Mistral 14, D4D current price

**Status: prepared, NOT RUN.** A standalone, read-only experiment. It is not
production code: nothing imports it, and it never touches the engine, D1, KV,
the fallback or any deployed setting. It calls the Mistral chat-completions
endpoint and writes only into its own `--out` directory.

## The question

For the Vision price fallback, **which temperature gives the best extraction of
the current D4D price from a product crop**, especially when a crossed-out old
price is also visible? And at each temperature, **how often does the
two-consecutive-matching-readings rule accept a wrong price?**

No temperature is assumed to be best. Earlier work found that temperature 0 is
not fully deterministic (HISTORY §43: 2 of 20 re-runs differed), but that does
not make more variation better. Variation only helps if it lowers how often a
wrong price is accepted without lowering how often the correct one is read.

## What is fixed (not under test)

| Held constant | How the harness enforces it |
|---|---|
| **Model: the fallback's Mistral 14, nothing else** | `template.model` must equal `config.requiredModel`, and both must be filled in. The run stops, recording nothing, if the API answers from a different model family (for example if an alias resolves to Medium or Small). |
| **The fallback's exact request body** | `request-template.json` is that body, with the crop replaced by `{{IMAGE_DATA_URL}}`. Only `temperature` is changed per call. The template's sha256 (excluding temperature) is stored with the run, and a resume refuses any other template. |
| **Acceptance = two consecutive matching readings** | This is scored exactly as the fallback applies it: read, read again, accept when two consecutive readings are the same valid price, stop at the reading cap. An unreadable reading never matches, not even another unreadable one. |
| **The D4D description is a separate check** | It is not put in the prompt. Its effect is measured on its own (report §7) and kept out of the temperature comparison. |

## Design

- **Temperatures:** 0, 0.15, 0.3, 0.5, 0.7 (set in `experiment.config.json`).
- **Readings:** 8 independent API calls per crop per temperature, one call per
  reading, as in the fallback. With 60 crops that is 60 × 5 × 8 = **2,400 calls**.
  The dry run prints the exact count.
- **Interleaved in time:** round *r* takes reading *r* of every crop at every
  temperature, with crops and temperatures shuffled each round (seeded). API
  or model drift during the run then falls on all temperatures equally.
- **Frozen inputs:** every crop's sha256 is recorded; a resumed run refuses
  changed bytes, a changed manifest, prompt, parser, model or endpoint.

### How the results are estimated

- **Consensus outcomes:** the rule is averaged exactly over every order in
  which a crop's 8 readings could have arrived. Separate calls are
  independent, so this is an unbiased estimate of the rule's real outcome
  rates, and it uses all 8 readings rather than one sequence. The
  literal one-sequence replay is also reported (§6) as a check.
- **Crops, not readings, are the unit of evidence:** intervals are 95%
  bootstraps that resample whole crops. Comparisons between temperatures are
  paired on the same crops.

## What the report measures (`analyze.mjs` → `report.md`, `report.json`)

**Primary**
1. **Single read correct:** how often one reading returns the correct current price.
2. **Consensus: correct accepted:** how often the rule hands the fallback the correct price.
3. **Consensus: WRONG accepted:** how often the rule hands the fallback a wrong
   price. Shown per 1,000 decisions and as a share of accepted prices, for all
   crops and separately for crops with a crossed-out price.

**Secondary**
- **Old-price reads:** a reading that returns the crossed-out price as the current price.
- **Old-price accepts:** the rule accepting that old price.
- **Stability:** crops read identically every time, the share taken by the most common value, and the number of distinct values.
- **Error repeats:** given a wrong reading, the chance another reading returns the *same* wrong price.
  This decides whether the two-reading rule can filter an error, so it is
  the measure of whether variation is useful.
- **Cap sensitivity:** each temperature scored at caps of 2, 3, 4, 5, 6 and 8 readings, since the fallback's cap is not final.
- **Observed-order check:** the rule replayed once on the readings in the order they were taken.
- **D4D signal:** wrong accepts the D4D price would catch, those it would let through, and correct accepts it would contradict.
- **Cost and health:** tokens, latency, parse failures, finish reasons.
- **Crop detail:** every crop with any wrong reading, with its readings at each temperature.

## Decision rule — proposed, to be confirmed BEFORE the run

The report states facts; it does not pick a temperature. To keep the choice
from being fitted to the data, agree on the rule before looking:

1. **Correctness first.** Drop any temperature whose single-read correct rate
   is credibly below the best temperature's (the paired interval of the
   difference is entirely below 0).
2. **Wrong accepts second.** From what remains, drop any temperature whose
   wrong-accept rate at the fallback's cap is credibly above the lowest. This
   applies to all crops and to crossed-out crops separately.
3. **Choose.** Pick the highest consensus correct-accept rate. If the
   differences are within noise, prefer the lower wrong-accept rate, then fewer
   calls per decision, then the lower temperature.

Whatever is chosen stays a setting in the fallback. The architecture does not
depend on its value.

## Inputs still required

| # | Input | Where it goes |
|---|---|---|
| 1 | The **exact model id** the fallback sends for Mistral 14. Mistral's docs list the pinned `ministral-14b-2512` and the alias `ministral-14b-latest`. Copy the id from the fallback code; a pinned id is preferable so the model cannot move during the run. | `requiredModel` in `experiment.config.json` **and** `model` in `request-template.json` |
| 2 | The fallback's **exact request body**: prompt byte for byte, `response_format`, `top_p`, `max_tokens` and any other field, with the image replaced by `"{{IMAGE_DATA_URL}}"` | `request-template.json` (start from `request-template.example.json`) |
| 3 | The fallback's **price parser**: either the JSON field it reads (for example `current_price`), or a copy of its parse function as a module | `priceParser` in the config: `{ "type": "jsonPath", "path": "…" }` or `{ "type": "module", "path": "./adapter.mjs", "export": "…" }` |
| 4 | The fallback's intended **reading cap** (most readings per decision) | `analysis.headlineMaxReadings` (every cap is reported anyway) |
| 5 | The **labelled crop set**, see below | `data/crops.csv` + image files |
| 6 | A **Mistral API key** with access to that model, and network access to `api.mistral.ai` where the run happens | environment `MISTRAL_API_KEY`, never written to any file |

If the fallback sends `random_seed`, the runner refuses by default: with a
fixed seed, repeated calls are not independent and the two-reading rule
measures nothing. That would be a finding about the fallback. It can be
mirrored with `--allow-random-seed`.

### The crop set

- **Real D4D product crops, the same kind of image the fallback will see.** Use
  the same source and resolution: self-hosted crops cut from the stored page if
  that is what the fallback reads, D4D CDN crops if not.
- **At least 60 crops, at least 40 with a visible crossed-out price.** The rest
  have no old price, to show that case is not harmed.
- **Spread across stores and price-tag styles:** superscript halalas,
  Arabic-Indic digits, per-kg prices, prices printed near sizes or other numbers.
- **Include the known hard cases:** the two role-inversion crops from the frozen
  50-crop benchmark (HISTORY §43) and any crop already seen to fail.
- **Truth is read by a person from the crop.** `current_price` is what a shopper
  pays for the item shown; `old_price` is the crossed-out price, filled in only
  if it is visible on the crop. D4D data can help find crops but is not the
  truth. The D4D price goes in `d4d_price`, where it is scored as the separate
  signal.
- **Leave out** crops whose current price is not legible, and multi-buy tiles
  where "the current price" is ambiguous, unless the fallback defines an answer
  for them.
- **Freeze the set before the first call.** Never add or drop crops after seeing results.

`crops.csv` columns (image paths relative to the CSV; JSON also accepted):

```
id,image,current_price,old_price,d4d_price,store,notes
```

## Running it

```bash
cd experiments/vision-temperature-calibration
cp request-template.example.json request-template.json   # paste the fallback's body
# edit experiment.config.json: requiredModel, priceParser

# 1. Validate everything, no calls, no key. Compare the printed body with the fallback's.
node run.mjs --manifest data/crops.csv --template request-template.json --out runs/pilot --limit-crops 5 --dry-run

# 2. Pilot on 5 crops: confirm parse failures are 0 and the answers look like the fallback's.
MISTRAL_API_KEY=… node run.mjs --manifest data/crops.csv --template request-template.json --out runs/pilot --limit-crops 5
node analyze.mjs --run runs/pilot

# 3. The full run, into a NEW directory. Ctrl-C is safe; rerun the same command to resume.
MISTRAL_API_KEY=… node run.mjs --manifest data/crops.csv --template request-template.json --out runs/full
node analyze.mjs --run runs/full
```

In a Claude Code cloud session, outbound traffic goes through a proxy that
Node's built-in `fetch` ignores by default. Prefix the run with
`NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

The default pacing is 1 call at a time, at least 1.1 s apart, sized for a
low-tier rate limit. Raise `concurrency` or lower `minIntervalMs` if the key's
limits allow; 429s are retried with backoff either way.

## Files

| File | Role |
|---|---|
| `run.mjs` | Collects readings into `<out>/readings.jsonl`, with the full configuration in `run-meta.json` |
| `analyze.mjs` | Pure scoring: writes `report.md` and `report.json` and makes no calls |
| `experiment.config.json` | Temperatures, readings, parser, pacing, analysis options |
| `request-template.example.json` | The shape of `request-template.json` |
| `crops.example.csv` | Manifest header |
| `lib/consensus.mjs` | The acceptance rule: the one-sequence replay and the exact average over orderings |
| `lib/price.mjs` | Price normalization to halalas; unreadable prices are refused, never guessed |
| `lib/request.mjs` | Template checks, body building, the model-identity guard |
| `lib/manifest.mjs`, `lib/client.mjs`, `lib/stats.mjs` | Manifest loading, HTTP with retries, bootstrap and Wilson intervals |

## Tests

```bash
node test/unit.test.mjs   # price parsing, consensus maths (checked against brute force), template guards, CSV, stats
node test/e2e.test.mjs    # run → resume → analyze against a local FAKE endpoint (proves plumbing only)
```

A run against anything other than `api.mistral.ai` is stamped **NOT A MISTRAL
RESULT** at the top of its report.

## The Ministral 14B fallback pilot (`pilot-2026-09-24/`)

Prepared from the real fallback (`shopping-connector` branch
`claude/unpriced-flyer-items`, commit `af2a5a6`, `brochure-engine/src/offers/priceFallback.js`)
by `fallback/prepare-pilot.mjs`, which reads a read-only checkout and writes:
the 10 crops (08 and 37, plus 8 of the 43 other human-verified crops with a
crossed-out price, drawn by a fixed seed), their prices from `human-canonical.json`, the
engine's own `buildVisionRequest` body as the template, and `parser.mjs` (the
engine's `priceReading` behind `readOnce`'s parse lines). Agreement is the
fallback's `|a − b| ≤ 0.01`. Before writing anything it runs the engine's real
`drainPriceFallback` against a fake fetch and refuses unless every request
body it would send is byte-identical to the harness's and every test reply
parses the same. `parser.mjs` imports from the checkout's absolute path, so
rerun the prepare step in a new environment:

```bash
git -C <shopping-connector clone> worktree add --detach <dir> origin/claude/unpriced-flyer-items
node fallback/prepare-pilot.mjs --engine <dir> --out pilot-2026-09-24
cd pilot-2026-09-24
node ../run.mjs --config experiment.config.json --manifest crops.csv --template request-template.json --out runs/pilot --dry-run
MISTRAL_API_KEY=… node ../run.mjs --config experiment.config.json --manifest crops.csv --template request-template.json --out runs/pilot
node ../analyze.mjs --run runs/pilot
```
