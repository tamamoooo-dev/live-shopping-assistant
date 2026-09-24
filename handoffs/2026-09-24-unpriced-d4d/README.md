# Handoff — unpriced D4D products, clickable brochure crops, Vision price fallback

**Date:** 2026-09-24 · **Frontend branch:** `claude/nice-mendel-wjqck0` (this repo)
**Engine repo:** `tamamoooo-dev/shopping-connector` — **read-only in this work**; the
user has said not to request push access. Nothing has been deployed, and nothing
in production has changed.

## Where things stand (read this first)

**The work is paused on one open question:** *is the price really gone from
D4D's current records, or has D4D moved it to a field our ingest does not read?*
The user asked for this to be settled from the **raw D4D payload** before any
implementation continues. It has not been answered, because `d4donline.com` is
blocked by this cloud environment's network policy. The probe is ready:
[`d4d-price-probe.mjs`](d4d-price-probe.mjs).

Next action: once `d4donline.com` and `cdn.d4donline.com` are allowed (environment menu
in the session title bar → Edit → Network access), run the probe, report the exact
JSON path(s), and **stop for the user's decision**. Do not implement or modify
anything as part of that step.

| Thread | State | Gate |
|---|---|---|
| 1. D4D raw-payload price investigation | Probe written, **not run** (host blocked) | Network access to `d4donline.com` |
| 2. Pending-hotspot design (engine) | Implemented locally, 66/66 engine test files pass, **saved as a patch, not committed anywhere** | Paused by the user until thread 1 is answered; push route undecided |
| 3. Pending-hotspot design (frontend) | Designed, **not started** | Same as thread 2 |
| 4. Fallback branch deploy readiness | Audited; blockers listed below | User approval + the blockers |
| 5. Vision temperature calibration | Harness + 10-crop pilot prepared and verified against the real fallback, **0 calls made** | `api.mistral.ai` access + `MISTRAL_API_KEY`; user approval |

## Standing user directives

- **Nothing** is deployed, and no production setting (including the fallback temperature) is changed, without explicit approval.
- Mistral 14 means **`ministral-14b-2512`**, the only reader for the price fallback. Never substitute Medium, Small or OCR.
- Keep the two-consecutive-agreement rule and the D4D-description check. Do not weaken any Vision safeguard.
- Keep `offers.price NOT NULL` and the existing priced-offer path byte-for-byte unchanged.
- Do not run the 300-call pilot or the 60-crop calibration without a fresh go-ahead. The current `0.3` is acceptable for getting the feature working.
- Do not treat `price: "0.000"` as proof that the price is absent (thread 1).
- Stop and report after each step; the user approves the next one.

---

## 1. The problem

The brochure API returns crops, but **0 crops are clickable** in the flyer viewer.

**Cause, established from the code but not yet confirmed live:**
- **Frontend rule:** a spot is clickable only if `/brochures/hotspots` returns an offer for its `offerId`. See `src/viewer/hotspots.js:19`, and the tap/zoom paths at `src/viewer/index.js:286`, `:463` and `:472`.
- **Engine join:** the engine fills that `offers` map only from `offers` rows whose `flyer_ref` matches the brochure (`getHotspotsDoc` in `brochure-engine/src/hotspots.js`).
- **Why the rows are missing:** since about 2026-09-22 D4D publishes new flyers' records with `price`/`was_price` = `"0.000"`. `buildOffer` refuses priceless records (`offers/contract.js`: "a price is required"), so current flyers have spots but no offer rows.
- **Earlier evidence:** the fallback commit recorded Othaim, Tamimi and Prime at 0 of 500 priced and City Flower's 09-22 flyer at 0 of 228. **That check only read `price`/`was_price`**, which is why thread 1 exists.
- **Frontend ruled out:** the viewer and brochure code haven't changed since 2026-08-02, and module versioning keeps a single `brochure.js` instance.

## 2. Thread 1 — raw D4D payload investigation (NEXT)

