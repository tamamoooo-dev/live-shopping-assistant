# Super Search — Project Handoff

> **Purpose:** get a brand-new session productive fast, with minimal reading.
> This document holds **current state only** — no milestone narratives.
> **Maintenance rule:** when a phase completes, update the affected sections
> here *in place* (keep it short), and append the milestone's full story
> (what/why/how verified) to [HISTORY.md](HISTORY.md). Never append logs here.
>
> **Last updated:** 2026-07-16 · Latest change: **Packaging Intelligence V1**
> (HISTORY §33) — one package, one interpretation in BOTH matching mirrors:
> bonus packs ("10+2" = 12) ported to the engine (it was blind to them —
> mirror drift), packaging count words (rolls/رول، علب، قرص، ظرف…, curated),
> hamza/ة folds in `normSize`; "10+2 Free" ≡ "12 Rolls" now yields the same
> unit price, equivalence group, and /prices variant everywhere. Engine
> identities for bonus/count-word offers re-derive at the Fri cron.
> Previous change: **Browse V1.1** (HISTORY §32,
> BROWSE-DESIGN.md Rev 3) — quality refinement from real production usage:
> rails reduced to Biggest Drops + Lowest Ever (Exceptional Deals/Ending
> Soon/New This Week removed as a product decision), brand pages actually
> filtered (the V1 frontend never sent `brand=` — root cause of "wrong
> products on brand pages"), brand-detection precision guards (dept
> allowlists, neighbor vetoes, fuzzy repair removed), brand identity hero +
> product-families chips, fresh→frozen read-time refinement. Engine deployed
> and production-verified 2026-07-16 (2 rails; frozen fold live —
> chicken-poultry 436→388, frozen-poultry 32→80; brand pages filtered w/
> families chips). ⚠️ Only the brand RE-STAMP is pending: the weekly upsert
> self-heals it at the next ingest cron (Fri 06:00Z), or run the §11 TODO 0
> backfill for an immediate fix.
> (Viewer v2 / i18n / brand-knowledge milestones of 2026-07-10..15
> are in git history; their HISTORY sections are still pending.)

---

## 1. What this is

**Super Search** (renamed from "Souq" — repos, Workers, and internal ids keep
the old names) is a **personal Saudi shopping assistant for one user** — not a
commercial product. You type a product (Arabic or English) and get:

- **Live search** across 7 online stores, merged with **this week's flyer
  offers** from ~18 physical stores, in one ranked marketplace grid.
- **Browse** (`#/browse`, BROWSE-DESIGN.md) — "walk this week's market": the
  whole offers substrate organized by canonical departments/aisles + brands
  (equal entry points) with data-backed rails, flagship **Exceptional Deals**
  (transparent deal-quality score, never advertised discount alone).
- A **comparison summary** (best buy by per-unit value, honest lowest-price
  claims, confidence ladder, price-history verdict).
- **Weekly brochures** browsable in an in-app viewer (`#/brochures`) with
  **tappable products** (ClickFlyer-style): tap a product on a flyer page →
  detail sheet (crop image, price, discount, similar offers) → add to a
  **local cart** (`#/cart`, localStorage, grouped by store with totals).
- **Price watches** with a target price, checked daily, alerting in-app
  (`#/alerts`) and optionally via ntfy.sh push.

Hard constraint: **$0 running cost** — GitHub Pages + Cloudflare Workers Free
plan only. Scope decisions always favor a simple, private, low-cost tool.

Explicitly **deferred** (do not build): `StoreSessionCollector`, our own OCR,
LLM extraction, analytics dashboards, any paid Cloudflare feature (incl. R2 —
not enabled on the account).

## 2. System map, repos, URLs

```
Browser — static frontend (GitHub Pages, ES modules, NO build step)
  │   Core → Provider → Strategy → NormalizedResult   (src/core.js, store-agnostic)
  ├─► shopping-connector Worker — STATELESS: live store fetch + normalize
  │     GET /search?provider=<id>&q=<q>  → { provider, query, strategy, count, results[] }
  └─► brochure-engine Worker — STATEFUL (D1 + KV + 2 crons), same repo as connector
        brochures · structured flyer offers · price history · watches/alerts
```

