# Search and Browse, 2026-10-23

Frontend asset version: `20261023.search2`. Publishing uses the existing
GitHub Pages deployment from `main`.

- Empty input hides autocomplete, including when recent searches exist.
- A product prefix (including one Arabic letter) completes a product category.
  Choosing it opens brands; choosing a brand opens varieties and sizes.
  Free typing and normal form submission continue to work.
- Selection consumes the completed click, preserves input focus and refreshes
  suggestions. It never changes the source scope. Keyboard and touch use the
  same path.
- Local frequency and recency rank complete canonical suggestions. Compound
  brands and varieties remain complete. The worker returns a wider candidate
  pool so favourites can outrank the default popular brands.
- Autocomplete downloads `data/brochure-suggestions.json.gz` (556 KB), derived
  from the full archive (3.7 MB). Inspection/identity tools retain the full
  archive. No new per-keystroke server or model calls.
- Browse home rails and listing grids request offers independently of the
  summary. A short, versioned session-storage cache survives page reloads;
  failed summaries can retry. Listing revisions reject obsolete filter results.
- Rails use a compact name in the browsing language; a down-arrow expands
  complete bilingual names and brand details. Size, price and quantity
  disclosures stay visible.
- Popular brands retain ten icon tiles. All brands have their own route/tab
  (`#/browse/brands/all`), alphabetical with batches of 60.

## Refresh

After replacing the full archive, run from the frontend root:

```powershell
node scripts/build-suggestion-index.mjs
node src/suggestionProjection.test.mjs
```

The projection test verifies the source hash, size budget and canonical query
parity, including Arabic prefixes, brands, varieties and explicit multipacks.

## Validation

23 frontend test files pass. Local Chromium tests with saved public API
responses verify empty input, history and clean-browser first letters, staged
selection, preserved selected/excluded sources, keyboard, touch, normal free
text submission, compact details and both brand tabs.

For a controlled comparison with a 2-second summary delay and 120-ms offers
delay, cards appeared in about 0.7–0.8 seconds rather than 2.8 seconds. A clean
first-letter query took about 1.5–2 seconds rather than 3.5–4.1 seconds. These are
local browser measurements, not a production performance guarantee.
