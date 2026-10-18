# Correct multipack unit prices and package projection — 18 October 2026

Baseline: engine `69684af`, frontend `2639875`. Comparison review found six live
offers whose Arabic `مل` unit was accepted as a single measure but omitted from
the engine's multipack grammar. Thus 18×200ml could be priced per litre using
200ml. The explicit information was already stored; no new extraction is needed.

The engine change adds the missing `مل` alternative to the existing grammar.
The schema, API shape, extraction prompt, model, architecture and shelf prices
are unchanged. Ministral 14B remains the only model. No reindex, inference or
production data write is performed.

## Crop-verified arithmetic

All six unit-price changes in the same 12,972-row catalogue were inspected on
their original public flyer crops. Three more crops verify package-label
conflicts. Labels and unit references are in `cases.json`, images under `images/`.
This assistant's inspection follows discovery; it is not independent or blind.

| Offer | Shelf price, unchanged | Explicit package | Before SAR/L | After SAR/L |
|---|---:|---|---:|---:|
| Puck cream | 10.50 | 4×125ml | 84.00 | 21.00 |
| Suntop / Sun Cola | 15.75 | 18×125ml | 126.00 | 7.00 |
| Nadec flavoured milk | 17.50 | 18×125ml | 140.00 | 7.78 |
| Luna flavoured milk | 19.95 | 18×200ml | 99.75 | 5.54 |
| Saudia milk | 29.99 | 18×200ml | 149.95 | 8.33 |
| Kinza drinks | 35.95 | 30×250ml | 143.80 | 4.79 |

The corrected denominator also supplies the existing per-item label from the
same engine projection. Unit prices for the other 12,966 captured rows are
unchanged. All 12,972 shelf/old prices are unchanged.

## Frontend consistency

The summary and product sheet used the first measurement in the combined names
before the explicit observed size. For example, an incorrect Arabic transcription
overrode Revony's correctly stored 8×135g; Abu Zahra's name overrode its 2×1.5L.
Both surfaces now use the same small projection over the existing `parseSize`:
explicit size first, with name-based count enrichment only beside an equal
per-item magnitude. This follows the engine's existing package-size preference.

Ranges, unequal alternatives and sums of multiple measured parts receive no
single fabricated package label. Noor's 2×1.5L+500ml keeps its correct engine
price of 10.56857 SAR/L, while the incomplete 3L label is withheld. Its original
name/size text remains available. Legacy compound responses without an engine
unit price are also withheld rather than divided by the first term. No third
quantity parser or new arithmetic is introduced in the client.

Across the full fixture, 532 package projections differ: 339 become withheld
and 193 change to the explicit observed size/count. These are exhaustive output
differences, **not 532 individually annotated corrections**. Unknown observations
and incorrect stored sizes remain possible. The change does not revise the
recommendation policy for offers whose comparable quantity is unknown, or fix
every brand/variant equivalence case.

## Validation and reproduction

- All **93 engine test files** and **17 frontend test files** pass.
- All **7,207 shared vectors** remain unchanged with the same 46 pinned divergences.
- The existing 71-query compressed-response fixture is replayed through actual
  before/after comparison modules. Candidate engine projections use the same
  captured observations; no previously admitted offer ID is lost. The two
  strawberry-milk language queries now choose the lower-priced Luna offer with
  its corrected unit price. Other headline-ID selections remain unchanged.
- Real Chrome checks the actual graph with stale baseline modules available.
  It verifies 18×200ml and Revony's 8×135g in the comparison and sheet, and retains
  the previous two-flavour/one-copy grid control. Import versions cover all
  changed modules, including `viewer/insights.js`.
- Nine targeted public pre-release offers were captured and matched by ID.
  Post-release proofs and source hashes are recorded in local `DEPLOYMENT.md`.

Use Node 24 from the frontend repository; supply an engine checkout whose
history includes `69684af`. The previous committed catalogue and response
fixtures are reused without credentials:

```powershell
node benchmarks/comparison-2026-10-18/prepare.mjs <engine-repository>/brochure-engine
node benchmarks/comparison-2026-10-18/audit.mjs <engine-repository>/brochure-engine
node benchmarks/comparison-2026-10-18/evaluate.mjs <engine-repository>/brochure-engine
node src/packageProjection.test.mjs
```

Run all frontend tests and the engine's `run-tests.mjs`; the browser script
requires Chrome's standard Windows path. Baseline graphs, raw comparison output
and logs stay local. Committed source hashes, per-offer arithmetic and delta
counts are in `summary.json`. This is development evidence, not global accuracy.
