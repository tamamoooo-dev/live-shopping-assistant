# Super Search — Project Handoff

> **Purpose:** get a brand-new session productive fast, with minimal reading.
> This document holds **current state only** — no milestone narratives.
> **Maintenance rule:** when a phase completes, update the affected sections
> here *in place* (keep it short), and append the milestone's full story
> (what/why/how verified) to [HISTORY.md](HISTORY.md). Never append logs here.
>
> **Last updated:** 2026-10-08. **State at a glance:**
> - **Production:** engine Worker version `d5e6ee24` = commit `2b340ca`
>   (`git log` on `serverless-connector` main names exactly what runs; deploys
>   only through `node deploy.mjs`, §9). Frontend `main` = `307535b` on Pages.
> - **Platform:** Cloudflare **Workers Paid** (R2, Queues, 5-minute CPU in
>   use, §8). Mistral is the only other spend: ONE model,
>   `ministral-14b-2512`, for every read, with 2 live keys × 30 requests per
>   wall-clock minute.
> - **Vision** reads every new offer exactly once. Stage 1 runs 3 parallel
>   lanes of up to 112 offers per fire, 6 fires an hour; Stage 2 re-checks
>   with 2 lanes. Unpriced D4D products are tappable and priced by the
>   Vision fallback. About 21% of read offers stay unserved, mostly for a
>   missing English name; that policy is the user's call (§11 D1).
> - ⚠️ **Cron events arrive at least once.** Duplicates ~1 minute apart were
>   seen on 2026-10-08, so every drain takes a D1 lease first (§7).
> - **Operations:** a daily health digest goes to the ntfy topic at 05:00
>   UTC. D1 is exported to R2 every Sunday 02:00 UTC (8 weeks kept,
>   restore script in §9). Both repos run their tests in GitHub CI. The two
>   matcher mirrors are pinned by shared golden vectors (§9).
> - **Narratives:** HISTORY.md (§52–§56 cover 2026-08-01 → 2026-10-08). The
>   gap review that drove the October work is
>   `C:\Users\majed\Desktop\claude\EXECUTIVE-PLAN-2026-10-08.md` (outside both
>   repos).

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

Running cost: **Cloudflare Workers Paid** (the engine needs its CPU,
subrequest and Queue limits) plus pay-per-call **Mistral** for Vision.
Everything else is free: GitHub Pages, D4D and ntfy.sh. Scope decisions still
favor a simple, private, low-cost tool. Never raise a Mistral cap or add a
paid feature without the user's say-so.

Explicitly **deferred** (do not build): `StoreSessionCollector`; a self-hosted
OCR in production (PaddleOCR-VL was measured locally in September and is
PARKED, HISTORY §55); analytics dashboards beyond `/__ops`.

## 2. System map, repos, URLs

```
Browser — static frontend (GitHub Pages, ES modules, NO build step)
  │   Core → Provider → Strategy → NormalizedResult   (src/core.js, store-agnostic)
  ├─► shopping-connector Worker — STATELESS: live store fetch + normalize
  │     GET /search?provider=<id>&q=<q>  → { provider, query, strategy, count, results[] }
  └─► brochure-engine Worker — STATEFUL (D1 + R2 + KV + Queues + 5 crons), same repo as connector
        brochures · structured flyer offers · price history · watches/alerts
```