| Piece | GitHub (`tamamoooo-dev/…`) | Local path | Production URL |
|---|---|---|---|
| Frontend | `live-shopping-assistant` | `C:\Users\majed\Desktop\claude\live-shopping-assistant` | https://tamamoooo-dev.github.io/live-shopping-assistant/ |
| Search connector | `shopping-connector` (⚠️ local folder is `serverless-connector`) | `C:\Users\majed\Desktop\claude\serverless-connector` | https://shopping-connector.tamamoooo.workers.dev |
| Brochure engine | same repo, second Worker | `…\serverless-connector\brochure-engine\` | https://brochure-engine.tamamoooo.workers.dev |

Cloudflare account `tamamoooo@gmail.com`. Engine bindings: D1 `brochure-engine`
(`50bbe1ea-aca0-4f1d-abfd-c586335d82ba`), KV `BROCHURES_KV`
(`38b0639256a34d1ebd7d96dcb55d0a9b`), `SELF` (fan-out), `CONNECTOR` (price
capture). Engine design doc: `brochure-engine/ARCHITECTURE.md` (older; where it
conflicts with this file, this file wins).

## 3. Hard rules (each has broken something before — do not bend)

1. **The 10-key result contract is frozen**, identical on frontend and
   connector: `{ id, name, image, price, oldPrice, currency, link, size,
   brand, discountLabel }`.
2. **THE MATCHING MIRRORS.** Frontend `src/match.js` ↔ engine
   `brochure-engine/src/matching.js` duplicate the bilingual matching layer:
   normalization, synonyms, brand transliterations, product families,
   product types (FORM), size/pack parsing. **Any change to one MUST be made
   in both**, same for their tests.
3. **Core/framework stay store-agnostic.** Store knowledge lives only in
   provider files/config. New online store = provider file in BOTH repos +
   registration (connector `src/index.js`; frontend `src/app.js` STORES).
   New flyer store = one engine provider config (usually a line in
   `providers/d4dStores.js`) — re-check the KV write budget (§8) first.
4. **The connector is stateless & thin** — no DB, auth, cache, sessions.
5. **Free plan, $0.** Respect the budgets in §8 before adding stores,
   watches, pages, or subrequests.
6. **Honesty rules.** A strong "Lowest price" claim only for a confident
   ≥2-store same-brand+size equivalence group; flyer prices are D4D's AI
   extraction — always carry the disclaimer + flyer deep-link, and flyer
   offers never join equivalence groups (confidence caps at medium);
   irrelevant results are dropped *and counted visibly*, never dumped.
7. **The frontend knows the engine only through `src/brochure.js`**, and all
   engine reads are best-effort — engine down must never block live search.
8. **Trunk-based:** commit to `main`, push = deploy. End commits with the
   `Co-Authored-By:` trailer naming the current Claude model.
9. **The Search Roadmap is ranking law** (this is a price COMPARISON engine,
   not a discovery engine — deterministic and predictable). The grid and
   `/offers` sort by the match STAGE first (`matchStage`, in both matching
   mirrors): single word — products whose name is HEADED by the token ("ليمون
   أصفر"; generic lead-ins like fresh/طازج skipped) first, then other primary
   matches ("كلوروكس ليمون"), and only then flavour/ingredient/scent or
   different-family usages ("عصير ليمون", "حليب بنكهة الليمون"); multi word —
   every query term is mandatory (exact phrase > all whole-word > all matched)
   before gradually relaxing to partial matches. No other signal (family band,
   price, relevance score) may ever promote a result past a better stage, and
   the engine never infers intent beyond the user's explicit words. **The
   Shopping Summary obeys the same stages** (compare.js STAGE GATE): it never
   summarizes or recommends a listing below the pool's best band — single word
   gates on the exact stage; multi word treats all full-coverage stages (5..2,
   name-layout refinements) as one band so word order never hides a cheaper
   genuine product from the comparison.

## 4. Online search stores (7 providers, both repos)

| id | Method | Notes |
|---|---|---|
| `panda` | Public JSON `api.panda.sa` (`products-v3` → `suggestions-v3`) | Emit the **VARIETY id** for result `id` + link — catalogue `product.id` 412s on the product page |
| `tamimi` | ZopSmart JSON (`shop.tamimimarkets.com/api/layout/search`) | Stable, EN/AR |
| `danube` | Spree JSON (`danube.sa/api/products.json`) | 3 tries on transient failures; multi-word **Arabic** queries 422 → provider falls back to the longest single token |
| `lulu` | Akinon list JSON (`gcc.luluhypermarket.com/{en-sa\|ar-sa}/list?…&format=json`) | SAR via pz-locale/pz-currency cookies |
| `amazon` | `pa-api` strategy first (skips while unconfigured) → `search-html` parse of `amazon.sa/s` | **Best-effort.** 5× retry w/ rotating UA (~80%); frontend retries once more (~99% effective). Parser splits the brand `<h2>` from the title `<h2>` (brand-led display name) — `amazon.test.mjs` locks it. Durable fix = PA-API secrets (§9) |
| `noon` | Noon **Minutes** RSC-flight parse (`minutes.noon.com`) | Best-effort; main noon.com blocks datacenter IPs |
| `ninja` | `public.ananinja.com/fahras/search/products` after bootstrapping a guest `DeviceToken` (~90-day JWT) from any storefront 404 | `storeId=1` = Riyadh; prices in **cents** (÷100); token cached in-isolate, refetched on 401 |

Frontend `BEST_EFFORT = {amazon, noon}` (friendlier failure message). Newly
added stores auto-enable once for returning users via the `known-stores`
localStorage key.

**Do not re-investigate (settled):** HungerStation Market (menu API is
Cloudflare-gated to datacenter IPs) and Keeta Market (signed Meituan "Sailor"
API, geo-gated) are **not addable from a Worker**. ClicFlyer WAF-blocks
datacenter IPs (503). OffersInMe was the original aggregator — replaced by D4D
(stale data). Manuel was retired (dead on D4D since 2025-09, no official
offers page); its D1 history rows are kept.

## 5. Brochure engine (the stateful Worker)

**Sources, best-first per store:** `pdfIndex` (Othaim only — official weekly
PDF, resolved fresh each run from the RSC flight of `othaimmarkets.com/offers`
by the stable slug `central-region-offers-corner`; never hardcode PDF URLs) →
`aggregator` with the **D4D adapter** (`d4donline.com`, server-rendered, city
in the URL path, JSON-LD validity dates) → `officialLink` fallback (emits a
`sourceType:"link"` brochure pointing at the store's official offers page)
when D4D has nothing **current** (expired flyers are rejected by the currency
gate, never served).

**18 store providers** (all Central/Riyadh): othaim, hyperpanda (≡ search
`panda`), lulu, tamimi, danube, carrefour, nesto, farm, almadina, ramez,
cityflower, marksave, amarket, grandhyper, makkah, prime, alwafa, aljazera.
Config = D4D `<slug>-<id>` + city + optional officialUrl; the offers `company`
id is parsed from the D4D key.

**Brochure identity & multi-flyer:** identity `store:region:edition`, edition
= ISO week `YYYY-Wnn`. A store's **main** current flyer keeps the plain weekly
edition; concurrent siblings append the D4D offer id (`2026-W27-738849`).
`rankCurrent` ranks valid-now → most pages → latest validTo → newest id, and
dedupes same-campaign variants. Dedupe is sha256 checksum (`ux_checksum`);
already-held flyers are matched by `source_url` (`findHeld`) and cost zero
downloads, so runs converge. **Re-render detection** (§29): D4D can re-render
a flyer under the SAME URL (page set re-paginated, or deep-link page ids newly
exposed), which `findHeld` alone can't see — the collector compares the held
`meta.json` page set with what the leaflet advertises now (`readHeldPages`,
KV-only) and re-downloads on drift; byte-identical re-downloads that gained
page ids refresh `meta.json` only. Tests: `node src/reingest.test.mjs`. Bytes live in KV under the edition prefix
(`pageNN.webp` / `original.pdf` / `meta.json`); `GET /brochures` rows carry
`pages:[]` — the real page list (with `pageId`s for viewer deep-jumps) is in
`meta.json`.

**Structured offers:** D4D also machine-extracts per-product offers per flyer.
`offers/d4dOffers.js` POSTs `/products/search` (CSRF token + cookie minted by
a plain GET of any store page; ~4 subrequests/store, `maxOffers` 1500).
Offers upsert into D1 (unique `store:region:source:offer_id`); "current" is
derived from `valid_to` at read time; bilingual names are OCR-derived
(`offers/contract.js deriveNames`, debris-guarded) and refresh on each weekly
upsert. `GET /offers?q=` search: word-boundary banded D1 prefilter (exact word
> word-start > substring) + JS filtering via the matching mirror, ranked by
Search-Roadmap stage (rule 9) → family tier → match strength → cheapest.

**Hotspots (tappable brochures) — SNAPSHOT-AT-INGEST:** D4D leaflet HTML
embeds per-product tap polygons (`data-coords-json` on the carousel copy's
`image-container`; `data-next-page-coords` on the plain copy's `picture` =
the FOLLOWING page) whose `id_product` == `offers.offer_id`, in the page's
`data-width/height` pixel frame. `hotspots.js parseHotspots` reduces them to
normalized bboxes; capture happens AT INGEST: the d4d adapter parses geometry
from the SAME leaflet HTML fetch that lists the page images and remaps source
`data-index` → stored ordinal page index (`remapHotspotPages` — the join with
`meta.json` is identity by construction), the collector carries it on every
candidate, and the pipeline writes `<prefix>/hotspots.json` WITH the page
bytes (before `meta.json`, the commit point) — pages and geometry are two
views of ONE rendering and can never misalign. Held flyers heal a
missing/legacy/differing snapshot every run at zero extra subrequests (the
leaflet HTML is fetched each run anyway; `pipeline.ensureHotspots` writes
only on change). `GET /brochures/hotspots?id=` is STORAGE-ONLY (KV snapshot +
D1 offers join via `offerStore.byFlyer`) — the runtime NEVER fetches D4D, so
nothing D4D changes after ingestion can break a held brochure. A D4D markup
change degrades cleanly at ingest (empty snapshot, no spots) and self-heals
on the next ingest after a parser fix; retention prunes `hotspots.json` with
the edition. **Parser-break SAFEGUARD:** on the same-rendering paths (dedupe /
held-flyer heal) `ensureHotspots` REFUSES to overwrite a non-empty stored
snapshot with an empty parse — bytes are identical there, so an empty parse is
a `parseHotspots` failure, not a flyer that lost its products; it keeps the
good geometry, logs `hotspots parse-suspect` (grep in `wrangler tail`), and
counts `hotspotsSuspect` in the ingest report. The changed-bytes re-store path
still writes unconditionally (old geometry would misalign with new pages).
Tests: `node src/hotspots.test.mjs`, `node src/reingest.test.mjs`.

**Price history** (`priceHistory.js` + `storage/historyStore.js`) —
**CATALOG-WIDE, harvested from the offers ingest** (redesigned 2026-07-04;
the old milk/eggs watchlist + connector sampling is retired — `products.js` /
`priceStore.js` deleted, the `price_points` table left in D1 unused). Every
flyer offer is a price observation. Cross-week identity is DERIVED (D4D
`offer_id` is per-flyer-extraction — verified: the same product in two
concurrent flyers carries two different ids): `ph_` + fnv64 of store | region
| normalized bilingual name | parsed-size key. Conservative by rule: nameless
or single-token OCR names record nothing (never mix two products' histories);
an identity split (OCR name drift) only shortens a series because the READ is
query-driven and merges identities per size variant. Storage is incremental:
one `price_identities` row per product (refreshed in place; `weeks_seen`
depth counter) + a `price_history` point only on first sighting or a price
CHANGE, keyed `(identity, valid_from)` so re-ingests converge. `GET
/prices?q=` (legacy `product=` accepted as q) derives everything at read
time: matching-mirror relevance, then the rule-9 gate (single word = the
PRIMARY band, stages ≥4 — stage 5 vs 4 is only word position, famRank
excludes the "كلوروكس ليمون" class; multi word = full-coverage band ≥2), then
best famRank; grouped per size variant, each with lowest-ever
(price/where/when), highest, latest-per-store, `weeks` depth, `firstSeen`,
`trend`. Under 2 weeks of depth the frontend verdict says **"history is
building"** instead of claiming a record. Guarded `POST
/prices/backfill?store=` re-seeds from offers rows already in D1 (run once
2026-07-04: ~13.6k identities+points from 15.8k offers). Retention:
identities unseen >365 days are pruned with their points.

**Price monitoring** (`monitor.js`): watches are `product` (provider + stable
result id, re-found by id/link match) or `grocery` (sweeps all 7 connector
stores + current flyer offers in D1). Trust gates: relevance floor 50,
reference-size comparability ±25%, family gate, type gate. Alerts fire on a
downward **crossing** of the target (re-arms above); no-data never re-arms.
Cap: 24 active watches, checked daily in SELF-fan-out batches of 3. Watch API
is open but validated+capped (single-user posture). Push = optional
`NTFY_TOPIC` secret (unset ⇒ in-app only).

**Retention** (`retention.js`, runs after each cron ingest; manual
`POST /prune`): metadata forever; **bytes** deleted once a brochure is
non-current AND expired >28 days (row marked `pruned_at`); ≤250 KV deletes +
≤12 rows per run; offers rows deleted after ~180 days.

**D1 tables:** `brochures`, `price_points`, `offers`, `watches`, `alerts`
(canonical `schema.sql`; past deltas in `migrate-*.sql`, already applied).

**Browse** (engine `src/browse/`, BROWSE-DESIGN.md Rev 3): read-only views
over the offers+history substrate, speaking ONLY canonical ids. `taxonomy.js`
(11 depts / ~70 aisles, bilingual, OURS) + `mapping.js` (per-source category →
aisle; unmapped ⇒ visible `other`, read-time so fixes apply retroactively;
plus the **fresh→frozen refinement**: `FRESH_TO_FROZEN` + the مجمد/frozen
name marker reroute D4D's frozen-filed-as-fresh rows, applied identically in
cards, tile counts, and the SQL prefilters' `frozen: exclude|only` include
modes) + `brands.js` (canonical brand KB ~100 entries + OCR-repair detection;
V1.1 precision guards: per-brand `depts` allowlists, VETO_PREV/VETO_NEXT
neighbor words, `noStrip`, min key length 3, NO fuzzy prefix repair —
detection takes the offer's source/category for context; failure mode is
"no brand", never "wrong brand") + `deals.js` (deal scoring, pure+tested —
kept for Exceptional Deals' future return; V1.1 ships only the Biggest
Drops + Lowest Ever rails, RAIL_IDS is the law). A brand listing's first
page carries `brand` + `families` (live offers per canonical aisle,
`browseStore.brandFacets`). Ingest stamps two derived columns on offers:
`identity` (deriveIdentity — the history join) and `brand_slug` (detectBrand);
`/prices/backfill` heals pre-column rows AND re-stamps after brand-knowledge
changes. Tests: `node src/browse/browse.test.mjs`.

**API:** public reads `GET /` (health), `/brochures[?store=&region=]`,
`/brochures/history`, `/brochures/hotspots?id=`, `/asset/<key>`,
`/offers?q=`, `/browse` (market floor, edge-cached 1h),
`/browse/offers?dept=|aisle=|brand=|rail=|store=&sort=`,
`/lowest?q=`, `/prices?q=` (legacy `product=` maps to q),
`/watches`, `/alerts[?unseen=1]`;
open writes `POST /watches`, `DELETE /watches?id=`, `POST /alerts/seen`;
guarded by `X-Ingest-Secret`: `POST /ingest?store=`, `/prices/backfill[?store=]`,
`/watches/check`, `/prune`. CORS open (incl. DELETE).

## 6. Frontend map (no build step; `index.html` + `styles.css` + `src/`)

| File | Responsibility |
|---|---|
| `core.js` | Store-agnostic Core; adaptive strategy memory (localStorage) |
| `providers/*.js` | Thin per-store strategies calling the connector (`CONNECTOR_BASE`) |
| `app.js` | Hash router (`#/search` `#/brochures` `#/alerts` `#/cart`), search orchestration, honest filtering (irrelevant dropped + counted), persisted prefs (`lsa.app.rank`, store scope, recents), `OFFERS_FETCH_LIMIT=120`, cart nav badge |
| `match.js` | **Matching mirror** (rule 2): normalize, synonyms, families (3 tiers: derived > base > produce — fresh-produce nouns are flavour/ingredient modifiers, so "حليب فراولة"/"Strawberry Milk" stay milk), types, `parseSize`, relevance, `sameProduct` equivalence, `matchStage`/`queryTokenPresence` (Search-Roadmap stages, rule 9 — directional flavour markers: Arabic بنكهة/بطعم/برائحة precede the flavour word, English flavoured/scented follow it) |
| `compare.js` | Comparison engine: bilingual flyer listings, **Search-Roadmap STAGE GATE first** (rule 9 — the summary only reasons over the grid's best match band), then family/type/coverage gates, **product-identity lock** (anchor = highest-relevance listing; others must cover ⊇ its matched query tokens), best-value w/ median outlier guard, per-variant history verdict |
| `summary.js` | Renders the comparison model (headline, confidence, excluded-counts, history verdict) |
| `marketplace.js` | Unified grid (online + flyer cards, store badges), sources strip, Lowest price / Best value sort toggle (value = per-unit within dominant unit family); sort order = Roadmap stage (rule 9) → family band → price/value |
| `brochure.js` | **The only engine client** (rule 7): all engine URLs/maps/readers/watch+alert clients, `loadHotspots`, `loadBrowseSummary`/`browseOffers`, `cleanOfferName` (leading OCR-banner trim); never throws |
| `browsePage.js` | Browse pillar UI (`#/browse[/dept\|aisle\|brand\|brands\|rail/...]`): market floor (dept tiles + brand pills as EQUAL peers, then Biggest Drops + Lowest Ever rails — V1.1 keeps only these two), listings w/ aisle chips + sorts (discount/price) + store filter + paging; **brand pages** open on an identity hero (deterministic monogram, bilingual name, offers·stores) + engine-fed product-family chips. Composes marketplace's EXPORTED card primitives + `openFlyerOffer` — one card idiom, one tap-through (viewer deep-link w/ sheet) app-wide |
| `brochures.js` | Brochures page (per-store sections, active/expired cards, covers) |
| `viewer.js` | In-app viewer: swipe, zoom (buttons + **pinch + double-tap**, focal-point anchored via `zoomAt`), preload, focus trap, PDF branch, `targetPageId`/`targetPageIndex` deep-jumps; **hotspot overlay** (page image in a JS-sized `.bv-imgwrap`, % boxes track zoom) + **product sheet** (crop, price, Add to Cart, similar-offers strip via `searchOffers`; scrim tap / swipe-down / Esc dismiss). Sheet hero + cart thumbnail are **SELF-HOSTED crops** from the STORED page image via the tapped spot's bbox (`cropFromPage`: canvas + `crossOrigin` on the CORS-open /asset → data-URL); D4D's CDN crop (`offer.imageUrl`) is only a fallback when no geometry is at hand (similar-strip, marketplace). ⚠️ `.ps-sheet` centering is margin-based on purpose — `fade-up`'s `both` fill overwrites transform-based centering |
| `cart.js` | localStorage cart (`lsa.cart.v1`), qty/remove/clear, `CART_EVENT` |
| `cartPage.js` | Cart page: per-store groups + subtotals, qty steppers, View flyer (re-opens viewer on the item's page) |
| `alertsPage.js` | Alerts page + shared watch dialog + nav badge |
| `server.js` (root) | Zero-dependency local static server → http://localhost:5173 |

Tests: `node src/match.test.mjs`, `node src/compare.test.mjs` (pure, offline).
Cross-page coupling is one `supersearch:search-store` CustomEvent. Theme is
CSS-variable driven (`--brand` blue `#2563eb`, light+dark).

## 7. Crons & scheduling (engine `wrangler.toml`)

- **`0 6 * * 2,3,5`** (Tue/Wed = Saudi drop days, Fri closes the weekend
  freshness hole): coordinator fans out **one child invocation per store**
  via the `SELF` service binding ("Architecture C") — each child gets its own
  50-subrequest budget and runs brochures → that store's offers → that store's
  price-history harvest (D1-only, no subrequests). Then the coordinator prunes.
- **`45 5 * * *`**: watch check — SELF fan-out in batches of 3.
- `scheduled()` branches on `event.cron`. On-demand equivalent:
  `POST /ingest?store=<id>` (same path the fan-out hits).

## 8. Free-plan budgets (re-do this math before adding stores/watches)

- **50 external subrequests per invocation.** Per-store ingest child ≈ 47:
  1 store page + ≤6 leaflet fetches (`maxCandidates`) + ≤36 page images
  (`maxTotalPages` — oversize flyers truncate; `maxPages` must never exceed
  `maxTotalPages` or the flyer starves forever) + ~4 offers POSTs.
- **32 invocations per event.** Ingest fire ≈ 1 + 18 children + capture +
  prune; watch fire ≈ 1 + ⌈watches/3⌉ (cap 24 watches ⇒ ≤9).
- **KV Free:** 1 GB total (retention keeps it bounded), **1,000 writes/day** —
  a worst-case all-stores-new-flyers day is ~700–900 writes; partial failures
  self-heal at the next fire. This is the binding constraint on adding stores.
- Grocery watch ≈ 7 subrequests; flyer candidates cost 0 (already in D1).

## 9. Deploy, verify, develop

**Frontend:** push to `main` → GitHub Pages (~1–2 min + CDN). Verify with a
cache-buster: `curl ".../src/app.js?cb=$RANDOM"` — CDN `max-age=600`, so a
stale spot-check within 10 min of a push is normal, not a failed deploy. The
Pages metadata API 404s unauthenticated — also normal. Local: `node server.js`.

**Workers:** from `serverless-connector/` or `…/brochure-engine/`:
`npx wrangler deploy` (wrangler is already OAuth-authenticated;
`npx --no-install wrangler deploy` works). Engine redeploys are idempotent.
Schema changes: write canonical `schema.sql` + a `migrate-*.sql` delta,
apply with `npx wrangler d1 execute brochure-engine --remote --file=…`.
Local: connector `node dev.mjs` (:8787); engine `node dev.mjs` /
`node dev.mjs selftest [store] | pricetest | offerstest | watchtest`
(selftest includes live D4D legs). Connector tests:
`node src/providers/amazon.test.mjs`, `node src/providers/panda.test.mjs`.

**Secrets** (per Worker, `npx wrangler secret put <NAME>`):
- `INGEST_SECRET` (engine) — guards ingest/check/prune. Value is uncommitted
  and effectively unknown between sessions: **rotate it whenever you need it**
  (harmless; allow a few seconds' propagation before hammering guarded routes).
- `NTFY_TOPIC` (engine, **unset**) — set to an unguessable topic to enable
  phone push (user subscribes to it in the ntfy app).
- `PAAPI_ACCESS_KEY/SECRET_KEY/PARTNER_TAG` (connector, **unset**) — would
  activate Amazon PA-API, no code change.

**This machine:** Node is at `C:\Program Files\nodejs` but **not on PATH** for
the default shells — `export PATH="$PATH:/c/Program Files/nodejs"` first.
Browser-preview stays pinned to localhost and **screenshots time out** on
external product images — verify via `preview_eval` DOM inspection; preview
`launch.json` lives at `C:\Users\majed\Desktop\claude\.claude\launch.json`.

## 10. Sharp edges (learned the hard way)

- **Mirror drift is the #1 regression risk** — see rule 2 (§3).
- **D4D CSRF flow** (`_csrf-frontend` input) is the fragile seam for offers;
  a D4D change breaks offers ingest cleanly per store (brochures unaffected);
  the fix lives entirely in `offers/d4dOffers.js`. Rapid manual re-ingests
  can rate-limit on D4D (pace runs ~2.5 s; real cron fires are days apart).
- **Size parsing:** decimals and Arabic-Indic digits must survive
  normalization (`normSize` is separate from `normalizeText` for this); JS
  `\b` is ASCII-only — Arabic boundaries use a unicode lookahead. Pack forms
  ("6 × 200 ml", "24 قطعة × 125مل"), bonus packs ("10+2" = 12 units; "9+3 ×
  200 مل" = 12 × 200 ml — HISTORY §33), and packaging count words ("12
  Rolls", "٥٠ قرص", "6 cans × 330ml") have dedicated tests in both mirrors.
  COUNT_WORDS is curated to nouns naming the WHOLE sellable unit — never add
  per-sheet/inner counts (ورقة، منديل, sheets, wipes): stores count those
  inconsistently and a wrong count corrupts unit price + equivalence, which
  is worse than no parse. `normSize` folds hamza/ة (and Farsi glyphs), so
  new Arabic count words go in canonical form (ا، ه).
- **Family / type / category / synonym lexicons are curated, conservative.**
  Failure mode must stay "not excluded", never "wrongly excluded": only map a
  D4D category to exactly one family; a name with no type keyword gates
  nothing; the OCR-name always beats the category. Grow them as real queries
  miss (the "مويه returns zero" class of bug is a one-line synonym fix — in
  BOTH mirrors).
- **Produce is the LOWEST family tier** (derived > base > produce): produce
  nouns are flavour/ingredient modifiers in both word orders, so any other
  family keyword in the name wins regardless of position. When a query names a
  family, the grid's TOP band is family-CONFIRMED entries (band 3), known-
  different families sit at the bottom, family-less rank by lexical strength —
  that's what keeps fresh طماطم above paste/ketchup without hiding anything.
  Ambiguous English words ("orange", "cherry") stay Arabic-only in the produce
  lexicon; a produce word next to a flavour marker (بنكهة/بطعم/برائحة/scented)
  classifies as nothing.
- **A bare produce query means FRESH** (`freshProduceIntent`): same-family
  entries with a FORM word ("رول فراولة") drop to the bottom, processed ones
  (frozen/canned/peeled/coated/dried + a curated frozen-BRAND list: مونتانا،
  سنبلة، الكبير…) drop to the middle, and family-less names where the produce
  appears only بال-attached or flavour-marked ("مصاصات بالفراولة") drop to the
  bottom (`producePresence` = 'flavored'). The same three signals gate the
  Shopping Summary (freshExcluded count) and the engine /offers famRank, so
  "lowest strawberry price" is always a FRESH strawberry claim. Naming the
  form/processing in the query ("فراولة مجمدة") switches all of it off.
- **Flyer viewer deep-jumps** need `pageId`s in `meta.json` — they appear per
  edition on its next re-download; missing id ⇒ graceful page-1 fallback. D4D
  ids sit on ~every other page (2-page spreads share one id).
- **D4D re-renders flyers under the SAME leaflet URL mid-week** (seen
  2026-07-05: lulu W27 went 40 → 80 pages days after capture). The re-render
  detection (§5, §29) re-downloads on drift, and since snapshot-at-ingest
  (§30) pages + `hotspots.json` always come from the same rendering — a
  missed re-render can no longer misalign geometry with stored pages or break
  a served brochure. The residual cost is only STALENESS until the next
  ingest, plus offers' `?page=` refs dying on D4D (cosmetic: the in-app
  viewer is primary, external links are best-effort "Verify"). Never assume
  "same URL ⇒ same flyer".
- **Othaim flyer offers never open in-app** (brochure is the official PDF,
  offers come from D4D — no edition link possible); they open the external
  flyer page. iOS Safari renders embedded PDFs first-page-only ("Open PDF ↗"
  fallback exists).
- **Price-history identity is name+size derived** (no stable upstream id
  exists). OCR-name drift SPLITS a product's series — harmless, the query-
  driven read merges per variant. The failure mode that must stay impossible
  is MIXING two products' histories: never loosen the identity gates (≥2
  name tokens, size in the key) to "fix" a short series.
- **Panda product watches** created before the variety-id fix (2026-07-03)
  won't re-find their product; re-create them.
- A first request to a **freshly created** workers.dev subdomain can return
  `error code: 1042` for a few seconds — retry, don't debug.
- **/browse is cached twice**: 1h at the edge (Cache API; the guarded write
  paths purge it per-colo after ingest/backfill) AND up to 1h in the BROWSER
  (`max-age=3600`). Right after an ingest, a user who visited recently can
  see the previous floor for up to ~1h — accepted for a 3×/week substrate;
  don't "fix" by shortening the TTL without re-checking D1 read volume.
