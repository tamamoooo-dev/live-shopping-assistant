# Brochure product index

Built on 2026-10-22 from the existing production brochure database: **44,851
offer readings**, comprising 44,069 stored Vision observations and 782 offers
awaiting Vision. The initial snapshot contained **29,374 observed combinations**.
These are search projections, not a count of distinct registry products.
The published snapshot includes subsequently recovered readings; its current
counts and extraction date are recorded in `data/brochure-knowledge.json.gz.meta.json`.

The source is the stored brochures, not an external product catalog. Existing
brand/category/descriptor/size lexicons normalize observed fields. An entity
enters the index only when a source reading uses it. Brand → category → variety
→ size connections must occur together in a source reading. A brand's observed
milk sizes cannot be assigned to its cheese, or to a different milk variety.

## What is available

- Arabic/English completion, including observed brand aliases. Space accepts a
  visible completion at the end of the input; arrows select and Enter accepts.
  Escape dismisses it. Ordinary spaces work when no completion is visible.
- Independent, remembered checkboxes above Search for varieties and sizes.
- A searchable index browser following brand → category → variety → size.
  Milk subtypes share their milk parent while precise subtypes remain in the
  source projection. Choices always come from the remaining observed rows.
- A reading-check helper, also accessible from a brochure product sheet. Enter
  or amend fields, inspect possible matches and differences, expand source
  readings, and use a supported combination in Search.
- Evidence includes reading counts, distinct stores, up to three example offer
  IDs, observation dates, and brochure/page/source links when retained.

## Uncertainty stays explicit

Assorted offers retain their source evidence but do not create precise
variety/size suggestions. Original aggregator-only readings and unclassified
Vision text remain available for review rather than precise autocomplete.
Conflicting structured categories or package sizes are excluded from normal
completion, even when erroneous OCR contains a matching word. A plain 200 ml
query can find a pack of 200 ml items, but an explicit 18 × 200 ml query must
match the pack count. Different packs stay distinct in the graph.

The initial snapshot had 7,829 readings without a brand, 21,673 without a resolved
category, and 12,984 without an unambiguous parsed package size. Those gaps are
not filled with general product knowledge. A stored Vision reading remains
fallible: repeated observations and trusted registry links are evidence for
review, not a guarantee of correctness.

Only trusted `auto`/`created` sightings of active, unflagged Registry products
carry existing `pr_*` IDs. The index never mints, merges, reassigns, or rewrites
identity. The helper changes the search query, not the stored Vision reading.
It intentionally separates finding a likely correction from an audited source
or Registry correction through the existing operator workflow.

## Delivery and refresh

`data/brochure-knowledge.json.gz` is a compressed snapshot (about 3.4 MB).
Its adjacent `.meta.json` records coverage and extraction time. A dedicated
module Worker loads and indexes it off the UI thread. Regular live search
continues if the index fails. No per-keystroke backend reads or AI calls.

The snapshot is **not automatically refreshed**. Refresh it when publishing
new brochure data, then publish the resulting frontend assets. From the
brochure-engine package in the connector repository:

```powershell
node refresh-brochure-knowledge.mjs --output '<frontend>/data/brochure-knowledge.json.gz'
```

The command uses the existing Wrangler account login and performs only SELECTs
against production D1. `--wrangler <wrangler/bin/wrangler.js>` can select an
installed CLI. It collects all pages before replacing the prior snapshot.

For a saved read-only export `{ exportedAt, source, records: [...] }`:

```powershell
node build-brochure-knowledge.mjs observations.json '<frontend>/data/brochure-knowledge.json.gz'
```

The export includes Vision field values, extraction JSON, source references,
and trusted Registry links. It contains no credentials. Keep raw exports
outside the published frontend. Both scripts use the same pure builder,
`src/lexicon/brochureKnowledge.js`.

## Verification

All 18 frontend test files and 11 engine lexicon test files passed. The new
tests check bilingual completion, observed-only connections, duplicate evidence,
assortments, category conflicts, units, explicit pack counts, typos, unresolved
readings, trusted links, and checkbox behavior. Desktop/mobile Chromium checks
exercise Space completion, keyboard selection, both checkboxes, the index
hierarchy, ordinary spaces, horizontal overflow, and uncaught browser errors.

Published through the existing GitHub Pages `main` deployment on 2026-10-22.
The release versions the app, translations, product sheet and stylesheet so
returning browsers load the new controls together.

## Explicit missing-reading retry

After the initial export, the user requested Vision for records without a
reading. The 782 source-only rows had all previously failed Vision; 44 were
current offers and 738 historical. An allowlisted, resumable retry run started
2026-10-22. Its pilot's new R2 evidence was read back successfully before the
remaining run started.

The administrative runner uses the existing verification store, explicit
operator retry flag, Vision-only extractor, acceptance rules and evidence
writer. It preserves prior attempt history and does not change the prompt,
model, global attempt cap, source expiry dates or Registry sightings. Historical
selection applies only to the explicit missing-reading allowlist. Records
that acquire a reading before their turn are skipped. The local compressed
index is rebuilt from the resulting readings when the retry pass completes.
Live progress and per-offer results are retained outside the frontend under
`product-knowledge-data/` in the workspace. An unsuccessful read remains
unresolved; sending to Vision does not guarantee a successful extraction.
