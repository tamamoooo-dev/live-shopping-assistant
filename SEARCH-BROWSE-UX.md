# Search and Browse, 2026-10-23

Card assets: `20261023.cards1`; autocomplete UI: `20261023.mobile1`;
archive/autocomplete data: `20261023.search2`. Publishing uses the existing
GitHub Pages deployment from `main`.

Mobile follow-up: autocomplete UI asset `20261023.mobile1`. WebKit suppresses
the compatibility click after cancelled touch pointerdown, so a completed tap
is accepted on `touchend` instead. Scrolls, cancelled/multitouch gestures and
late worker responses cannot change the pressed choice. Mouse and keyboard
selection keep their existing behavior. Input focus is restored without
scrolling. `scripts/test-autocomplete-mobile.cjs` covers this using iPhone
WebKit and Android Chromium, including blur during a tap and source scope.

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
- Following the user's request to restore the first design, cards again use
  one name, without the added brand row, expandable details or per-size price
  breakdown. Browse uses the browsing language; Search retains its original
  display name. Rails again stretch cards to the same height. Full bilingual
  identity and brand/size details remain in the product sheet. Correct size,
  offer quantity and per-item price disclosures remain on the card.
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