| Piece | GitHub (`tamamoooo-dev/…`) | Local path | Production URL |
|---|---|---|---|
| Frontend | `live-shopping-assistant` | `C:\Users\majed\Desktop\claude\live-shopping-assistant` | https://tamamoooo-dev.github.io/live-shopping-assistant/ |
| Search connector | `shopping-connector` (⚠️ local folder is `serverless-connector`) | `C:\Users\majed\Desktop\claude\serverless-connector` | https://shopping-connector.tamamoooo.workers.dev |
| Brochure engine | same repo, second Worker | `…\serverless-connector\brochure-engine\` | https://brochure-engine.tamamoooo.workers.dev |

Cloudflare account `tamamoooo@gmail.com`. Engine bindings:
- D1 `DB` = `brochure-engine` (`50bbe1ea-aca0-4f1d-abfd-c586335d82ba`), ~430 MB.
- R2 `BROCHURES` = bucket `brochure-engine`: the object store (tiered over KV),
  Vision verification history, and `backups/d1/`.
- KV `BROCHURES_KV` (`38b0639256a34d1ebd7d96dcb55d0a9b`).
- Queue `BACKGROUND_DRAINS` (`brochure-background-drains`).
- `SELF` (fan-out) and `CONNECTOR` (price capture).

A staging twin exists (`brochure-engine-staging`, its own D1/R2/KV, no
crons). Deploy it with `node deploy.mjs --staging`.

Engine design doc: `brochure-engine/ARCHITECTURE.md`. It is older; where it
conflicts with this file, this file wins.

**Permanent engine contracts** (each is the source of truth for its own domain;
where they conflict with this file, *they* win — they are narrower and newer):

| Contract | Governs |
|---|---|
| `brochure-engine/VISION-PIPELINE.md` | Vision ingestion pipeline: stage boundaries S0–S10, admission, the S4 acceptance gate, and the queue-driven recovery boundary (C-8). Decision log in §11, implementation status in §12 |
| `brochure-engine/QUALITY-SCORES.md` | Builder Score (Identity Readiness) and Commerce Score: independent axes, never combined, never user-facing |
| `brochure-engine/IDENTITY-OWNERSHIP.md` | Product identity, `pr_*` minting, what may never be identity evidence |

## 3. Hard rules (each has broken something before — do not bend)

1. **The 10-key result contract is frozen**, identical on frontend and
   connector: `{ id, name, image, price, oldPrice, currency, link, size,
   brand, discountLabel }`.
2. **THE MATCHING MIRRORS.** Frontend `src/match.js` ↔ engine
   `brochure-engine/src/matching.js` duplicate the bilingual matching layer:
   normalization, synonyms, brand transliterations, product families,
   product types (FORM), size/pack parsing, and (since HISTORY §34) the
   shared journey gate ladder (`JOURNEY_POLICY` + `resolveJourneyPool`).
   **Any change to one MUST be made in both**, same for their tests.
   Since HISTORY §50 there is a SECOND mirrored pair under the same rule:
   frontend `src/priceBasis.js` ↔ engine `src/lexicon/priceBasis.js` (the
   PRICE BASIS reader). The client needs its own copy because online listings
   never pass through the engine. Everything below the header is identical
   except `unitPriceFromBasis`'s display units — the engine emits
   `'l'`/`'piece'`, the client `'L'`/`'pc'`, because the unit string is the
   grouping key for unit-price families in `compare.js`.
3. **Core/framework stay store-agnostic.** Store knowledge lives only in
   provider files/config. New online store = provider file in BOTH repos +
   registration (connector `src/index.js`; frontend `src/app.js` STORES).
   New flyer store = one engine provider config (usually a line in
   `providers/d4dStores.js`) — re-check the KV write budget (§8) first.
4. **The connector is stateless & thin** — no DB, auth, cache, sessions.
5. **Low cost, by the user's call.** The plan is Workers Paid, plus
   Mistral pay-per-call. Respect the budgets in §8 before adding stores,
   watches, pages, lanes or subrequests. Never raise a Mistral cap on your
   own.
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
   the engine never infers intent beyond the user's explicit words.
   **A query-named size is a STRUCTURED term** (HISTORY §35): `queryTokens`
   strips the size expression from the lexical tokens (its normalized
   fragments must never be AND-words), `querySize` reads it, and matchStage
   CAPS results whose parsed size contradicts it at stage 1 — size-less
   results are never demoted. In both mirrors, like everything here.
   **A KNOWN different family caps the stage at 1 in BOTH query shapes**
   (single-word since the Roadmap; multi-word since HISTORY §36's steamer
   fix): full token coverage can be accidental ("ماء أروى 1.5" fully
   matches a food steamer via brand-prefix ارويك + purpose-word ماء +
   capacity digits) — family evidence beats coverage; unknown families are
   never demoted.
   **Stage GRANULARITY is per-perspective** (HISTORY §36): Featured and Best
   value compare exact stages. **The Lowest-price perspective is LOCKED by
   explicit user directive (2026-07-16)**: exactly TWO tiers — genuine
   matches of the queried product ordered by PRICE ALONE ("milk 1 riyal
   comes before milk 3 riyals no matter how identical the 3-riyal milk is
   to the search criteria"), then the related tail. No exactness signal
   (stage 5 vs 4, phrase order, family-confirmation strength) may ever
   split the genuine tier. The tier gate is `isPrimaryPriceTier`
   (featured.js, locked tests in featured.test.mjs). DO NOT change this
   again unless the user explicitly asks.
10. **INTERPRETATION IS SHARED; ONLY DECLARED POLICY DIFFERS** (HISTORY §34).
   Every comparison-shaped feature — Shopping Summary (compare.js), watch
   alerts (monitor.js), /prices statistics (priceHistory.js) — resolves "which
   candidates ARE the queried product" through the mirrors' ONE gate ladder,
   `resolveJourneyPool` (stage band → family → type → fresh-produce). Feature
   differences live ONLY in the `JOURNEY_POLICY` table (summary/alert/
   history tiers: single-word stage banding, dominant-family fallback,
   neverEmpty) plus alert-only extras declared in monitor.js (floor 50, size
   ±25%, flyer name-tier). Tested invariant: alert pool ⊆ summary pool.
   Never add a gate or tweak a threshold in ONE consumer — extend the ladder
   or the table (in BOTH mirrors), or you are re-creating the pre-§34
   accidental divergence this rule exists to prevent.

## 4. Online search stores (7 providers, both repos)

| id | Method | Notes |
|---|---|---|
| `panda` | Public JSON `api.panda.sa` (`products-v3` → `suggestions-v3`) | Emit the **VARIETY id** for result `id` + link — catalogue `product.id` 412s on the product page |
| `tamimi` | ZopSmart JSON (`shop.tamimimarkets.com/api/layout/search`) | Stable, EN/AR |
| `danube` | Spree JSON (`danube.sa/api/products.json`) | 3 tries on transient failures; multi-word **Arabic** queries 422 → provider falls back to the longest single token |
| `lulu` | Akinon list JSON (`gcc.luluhypermarket.com/{en-sa\|ar-sa}/list?…&format=json`) | SAR via pz-locale/pz-currency cookies |
| `amazon` | `pa-api` strategy first (skips while unconfigured) → `search-html` parse of `amazon.sa/s` | **Best-effort.** 5× retry w/ rotating UA (~80%); frontend retries once more (~99% effective). Parser splits the brand `<h2>` from the title `<h2>` (brand-led display name) — `amazon.test.mjs` locks it. Durable fix = PA-API secrets (§9) |
| `noon` | Noon **Minutes** SSR-payload parse (`minutes.noon.com`) | Best-effort; main noon.com blocks datacenter IPs. Minutes left Next.js for **TanStack Start** (2026-08-01): the payload is now a seroval **object literal** (unquoted keys, `$R[n]=` back-refs) inside `<script id="$tsr-stream-barrier">`, never JSON — the old RSC-flight parse silently returned 0 results. `noon.test.mjs` locks it |
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
time: matching-mirror relevance, then the SHARED gate ladder (rule 10,
`resolveJourneyPool` at the 'history' tier: single-word stages 5+4 are ONE
band — word position never splits a series — family/type/fresh gates same as
the Summary, family-less identities KEPT, no family inference for brand-only
queries); grouped per size variant, each with lowest-ever
(price/where/when), highest, latest-per-store, `weeks` depth, `firstSeen`,
`trend`. Under 2 weeks of depth the frontend verdict says **"history is
building"** instead of claiming a record. Guarded `POST
/prices/backfill?store=` re-seeds from offers rows already in D1 (run once
2026-07-04: ~13.6k identities+points from 15.8k offers). Retention:
identities unseen >365 days are pruned with their points.

**Price monitoring** (`monitor.js`, `brochure-engine/PRICE-WATCH.md`): a watch is
ANCHORED in exactly one of two ways, never to a retailer reference —
`registry_product_id` (`pr_`, "THIS product, wherever it is sold") or `spec`
(pinned identity dimensions, "any product of THIS class", e.g.
`{"family":"chicken","cut":"breast"}`). `scope` is `store` (one retailer) or
`market` (all 7 connector stores + current flyer offers). Identity is resolved
ONCE at creation, in the FOREGROUND, by the shared registry resolver
(`identity/verify.js` for strict, `identity/spec.js` for flexible); ambiguity
asks the user and never guesses. Retrieval is still lexical — a query string is
how a store search finds anything — but the DECISION never is. Unknown evidence
ABSTAINS for a strict watch and does NOT satisfy a pin for a flexible one; both
count and report their exclusions. EVERY check writes `last_resolution` +
reason (`checked_at` says a check ran, `resolved_at` says it succeeded), so a
watch that has stopped resolving is visible instead of silently rendering as
"still watching". Alerts fire on a downward **crossing** of the target (re-arms
above); no-data never re-arms. A flyer-side re-evaluation runs on ingest
completion at zero subrequest cost and may only ever improve a watch.
**PROFILE-SCOPED** (Local Profile milestone): every watch belongs to one
browser's local profile (`watches.profile_id`; alerts scope through their
watch). User-facing routes require the profile (`?profile=` / body
`profileId`) — browsers never see or delete each other's watches; the cron
checks ALL profiles' watches (unscoped list). Legacy pre-profile rows
(profile_id NULL) are claimed by the FIRST profile to call GET /watches
(`adoptOrphans`, one-time) — the 19 existing watches are still unowned;
open the app on the MAIN browser first so it inherits them (§11 TODO -1).
Cap: 24 active watches PER PROFILE (`MAX_WATCHES`) + a global backstop of 90
(`MAX_WATCHES_TOTAL`, keeps the daily fan-out ≤31 of the 32-invocation
budget), checked daily in SELF-fan-out batches of 3. Watch API is open but
validated+capped (single-user posture). Push = optional `NTFY_TOPIC` secret
(unset ⇒ in-app only; the ntfy channel is one topic, not per-profile).

**Retention** (`retention.js`, runs after each cron ingest; manual
`POST /prune`): metadata forever; **bytes** deleted once a brochure is
non-current AND expired >28 days (row marked `pruned_at`); ≤250 KV deletes +
≤12 rows per run; offers rows deleted after ~180 days.

**D1 tables:** `brochures`, `price_points`, `offers`, `watches`, `alerts`
(canonical `schema.sql`; past deltas in `migrate-*.sql`, already applied),
plus the NOT-YET-MIGRATED registry set: `offer_enrichments`
(migrate-2026-07-enrichments.sql), `products`/`product_tokens`/
`product_sightings` (migrate-2026-07-registry.sql), and `vision_jobs`
(migrate-2026-07-vision-jobs.sql — Background Manual Vision, §40) — §11 TODO 0.
**PENDING (§44, 2026-07-25):** `migrate-2026-07-25-expanded-extraction.sql` adds
the nullable `offer_enrichments.extraction_json` column for the Expanded JSON
observation. Additive; apply BEFORE deploying the new extraction baseline —
§11 TODO -2.

**Browse** (engine `src/browse/`, BROWSE-DESIGN.md Rev 3): read-only views
over the offers+history substrate, speaking ONLY canonical ids. `taxonomy.js`
(11 depts / ~70 aisles, bilingual, OURS) + `mapping.js` (per-source category →
aisle; unmapped ⇒ visible `other`, read-time so fixes apply retroactively;
plus the **fresh→frozen refinement**: `FRESH_TO_FROZEN` + the frozen mark —
مجمد/frozen words OR a processed-form term (`PROCESSED_MARK_TERMS`: ناجت/
نقانق/برجر/ستربس/بوب كورن/بقسماط/… gated by `FRESH_GUARD_TERMS` طازج/بوتشر) —
reroute D4D's frozen-filed-as-fresh rows, applied identically in cards, tile
counts, and the SQL prefilters' `frozen: exclude|only` include modes; the SQL
twin is GENERATED from the same exported term lists over a NULL-coalesced
name pair — never hand-write it, and never compare NULLable columns in a
NOT-context (the §38 produce-vanishing bug)) + `brands.js` (canonical brand KB ~100 entries + OCR-repair detection;
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

**Vision enrichment + Product Registry** (engine `src/offers/enrich.js`,
`src/registry/`; designs `IDENTITY-V2.md` + `REGISTRY-DESIGN.md`, both in the
engine repo — every change must cite a design section). Enrichment reads each
offer's own flyer crop with Mistral vision (`MISTRAL_API_KEY` secret; absent ⇒
whole feature inert, fail-soft) into the `offer_enrichments` side-car; gate on
`corroboration()` ONLY (model confidence is measured-useless). Vision extracts
literally, the Registry normalizes — extraction never rewrites, translates or
"improves" what the crop prints.
**FROZEN production extraction baseline (§43 decision, §44 integration,
2026-07-25) — this is what the code runs:** `ministral-14b-2512`
(since 2026-09-24; the baseline was validated on `mistral-medium-latest`) +
the **Verbatim Prompt** (`VISION_PROMPT`, sha256 `e643b2a1…`, asserted by
`enrich.test.mjs` against the benchmark's own frozen file) + Expanded JSON (11
fields) + temperature 0 / top_p 1 / reasoning `none` / `json_object`, one request
per crop, no OCR. Frozen record:
`brochure-engine/benchmarks/mistral-medium-production-validation-50-2026-07-25/PRODUCTION-PROMPT.md`;
the code's own copy of the settings is `PRODUCTION_EXTRACTION_BASELINE`.
⚠️ **PROMPT OPTIMIZATION IS CLOSED** — do not edit, reflow, merge or experiment
against that prompt without an explicit request; replacing it needs a larger
production validation plus an explicit decision. **Quality improvements now
belong DOWNSTREAM of extraction** (brand lexicon, phrase lexicon,
canonicalization, product identity, search), never in the prompt.

**Vision model: ONE model, `ministral-14b-2512`, for every Mistral use**
(user directive 2026-09-24, commit `8985bc9`; HISTORY §54). Medium and Small
are retired. Their tier keys in `src/offers/visionModel.js` still resolve, so
stored selections and the Ops Vision Model selector keep working, but every
tier puts the same model on the wire. Every Mistral secret feeds one shared key
pool (§9).

⚠️ **NEVER SWITCH MODELS AUTOMATICALLY.** No size gate, no cost router, no
small-first-then-escalate. That design was measured and REJECTED (§46,
`benchmarks/small-first-routing-30-2026-07-25`):
- 0% escalation, because no validator has coverage;
- a 16.7% defect rate for the 91% saving.

Every stored row and every ops audit row records the model that produced
it. Future model comparisons must use identical prompts, samples, scoring
and methodology.
Tests: `node src/offers/visionModel.test.mjs`.
**Expanded JSON mapping (§44):** `smartExtraction.js`
`OBSERVATION_FIELD_ALIASES`/`readObservationField` read `size` ← `size` |
`package_size` and `pack_count` ← `pack_count` | `packCount` | `quantity`, legacy
key first — no validation rule changed. `unit`, `package_type`, `attributes` (and
the verbatim pre-validation names/size) are preserved in
`offer_enrichments.extraction_json`; nothing reads it yet.

**Brand Lexicon (§45, engine `src/lexicon/brands.js`)** — the first downstream
layer, scoped to ONE field. `resolveBrand(observed)` is a pure alias → canonical
lookup (a `Map` built once at load, 299 keys / 98 brands) returning
`{ observed_brand, brand_id, canonical_brand, display_en, display_ar,
matched_alias, status, lexicon_version }`. **No LLM, no embedding, no fuzzy
repair — exact key or nothing**; an unknown brand returns `brand_id: null` with
`canonical_brand` = the observation unchanged (failure mode: "no brand", never
"wrong brand"). `brand_id` IS the Browse slug and the canonical names come from
`browse/brands.js` `BRANDS` — ONE brand namespace, not two; the lexicon owns only
the variants (`BRAND_ALIASES`). The fold already collapses case, ®/™, Latin
accents, Arabic letter variants and (via a second space-free pass) `Al Marai`↔
`Almarai`, so **add an alias only for what the fold cannot reach** (word order,
dropped conjunction, different transliteration, company suffix). Adding a whole
new BRAND means editing `BRANDS`, which also feeds `detectBrand()` — inherit its
precision guards (`depts`, VETO_PREV/VETO_NEXT, `noStrip`). Two ids claiming one
key are recorded in `BRAND_ALIAS_COLLISIONS` and fail the tests, never silently
shadow. ⚠️ Trademark marks are stripped BEFORE NFKC on purpose (NFKC turns `™`
into the letters `TM`). **Nothing is persisted and no migration exists:**
resolution is pure, so `brand_id` is derivable from the stored `brand` column on
read; `enrich.js` attaches it additively (`brandIdentity` / `brand_identity`) and
`enrichStore` binds columns explicitly, so it never reaches D1. Tests:
`node src/lexicon/brands.test.mjs`.
**Shopping Lexicon + Structured Product + Arabic Builder (§47, engine
`src/lexicon/shopping.js`, `packageSize.js`, `structuredProduct.js`,
`arabicBuilder.js`)** — the second downstream layer, and the phase where
**ENGLISH became the primary source of truth** (measured 2026-07-26: a usable
English name is present on 99% of production observations, 990/1000). The
Arabic product name is now GENERATED from the English structure; the observed
Arabic OCR text is a FALLBACK source only. Pipeline: Vision → English name →
Brand Lexicon → Shopping Lexicon → Package Size Parser → Descriptor Parser →
Structured Product → Arabic Builder.
**The head-noun rule:** category = *longest phrase wins, ties break RIGHTMOST*
("Chocolate Milk" is milk, "Milk Chocolate" is chocolate). Phrase-level ON
PURPOSE — `matching.js productFamily()` is single-token and measurably wrong on
English names ("Ice Cream" → the dairy `cream` family), and it is a MIRRORED
file, so it was left untouched. Brand and size tokens are removed BEFORE the
head noun is chosen. **The head-final guard:** a matched category with ≥2
unknown content words still AFTER it is refused — found by measurement
("Milk/Wheat Rusk" built as حليب), costs 3.4 points of coverage, prevents the
"wrong category" failure the layer exists for. Every category carries the
matching mirror's `family` id and a Browse `aisle` id — ONE namespace, asserted
by test, same discipline as §45's `brand_id` = Browse slug.
**The Arabic name is a PRESENTATION layer (user directive 2026-07-26):** the
structured ENGLISH record stays authoritative for identity/search/matching, and
anything with no Arabic term is DROPPED, never transliterated or left in Latin
(measured: 100% of built names are Latin-free). No category ⇒ NO built name ⇒
caller falls back to the observed Arabic. `packageSize.js` renders the size the
flyer PRINTED (1 لتر, not 1000 مل) while carrying `parseSize()`'s output verbatim
as `canonical` — still exactly one size interpretation project-wide; it honours
parseSize's `count-weak` trust marker, without which the model code NRF110N26S
becomes a 26-piece pack. §44's preserved `package_type`/`attributes` finally
have a reader here.
⚠️ **ADDITIVE, UNPERSISTED, NOT SWITCHED ON.** `enrich.js` attaches
`structured_product`/`arabic_name` beside `brand_identity`; `enrichStore` binds
columns explicitly so none of it reaches D1 (no column, no migration).
`applyEnrichment()` still serves the observed `name_ar`. The built name becomes
the default display only after its quality is validated on real rows (§11 TODO
-2b). Standing measurement: `node validation/shopping-lexicon-coverage.mjs`
(also prints the ranked vocabulary backlog). Tests:
`node src/lexicon/shopping.test.mjs`, `packageSize.test.mjs`,
`structuredProduct.test.mjs`.
**Comparable Quantity v4 + Price Basis (§50, engine
`src/lexicon/comparableQuantity.js` + `priceBasis.js`, frontend mirror
`src/priceBasis.js`)** — the layer that answers **what is this price's
denominator?**, and the fix for the single most valuable missing field. Saudi
flyers price two ways: PACK ("HALLOUMI 200 g — 12.95", the price OF the package)
and BASIS ("APPLE ROYAL GALA — PER KG — 7.99", the price PER unit). Only the
first was modelled, so every unit price was a DIVISION by a package size — and
for a per-kilo product, where the printed price already IS the unit price, the
parser found no magnitude in `"Per Kg"` and the field came back null. Measured
before the fix on 43,854 enriched offers: **12,011 with no unit price, 4,747
REJECTED outright** by the acceptance gate on `comparable_quantity`, and **144
served a unit price wrong by 30–320×** (a fish grade, `Sea Bream 200-300 /Kg`,
parsed as a 300 kg package).

**THREE ORTHOGONAL FACTS, and nothing encoded twice.** The projection returns:

```js
reference:   { quantity, unit } | null   // THE DENOMINATOR — the only input to a unit price
sellingMode: 'discrete' | 'continuous' | null
evidence:    'measure' | 'count' | 'price_basis' | 'container' | 'unit' | 'contradicted'
```

`unitPrice = price / reference.quantity`, for every product, with **no branch**.
A reference quantity asserts nothing about packaging or about how much the
shopper buys: a 1.7 kg bag has a 1.7 kg reference and a DISCRETE selling mode;
loose potatoes at 4 SAR/kg have a 1 kg reference and a CONTINUOUS one. It reads
`canonical` (parseSize) rather than the printed magnitude — same arithmetic the
engine already served, and correct on bonus packs, where `10 + 2 rolls` prints
as 2 and canonicalises to 12 (661 rows differ). `unitPriceComparable` is DERIVED
from `reference != null` and can no longer contradict the pricer, which it used
to: a `40's` pack claimed arithmetic was possible while the pricing function
refused it as a weak count.