**What the ingest reads from D4D:**
- `offers/d4dOffers.js` POSTs `/products/search` and reads only `item.price` and `item.was_price` (lines 71–72).
- It drops every other field of the D4D item in `toRaw`, and never looks at top-level response keys; it reads only `data.items`.
- Nothing stored in D1 (`offers`, or `price_pending.raw_json`) keeps the original D4D item, so stored data cannot answer the question.

**Second possible price source:** the flyer leaflet HTML. `parseHotspots` reads the `data-coords-json` product objects but keeps only `id_product` and the polygon points; any other field is ignored.

**Earlier probe:** `brochure-engine/debug/price-diagnosis.mjs` on `claude/hotspot-diagnosis-2026-09` (`9ea7721`) was built for this question. Its output was never committed, and no branch contains captured D4D JSON.

**The ready probe:** [`d4d-price-probe.mjs`](d4d-price-probe.mjs). Run it from anywhere with `node d4d-price-probe.mjs`. It is read-only and writes into `./d4d-probe-out/`. It covers Lulu, Carrefour, Othaim, City Flower, Prime and Tamimi:
1. Saves each raw `/products/search` response untouched.
2. Counts priced vs unpriced items per flyer, with creation dates.
3. Takes a recursive census of every field path (including JSON embedded in strings), filled/positive counts, priced vs unpriced, and paths that appear only in one group.
4. Checks every path with a price-like name (`price|offer|promo|was|old|amount|sale|…`).
5. Flags any plausible price number inside unpriced items, ignoring IDs, dates and coordinates.
6. Records top-level response keys such as `price_range` and `products`.
7. Saves full raw priced and unpriced items side by side from the same store, same category where possible.
8. Extracts the full `data-coords-json` product objects from one unpriced and one priced flyer page.

**Deliverable:** either the exact JSON path of the current price, with how it differs from `d4dOffers.js` and `parseHotspots`, or a demonstration from the raw payload that no field of the unpriced items carries it. **Then stop.**

- If a price **is** found: the fix is probably a small change to the adapter (or hotspot parser) instead of threads 2 and 3. Set the patch aside and confirm with the user.
- If it is **not** found: threads 2 and 3 resume.

## 3. The fallback branch (audited, not deployed)

`shopping-connector` branch **`claude/unpriced-flyer-items` @ `af2a5a6`** holds the Ministral 14B vision price fallback, in `brochure-engine/src/offers/priceFallback.js`:

- **Ingest:** unpriced D4D records with a crop go into a new `price_pending` queue (`contract.js pricePendingRow`) instead of being dropped.
- **Drain:** the `10,30,50` cron dispatches up to 3 child batches to `POST /price-fallback`, which is behind `X-Ingest-Secret`. It reads each crop with **`ministral-14b-2512`** from a **dedicated key pool** (`MINISTRAL_14B_API_KEY_1..3`, never the Medium, Small or OCR keys):
  - request body: `buildVisionRequest`, with the frozen prompt sha256 `e643b2a1…`, `top_p: 1`, `reasoning_effort: 'none'` and `json_object`; only the temperature differs;
  - temperature `0.3`, up to 6 readings;
  - agreement means two consecutive readings within ±0.01;
  - the agreed candidate must then pass the D4D-description check.
- **Accepted:** becomes a normal offer with `price_source = 'vision'`, rebuilt through the normal path at each ingest. If D4D later publishes a price, D4D's row wins.
- **Rejected:** stays out of `offers`.

**Verified in this session:**
- All 65 original test files pass.
- A scratch end-to-end run of real ingest, then drain, then `getHotspotsDoc` with scripted D4D and Mistral data confirmed every contract point:
  - records are queued, not dropped;
  - the crop, name and description survive;
  - only the dedicated key is used;
  - the drain stops after 2 agreeing readings, and caps at 6;
  - an agreed crossed-out price is rejected by the description check;
  - an accepted item joins the hotspots immediately;
  - the priced row is unchanged.

