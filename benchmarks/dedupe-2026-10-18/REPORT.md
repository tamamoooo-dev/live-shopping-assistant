# Preserve distinct offers when removing duplicates — 18 October 2026

The previous release (`4c8eee6` frontend, `69684af` engine) still removed flyer
cards using 70% name-token overlap inside a store/price bucket. Actual public
responses contained distinct products at the same price that this rule hid.
This frontend-only change keeps the existing structure, admission, ranking,
prices and engine API. No Worker deployment, database write, model call or
model/prompt change is needed. Ministral 14B remains unchanged.

## Inspected examples

Eighteen original public flyer crops were downloaded and visually inspected by
this assistant after discovering collisions. Seven distinct-product pairs and
two real-duplicate pairs are recorded, with hashes, in `verified-pairs.json`.
This is development evidence, not independent or blind annotation.

| Selected pair, same store and price | Distinct offers visible before | After |
|---|---:|---:|
| Al Suman saffron / cardamom coffee, 30g | 1 of 2 | 2 of 2 |
| Alisa black / green sliced olives, 230g | 1 of 2 | 2 of 2 |
| Saloumi plastic / bamboo cotton buds, 500 pieces | 1 of 2 | 2 of 2 |
| Tiffany cashew / almond Nutty Bites, 8×72g | 1 of 2 | 2 of 2 |
| Deto Clean lemon dishwash, 1L / 1.5L | 1 of 2 | 2 of 2 |
| Salima turkey mini burgers / meatballs, 800g | 1 of 2 | 2 of 2 |
| Peeling knife sets, 3 / 4 pieces | 1 of 2 | 2 of 2 |
| Oks scrubber: two pictures of the same offer | 1 card | 1 card |
| Men's BK slippers: same assorted offer | 1 card | 1 card |

## Final rule and rejected candidates

Store and shelf price still define a bucket. A near-duplicate may collapse only
when known brands and quantities are compatible. The quantity guard uses the
existing explicit stored size when an engine offer is present, comparing base
unit, item size and pack count; parser provenance does not distinguish products.
Equal total volume is insufficient for merging 4×250ml with one 1L item.

The 70% threshold is retained for identical names and subset abbreviations.
Words replaced on both sides are unresolved variant evidence: both cards stay.
This catches flavour, material, colour, brand wording and product-form changes
without inventing new aliases or guessing what the changed words mean.

An intermediate guard treated differing canonical product IDs as proof of
different products. The actual public slipper copies have two different IDs
(`auto` and `created`) despite the same pictures and price, so that guard was
rejected. IDs can be fragmented. Another intermediate quantity comparison used
the frontend's bilingual name parse, which can contradict an identical explicit
stored pack. The final guard prefers the stored size and does not rewrite it.

The deliberate tradeoff is conservative deduplication: some differing OCR
spellings can remain as extra cards. Not every extra card is a new product;
total-count increases are not precision scores. Unknown quantities and one-sided
missing descriptors still have the original heuristic's limitations. No claim
is made that every catalogue duplicate or variant has now been classified.

## Validation

`responses.json.gz` freezes 71 actual engine-response query sets: the preceding
release's 60-query real-handler/SQLite replay plus twelve fresh public probes
(one overlapping query is replaced with its fresh public response). Engine
source remains `69684af`. The compressed fixture digest, final source hashes,
counts and per-pair checks are in `summary.json`.

Both baseline and candidate run their actual frontend admission, deduplication,
price sort and Featured sort against identical responses. All nine inspected
pair checks pass; no previously visible offer ID is lost across the 71 queries.
These responses are not an exhaustive retrieval or catalogue-wide accuracy test.
This replay does not rescore the full original 64 target queries.

All **16 frontend test files pass**, including quantity, brand, replacement-word,
true-copy and fragmented-ID controls. Shared matching code/vectors are unchanged.
Real Chrome loads the actual module graph with the prior modules deliberately
available at stale unversioned URLs. It renders two coffee flavours and collapses
a third copied offer into two actual cards. The import map advances coherently
to a new version. Chrome's production network is disabled during that check.

Reproduce with Node 24 from this frontend checkout and a checkout of the engine
containing the previous audit helpers (commit `69684af` or its descendants):

```powershell
node benchmarks/dedupe-2026-10-18/audit.mjs <engine-repository>/brochure-engine
node benchmarks/dedupe-2026-10-18/evaluate.mjs <engine-repository>/brochure-engine
node src/marketplaceDedupe.test.mjs
node benchmarks/dedupe-2026-10-18/browser-smoke.mjs <frontend-repository>
```

The browser script uses Chrome's standard Windows path. Raw responses/results,
logs and browser profiles remain local; the compressed fixture, original crops,
manifest and final summary are committed. Live post-publication checks and
deployment proof are recorded in local `DEPLOYMENT.md`.