⚠️ **An earlier draft modelled this as a second PRICING MODE** (`per_pack` /
`per_unit`) and was replaced before shipping. Both branches reduce to one
division once the quantity is in the comparison unit, and the mode framing had
already produced a defect: `quantityForOffer` scaled the price by a multi-buy
while refusing to scale a stated denominator, so "buy 2 get 1" on a per-kilo
product reported **8.00 SAR/kg against an undiscounted 4.00**. Do not reintroduce
a per-unit arithmetic branch.

⚠️ **`sellingMode` is TWO values, not four.** Measured: `weight` occurred with a
kilogram reference 1,880/1,880 times and `volume` with a litre reference 2/2 —
they ARE `reference.unit` restated. Only discrete/continuous spreads across every
unit. Whether a discrete thing is a bag or a bare piece is `package_type`'s
question: **"Garlic Bag Small /Pc" is a live offer that is a BAG priced PER
PIECE.**

⚠️ **REFUSE RATHER THAN GUESS (user directive 2026-08-02):** *"A missing unit
price is recoverable. A fabricated unit price damages trust."* When a stated
basis and a printed magnitude come from DIFFERENT fields and DISAGREE, the
product is admitted and `evidence` is `contradicted` with **no reference** — 57
live offers. Measured on the 65 where the two rules differ, preferring the
package is right 40 / wrong 22 and preferring the basis inverts that; both ship a
wrong SAR/kg on a third (`Pears Rosemary Per KG` at 1.00 because its `10 KG` is a
PURCHASE LIMIT). **Agreement is not contradiction** — 204 of 261 non-same-field
pairs agree (`BLACK CHANA /KG` + `size: "1 kg"` is one fact stated twice) and
must NOT be refused; the tolerance is the 3% `matching.js sizeContradicts()`
already uses. `contradicted` is a recorded value, not a silent null, so the
backlog stays countable in `acceptanceSummary`.

