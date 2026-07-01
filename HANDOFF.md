# Project Handoff — Souq (Live Shopping Assistant)

> **Purpose:** This document lets a brand-new session pick up the project cold,
> without reading any prior conversation. It is the source of truth for the
> current state. Keep it updated at the end of each phase.
>
> **Last updated:** 2026-07-02 · **Phase just completed:** **Price History
> (Pillar 3) — COMPLETE.** Built as a **feature of the Brochure Engine** (not a
> separate service): each price point is **anchored to a store's brochure
> edition** (the *when* = weekly edition, the *where* = store), with the price
> *number* sampled once per edition from the search connector via a new
> `CONNECTOR` service binding. The lowest-ever price (price + where + when) is
> derived from those edition-anchored points. **Deployed & verified in
> production** at `https://brochure-engine.tamamoooo.workers.dev` (see §13). M1
> (`PdfIndexCollector`, Othaim) and M2 (`AggregatorCollector`, 7 stores) remain
> live and byte-for-byte intact (§11/§12; Othaim checksum re-verified). · **Next
> phase:** **Personal Alerts (Pillar 3 cont.)** — see the **Roadmap (§0)** and
> TODOs (§9). `StoreSessionCollector` remains **deferred** (§0). Discovery is §10;
> M1 is §11; M2 is §12; **Price History is §13**.
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

1. **Online Search** — ✅ **done** (§1–§8). Six stores, live multi-store search,
   Smart Ranking, "Show all", Arabic+English, all routed through the connector.
2. **Brochure Engine** — ✅ **done** (§10–§12). M1 `PdfIndexCollector` (Othaim PDF)
   + M2 `AggregatorCollector` (OffersInMe, 7 stores), 8 brochures held in
   production, weekly Tue+Wed fan-out scheduler on the Free plan.
3. **Price History** — ✅ **done** (§13). A **feature of the Brochure Engine**:
   price points **anchored to brochure editions** (the *when*/*where*), price
   *number* from the search connector, lowest-ever (price + where + when) derived
   on read. Deployed & verified; M1/M2 intact. Free plan, D1-only, $0.
4. **Personal Alerts** — ⏭ **next milestone.** Let the user set a target on a
   tracked product and be notified when its price drops (personal, single-user
   notifications — not a subscription/marketing system). Builds directly on §13's
   price points.
5. **Unified Frontend** — planned. One interface over all three pillars (search +
   brochures + price history/alerts) instead of the search-only frontend today.

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
| Frontend (this repo) | `tamamoooo-dev/live-shopping-assistant` | `C:\Users\majed\Desktop\claude\live-shopping-assistant` | `cbf6389` Show all toggle |
| Connector | `tamamoooo-dev/shopping-connector` | `C:\Users\majed\Desktop\claude\serverless-connector` | `d227889` Brochure Engine M2 (AggregatorCollector) |

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

- The frontend marks `amazon` and `noon` as **best-effort** (`BEST_EFFORT` set in
  `src/app.js`), giving them a friendlier "temporarily unavailable" message on
  failure instead of a hard error.
- **Amazon caveat:** no credential-free product API exists, so the active path
  scrapes public search HTML and hits Amazon's anti-bot interstitial on a share of
  requests (detected → fails cleanly, so results aren't guaranteed). The durable
  fix is **PA-API 5.0**, already implemented as the `pa-api` strategy and tried
  first; it skips instantly while unconfigured. To activate (no code change):
  set Worker secrets `PAAPI_ACCESS_KEY`, `PAAPI_SECRET_KEY`, `PAAPI_PARTNER_TAG`
  (optional: `PAAPI_HOST`, `PAAPI_REGION`, `PAAPI_MARKETPLACE`) and redeploy.
- **Danube resilience note:** Danube's Spree origin occasionally drops a single
  request from Cloudflare's edge (transient 5xx / reset), which surfaced as an
  intermittent "Could not reach Danube". The connector's Danube provider
  (`serverless-connector/src/providers/danube.js`) now retries once on transient
  failures (5xx / 429 / network error) with a short backoff; a 4xx (except 429)
  stays final. This was preventive hardening — no reproducible code fault was
  found; the origin was healthy when investigated. If Danube "breaks" again,
  first check the origin directly:
  `curl -A Mozilla "https://danube.sa/api/products.json?q%5Bname_cont%5D=milk&per_page=20"`.

---

## 6. Current UI / features

- **Branding:** "Souq — Live shopping search". Single-page app: `index.html` +
  `styles.css` + ES modules in `src/`.
- **Two search modes** (same Core, providers, and result contract underneath):
  - **All stores** (default) — searches every checked store in **parallel**,
    results **grouped by store** with a colored dot + count badge per section.
    Store selection via checkbox chips (+ "All").
  - **Single store** — one store via dropdown, flat results grid.
- **Smart Ranking:** client-side re-ranking of each store's results by relevance
  to the query; the top `DEFAULT_LIMIT = 4` are shown up front.
  - Tiering per field: exact (100) > prefix (80) > whole-word (70) > partial (60)
    > multi-token all-present (45) / some-present (20+hits). Name match dominates;
    brand match counts ×0.7. Stable sort (ties keep store order).
  - Implemented entirely in `src/app.js` (`tierScore` / `relevance` / `rankItems`,
    wired into `runSingle` and `runMulti`). Result objects are untouched — only
    order and count shown.
- **"Show all" expansion:** each store keeps its **full ranked list** (all
  already-fetched results, typically up to 20–60) and shows a **"Show all N" /
  "Show fewer"** toggle below its top 4. Expanding renders the rest from memory —
  **no new search / network call**. Each store section (and the single-store view)
  expands independently. Implemented as `resultsBlock(items, limit)` in
  `src/app.js`; button style `.show-all` in `styles.css`. Store count badges show
  the **true total found** (e.g. "30"); single-store status shows the full result
  count.
- **Arabic + English:** input language auto-detected; Arabic input searches the
  Arabic catalogue and links to Arabic product pages. Product names render RTL.
- **Adaptive search:** the Core tries a provider's strategies in order, remembers
  the one that worked in `localStorage`, tries it first next time, and rediscovers
  another if it stops working.
- **Mobile-first:** 16px inputs (avoids iOS Safari zoom), safe-area insets,
  spinner/loading states, per-store loading and failure notes. No login/settings.

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
5. **Commit trailer:** end commit messages with
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
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
> Engine, Price History) are complete; the next milestone is **Personal Alerts**.

1. **Personal Alerts (Pillar 3 cont.) — next milestone.** Let the user set a
   target price on a tracked product (the §13 watchlist) and be notified when a
   captured price drops below it — personal, single-user notifications, not a
   marketing/subscription system. Builds directly on §13's edition-anchored price
   points and runs on the same weekly capture. Stay on the **Free plan** ($0);
   design not yet written — this is the milestone to start.
2. **Unified Frontend (after Alerts).** One interface spanning search + brochures +
   price history/alerts, replacing the search-only frontend.
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

**Deferred (per §0 — not TODOs now):** `StoreSessionCollector` (former M3), OCR /
brochure price extraction, AI/LLM extraction, advanced analytics, and any paid
Cloudflare features (R2, paid Queues/Workflows/Workers).

_Done recently (no longer TODO): **Price History (Pillar 3)** (§13) — deployed &
verified; **Brochure Engine M1 + M2** (§11, §12); **Brochure Engine Discovery
(§10)**, Smart Ranking, per-store "Show all" expansion, Danube transient retry._

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

---

_End of handoff._