**Deploy blockers, all still open:**
1. **Unknown production version.** The branch shares only an old merge base with `main`. It carries about 36 commits `main` lacks, some marked "committed to match production", and `main` has `3dc7cad` (price-alert notification routing) that the branch lacks. Before deploying: confirm what production runs (Cloudflare deployment history, or the local deploy folder), merge `main` into the branch, and list every migration those commits need.
2. **Migration first.** Apply `brochure-engine/migrate-2026-09-24-price-fallback.sql` **before** deploying. Every offers upsert writes `price_source`; without the column, all offers ingest fails.
3. **Secrets.** Set at least `MINISTRAL_14B_API_KEY_1`. Without it the fallback does nothing.
4. **Queue filling.** The queue fills only at the next offers ingest (cron `0 6 * * 2,3,5` UTC) or a manual run.
5. **Throughput.** Roughly 18 items per cron run and 54 per hour (Free-plan 50-subrequest cap, up to 6 readings per item). Hotspot responses are cached for 1 hour.
6. **Description-check risk.** Its tuning simulation used *priced* records. If descriptions of unpriced records lack prices, most items will be rejected. Under the pending-hotspot design this costs prices, not clickability.
7. **Minor.** Queue rows with no `valid_to` are never drained. Drain-accepted offers have no page link until the next ingest.

## 4. Threads 2 and 3 — the approved "pending hotspot" design

The user-approved flow: **D4D product + crop → clickable hotspot immediately → "price pending" → price enrichment (the fallback) → priced offer if accepted, or "price unavailable" if rejected (still clickable).** Price extraction must never gate existence or clickability.

**Engine part: done locally, preserved as [`engine-pending-hotspots.patch`](engine-pending-hotspots.patch).**
- It applies on top of `af2a5a6` with `git apply`. It adds 255 lines across 7 files, and the whole suite passes (66/66).
- **`schema.sql`, `migrate-2026-09-24-price-fallback.sql`:** add index `ix_price_pending_flyer ON price_pending(store, region, flyer_ref)`. The migration is unapplied, so no new migration is needed.
- **`storage/offerStore.js`, `storage/local.js`:** add `pricePendingByFlyer(store, region, flyerRef)`, returning any decision.
- **`offers/contract.js`:** add `unpricedOffer(pendingRow)`.
  - It builds the read-API offer shape through the **unchanged** `buildOffer`, using a stand-in price that only opens the gate and is then discarded.
  - It returns `price: null`, `oldPrice: null`, and `priceStatus: 'pending' | 'unavailable'` (`'unavailable'` when the queue status is `rejected`).
  - It keeps the same `id`/`offerId` as the future priced offer.
- **`hotspots.js` `getHotspotsDoc`:** after the priced join, add queue rows only for offer IDs that have no offer. It is best-effort, so a queue error cannot break the priced join. It runs only on the read-API path (when `rowToOffer` is passed). Priced entries are byte-identical to before.
- **New test `offers/unpricedHotspots.test.mjs`** covers:
  - ingest, then the queue, then every spot clickable with price pending;
  - the drain on Ministral 14B and the dedicated key, with 2 agreeing readings;
  - an accepted price replacing the pending entry under the same ID;
  - a rejection leaving the spot clickable as "unavailable";
  - re-ingest preserving every state, and D4D pricing taking a spot back;
  - a queue failure being harmless;
  - real SQL: the flyer index is used and `offers.price` is still NOT NULL.
- **Not committed or pushed anywhere.** This session has read-only access to `shopping-connector`. The route to land it (the user pushes, or grants push access) is undecided.

**Frontend part: not started.** The places to change, about 30–40 lines:
| File | Today, with `price: null` | Change |
|---|---|---|
| `src/viewer/sheet.js` price row | renders **"0.00 SAR"** (`fmt(null)`) | Show "Price pending" / "Price unavailable" from `offer.priceStatus`. |
| `sheet.js` "Add to list" | would put a null price in the cart | Disable it for unpriced items (the requirement). |
| `sheet.js` compare strip (`loadCompare`) | shows wrong "+X SAR" deltas and "cheaper at" | Show other stores' prices without deltas. |
| `src/viewer/insights.js` history block | computes against null | Skip the "this offer" position line. |
| `src/viewer/index.js` `spotLabel` | screen reader says "null SAR" | Use the pending/unavailable text. |
| `src/i18n.js` | none | `sheet.pricePending`, `sheet.priceUnavailable` (English + Arabic). |
| module `?v=` strings | stale cached modules | Bump the viewer chain consistently (`index.html` → `app.js` → `viewer.js` → `viewer/index.js` → `sheet.js`, plus every other importer of `viewer.js`/`marketplace.js`). A mismatch creates two module instances. |