⚠️ **The classifier is an ALLOW-LIST and must stay one.** The production `unit`
field also holds `SAR`, `AED`, `watts`, `mah`, `oz`, `btu`, `sqft`, `inch`; a
permissive reader emits `SAR/SAR` and `SAR/watt` on shopper cards. Bare `g`,
`ml`, `gm`, `l` are SIZE units, never a per-gram price. A bare unit word
(`SALMON FILLET KG`, `unit: "KG"`) stands down the moment `parsePackageSize()`
reports a magnitude — without that, 19 live offers including `AL OSRA SUGAR
10KG` flip to a per-kilo price they do not have. A basis displaces a magnitude
ONLY when both came from the same expression (`CASHEW W 320 /KG` +
`size: "320 /KG"`).

**Parser consistency (same increment, measured separately):**
`parsePackageSize` was refusing spellings `matching.js unitFor()` has always
accepted — `450 غ`, `700 GRM`, `360ml×24`, `٤٠٠ جرام*٢` — so the PRINTED and
COMPARISON readers disagreed about whether a size EXISTS. The multiplier cases
were a `(?![a-z])` guard on `MEASURE_PACK_RE`: `foldSizeText` turns `×`/`*` into
the ASCII letter `x`. Removed there only; kept on the plain measure. A test pins
the invariant.

**The read contract carries the answer.** `applyEnrichment()` derives
`offer.unitPrice { value, unit, source: 'printed'|'derived' }`,
`offer.priceBasis`, `offer.sellingMode` and `offer.size` from the SAME projection
the gate uses. Derived on read like `brand_id` — **no column, no migration.**
`enrichStore.reconcilePriceBasisAcceptance()` re-judges stale Recovery rows at
zero model cost, resolving ONLY rows whose comparable quantity is a price basis.
Gate `business-acceptance-v3`, projection `comparable-quantity-v4` (R3 bumps;
`quantity_basis` values are unchanged, hence no migration).

Measured: unit price on the wire **46.2% → ~76%**, 186 values corrected, **808
rejected offers flip to accepted** across 12+ categories (meat 115, fruit 113,
fish 96, cheese 89, vegetables 75, canned 45, dates 44, pulses 33, deli 26) —
system-level by construction, not a Fresh patch. The two final changes attributed
independently: refusal = 57 withdrawn / 0 gained / 0 values changed / 0
acceptance changes; parser = 0 withdrawn / 26 gained / 0 changed / +104
acceptance, all `ABSENT → RESOLVED`.

⚠️ **KNOWN RESIDUAL**, documented in `packageSize.js`: a grade range carrying its
own unit with no marker beside it (`SHRIMP 50 / 60 KG`) still parses as a
magnitude. The guard was built, measured at 2 fixes / 2 regressions
(`Ethiopian Lamb Whole (7 - 9 Kg)` is a real item weight) and **withdrawn** — do
not rebuild it without new evidence.

