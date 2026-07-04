# Super Search — Milestone History (archive)

> **This is the archived milestone log.** It preserves, verbatim, the full
> phase-by-phase handoff narrative (designs, decisions, verification runs,
> deployment records) that used to live in `HANDOFF.md`, up to and including
> §25 (2026-07-03). **Do not read this file to get up to speed** — read
> `HANDOFF.md`, which holds the distilled current state. Come here only when
> you need the history of a specific decision or the details of a past
> verification. New milestones are appended at the end of this file.

---

# Project Handoff — Super Search (Live Shopping Assistant)

> **Branding note:** the app was renamed **Souq → Super Search** in §24. Older
> sections below still say "Souq" (historical); the product, repos, and Worker
> names are unchanged — only the user-facing brand and theme changed.

> **Purpose:** This document lets a brand-new session pick up the project cold,
> without reading any prior conversation. It is the source of truth for the
> current state. Keep it updated at the end of each phase.
>
> **Last updated:** 2026-07-03 (latest) · **Phase just completed:**
> **Polishing — Ranking Control, Product Types, Panda Navigation & Super Search
> Rebrand (see §24) — DEPLOYED & VERIFIED IN PRODUCTION.** Four focused
> improvements, no architectural change. (1) **Ranking control:** the results
> grid gained a "Lowest price / Best value" segmented toggle (`src/marketplace.js`);
> Best value ranks by price per comparable unit within the pool's dominant unit
> family, and the choice persists (`lsa.app.rank`). (2) **Product types (the FORM
> attribute):** a new bilingual `productType`/`queryType` classifier (mirrored in
> frontend `src/match.js` and engine `src/matching.js`) gives the same-product
> decision a third attribute alongside brand + family — "Herfy chicken nuggets"
> is no longer treated as, or driven by, "Herfy minced chicken roll" (same brand
> AND chicken family, different form). The comparison excludes known-different
> forms (counted + shown in the summary), equivalence grouping refuses to merge
> them, and the watch monitor got the same `typeMismatch` gate; similar products
> still render in the grid. **Verified live:** a "herfy chicken nuggets" search
> excluded "9 products of a different type" while the headline stayed a nuggets
> product. (3) **Panda navigation restored:** panda.sa's product page is keyed by
> the VARIETY id, but `products-v3` emitted the catalogue `product.id` — so a
> Panda result reached Panda and then rendered "No products found". The
> connector's `normalizeProduct` now emits the variety id for the result `id` AND
> the link (aligning with the suggestions strategy, which already did). **Verified
> against live Panda:** variety id `/v3/products/28874` → 200, old product id
> `18499` → 412; `panda.test.mjs` locks it. (4) **Super Search rebrand:** renamed
> Souq → Super Search (title, wordmark, meta, internal event) with a lighter-blue
> primary theme (CSS `--brand`/`--grad` + theme-color), preserving the clean
> design language. Suites green (frontend match 65/65, compare 45/45, connector
> panda 9/9 + amazon 12/12, engine matching+watches OK); both Workers redeployed
> and verified; frontend pushed to GitHub Pages. **Before this**, the prior phase
> was
> **Polishing — Amazon Reliability, Navigation & Product Understanding (see §23) —
> DEPLOYED & VERIFIED IN PRODUCTION.** Three real-world trust regressions were
> fixed without any new feature or redesign. (1) **Amazon reliability restored:**
> amazon.sa's search layout now renders a compact BRAND `<h2>` before the
> product-title `<h2>`, and the connector's parser took the FIRST `<h2>` — so
> English results were named "Almarai"/"Saudia" (no product words) and the §21
> honest relevance filter then dropped them, which read as "Amazon is broken".
> The parser now extracts title and brand SEPARATELY (brand-led display name,
> like every other store), plus the strike-through list price → `oldPrice` +
> discount; **46/48 English "milk" results now contain the query word (was ~2)**
> and survive filtering. A fixture test (`serverless-connector/src/providers/
> amazon.test.mjs`) locks the regression. (2) **Navigation:** flyer offers now
> open the in-app viewer ON THE OFFER'S OWN PAGE — the engine captures D4D's
> `data-page-id` per page (adapter → collector → pipeline → `meta.json`), the
> viewer accepts a `targetPageId` and the offer's `pageRef` drives it (graceful
> page-1 fallback; converges as flyers refresh weekly). Online cards also guard
> against a missing/relative link. (3) **Product understanding:** the
> aggregator's OWN product category (D4D taxonomy) is now a corroborating
> **family** signal — `offerFamily(offer)` = name-derived family, falling back to
> category when the OCR name is debris (recovering e.g. an "a wwww amm … nada
> greek" offer into yogurt). Only unambiguous categories are mapped and the name
> always wins, so precision is unchanged. Both matching mirrors gained
> `categoryFamily`/`offerFamily`; suites green (frontend match 56/56, compare
> 39/39, connector amazon 12/12, engine selftest incl. live D4D `17/36` lulu
> pages carrying a deep-link pageId). **Before this**, the prior phase was
> **Flyer Coverage — Investigation, Fixes & Per-Retailer Baseline (see §22) —
> DEPLOYED & VERIFIED IN PRODUCTION.** Weekly flyer coverage felt far lower
> than expected; the pipeline was measured stage by stage and the upstream
> (D4D) was proven NOT to be the limit — the frontend was discarding most of
> the engine's relevant offers (a single-language name gate + a 40-offer
> fetch cap), compounded by synonym gaps (colloquial "مويه" returned zero)
> and a weekend freshness hole (no ingest between Wed and Tue while ~21% of
> offers expire Fri–Mon). Fixes: bilingual flyer-offer gating + query-script
> display names (`src/compare.js`), fetch limit 40→120, synonym +
> brand-transliteration additions in BOTH matching mirrors, an OCR-debris
> name guard in the engine's `deriveNames`, and a third weekly ingest cron
> (Tue+Wed+**Fri**). Measured result: **2.75× more flyer offers surfaced**
> on a 40-query bilingual battery, Arabic ≡ English results, and a
> per-retailer extraction/matching baseline recorded in §22.D. **Before
> this**, the prior phase was **Unified Marketplace + Product Understanding +
> Price Monitoring LIVE (see
> §21) — DEPLOYED & VERIFIED IN PRODUCTION.** The search page is now ONE
> unified marketplace: online results and flyer offers render in a single
> ranked grid (source = a store badge + a small "flyer · until <date>" tag),
> per-store state lives in a compact sources strip, and the old per-store
> sections + separate flyer panel are gone. Product understanding gained a
> bilingual **product-family layer** (`productFamily`/`queryFamily`, mirrored
> in frontend `src/match.js` and engine `src/matching.js`): products from
> different families never compete ("كيري مربعات" no longer recommends puff
> pastry; "نادك منزوع الدسم" no longer offers yogurt as the milk alternative),
> full-token-coverage gating keeps look-alikes out of the comparison, and a
> shared best price is attributed to EVERY store that offers it. The §20
> engine deployment that was blocked-on-user is DONE: **Price Monitoring is
> live and verified in production** (watch create → daily check → alert →
> delete, plus the Alerts page end-to-end; a `/offers` search-starvation bug
> and a missing CORS DELETE were found and fixed on the way). **Manuel was
> retired** (dead on D4D since 2025-09; 18 stores remain, all current).
> Amazon's perceived instability was fixed (honest irrelevance filtering +
> client-side retry); Danube's 422 on multi-word Arabic queries was fixed in
> the connector. **Before this**, the prior phase was **Intelligent
> Shopping — Price Comparison Engine + Unified Search + Price Monitoring (see
> §20).** The search page now runs a value-aware **Price Comparison Engine**
> (`src/compare.js`): the "Best buy" is decided by **per-unit value across BOTH
> worlds** — live online results AND this week's flyer offers — with the lowest
> total price kept as its own honest line, a median outlier guard against
> size-parse errors, and the same confidence ladder as before. **Price
> Monitoring (Personal Alerts, Roadmap priority 4) is BUILT**: watches with a
> target price (product-specific by stable id — e.g. Amazon ASIN — or grocery
> across all sources), a daily cron check with strict relevance + size trust
> gates, in-app alerts + optional free ntfy.sh push, and a new **Alerts page**
> (`#/alerts`). Offer search relevance was rebuilt on word boundaries + a
> bilingual synonym bridge (the "eggs returns white-onion flyer offers" class
> of bug is gone), shared by a new engine module (`src/matching.js`).
> **⚠️ DEPLOYMENT STATUS: see §20.H — both repos are pushed and the FRONTEND
> IS LIVE on GitHub Pages (byte-verified, degrades gracefully). Only the two
> engine steps remain — the D1 migration + `wrangler deploy` — blocked by the
> session's permission gate; the user must run/allow them, then verify per
> §20.H.** **Before this**, the prior phase was **Brochure
> Intelligence — Structured Offers + Coverage Expansion + Retention — DEPLOYED &
> VERIFIED IN PRODUCTION (see §19).** The Brochure Engine is now a source of
> STRUCTURED shopping data: it extracts **per-product offers** (price, was-price,
> validity, product image, flyer deep-link, bilingual OCR text) from every
> covered store's current flyers via D4D's `/products/search` JSON API — **no
> OCR of our own, $0** — and serves them at **`GET /offers?q=`** (15,800+
> current offers at deploy). Coverage grew **8 → 19 stores** (Farm, Al Madina,
> Ramez, City Flower, Mark & Save, A Market, Grand Hyper, Makkah, Prime, Hyper
> Al Wafa, AlJazera — all Riyadh, all with current flyers). A **retention
> policy** (metadata forever, bytes a rolling window) now keeps the KV
> namespace inside the Free plan permanently. The frontend search page gained
> an **"In this week's flyers" panel** that puts physical-store flyer prices
> next to the live online results (in-app viewer click-through). **Before
> this**, the prior phase was **Search Intelligence & Reliability (§18).** An **intelligent
> shopping summary** now sits ABOVE the results (cheapest option, best value per
> unit, a **confidence indicator**, and Price History woven in) — and it **only**
> claims a strong "Lowest price" for a **confidently-equivalent product** (same
> brand + size at ≥2 stores), never across different pack sizes/variants. Search
> accuracy was rebuilt in a new pure, unit-tested `src/match.js` (Arabic+English
> normalization, decimal-safe size/pack parsing, relevance + compound-noun
> demotion, irrelevance filtering, equivalent-product grouping). A **7th live
> store, Ninja (نينجا) Market**, was added; **Amazon** reliability rose from ~25%
> to ~80% (retry + UA rotation) and **Danube** was further hardened. HungerStation
> Market and Keeta Market were investigated but are **not addable from a Worker**
> (Cloudflare-gated / signed API) — see §18. **Before this**, the prior phase was
> the **Brochures Page Bug Fixes (multi-flyer engine + page ordering) — DEPLOYED &
> VERIFIED IN PRODUCTION (see §17).** The Brochure Engine now holds **every current
> flyer** a store runs (not one), ranked **main-weekly-flyer-first** (a 1-page
> promo can never displace the main brochure), and the Brochures page shows all of
> them per store with an honest empty state when none is current. **Before this**,
> the prior phase was the **Frontend Redesign (Unified Frontend, full pass) —
> DEPLOYED & VERIFIED IN PRODUCTION (see §16).**
> The frontend is now a two-experience app — **Live Search** (`#/search`) and
> **Brochures** (`#/brochures`) — under one hash-routed shell with desktop top
> nav + mobile bottom tab bar, a rewritten design system (dark mode, skeletons,
> reduced-motion), a price-intelligence panel (lowest recorded + latest per
> store), a dedicated Brochures page (every engine store, every active flyer,
> current/expired clearly distinguished), and an upgraded in-app viewer (swipe,
> preload, focus trap, PDF branch for Othaim). **Frontend-only:** the Core,
> providers, result contract, connector, and Brochure Engine are untouched; no
> API changed; Alerts NOT built (still next). **Before this**, the prior phase
> was the **Brochure Source Migration — deployed & verified (§15).** OffersInMe is
> **removed entirely** as a brochure source and
> replaced by **D4D Online** as the primary aggregator, with a new
> **official-offers-page fallback** when D4D has no current flyer (never a second
> aggregator). The change is confined to the **provider/adapter layer** (a new
> `d4d` adapter + a new `officialLink` collector + 7 rewritten provider configs +
> a small additive pipeline branch and one frontend branch); the Brochure Engine
> architecture, collectors' contract, pipeline, storage, read APIs, and the search
> path are otherwise unchanged. Verified end-to-end against the **live D4D site**
> (§15): all covered stores resolve **current** brochures (e.g. Danube now valid
> to 2026-07-14, vs the stale 2025-W37 OffersInMe held), the in-app viewer serves
> D4D pages through the engine, the currency gate rejects expired flyers, and the
> fallback produces a link brochure. **Before this**, the prior phase was the
> **Unified Interface (Integration) — COMPLETE (first pass).** The three built
> pillars are now wired
> into the **existing search page** (no redesign, no new backend): each all-stores
> search now shows, inline, (a) the **historical lowest price** (price + store +
> date) for tracked products via the Brochure Engine's `/lowest`, and (b) a
> per-store **"Weekly flyer"** button (Brochure Engine `/brochures`) that opens
> that store's current brochure in an **in-app viewer** — the page images are
> served **through the Brochure Engine** (`/asset`), so the user never leaves Souq
> for an external aggregator site. The viewer does prev/next, page counter, zoom,
> store name, and brochure date. Frontend-only change: one new client module
> (`src/brochure.js`) plus additive rendering in `src/app.js`/`styles.css`; the
> Core, providers, and result contract are untouched. Verified end-to-end against
> the live engine (see §14). **Done ahead of Alerts by explicit direction** — the
> user chose to integrate-and-evaluate the existing capabilities before building
> Alerts. · **Next phase:** **Personal Alerts (Pillar 3 cont.)** — NOT started;
> see the **Roadmap (§0)** and TODOs (§9). `StoreSessionCollector` remains
> **deferred** (§0). Discovery is §10; M1 is §11; M2 is §12; **Price History is
> §13; Unified Interface integration is §14**.
>
> **Project vision:** Souq is a **personal Saudi shopping assistant** — a private
> tool for one user, **not a commercial platform**. Three pillars:
> (1) Live online search — *built* (§1–§8); (2) **Weekly brochures for physical
> stores** — *built (M1+M2), §10–§12*; (3) **Price intelligence** — *price history
> built (§13)*, personal alerts *next*. This is the reason the Brochure Engine
> keeps **history**. The current, authoritative build order is the **Roadmap (§0)**.

---

## 0. Roadmap & priorities (authoritative)

> **This is the source of truth for what to build next.** It overrides any
> ordering implied elsewhere in this document or in `brochure-engine/ARCHITECTURE.md`
> (e.g. older "M3 = StoreSessionCollector next" notes). Souq is a **personal
> shopping assistant for one user — not a commercial platform**; scope decisions
> favor a simple, private, low-cost tool over breadth or productization.

**Priorities, highest to lowest:**

1. **Online Search** — ✅ **done** (§1–§8), **upgraded in §18.** Now **seven
   stores** (Ninja added), live multi-store search, an **intelligent shopping
   summary** before results, rebuilt matching/ranking + equivalent-product
   grouping (`src/match.js`), "Show all", Arabic+English, all routed through the
   connector.
2. **Brochure Engine** — ✅ **done, upgraded to structured intelligence (§19).**
   M1 `PdfIndexCollector` (Othaim PDF) + `AggregatorCollector`, weekly Tue+Wed
   fan-out scheduler on the Free plan; aggregator = D4D + official-offers-page
   fallback (§15). **Now 19 stores** (§19: +11 Riyadh groceries), ~49 current
   brochures held, **plus structured per-product OFFERS** (15,800+ current)
   served at `GET /offers?q=` — the price-comparison substrate for physical
   retailers — and a storage **retention policy** that keeps KV inside the
   Free plan forever.