- **Per-store /prices/backfill calls can transiently fail** with an HTML
  error page when hammered back-to-back (seen 2026-07-16: 7 of 18 stores);
  idempotent — re-run the failed stores with a few seconds' pacing.
- **`browseOffers()` in `brochure.js` whitelists its query params.** A param
  missing from that list is SILENTLY dropped — that's how Browse V1 shipped
  brand pages that showed the global listing (`brand` wasn't whitelisted).
  Adding a `/browse/offers` param = add it to that list, same commit.
- **The frozen-marker test exists twice by design** (JS regex in
  `browse/mapping.js` + `FROZEN_MARK_SQL` in `storage/browseStore.js`); they
  MUST classify identically or cards/counts/filters drift. Change both or
  neither.

## 11. Open TODOs (priority order)

0. **V1.1 brand re-stamp** (everything else is deployed & verified): the
   ~130 wrong / 31 stale `brand_slug` stamps in D1 self-heal at the next
   ingest cron (the weekly upsert re-stamps every re-extracted offer —
   first fire Fri 2026-07-17 06:00Z). For an immediate fix instead: rotate
   `INGEST_SECRET` (was permission-blocked 2026-07-16) and run
   `POST /prices/backfill?store=<id>` per store, paced. Verify with:
   `SELECT brand_slug, COUNT(*) FROM offers WHERE valid_to >= date('now')
   AND brand_slug IN ('hana','kdd','puck','galaxy') GROUP BY 1` — hana must
   be 0, the others should drop vs their 2026-07-16 audit counts (22/62/34).
1. **Browse Phase 4** (BROWSE-DESIGN.md §11; none is urgent): reintroduce
   **Exceptional Deals** once the history substrate is deep enough to score
   it honestly (deals.js is kept pure+tested for exactly this), brand mining
   (observed tier), shelf (family) refinements, finer product families
   inside brands, For-you / In-season rails, collections, cart intelligence,
   per-deal "why exceptional" explainer sheet.
2. **Optional:** enable phone push — `npx wrangler secret put NTFY_TOPIC`.
2. **Amazon durability:** configure PA-API secrets, or keep accepting
   best-effort.
3. **README.md / CHANGELOG.md are badly stale** (still "Panda Live Search
   v1.0.0") — refresh them; this file is the only current doc.
4. **`deriveNames` quality** (engine): some OCR-derived offer names are still
   rough; improving the deriver self-heals on the next weekly upsert AND
   converges price-history identities (better names = fewer series splits).
5. **Best-effort store monitoring:** notice when Amazon/Noon silently stop
   returning results (both are fragile to upstream markup changes).

---

_Full milestone history (designs, decisions, verification records, §10–§25 of
the old handoff): [HISTORY.md](HISTORY.md)._