⚠️ **ONE DELIBERATE MIRROR DIVERGENCE**, asserted in both test files: the client
refuses `Sea Bream 200-300 /Kg` where the engine resolves it, because `parseSize`
records no field provenance and cannot apply the same-field rule. Safe direction;
flyer offers are unaffected because the engine's answer wins at rung 1 of
`match.js unitPrice`. Tests: `node src/lexicon/priceBasis.test.mjs`,
`comparableQuantity.test.mjs`, `packageSize.test.mjs`, `src/enrich.test.mjs`;
frontend `node src/match.test.mjs`.
⚠️ **Prices are observed but QUARANTINED:** `preservedObservation()` strips
`current_price`/`old_price` from every servable write, because the measured
current-price ROLE INVERSION (2/50 crops, 0.99+ self-confidence, both prompts)
makes a **deterministic price guard mandatory before any extracted price may
reach a shopper** — and it is not built yet (§11 TODO). The full reply, prices
included, stays auditable per offer in `offer_extraction_attempts.output`.
**Resilient drain** (§40): a per-offer crop/parse error is skipped and the batch
CONTINUES (only an auth/rate/transient WALL stops it); `maxRateRetries` 3 and
`withFailover` honors `Retry-After`; 429 rate-limit headers are captured
(`readRateLimit` → `report.providerLimit`) and surfaced in the Ops Center (the
free-tier quota is account-specific/unpublished — Mistral Admin Console → Limits).
**Background Manual Vision** (§40): Ops "Run Vision (background)" arms a durable
`vision_jobs` row (`storage/visionJobStore.js`) and a self-continuing
`POST /enrich/step` chain (re-dispatches via SELF inside `execCtx.waitUntil`) that
drains to empty server-side — browser can close; routes `vision/start|stop|job`.
**Key failover** (`src/offers/mistralKeys.js`, one shared primitive every caller
composes; policy = ACTIVE failover on rate limit, updated 2026-07-19 per user
request, superseding the old cold-standby "wait on the same key first" rule): a
chain over `MISTRAL_API_KEY` then optional `MISTRAL_API_KEY_BACKUP` in the Worker
(**both set in production 2026-07-19**), `.mistral.key` then `.mistral.key.backup`
locally (`local-secrets.mjs`, walks up dirs; env overrides file). One key at a
time (never parallel quota), primary-preferred. Auth failure retires a key for
the run; a **429 PARKS the key (Retry-After window) and the next usable key is
tried IMMEDIATELY — before any wait**; the runner SLEEPS only when EVERY key is
dead/parked, then resumes at the soonest window (honors `Retry-After`), bounded
by `maxRateRetries` wait-cycles. Single-key config is backward compatible (429 is
waited out then retried). 5xx/crop errors never park/retire a key; every switch
is logged; `drainEnrichment` surfaces
`failedOver`. Single-key config = today's exact behavior. The REGISTRY is
identity by ASSIGNMENT: opaque `pr_` products minted once, sightings
(`product_sightings`, offer-PK idempotent) attach with tolerant token-profile
matching (attach/review/create bands; review attaches but never teaches;
create-on-doubt — P1 prefers false splits). Resolution runs inside the enrich
drain + `POST /resolve`; verdicts stamp `offer_enrichments.mint_verdict`
(incl. `or_deal` — bare او/or two-product tiles, vision-names-only detection;
its live fire rate in `/registry/stats` is the lock measurement). Lifecycle
(`registry/lifecycle.js`, weekly Monday cron duty + `POST /registry/maintain`):
§5.1 dormancy sweep (6 weeks; dormant stays matchable and reactivates),
§5.4 conservative auto-merge (bar strictly above attach + brand-conflict veto
+ shared-store-or-same-size requirement; tombstones single-hop; sightings
never rewritten — reversible; log = ops audit rows), dangling-sighting
healing. Splits are HUMAN-gated: `GET/POST /registry/review` (guarded) with
`clear_flag` / `reassign` / `split` actions. **VISION IS CANONICAL
(2026-07-21, permanent directive):** the old A/B switch (`SEARCH_PIPELINE`
var, `?pipeline=`, `/compare`, `/__compare`, frontend devCompare) is REMOVED.
One path everywhere: the servable gate is defined exactly once —
`offers/enrich.js servable()` (JS) + `storage/enrichStore.js SERVABLE_SQL` /
`CANON_*_SQL` fragments (its SQL twin, both from `CORROBORATION_FLOOR`) — and
every feature consumes it: `/offers` retrieval+overlay (rows carry `e_*` cols;
`applyEnrichment()` is the ONLY overlay), Watches (`monitor.js` uses the same
`applyEnrichment`), Browse (`browseStore.js` canonical-name COALESCE incl.
`FROZEN_MARK_SQL`), `/prices`+`/lowest` registry-first (V1 OCR-history doc
serves only when the registry doc is empty — a temporary depth bridge).
No feature may implement its own corroboration or fallback logic.
Watches gained kind `registry` (`productId: pr_…`, sighting-precision, D1-only
checks). Calibration (`calibrate-registry.mjs` + `src/registry/calibrate.js`):
export → label pairs (`calibration/labeling.html`) → replay/sweep against the
§8 ship gate (attach ≥95%, false-attach ≤0.5%) — the permanent regression
corpus for every resolver/model change. Tests: `node src/registry/*.test.mjs` +
`src/enrich.test.mjs`, all offline.

**API:** public reads `GET /` (health), `/brochures[?store=&region=]`,
`/brochures/history`, `/brochures/hotspots?id=`, `/asset/<key>`,
`/offers?q=` (vision-canonical), `/browse` (market floor, edge-cached 1h),
`/browse/offers?dept=|aisle=|brand=|rail=|store=&sort=`,
`/lowest?q=`, `/prices?q=` (legacy `product=` maps to q; registry-first,
V1 fallback), `/registry/stats`,
`/watches?profile=`, `/alerts?profile=[&unseen=1]`;
open writes `POST /watches` (body carries `profileId`),
`DELETE /watches?id=&profile=`, `POST /alerts/seen?profile=`;
guarded by `X-Ingest-Secret`: `POST /ingest?store=`, `/prices/backfill[?store=]`,
`/watches/check`, `/prune`, `/enrich`, `/enrich/step` (Background Manual Vision
hop), `/resolve`, `/registry/maintain`, `GET/POST /registry/review`. CORS open
(incl. DELETE).

## 6. Frontend map (no build step; `index.html` + `styles.css` + `src/`)