3. **Price History** — ✅ **done** (§13). A **feature of the Brochure Engine**:
   price points **anchored to brochure editions** (the *when*/*where*), price
   *number* from the search connector, lowest-ever (price + where + when) derived
   on read. Deployed & verified; M1/M2 intact. Free plan, D1-only, $0.
4. **Personal Alerts** — ✅ **done (as Price Monitoring, §20).** Watches with a
   user-set target price, checked daily across ALL sources (live online stores
   + current flyer offers): product-specific watches re-find the exact product
   by its stable result id (e.g. an Amazon ASIN); grocery watches sweep every
   source behind relevance + size trust gates. In-app alerts (badge + Alerts
   page) plus optional free push via ntfy.sh (`NTFY_TOPIC` secret). Personal,
   single-user, $0. (It monitors live prices rather than only §13's weekly
   capture — a strict superset of the originally-planned alert.)
5. **Unified Frontend** — ✅ **done (redesigned, §16;** first integration pass
   was §14). The frontend is now a two-experience app: **Live Search** and a
   dedicated **Brochures** page, with Price History woven into search as a
   price-intelligence panel and the UI pre-shaped for Alerts (a disabled
   target-price affordance marks where the control will live). Frontend-only —
   no backend/API change. **Note on ordering:** both the §14 integration and the
   §16 redesign were done *before* Alerts by explicit user direction; Alerts
   (priority 4) is still the next build.

**Explicitly deferred (do NOT build until the above are done and only if still
warranted):**

- **`StoreSessionCollector`** (the former "M3") — reusing search sessions for
  structured promos. Deferred; Price History takes precedence.
- **OCR** / price extraction from brochure images.
- **AI extraction** (LLM-based parsing of brochures/pages into structured data).
- **Advanced analytics** (dashboards, aggregate/market analysis, trend modeling
  beyond a single product's own history).
- **Any paid Cloudflare features** — stay on the **Free plan**. No R2 (KV is the
  approved store), no paid Queues/Workflows, no paid Workers plan. Cost target: **$0**.

Deferred items are not cancelled — they may return once priorities 3–5 are met,
but only if they still serve the personal-assistant goal. Keep future milestones
aligned to this order.

---

## 1. What this is

**Souq** is a personal, live shopping-search web app for Saudi stores. You type a
product (Arabic or English) and it searches multiple stores' live catalogues in
parallel and shows current price, previous price (on offer), image, brand, size,
discount label, and a link. No accounts, no ads, no cached prices — every search
hits the stores live.

Two pieces:
1. A **static frontend** (this repo) hosted on GitHub Pages.
2. A **stateless serverless connector** (separate repo) — a Cloudflare Worker
   that does the store fetch + normalization server-side.

---

## 2. Current architecture

```
Browser (static Souq frontend, GitHub Pages)
   │  Core → Provider → Strategy(ies) → Normalized Result
   │        (Core is store-agnostic; adaptiveSearch remembers the last
   │         working strategy per provider in localStorage)
   ▼  fetch  https://shopping-connector.tamamoooo.workers.dev/search?provider=<id>&q=<query>
Cloudflare Worker (Shopping Connector — stateless)
   │  entry (src/index.js) → registry → connector framework (src/connector.js:
   │  routing, CORS, dispatch) → provider (src/providers/<id>.js) → strategies
   ▼  live fetch to the store's public endpoint
Store (Panda / Tamimi / Danube / Lulu / Amazon / Noon)
```

> **Integration note (§14):** the frontend now *also* reads the **Brochure Engine**
> (`https://brochure-engine.tamamoooo.workers.dev`) for the weekly-flyer link and
> the historical-lowest-price banner. That is a **second, read-only** upstream
> alongside the search connector — it does not change the search path above, and
> all of it is isolated in `src/brochure.js`. No new backend was added; the
> Brochure Engine already existed (§11–§13).

Key architectural facts:

- **All six frontend providers now route through the connector** (`CONNECTOR_BASE`
  in each `src/providers/*.js`). The browser never calls a store directly anymore
  — the connector exists so stores with no CORS / bot protection can still be
  supported without changing the Core or the result contract.
- **The connector mirrors the frontend one layer down** — same provider contract
  `{ id, label, strategies: [{ name, run(query) -> Promise<NormalizedResult[]> }] }`.
- **Normalized Result contract (10 keys) — identical on both sides. This is a
  hard contract; do not change it casually:**
  `{ id, name, image, price, oldPrice, currency, link, size, brand, discountLabel }`
- **Connector is stateless & thin by requirement:** no DB, auth, sessions, or
  cache. Each request does a live fetch. Providers declare strategies best-first,
  so ordering is preserved with zero stored state (the frontend's localStorage
  strategy-memory is a frontend-only optimization).
- **Connector API:**
  - `GET /` → health + provider list.
  - `GET /search?provider=<id>&q=<query>` → `{ provider, query, strategy, count, results: [...NormalizedResult] }`.
  - Errors: `400` missing param, `404` unknown provider/route, `502` all
    strategies failed (with `failures` list). CORS on every response;
    `OPTIONS` preflight → `204`.

---

## 3. Repositories

| Role | GitHub | Local path | HEAD at handoff |
|---|---|---|---|
| Frontend (this repo) | `tamamoooo-dev/live-shopping-assistant` | `C:\Users\majed\Desktop\claude\live-shopping-assistant` | the §23 polishing push (page-accurate flyer viewer, category family, this handoff update) |
| Connector | `tamamoooo-dev/shopping-connector` | `C:\Users\majed\Desktop\claude\serverless-connector` | the §23 polishing push (Amazon title/brand parser, page-id capture, offer category family) |

> Note: the connector's **local folder** is `serverless-connector` but its GitHub
> **repo name** is `shopping-connector`. Both `origin` remotes are under the
> `tamamoooo-dev` org.
>
> **Brochure Engine lives in the connector repo** (decision, §11.E): it is a
> **second, self-contained Worker** at `serverless-connector/brochure-engine/`
> with its own `wrangler.toml`, D1/KV bindings and weekly Cron. The stateless
> search Worker at the repo root is **untouched** — the two share a repo, not a
> deployment or state (this is ARCHITECTURE.md §12.2's in-repo alternative).

---

## 4. Live URLs

- **Frontend (production):** https://tamamoooo-dev.github.io/live-shopping-assistant/
- **Connector (production):** https://shopping-connector.tamamoooo.workers.dev
  - Health/list: `GET https://shopping-connector.tamamoooo.workers.dev/`
  - Search: `GET https://shopping-connector.tamamoooo.workers.dev/search?provider=panda&q=milk`

---

## 5. Implemented stores & status

All six exist as providers on **both** the frontend and the connector, and are
wired into the UI (dropdown + checkbox chips).

| Store | id | Source / method | Status |
|---|---|---|---|
| Panda | `panda` | Public JSON API (`api.panda.sa`), strategies `products-v3` → `suggestions-v3` | **Stable** — production-grade, clean contract |
| Tamimi | `tamimi` | ZopSmart JSON API (`shop.tamimimarkets.com/api/layout/search`) | **Stable (experimental)** — clean JSON, no auth, EN/AR |
| Danube | `danube` | Spree JSON API (`danube.sa/api/products.json?q[name_cont]=`) | **Stable (experimental)** — EN/AR, sale prices. Connector retries transient upstream failures once (see note below) |
| Lulu | `lulu` | Akinon list JSON (`gcc.luluhypermarket.com/{en-sa\|ar-sa}/list?...&format=json`) | **Stable (experimental)** — EN/AR, SAR via pz-locale/pz-currency cookies |
| Amazon | `amazon` | PA-API 5.0 strategy (`pa-api`, tried first, **unconfigured→skips**) then search-HTML parse (`amazon.sa/s`) | **Best-effort** — see caveat below |
| Noon | `noon` | Noon Minutes search-page RSC flight (`minutes.noon.com/{saudi-en\|saudi-ar}/search`) | **Best-effort (experimental)** — parses server-rendered JSON; main noon.com blocks datacenter IPs, Minutes does not |
| Ninja | `ninja` | Ninja Market public "fahras" search (`public.ananinja.com/fahras/search/products`) after bootstrapping a **guest `DeviceToken`** from the storefront | **Stable (experimental)** — EN/AR, Riyadh store (`storeId=1`), prices in cents. Added §18. Token cached in-isolate, refetched on 401 |

> **All seven stores exist on both the frontend and the connector.** The seventh,
> **Ninja Market**, was added in the Search Intelligence milestone (§18). Two more
> markets were investigated and **rejected** (§18.E): **HungerStation Market** (its
> product-search / menu API is Cloudflare-gated to datacenter IPs — the darkstore
> vendor resolves but its catalogue does not) and **Keeta Market** (a Meituan
> "Sailor" signed mobile API, geo-gated) — neither offers a clean free-text search
> from a Cloudflare Worker.

- The frontend marks `amazon` and `noon` as **best-effort** (`BEST_EFFORT` set in
  `src/app.js`), giving them a friendlier "temporarily unavailable" message on
  failure instead of a hard error.
- **Amazon caveat (improved §18):** no credential-free product API exists, so the
  active path scrapes public search HTML and hits Amazon's anti-bot interstitial on
  a share of requests. As of §18 the `search-html` strategy **retries up to 5×
  with a rotating User-Agent + browser-like headers**, because the interstitial
  clears on retry — measured Worker success rose from **~25% to ~80%**. It still
  isn't guaranteed (Amazon stays **best-effort**). The durable fix remains
  **PA-API 5.0**, already implemented as the `pa-api` strategy and tried first; it
  skips instantly while unconfigured. To activate (no code change): set Worker
  secrets `PAAPI_ACCESS_KEY`, `PAAPI_SECRET_KEY`, `PAAPI_PARTNER_TAG` (optional:
  `PAAPI_HOST`, `PAAPI_REGION`, `PAAPI_MARKETPLACE`) and redeploy.
- **Danube resilience note:** Danube's Spree origin occasionally drops a single
  request from Cloudflare's edge (transient 5xx / reset), which surfaced as an
  intermittent "Could not reach Danube". The connector's Danube provider
  (`serverless-connector/src/providers/danube.js`) now retries once on transient
  failures (5xx / 429 / network error) with a short backoff; a 4xx (except 429)
  stays final. This was preventive hardening — no reproducible code fault was
  found; the origin was healthy when investigated. If Danube "breaks" again,
  first check the origin directly:
  `curl -A Mozilla "https://danube.sa/api/products.json?q%5Bname_cont%5D=milk&per_page=20"`.
  **Further hardened §18:** now **3 tries** (was 2), it guards a 200-response with
  a non-JSON body (an HTML error/challenge page) as a retryable blip instead of a
  hard throw, and it presents as a same-origin XHR (`X-Requested-With`, `Referer`)
  to reduce edge drops.

---

## 6. Current UI / features

> **Redesigned 2026-07-02 — the authoritative description is §16.** Summary:

- **Branding:** "Souq — personal shopping assistant". Single-page app:
  `index.html` + `styles.css` + ES modules in `src/`. No build step.
- **Two primary experiences under one hash-routed shell** (`#/search`,
  `#/brochures`): desktop top nav, mobile bottom tab bar.
- **One search model** (same Core, providers, and result contract underneath):
  the store chips are the single scope control — every selected store is
  searched in **parallel**, results **grouped by store** with a colored dot +
  count badge per section (one store selected behaves the same, just one
  section). The old All/Single mode toggle is gone. Selection persists in
  localStorage. Recent searches + tracked-product hints on the home state.
- **Smart Ranking:** client-side re-ranking of each store's results by relevance
  to the query; the top `DEFAULT_LIMIT = 4` are shown up front.
  - Tiering per field: exact (100) > prefix (80) > whole-word (70) > partial (60)
    > multi-token all-present (45) / some-present (20+hits). Name match dominates;
    brand match counts ×0.7. Stable sort (ties keep store order).
  - Implemented entirely in `src/app.js` (`tierScore` / `relevance` / `rankItems`,
    wired into `runSearch`). Result objects are untouched — only
    order and count shown.
- **"Show all" expansion:** each store keeps its **full ranked list** (all
  already-fetched results, typically up to 20–60) and shows a **"Show all N" /
  "Show fewer"** toggle below its top 4. Expanding renders the rest from memory —
  **no new search / network call**. Each store section expands independently.
  Implemented as `resultsBlock(items, limit)` in `src/app.js`; button style
  `.show-all` in `styles.css`. Store count badges show the **true total found**
  (e.g. "30").
- **Arabic + English:** input language auto-detected; Arabic input searches the
  Arabic catalogue and links to Arabic product pages. Product names render RTL.
- **Adaptive search:** the Core tries a provider's strategies in order, remembers
  the one that worked in `localStorage`, tries it first next time, and rediscovers
  another if it stops working.
- **Mobile-first:** 16px inputs (avoids iOS Safari zoom), safe-area insets,
  spinner/loading states, per-store loading and failure notes. No login/settings.
- **Brochure + Price History integration (§14, redesigned in §16):** search
  results carry read-only Brochure-Engine capabilities. A **price-intelligence
  panel** (lowest recorded + latest capture per store with delta vs the low)
  appears above results when the query is a tracked product (milk/eggs, from
  `/prices`). Each store section shows a **flyer chip with the validity date**
  (stale-marked when expired) that opens the brochure in the **in-app viewer**
  (`src/viewer.js`; pages served through the engine's `/asset`). Covers Panda,
  Tamimi, Danube, Lulu (Amazon/Noon have no brochure). The dedicated
  **Brochures page** (`src/brochures.js`, §16) shows all 8 engine stores. All
  Brochure-Engine knowledge is isolated in `src/brochure.js`; every feature is
  best-effort (engine down → nothing shown) and never blocks the live search.

---

## 7. Important project rules

1. **The normalized result shape is a contract.** Same 10 keys on frontend and
   connector. Changing it means touching every provider on both sides — avoid.
2. **Core / framework stay store-agnostic.** Store-specific logic lives only in
   `src/providers/<store>.js`. Adding a store = add a provider file on **both**
   repos (and register it in the connector's `src/index.js` and the frontend's
   `src/app.js` STORES list + `index.html` controls). The Core never changes.
3. **Connector stays stateless & thin.** No DB, auth, cache, or sessions.
   Providers list their most reliable strategy first.
4. **Trunk-based development.** Work commits directly to `main`; pushing `main`
   deploys. No feature-branch/PR flow is in use for this project.
5. **Commit trailer:** end commit messages with a `Co-Authored-By:` line naming
   the current Claude model (currently
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
6. **Docs are partially stale.** `README.md` and `CHANGELOG.md` still describe the
   original single-store "Panda Live Search v1.0.0". The app has since been
   renamed **Souq**, grown to **6 stores**, routed everything through the
   **connector**, and added **Smart Ranking** — none of which is reflected there.
   Treat **this HANDOFF.md** as current; the README/CHANGELOG refresh is a TODO.
7. **It's a personal tool reading public store endpoints.** Not affiliated with
   any store; be considerate with request volume.

---

## 8. Deployment workflow

### Frontend (this repo) — GitHub Pages
- **No build step.** Pure static ES modules with relative paths; `.nojekyll`
  present so `src/` is served untouched.
- **Deploy = commit to `main` + `git push origin main`.** GitHub Pages rebuilds
  from `main` / root automatically (~1–2 min + CDN propagation).
- **Verify a deploy:** poll the live bundle until it reflects the commit, e.g.
  `curl "https://tamamoooo-dev.github.io/live-shopping-assistant/src/app.js?cb=$RANDOM"`
  and grep for the change. The Pages metadata API (`/repos/.../pages`) returns 404
  unauthenticated even though Pages is enabled — that's expected, not a failure.
- **Local dev:** `node server.js` → http://localhost:5173 (zero-dependency static
  server; honors the `PORT` env var). ES modules won't load over `file://`, so a
  server is required. A preview `launch.json` lives at
  `C:\Users\majed\Desktop\claude\.claude\launch.json` with `panda` (5173,
  `autoPort` on) and `connector` (8787) entries.

### Connector — Cloudflare Worker
- **Deploy:** `npx wrangler login` then `npx wrangler deploy` →
  `https://shopping-connector.<subdomain>.workers.dev`. No bindings/secrets/services
  required — pure compute. Config in `wrangler.toml` (`name = "shopping-connector"`,
  `main = "src/index.js"`).
- **Local dev:** `node dev.mjs` → http://localhost:8787 (tiny Node adapter; Workers
  run on Web APIs global in Node 18+). Or `npx wrangler dev`.
- **Amazon PA-API:** activate via `npx wrangler secret put PAAPI_ACCESS_KEY` /
  `PAAPI_SECRET_KEY` / `PAAPI_PARTNER_TAG`, then redeploy. No code change.

> **Environment notes (verified this session):** Node lives at
> `C:\Program Files\nodejs` but is **not on PATH** for the default shells — add it
> (`export PATH="$PATH:/c/Program Files/nodejs"`) or use the full path. Wrangler is
> **already authenticated** (OAuth, `tamamoooo@gmail.com`, `workers:write`), so
> `npx --no-install wrangler deploy` works without an interactive login. The
> browser-preview tool serves the frontend locally but stays pinned to
> `localhost` (cross-origin navigation to the Pages URL doesn't stick); the local
> bundle equals the committed code, so verify locally then confirm the deployed
> bundle with `curl`. Preview **screenshots time out** on the external product
> images — rely on `preview_eval` DOM inspection for verification instead.

---

## 9. Remaining TODOs (priority order)

> Ordered to match the **Roadmap (§0)**. Priorities 1–3 (Online Search, Brochure
> Engine, Price History) are complete, and the **Unified Interface first pass**
> (§14) is now integrated; the next milestone is **Personal Alerts**.

1. ~~**Finish the §20 engine deployment**~~ — **DONE (§21, 2026-07-03):** the
   D1 migration + engine deploy ran, Price Monitoring is live and verified in
   production. Only the optional phone-push step remains:
   `npx wrangler secret put NTFY_TOPIC` (topic name = the shared secret; pick
   something unguessable and subscribe to it in the ntfy app — no account
   needed).
2. **Usability gaps found integrating the Unified Interface (§14.D) — mostly
   closed by the §16 redesign.** Status:
   (a) **partially addressed** — the home state now advertises which products
   have history ("Price history available" chips), but the watchlist is still
   only milk/eggs; growing `products.js` remains the real fix (the UI picks new
   products up automatically via `trackedProducts()`).
   (b) **still open** — the viewer opens the whole brochure, not the searched
   product within it (per-product location needs OCR — out of scope, §0).
   (c) **fixed (§16)** — flyer chips now show the validity date and a visible
   stale marker when the newest held flyer has expired.
   (d) **fixed (§16)** — the price-intelligence panel shows the latest captured
   price per store next to the lowest ever, with the delta.
3. **Amazon durability.** Configure PA-API secrets on the Worker (Amazon Associate
   account with PA-API access) so `pa-api` becomes the active path and results stop
   depending on the fragile HTML scraper — or formally accept Amazon as best-effort.
4. **Refresh README.md & CHANGELOG.md.** Bring them up to date with Souq branding,
   the 6-store multi-store architecture, connector routing, and Smart Ranking.
   (They still describe single-store "Panda Live Search v1.0.0".)
5. **Best-effort store monitoring.** Amazon (anti-bot) and Noon (RSC-flight
   parsing) are fragile to upstream markup changes; add a lightweight way to notice
   when they silently stop returning results.
6. **Price-match quality (Price History follow-up, §13).** The weekly capture uses
   the connector's best-ranked result for a query, which can mis-match loosely
   (e.g. "milk" → a milk *chocolate* biscuit at some stores). Tighten with a
   per-product `match` rule or explicit per-store product ids when it matters.
   **New option since §19:** the structured flyer offers are themselves a
   candidate price source for the capture (the §13.G seam takes any source) —
   a flyer-offer price IS a brochure price, but its OCR-derived matching needs
   the same care before wiring it in.
7. **Offer display-name quality (§19 follow-up).** `name`/`name_ar` are derived
   heuristically from the aggregator's OCR text; most are good, some are noisy
   and some English names land in `name_ar` (mixed-script OCR lines). The UI
   fallback chain (name → nameAr → category) plus the product image crop keeps
   cards usable. Improving the deriver is engine-side only (`offers/contract.js`
   `deriveNames`); names self-refresh on every weekly ingest (upsert).
8. ~~**Manuel is effectively dead on D4D**~~ — **RETIRED (§21, 2026-07-03):**
   provider removed from the engine + frontend, stale D1 row marked
   non-current (history rows kept). Re-add as a one-line provider config if
   D4D ever republishes it.

**Deferred (per §0 — not TODOs now):** `StoreSessionCollector` (former M3), OCR /
brochure price extraction, AI/LLM extraction, advanced analytics, and any paid
Cloudflare features (R2, paid Queues/Workflows/Workers).

_Done recently (no longer TODO): **Unified Interface integration (§14)** —
Brochure Engine + Price History wired into the search page, verified live;
**Price History (Pillar 3)** (§13) — deployed & verified; **Brochure Engine
M1 + M2** (§11, §12); **Brochure Engine Discovery (§10)**, Smart Ranking,
per-store "Show all" expansion, Danube transient retry._

---

## 10. Brochure Engine — Discovery Report (Pillar 2)

> **Status:** Discovery **complete** (2026-07-01). No code written, no repo
> modified except this handoff. This section is the source of truth for the
> Brochure Engine's architecture before implementation begins.

### 10.A Executive summary
Ten candidate retailers investigated. They collapse into **three delivery
realities**, not ten bespoke integrations:
- **Official clean PDFs (region-tagged):** Othaim, Farm — a *stable HTML index
  page* whose per-week PDF link rotates.
- **Official but hard:** Carrefour + Lulu web brochures are **bot-protected**
  (Carrefour digital leaflet timed out / Akamai; Lulu `instore-promotions` →
  **HTTP 403**, Akinon). Panda/HyperPanda/Danube/Tamimi have e-commerce/app
  backends but **no clean official web PDF** brochure.
- **Aggregator-carried (all 10, incl. Riyadh):** ClicFlyer, D4D Online,
  Tiendeo/getcata, OffersInMe normalize every retailer into per-city
  **page-image sets**. Only channel covering **Manuel** (which has no official
  brochure) and the protected/app-only stores.

**Two headline decisions:** (1) build **reusable collectors by pattern, not one
per store**; (2) the Brochure Engine is **stateful** (remember current week,
dedupe, keep history for Pillar 3) → it is a **separate subsystem**, deliberately
**not** bound by the search connector's stateless-&-thin rule.

### 10.B Per-retailer findings

| Store | Weekly? | Where / format | Riyadh/Central? | Auto-detect | Auto-download w/o bypass | Stable URL | Difficulty | Strategy |
|---|---|---|---|---|---|---|---|---|
| **Panda** | Yes | E-commerce + **app**; no clean web PDF. Aggregators carry it | via aggregator | aggregator yes / app hard | aggregator yes | index stable; app opaque | Med-High / **Low** (aggr) | aggregator now; later Panda API session |
| **HyperPanda** | Yes | Same parent (Panda Retail Co.) — shares/parallels Panda promo | via aggregator | same as Panda | same as Panda | same | Med-High / **Low** | **same collector as Panda** |
| **Othaim** | Yes | **Official PDF**: `othaimmarkets.com/othaim-promotions/?pid=18` → `/api/pdfOffers/<id>.pdf` | **Yes — "Central Region" pid=18** | **Yes** (scrape index) | **Yes** (public PDF) | index stable; **PDF name rotates weekly** | **Low** | **`PdfIndexCollector`** (reference) |
| **Carrefour** (MAF) | Yes | **Bot-protected** web-app digital leaflet (timeout/Akamai); not a plain PDF | Yes | official **hard** | official: needs headless/bypass → avoid | opaque | High / **Low-Med** (aggr) | **`AggregatorCollector`** |
| **Lulu** | Yes | Official `instore-promotions` → **HTTP 403** (Akinon). Region PDFs exist | Yes | official med-hard | naive no (403); **reuse search session** | region PDFs | **Medium** | reuse Lulu Akinon session OR aggregator |
| **Danube** | Yes | Official Spree (in search); "Riyadh Weekly Promotion" flyer exists | Yes | medium | likely yes | medium | **Medium** | aggregator now; later Danube session |
| **Tamimi** | Yes | Official ZopSmart (in search); "Super Weekly" flyer | Yes | medium | likely yes | medium | **Medium** | aggregator now; later Tamimi session |
| **Farm** | Yes | **Official PDF**: `farm.com.sa/en/Offers_Regions/2` → `/PDF/Offers/Ar/<num><region>.pdf` | **Yes — Riyadh bundled in a multi-region PDF** | **Yes** (scrape index) | **Yes** (public PDF) | index stable; **PDF name rotates weekly** | **Low** | **`PdfIndexCollector`** (same as Othaim) |
| **Manuel** | Yes | **No official brochure site found** — aggregator-only | via aggregator (Riyadh present) | aggregator only | aggregator yes | aggregator | **N/A official / Low-Med** | **`AggregatorCollector` only** |
| **Nesto** | Yes | Official nesto.sa; heavy aggregator coverage. KSA skews Western/Eastern | limited Riyadh | aggregator yes | aggregator yes | aggregator | **Med / Low** | **`AggregatorCollector`** |

### 10.C Pattern groups
- **A — Official "stable index → weekly PDF" (region-param):** **Othaim, Farm** → **one** `PdfIndexCollector`, config-driven `{ indexUrl, regionSelector, pdfLinkPattern }`.
- **B — Bot-protected official web-app:** **Carrefour, Lulu** → avoid bypass; use aggregator or (Lulu) the session we already own.
- **C — E-commerce + app, no clean web brochure:** **Panda, HyperPanda**, partly Danube/Tamimi/Nesto → app API or reuse existing search backend.
- **D — Third-party aggregator (covers ALL 10):** ClicFlyer / D4D / Tiendeo/getcata / OffersInMe → **one** `AggregatorCollector` (one adapter per aggregator).

### 10.D Recommended architecture
Reuse the proven **Provider → Strategy → normalized-contract** discipline, as a
**new stateful subsystem** (not inside the search connector):
1. **Three reusable collectors, not ten:**
   - **`PdfIndexCollector`** (Pattern A) — ships covering Othaim + Farm; new
     PDF-index stores are **config additions, not code**.
   - **`AggregatorCollector`** (Pattern D) — start with **one** aggregator;
     instantly covers Panda, HyperPanda, Carrefour, Lulu, Danube, Tamimi,
     Manuel, Nesto for Riyadh.
   - **`StoreSessionCollector`** (Patterns B/C, later) — **reuses the live-search
     connector's existing sessions** (Panda API, Lulu Akinon, Danube Spree,
     Tamimi ZopSmart) for **structured** promo items: already normalized, feeds
     Pillar 3, and **sidesteps OCR**.
2. **Per-store Brochure Provider = ordered collector strategies (best-first)**,
   just like search (e.g. Othaim `[pdfIndex]`; Carrefour `[aggregator]`;
   Panda `[storeSession?, aggregator]`). Core stays store-agnostic.
3. **Proposed normalized Brochure contract** (same discipline as the 10-key
   result shape): `{ store, region, title, validFrom, validTo, detectedAt,
   sourceType: pdf|images|flipbook|api, sourceUrl, pdfUrl,
   pages: [{ index, imageUrl }], checksum }`.
4. **Stateful storage (new):** object store for PDFs/images (e.g. Cloudflare R2)
   + metadata store (KV/D1) + a **weekly Cron trigger** that polls providers,
   dedupes by `checksum`, keeps history (the basis for Pillar 3).

### 10.E Implementation order
1. **`PdfIndexCollector` → Othaim + Farm (Central/Riyadh).** Cleanest/official;
   proves the pipeline: **detect → download → store → dedupe → expose**.
2. **`AggregatorCollector` → one aggregator.** Unlocks the other 8 stores for
   Riyadh in one collector — max coverage per unit of code.
3. **`StoreSessionCollector`** reusing the 4 existing search sessions (Panda,
   Lulu, Danube, Tamimi) → structured promo → direct Pillar 3 input.
4. Upgrade individual stores from aggregator → official where it's worthwhile.

### 10.F Risks (maintainability-first)
- **Aggregator dependency (biggest):** third-party ToS + retailer copyright, can
  restructure/block, freshness lag, watermarks, app-gated detail. → treat as a
  *strategy* never the sole one; keep official PDFs primary; don't hard-depend on
  one aggregator.
- **Bot-protection churn (Carrefour, Lulu):** do **not** build bypass; prefer the
  session we own (Lulu) or the aggregator.
- **Weekly PDF URL churn (Othaim, Farm):** **always discover from the stable
  index; never hardcode a PDF URL.**
- **Region bundling:** "Central/Riyadh" isn't uniform (Farm bundles Riyadh +
  Eastern + Western in one PDF; Othaim has a discrete Central `pid`). Needs a
  per-store region map.
- **Price extraction is OCR-hard:** flyer PDFs are graphical; structured prices
  for Pillar 3 are a separate hard problem — `StoreSessionCollector` avoids it.
- **Storage growth & dedupe:** checksum-dedupe from day one.
- **Legal posture:** personal tool over public endpoints — keep snapshots
  private, poll gently (weekly Cron, not aggressive).

---

## 11. Brochure Engine — M1 Implementation (PdfIndexCollector, Othaim)

> **Status:** M1 **deployed & verified in production** (2026-07-01) at
> `https://brochure-engine.tamamoooo.workers.dev`, against the live Othaim site.
> Lives in the connector repo as a second Worker. Source of truth for the design
> is `brochure-engine/ARCHITECTURE.md`; this section records what was actually
> implemented, how it refines that design, and the production deployment (§11.E).

### 11.A What M1 delivers
The reference vertical slice proving the architecture: **detect → download →
dedupe → store → index → expose** for Othaim's Central (= Riyadh) weekly brochure,
via a **fully generic `PdfIndexCollector`**. Only M1 was built — **no** OCR, price
intelligence, frontend, `AggregatorCollector`, or `StoreSessionCollector`.

### 11.B Layout (all under `serverless-connector/brochure-engine/`)
```
src/
  contract.js              normalized BrochureDoc + edition/id/row helpers (§4/§5.2)
  engine.js                Core: CORS, routing, best-first collector dispatch, ingestAll, cron (§3/§6/§8)
  pipeline.js              checksum → dedupe → store → index, idempotent (§6.1)
  collectors/pdfIndex.js   the GENERIC PdfIndexCollector factory (§7.1)
  providers/othaim.js      PURE CONFIG: region map + Othaim-specific resolve (§5.3)
  storage/objectStore.js   ObjectStore interface: R2 impl + KV impl (§5)
  storage/metadataStore.js MetadataStore interface: D1 impl (§5.2)
  storage/local.js         fs + in-memory impls (dev/verify only)
  index.js                 Worker entry: registry + binding wiring + scheduled()
schema.sql                 D1 schema (§5.2) with ux_checksum unique index
dev.mjs                    local harness; `node dev.mjs selftest` runs the full E2E proof
wrangler.toml              second Worker: D1 + KV bindings + weekly cron
```
- **Discipline preserved exactly:** store-specific knowledge lives ONLY in
  `providers/othaim.js`. Core, collector, pipeline and storage never learn a
  store name. Provider→Strategy→normalized-contract mirrors the search connector.
- **Generic collector, Farm-ready:** adding Farm = a new `providers/farm.js`
  (its own `resolve`) + one registry line. **Zero** collector changes (§10.D.1).

### 11.C Verified behaviour (`node dev.mjs selftest`)
Run 1: detects `central-region-offers-corner`, downloads a real 908 KB `%PDF-`,
stores + indexes it as edition `2026-W27`. Run 2 (same week): **`deduped: 1,
new: 0`** — the checksum gate + `ux_checksum` unique index prevent a re-store.
`GET /brochures?store=othaim&region=central` returns the BrochureDoc;
`GET /asset/brochures/othaim/central/2026-W27/original.pdf` streams the PDF.

### 11.D Architectural refinements discovered during implementation
1. **Othaim's index moved.** The Discovery URL `…/othaim-promotions/?pid=18` is
   gone (404). The promotions index is now **`othaimmarkets.com/offers`**, a
   **Next.js App-Router** page backed by **Contentful**. The region→brochure map
   is delivered in the page's **RSC "flight" payload**; the weekly PDF is at
   `/api/pdfOffers/<brochureId>-<version>.pdf`. **Both** the id and version
   rotate weekly. Othaim's `resolve` therefore, every run: decodes the flight →
   finds the region by its **stable human slug** (`central-region-offers-corner`)
   → reads the current brochure id → locates the full weekly PDF filename. This
   is the §10.F "never hardcode the PDF URL" rule, realized. The old
   `pid`/`(\d+)\.pdf` regex from the design is obsolete; the slug is the durable
   key. (This churn is exactly why the collector resolves fresh each run.)
2. **Storage backend for M1 = D1 + KV, not R2.** R2 is **not enabled** on the
   Cloudflare account (`code: 10042`, dashboard action required) and the OAuth
   token lacks R2 scope. Per the storage-interface design (§5) and the
   architecture's own KV fallback (§5.2/§12), M1 uses **D1 for metadata + KV for
   bytes**. A ~1 MB brochure fits KV's 25 MiB limit comfortably. **Swapping to R2
   later is a one-line binding change + swapping `createKvObjectStore` for
   `createR2ObjectStore`** in `index.js` — nothing upstream changes. R2 /
   long-term storage is deferred to a later milestone (per direction).
3. **Repo placement = inside the connector repo** (no third repo), as a second
   self-contained Worker. Search Worker at root is untouched.
4. **Transient-retry hardening.** Othaim's origin occasionally returns a
   transient 502 (observed during verification) — same behaviour the connector
   already hardens for Danube (§5). The collector's fetch now retries **once** on
   5xx/429/network with a short backoff; 4xx (except 429) is final.

### 11.E Deployment — LIVE IN PRODUCTION (verified 2026-07-01)
**Production URL:** `https://brochure-engine.tamamoooo.workers.dev`
(separate Worker from the search connector at
`https://shopping-connector.tamamoooo.workers.dev` — different deployment, same
repo, same Cloudflare account `tamamoooo@gmail.com`).

**Cloudflare resources (M1):**
- **Worker:** `brochure-engine` · weekly Cron `0 6 * * 1` (Mon 06:00 UTC).
- **D1 database:** `brochure-engine`, id `50bbe1ea-aca0-4f1d-abfd-c586335d82ba`
  (region EEUR). Schema (`schema.sql`) applied `--remote`; `ux_checksum` unique
  index present.
- **KV namespace (object store):** `BROCHURES_KV`,
  id `38b0639256a34d1ebd7d96dcb55d0a9b`. Holds the PDF bytes + `meta.json`
  (R2 still not enabled; KV is the approved M1 fallback, one-line swap later).
- **Secret:** `INGEST_SECRET` (Worker secret, guards `POST /ingest`). Not
  committed; rotate with `npx wrangler secret put INGEST_SECRET`.

**How it was deployed (repeatable, from `brochure-engine/`):**
```
npx wrangler d1 execute brochure-engine --remote --file=./schema.sql
printf '%s' "<secret>" | npx wrangler secret put INGEST_SECRET
npx wrangler deploy
```
Redeploys are just `npx wrangler deploy` (idempotent; the ingest dedupes).
Local dev still needs no cloud: `node dev.mjs` / `node dev.mjs selftest`.

**Production end-to-end verification (all ✅):** Worker reachable (`GET /` 200);
Othaim collector `detected:1` for Central/Riyadh; PDF downloaded (929,931 bytes,
`%PDF-`); **duplicate detection post-deploy** (2nd `POST /ingest` →
`deduped:1, new:0`); metadata written (D1 row + `meta.json`); read API returns
the expected BrochureDoc (`othaim:central:2026-W27`); asset retrieval streams the
PDF with a **byte-exact sha256 match** to the recorded checksum
(`3ec0bce0…3528f607`); **no regression** to the search Worker (healthy, 6
providers, live search returns results).

**Production-specific findings / notes:**
- **First-request `error code: 1042`** immediately after the first deploy — the
  workers.dev route was still propagating. Resolved itself within ~seconds
  (retry with backoff). Expected for a brand-new workers.dev subdomain; not a
  code fault. Retry-on-deploy if you see it.
- **`workers.dev` + Preview URLs enabled by default** (wrangler warned, because
  neither is pinned in `wrangler.toml`). Fine for M1 (we *want* the public
  read API). To lock down later, set `workers_dev`/`preview_urls` explicitly.
- `wrangler secret put` on a not-yet-deployed Worker **created the Worker first**
  (non-interactive fallback "yes"), then `deploy` uploaded the code — harmless
  ordering, noted so it isn't mistaken for a stray Worker.
- The public read endpoints are intentionally CORS-open (frontend will call
  them); `POST /ingest` is the only guarded route.

### 11.F API surface implemented (§8)
- `GET /` — health + `held` (current store/region/edition list).
- `GET /brochures?store=&region=` — current BrochureDoc(s); omit `store` → all current.
- `GET /brochures/history?store=&region=` — prior editions (Pillar 3 substrate).
- `GET /asset/<key>` — streams stored PDF/meta bytes.
- `POST /ingest?store=` — guarded by `X-Ingest-Secret`; cron calls `ingestAll` directly.

### 11.G M2 roadmap — `AggregatorCollector` (next)
Per ARCHITECTURE.md §7.2 / §9. One new collector + one adapter unlocks the other
8 stores for Riyadh in one unit of code.
1. **Add `collectors/aggregator.js`** — a second collector factory emitting the
   same `Candidate[]` (`{ doc, bytes, contentType }`), `sourceType: "images"`,
   checksum over concatenated page-image bytes. Adapter interface:
   `{ name, listBrochures(storeKey, city) → { pages:[imageUrl], validFrom, validTo, sourceUrl } }`.
2. **Pick one aggregator** — recommend **ClicFlyer** (broadest KSA coverage,
   Discovery §10.B); confirm before building. One adapter first.
3. **Wire as a fallback, never sole** — for stores that also have an official
   collector, the aggregator sits *after* it in the provider's `strategies`
   (best-first dispatch already supports this: `collectBestFirst` in engine.js
   tries the next collector only if the prior yields nothing). New aggregator-only
   stores (e.g. Manuel) get a provider with `strategies: [aggregator]`.
4. **`pages[]` now populated** — the contract already carries `pages:[{index,
   imageUrl}]`; store each page image in the object store under the edition prefix.
5. **No collector/pipeline/Core changes needed** beyond the new collector +
   provider configs — that's the payoff of the M1 abstractions.

Deferred beyond M2 (unchanged from §9/§10.E): `StoreSessionCollector` (M3, feeds
Pillar 3, OCR-free), Farm as a second `PdfIndexCollector` config, R2/long-term
storage, and PDF→page-image rendering for PDF sources.

---

## 12. Brochure Engine — M2 Implementation (AggregatorCollector, OffersInMe)

> **Status:** M2 **deployed & verified in production** (2026-07-02) at
> `https://brochure-engine.tamamoooo.workers.dev`, against the live aggregator.
> One reusable `AggregatorCollector` + one adapter covers 7 additional stores for
> Central/Riyadh. Source of truth for the design is `brochure-engine/ARCHITECTURE.md`
> §7.2/§9; this section records what was actually built and how it refines the plan.
>
> **⚠️ SUPERSEDED (2026-07-02) — see §15.** The **OffersInMe** adapter this section
> describes has been **removed**. The reusable `AggregatorCollector` remains; only
> its adapter changed to **D4D Online**, plus a new official-offers-page fallback.
> Read §12 for the collector/pipeline design that still holds; read **§15** for the
> current aggregator and fallback behaviour. Any OffersInMe specifics below (slug
> maps, `central-province` include matchers, the OffersInMe URL scheme) are history.

### 12.A What M2 delivers
The second reusable collector, proving the aggregator pattern end-to-end:
**detect → download page images → dedupe → store → index → expose** for 7 stores
that have no reliable official web brochure, via a **fully generic
`AggregatorCollector`** driven by an **adapter** (one per aggregator) and
**per-store region config**. Only M2 was built — **no** OCR, Price Intelligence,
`StoreSessionCollector`, or frontend. M1 (Othaim PDF) was not modified.

**Stores now covered (all Central/Riyadh):** Othaim (M1, official PDF) + **Hyper
Panda, Carrefour, LuLu, Danube, Tamimi, Manuel, Nesto** (M2, aggregator images).
= **8 providers held in production.**

### 12.B Aggregator chosen: OffersInMe (not the Discovery's ClicFlyer)
ARCHITECTURE §12.3 *recommended* ClicFlyer "confirm before building." On
inspection **ClicFlyer's web frontend returns HTTP 503 to every datacenter
request** (WAF-blocks non-residential IPs) — unusable from a Cloudflare Worker.
**OffersInMe** (`ksa.offersinme.com`) server-renders clean, fetchable pages for
all target stores and was reachable, so it is the M2 adapter. The collector is
adapter-driven precisely so this is a **one-line swap** (§10.F risk #1: "don't
hard-depend on one aggregator"); adding ClicFlyer/Tiendeo later = a new adapter,
zero collector change.

**OffersInMe shape (verified live):** store page
`ksa.offersinme.com/hypermarkets/<slug>-offers` → links to
`/leaflet/<slug>-<leafletId>`; each leaflet page carries `Valid from/to` dates and
page images at `offersin.me/leaflet/Y/M/D/<leafletId>/<leafletId>-<n>-<slug>.<ext>`
(`<ext>` = webp or jpeg; `<n>` = 0-based page index).

### 12.C New/changed files (all under `brochure-engine/`)
```
src/collectors/aggregator.js          NEW  generic AggregatorCollector factory (§7.2)
src/collectors/adapters/offersinme.js NEW  the OffersInMe adapter (aggregator-generic)
src/providers/{hyperpanda,carrefour,lulu,danube,tamimi,manuel,nesto}.js  NEW  PURE CONFIG
src/scheduler.js                      NEW  Architecture C: runFanOut + SELF dispatcher (§12.E/§12.H)
src/pipeline.js                       EDIT additive image-set path (PDF path byte-unchanged)
src/engine.js                         EDIT register-agnostic Core (pickStalestStore removed — no longer needed)
src/index.js                          EDIT register 7 providers; fan-out scheduled() via SELF binding
dev.mjs                               EDIT register providers; selftest now M1 + M2
wrangler.toml                         EDIT cron Tue+Wed all-stores fan-out; + SELF service binding (§12.E)
```
- **Discipline preserved:** store knowledge lives ONLY in the 7 provider files
  (each ~15 lines: OffersInMe slug + region matcher). The collector is
  aggregator-agnostic; the adapter is store-agnostic; Core/pipeline/storage never
  learn a store name. Adding an aggregator store = one provider file + one
  registry line (§10.D.1).
- **Region map (§5.3) is per-provider and non-uniform, by necessity:** LuLu tags
  leaflets `central-province` (provider sets `include:/central-province/`); Manuel
  publishes per-city `riyadh-…`/`jeddah-…` (`include:/riyadh/`); Hyper Panda /
  Carrefour / Danube / Tamimi are national (default other-region `exclude`); Nesto
  mixes national + Dammam (default `exclude` drops the Eastern flyers). This is
  exactly the "region bundling not uniform" risk (§10.F) that the region map answers.

### 12.D Architectural refinements discovered during implementation
1. **Image-set pipeline path (additive).** A collector may now emit
   `{ doc, pages:[{index,bytes,contentType,url}] }` (images) as well as the M1
   `{ doc, bytes, contentType }` (PDF). The pipeline stores each page as
   `…/<edition>/pageNN.<ext>`, sets `doc.pages=[{index,imageUrl}]`, and computes the
   **checksum over the page bytes concatenated in page order** (§4/§7.2). The PDF
   branch is byte-for-byte unchanged (M1 intact). Realizes §5.1 "original.pdf … or
   /pageNN.jpg for image sets."
2. **`pages[]` live in `meta.json`, not the D1 row.** The `brochures` table has no
   pages column (M1 schema, unchanged — no migration). So `GET /brochures` returns
   `pages:[]` (the row projection), and the populated `pages[]` (with object keys)
   is in the stored **`meta.json`**: fetch `GET /asset/brochures/<storageKey>/meta.json`,
   then stream any page via `GET /asset/<imageUrl>`. Verified in production.
3. **One brochure per store+region+edition (§4).** A store may run several
   concurrent leaflets; the collector selects the single **most current** one
   (validity window contains today → else latest `validTo` → else newest id), which
   keeps the contract's one-per-store+region identity and avoids `id` collisions.
4. **Panda ≡ Hyper Panda on the aggregator.** OffersInMe merges Panda into a single
   `hyper-panda-offers` listing (plain `panda-offers` redirects away), and Discovery
   §10.B records they share promos. Modeled as **one** `hyperpanda` provider (also
   required by the global `ux_checksum` dedupe: two providers ingesting identical
   bytes could not both be stored). Panda is covered *through* Hyper Panda.
5. **Bounded work per run:** collector caps `maxCandidates=4` leaflet fetches +
   `maxPages=40` image downloads (≈45 subrequests/store) — gentle (§10.F legal
   posture) and within the Worker subrequest budget (see §12.E).

### 12.E Scheduler — Architecture C: Self Service-Binding Fan-out (FINAL)
The account is on the **Workers Free plan (50 external subrequests / *invocation*)**.
An image-set store pulls ~45 subrequests, so ingesting all 8 stores in **one**
invocation overflows the budget (`Too many subrequests`). The **key platform
fact** the final design exploits: the 50-limit is **per invocation**, and every
Worker invocation gets its **own fresh budget**.

**An interim design** (now replaced) ran a **daily** cron refreshing **one
stalest store per fire** (`pickStalestStore()`), which kept each invocation in
budget but **spread the 8 stores across ~8 days**. That is **unacceptable**:
Saudi brochures drop on a single publication day (Tue/Wed), so all stores must
refresh **together**, not staggered. A full architecture comparison (independent
invocations, queues, workflows, service bindings, cron fan-out) was done and
**Architecture C was approved** — it is the only option that refreshes all stores
together **on the Free plan at $0**, with the smallest change and a replaceable
mechanism.

**Architecture C — how it works (see `src/scheduler.js`, `src/index.js`):**
- The cron fires **Tue + Wed at 06:00 UTC** (`0 6 * * 2,3` = 09:00 AST). Each
  fire refreshes **all 8 stores together**.
- `scheduled()` **fans out** to one **independent child Worker invocation per
  store** via a **`SELF` service binding** (`wrangler.toml [[services]] binding =
  "SELF"`). Each child runs the existing, already-budget-safe single-store ingest
  (`POST /ingest?store=<id>`, ~45 subrequests) and carries its **own fresh
  50-subrequest budget** — so the all-stores refresh fits Free. The coordinator
  itself makes only **8 service-binding calls** (≪ 50) and touches no storage, so
  it stays trivially within its own budget/CPU (1 coordinator + 8 children = 9
  invocations, well under the 32-per-request cap).
- **Running both Tue AND Wed** catches whichever day the brochures actually drop;
  the pipeline's **checksum dedupe** makes the second fire (and any re-fire) free
  of extra writes.
- **Replaceable by design (a requirement):** the fan-out *mechanism* is isolated
  behind a single `dispatchStore(storeId)` function. `runFanOut` (the
  store-agnostic "refresh every registered store concurrently" policy) never
  learns *how* a store is dispatched. Migrating to another Cloudflare-native
  scheduler (e.g. a **Queue** producer+consumer, if the project ever moves to a
  paid plan for stronger delivery guarantees) is a swap of the dispatcher factory
  in `scheduler.js` — the collectors, pipeline, storage, and Core stay unchanged.
- **On-demand refresh** is unchanged: `POST /ingest?store=<id>` (single store, the
  same path the fan-out invokes). `POST /ingest` (all stores in one invocation)
  remains best-effort / paid-plan-only and is **not** how the cron works.

### 12.F Production verification (all ✅, 2026-07-02)
- **Deployed:** `npx wrangler deploy` (D1 + KV bindings unchanged; no schema
  migration). Health `GET /` → 200, 8 providers listed.
- **All 7 aggregator stores ingested** via `POST /ingest?store=<id>`: each
  `detected:1, new:1, failed:0`. `GET /brochures` → **8 current brochures held**
  (7 `sourceType:images` + Othaim `pdf`), each with a distinct `sha256:` checksum.
- **Dedupe:** re-ingesting LuLu → `deduped:1, new:0` (checksum gate + `ux_checksum`).
- **Expose:** an image brochure's `meta.json` lists 40 page keys; `GET /asset/…/page00.webp`
  streams `image/webp` (168 KB).
- **M1 intact:** Othaim still `sourceType:pdf`, edition `2026-W27`, PDF streams
  929,931 bytes `%PDF-` with the **same checksum `3ec0bce0…`** recorded in §11.E.
- **No search-connector regression:** `GET /` ok (6 providers), `panda` "milk"
  search returns 30 live results.
- **Local proof:** `node dev.mjs selftest` runs M1 (Othaim PDF) **and** M2 (LuLu
  images) end-to-end (dedupe, read, page-asset). `node dev.mjs selftest <store>`
  targets any aggregator store.

### 12.G Notes, caveats & M3 roadmap
- **INGEST_SECRET was rotated this session** to run the production verification
  ingests (the prior value was unknown/uncommitted). It remains a Worker secret
  (not committed); rotate again with `npx wrangler secret put INGEST_SECRET`.
- **Aggregator data freshness (expected, not a bug):** as of 2026-07-02 OffersInMe's
  freshest Central flyers pre-date today (marked internally by `validTo`); **Danube
  and Manuel lag notably** (~2025-09 on the aggregator). The engine faithfully stores
  the **latest available** flyer and records `validFrom/validTo`, so staleness is
  visible. A **freshness monitor** (ARCHITECTURE §11) — alert when a store hasn't
  refreshed in N weeks — is the natural follow-up.
- **Price History (Pillar 3) is now BUILT as a Brochure Engine feature — see §13.**
  Per the Roadmap (§0), the former "M3" `StoreSessionCollector` is **deferred**;
  Price History was built instead, *inside* this same Worker (not a separate
  service), anchoring price points to brochure editions. The **next build is
  Personal Alerts** (§0/§9). (`StoreSessionCollector` remains a *possible later*
  Pillar 3 input, only after Alerts + the Unified Frontend, and only if still
  warranted.)
- **Deferred (per §0):** `StoreSessionCollector`, OCR / brochure price extraction,
  AI/LLM extraction, advanced analytics, and any paid Cloudflare features (R2 /
  long-term storage, paid Queues/Workflows). Also deferred: Farm as a second
  `PdfIndexCollector` config, PDF→page-image rendering, and a second aggregator
  adapter (e.g. Tiendeo) for cross-checking freshness.

### 12.H Scheduler finalization — Architecture C, deployed & verified (2026-07-02)
The last piece of M2: replacing the interim one-store-per-day rotation (§12.E)
with **Architecture C (Self Service-Binding Fan-out)** so all 8 stores refresh
**together** on the Tue+Wed publication days, still on the **Free plan**. Design
approved after a full comparison of Cloudflare-native options (independent
invocations, queues, workflows, service bindings, cron fan-out); C won on **$0
cost + smallest change + replaceable mechanism**.

**What changed (scheduler only; collectors/providers/pipeline/storage untouched):**
`src/scheduler.js` (new: `runFanOut` + `createServiceBindingDispatcher`),
`src/index.js` (`scheduled()` now fans out via `env.SELF`), `src/engine.js`
(dead `pickStalestStore` removed), `wrangler.toml` (cron `0 6 * * 2,3` + `SELF`
service binding). Deployed version `686f6bfe`.

**Production verification (all ✅, 2026-07-02):**
- **Deploy:** `npx wrangler deploy` — bindings now `DB` (D1) + `BROCHURES_KV` (KV)
  + **`SELF` (Worker, the fan-out target)**; schedule `0 6 * * 2,3`.
- **Fan-out orchestration** unit-checked (isolated `runFanOut` + dispatcher):
  a failing store does not block others; the dispatcher hits
  `POST /ingest?store=<id>` on `SELF` with the ingest secret; missing `SELF`
  fails fast.
- **`scheduled()` runs on the edge:** triggered the real handler via
  `wrangler dev --remote --test-scheduled` → `Ran scheduled event` HTTP 200, no
  throw. *(Caveat: that test harness cancels `ctx.waitUntil` after the handler
  returns — a harness limitation, not real-cron behaviour. Real Cron Triggers
  await the I/O-bound `waitUntil`; the coordinator is almost pure I/O-wait so it
  stays within the CPU budget.)*
- **All 8 stores refresh together, in budget (the substantive proof):** fired the
  exact per-store work the fan-out dispatches — **8 concurrent `POST /ingest?store=<id>`
  against production** — **all completed in 28 s wall-clock**, each
  `detected:1, failed:0`, **no `Too many subrequests` anywhere** (each child had
  its own 50-budget), and **all `deduped:1`** (checksum gate recognised the
  unchanged M2 content → idempotent, zero extra writes).
- **M2 intact:** `GET /brochures` → **8 held** (7 `images` + Othaim `pdf`).
- **M1 no regression:** Othaim PDF streams **929,931 bytes `%PDF-`** with the
  **same sha256 `3ec0bce0…3528f607`** recorded in §11.E.
- **No search-connector regression:** `GET /` ok (6 providers); `panda` "milk"
  → 30 live results.
- **Local proof unchanged:** `node dev.mjs selftest` still runs M1 (Othaim PDF) +
  M2 (LuLu images) end-to-end green.

**Notes / caveats:**
- **`INGEST_SECRET` was rotated this session** to run the production fan-out
  verification (prior value uncommitted/unknown, per §12.G). Still a Worker secret
  (not committed); rotate with `npx wrangler secret put INGEST_SECRET`.
- **Post-rotation propagation race (expected):** immediately after rotating the
  secret, one of the 8 concurrent ingests (`tamimi`) hit an edge isolate still
  holding the pre-rotation secret → a one-off `403`; it succeeded on retry seconds
  later once propagation settled. Not a code fault — allow a few seconds after
  rotating before hammering `/ingest`.
- **Cron day/time are tunable** in `wrangler.toml`; Tue+Wed 06:00 UTC (09:00 AST)
  is the current best guess for Saudi publication timing — adjust if observed
  drops differ.

---

## 13. Price History — Implementation (Pillar 3, a Brochure Engine feature)

> **Status:** **deployed & verified in production** (2026-07-02) at
> `https://brochure-engine.tamamoooo.workers.dev`. Built **inside the existing
> Brochure Engine Worker** (approved direction: "Price History is a feature of the
> Brochure Engine, not an independent service"). No new Worker, no new database —
> one new D1 table + one service binding. M1 and M2 are **byte-for-byte intact**.

### 13.A The model (why it's brochure-anchored)
Price History records, per tracked product, **the lowest historical price, where
it occurred, and when** — the milestone's exact requirement. The design decisions,
forced by the constraints (Free plan; **no OCR, no `StoreSessionCollector`, no AI
extraction, no paid services, no frontend**):
- **Brochures are the backbone of the history.** Each price point is **anchored to
  a store's current brochure edition**: the **edition is the *when*** (the weekly
  bucket), the **store is the *where***. The Brochure Engine already retains
  editions as history (§11/§12), so those editions *are* the price-history
  skeleton — a product only accrues history for a store during weeks that store
  has a brochure. This is what makes brochure prices (not a daily poller) the
  primary source of the lows.
- **The search connector supplies only the price *number*.** Brochure images would
  need OCR (out of scope), so the one automated price source is the live search
  connector. Its **current** price is sampled **once per brochure edition** (weekly,
  on the existing brochure cron) — **not** a daily search-driven time-series. Live
  "current market price" display remains the connector's existing job.
- **Lowest-ever is derived, not stored** (kept simple for a personal tool):
  `MIN(price)` over the edition-anchored points, carrying that point's store
  (*where*) and edition/`observedAt` (*when*). Ties keep the **earliest**
  occurrence.

### 13.B What was built (all additive, inside `brochure-engine/`)
```
schema.sql                     EDIT  + price_points table + ux_price_point unique index (brochures table untouched)
src/storage/priceStore.js      NEW   D1 PriceStore: record (idempotent) / getHistory / getLowest / listProducts
src/storage/local.js           EDIT  + in-memory PriceStore (dev/selftest parity)
src/priceHistory.js            NEW   contract (PricePoint), recordPrices (edition-anchored capture), read shaping, CONNECTOR search clients
src/products.js                NEW   PURE CONFIG watchlist (milk, eggs) — the only place a store name appears
src/engine.js                  EDIT  + GET /lowest, /prices, /prices/history; + guarded POST /prices/record; health lists products
src/index.js                   EDIT  build priceStore + CONNECTOR search client into ctx; scheduled() captures prices AFTER the brochure fan-out
wrangler.toml                  EDIT  + [[services]] CONNECTOR = shopping-connector (reach the search engine)
dev.mjs                        EDIT  + offline deterministic Price History selftest (node dev.mjs pricetest | selftest)
```
- **Discipline preserved:** store knowledge lives ONLY in `products.js`. The Core,
  `priceHistory`, pipeline and storage never learn a store name. A product only
  gets points at stores present in **both** engines (LuLu, Tamimi, Danube, and
  Panda via brochure id `hyperpanda` ≡ search id `panda`).
- **No regression by construction:** M1/M2 code paths are unedited; Price History
  is new files + additive routes/wiring sharing the same D1 binding.

### 13.C API surface (added)
- `GET /lowest?product=<id>` → `{ product, lowest: { price, store, edition, observedAt, … } }` — the headline (price + where + when).
- `GET /prices?product=<id>` → lowest-ever + latest price per store.
- `GET /prices/history?product=<id>` → the full time series (Pillar 3 substrate).
- `POST /prices/record` → guarded by `X-Ingest-Secret`; runs the capture now. The
  cron calls `recordPrices` directly (no HTTP) after the brochure fan-out.
- `GET /` health now lists `priceHistory: { products, tracked }`.

### 13.D Scheduling & budget (reuses the existing weekly cron)
No new cron. The existing Tue+Wed fan-out (`scheduled()`, §12.H) now, **after** the
brochure fan-out completes (so the current editions it anchors to are committed),
runs `recordPrices` in the **coordinator** invocation. Capture makes only a handful
of cheap `CONNECTOR` search calls (no image downloads), so it stays far inside the
Free-plan 50-subrequest budget. If the watchlist ever grows large, the same
Architecture-C `SELF` fan-out (one child per product) applies — the capture is
already isolated behind `recordPrices`.

### 13.E Production verification (all ✅, 2026-07-02, version `500a773c`)
- **Schema applied** `--remote` (now 2 tables; `brochures` untouched). **Deployed**
  with bindings `DB` (D1) + `BROCHURES_KV` (KV) + `SELF` + **`CONNECTOR`
  (shopping-connector)**.
- **Live capture** (`POST /prices/record`): **8 points recorded** (`milk`+`eggs` ×
  lulu/tamimi/danube/hyperpanda), each anchored to that store's **real** current
  edition (lulu `2026-W26`, tamimi `2026-W26`, danube `2025-W37`, hyperpanda
  `2026-W20`), price from the live connector (e.g. LuLu milk **7 SAR**, Almarai).
- **Idempotent:** re-record → **`deduped: 8, recorded: 0`** (the `ux_price_point`
  unique index).
- **Reads:** `GET /lowest?product=milk` → 7 SAR @ lulu @ `2026-W26`;
  `/lowest?product=eggs` → 13.95 @ lulu @ `2026-W26`; `/prices/history?product=milk`
  → 4 points; health `tracked: [milk, eggs]`.
- **M1 no regression:** Othaim still edition `2026-W27`, `sourceType:pdf`, PDF
  streams **929,931 bytes `%PDF-`** with the **same sha256 `3ec0bce0…3528f607`**
  (§11.E). **M2 no regression:** `GET /brochures` → **8 held**. **Search connector
  no regression:** `GET /` ok (6 providers), `panda` "milk" → 30 live results.
- **Local proof:** `node dev.mjs pricetest` (offline, deterministic) proves
  edition-anchoring, dedupe, lowest (price/where/when), lows-only-drop, and
  brochure-less stores are skipped. `node dev.mjs selftest` runs **M1 + M2 + Price
  History** end-to-end green.

### 13.F Notes, caveats & next (Personal Alerts)
- **`INGEST_SECRET` rotated this session** to run the guarded `/prices/record`
  verification (prior value uncommitted, per §12.G). Still a Worker secret (not
  committed); rotate with `npx wrangler secret put INGEST_SECRET`. Same
  post-rotation propagation race applies — allow a few seconds (the verification
  succeeded on attempt 1 after a short wait).
- **Match quality is best-effort (TODO §9.6).** Capture takes the connector's
  **best-ranked** result for the query, which can mis-match loosely (observed:
  "milk" → "Choco Leibniz Milk Chocolate Biscuit" at Danube). The mechanism is
  correct; sharpen with a per-product `match` rule or explicit per-store product
  ids where it matters. Keep watchlist queries specific.
- **Watchlist is intentionally tiny** (`milk`, `eggs`) — a personal tool. Add
  products by editing `src/products.js` only.
- **Next milestone — Personal Alerts (§0/§9):** set a target price per tracked
  product; notify when a captured point drops below it. Builds directly on these
  edition-anchored points and the same weekly capture. Still Free plan, $0.

### 13.G Replaceable price source (by design)
The **price *source* is a swappable seam**, so it can be replaced later (e.g. by
**brochure parsing**) **without redesigning the feature**. Everything that defines
Price History — the `PricePoint` contract, the **brochure-edition anchoring**
(store = *where*, edition = *when*), idempotent capture + `ux_price_point` dedupe,
the derived lowest-ever, the D1 `price_points` table, and the read API
(`/lowest`, `/prices`, `/prices/history`) — is **source-agnostic** and stays
unchanged. Only the price *number* comes from an injectable source:
- `recordPrices(ctx, { products, searchClient })` takes the source as a
  **parameter**; it is never hard-wired. The source contract is tiny —
  `search(provider, query) → results[]` — and the price is extracted by the
  isolated `pickPricedResult(results)` helper in `src/priceHistory.js`.
- Today that source is the **search connector** via the `CONNECTOR` service
  binding (`createServiceBindingSearchClient`), with an HTTP variant for dev
  (`createHttpSearchClient`). The `dev.mjs` selftest already swaps in a scripted
  in-memory source — proof the seam is real.
- **To change the source later** (e.g. a brochure-price parser once OCR/structured
  extraction is in scope, or a `StoreSessionCollector`), write one new
  source object honoring that contract (returning a price for the anchored
  product/store) and pass it to `recordPrices`. **No change** to the contract,
  anchoring, storage, dedupe, lows, scheduling, or read API. This keeps the
  approved model — *brochures are the history backbone; the price number is
  pluggable* — future-proof.

---

## 14. Unified Interface — Integration (Pillars 1+2+3 on the search page)

> **Status:** **first pass complete & verified** (2026-07-02). A **frontend-only**
> integration of the three already-built pillars into the **existing** Souq search
> page. No redesign, no new backend service, no architecture change, and **Alerts
> deliberately NOT built** (per direction). The goal was **usability, not visual
> polish** — get the system into real daily use so gaps surface (they did, §14.D).

### 14.A What this milestone delivers
The search page (Pillar 1, unchanged) now also shows, inline and read-only:
1. **Historical lowest price (Pillar 3).** A **"Lowest recorded" banner** above the
   results — **price + store (where) + date (when)** + the matched product name
   (linked to the store page) — shown when the query is a **tracked product**
   (milk/eggs). Sourced from the Brochure Engine `GET /lowest?product=<id>`.
2. **Brochure availability + in-app viewer (Pillar 2).** Each store section carries
   a **"📖 Weekly flyer"** button that opens that store's **current brochure in an
   in-app viewer** (§14.F). The page images are served **through the Brochure
   Engine** (`/asset/…`), so the user **never leaves Souq** for the external
   aggregator. Availability comes from `GET /brochures`; the page list from the
   stored `meta.json`. Shown for the stores present in both engines — **Panda**
   (brochure id `hyperpanda`), **Tamimi, Danube, Lulu**; **Amazon/Noon** have no
   brochure, so no button.

Both work in **All-stores** and **Single-store** modes.

### 14.B How it was built (files, all in the frontend repo)
```
src/brochure.js   NEW  the ONLY place the frontend knows the Brochure Engine: its
                       URL, the search-id→brochure-{store,region} map (panda→
                       hyperpanda/central, lulu/tamimi/danube→central), the tiny
                       query→product matcher (milk/eggs, mirrors §13 products.js),
                       and thin readers loadBrochures()/brochureForStore()/
                       lowestForProduct()/storeLabel() + assetUrl()/
                       loadBrochurePages() (page images served THROUGH the engine).
                       Never throws.
src/app.js        EDIT additive rendering only: prependLowestBanner(), fillFlyer()
                       (opens the viewer), openBrochureViewer() + brochureDateLabel()
                       (the in-app viewer, §14.F), a flyer slot in storeSection(),
                       calls in runSingle/runMulti, loadBrochures() warmed at
                       startup. Core/providers/result contract UNTOUCHED.
styles.css        EDIT additive: .price-history/.ph-* banner, .store-flyer button,
                       .store-flyer-slot, .store-meta, and the .bv-* viewer (overlay,
                       panel, stage, controls). Reuses the existing palette
                       (var(--brand)/--grad/--brand-soft) — no redesign.
```
- **Discipline preserved (project rule 2):** every Brochure-Engine specific fact
  (URL, store-id mapping, tracked products) lives in `src/brochure.js`. The Core,
  the search providers, and the 10-key result contract are unchanged.
- **Read-only & best-effort:** the page only *reads* the Brochure Engine's public
  API. Every call is wrapped so an unreachable/erroring engine simply renders
  **nothing extra** — the live search is never blocked or altered. Calls are also
  **token-guarded** (the same `inFlight` token search uses), so a newer search
  cancels a stale banner/flyer render. `/brochures` is fetched **once per page
  visit** and cached (flyers change weekly — gentle polling, per §10.F).

### 14.C Verification (live, via the local dev server + real engines)
Ran the real page (`node server.js` / preview) against the **production** search
connector and Brochure Engine:
- **All-stores "milk":** banner → **"Lowest recorded · 7.00 SAR · at Lulu ·
  Jul 2, 2026"**, product name linked; flyer buttons present on Panda/Tamimi/Danube/
  Lulu, **absent** on Amazon/Noon; base search unaffected (168 results / 6 stores).
- **In-app viewer (Lulu flyer):** opens an overlay titled **"Lulu"** with date
  **"Jun 24, 2026 – Jun 30, 2026"**, counter **"1 / 40"**, first image loaded from
  **`brochure-engine…/asset/brochures/lulu/central/2026-W26/page00.webp`** (served
  through the engine, `naturalWidth` 709 — **not** an aggregator URL). Verified:
  **Next** advances (3/40, page02.webp) and enables **Prev**; **zoom-in** ×2 sets
  the image to 200% and enables **zoom-out**; paging resets zoom; **Next** disables
  at **40/40**; background scroll is locked while open; **Esc** (and the ✕ / backdrop)
  closes and restores scroll.
- **Single-store Lulu "milk":** banner + a `.store-meta` flyer bar render above the
  grid in the right order (`price-history`, `store-meta`, results).
- **Untracked "chocolate":** **no** price banner (correct); flyer still shown for a
  brochure store (Danube), and the empty flyer bar is removed for Amazon.
- **No console errors.** (Preview **screenshots time out on the external product
  images** in the results grid — a known constraint, §8 — so verification was
  DOM-based via `preview_eval`, the documented approach. The *viewer's* images load
  fine; they are engine-served, not external.)

### 14.D Usability issues & missing features found through real use
Captured as TODO §9.2; summarized here as the milestone's evaluation output:
- **History covers only 2 products, with no discoverability cue.** The banner only
  appears for milk/eggs (the §13 watchlist), and nothing tells the user which
  queries have history. Biggest felt gap. → grow `products.js` and/or hint tracked
  terms.
- **Flyer is store-level, not product-level.** The viewer opens the whole brochure;
  it doesn't jump to the searched product (needs OCR — out of scope, §0).
- **Flyer staleness is invisible.** Some current flyers are old (Danube `2025-W37`,
  Hyper Panda `2026-W20`) but look as fresh as a current one. Surfacing `validTo`
  would help (ties into the §12.G freshness monitor).
- **Lowest-ever shown without today's price.** The user can't tell at a glance if
  *now* is a good deal. A **current-vs-lowest** comparison is the obvious next
  step — and is Alerts-adjacent (the banner is the natural place for an Alerts
  target control, §9.1).

### 14.E What was intentionally NOT done
- **No Alerts** (the next milestone, §0/§9.1) — not started, by direction.
- **No new backend / no architecture change** — pure frontend integration reading
  existing public APIs; the connector and Brochure Engine were not modified. The
  engine *already* downloads and serves brochure page images (§12.D.1), so the
  in-app viewer needed **zero** engine change — it just reads `meta.json` + `/asset`.
- **No redesign** — existing components, layout, and palette reused; additions are
  a banner, a flyer button, and a modal viewer, all in the existing style.
- **No OCR, no product detection** in the viewer — it is a plain page flipper.

### 14.F In-app brochure viewer (v1)
A simple full-screen modal (`openBrochureViewer` in `src/app.js`, `.bv-*` in
`styles.css`) that flips through the brochure's page images. **The user never
leaves the app**, and no page ever loads from the external aggregator — every
image streams from the Brochure Engine's `/asset/<key>` (the engine downloaded
and stored them during ingest, §12.D.1). v1 scope exactly as requested:
- **Prev / Next** page navigation (buttons + ◀/▶ arrow keys; disabled at the ends).
- **Page counter** (`n / total`).
- **Zoom** in/out (1×–3×, buttons + `+`/`-` keys; resets on page change; when
  zoomed the stage scrolls/pans).
- **Store name** and **brochure date** (the validity window `validFrom – validTo`,
  else the edition) in the header.
- **Close** via ✕, the backdrop, or `Esc`; background scroll is locked while open.

How pages are found: `/brochures` returns the current BrochureDoc but with an
empty `pages:[]` (the D1 row omits them, §12.D.2). The viewer therefore reads the
stored **`meta.json`** at `/asset/brochures/<storageKey>/meta.json`, which lists
`pages:[{ index, imageUrl }]`, and streams each `imageUrl` via `/asset`. All the
overlapping search stores are `sourceType:images` (LuLu/Tamimi/Danube/Hyper Panda),
so every flyer the search page can show is viewable. (Othaim is a PDF but is not a
search store, so it never surfaces here; a PDF branch is a future addition if an
official-PDF store ever becomes searchable.)

**Follow-ups (nice-to-have, not v1):** thumbnail strip / jump-to-page, pinch-zoom
and swipe on touch, next-page image preloading, and a PDF branch for PDF sources.

---

## 15. Brochure Source Migration — OffersInMe → D4D + official fallback

> **Status:** **DEPLOYED & VERIFIED IN PRODUCTION** (2026-07-02) at
> `https://brochure-engine.tamamoooo.workers.dev` (version `788db568`). The Worker
> was deployed and all stores re-ingested from D4D on explicit follow-up
> instruction; production now holds **current `2026-W27` D4D editions** for every
> covered store (§15.F). The old OffersInMe rows are superseded (retained as
> is_current=0 history).

### 15.A Goal & rules (as given)
Replace OffersInMe **completely**. Make **D4D** the primary brochure provider.
Keep the Brochure Engine architecture unchanged; reuse the existing collectors,
pipeline, storage, APIs, and frontend; keep changes in the **provider/adapter
layer**. Rules honoured:
- **D4D current flyer → download, store, serve exactly as today** (image-set path,
  in-app viewer, engine-served pages — unchanged).
- **D4D expired or unavailable → do NOT fall back to OffersInMe.** Instead expose
  the store's **official offers page** as the fallback destination.
- **Frontend stays source-agnostic** — it never learns D4D-vs-official; it only
  distinguishes *inline-viewable* (page images) from *external link*.

### 15.B Why D4D (and how it beats OffersInMe here)
D4D Online (`d4donline.com`) **server-renders** clean, fetchable KSA pages (HTTP
200 from a plain Worker `fetch`, incl. the engine's default UA), **scopes offers
by city in the URL path** (so Riyadh = Central is selected by the URL, not a slug
matcher), and carries **current** Riyadh flyers with **machine-readable validity
dates** (JSON-LD `datePublished`/`expires`). OffersInMe had grown stale (Danube
lagging to ~2025-09; §12.G). Verified live, every covered store now resolves a
**current** flyer (e.g. Danube valid **to 2026-07-14**, Hyper Panda/LuLu/Carrefour/
Tamimi/Nesto valid into the current week).

### 15.C D4D shape (verified live)
- **Store page:** `…/en/saudi-arabia/<city>/offers/<slug>-<id>` → offer cards
  `<a href="…/<slug>-<id>/<offerId>/<offerSlug>" class="book-cover" title="… . <expiresISO>">`.
  The **raw HTML lists only current offers** (the expired archive is client-side
  loaded and never fetched).
- **Leaflet page:** `…/offers/<slug>-<id>/<offerId>/<offerSlug>` → **JSON-LD
  `CreativeWork`** with `name`/`datePublished`/`expires`, and page images as
  `<picture class="offer-page" data-index="<n>"><img src="https://cdn.d4donline.com/u/d/YY/MM/DD/<hash>.webp">`
  (`data-index` is the 0-based page order; the hashed filename carries no index).

### 15.D What changed (all in the provider/adapter layer + minimal edges)
```
brochure-engine/
  src/collectors/adapters/d4d.js        NEW  the D4D adapter (aggregator-generic; reads the shape in §15.C)
  src/collectors/adapters/offersinme.js DELETED
  src/collectors/officialLink.js        NEW  fallback collector: emits a "link" brochure (sourceType:"link", sourceUrl=official offers page, no pages)
  src/collectors/aggregator.js          EDIT (small) currency gate: never serve an expired pick → yield nothing so best-first falls through
  src/pipeline.js                       EDIT (small, additive) link-candidate branch: checksum over sourceUrl, index the D1 row, write NO object bytes
  src/providers/{hyperpanda,carrefour,lulu,danube,tamimi,manuel,nesto}.js  REWRITTEN pure config: D4D store slug+id + city + officialUrl; strategies [d4d, officialLink]
  src/index.js / dev.mjs                EDIT comments; dev.mjs gains an offline fallback selftest
live-shopping-assistant/
  src/brochure.js                       EDIT +isExternalBrochure(b) (sourceType==="link" && sourceUrl)
  src/app.js                            EDIT fillFlyer: link brochure → open sourceUrl in a new tab; else → in-app viewer (unchanged)
```
- **Discipline preserved (project rule 2):** all store knowledge is the 7 provider
  configs (D4D `<slug>-<id>`, `city`, `officialUrl`); the adapter is store-agnostic,
  the collector aggregator-agnostic, the pipeline/Core/storage store-agnostic. The
  `AggregatorCollector`, the `BrochureDoc` contract, storage, read APIs, scheduler,
  and Price History are **unchanged**. `sourceType:"link"` is an existing contract
  value (pdf|images|flipbook|api|link) needing **no schema migration**.
- **Best-first realises the fallback rule:** each aggregator provider is
  `strategies: [d4d, officialLink]`. D4D wins when it has a current flyer;
  otherwise (expired via the currency gate, or unavailable → empty) best-first
  runs `officialLink`, which yields the store's official offers page. This is the
  engine's existing `collectBestFirst` dispatch — no Core change.

### 15.E Store map (Central = Riyadh) & official fallback URLs
| Provider (engine id) | D4D store (Riyadh) | Official-page fallback |
|---|---|---|
| hyperpanda (search `panda`) | `hyper-panda-70` | https://www.panda.com.sa/ |
| lulu | `lulu-hypermarket-63` | https://www.luluhypermarket.com/en-sa |
| tamimi | `tamimi-market-68` | https://shop.tamimimarkets.com/ |
| danube | `danube-74` | https://www.danube.sa/ |
| carrefour | `carrefour-62` | https://www.carrefourksa.com/mafsau/en/ |
| nesto | `nesto-73` | https://nesto.sa/ |
| manuel | `manuel-market-223` | *(none — Manuel has no official offers page; no fallback)* |
| othaim | *(unchanged — official PDF via `PdfIndexCollector`, §11)* | n/a |

- **Othaim was NOT touched** — it is an official PDF, not OffersInMe; it stays
  current (edition `2026-W27`) and out of scope for this migration.
- **Manuel** currently has **no current D4D offer** (its D4D store page is empty /
  "coming up") **and no official offers page**, so it resolves to **no brochure** —
  the correct "unavailable, no fallback" outcome. Manuel is engine-only (not one of
  the frontend's brochure stores), so this does not affect the UI. It self-heals if
  D4D republishes Manuel.

### 15.F Verification (all ✅, 2026-07-02) & how to finish (deploy)
**Verified without deploying** (code + live D4D + local dev harness + prod read APIs):
- **`node dev.mjs selftest`** (in `brochure-engine/`) — green end-to-end:
  **M1** Othaim PDF intact (929,931 bytes, sha256 `3ec0bce0…`); **M2/D4D** LuLu
  ingested live from D4D (edition `2026-W27`, valid `2026-06-30 → 2026-07-07`,
  **40 pages** stored + served through `/asset`, dedupes on re-run); **Fallback**
  currency gate rejects an expired flyer, and an empty aggregator → `officialLink`
  link brochure (`sourceType:"link"`, correct `sourceUrl`, **no** pages, **no**
  object bytes written, dedupes on re-run); **Price History** unchanged.
- **All 7 aggregator providers probed against live D4D (HTML-only):** 6 resolve a
  **current** brochure (hyperpanda/carrefour/lulu/danube/tamimi/nesto); manuel has
  none (§15.E). Dates confirmed current.
- **Frontend (local preview against the *current* prod engine):** search works
  (26 results / 6 stores), the Price-History "Lowest recorded" banner works
  (7.00 SAR @ Lulu), **the in-app viewer opens and streams engine-served pages**
  (regression check on the viewer path), **no console errors**. The link-fallback
  UI branch is verified by the engine selftest + code (it can't surface in the UI
  until a store actually lacks a current D4D flyer).
- **Prod read APIs healthy (no regression):** search connector `GET /` (6
  providers) + `panda` "milk" (29 results); brochure engine `GET /` (8 providers)
  + Price History `/lowest?product=milk`.

**Production deploy + ingest (DONE 2026-07-02):**
```
cd serverless-connector/brochure-engine
npx wrangler deploy                         # version 788db568 (no schema migration)
# INGEST_SECRET was rotated this session (per §12.G/§13.F) then all stores ingested:
for id in othaim hyperpanda carrefour lulu danube tamimi manuel nesto; do
  curl -X POST -H "X-Ingest-Secret: <secret>" \
    "https://brochure-engine.tamamoooo.workers.dev/ingest?store=$id"; done
```
**Result (all ✅):** hyperpanda / carrefour / lulu / danube / tamimi / nesto each
ingested **new** and now current at **`2026-W27`** (`sourceType:images`), with live
D4D validity windows (e.g. LuLu "Saudi Summer Surprises" 06‑30→07‑07, **Danube
"Summer is yours…" 07‑01→07‑14** — vs the old stale `2025-W37`). Othaim **deduped**
(official PDF unchanged, `2026-W27`, sha256 `3ec0bce0…`). **Manuel** produced no
brochure (`d4d: no brochure` — its D4D store page is currently empty and it has no
official fallback), so it keeps its prior `2025-W37` row; Manuel is engine-only,
not a frontend brochure store, so the UI is unaffected. **Frontend end-to-end
(live prod engine):** the in-app viewer opened the Panda flyer at
`…/hyperpanda/central/2026-W27/page00.webp`, header **"Jul 1, 2026 – Jul 7, 2026"**,
counter **1/40**, engine-served — no console errors. **No regression:** search
connector `lulu` "milk" 20 results; Price History `/lowest?product=milk` intact
(7 SAR @ lulu; it re-anchors to W27 on the next weekly capture).
- **`INGEST_SECRET` was rotated this session** (prior value uncommitted, per
  §12.G). Still a Worker secret (not committed); rotate with
  `npx wrangler secret put INGEST_SECRET`.

### 15.G Notes & follow-ups
- **D4D returns multiple concurrent promos per store** — ~~the collector's
  `pickCurrent` selects one current flyer~~ **superseded by §17 (2026-07-02):**
  the collector now keeps **all** current flyers, ranked main-flyer-first
  (page count beats recency), so the "Tamimi 1-page banner" problem is fixed.
- **Aggregator dependency risk is unchanged (§10.F #1):** D4D is still one
  third-party source. The `AggregatorCollector` stays adapter-driven, so a second
  adapter (e.g. Tiendeo) for cross-checking/failover is a new file, zero collector
  change. The official-offers-page fallback already removes the single-aggregator
  hard dependency for the "no current flyer" case.
- **Freshness monitor (§12.G) is still the natural follow-up** — now cheaper to
  reason about since D4D exposes `expires` per flyer.

---

## 16. Frontend Redesign — the two-experience app (Unified Frontend, full pass)

> **Status:** **DEPLOYED & VERIFIED IN PRODUCTION** (2026-07-02) at
> https://tamamoooo-dev.github.io/live-shopping-assistant/ (commit `c97945e`).
> A complete frontend/UI/UX redesign from first principles, replacing the §14
> "integration only" pass. **Frontend-only by explicit rule:** the backend was
> not touched — no API changed, no new backend service, Search Engine / Brochure
> Engine / Price History logic unchanged, Alerts NOT implemented. The connector
> repo has no changes from this milestone.

### 16.A Information architecture (the design)
Souq is a **personal shopping assistant**, not an e-commerce site — the design
treats it as a daily-use app with **two primary experiences** under one shell:

1. **Live Search (`#/search`, default)** — the daily loop: search, compare, done.
2. **Brochures (`#/brochures`)** — the weekly loop: browse what every store's
   flyer says this week.

Navigation is a **hash router** (works on GitHub Pages with zero server config,
deep-linkable, back-button friendly): a **top segmented nav** on desktop and an
app-like **bottom tab bar** on mobile (safe-area aware). Route state drives
`aria-current`, per-page titles, and page visibility; the Brochures page renders
lazily on first visit.

**Key design decisions (and why):**
- **The All/Single mode toggle is gone.** One mental model: the **store chips
  are the single scope control**. Selecting one store or six is the same flow —
  results are always store-grouped sections (one section when one store). This
  removed a whole control (the dropdown) without losing any capability.
  Selection persists in localStorage (a daily tool should remember its scope).
- **Daily-use accelerators on the home state:** recent searches (localStorage,
  last 8) and **"Price history available" chips** for the tracked watchlist —
  the discoverability cue §14.D.a said was missing. Both are one-tap searches.
- **Price History is woven in, not bolted on.** A tracked query renders a
  **price-intelligence panel**: the lowest recorded price (price + store + date
  + product link) *plus the latest captured price per store, cheapest first,
  each with its delta vs the low* (`/prices`). "Is today a good deal?" is now
  answerable at a glance (§14.D.d). A **disabled bell affordance ("Alerts
  soon")** sits in the panel header — the exact slot where the Personal Alerts
  target-price control will live, so Alerts lands without another redesign.
- **Flyer staleness is visible (§14.D.c).** The per-store flyer chip carries the
  validity date ("until Jul 7") and switches to a warn-styled "expired …" state
  when the newest held flyer is out of window.
- **Brochures got their own page** (not attached to search): every engine store
  (all 8 — Panda, Lulu, Tamimi, Danube, **plus Othaim/Carrefour/Nesto/Manuel,
  which search never showed**) is its own section, and **every currently ACTIVE
  brochure** the engine holds for that store is displayed under it (a store may
  run several at once; active = validity window contains today, sourced from
  `/brochures/history`, so a still-valid prior edition shows alongside a new
  one). Cards show a real **cover** (first page image, engine-served), title,
  validity dates, page count, and a status badge (**Current / Ends today /
  Ends tomorrow / Expired**). A store with no active flyer says **"No current
  flyer"** and shows its newest expired brochure greyed + badged — unavailable
  is a legible state, not an empty hole. External `link` brochures (official
  offers pages) render as marked `↗` cards opening a new tab. Search-capable
  stores get a **"Search this store"** shortcut that jumps to `#/search`
  pre-scoped to that store.
- **The viewer stays and improves.** Extracted to `src/viewer.js` (shared by
  both pages): prev/next + arrow keys, **touch swipe**, page counter, zoom with
  pan, **next/prev page preloading**, store + title + validity in the header,
  Esc/backdrop/✕ close, scroll lock, **focus trap + focus restore**. New **PDF
  branch**: Othaim's official PDF opens in-app in an embedded frame streaming
  the **engine-stored** `original.pdf`, with an "Open PDF ↗" fallback.
- **Design system rewrite** (`styles.css`): refined violet identity, **dark
  mode** via `prefers-color-scheme` (with matching `theme-color` metas),
  skeleton loaders for search + brochure cards, subtle fade-up motion with a
  global `prefers-reduced-motion` kill switch, `focus-visible` rings, skip
  link, tabular numerals for prices, product `dir="auto"`/RTL handling.

### 16.B Files (frontend repo only)
```
index.html         REWRITTEN  app shell: topbar nav, two <section> pages, bottom tab bar, skip link
styles.css         REWRITTEN  the design system (light+dark, skeletons, viewer, brochures page)
src/app.js         REWRITTEN  router + Live Search page (Core usage, ranking, Show-all, cards kept)
src/brochures.js   NEW        the Brochures page (per-store sections, active/expired cards, covers)
src/viewer.js      NEW        the shared in-app viewer (extracted from app.js; + swipe/preload/trap/PDF)
src/brochure.js    EXTENDED   the one Brochure-Engine client: + /brochures/history reader, active/
                              validity helpers, cover/pages cache, /prices reader, ENGINE_STORES map
src/core.js, src/providers/*  UNTOUCHED (Core, providers, 10-key result contract — project rule 1/2)
```
Cross-page coupling is one `souq:search-store` CustomEvent (Brochures → Search
scope), so `brochures.js` never imports `app.js`. All engine knowledge stays in
`brochure.js` (project rule 2 discipline held). Everything remains best-effort:
engine down → search still works, Brochures page shows honest empty states.

### 16.C Verification (local against production backends, then production)
- **Local (preview + real prod connector/engine):** all-stores "milk" → 120
  results across 6 stores; price panel (7.00 SAR @ Lulu lowest; Panda +8.99,
  Danube +16.50, Tamimi +54.90 latest); dated flyer chips on the 4 brochure
  stores, none on Amazon/Noon; Amazon best-effort failure message (expected,
  §5); Arabic "حليب" single-store Lulu → 20 results, RTL names, panel present.
  Viewer: Lulu 1/40 → Next→3/40 (engine-served `page02.webp`), zoom 150%, Esc
  closes + scroll restores. Brochures page: 8 store sections; 7 with a current
  flyer (correct badges/dates/covers/page counts); **Manuel correctly "No
  current flyer" + greyed Expired card (Sep 2025)**; Othaim PDF card opens the
  in-app PDF frame streaming `/asset/...original.pdf`; "Search this store"
  jumps to search scoped to Lulu with input focused. Mobile 375px: bottom tab
  bar on, top nav hidden; dark mode: full dark palette. Desktop 1280px: top
  nav on, tab bar off. **No console errors** (only the known Amazon warn).
- **Production:** deployed via push (`c97945e`); **every served file
  byte-matches the committed source** (curl + diff on index.html, styles.css,
  and all 5 src modules). Services healthy: connector `GET /` ok (6 providers)
  + live `panda` "milk" → 30 results (strategy `products-v3`); engine `GET /`
  ok (8 providers, 8 held, tracked eggs/milk); `/prices?product=milk` intact;
  `/asset` streams (lulu `page00.webp`, 198 KB). **No Worker deploy needed**
  (frontend-only milestone — connector repo untouched and clean).

### 16.D UX findings from this pass (candidate follow-ups, not started)
- ~~**Tamimi's current pick is a 1-page banner**~~ — **FIXED in §17** (the engine
  now holds all current flyers, main weekly flyer first).
- **iOS Safari renders embedded PDFs first-page-only**; the viewer's
  "Open PDF ↗" link is the fallback. A future PDF→page-image path (deferred,
  §0) would make Othaim first-class in the flipper.
- **Brochures page cost:** first visit makes 8 `/brochures/history` + up to 8
  `meta.json` reads (then session-cached) — gentle, but if the engine ever grows
  a "current + pages in one call" read, the page gets cheaper for free. Do NOT
  build that now (read APIs are frozen by rule).
- **The Alerts slot is ready:** the disabled bell in the price panel is where
  the target-price control goes; the panel already has per-store latest prices
  to anchor the "notify me below X" UX. Alerts (§9.1) remains the next milestone.
- **Watchlist growth is now purely engine config:** add products to the engine's
  `products.js` and the frontend's `PRODUCTS` mirror in `src/brochure.js` — the
  home-state chips and the price panel pick them up automatically.

---

## 17. Brochures Page Bug Fixes — multi-flyer engine + intelligent ordering

> **Status:** **DEPLOYED & VERIFIED IN PRODUCTION** (2026-07-02). Engine Worker
> version `b0bdf978` (connector repo commit `53fd525`); frontend on `main`.
> A **bug-fix milestone only**: no redesign, no new features, no backend
> architecture change, no schema migration. Changes live in the engine's
> collector/Core seam and the frontend's brochure client.

### 17.A The bugs (as found in production)
1. **Only ONE brochure held per store.** D4D lists several concurrent flyers per
   store (LuLu had 7), but `pickCurrent` kept a single candidate and
   `metadataStore.upsert` flipped `is_current=0` on every sibling — so the
   Brochures page could never show more than one flyer per store.
2. **A 1-page promo could displace the main weekly brochure.** The old pick
   preferred the *newest offer id*: Tamimi held the 1-page "Double Your
   Savings!" banner while the 48-page "Summer Goals" existed; Carrefour held a
   9-pager over the 63-page "Summer Hot Deals"; Nesto a 5-pager over the
   34-page "Real 50".
3. **Same-week concurrent flyers would collide** on the identity
   `store:region:edition` (edition = ISO week), so multiples couldn't even be
   stored.

### 17.B Engine fixes (`serverless-connector/brochure-engine`, commit `53fd525`)
- **`collectors/aggregator.js`** — `rankCurrent` replaces `pickCurrent`: apply
  the currency gate (drop expired), **dedupe same-campaign duplicates** (same
  title+validity → keep the fullest; D4D lists branch/language variants), then
  rank **valid-now → MOST PAGES → latest `validTo` → newest id**. The collector
  emits **one candidate per current flyer**, main first.
- **Identity (`contract.js`):** the primary flyer keeps the plain weekly edition
  (back-compatible with existing rows); concurrent siblings append the D4D
  offer id as a **variant** (e.g. `2026-W27-738849`), giving each its own
  id/storage prefix.
- **Free-plan budget & convergence:** page downloads are capped per run
  (`maxTotalPages=40`, `maxCandidates=6` leaflet fetches — ≤ ~47 subrequests of
  the 50/invocation budget). Flyers the engine **already holds are matched by
  `source_url`** (new `metadataStore.getBySourceUrl`, surfaced to collectors as
  the store-agnostic `findHeld` hook) and emitted as `existing` candidates with
  **zero downloads** — so consecutive runs converge on the full current set
  (the cron already fires Tue+Wed; live convergence took 3 runs).
- **Current-set semantics:** `upsert` no longer supersedes siblings; after each
  ingest run, `ingestTarget` calls the new **`metadataStore.setCurrent(store,
  region, checksums, { supersedeOthers })`** with everything the run confirmed
  (new + deduped + existing). Supersede is skipped when anything failed, so a
  partial run never un-currents brochures it couldn't confirm. Both the D1 and
  in-memory stores implement the same interface.
- **Price History:** with several current rows possible, `recordPrices` anchors
  to the **primary weekly edition** (plain `YYYY-Wnn` rows win, newest first).
- **Untouched:** pipeline PDF/link paths, schema (no migration — `source_url`
  already existed), read APIs, scheduler/fan-out, providers' configs, Othaim
  (`pdfIndex`) and the `officialLink` fallback.

### 17.C Frontend fixes (this repo)
- **`src/brochure.js`** — `loadBrochures()` keeps a **list** per store (the
  engine's `/brochures` now returns several rows per store); new
  **`orderBrochures()`** orders for display: active → in-app viewable before
  external link → **most pages** (from the already-needed cached `meta.json`) →
  latest `validTo`. `brochureForStore()` returns the **best** one, so the
  search page's flyer chip always opens the main weekly flyer.
- **`src/brochures.js`** — the Brochures page renders **all active flyers per
  store** through `orderBrochures` (main first), and the "no current flyer"
  fallback now shows the **most recently expired** flyer (latest `validTo`)
  instead of whatever sorted first.

### 17.D Verification (all ✅, 2026-07-02)
- **Engine selftests** (`node dev.mjs selftest [store]`): LuLu converges to
  **6 current flyers** (primary = 40-page "Saudi Summer Surprises"); Tamimi to
  **3** (primary = "Summer Goals"; the 1-page banner is a sibling). M1 Othaim
  PDF (929,931 bytes, sha256 `3ec0bce0…` unchanged), the officialLink fallback,
  and Price History selftests all green.
- **Production ingest:** deployed `b0bdf978`, rotated `INGEST_SECRET`, ingested
  all 8 stores ×4 paced runs → converged (`new:0`, `deduped==detected`).
  `/brochures` now holds **18 current brochures**: carrefour 2 (main "Summer
  Hot Deals" 40pp), danube 1, hyperpanda 1, lulu 6, nesto 3 (main "Real 50"
  31pp), othaim 1 (PDF), tamimi 3 (main "Summer Goals" 40pp), manuel stale
  (expected — no D4D flyer, no official page; ingest reports `failed`, prior
  row kept).
- **Frontend (preview against prod engine):** Brochures page shows **all 8
  stores**; per-store tags ("Current flyer" / "N current flyers" / "No current
  flyer"); every active flyer rendered main-first with correct covers, titles,
  dates, page pills, and badges (Current / Ends today / Ends tomorrow /
  Expired); **Manuel** correctly shows "No current flyer" + greyed Expired card
  (Sep 2025). **Viewer:** a variant-edition brochure streams engine-served
  pages (`…/tamimi/central/2026-W27-738849/page00.webp`, counter 1/1, Esc
  closes); **Othaim PDF card** opens the in-app frame streaming
  `…/othaim/central/2026-W27/original.pdf`. **Search page:** "milk" → 6
  sections, results render, flyer chips dated ("until Jul 7/14") and
  `brochureForStore` picks the mains (Tamimi → "Summer Goals", Lulu → "Saudi
  Summer Surprises", Panda → "Moments we live with you"). **No console
  errors.** Price History reads intact (`/prices?product=milk` → 7 SAR @ lulu).

### 17.E Notes & caveats
- **`INGEST_SECRET` was rotated this session** (prior value unknown, per
  §12.G). Still a Worker secret; rotate with `npx wrangler secret put
  INGEST_SECRET`.
- **Back-to-back live ingests can rate-limit on D4D** (transient, silent
  per-flyer skips); the selftest paces runs 2.5 s apart. Real cron fires are
  days apart, and held flyers cost zero downloads, so this only affects rapid
  manual re-ingests.
- **Manuel's stale row is still `is_current=1` in D1** (its ingest fails before
  `setCurrent`); the frontend's activity check is validity-based, so the UI is
  correct ("No current flyer" + greyed card). Self-heals when D4D republishes
  Manuel.
- **A 1-page brochure card shows no page pill** (the pill renders only for
  >1 pages) — cosmetic, by design.

---

## 18. Search Intelligence & Reliability

> **Status:** **DEPLOYED & VERIFIED IN PRODUCTION** (2026-07-02). Frontend on
> `main` `7ff4c28` (GitHub Pages, served bundle byte-matches source); connector
> Worker redeployed, version `dc1472b6` (commit `43bd753`). **No redesign, no
> Brochure Engine change, no Price History architecture change** — the existing
> system was improved in place. The Core, the 10-key result contract, the
> connector framework, and the Brochure Engine / Price History were untouched.

### 18.A What this milestone delivers
1. **An intelligent shopping summary shown BEFORE the results** (`src/summary.js`).
2. **Greatly improved search accuracy** — a new pure, unit-tested matching module
   (`src/match.js`): better ranking, matching, equivalent-product grouping, fewer
   irrelevant results, and much better Arabic/English handling.
3. **Honesty guarantees** — a strong "Lowest price" is claimed **only** for
   confidently-equivalent products; different pack sizes/variants are never
   treated as the same product; low confidence is shown explicitly.
4. **Price History woven into the summary** — today's cheapest vs the record low.
5. **Provider reliability** — Amazon ~25%→~80%, Danube further hardened.
6. **A 7th live store: Ninja (نينجا) Market.** (HungerStation/Keeta investigated,
   not feasible — §18.E.)

### 18.B The shopping summary (`src/summary.js`, rendered by `src/app.js`)
A single panel prepended to `#results` (with a skeleton placeholder while stores
answer; filled once **all** stores respond, since it compares every offer):
- **Overview:** N offers across M stores, and the SAR price range.
- **Headline claim — two honest modes:**
  - **"Lowest price · <size>"** (high confidence) when the cheapest offer belongs
    to an **equivalence group** spanning **≥2 stores** (same brand + same size).
    Shows the price, store, product name (linked), and "Same product elsewhere:
    store price · …". This is the ONLY strong lowest-price claim.
  - **"Cheapest option"** (otherwise) — the single cheapest relevant item, with a
    **low-confidence note** ("Results are different sizes or variants — compare
    carefully") when results are too heterogeneous to compare. Never a false
    apples-to-apples claim.
- **"Best value · SAR X/L|kg|pc"** — the lowest **per-unit** price within the most
  common unit family, so a 6×200 ml pack and a 2 L bottle are compared fairly.
- **Confidence indicator** — a coloured dot + label (High = same product compared;
  Medium = compared by unit price; Low = different sizes/variants) plus a left
  accent on the panel keyed to confidence.
- **Price History section** (tracked products only, via the engine's `/prices`):
  a verdict — *"Today's best matches the lowest ever recorded"* / *"Close to the
  record low (+X)"* / *"Above the record low (+X)"* — the record low (price +
  where + when), and the per-store latest weekly capture (cheapest first, each vs
  the low). This replaces the old standalone price-intelligence panel (`.pp-*`),
  which was folded into the summary.
- **Best-effort & token-guarded:** if there are no priced relevant results the
  slot is removed; a newer search cancels a stale summary render (`inFlight`).

### 18.C The matching module (`src/match.js`, pure — tested by `src/match.test.mjs`)
All "what does the query mean and which results actually match" logic lives here,
so the same logic drives per-store lists AND the summary (Core/providers/contract
untouched). **23 offline tests** (`node src/match.test.mjs`) guard it.
- **`normalizeText`** — matching-only fold: lowercase, strip Arabic diacritics +
  tatweel, unify alef/hamza/taa-marbuta/alef-maqsura, drop punctuation. A tiny
  **bilingual synonym bridge** (milk↔حليب/لبن, eggs↔بيض, …) lets an Arabic query
  recognise an English name and vice-versa in the equivalence/summary layer.
- **`parseSize(name, sizeField)`** — extracts a comparable quantity. Uses a
  **separate `normSize`** that **preserves the decimal point** (critical bug found
  & fixed in verification: Panda's `"2.85 ML"`/`"2.85L"` was parsing as **85 L**
  once the "." became a space → a bogus "0.19 SAR/L best value"; `normSize` keeps
  decimals and folds **Arabic-Indic digits** ٠-٩). Handles volume→ml, weight→g,
  counts→pcs, and **packs** ("6 × 200 ml", "12x1l"). Arabic units (لتر، كجم، مل،
  جم…) parse too (JS `\b` is ASCII-only, so a **unicode lookahead boundary** is
  used, not `\b`).
- **`unitPrice`** — SAR per litre / kg / piece, for fair cross-size comparison.
- **`relevance` + `isRelevant`** — tiered token scoring (whole-word > prefix >
  substring) over normalized text with synonym expansion; a **compound-noun
  penalty** demotes look-alikes ("milk chocolate/biscuit/powder" rank **below**
  plain milk); off-topic items (e.g. "coffee" for a "milk" query) are dropped.
- **`groupEquivalents`** — groups tagged results into the SAME product: same unit
  family + total within **3%** AND (same brand OR ≥60% content-token overlap).
  Items with **no parseable size are never merged** — the engine refuses to guess
  equivalence, which is what keeps the "lowest price" claim honest.

`src/app.js` now imports `rankItems`/`relevance`/`isRelevant` from `match.js`
(the old inline `tierScore`/`relevance`/`rankItems` were removed), ranks each
store's results and drops zero-relevance noise, collects the relevant priced
items across stores, and builds the summary when the last store answers.

### 18.D New store — Ninja (نينجا) Market
- **Connector** `serverless-connector/src/providers/ninja.js`: bootstraps a
  **guest `DeviceToken`** (a ~90-day JWT) by fetching any storefront 404 on
  `ananinja.com` (the cheapest response that still sets the cookie), then queries
  `GET https://public.ananinja.com/fahras/search/products?storeId=1&q=…&includes=…`
  with `Authorization: Bearer <token>`. `storeId=1` = Riyadh/Central. Prices are
  in cents (÷100). Search is broad/fuzzy (up to ~400 hits for "milk"), so results
  are capped at 40 and the client ranking narrows them. Token cached in-isolate,
  refetched once on 401/403. Registered in `src/index.js`.
- **Frontend** `src/providers/ninja.js`: the usual thin connector strategy;
  registered in `src/app.js` STORES (`ninja`, colour `#ec4899`). Chips are
  rendered from STORES, so no `index.html` change was needed.
- **Newly-added stores default ON for returning users** (discoverability): a
  `known-stores` localStorage key records which stores the user has seen; a store
  absent from it is auto-selected once, then explicit toggles are respected. This
  is why Ninja appears for the existing user without wiping their saved scope.

### 18.E Investigated but NOT added (honest scope)
- **HungerStation Market** — Delivery Hero platform. The darkstore vendor resolves
  (`GET hungerstation.com/cw-api/hmarket-vendor?latitude=…&longitude=…` → vendor
  id 36843, "HungerStation Market"), but **free-text product search needs the
  menuxp menu API**, which returns a **Cloudflare challenge page to datacenter
  IPs**; `/cw-api/category-products` returns the right envelope but always empty
  without menuxp-derived category IDs. **Not addable from a Worker.**
- **Keeta Market (Keemart)** — Meituan **"Sailor"** platform (`mykeeta.com`), a
  **signed** mobile-style API, geo-gated. Not reachable without reverse-
  engineering request signing. **Not addable from a Worker.**
- Adding perpetually-failing store chips would violate the "never mislead" rule
  (goal #3) and add noise, so they were deliberately left out. A future session
  with a residential egress or the mobile-app signing scheme could revisit them.

### 18.F Reliability changes (connector)
- **Amazon** (`src/providers/amazon.js`): the `search-html` strategy now
  **retries up to 5×** with a **rotating User-Agent** (4-UA pool) and full
  browser-like headers (`sec-ch-ua`, `Sec-Fetch-*`, `Accept-Language`, etc.),
  because the anti-bot interstitial clears on a rotated retry. **Measured: ~25%
  → ~80%** success from the deployed Worker (5 prod runs: 4 × count=48, 1 × 502).
  Still best-effort; PA-API remains the durable path (tried first, skips
  unconfigured).
- **Danube** (`src/providers/danube.js`): **3 tries** (was 2), guards a
  200-with-non-JSON body as retryable, and sends `X-Requested-With` + `Referer`
  so it looks like the storefront's own XHR. (Danube was healthy when tested —
  all 200s — so this is preventive, matching the existing posture.)

### 18.G Verification (all ✅, 2026-07-02)
- **Local matching tests:** `node src/match.test.mjs` → **23 passed, 0 failed**
  (size parsing EN+AR incl. decimals & packs, unit price, relevance/irrelevance,
  equivalence grouping, normalization).
- **Connector (deployed `dc1472b6`):** `GET /` lists **7 providers**; live
  `milk` searches — ninja 40 (`fahras-market`), panda 30, lulu 20, tamimi 20,
  danube 20; ninja Arabic `حليب` → 40 (RTL names). Amazon 5 prod runs → 4 ok / 1
  interstitial (best-effort, as expected).
- **Frontend (local preview against the *production* connector + engine — the
  documented approach, since the preview stays pinned to localhost, §8):**
  all-stores "milk" → summary **High confidence**, "Lowest price · 200 ml" 1.95
  SAR at Noon with "Same product elsewhere" across 3 stores, **Best value 4.92
  SAR/L** (12×1 L multipack — realistic after the decimal fix), Price-History
  verdict "Today's best matches the lowest ever recorded" + per-store table; a
  legacy-selection user gets **Ninja auto-enabled** and Arabic `حليب` → **160
  results across 7 stores** incl. Ninja (RTL); an untracked query ("shampoo")
  → summary with no history; a nonsense query removes the summary slot cleanly.
  **No console errors.**
- **Production frontend:** GitHub Pages serving the new bundle — `src/app.js`,
  `src/summary.js`, `src/match.js`, `src/providers/ninja.js`, `styles.css`,
  `index.html` all **byte-match** the committed sources.
- **No regression:** connector 7 providers all live; **Brochure Engine `GET /`
  → 8 providers, 18 held, tracked [eggs, milk]; `/prices?product=milk` → 7 SAR
  @ lulu** — Brochure Engine / Price History untouched and intact.

### 18.H Notes, caveats & follow-ups
- **Ninja token** is anonymous/guest and cached in the Worker isolate; a cold
  isolate re-bootstraps (one extra cheap fetch). If Ninja ever changes the cookie
  name or the fahras path, the provider fails cleanly (best-effort). The catalogue
  is Riyadh (`storeId=1`); other cities would be a config addition.
- **Amazon** is still best-effort — the honest durable fix is PA-API secrets
  (TODO §9.3), unchanged.
- **Flavoured/variant edge:** the summary's "Lowest price" can lead with a
  legitimately-cheaper variant (e.g. a 125 ml strawberry milk) when it forms a
  real ≥2-store equivalence group; the product **name and size are always shown**,
  so it stays transparent. Tightening "plain vs flavoured" intent would need
  semantic categories (out of scope; not misleading as-is).
- **Watchlist unchanged** (`milk`, `eggs`) — the summary's Price-History section
  only appears for tracked products (grow via the engine's `products.js` + the
  frontend `PRODUCTS` mirror in `src/brochure.js`, as before).
- **Personal Alerts (Roadmap §0 priority 4) is still the next milestone** — this
  milestone did not build it. The summary is a natural future home for a target-
  price control (the old disabled "Alerts soon" affordance was removed with the
  price panel; re-add it in the summary header when Alerts lands).

---

## 19. Brochure Intelligence — Structured Offers, Coverage 8→19, Retention

> **Status:** **DEPLOYED & VERIFIED IN PRODUCTION** (2026-07-02 evening).
> Engine Worker version `4bb6dbbf`; frontend pushed to `main` (GitHub Pages).
> This is the milestone that turns the Brochure Engine from "images of flyers"
> into a **source of structured shopping data**: per-product prices from
> physical stores' flyers, queryable next to the live online prices — with
> **no OCR of our own, no paid APIs, $0**.

### 19.A The discovery that unlocked it
D4D Online doesn't just host flyer page images — it also machine-extracts
(its own AI/OCR) **per-product offer records** from every flyer and serves
them from a JSON endpoint, **`POST /products/search`**:
`{ price, was_price, valid_from/valid_to, idproduct_category, product image
crop (CDN), flyer deep-link (…?page=…), bilingual OCR description, idoffer_company
(the flyer id) }`. The endpoint needs a CSRF token + session cookie, both
minted by a plain GET of any store page — **verified working from a Cloudflare
Worker (datacenter IP) on the real edge** before anything was built. Volumes:
300–1,500 current offers per store, ~500 per POST, so a full store costs
**~4 subrequests**. D4D's own UI marks these prices "AI-generated — official
flyer prices prevail"; the engine carries that disclaimer through (§19.D).

### 19.B What was built (engine, all in `brochure-engine/`)
```
src/offers/contract.js     NEW  PURE: Offer contract, OCR name derivation (EN+AR),
                                price sanity gates, normalizeText (AR fold +
                                Arabic-Indic digits), search relevance, row mapping
src/offers/d4dOffers.js    NEW  the D4D offers SOURCE adapter (CSRF flow, paging,
                                D4D_CATEGORIES id→slug map harvested live)
src/offers/ingest.js       NEW  store-agnostic ingest: source → normalize → gate →
                                link offers to held brochure editions → upsert
src/storage/offerStore.js  NEW  D1 store: batch upsert, token-AND LIKE search,
                                counts, pruneExpiredBefore (in-memory twin in local.js)
src/retention.js           NEW  pruneStoredBytes: METADATA FOREVER, BYTES A ROLLING
                                WINDOW (see §19.E)
src/providers/d4dStores.js NEW  PURE CONFIG: the 11 coverage-expansion providers
src/providers/othaim.js    EDIT + offers:{company:72} (brochure stays official PDF)
src/collectors/aggregator.js EDIT maxPages/maxTotalPages 40→36 (budget headroom for
                                offers in the same child; oversize flyers TRUNCATE
                                to 36 pages rather than starve — see note below)
src/engine.js              EDIT + GET /offers, POST /prune, offers in /ingest +
                                health; storage backends gain delete/listPrunable/
                                markPruned
src/index.js               EDIT registry 8→19; offerStore+offersSource in ctx;
                                cron: fan-out → price capture → prune
schema.sql                 EDIT + offers table (+ux_offer, validity indexes) +
                                brochures.pruned_at (canonical, fresh installs)
migrate-2026-07-offers.sql NEW  the one-time delta applied to the LIVE D1 (done)
dev.mjs                    EDIT + selftestOffers/selftestRetention (offline) +
                                selftestOffersLive; `node dev.mjs offerstest`
```
**Discipline preserved:** store knowledge is provider config only (the offers
`company` id is parsed from the existing D4D store key, e.g.
`lulu-hypermarket-63` → 63; Othaim's is explicit config). The offers source is
an **adapter** like the brochure adapters — a second aggregator would be a new
file, zero ingest change. The Offer contract is source-agnostic.

### 19.C How ingest runs (Free-plan budget, unchanged architecture)
The existing Architecture-C fan-out is untouched: each per-store child
invocation (`POST /ingest?store=<id>`) now runs **brochures first, then that
store's offers** (offers link to the freshly committed editions). Budget per
child: 1 store page + ≤6 leaflets + ≤36 page images (~43) + offers (~4) ≤ 47
of 50. Offers are **upserted** (unique `store:region:source:offer_id`), so
re-ingest is idempotent and names/prices refresh weekly. "Current" is derived
from `valid_to` at read time — no flag maintenance. Coordinator: 19 SELF calls
+ 8 price-capture calls + prune ≈ 28 invocations total (cap 32). ⚠️ **KV write
budget:** a worst-case drop-day (every store publishing a full new flyer set
in one day) is ~700–900 KV writes vs the 1,000/day Free cap; a partial failure
self-heals on the Wednesday fire. Adding many more image stores needs this
math re-done first.

### 19.D Read API (the price-comparison substrate)
- **`GET /offers?q=<query>&store=&region=&limit=`** → `{ query, count, note,
  offers:[Offer] }` — current offers only (validity contains today), token-AND
  search over normalized OCR text (Arabic+English, Arabic-Indic digits folded),
  name-matched offers ranked before text-only matches, cheapest first within
  each tier. `note` is the extraction disclaimer; every Offer carries
  `sourceUrl` (flyer deep-link) + `imageUrl` (the product's own flyer crop) +
  `edition` (the held brochure it came from, when linkable via flyer id ↔
  brochure source_url).
- Health (`GET /`) now reports `offers: { total, current, stores }`.
- Guarded: `POST /ingest?store=` (now also offers; `&offers=0` skips),
  `POST /prune`.

### 19.E Retention (production stability — REQUIRED at 19 stores)
KV Free = 1 GB total; 19 stores × ~30 pages × ~150 KB ≈ 85 MB/week of new
bytes — unpruned, the namespace dies in weeks. Policy: **metadata is forever,
bytes are a rolling window.** A brochure that is non-current AND expired
>28 days has its object bytes deleted (pages, meta.json, original.pdf) and its
row marked `pruned_at` — the row (edition, validity, checksum, source URL)
stays forever, so history, dedupe and Price-History anchoring are untouched.
Caps: ≤250 KV deletes + ≤12 rows per run (KV allows 1,000 deletes/day; cron
fires 2×/week; a backlog drains across fires). Offers rows expire after ~180
days (D1 delete). Runs in the cron coordinator after price capture; manual via
`POST /prune`. Verified in production: first run pruned 2 stale editions
(41 KV deletes); re-run is a no-op.

### 19.F Coverage expansion (priority 1): 8 → 19 stores
All of D4D's Riyadh grocery directory was probed live; every store below has
≥1 current flyer AND structured offers. Added (engine id → D4D key):
farm→`farm-101` (official-site fallback), almadina→`al-madina-hypermarket-212`,
ramez→`aswaq-ramez-88`, cityflower→`city-flower-556`, marksave→`mark-save-3179`,
amarket→`a-market-3351`, grandhyper→`grand-hyper-3181`,
makkah→`makkah-hypermarket-796`, prime→`prime-supermarket-471`,
alwafa→`hyper-al-wafa-3041`, aljazera→`aljazera-shopping-center-210`.
Not added (still available as one-line configs): sanam, supermarket-stor,
family-corner, family-discount, elite-10, danah, nasim, ala-kaifak — micro
marts; adding them must re-check the §19.C KV write budget. **Farm** rides
D4D (68-page flyer, truncated to 36); its official-PDF `PdfIndexCollector`
upgrade stays deferred. **Othaim** brochure stays the official PDF; only its
offers come from D4D. **Manuel** vanished from D4D's Riyadh directory —
honest-failure state persists (TODO §9.8).

### 19.G Frontend (this repo)
```
src/brochure.js     EDIT ENGINE_STORES 8→19 (labels/colors); searchOffers(q)
                         (session-cached, never throws); brochureForOffer(o)
                         (held edition ↔ offer, for in-app click-through)
src/flyerOffers.js  NEW  the "In this week's flyers" panel: top 8 offer cards
                         (flyer crop image, name dir=auto with name→nameAr→
                         category fallback, price + was-price strike, store,
                         "until <date>"), extraction disclaimer, click → in-app
                         viewer when the edition is held, else the flyer page
src/app.js          EDIT offers slot between summary and store sections; fills
                         independently of the live searches (token-guarded)
styles.css          EDIT .flyer-offers / .fo-* (design-system tokens, dark-mode
                         safe, horizontal scroll row)
```
**Honesty rule kept:** flyer offers NEVER take over the summary's "Lowest
price" headline — they are a separate, clearly-labelled "physical stores"
group with the extraction disclaimer. The Brochures page picks the 11 new
stores up automatically from ENGINE_STORES.

### 19.H Production verification (all ✅, 2026-07-02)
- **Local:** `node dev.mjs offerstest` (offline: gates, bilingual name
  derivation, edition linking, idempotence, search, disclaimer; retention:
  bytes pruned / metadata kept / current untouched / no-op re-run) and full
  `node dev.mjs selftest` (M1 PDF sha256 `3ec0bce0…` intact, M2 lulu converges
  to 6 flyers with the 40-page main as plain `2026-W27`, fallback, Price
  History, live offers lulu: 1,309 fetched / 1,293 stored / 1,271 linked) —
  plus `selftest farm` for a new store (flyer truncation + 937 offers).
- **Migration applied** to live D1 (additive only); deployed `4bb6dbbf`;
  `INGEST_SECRET` rotated (again — still uncommitted, rotate with
  `npx wrangler secret put INGEST_SECRET`).
- **All 19 stores ingested in production, zero failures** (manuel's honest
  `d4d: no brochure` expected). Convergence passes ran for multi-flyer stores.
  End state: health `19 providers`, **49 current brochures across 19 stores**,
  **offers `{ total: 15,823+, current: 15,823+, stores: 18 }`**.
- **Reads verified:** `/offers?q=milk` (cheapest 2.75 SAR @ Othaim, was 4.25,
  with image+flyer link), Arabic `/offers?q=حليب` matches, store filter works,
  new-store assets stream (farm `page00.webp` 200 KB), `POST /prune` pruned 2
  stale editions.
- **No regression:** connector 7 providers + panda milk 30 live results;
  `/prices?product=milk` intact; weekly capture re-anchored to `2026-W27`
  (8 points recorded); Othaim PDF byte-exact (`3ec0bce0…3528f607`).
- **Frontend (preview vs prod engine):** "milk" search → summary unchanged
  (High confidence, 1.25 SAR headline) + **flyer panel: 24 offers, 8 cards**
  with images/strike-through/store/validity; card click opened the **in-app
  viewer** on A Market's held brochure (`…/amarket/central/2026-W27/page00.webp`,
  counter 1/27); Brochures page renders **all 19 stores** with correct flyer
  counts; **no console errors**.

### 19.I Notes & caveats
- **Offer prices are the aggregator's AI extraction** — same data D4D shows its
  own users, but not gospel. The disclaimer + flyer deep-link + product crop
  keep it honest. Never promote a flyer offer into the summary's
  equivalence-based "Lowest price" claim without a human-verifiable size/brand
  parse.
- **`maxPages` must never exceed `maxTotalPages`** (aggregator collector): a
  flyer longer than the per-run budget would never fit any run and starve
  forever. Oversize flyers (Farm 68pp, family-discount 226pp) truncate to 36.
- **CSRF flow fragility:** if D4D changes the `_csrf-frontend` input or the
  endpoint, offers ingest fails cleanly per store (brochures unaffected).
  The next session's fix lives entirely in `src/offers/d4dOffers.js`.
- **Nesto/alwafa hit the 1,500-offers cap** (`maxOffers`) — deliberate bound;
  raise it only with the subrequest math (each +500 = +1 POST).
- **Manuel** (§9.8) remains the one dead store; everything else was current at
  ingest time.

---

## 20. Intelligent Shopping — Price Comparison Engine, Unified Search, Price Monitoring

> **Status (2026-07-03): CODE COMPLETE & FULLY VERIFIED LOCALLY; PRODUCTION
> DEPLOYMENT BLOCKED-ON-USER (§20.H).** All engine selftests (including live
> D4D legs) and all frontend unit suites are green; the full search flow was
> verified in a live browser against the production connector + engine. The
> four production actions (D1 migration, engine Worker deploy, both git
> pushes) were denied by the session's permission gate and are listed in
> §20.H exactly as they must be run.

### 20.A What this milestone delivers
1. **A value-aware Price Comparison Engine** (`src/compare.js`, pure +
   unit-tested): the "Best buy" is decided by **per-unit value**, not the
   smallest total — a 30-egg tray at 0.33 SAR/pc now beats a 6-pack at 0.75
   SAR/pc even though 4.50 < 9.95 (the milestone's flagship example, verified
   live). The lowest TOTAL price is never hidden: it renders as its own
   "Lowest price · if you need less" line when it differs from the best buy.
2. **Unified search across sources**: flyer offers are **first-class
   comparison candidates** — the best buy can (and does) come from a physical
   store's flyer, clearly badged "this week's flyer" with the machine-
   extraction caveat and a click-through to verify. The flyer panel and the
   summary share one relevance pipeline, so they always agree.
3. **Price Monitoring (Keepa-inspired)**: target-price watches, checked daily
   across every source, with strict trust gates; alerts in-app (badge +
   `#/alerts` page) and optionally pushed to the phone via free ntfy.sh.
4. **Search relevance quality**: the engine's `/offers` search was rebuilt on
   word-boundary scoring + a bilingual synonym bridge; short-stem substring
   false-positives (Arabic "بيض" eggs → "بيضاء" white; English "egg" →
   "eggplant") are gone on BOTH sides (engine `matching.js`, frontend
   `match.js` got matching ≥4-char prefix guards). Per-unit prices now render
   on every result card and flyer card.

### 20.B The comparison model (frontend `src/compare.js` + `summary.js`)
`computeComparison(query, tagged, flyerOffers, prices, storeLabel)` returns a
plain model rendered by `summary.js` (now rendering-only):
- **Listings** — one normalized shape for both worlds. Online results and
  flyer offers each pass `isRelevant` + a relevance floor; flyer offers also
  need a display name. Sizes parse from names (`parseSize`), giving `SAR/L`,
  `SAR/kg`, `SAR/pc`.
- **Best-value analysis** — within the DOMINANT unit family only (never
  SAR/L vs SAR/kg), with a **median outlier guard** (unit prices >6× off the
  family median are size-parse noise, dropped — one bad parse must never
  become the recommendation).
- **Headline decision** — value first, price as tiebreak: value pick ≡
  cheapest → one "Best buy"; value pick beats the cheapest's unit price by
  >10% (or the cheapest is unsized/other-family) → value pick leads and the
  cheapest keeps its own honest line; within 10% → cheapest wins ("equal
  value, less money").
- **Confidence ladder unchanged in spirit**: high = the headline sits in a
  confident same-brand+size ≥2-store equivalence group (flyer offers NEVER
  join those groups — OCR names carry no reliable brand, so a flyer headline
  caps at medium); medium = unit-value comparison; low = neither (with the
  explicit "different sizes/variants" note).
- **Price History verdict** unchanged, computed vs today's best total price.
- **Parser fixes found by live verification:** "24 قطعة × 125مل" no longer
  parses as pack=125 (count-word pack form added; the trailing ×N multiplier
  now refuses digits followed by a unit token); taa-marbuta count words
  (قطعة/حبة/عبوة) parse. Fixed identically in BOTH `src/match.js` and the
  engine's `src/matching.js` — **keep these two in sync**.

### 20.C Engine matching module (`brochure-engine/src/matching.js`, NEW)
One PURE home for "does this text match the query", shared by the `/offers`
read API and the watch monitor so server relevance ≡ client relevance:
normalization (now the single source; `offers/contract.js` re-exports it),
bilingual synonyms, tiered token scoring (whole word 100 > word-start prefix
70, ≥4 chars only > long substring 40, ≥5 chars), compound-noun demotion
(×0.45), `nameRelevance`/`isRelevantName`, plus the ported `parseSize` +
`sizeComparable` (±25%) for the monitor's size gate. `offerRelevance` now
returns `{ score, nameMatch }`; `/offers` ranks fully-name-matched offers
above text-only matches, strongest first, then cheapest
(`isNameMatch`/`relevanceScore` helpers). The D1 offer store's SQL LIKE
prefilter ORs each token's synonym variants so an English query reaches
Arabic-only OCR rows (final word-boundary filtering happens in JS).

### 20.D Price Monitoring (engine: `monitor.js`, `storage/watchStore.js`, routes)
- **Model:** `watches` + `alerts` D1 tables (same database; schema.sql updated,
  one-time delta in `migrate-2026-07-watches.sql`). A watch is
  `{ kind: 'product'|'grocery', query, targetPrice, … }`:
  - **product** — provider + stable `productId` (e.g. Amazon ASIN): evaluation
    re-finds THAT product in the provider's live results (id match, then
    link-contains-id); vanished/priceless → honest `no-data`, state untouched.
  - **grocery** — sweeps ALL sources: every `MONITOR_PROVIDERS` connector
    search (7 stores, per-store failures non-fatal) + the current flyer
    offers already in D1 (zero subrequests). Best trustworthy price wins.
- **Trust gates:** candidates must pass `isRelevantName` at floor 50 (a
  compound look-alike "milk chocolate" scores 45 — below the gate); grocery
  watches remember a **reference size** parsed at creation (from the watched
  product's name) and only accept size-comparable candidates (±25%, same
  family) — a 200 ml milk can never trigger a 2 L milk watch; flyer candidates
  must be NAME-tier matches and alerts carry `source: 'flyer'` + a verify
  note.
- **Crossing semantics:** an alert fires when the price crosses DOWN to ≤
  target (`is_below` arms/re-arms); still-below re-checks don't re-alert; a
  no-data run never re-arms.
- **Scheduling:** a second cron `45 5 * * *` (daily 08:45 AST) checks all
  active watches via the same SELF fan-out in batches of 3 (each batch gets
  its own Free-plan subrequest budget; a grocery watch ≈ 7 subrequests).
  Kept OUT of the weekly Tue/Wed fire so invocation caps never compound.
  `scheduled()` branches on `event.cron`.
- **Notifications:** in-app always (unseen count on health + `/watches`;
  badge in the UI). **ntfy.sh push optional**: set secret `NTFY_TOPIC`
  (+ optional `NTFY_SERVER`) and each alert POSTs to the topic (free, no
  account; the topic name is the only secret — pick something unguessable).
  Non-ASCII titles are folded into the body (HTTP headers are Latin-1).
- **API:** `GET /watches` (list + unseenAlerts + max), `POST /watches`
  (validated: kind/query/target bounds, product needs provider∈providers +
  id; capped at 24 active), `DELETE /watches?id=`, `GET /alerts[?unseen=1]`,
  `POST /alerts/seen`, and the secret-guarded `POST /watches/check[?ids=…]`
  (the cron's fan-out target; bare = check everything, for manual runs).
  User-facing watch writes are deliberately **open like the rest of this
  personal tool's API but strictly validated + capped** — acceptable for a
  single-user tool; revisit if the URL ever becomes shared.

### 20.E Frontend Price Monitoring UI
- **Alerts page** (`src/alertsPage.js`, route `#/alerts`, nav + tab added in
  `index.html`): watch list (target vs last-seen price with hit/above state,
  store + source, checked-at, delete), alerts feed (unseen highlighted,
  flyer-verify note, link out), honest empty/unreachable states. Viewing the
  page marks alerts seen; an **unseen badge** renders on the Alerts nav/tab
  (polled once at boot via `refreshAlertsBadge`).
- **Watch creation:** "🔔 Watch price" in the summary header (grocery watch,
  prefilled with the headline's price + name as the size reference) and a
  bell on every priced result card (product watch: provider + result id +
  first-6-words query). Both open the shared `<dialog>` (`openWatchDialog`).
- **API clients** live in `src/brochure.js` (project rule 2 — the one place
  the frontend knows the engine): `listWatches/createWatch/deleteWatch/
  listAlerts/markAlertsSeen`. All never-throwing.

### 20.F Files changed
```
serverless-connector/brochure-engine/
  src/matching.js                 NEW   shared bilingual matching + size parsing (§20.C)
  src/monitor.js                  NEW   Price Monitoring (§20.D)
  src/storage/watchStore.js       NEW   D1 watches+alerts store (memory twin in local.js)
  src/offers/contract.js          EDIT  normalization moved to matching.js; offerRelevance rebuilt
  src/storage/offerStore.js       EDIT  synonym-expanded SQL prefilter
  src/storage/local.js            EDIT  + createMemoryWatchStore; relevanceScore usage
  src/engine.js                   EDIT  + /watches, /alerts routes; /offers re-rank; health.watches
  src/scheduler.js                EDIT  + runWatchFanOut + createWatchCheckDispatcher
  src/index.js                    EDIT  watchStore+notifier in ctx; scheduled() branches on event.cron
  schema.sql                      EDIT  + watches + alerts (canonical)
  migrate-2026-07-watches.sql     NEW   the one-time delta for the LIVE D1 (NOT YET APPLIED)
  wrangler.toml                   EDIT  crons: + "45 5 * * *" (daily watch check)
  dev.mjs                         EDIT  + selftestMatching + selftestWatches (`node dev.mjs watchtest`);
                                        POST bodies now pass through the local dev server
live-shopping-assistant/
  src/compare.js                  NEW   the Price Comparison Engine (§20.B)
  src/compare.test.mjs            NEW   22 tests (`node src/compare.test.mjs`)
  src/summary.js                  REWRITTEN  renders the comparison model (rendering only)
  src/match.js                    EDIT  ≥4-char prefix guards; pack-parse fixes (§20.B)
  src/match.test.mjs              EDIT  30 tests now (eggplant/بيضاء guards, pack forms)
  src/alertsPage.js               NEW   Alerts page + watch dialog + badge (§20.E)
  src/brochure.js                 EDIT  + watch/alert API clients
  src/app.js                      EDIT  3rd route; summary feeds on flyer offers; card unit
                                        prices + watch bells; alerts badge at boot
  src/flyerOffers.js              EDIT  client-side relevance via flyerListing; fo-unit
  index.html                      EDIT  Alerts nav/tab + page section; hero copy 6→7 stores
  styles.css                      EDIT  summary v2, unit prices, bell, dialog, badge, Alerts page
```

### 20.G Validation performed (all ✅)
- **Engine offline:** `node dev.mjs watchtest` (matching: word boundaries,
  synonyms both directions, compound gate at floor 50, size gate, name/text
  tiering; monitoring: validation, cross-source best price, flyer-vs-online,
  crossing semantics incl. re-arm, product-id matching + not-found, all API
  routes + guard + cap), `offerstest`, `pricetest`.
- **Engine full (`node dev.mjs selftest`):** M1 Othaim PDF byte-exact, M2
  lulu live from D4D, fallback, Price History, offers live (1,176 stored /
  1,176 linked), retention, matching, monitoring — end-to-end green.
- **Frontend unit:** `node src/match.test.mjs` (30) + `node src/compare.test.mjs`
  (22) — all green.
- **Live browser (local bundle vs PRODUCTION connector+engine):** "eggs" →
  Best buy **30 pcs 9.95 SAR (0.33 SAR/pc) from Makkah's flyer**, badge +
  caveat shown, secondary "Lowest price · if you need less: 4.50 SAR · 6 pcs ·
  Ninja" (an eggplant surfaced here pre-fix — the prefix guard killed it);
  "milk" → 12×1 L multipack 58.99 (4.92 SAR/L) with the 125 ml 1.25 SAR as
  secondary (a bogus "125-pack" parse surfaced here pre-fix — the pack-form
  fix killed it); Arabic "حليب" works; history verdict renders; unit prices
  on cards; 28 watch bells; watch dialog opens prefilled and shows a clean
  error while the prod engine lacks /watches; Alerts page shows the honest
  unreachable note; Brochures page regression-checked (19 sections, 47
  covers); **zero console errors/warnings**.

### 20.H Production deployment — engine steps REQUIRED NEXT (blocked-on-user)
**Already done:** both repos pushed (`shopping-connector` `a8b1707`,
`live-shopping-assistant` `398b95b`); GitHub Pages serves the new frontend
(all files byte-verified against source). Until the engine deploys, the live
Alerts page shows its honest "unreachable" state and watch creation shows a
clean error; search/summary/flyers are fully functional.

**Remaining (run in this order; Node PATH note §8):**
```
cd serverless-connector/brochure-engine
npx wrangler d1 execute brochure-engine --remote --file=./migrate-2026-07-watches.sql
npx wrangler deploy
# optional phone push:  printf '%s' "<unguessable-topic>" | npx wrangler secret put NTFY_TOPIC
```
**Then verify:** engine `GET /` health lists `watches:{active,unseenAlerts}`
and both crons; `GET /offers?q=بيض` returns egg offers (no "white" noise);
create a test watch (`POST /watches` with a high target), run the guarded
`POST /watches/check` (INGEST_SECRET — rotate first, prior value uncommitted,
§12.G), confirm the alert row + `unseenAlerts`, delete the watch; frontend:
Pages bundle byte-matches, Alerts page lists/creates/deletes watches, badge
appears, eggs/milk summaries as in §20.G. The daily cron's first real fire is
the next 05:45 UTC.

### 20.I Notes, caveats & follow-ups
- **The two matching modules are mirrors** (frontend `src/match.js` ↔ engine
  `src/matching.js`): same synonyms, same prefix guards, same size parsing.
  Any change to one belongs in both.
- **Flyer OCR names remain noisy** (TODO §9-old.7): relevance now gates on
  word boundaries so noise rarely SURFACES, but derived names like "july فقط
  ايام days only wow best price fresh eggs white large 30s" still read rough.
  Improving `deriveNames` stays engine-side follow-up.
- **Watch caps:** 24 active watches, checked in batches of 3 (≈9 invocations
  ≤ the 32/event cap; each batch ≪ 50 subrequests). Raising the cap needs
  that math re-done first.
- **Product watches at non-Amazon stores** work by result-id match; grocery
  store ids are stable in practice but unproven long-term — a vanished id
  degrades to honest `no-data`, never a wrong alert.
- **The summary's old "flyer offers never take the headline" rule was
  deliberately superseded** by this milestone's unification directive; the
  honesty is preserved by the flyer badge + caveat + medium-confidence cap
  instead of exclusion.

---

## 21. Unified Marketplace + Product Understanding + Price Monitoring LIVE

> **Status (2026-07-03): DEPLOYED & VERIFIED IN PRODUCTION.** Engine Worker
> redeployed (final version `c750ac05`), search connector redeployed
> (`e81538cd`), frontend pushed to `main` (GitHub Pages). All offline suites
> green (engine `node dev.mjs selftest` incl. live D4D legs; frontend
> `match.test` 44/44, `compare.test` 33/33); full search/watch/brochure flows
> verified in a live browser against production backends.

### 21.A What this milestone delivers
1. **§20's blocked engine deployment is DONE — Price Monitoring is LIVE.**
   The D1 watches migration was applied and the engine deployed with both
   crons (`0 6 * * 2,3` ingest, `45 5 * * *` watch check). Verified in
   production end-to-end: watch create → guarded check → alert row + unseen
   count → mark-seen → delete; the Alerts page lists/creates/deletes watches
   against the live engine. `INGEST_SECRET` was rotated (uncommitted, as
   always). `NTFY_TOPIC` is still unset (in-app alerts only) — optional.
2. **ONE unified marketplace (the milestone's centerpiece).** The search page
   no longer renders per-store sections plus a separate flyer panel. Every
   result is an OFFER in a single ranked grid (`src/marketplace.js`): online
   results and flyer offers together, ranked relevance-band-first then price,
   each card carrying a **store badge** (colored dot + name) and flyer cards
   a small **"flyer · until <date>"** tag. Flyer cards click through to the
   in-app viewer when the engine holds that edition (now including the PDF
   branch), else the flyer page. D4D branch/language duplicates of the same
   offer collapse to one card (≥70% token overlap within store+price). A
   compact **sources strip** keeps per-store state honest (result count /
   "no matches" with hidden-count tooltip / "temporarily unavailable") and
   hosts the weekly-flyer chips. `src/flyerOffers.js` was deleted.
3. **Product-family understanding.** A bilingual two-tier family classifier
   (BASE families like milk/laban/yogurt/cheese/eggs…; DERIVED families like
   chocolate/pastry/prepared-dishes that OUTRANK base keywords — "milk
   chocolate" is chocolate, "egg spring roll pastry" is pastry, "egg curry
   chappati" is a prepared dish) lives in BOTH mirrors: frontend
   `src/match.js` (`productFamily`/`queryFamily`/`tokenCoverage`) and engine
   `src/matching.js`. Arabic definite articles (ال/وال) are stripped for
   classification; ingredient markers (بال "with") deliberately are NOT.
   Where it acts:
   - **compare.js:** listings of a KNOWN different family than the target
     family (query's own family, else the dominant family of the matches)
     are excluded from the comparison — with a visible "N similar-name
     products from a different category excluded" note. **Fixes "نادك منزوع
     الدسم → yogurt".**
   - **compare.js coverage gate:** a listing may only compete when it matches
     (nearly) every query token — 2-token queries demand both. **Fixes "كيري
     مربعات → puff pastry".** New synonym groups: skimmed/منزوع/خالي,
     squares/مربعات (both mirrors).
   - **marketplace grid:** family-mismatched entries drop to the bottom band.
   - **engine `/offers`:** family-tier ranking (query family > family-less >
     mismatched) — "بيض" now returns egg trays above egg-pastry.
   - **engine monitor:** a watch whose query names a family never alerts on a
     KNOWN different family (a 2 L laban can no longer satisfy a milk watch —
     the selftest traps exactly this).
4. **Shared best price.** `computeComparison` now reports `sharedWith`: every
   other store selling the same thing (same price AND size within 3% / same
   normalized name) — the summary renders "at Lulu · Panda" plus a "Best
   price shared by N stores" line instead of crediting one store.
5. **Amazon stability regression — root-caused and fixed.** The connector was
   NOT the regression (measured 9/10 success, same as §18). The frontend was:
   `rankAndFilter` fell back to showing a store's ENTIRE result list when
   nothing was relevant — Amazon's fuzzy matches ("كيري مربعات" → 48 office
   chairs) rendered as-is and fed the comparison. Now irrelevant results are
   dropped and honestly counted ("52 unrelated results hidden" tooltip), and
   the amazon/noon providers retry once client-side (a fresh Worker
   invocation = new egress IP + fresh in-Worker retry budget), lifting
   effective availability to ~99%.
6. **Production bugs found & fixed along the way:**
   - **`/offers` search starvation (critical):** the D1 prefilter window
     (`ORDER BY price LIMIT n`) filled with substring noise — "rice" lives
     inside "price" (2,568 rows), "بيض" inside "بيضاء/ابيض" — so the JS
     word-boundary filter dropped everything and real queries returned ZERO
     offers. The prefilter now fills the window word-boundary-matches-first
     (exact-word band > word-start band > substring, price within each) and
     the read route over-fetches with a floor of 120. "eggs"/"بيض"/"rice"
     all return correct offers in production now.
   - **CORS DELETE missing:** `Access-Control-Allow-Methods` lacked DELETE,
     so deleting a watch from the browser was preflight-blocked. Fixed.
   - **Danube 422 on multi-word Arabic queries** (connector): Danube's Spree
     origin 422s any multi-word query starting with Arabic ("كيري مربعات");
     single Arabic words and English multi-word are fine. The provider now
     falls back to the longest single token and lets client ranking narrow.
7. **Manuel retired (brochure-source consistency).** Dead on D4D since
   2025-09 (its store page holds zero flyers) with no official offers page.
   Removed from the engine registry (19→18 providers) and the frontend's
   ENGINE_STORES; its stale D1 row marked `is_current=0` (metadata/history
   kept forever, per the retention model). All 18 remaining stores verified
   current at deploy (validTo 2026-07-03…07-14). D4D remains the single
   primary source + officialLink fallback (§15 model unchanged).

### 21.B Files changed
```
live-shopping-assistant/
  src/marketplace.js   NEW   unified grid + sources strip + cards (both worlds)
  src/flyerOffers.js   DELETED (separate flyer panel retired)
  src/match.js         EDIT  + product families, tokenCoverage, new synonyms
  src/compare.js       EDIT  + family gate, coverage gate, sharedWith
  src/summary.js       EDIT  renders shared stores + family-excluded note
  src/app.js           EDIT  runSearch feeds the marketplace; honest filtering
  src/brochure.js      EDIT  + storeColor(); Manuel removed from ENGINE_STORES
  src/providers/amazon.js, noon.js  EDIT  one client-side retry
  src/match.test.mjs   EDIT  44 tests (families, coverage, synonyms)
  src/compare.test.mjs EDIT  33 tests (family/coverage/shared-price cases)
  styles.css           EDIT  marketplace styles replace the flyer-panel styles
  HANDOFF.md           EDIT  this section
serverless-connector/
  src/providers/danube.js               EDIT  422 multi-word-Arabic fallback
  brochure-engine/src/matching.js       EDIT  + families (mirror), synonyms
  brochure-engine/src/monitor.js        EDIT  + family gate in evaluateGrocery
  brochure-engine/src/engine.js         EDIT  /offers family ranking + overfetch
                                              floor; CORS + DELETE
  brochure-engine/src/storage/offerStore.js EDIT word-boundary-banded prefilter
  brochure-engine/src/providers/manuel.js   DELETED
  brochure-engine/src/index.js, dev.mjs     EDIT  registry 19→18; family+laban
                                              trap tests added
```

### 21.C Production verification (all ✅, 2026-07-03)
- **Engine:** health `18 providers`, `watches:{active:0}`, both crons; watch
  lifecycle (create → check → alert 1.25 SAR @ tamimi → seen → delete) run
  against production; `/offers?q=بيض` → real egg offers (trays, no
  white-noise, no pastry first), `q=rice`/`q=eggs`/`q=milk` all correct;
  Manuel absent from providers and `held`.
- **Connector:** `danube` "كيري مربعات" → 20 results (was HTTP 502); amazon
  10-run probe 9/10 (unchanged §18 baseline) + client retry on top.
- **Frontend (live browser vs production backends):** "eggs" → Best buy
  **9.95 SAR Makkah 30 pcs (0.33 SAR/pc)** from the flyer, grid leads with
  real eggs; **"كيري مربعات"** → all-Kiri grid, Kiri headline, "52 unrelated
  results hidden" on Amazon's chip, no pastry anywhere; **"نادك منزوع الدسم"**
  → milk headline + milk cheapest-alternative, "47 … different category
  excluded"; "milk"/"حليب" → 165–193 results, history verdict, watch dialog
  prefilled; Alerts page create/list/delete against production; Brochures
  page 18 stores / 46 covers / no Manuel; flyer card click → in-app viewer
  (`makkah/central/2026-W27/page00.webp`); **zero console errors**.
- **GitHub Pages:** served bundle byte-verified against `main` after push.

### 21.D Notes, caveats & follow-ups
- **The two matching modules are mirrors** — now including the FAMILY lexicon
  and synonyms. Any change to one belongs in both (`src/match.js` ↔
  `brochure-engine/src/matching.js`).
- **The family lexicon is a curated keyword list**, not a taxonomy: names
  with no family keyword ("Kinder Joy Egg") classify by their base word and
  can still slip into a family they only borrow a word from. The comparison
  only ever EXCLUDES on a provable mismatch, so the failure mode is "not
  excluded", never "wrongly excluded". Grow the lexicon as real queries
  surface gaps.
- **Coverage tolerance:** 2-token queries demand both tokens; ≥3-token
  queries tolerate one unmatched descriptor (so "قليل الدسم" low-fat can
  stand in for "منزوع الدسم" skimmed in a 12×1L headline — name is always
  shown). Tighten per-token if real confusion appears.
- **Othaim flyer offers never open in-app**: its brochure is the official
  PDF while offers come from D4D, so the edition link can't exist — those
  cards open the flyer page externally (by design; all-image stores open
  in-app).
- **NTFY_TOPIC remains unset** — alerts are in-app only until the user runs
  `npx wrangler secret put NTFY_TOPIC` (TODO §9.1).
- **The daily watch cron's first real fire** is the next 05:45 UTC; the
  guarded manual `POST /watches/check` path is verified.

---

## 22. Flyer Coverage — Investigation, Fixes & Per-Retailer Baseline

> **Status (2026-07-03 night): DEPLOYED & VERIFIED IN PRODUCTION.** Engine
> Worker redeployed (version `7a54b3e7`, now with a **Friday ingest cron**),
> frontend pushed to `main` (GitHub Pages). All suites green (engine
> `node dev.mjs selftest` incl. the live D4D leg; frontend `match.test` 50/50,
> `compare.test` 37/37); coverage measured before/after with a 40-query
> bilingual battery against production. **Result: 2.75× more flyer offers
> surfaced for the same queries, and Arabic/English queries now return
> symmetric results.**

### 22.A The investigation (what was actually limiting flyer coverage)
The complaint: flyer results appear far fewer than expected despite current
brochures being available. The whole pipeline was measured stage by stage:

1. **Upstream (D4D) — NOT the problem.** Live probes of the 6 majors compared
   D4D's current offers with our D1: hyperpanda 1105 vs 1077 held, tamimi
   849/847, carrefour 673/671, danube 1367/1362, lulu 1176/1176, othaim
   523/523 — in sync. Extraction density is healthy: **10–37 offers per flyer
   page** (see baseline, §22.D).
2. **Ingest gates / name derivation — NOT the problem.** 15,706 current
   offers across 18 stores; only 486 (~3%) had no derived name at all.
3. **Engine `/offers` search — NOT the problem.** For staple queries the
   engine returns abundant relevant offers (most queries filled the 200 cap).
4. **THE PROBLEM — the frontend threw most of it away, twice:**
   - **`flyerListing` gated relevance on ONE derived name** (`name ||
     nameAr`). Flyer OCR names are bilingual and the product-type word often
     lands in only one language ("guava raspberry pomegranate 3ltr" EN + "ندى
     عصير كوكتيل" AR) — the single-name probe dropped **30–60% of the
     engine's genuinely-relevant offers** (measured: juice 200→96, tissue
     200→59, coffee 200→108, sugar 196→113). Sampled drops were real
     products, not noise.
   - **The app fetched only 40 offers per query** while the engine held 200+
     relevant ones.
5. **Secondary losses:** missing synonym bridges (colloquial **مويه** (water)
   returned **ZERO** offers; no tuna/تونه, shampoo/شامبو, tissue/مناديل,
   chocolate/شوكولاته bridge; no brand transliterations بيبسي/تايد/نوتيلا) —
   and a **weekend freshness hole**: ingest fired only Tue+Wed while ~21% of
   offers (3,263 of 15,706 measured) expire Fri–Mon and weekend flyers
   publish Thu/Fri — the marketplace thinned exactly when the user shops.

### 22.B What changed
```
live-shopping-assistant/
  src/compare.js       flyerListing now (a) judges relevance/coverage over BOTH
                       derived names concatenated, (b) picks the DISPLAY name in
                       the query's script (Arabic query -> Arabic card name)
  src/app.js           OFFERS_FETCH_LIMIT = 120 (was 40) for grid + summary
  src/match.js         SYNONYMS += مويه (water), tuna/تونه/تن, shampoo/شامبو,
                       tissue/مناديل/محارم, chocolate/شوكولاته/شوكولا,
                       diapers/حفاضات/حفايض, pepsi/بيبسي, cola/كولا,
                       tide/تايد, nutella/نوتيلا
  src/match.test.mjs   50 tests (new synonym + transliteration cases)
  src/compare.test.mjs 37 tests (bilingual flyer gate, display-language pick)
serverless-connector/brochure-engine/
  src/matching.js      the SAME synonym additions (the two mirrors stay in sync)
  src/offers/contract.js deriveNames: a lone <5-char fragment ("casc") is OCR
                       debris -> null, so the other language's name carries the
                       card (names refresh at next ingest upsert)
  wrangler.toml        ingest cron "0 6 * * 2,3" -> "0 6 * * 2,3,5" (Friday
                       fire closes the weekend hole; same per-fire budget,
                       unchanged flyers dedupe to zero KV writes)
  dev.mjs              selftestMatching + selftestOffers extended (synonyms,
                       transliterations, debris guard)
```
No schema change; no API change; the Offer contract and both repos' provider
layers untouched.

### 22.C Validation (all ✅)
- **Engine:** `node dev.mjs selftest` end-to-end green incl. the live D4D
  lulu leg (1,176 fetched/stored/linked); deployed `7a54b3e7`; health shows
  both crons (`0 6 * * 2,3,5`, `45 5 * * *`), 18 providers, 15,706 current
  offers. Production reads: `مويه` → 200 offers (was 0), `بيض` → real egg
  trays cheapest-first (no pastry/white noise), rice/milk/eggs correct.
- **Frontend:** 50 + 37 unit tests green. Live preview against production
  backends: "juice" → flyer chip **96 offers** (was ~34), "مناديل" → **103
  offers** (was ~15) with Arabic card names, summary "263 offers across 23
  stores · 119 from this week's flyers"; zero console errors (only the known
  Amazon best-effort warnings).
- **Before/after battery** (40 bilingual staple+brand queries, production
  data, old gates vs new): **1,466 → 4,034 offers surfaced (2.75×)**; every
  Arabic query now returns exactly what its English twin returns.
- **Pages propagation note (at handoff time):** the new build IS deployed —
  `src/match.js` from commit `efaf12f` serves live and remote `main`
  byte-matches local HEAD — but the CDN edge still held pre-push copies of
  `app.js`/`compare.js` (`Cache-Control: max-age=600`; they roll over within
  minutes of their TTL). If a spot-check ever looks stale, re-fetch with a
  cache-buster after 10 minutes before suspecting the deploy (§8).

### 22.D Per-retailer coverage baseline (measure future work against this)
Current offers in D1 (2026-07-03) · D4D extraction density · offers surfaced
by the 40-query battery through the frontend gates (old → new):

| Store | Current offers | Offers/page | Battery: old → new |
|---|---|---|---|
| Panda (hyperpanda) | 1,077 | 26.9 (40pp) | 82 → 328 |
| Tamimi | 847 | 19.7 (43pp, 3 flyers) | 102 → 260 |
| Carrefour | 671 | 14.9 (45pp, 2 flyers) | 64 → 192 |
| Danube | 1,362 | 34.0 (40pp) | 114 → 414 |
| Lulu | 1,176 | 10.3 (114pp, 6 flyers) | 50 → 154 |
| Othaim | 523 | n/a (official PDF) | 58 → 190 |
| Nesto | 1,451 | 37.2 (39pp, 3 flyers) | 112 → 286 |

(Remaining 11 stores: 323–1,498 current offers each; battery totals in the
same run: danube/farm/hyperpanda/prime/alwafa top the surfaced counts.)
**Ceiling note:** the upstream bound is D4D's own AI extraction — it is dense
(10–37 offers/page) and matches what D4D shows its own users; anything beyond
that would need our own OCR (explicitly deferred, §0).

### 22.E Notes, caveats & follow-ups
- **The two matching mirrors** (`src/match.js` ↔ engine `src/matching.js`)
  now share the enlarged synonym table — any future entry belongs in BOTH.
- **The synonym/transliteration table is curated, not generative.** Grow it
  as real queries surface gaps (the مويه-class of miss is one line to fix).
- **yogurt/زبادي stays conservative** (42 of 120 engine hits pass the name
  gate): many engine matches are text-only (روب/زبادي in OCR but not in the
  derived name) — honest, but a future deriveNames improvement could recover
  them.
- **The debris-name guard takes effect per store at its next ingest** (names
  refresh on upsert) — fully in effect after the Tue+Wed+Fri cycle.
- **First Friday cron fire** is the next Friday 06:00 UTC; watch the KV
  write budget only if many more stores are added (§19.C math unchanged).

---

## 23. Polishing — Amazon Reliability, Navigation & Product Understanding

> **Status (2026-07-03 late): DEPLOYED & VERIFIED IN PRODUCTION.** Connector
> redeployed (version `360f5210`), engine redeployed (version `79e3fa3c`, both
> crons intact `0 6 * * 2,3,5` + `45 5 * * *`), frontend pushed to `main`
> (GitHub Pages). All suites green: frontend `match.test` **56/56**,
> `compare.test` **39/39**; connector `amazon.test` **12/12**; engine
> `node dev.mjs selftest` end-to-end incl. the live D4D lulu leg (1,176
> offers) and **17/36 lulu pages carrying a deep-link pageId**. A "polishing"
> milestone by explicit direction: no new feature, no redesign — three
> real-world trust regressions fixed and one keyword-complementing
> product-understanding improvement.

### 23.A Amazon reliability — root cause & fix (the headline)
**Symptom:** Amazon felt far less reliable after the §21 unification.
**Root cause (measured, not guessed):** the connector's Amazon success rate was
unchanged (~9–10/10 in probes) — the regression was in RESULT IDENTITY, exposed
by §21's honest relevance filter. amazon.sa's current English search layout
renders TWO `<h2>`s per result: a compact **brand** line
(`a-size-mini s-line-clamp`, e.g. "Almarai") FOLLOWED by the **product title**
(`a-text-normal`, usually with the full name in `aria-label`). The old parser
matched the FIRST `<h2>`'s span → English results were named bare brands
("Almarai", "Saudia", "Nadec"). Before §21 the frontend *dumped everything*, so
those still showed; §21 replaced that with an honest filter that DROPS results
whose name doesn't match the query — and "Almarai" contains no "milk", so almost
every English Amazon result was filtered out. Arabic was unaffected (its layout
leads with the title `<h2>`, no brand line) — which is why the bug looked
intermittent/English-only.

**Fix (`serverless-connector/src/providers/amazon.js`):** `parseProducts` now
parses ALL `<h2>` blocks per result, extracts the **title** from the non-brand
h2 (preferring its `aria-label`, stripping a "Sponsored Ad – " prefix) and the
**brand** from the `s-line-clamp` h2, and composes the display name brand-led
(`"Almarai Full Fat Fresh Milk, 2.85 Liter"`) exactly like Panda/Lulu name their
products — so results are both correctly identified AND matchable. It also reads
the strike-through list price (`a-price a-text-price`) into `oldPrice` + a
`-NN%` discount label, and decodes the few HTML entities Amazon titles carry.
A legacy fallback keeps a single-`<h2>` or reverted markup working.
**Measured:** English "milk" went from ~2/48 → **46/48** results containing the
query word; "nutella"/"كيري" likewise now full, matchable names. This is the
"dedicated retrieval/parse strategy that differs from other retailers" the
milestone explicitly allowed. `amazon.test.mjs` (new, fixture-based, 12 asserts)
locks it so the brand-as-name regression can't silently return.

### 23.B Navigation — flyer offers open the right page; safe online links
1. **Flyer offer → the offer's own brochure page (the "expected location").**
   A tapped flyer offer previously opened the in-app viewer at page 1. Offers
   carry `pageRef` (D4D's `data-page-id`, also the `?page=` value on the external
   flyer). The engine now captures that id per page and the viewer uses it:
   - engine `collectors/adapters/d4d.js` — `parseLeaflet` merges D4D's two
     `<picture class="offer-page">` renders (one carries the image URL, the other
     the `data-page-id`) by `data-index`, emitting an aligned `pageIds[]`;
   - engine `collectors/aggregator.js` + `pipeline.js` — thread `pageId` onto
     each downloaded page and into the `meta.json` `pages[]` entries (no D1
     schema change; the read-API `/brochures` rows are untouched);
   - frontend `brochure.js` `loadBrochurePages` returns an aligned `pageIds[]`;
   - frontend `viewer.js` `openBrochureViewer(b, name, { targetPageId })` opens
     on the page whose id matches (page-1 fallback when unknown);
   - frontend `marketplace.js` `flyerCard` passes `{ targetPageId: offer.pageRef }`.
   **Rollout:** new/changed flyers get pageIds on ingest immediately (proven live
   — 17/36 lulu pages); editions already held keep opening at page 1 until their
   next weekly refresh (Tue+Wed+Fri) re-downloads them. Zero-risk: the fallback
   IS the prior behaviour. Offers whose edition isn't held in-app still open the
   external flyer at the right page via the `?page=` deep-link (unchanged).
2. **Online cards never navigate anywhere unexpected.** `marketplace.js`
   `onlineCard` now only sets `href` when the result carries a real absolute
   `http(s)` URL; a missing/relative link renders a non-navigating card instead
   of sending the user to a broken path. (Audit found all seven providers'
   links resolve correctly — panda/tamimi/danube/ninja 200, lulu/noon are
   bot-gated to datacenter curls but structurally correct; this is a safety net.)

### 23.C Product understanding — category as a corroborating family signal
The keyword family classifier reads only the OCR-derived name. Flyer offers ALSO
carry the aggregator's own product **category** (D4D's global taxonomy, e.g.
`eggs`, `yogurt-labneh`, `chocolates-candies`) — a structured, human-curated
semantic signal we already store for free. New in both matching mirrors
(`src/match.js` ↔ engine `src/matching.js`):
- `CATEGORY_FAMILY` — maps only the categories that resolve to exactly ONE of our
  families (ambiguous ones like `milk-laban`, `tea-coffee`, `cheese-creame` are
  deliberately left out).
- `categoryFamily(slug)` and `offerFamily(offer)` = name-derived family, FALLING
  BACK to the category only when the name yields none.
**Where it acts:** the engine `/offers` family tier, the engine monitor's
grocery family gate, and the frontend `flyerListing`/marketplace family. The name
always wins (so "milk chocolate" in the chocolates category is still chocolate,
an "egg curry" is still a prepared dish), so precision is unchanged — the payoff
is recovering **debris-named** offers into their true family. Verified live: a
`بيض`/`yogurt` read now keeps OCR-garbled offers whose category is `eggs`/
`yogurt-labneh` in-family, and demotes an off-category `canned-packeted` text
match — directly relieving the §22.E "yogurt/زبادي stays conservative" note.
This is the "semantic understanding that complements the keyword approach without
sacrificing precision, transparency, performance or maintainability" the
milestone asked for: it is a lookup, not a model — $0, synchronous, auditable.

### 23.D Files changed
```
serverless-connector/
  src/providers/amazon.js            title/brand split, oldPrice+discount, entity
                                     decode, export parseProducts (for the test)
  src/providers/amazon.test.mjs      NEW — 12 fixture asserts locking the fix
  brochure-engine/src/matching.js    + CATEGORY_FAMILY, categoryFamily, offerFamily
  brochure-engine/src/engine.js      /offers family tier uses offerFamily
  brochure-engine/src/monitor.js     grocery flyer gate uses offerFamily
  brochure-engine/src/collectors/adapters/d4d.js   capture data-page-id -> pageIds[]
  brochure-engine/src/collectors/aggregator.js     thread pageId onto page objects
  brochure-engine/src/pipeline.js    write pageId into meta.json pages[]
  brochure-engine/dev.mjs            + category-family + pageId-capture assertions
live-shopping-assistant/
  src/match.js        + CATEGORY_FAMILY, categoryFamily, offerFamily
  src/compare.js      flyerListing family via offerFamily (category fallback)
  src/viewer.js       openBrochureViewer accepts { targetPageId }, opens there
  src/brochure.js     loadBrochurePages returns aligned pageIds[]
  src/marketplace.js  flyerCard passes targetPageId; onlineCard link guard
  src/match.test.mjs  56 tests (+ category/offer family)
  src/compare.test.mjs 39 tests (+ category-fallback flyer listings)
  HANDOFF.md          this section + header
```
No result-contract change, no Offer-contract change, no D1 schema change, no API
change. The two matching mirrors stay in lock-step (any family/synonym edit
belongs in BOTH).

### 23.E Production verification (all ✅)
- **Connector `360f5210`:** live Amazon `q=milk` → "Saudia Full Cream Milk…",
  "Almarai Full Fat Fresh Milk…", "Nadec Full Fat Long Life Milk…" (brand-led,
  matchable); `q=nutella` → "Nutella Hazelnut Chocolate Spread…"; `q=حليب` →
  full Arabic names — all with prices; 48–60 results/query.
- **Engine `79e3fa3c`:** health `18 providers`, `15,823` current offers, both
  crons, watches active; `/offers?q=بيض` → egg offers incl. category-recovered
  debris names, off-category text match demoted; `/offers?q=yogurt` → all
  `yogurt-labneh` offers incl. OCR-garbled ones now kept in-family.
- **Frontend:** pushed to `main`; GitHub Pages serves the new bundle (verify per
  §8 with a cache-buster if a spot-check looks stale — CDN `max-age=600`).
- **Suites:** frontend match 56/56 + compare 39/39; connector amazon 12/12;
  engine selftest end-to-end green incl. live D4D + the 17/36 pageId assertion.

### 23.F Notes, caveats & follow-ups
- **pageId backfill is lazy, by design.** In-app page-accurate jumps light up
  per edition on its next weekly ingest (unchanged flyers dedupe and are NOT
  re-downloaded, so their `meta.json` isn't rewritten). Full coverage after one
  Tue+Wed+Fri cycle; until then those offers open at page 1 (or externally at the
  right page). No forced backfill was run (it would require re-downloading held
  flyers, spending the Free-plan subrequest budget for a cosmetic gain).
- **D4D page-ids sit on ~half the pages** (even `data-index`, stepping by 6 —
  D4D groups a 2-page spread under one id). An offer's `pageRef` always matches
  one of them, so the jump is exact; odd interstitial pages simply have no id.
- **Category map is curated, conservative.** Grow `CATEGORY_FAMILY` only with
  categories that map to exactly one family; ambiguous ones must stay unmapped
  (the failure mode is "no family", never "wrong family"). D4D category ids →
  slugs live in `offers/d4dOffers.js` `D4D_CATEGORIES`.
- **Amazon stays best-effort.** The parse fix restores identity+matchability; the
  underlying anti-bot interstitial (retry + client retry, ~99% effective) is
  unchanged. PA-API remains the durable path (set the secrets to activate).
- **The Amazon `oldPrice`/discount are new** and flow into the comparison/value
  logic like any other store's — a nice side benefit (Amazon deals now show
  their savings).

---

## 24. Polishing — Ranking Control, Product Types, Panda Navigation & Super Search Rebrand

**Status: DEPLOYED & VERIFIED IN PRODUCTION.** A focused polish milestone — four
targeted improvements, zero architectural change. Every prior contract (Core,
providers, the 10-key normalized result, the connector/engine split, the
comparison model shape) is untouched; these changes are additive.

### 24.A Ranking control — "Lowest price" vs "Best value" (objective 1)

The unified results grid always ranked by relevance band then **lowest total
price**. The comparison summary already reasons about **per-unit value**, so the
two perspectives existed but only one was exposed in the grid. Now the user
chooses.

- **UI:** a segmented control in the market head (`.sort-toggle`, a
  `role="radiogroup"` with two `role="radio"` options — "Lowest price" /
  "Best value"), styled to match the design system (`styles.css`
  `.sort-toggle`/`.sort-opt`).
- **Logic (`src/marketplace.js`):** `makeComparator(qFam, sort, domUnit)`.
  Relevance bands still come first in BOTH modes (a cheap look-alike never
  outranks the real product). Within a band:
  - `price` (default, unchanged) → lowest total price.
  - `value` → lowest price **per comparable unit**, but only compared **within
    the pool's dominant unit family** (`dominantUnit(pool)` — the unit shared by
    the most sized entries, mirroring `compare.js`'s value analysis). Entries
    without a unit price in that family fall back to price, *after* the
    unit-ranked block. This keeps the value ranking apples-to-apples (SAR/L never
    races SAR/kg) instead of comparing raw unit numbers across families.
  - `entryUnit(e)` caches each entry's `{value, unit}` (online → `unitPrice(it)`,
    flyer → `listing.up`).
- **Persistence:** the choice is a remembered daily-use preference —
  `memory.get('rank')` / `memory.set('rank', mode)` in `app.js` (localStorage key
  `lsa.app.rank`), passed to `createMarketplace(root, stores, q, { sort, onSort })`.
- **Verified live** (production connector, "milk"): price mode → 1.25/1.25/1.45…
  SAR total; toggling to value mode reordered to 3.92/4.33/4.33… SAR/L (higher
  totals, best value per litre), and the preference persisted across searches.

### 24.B Product types — the FORM attribute (objective 2)

The milestone's example: **"Herfy chicken nuggets"** vs **"Herfy minced chicken
roll"** share **brand** (Herfy) AND **family** (chicken) yet are different
products. Family (§21) is the *ingredient/category* attribute and is too coarse
to separate them; token coverage let the roll through (a 3-token query tolerates
one missing token). So a third, orthogonal attribute was needed: the product's
**FORM/type**.

- **New classifier** (`src/match.js`, mirrored in engine `src/matching.js`):
  `productType(name)` / `queryType(query)` over a narrow bilingual dictionary
  (`PRODUCT_TYPES`: nuggets, burger, sausage, roll, mince, fillet, breast,
  strips, wings, kofta, luncheon). Whole-word match, Arabic definite article
  stripped, earliest keyword wins. A name with no form keyword → `null` (nothing
  is gated — we never guess a difference we can't see).
- **Three attributes now decide "same product":** brand (equivalence), family
  (the ingredient/category gate, §21), and **type** (this):
  - **Comparison type gate (`compare.js` `computeComparison`)** — parallel to the
    family gate: when the query names a form, listings of a **KNOWN different
    form** are excluded from the comparison (`typeExcluded`, surfaced in the
    summary as "N products of a different type excluded from this comparison").
    Type-less listings stay. The gate never empties the comparison. Listings
    carry a cached `type` (online: `productType(name)`; flyer: over both OCR
    names).
  - **Equivalence grouping (`match.js` `sameProduct`)** — two items with a KNOWN
    different form never group as the same product, even at the same brand+size
    (so no false high-confidence "same product" claim).
  - **Watch monitor (`engine/src/monitor.js`)** — a `typeMismatch` gate on the
    grocery sweep (online + flyer), parallel to `familyMismatch`, so a "chicken
    nuggets" watch is not satisfied by a "chicken roll".
- **Grid unchanged:** similar-type products still appear in the results grid
  (the milestone's "similar products may still appear, but must not drive the
  summary/same-product comparison"). Only the comparison/summary/equivalence and
  the watch gate enforce type.
- **Tests:** `match.test.mjs` (65, +9) — form classification, nuggets vs
  chicken-roll never group, identical nuggets still group; `compare.test.mjs`
  (45, +6) — the roll is excluded and never becomes the headline, `typeExcluded`
  counted, a bare "chicken" query gates nothing; engine `dev.mjs` matching
  selftest — form classification + `queryType`.
- **Verified live:** a "herfy chicken nuggets" search excluded **9 products of a
  different type** from the comparison while the headline stayed a nuggets
  product and Herfy nuggets still filled the grid.

### 24.C Panda navigation restored (objective 3)

**Symptom:** opening a Panda result reached panda.sa and then displayed **"No
products found."** **Root cause:** panda.sa's product page (and its backing
`GET /v3/products/<id>` detail call) resolve **only by the VARIETY id**, but the
`products-v3` strategy built the result `id` + link from the catalogue
`product.id`. For "Almarai Long Life Milk" the list returns `product.id 18499`
while the variety is `28874`; the storefront looked up 18499, found nothing, and
rendered the empty state. (The `suggestions-v3` strategy already emitted the
variety id — the two strategies were inconsistent.)

- **Fix (`serverless-connector/src/providers/panda.js` `normalizeProduct`):**
  emit `variety.id` for BOTH the result `id` and the `productLink` (fallback to
  `product.id` only if a product has no variety). One-line-of-intent change,
  navigation architecture preserved (still a plain absolute product URL the card
  opens). `normalizeProduct` is now exported for testing.
- **Verified against LIVE Panda:** new variety ids resolve —
  `/v3/products/28874` → **200**, `/v3/products/25945` → 200, `/v3/products/33332`
  → 200; the old catalogue id `/v3/products/18499` → **412 "Product not found"**
  (exactly the bug). Production connector now returns variety-id links.
- **Regression test:** `serverless-connector/src/providers/panda.test.mjs` (9)
  — a fixture whose `product.id` (18499) ≠ `variety.id` (28874) asserts the
  result id/link use the variety id and never contain 18499, plus the
  no-variety fallback.
- **Watch note:** `monitor.js` re-finds a product watch by `String(r.id) === id`
  (or `link.includes(id)`). New Panda product watches store the variety id and
  match cleanly; any pre-existing Panda product watch keyed on the old
  `product.id` would need re-creating — acceptable for a personal tool, and
  grocery watches (query-based) are unaffected.

### 24.D Super Search rebrand + lighter-blue theme (objective 4)

- **Name:** Souq → **Super Search** everywhere user-facing — `index.html`
  `<title>`, meta description, the brand wordmark + `aria-label`; `app.js`
  `document.title` for all three routes; the internal custom event
  `souq:search-store` → `supersearch:search-store` (both dispatcher in
  `brochures.js` and listener in `app.js`); code-comment brand references. No
  "Souq" remains in shipped files (HANDOFF keeps historical mentions with a
  branding note at the top).
- **Theme (lighter blue, `styles.css`):** the design system is fully driven by
  CSS custom properties, so the refresh is centralized on `--brand`/`--brand-2`/
  `--grad`/`--brand-soft`/`--brand-ring` (light: `#2563eb` + a sky→blue gradient
  `#38bdf8→#2563eb`; dark: `#7cc0fb`/`#60a5fa`), plus the two hard-coded brand
  shadows (search button, brand mark) and the shadow tint, and the `theme-color`
  meta tags. Layout, spacing, typography, motion, and store colors are
  unchanged — the clean design language is preserved.
- **Verified live:** the wordmark, blue search button/chip, gradient brand mark,
  and blue segmented toggle all render correctly in the preview; no console
  errors.

### 24.E Deployment

- **Connector** (`shopping-connector`) redeployed (`npx wrangler deploy`) — the
  Panda variety-id fix. Version `a8979b24`. Production verified (variety-id
  links).
- **Brochure Engine** (`brochure-engine`) redeployed — the mirrored
  `productType`/`queryType` + the watch `typeMismatch` gate. Version `bde45555`.
  Health verified (18 stores, 15,706 current offers, 5 active watches). No schema
  migration (additive code only).
- **Frontend** pushed to `main` → GitHub Pages (static; ranking toggle, product
  types in the comparison, rebrand + theme).

### 24.F Files touched

- Frontend: `src/match.js` (productType/queryType + sameProduct form guard),
  `src/compare.js` (type gate + `type` on listings + `typeExcluded`),
  `src/summary.js` (type-excluded note), `src/marketplace.js` (ranking toggle +
  value comparator), `src/app.js` (persisted rank pref + titles + event),
  `src/brochures.js` (event rename), `index.html` (brand + theme-color),
  `styles.css` (theme vars + `.sort-toggle`), `src/match.test.mjs`,
  `src/compare.test.mjs`, `HANDOFF.md`.
- Connector: `src/providers/panda.js` (variety-id fix + export),
  `src/providers/panda.test.mjs` (new).
- Engine: `src/matching.js` (productType/queryType mirror), `src/monitor.js`
  (typeMismatch gate), `dev.mjs` (selftest asserts).

### 24.G Remaining limitations

- **`PRODUCT_TYPES` is deliberately narrow** (processed/prepared-protein forms,
  where family is too coarse and the milestone's example lives). Other type
  distinctions (e.g. juice *flavour*, yogurt *style*) are still handled only by
  token coverage — extensible by adding to the dictionary in BOTH mirrors when a
  real case appears. A name with no form keyword is intentionally un-gated.
- **Best-value grid ranking is within the dominant unit family only.** Entries
  in other unit families (or with no parseable size) fall back to price after the
  unit-ranked block — there is no universal cross-unit "value", by design.
- **Panda product watches** created before this fix (keyed on the old
  `product.id`) won't re-find; re-create them. Grocery/other-store watches
  unaffected.
- **Amazon stays best-effort** (unchanged); PA-API remains the durable path.

---

## 25. Shopping Summary — Product-Identity Lock & Per-Variant Price History

**Status: DEPLOYED & VERIFIED IN PRODUCTION.** A focused, Summary-only milestone.
Explicit scope guard from the brief: **do not touch the Grid ranking, matching
logic, product discovery, or qualification rules** — only the Shopping Summary.
Both changes are additive; every prior contract (Core, providers, 10-key result,
connector/engine split, the comparison model shape, the Grid comparator) is
untouched. The Grid (`marketplace.js`) was **not modified**.

### 25.A The two problems

**Task 1 — the Summary sometimes changed the product identity the Grid had
already established.** The Grid ranks the intended product to the top by
relevance, but `computeComparison` (the Summary's engine) only applied the
family + type gates and then picked the cheapest / best-value survivor. Two
real failure modes:
- *"Sadia chicken breast"* → the Summary could pick **chicken liver** because it
  was cheaper (liver carries no `PRODUCT_TYPES` keyword, so the type gate — which
  only drops *known-different* forms — let it through; family is `chicken` for
  both).
- *"Herfy chicken nuggets"* → the Summary picked **Sadia** nuggets because they
  were cheaper (same family `chicken`, same type `nuggets`; there was **no brand
  gate**). Best Buy and Lowest Price both became Sadia.

**Task 2 — the Lowest Price history stored one lowest for the whole product
family.** `getLowest(product)` is `MIN(price)` over every edition-anchored point,
mixing sizes and even mismatched products. Live `/prices?product=milk` returned a
single "lowest" of 7 SAR (1 L Almarai) sitting in the same bucket as a 61.90 feta
cheese and a 23.50 choco biscuit; `/prices?product=eggs` returned 13.95 (an
18-pc quail pack) as *the* low — misleading for anyone buying a 30-pc tray.

### 25.B Task 1 — the product-identity lock (`src/compare.js`)

After the family + type gates produce the comparison pool, `computeComparison`
now **locks onto the Grid's product identity** before choosing any headline:

1. **Anchor** = the highest-relevance listing in the pool (ties → prefer an
   online result over flyer OCR, then the lower price). This mirrors what the
   Grid ranks to the top, so the anchor *is* the product the Grid identified.
2. **`coveredQueryTokens(name, brand, query)`** (new pure helper) returns the set
   of query tokens a listing matches over its name **and** brand, using the exact
   primitives `match.js` already exposes (whole-word / long word-start prefix /
   long substring, bilingual synonyms via `expandToken`). No change to `match.js`.
3. **Keep only listings whose matched-token set is a superset of the anchor's.**
   A cheaper different-cut ("liver" misses `breast`) or different-brand ("Sadia"
   misses `herfy`) look-alike matches *fewer* of the query's tokens, so it can no
   longer displace the headline. The excluded count is surfaced as
   `identityExcluded` and rendered as an honest note in the Summary.

**No over-gating.** A bare family query ("chicken", "chicken nuggets") has an
anchor that matches only the shared token(s), so every brand/variant still
qualifies — the lock is a no-op exactly when the user hasn't named a
discriminator. Guarded by `listings.length > 1 && tokens(query).length` and by
requiring a non-empty anchor set and non-empty locked result (the lock never
empties the comparison).

### 25.C Task 2 — per-size/variant Lowest Price history

**Engine (`src/priceHistory.js`) — read-time variant grouping, no schema change,
no migration, works on all existing data.** `getPricesDoc` now also returns a
`variants[]` array: `groupVariants(history)` buckets the edition-anchored points
by their **parsed size** (`parseSize` from `matching.js`), and for each size
derives an *independent* lowest-ever (price / where / when) plus latest-per-store.
Points whose name carries no parseable size fall into a separate `unsized`
bucket (kept last, never merged with a real size) — this is what quarantines the
feta/biscuit pollution out of every real size's record. `lowest` and `latest`
(product-wide) are unchanged, so the endpoint stays backward-compatible.

Live after deploy:
- `milk` → `1 L → 7 @ lulu`, `18 × 150 ml → 15.99 @ hyperpanda`, `unsized → 23.50`.
- `eggs` → `18 pcs → 13.95 @ lulu`, `30 pcs → 14.99 @ hyperpanda`, `unsized → 21.95`.

**Frontend (`src/compare.js`, `src/brochure.js`, `src/summary.js`).**
`pricesForProduct` passes `variants` through (optional — an older engine simply
omits it and the Summary falls back). The history verdict is now **always
apples-to-apples**: it locks to a size for which we have **both** a historical
record **and** a live price today — the recommended product's own size when
today's results carry it, otherwise the best-tracked size present in today's
results — and compares that size's today's-best against *its own* record low.
Only when no per-size record is comparable does it fall back to the product-wide
low vs today's cheapest (legacy behaviour, so nothing regresses). The Summary
renders the matched size in the "Lowest recorded (**1 L**): …" line and lists the
other tracked sizes ("Other sizes: 18 × 150 ml 15.99 SAR"), each its own record.

This also fixes a *pre-existing* latent bug: the old verdict compared
`cheapest.price` — for "milk" that was a **125 ml strawberry milk at 1.25 SAR** —
against the 1 L low of 7, falsely reporting "record low". The verdict now
compares like sizes.

### 25.D Validation

- **Frontend** `node src/compare.test.mjs` → **63 passed, 0 failed**
  (10 new: identity lock for the two brief examples + no-over-gating, and
  per-variant history incl. the 30-pack-not-6-pack case, at-low for a matched
  size, and backward-compat fallback). `node src/match.test.mjs` → **65/65**
  (untouched — proves the matching layer was not modified).
- **Engine** `node dev.mjs selftest` → **ALL VERIFIED** end-to-end (incl. live
  D4D), with a new `groupVariants` assertion (Philadelphia 180g/280g/500g each
  keeping their own low; 500g picks 30 @ lulu not the pricier 34; unsized bucket
  last).

### 25.E Deployment & production verification

- **Engine** `wrangler deploy` → `brochure-engine` version
  `b203fc4b-639b-4c91-a542-435cbb85fd8a`. Verified live: `/prices?product=milk`
  and `?product=eggs` now return per-variant records (see 25.C).
- **Connector** — **unchanged**, not redeployed.
- **Frontend** — GitHub Pages (static ES modules; deploy = push to `main`).
  Verified via the local static server against the **live** workers:
  - *"milk"* → history box reads **"Today's best matches the lowest ever
    recorded / Lowest recorded (1 L): 7.00 SAR at Lulu · Jul 2, 2026 / Other
    sizes: 18 × 150 ml 15.99 SAR"** — no feta/biscuit pollution.
  - *"sadia chicken breast"* → Best Buy = **Sadia Tender Chicken Breast 2Kg**,
    "Same product elsewhere" lists Sadia breast at Tamimi/Amazon/Lulu, and
    **"84 cheaper look-alikes from a different brand or variant excluded"** — no
    liver, no other brand hijacking the recommendation. No console errors.

### 25.F Files touched

- Frontend: `src/compare.js` (identity-lock + `coveredQueryTokens` +
  `identityExcluded`; per-variant history verdict), `src/summary.js`
  (identity-excluded note, size label on the "Lowest recorded" line, "Other
  sizes" row), `src/brochure.js` (`variants` pass-through), `styles.css`
  (`.sh-variants`), `src/compare.test.mjs` (10 new tests), `HANDOFF.md`.
- Engine: `src/priceHistory.js` (`groupVariants` + `variants` in `getPricesDoc`,
  `parseSize` import), `dev.mjs` (import + `groupVariants` selftest assertions).

### 25.G Remaining limitations & future considerations

- **History capture quality is unchanged (out of scope).** `recordPrices` still
  stores the connector's *best-ranked* result per store/edition with no family/
  relevance gate, which is why a feta cheese / choco biscuit can enter the milk
  series at all. Per-variant grouping *quarantines* those into the `unsized`
  bucket so they never corrupt a sized headline's verdict, but the capture-side
  cleanup (gating `pickPricedResult` by family/relevance, or recording several
  distinct sizes per run) is a separate, future engine change — deliberately not
  done here to honour the "don't touch matching/qualification" guard.
- **Variant identity is keyed by total base quantity** (`${unit}:${round(total)}`),
  so a `6 × 200 ml` and a single `1200 ml` share a bucket. Fine for the tracked
  staples; refine to `each×pack` if a real case needs pack-level separation.
- **Only `milk` and `eggs` are tracked** (`products.js`), so per-variant history
  is exercised for those today; the mechanism is product-agnostic and needs no
  code change to cover a new tracked product.
- **The identity lock trusts the anchor.** If the Grid's top relevance pick were
  itself wrong the lock would inherit that — but that is precisely the Grid's job
  (unchanged by directive), and the anchor is chosen the same way the Grid ranks.

---

## 26. Tappable Brochures (ClickFlyer-style) + Local Cart

**Date:** 2026-07-04 · **Commits:** engine `b31f96e`, frontend `b01c2dd`

**Goal (user directive):** make the Brochures section browse like ClickFlyer —
tap any product inside a flyer page, see it zoomed with a clear "Add to Cart",
similar products below, seamless return to the brochure — at $0, fully
automatic (no manual tagging), scalable to thousands of brochures.

**The discovery that made it free:** D4D's leaflet viewer HTML — the SAME page
the brochure adapter already reads during ingest — embeds per-product tap
polygons: `data-coords-json` on the carousel copy's
`figure.image-container` (owning each spread's FIRST page) and
`data-next-page-coords` on the plain copy's `picture` (owning the FOLLOWING
page), in the page's `data-width`/`data-height` pixel frame. Crucially the
polygons' `id_product` is the same id (`idoffer_special`) the structured-offers
ingest already stores as `offers.offer_id` — so tap geometry joins the product
data (price, was-price, bilingual OCR name, product crop image, validity) we
already hold in D1, with zero OCR, zero LLM, zero manual mapping. Verified
live: the current Lulu flyer parsed to 752 tap boxes across 76 pages against
756 D1 offer rows, all bboxes in bounds.

**Engine (`GET /brochures/hotspots?id=<brochureId>`):**
- `src/hotspots.js`: pure `parseHotspots(html)` (both blob locations, malformed
  blobs lose one page never the request, polygons → normalized bboxes rounded
  to 4dp, sub-0.5% slivers dropped) + `getHotspotsDoc` orchestrator.
- Served ON DEMAND with a **permanent KV cache** under the edition prefix
  (`<storage_key>/hotspots.json`): geometry is edition-immutable, so the first
  request per brochure costs 1 external subrequest + 1 KV write, every later
  one is a KV read. Already-held brochures got hotspots immediately — no
  re-ingest, no ingest-pipeline or budget changes. Retention prunes the blob
  with the edition bytes automatically (same prefix). Transient D4D failures
  return empty WITHOUT caching (heals on retry); an empty parse IS cached.
- Join: `offerStore.byFlyer(store, region, flyer_ref)` (flyer id parsed from
  the brochure's `source_url`) returns the whole flyer's offer rows keyed by
  `offer_id` in the response — one call powers the whole experience.
- Page alignment invariant: hotspot pages are keyed by the source
  `data-index`, which is exactly the `index` the pipeline stores per page in
  `meta.json` — the frontend joins on that, never ordinal position.
- New `metadataStore.getById`; pure tests in `src/hotspots.test.mjs` (8 checks).

**Frontend:**
- `viewer.js`: the page `<img>` moved into a `.bv-imgwrap` sized in JS from
  natural dimensions × (fit-to-stage × zoom) — deterministic, and the overlay's
  percent-positioned tap boxes stay glued to products at any zoom (verified:
  340px → 680px at 2×, spot styles unchanged). Each spot carries a small blue
  "+" dot; first page with spots flashes the boxes once + shows a transient
  "N products on this page" hint. Tap → product sheet (bottom sheet inside the
  viewer overlay): flyer crop zoomed, bilingual names, price/was-price/−N%
  chip, honest validity ("ended <date>" in red when an in-flyer promo expires
  before the flyer — they exist, e.g. 3-day promos), Add to Cart with inline
  "Added ✓" feedback, the machine-extraction disclaimer + flyer verify link,
  and a similar-offers strip (existing `/offers?q=` search seeded from the
  cleaned name; tapping a card re-renders the sheet for it, ‹ back retraces,
  Esc peels sheet-then-viewer). Closing the sheet touches nothing — page,
  zoom, scroll all preserved.
- `brochure.js`: `loadHotspots` client (session-cached per brochure),
  `indices` exposed from `loadBrochurePages` (the hotspot join key), and
  `cleanOfferName` — OCR names sometimes lead with flyer banner debris
  ("يوليو july ايام فقط days only برتقال…"); trimming leading
  banner/month/number tokens (bilingual stoplist, trim-from-front ONLY, full
  fallback if everything would go) fixed both display titles and the
  similar-search seed.
- Cart: `cart.js` (localStorage `lsa.cart.v1`, qty bump on re-add,
  `CART_EVENT` CustomEvent — the app's one coupling pattern) + `cartPage.js`
  (#/cart: per-store groups with subtotals, grand total, qty steppers,
  remove/clear, "View flyer" re-opens the in-app viewer ON the item's own page
  via the snapshotted `brochureId`+`pageIndex`, falling back to the offer's
  flyer deep-link when the edition is gone). Nav + tabbar carry a live count
  badge painted at boot.

**Verified:** engine pure tests 8/8; frontend match/compare 65+65 unchanged;
live endpoint 76 pages / 756 offers joined, second call KV-cached; full flow
in the local preview (open brochure → spots render → tap → sheet → add →
badge 1 → related tap-through + back → close lands on same page → cart page
totals/qty/View flyer all working, zero console errors); production frontend
verified with a cache-buster after Pages deploy.

**Deliberately NOT done:** no hotspots for Othaim (official PDF — no D4D
geometry, viewer just shows no spots, exactly the graceful degradation rule);
no ingest-time hotspot extraction (would re-touch budgets for zero UX gain);
no server-side cart (single-user tool, localStorage is the right cost);
deriveNames quality is still the known engine TODO — `cleanOfferName` is a
display-side mitigation, improving the deriver still self-heals weekly.

---

## 27. Produce Intelligence — the third family tier (fresh vs derived/flavoured)

**The problem (reported 2026-07-04):** ranking quality was inconsistent by
query *specificity*. Specific queries ("صدور ساديا") were excellent, but bare
produce queries degenerated: "طماطم" surfaced tomato paste/ketchup above fresh
tomatoes; "فراولة" mixed fresh strawberries under strawberry-flavoured milk,
jam and cakes.

**Root cause (not a bug — a coverage gap):** relevance is *lexical*. For a
one-word produce query, everything containing the word scores the identical
whole-word 100, so the whole set lands in one relevance band and the grid's
within-band **price-ascending** sort takes over — and processed derivatives
(paste sachets, flavoured milk boxes) are systematically cheaper than fresh
produce, so they float to the top. The intended countermeasure — the family
system (marketplace band demotion, compare gates, engine famRank, watch
gates) — had **zero produce coverage**: `queryFamily("طماطم")` was null, so
every family gate was inert for exactly the query class that needed it.

**The fix (both matching mirrors, rule 2):**
- **A third, LOWEST family tier: PRODUCE** (derived > base > produce), ~39
  bilingual produce families. The insight that makes it general: produce nouns
  are the prototypical flavour/ingredient *modifiers* in both word orders —
  "حليب فراولة" and "Strawberry Milk" are milk, "معجون طماطم" and "Tomato
  Paste" are sauce — so any non-produce family keyword anywhere in the name
  outranks a produce keyword regardless of position (no fragile head-noun
  order heuristics). Only a name whose sole family signal is the produce noun
  IS the produce. Ambiguous English colour/flavour words ("orange", "cherry")
  are Arabic-only entries so "Tide Orange"/"Cherry Tomatoes" never classify
  as fruit.
- **The missing derived families** that turn produce into shelf products:
  soup, jam, syrup-drinks, soda (incl. فانتا/ميرندا/غازي…), pickle, care
  (soap/shampoo/dishwashing — scented look-alikes), plus paste/معجون/puree
  into sauce and كيكه into cake; vinegar/خل as a new base family (apple-cider
  vinegar is not apples).
- **Flavour-marker guard:** a produce word adjacent to بنكهة/بطعم/برائحة/
  flavored/scented names a flavour, not the product — debris names like
  "بنكهة الفراولة" classify as nothing rather than as strawberries.
- **Produce synonym bridges** (طماطم↔tomatoes etc.) so Arabic produce queries
  reach English-named catalogue items and flyer OCR.
- **Marketplace top band:** when the query names a family, entries CONFIRMED
  to be that family now take a new band 3 above lexical band 2 (mirrors the
  engine /offers famRank, which already tiered same-family > family-less >
  different-family and got produce coverage for free). Different-family still
  → band 0, family-less still ranks by lexical strength — "we refuse to guess"
  is preserved, nothing is dropped, look-alikes are demoted not hidden.

**Why the strong cases can't regress:** relevance/isRelevant are untouched;
multi-token queries ("صدور ساديا") still gate on coverage and types; staple
queries were already family-covered, so their band-3 set is the same set that
was band-2 (within-band price order unchanged — verified in simulation);
compare/monitor gates only get *more* signal, in the same "known-different
only" posture.

**Verified:** frontend match 87/87 + compare 65/65; engine watchtest (matching
+ monitoring gates) and offerstest green; before/after grid simulation over
realistic fixtures — "طماطم" now ranks canned/fresh/cherry tomatoes 1-4 with
paste/soup/ketchup/juice demoted below, "فراولة" ranks fresh strawberries 1-2
above all flavoured products, "حليب" ordering byte-identical to before.

**Refinement (same day, user feedback + live-search iteration):** the first
live run surfaced what fixtures couldn't. (1) "Frozen strawberries ranked
first and the best-buy was a lollipop bag" → **a bare produce query means
FRESH** (`freshProduceIntent`): same-family entries with a FORM word ("رول
فراولة" — a cake roll the family lexicon can't see) drop to the bottom band,
processed ones (frozen/canned/peeled/coated/dried) to the middle, and the
Shopping Summary gets a FRESH-PRODUCE GATE (freshExcluded count + note) so
"lowest price" is a fresh-produce claim; naming the processing in the query
("فراولة مجمدة") disables all of it. (2) The lollipop bag ("مصاصات
بالفراولة") was family-less because every one of its head words escaped the
lexicon and its strawberry mention was بال-attached — that's now a
first-class signal: `producePresence` reads a بال/لل-attached or
flavour-marked produce word as 'flavored' (a flavoured product by
construction), gating the comparison, the grid band, and the engine famRank.
It also fixed the value pool: flavoured junk's high SAR/kg had made the
median outlier guard reject genuine fresh bargains as "implausible".
(3) Live-data lexicon growth: frozen-food BRANDS whose bags never say frozen
(مونتانا/داري/الكبير/سنبلة/ساديا/سيارا — consulted only under fresh intent),
confectionery brands that ARE the shelf name (جالكسي/كيندر/اوريو/شوبا شوبس…),
spelling variants (شيكولاته/شكولاته/شوكلاته), مشروب → syrup family, مسحوق →
powder, مصاصات/لولي → candy, سردين → fish, toy family for produce-shaped
toys. A waw-strip in familyKey was tried and REVERTED: "سردين وصلصة الطماطم"
is sardines WITH sauce — stripping و lets the derived keyword hijack the
family (the بال lesson again). Verified live in the preview: "فراولة" top-8
all fresh strawberries (best buy 12.99 مستوردة, high confidence), "طماطم"
top-8 all fresh tomatoes (best buy 5.99/kg greenhouse kilo). Final suites:
match 123/123, compare 65/65, engine watchtest green.

---

## §26 — The Search Roadmap: deterministic match stages (2026-07-04)

**What / why.** The user issued a Search Roadmap making the ranking philosophy
explicit: this is a price COMPARISON engine, not a discovery engine — the
first results must be the products the user most likely wants to compare
prices for, deterministically. Five rules: (1) respect the query before any
assumption; (2) single word → products whose PRIMARY name matches the word
first (weight/size/origin/color variants are valid primary matches); products
where the word is only a flavour/ingredient/scent/secondary descriptor rank
after ALL primary matches; (3) multi word → exact multi-word matches always
first, every term MANDATORY in the first stage, never ignore a term because
other terms score highly; (4) relax gradually only after exact matches are
exhausted; (5) never infer intent when the query is explicit.

**The violation this fixed.** The grid sorted family band → price, with
relevance only a tie-break: for "حليب المراعي", every milk-family item landed
in the top band regardless of matching المراعي, so a cheap Nadec/Barista milk
outranked actual Almarai milk — exactly rule 3's "term ignored because the
other term scored highly".

**Design.** A new deterministic STAGE became the primary sort key everywhere,
implemented in both matching mirrors (`src/match.js` ↔ engine
`src/matching.js`): `matchStage(item, query)` → multi word: 5 exact in-order
phrase in the name (synonyms allowed, ال stripped) · 4 all terms whole-word
(the brand field counts for coverage, the phrase lives in the name) · 3 all
terms word-start tier · 2 all terms matched (substring tier) · 1 exactly one
term missing · 0 more missing; single word: 5 primary name/brand match ·
2 weak substring-only · 1 secondary — the word is a flavour/ingredient/scent
(`queryTokenPresence`: بال/لل-attached, a directional flavour marker, or a
compound shifter following) or modifies a KNOWN different family ("حليب
فراولة" for فراولة) · 0 none. Flavour markers are DIRECTIONAL (unlike the
produce-only symmetric FLAVOR_MARKERS): Arabic بنكهة/بطعم/برائحة precede the
flavour word, English flavoured/scented follow it — a symmetric check would
wrongly demote the head noun of "حليب بنكهة الفراولة" for حليب. Conservative
per HANDOFF §10: unknown family / no marker never demotes.

**Consumers.** Frontend grid: `marketplace.js` comparator = stage → family
band → price/value (bands and the fresh-produce logic unchanged, now scoped
WITHIN a stage). Engine `/offers`: sort = stage → famRank → score → price;
the stage subsumes the old name-tier key (any stage ≥1 is a name match,
OCR-text-only matches stay last). `isNameMatch` is no longer used by the read
API (still exported for the offers contract tests).

**Verification.** Frontend `match.test.mjs` 145/145 (new: primary-vs-flavour
ordering, directional markers, phrase/coverage/relaxation ladder, brand-field
coverage), `compare.test.mjs` 65/65; engine `dev.mjs watchtest` +
`offerstest` green (selftestMatching gained the mirrored stage cases). Live
preview ("حليب المراعي"): all 8 full matches ranked first (Almarai milk; the
two milk-POWDER offers correctly last within the block via the family band),
and the 5.75 SAR Barista milk — previously a top result — ranked below every
full match at stage 1. No console errors.

**Deploy status at time of writing:** engine `wrangler deploy` and the two
`git push`es were pending user approval (production-deploy permission).

---

_End of handoff._
