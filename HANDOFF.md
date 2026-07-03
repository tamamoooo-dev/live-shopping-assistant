# Super Search — Project Handoff

> **Purpose:** get a brand-new session productive fast, with minimal reading.
> This document holds **current state only** — no milestone narratives.
> **Maintenance rule:** when a phase completes, update the affected sections
> here *in place* (keep it short), and append the milestone's full story
> (what/why/how verified) to [HISTORY.md](HISTORY.md). Never append logs here.
>
> **Last updated:** 2026-07-04 · All five roadmap pillars are **built, deployed
> and verified in production**. Current work mode: polish & maintenance.

---

## 1. What this is

**Super Search** (renamed from "Souq" — repos, Workers, and internal ids keep
the old names) is a **personal Saudi shopping assistant for one user** — not a
commercial product. You type a product (Arabic or English) and get:

- **Live search** across 7 online stores, merged with **this week's flyer
  offers** from ~18 physical stores, in one ranked marketplace grid.
- A **comparison summary** (best buy by per-unit value, honest lowest-price
  claims, confidence ladder, price-history verdict).
- **Weekly brochures** browsable in an in-app viewer (`#/brochures`).
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
downloads, so runs converge. Bytes live in KV under the edition prefix
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
> word-start > substring) + JS filtering via the matching mirror, family-tier
ranking, name-matches before text-only, cheapest within tier.

**Price history** (`priceHistory.js` + `products.js` watchlist — currently
`milk`, `eggs`): one price point per product×store×**brochure edition**
(edition = *when*, store = *where*), price number sampled from the connector
(swappable seam) after the weekly fan-out. Lowest-ever is derived on read;
`/prices` also returns per-**size** `variants[]` (grouped by `parseSize`;
unparseable sizes quarantined in an `unsized` bucket). To track a new product:
add it to engine `products.js` AND the `PRODUCTS` mirror in frontend
`src/brochure.js`.

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

**API:** public reads `GET /` (health), `/brochures[?store=&region=]`,
`/brochures/history`, `/asset/<key>`, `/offers?q=`, `/lowest?product=`,
`/prices?product=`, `/prices/history?product=`, `/watches`, `/alerts[?unseen=1]`;
open writes `POST /watches`, `DELETE /watches?id=`, `POST /alerts/seen`;
guarded by `X-Ingest-Secret`: `POST /ingest?store=`, `/prices/record`,
`/watches/check`, `/prune`. CORS open (incl. DELETE).

## 6. Frontend map (no build step; `index.html` + `styles.css` + `src/`)

| File | Responsibility |
|---|---|
| `core.js` | Store-agnostic Core; adaptive strategy memory (localStorage) |
| `providers/*.js` | Thin per-store strategies calling the connector (`CONNECTOR_BASE`) |
| `app.js` | Hash router (`#/search` `#/brochures` `#/alerts`), search orchestration, honest filtering (irrelevant dropped + counted), persisted prefs (`lsa.app.rank`, store scope, recents), `OFFERS_FETCH_LIMIT=120` |
| `match.js` | **Matching mirror** (rule 2): normalize, synonyms, families, types, `parseSize`, relevance, `sameProduct` equivalence |
| `compare.js` | Comparison engine: bilingual flyer listings, family/type/coverage gates, **product-identity lock** (anchor = highest-relevance listing; others must cover ⊇ its matched query tokens), best-value w/ median outlier guard, per-variant history verdict |
| `summary.js` | Renders the comparison model (headline, confidence, excluded-counts, history verdict) |
| `marketplace.js` | Unified grid (online + flyer cards, store badges), sources strip, Lowest price / Best value sort toggle (value = per-unit within dominant unit family) |
| `brochure.js` | **The only engine client** (rule 7): all engine URLs/maps/readers/watch+alert clients; never throws |
| `brochures.js` | Brochures page (per-store sections, active/expired cards, covers) |
| `viewer.js` | In-app viewer: swipe, zoom, preload, focus trap, PDF branch, `targetPageId` deep-jump |
| `alertsPage.js` | Alerts page + shared watch dialog + nav badge |
| `server.js` (root) | Zero-dependency local static server → http://localhost:5173 |

Tests: `node src/match.test.mjs`, `node src/compare.test.mjs` (pure, offline).
Cross-page coupling is one `supersearch:search-store` CustomEvent. Theme is
CSS-variable driven (`--brand` blue `#2563eb`, light+dark).

## 7. Crons & scheduling (engine `wrangler.toml`)

- **`0 6 * * 2,3,5`** (Tue/Wed = Saudi drop days, Fri closes the weekend
  freshness hole): coordinator fans out **one child invocation per store**
  via the `SELF` service binding ("Architecture C") — each child gets its own
  50-subrequest budget and runs brochures → that store's offers. Then the
  coordinator runs the price-history capture (via `CONNECTOR`), then prune.
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
  ("6 × 200 ml", "24 قطعة × 125مل") have dedicated tests in both mirrors.
- **Family / type / category / synonym lexicons are curated, conservative.**
  Failure mode must stay "not excluded", never "wrongly excluded": only map a
  D4D category to exactly one family; a name with no type keyword gates
  nothing; the OCR-name always beats the category. Grow them as real queries
  miss (the "مويه returns zero" class of bug is a one-line synonym fix — in
  BOTH mirrors).
- **Flyer viewer deep-jumps** need `pageId`s in `meta.json` — they appear per
  edition on its next re-download (unchanged flyers dedupe and keep old
  metadata); missing id ⇒ graceful page-1 fallback. D4D ids sit on ~every
  other page (2-page spreads share one id).
- **Othaim flyer offers never open in-app** (brochure is the official PDF,
  offers come from D4D — no edition link possible); they open the external
  flyer page. iOS Safari renders embedded PDFs first-page-only ("Open PDF ↗"
  fallback exists).
- **Price-history capture is ungated** (`recordPrices` takes the connector's
  best-ranked result) — that's why junk can enter a product's series; the
  per-size variant grouping quarantines it (`unsized` bucket). Capture-side
  gating is a known, deliberate TODO.
- **Panda product watches** created before the variety-id fix (2026-07-03)
  won't re-find their product; re-create them.
- A first request to a **freshly created** workers.dev subdomain can return
  `error code: 1042` for a few seconds — retry, don't debug.

## 11. Open TODOs (priority order)

1. **Optional:** enable phone push — `npx wrangler secret put NTFY_TOPIC`.
2. **Amazon durability:** configure PA-API secrets, or keep accepting
   best-effort.
3. **README.md / CHANGELOG.md are badly stale** (still "Panda Live Search
   v1.0.0") — refresh them; this file is the only current doc.
4. **Grow the watchlist** beyond milk/eggs (engine `products.js` + frontend
   `PRODUCTS` mirror); the UI picks new products up automatically.
5. **Capture-side gating for price history** (family/relevance gate in
   `pickPricedResult`, or record several sizes per run) — see §10.
6. **`deriveNames` quality** (engine): some OCR-derived offer names are still
   rough; improving the deriver self-heals on the next weekly upsert.
7. **Best-effort store monitoring:** notice when Amazon/Noon silently stop
   returning results (both are fragile to upstream markup changes).

---

_Full milestone history (designs, decisions, verification records, §10–§25 of
the old handoff): [HISTORY.md](HISTORY.md)._