| File | Responsibility |
|---|---|
| `core.js` | Store-agnostic Core; adaptive strategy memory (localStorage) |
| `providers/*.js` | Thin per-store strategies calling the connector (`CONNECTOR_BASE`) |
| `app.js` | Hash router (`#/search` `#/brochures` `#/alerts` `#/cart`), search orchestration, honest filtering (irrelevant dropped + counted), persisted prefs (`lsa.app.rank`, store scope, recents), `OFFERS_FETCH_LIMIT=120`, cart nav badge |
| `match.js` | **Matching mirror** (rule 2): normalize, synonyms, families (3 tiers: derived > base > produce — fresh-produce nouns are flavour/ingredient modifiers, so "حليب فراولة"/"Strawberry Milk" stay milk), types, `parseSize` (w/ `src` count-trust marker), **`querySize`/`queryTokens`** (size-aware queries, rule 9), relevance, `sameProduct` equivalence, `matchStage`/`queryTokenPresence` (Search-Roadmap stages + SIZE CAP, rule 9 — directional flavour markers: Arabic بنكهة/بطعم/برائحة precede the flavour word, English flavoured/scented follow it), **`JOURNEY_POLICY` + `resolveJourneyPool`** (rule 10 — the shared gate ladder every comparison-shaped feature runs) |
| `compare.js` | Comparison engine: bilingual flyer listings, **the SHARED gate ladder at the 'summary' tier** (rules 9+10 — stage band → family → type → fresh, excluded counts surfaced), coverage admission, **product-identity lock** (Summary-only policy: anchor = highest-relevance listing; others must cover ⊇ its matched query tokens), best-value w/ median outlier guard, per-variant history verdict |
| `summary.js` | Renders the comparison model for SHOPPERS (HISTORY §35): image + dense headline line (price · unit · store · size), Add-to-cart + Watch actions in the header, history verdict w/ dated Other Sizes, ONE muted footer meta line (coverage · range · excluded count w/ tooltip breakdown) |
| `marketplace.js` | Unified grid (online + flyer cards, store badges, per-card Add-to-Cart on BOTH sources + watch bell on online), sources strip, THREE sort perspectives — Lowest price / Best value / **Featured** — ordered Roadmap stage (rule 9; Lowest price at 'primary' stageBand granularity) → family band → perspective key (price asc / unit value within dominant unit family / featuredScore); card clicks feed Featured's learning (`recordChoice`); card unit-price labels suppressed for >6×-off-median outliers |
| `featured.js` | The Featured intelligence layer (HISTORY §36, frontend-only — a grid perspective, NOT matching, so nothing to mirror): category-aware curated signal KB (per-category weights; a signal absent from a category contributes nothing), expected-price soft penalty (median of primary matches, free zone 0.5×–2×, capped — never a filter), small deal signal, and bounded localStorage learning (`lsa.featured.learn.v1`, family-keyed so both languages learn together, `b:<brand>` dynamic ids; ranking-only, never touches product data). All boosts bounded by construction. ⚠️ محلى (sweetened) is dropped RAW pre-normalization — the ى→ي fold would read it as محلي 'local' |
| `brochure.js` | **The only engine client** (rule 7): all engine URLs/maps/readers/watch+alert clients, `loadHotspots`, `loadBrowseSummary`/`browseOffers`, `cleanOfferName` (leading OCR-banner trim); never throws |
| `browsePage.js` | Browse pillar UI (`#/browse[/dept\|aisle\|brand\|brands\|rail/...]`): market floor (dept tiles + brand pills as EQUAL peers, then Biggest Drops + Lowest Ever rails — V1.1 keeps only these two), listings w/ aisle chips + sorts (discount/price) + store filter + paging; **brand pages** open on an identity hero (deterministic monogram, bilingual name, offers·stores) + engine-fed product-family chips. Composes marketplace's EXPORTED card primitives + `openFlyerOffer` — one card idiom, one tap-through (viewer deep-link w/ sheet) app-wide |
| `brochures.js` | Brochures page (per-store sections, active/expired cards, covers) |
| `viewer.js` | In-app viewer: swipe, zoom (buttons + **pinch + double-tap**, focal-point anchored via `zoomAt`), preload, focus trap, PDF branch, `targetPageId`/`targetPageIndex` deep-jumps; **hotspot overlay** (page image in a JS-sized `.bv-imgwrap`, % boxes track zoom) + **product sheet** (crop, price, Add to Cart, similar-offers strip via `searchOffers`; scrim tap / swipe-down / Esc dismiss). Sheet hero + cart thumbnail are **SELF-HOSTED crops** from the STORED page image via the tapped spot's bbox (`cropFromPage`: canvas + `crossOrigin` on the CORS-open /asset → data-URL); D4D's CDN crop (`offer.imageUrl`) is only a fallback when no geometry is at hand (similar-strip, marketplace). ⚠️ `.ps-sheet` centering is margin-based on purpose — `fade-up`'s `both` fill overwrites transform-based centering |
| `cart.js` | localStorage cart (`lsa.cart.v1`), qty/remove/clear, `CART_EVENT` |
| `cartPage.js` | Cart page: per-store groups + subtotals, qty steppers, View flyer (re-opens viewer on the item's page) |
| `alertsPage.js` | Alerts page + shared watch dialog + nav badge |
| `profile.js` | Local profile (`lsa.profile.v1`): silent per-browser identity created at boot, owns ALL user `lsa.*` data (adopted in place, no key renames); `profileGet/profileSet` JSON slots (`lsa.profile.data.*`) for future personalization |
| `server.js` (root) | Zero-dependency local static server → http://localhost:5173 |

Tests: `node src/match.test.mjs`, `node src/compare.test.mjs`,
`node src/featured.test.mjs`, `node src/profile.test.mjs` (pure, offline).
Cross-page coupling is one `supersearch:search-store` CustomEvent. Theme is
CSS-variable driven (`--brand` blue `#2563eb`, light+dark).

## 7. Crons & scheduling (engine `wrangler.toml`)

There are five triggers. Five was the Free-plan limit that shaped this
design; Paid allows more, but the multiplexed minute tick works and stays.
`scheduled()` branches on `event.cron`, and the minute tick runs everything
else by checking the clock.

⚠️ **Cron events are delivered at least once.** On 2026-10-08, duplicates
of the same fire arrived about a minute apart. So every drain takes a D1
lease before it reads anything:
`createD1VisionJobStore(db, { id }).ensureRunning()` → `tryLease()`, then
release it with `update({ lease_until: null })`. Lease ids in use:
`steady-vision`, `steady-verification`, `daily-digest`, `d1-backup`, plus
the Background Vision job's own.

| Trigger | What runs |
|---|---|
| `0 6 * * 2,3,5` | The brochure/offers pipeline. One SELF child per store runs brochures → offers → price-history harvest, then the coordinator prunes. Tue/Wed catch the Saudi weekly drop; Fri catches the weekend flyers. |
| `*/2 * * * *` | Resumes D4D brochure collection for stores still pending. The Ops **Run All** button hands off to this cron too (HISTORY §55). |
| `45 5 * * *` | Monday registry maintenance: dormancy, consolidation, healing. Does nothing on other days. |
| `10,30,50 * * * *` | Vision Stage 1 (`runSteadyStateVision`). See the walkthrough below. |
| `* * * * *` | Everything else, by clock. See the list below. |

**Stage 1 walkthrough** (`10,30,50` and the minute tick at :00/:20/:40):
1. Yield to a running Background Vision job.
2. Take the `steady-vision` lease.
3. Take up to 112 offers from `listDebris`, soonest-expiring first.
4. Deal them into `STAGE_ONE_LANES` = 3 parallel lanes of 15-offer SELF
   children (`runDrainLanes`, scheduler.js).
5. Run detached resolution.

An empty queue runs the daily resolution pass instead.

**The minute tick:**
- **Stage 1 again at :00/:20/:40,** giving 6 fires an hour. Skipped on the
  03:00 retention tick.
- **Stage 2 verification at :05/:25/:45.** Lease `steady-verification`,
  `STAGE_TWO_LANES` = 2.
- **A running Background Vision job** (`vision_jobs`): lanes, plus a lease
  of `VISION_LEASE_MS`.
- **Price-fallback lanes:** unpriced D4D products → Ministral, keeping a
  per-key reserve so the other callers are never starved.
- **Price Watch rounds** at 07:00/19:00 Riyadh, plus one-minute retries.
- **D1 retention** at 03:00 UTC.
- **Health digest** at 05:00 UTC (lease `daily-digest`).
- **Weekly D1 export,** starting Sunday 02:00 UTC. It writes 12 parts a
  minute until done (about 25 minutes; lease `d1-backup`).

**Throughput.** The Stage 1 ceiling is 6 × 112 ≈ 670 offers an hour. The
real limit is Mistral: 2 keys × 30 requests per fixed wall-clock minute,
shared by Stage 1, Stage 2 and the price fallback. When every key is
parked, `withFailover` waits up to two minute-cycles and then throws. The
lane stops there, and its offers stay unread for the next fire (a provider
failure writes no receipt). Vision is an INGESTION step: no reuse or cache
gates in front of it (user directive).

**On demand:**
- `POST /ingest?store=<id>`, the same path the fan-out hits.
- In `/__ops`: the Vision Drain and Background Vision start/stop buttons.
- `GET /__ops/api/digest` previews today's digest.
  `POST /__ops/api/digest {"confirm":true}` sends it now.

## 8. Per-invocation budgets (re-do this math before adding stores/watches)

- **Workers Paid:**
  - 10,000 subrequests per invocation. D1 and R2 calls count.
  - `cpu_ms = 300000` (5 minutes, set in wrangler.toml).
  - Measured CPU on every path was under 2.1 s (2026-09-30, HISTORY §55).
- **D1 binds at most 100 parameters per statement.** Chunk every batch
  (HISTORY §50).
- **The real ceiling is Mistral, not Cloudflare:** 30 requests per key per
  wall-clock minute. Every Vision lane, Stage 2 and the price fallback draw
  on the same key pool, so adding lanes past the key budget only parks
  more calls.
- **Each ingest child stays lean by design:**
  - 1 store page;
  - ≤6 leaflet fetches (`maxCandidates`);
  - ≤36 page images (`maxTotalPages`);
  - ~4 offers POSTs.

  ⚠️ `maxPages` must never exceed `maxTotalPages`, or the flyer starves
  forever.
- **KV:** keep the checksum dedupe. With it, an unchanged flyer costs zero
  writes.
- **Grocery watch:** about 7 subrequests. Flyer candidates cost nothing
  (they are already in D1).

## 9. Deploy, verify, develop

**Frontend:** push to `main` → GitHub Pages (~1–2 min + CDN). Verify with a
cache-buster: `curl ".../src/app.js?cb=$RANDOM"` — CDN `max-age=600`, so a
stale spot-check within 10 min of a push is normal, not a failed deploy. The
Pages metadata API 404s unauthenticated — also normal. Local: `node server.js`.

**Engine:** `node deploy.mjs` (same as `npm run deploy`), run from
`brochure-engine/`, is the ONLY way to deploy production. It:
1. refuses a dirty tree, or anything other than a pushed `main`;
2. runs the whole suite;
3. deploys with the local wrangler (`--env=""`);
4. stamps the version message with the commit SHA and subject, so
   `wrangler deployments list` names the running code.

Production was deployed twice from uncommitted trees in September; this
script exists so that never happens again. Flags: `--staging` deploys
`brochure-engine-staging`; `--check` runs the gates only. Rollback:
`npx wrangler rollback <version>`.

The connector still deploys with `npx wrangler deploy` from
`serverless-connector/`.

**Schema changes:** write the canonical `schema.sql` plus a `migrate-*.sql`
delta. Apply the delta BEFORE the deploy that needs it:
`node node_modules/wrangler/bin/wrangler.js d1 execute brochure-engine --remote --env="" --file=…`

**CI:** `.github/workflows/tests.yml` in both repos runs on every push and
pull request. The `shopping-connector` repo runs the engine's
`node run-tests.mjs` and every connector `src/**/*.test.mjs`. The frontend
runs every `src/**/*.test.mjs`. A red run on `main` means stop and fix it
first.

**Matcher mirrors:** `src/matcherParity.vectors.json` is byte-identical in
both repos. Each repo's `matcherParity.test.mjs` runs its own mirror against
it: 7,207 cases on real flyer names, with 46 known divergences stored as
`{ $diverge: { frontend, engine } }` so they cannot drift further.

After a deliberate change to BOTH mirrors, from `brochure-engine/`:
`node matcher-parity.mjs ../../live-shopping-assistant/src/match.js --write`
then
`cp src/matcherParity.vectors.json ../../live-shopping-assistant/src/`.

**Backups:**
- **D1 Time Travel** restores any minute of the last 30 days.
- **The weekly R2 export** (`backups/d1/<YYYY-MM-DD>/`, newest 8 complete
  sets kept) covers anything older, or losing the database entirely.
  `node restore-d1-backup.mjs <YYYY-MM-DD> <out-dir>` writes `restore.sql`
  for an EMPTY database. Rebuild the FTS index afterwards with the
  `migrate-2026-08-25-price-identity-fts-1/-2.sql` migrations.
- The export is a rolling copy, not a point-in-time snapshot.
Local: connector `node dev.mjs` (:8787); engine `node dev.mjs` /
`node dev.mjs selftest [store] | pricetest | offerstest | watchtest`
(selftest includes live D4D legs). Connector tests:
`node src/providers/amazon.test.mjs`, `node src/providers/panda.test.mjs`.

**Secrets** (per Worker, `npx wrangler secret put <NAME>`):
- `INGEST_SECRET` (engine) — guards ingest/check/prune/resolve/watch routes.
  **`serverless-connector/brochure-engine/.ingest.secret` is the CANONICAL
  LOCAL CACHE of the current production value.** It is gitignored (`*.secret`)
  and must never be committed. `local-secrets.mjs` reads it, and the same value
  is in the `PRODUCTION_INGEST_SECRET` user environment variable for
  `deploy-registry.ps1`.

  **Whenever this secret is rotated, refresh all three together** — write the
  new value to `.ingest.secret` FIRST, then rotate production *from that file*
  so they cannot diverge, then update the env var:

  ```
  node -e "require('fs').writeFileSync('.ingest.secret',require('crypto').randomBytes(48).toString('base64url'))"
  cat .ingest.secret | npx wrangler secret put INGEST_SECRET
  # PowerShell: [Environment]::SetEnvironmentVariable('PRODUCTION_INGEST_SECRET',(Get-Content -Raw .ingest.secret).Trim(),'User')
  ```

  Rotation is safe: nothing outside the Worker's own `env` consumes it (no CI,
  no frontend, no other service), and the cron fan-out reads the same binding
  its receiving routes compare against, so sender and receiver rotate together.
  Avoid rotating within a minute of 05:45 UTC or 06:00 UTC Tue/Wed/Fri. Allow
  ~1–2 minutes for edge propagation — a stale colo returns 403 briefly.

  With this in place a maintenance session should never need to ask for the
  secret again unless it has been deliberately rotated.