Already fine, no change needed: the spot layer, tap, Zoom and deep-link paths, `discountDot`, `unitPrice`, and the watch dialog, which accepts a null price. The user asked **not** to change the hotspot cache duration and **not** to add products without crop images yet.

**What this means for the offer model:** unpriced products live only in `price_pending` and appear only in the brochure viewer. Search, Browse, history, watches and the registry see them only once priced. Vision *name* enrichment runs on `offers` only, so unpriced items show D4D's description-derived names until priced.

## 5. Thread 5 — Vision temperature calibration (prepared, not run)

**The harness:** [`experiments/vision-temperature-calibration/`](../../experiments/vision-temperature-calibration/) (see its README).
- `run.mjs` collects readings: resumable, frozen to the template, crops, parser and model, and it refuses a different model family.
- `analyze.mjs` scores:
  - single-reading correctness;
  - crossed-out-price inversions;
  - correct and wrong acceptance under the two-reading rule, as an exact average over reading orders, with crop-level bootstrap intervals, paired against T=0;
  - error repetition, readings to agreement, cap sensitivity, and a per-crop spotlight.
- It matches the real fallback: ±0.01 agreement (same float expression), the engine's own `priceReading` behind `readOnce`'s first-`{…}`-span parse, `buildVisionRequest`'s body, and the same two headers.

**The pilot:** `pilot-2026-09-24/`, built by `fallback/prepare-pilot.mjs` from a read-only checkout of `af2a5a6`.
- 10 crops, each with a human-verified price in `human-canonical.json`: **08, 37** (known inversions) + 02, 06, 13, 20, 34, 41, 42, 43 (seed `vision-temperature-pilot-2026-09-24`). All 10 have a crossed-out price.
- T = 0, 0.15, 0.3, 0.5, 0.7; 6 readings each; **300 calls**; `ministral-14b-2512`.
- Fidelity: the engine's real drain, run against a fake fetch, sent 100 request bodies byte-identical to the harness's, and 12 edge-case replies parsed identically.
- `pilot-2026-09-24/parser.mjs` imports the engine from an **ephemeral scratch path**. Re-run `fallback/prepare-pilot.mjs --engine <checkout of af2a5a6>` in a new environment first (commands in that README).

**Blocked on:** `api.mistral.ai` network access and a `MISTRAL_API_KEY` that can call `ministral-14b-2512`. **0 calls have been made.** Earlier facts are in HISTORY §43: temperature 0 is not deterministic, and 2 of 50 crossed-out prices were returned as current (crops 08, 37). The fallback commit also cites an offline simulation where safety was insensitive to temperature because the description check carries it.

## Environment notes (Claude Code cloud)

- **Blocked hosts (network policy):** `d4donline.com`, `cdn.d4donline.com`, `brochure-engine.tamamoooo.workers.dev`, `api.mistral.ai`, `tamamoooo-dev.github.io`. The user must allow them.
- **Node fetch through the proxy:** Node's built-in `fetch` ignores `HTTPS_PROXY`. Prefix scripts with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).
- **`shopping-connector` is public:** clone it anonymously with `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --no-single-branch https://github.com/tamamoooo-dev/shopping-connector`. A detached worktree of `origin/claude/unpriced-flyer-items` is what `prepare-pilot.mjs` expects. The engine suite runs with `node brochure-engine/run-tests.mjs`; it has no dependencies.
- **Reference commits:** `main` = `3dc7cad`, fallback = `af2a5a6`, diagnosis branch = `9ea7721`.