- `NTFY_TOPIC` (engine) — **SET 2026-10-08.** It carries price-watch alerts
  and the daily health digest. Its value is cached locally in
  `C:\Users\majed\Desktop\claude\.ntfy.topic`, outside both repos; never
  commit it. To receive pushes, the user subscribes to that topic in the
  ntfy app.
- `OPS_TOKEN` (engine) guards `/__ops`.
- **Mistral keys** (`MINISTRAL_14B_API_KEY_1/_2` and the older
  `MISTRAL_*` names) all feed ONE pool through `buildMistralPools`.
  ⚠️ A secret does nothing unless `buildMistralPools` reads it. The Ops
  Keys panel shows which keys are live: 2 on 2026-10-08, the rest
  budget-exhausted.
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
- **Never let a size expression become lexical query tokens.** normalization
  shreds "1.5L" into `1` + `5l`, and every AND-semantics gate then kills any
  other spelling of the same size — the "Water has history, Arwa Water 1.5L
  has none" bug (HISTORY §35). Query-side tokenization MUST go through
  `queryTokens` (both mirrors), never `normalizeText(q).split()`.
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
  won't re-find their product; re-create them. (Ordinary catalog-id rotation
  no longer needs this: since 2026-07-28 a product watch re-anchors on its
  stable identity and rewrites the cached id itself.)
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

**Closed since July** (each checked against production on 2026-10-08; the
runbooks are in git history and HISTORY):

| Old TODO | Status |
|---|---|
| -3, product-anchored Price Watch | The migration ran. All 7 watches are profile-owned, and none is `pending-migration`. |
| -2, frozen extraction baseline | Superseded by the single-model switch to `ministral-14b-2512` (HISTORY §54). Every read since 2026-10-01 used that model. |
| -2b, built Arabic name as display | Armed 2026-07-30, then replaced the same day by the USER VERDICT: serve the model's own Arabic, cleaned subtractively, with the brand appended (`lexicon/observedArabic.js`, commit `41f4387`). `built_arabic` is still persisted for diagnostics, but nothing serves it. |
| -1, legacy watch adoption | Done: 0 unowned watches. |
| 0 / 0b, Vision+Registry deploy and V1.1 brand re-stamp | Done. |
| 3, phone push | `NTFY_TOPIC` is set (§9). |
| 5, stale README/CHANGELOG | Refreshed 2026-10-08. |

**Decisions waiting for the user.** Each was measured, not guessed, and
none is built:

- **D1. Read but not servable: no English name.** About 21% of offers
  Vision has read stay unserved. Most fail `business-acceptance-v4` because
  `english_name` is missing. Admitting them means generating an English
  name, which is a guess and against "refuse rather than guess". The
  options:
  - keep refusing them;
  - a second, targeted read for the name only;
  - serve Arabic-only cards behind a flag.

  HISTORY §56.
- **D2. Danube: 586 unpriced products.** Single-tag crops read well. But
  nothing in D4D's data tells a single-tag crop from a multi-tag one, so a
  "take the price from the crop" rule would misprice the multi-tag crops.
  The options:
  - a "one price tag?" model check, validated on its own labelled sample;
  - showing "price on flyer".

  HISTORY §56.
- **D3. Mkhazin is on probation, 1 of 4 weeks.** Mkhazin replaced Grand
  Hyper in the store list. Grand Hyper has had no current D4D flyer since
  2026-08-25. The admission rule is 4 consecutive weekly flyers on D4D.
  Mkhazin has published exactly one (W39, valid 2026-09-27 → 10-02), and
  nothing by 2026-10-08. Keep it on probation, or drop it; either way the
  evidence goes in `docs/FEASIBILITY-VALIDATION.md` (§3, flyer-only
  stores), the authority for retailer decisions.
- **D4. Two pinned matcher divergences.** Each must be settled as ONE
  change in both mirrors:
  1. The engine folds Arabic-Indic digits (٣٢٠ → 320); the frontend does
     not (`normalizeText` / `canonicalMatchText`).
  2. The frontend drops single-letter tokens ("SHINE X", "S/S"); the
     engine keeps them (`queryTokens` / `matchStage`).

  Both change which products match a search. After the fix, regenerate the
  vectors (§9).
- **D5. G8 removal pass, planned for month 2.** Remove one subsystem per
  commit, with tests green after each:
  - the retired Recovery code (~2.5k lines);
  - the OCR escalation path (`OCR_FALLBACK_ENABLED=false`);
  - the legacy model pools;
  - the unused `price_points` table;
  - the `/prices` V1 fallback (grep `TODO: remove V1 fallback`);
  - the superseded design docs.

  Separately, the user can archive ~3.5 GB of loose data from the desktop
  (two identical 675 MB D1 dumps, a forensic audit, the OCR proof of
  concept, the PaddleOCR-VL models). The weekly R2 export now covers what
  the dumps were for.

0c. **Brand Lexicon vocabulary** (HISTORY §45; the machinery is done and
   tested — this is data work). Measured coverage of the 98-brand list:
   **20% of unique brand strings / 17% by volume** on the 1000-crop
   2026-07-21 production sample, **24% of unique** on the frozen-baseline
   50-crop sample. The misses are real brands simply absent from `BRANDS`:
   Najjar, Siniora, Nikai, Clikon, Hershey's, Olay, Listerine, Whiskas,
   Saudia, Ferrero, Fujifilm, Zoflora, Rasasi, Babyjoy, Finish, Nongshim, …
   Re-measure before and after with `brandIdFor` over
   `validation/ocr-first-production-validation-1000-2026-07-21/
   observations.json`. ⚠️ Adding a brand edits `browse/brands.js` `BRANDS`,
   which ALSO feeds Browse's `detectBrand()` — apply its precision guards
   (`depts`, VETO_PREV/VETO_NEXT, `noStrip`) per entry; a name that is an
   ordinary word but safe in a brand-typed field goes in `LEXICON_ONLY_BRANDS`
   instead. Do not bulk-import a brand list without that pass. Deferred by
   design: sub-brand hierarchy (`Fine Baby` → Fine, `Nescafe Gold` → Nescafe)
   needs a parent/child model, not a silent alias.

1. **Journey Coherence V2** (HISTORY §34 follow-ups, in this order): (a)
   harvest ONLINE price observations into price history from the daily watch
   sweep — the sweep already fetches all 7 stores, so it closes "a Search
   lowest never becomes the historical lowest" at zero extra subrequests;
   (b) carry the Summary's anchor identity (covered tokens + variant) into a
   watch at creation so the monitor re-finds THE product the user saw;
   (c) surface `OFFERS_FETCH_LIMIT` truncation in the Summary ("comparison
   covers N of M offers") so a store can never silently vanish.
2. **Browse Phase 4** (BROWSE-DESIGN.md §11; none is urgent): reintroduce
   **Exceptional Deals** once the history substrate is deep enough to score
   it honestly (deals.js is kept pure+tested for exactly this), brand mining
   (observed tier), shelf (family) refinements, finer product families
   inside brands, For-you / In-season rails, collections, cart intelligence,
   per-deal "why exceptional" explainer sheet.
4. **Amazon durability:** configure PA-API secrets, or keep accepting
   best-effort.
6. **`deriveNames` quality** (engine): some OCR-derived offer names are still
   rough; improving the deriver self-heals on the next weekly upsert AND
   converges price-history identities (better names = fewer series splits).
7. **Best-effort store monitoring:** notice when Amazon/Noon silently stop
   returning results (both are fragile to upstream markup changes).
8. **Browse brand rails** still group by the ingest-stamped `brand_slug`
   (OCR-derived). Re-stamp from the Vision `brand` field (open since the
   2026-07-19 Vision+Registry deploy).
9. **Unmerged remote branches.** Review each one, then delete it or merge
   what is still wanted. Nothing was deleted on 2026-10-08.
   - Frontend:
     - `claude/hotspot-count-instrumentation-kgph3s` (07-10)
     - `claude/nice-mendel-wjqck0` (09-24)
     - `claude/trusting-franklin-1zv7u1` (09-24)
     - `feature/i18n-phase1` (07-14)
     - `docs/feasibility-roadmap` (07-14). Its `docs/` folder and its two
       HISTORY sections are now on main.
   - Engine:
     - `claude/brochure-update-schedule-s5pmcs` (07-08)
     - `claude/hotspot-count-instrumentation-kgph3s` (07-10)
     - `claude/hotspot-diagnosis-2026-09` (09-24)
     - `claude/unpriced-flyer-items` (09-24)

## 12. Expansion governance

Retailer decisions (build, defer, skip, or replace a flyer store) must cite
[docs/FEASIBILITY-VALIDATION.md](docs/FEASIBILITY-VALIDATION.md). Its
verdicts are measured from Worker egress, not assumed. Update a row in
place and add a line to its §8 revision log; never fork a new report.

[docs/EXPANSION-ROADMAP.md](docs/EXPANSION-ROADMAP.md) is the July
12-month strategy. Where the two disagree, the validation file wins.

---

_Full milestone history (designs, decisions, verification records, §10–§25 of
the old handoff): [HISTORY.md](HISTORY.md)._
