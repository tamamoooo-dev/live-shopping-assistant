# Project Handoff — Souq (Live Shopping Assistant)

> **Purpose:** This document lets a brand-new session pick up the project cold,
> without reading any prior conversation. It is the source of truth for the
> current state. Keep it updated at the end of each phase.
>
> **Last updated:** 2026-07-01 · **Phase just completed:** Smart Ranking ·
> **Next phase:** Brochures (see TODOs).

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
| Frontend (this repo) | `tamamoooo-dev/live-shopping-assistant` | `C:\Users\majed\Desktop\claude\live-shopping-assistant` | `756f514` Smart Ranking |
| Connector | `tamamoooo-dev/shopping-connector` | `C:\Users\majed\Desktop\claude\serverless-connector` | `8dad4e3` Add Noon provider |

> Note: the connector's **local folder** is `serverless-connector` but its GitHub
> **repo name** is `shopping-connector`. Both `origin` remotes are under the
> `tamamoooo-dev` org.

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
| Danube | `danube` | Spree JSON API (`danube.sa/api/products.json?q[name_cont]=`) | **Stable (experimental)** — EN/AR, sale prices |
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

---

## 6. Current UI / features

- **Branding:** "Souq — Live shopping search". Single-page app: `index.html` +
  `styles.css` + ES modules in `src/`.
- **Two search modes** (same Core, providers, and result contract underneath):
  - **All stores** (default) — searches every checked store in **parallel**,
    results **grouped by store** with a colored dot + count badge per section.
    Store selection via checkbox chips (+ "All").
  - **Single store** — one store via dropdown, flat results grid.
- **Smart Ranking (shipped this phase):** client-side re-ranking of each store's
  results by relevance to the query, then capped to the top `DEFAULT_LIMIT = 4`.
  - Tiering per field: exact (100) > prefix (80) > whole-word (70) > partial (60)
    > multi-token all-present (45) / some-present (20+hits). Name match dominates;
    brand match counts ×0.7. Stable sort (ties keep store order).
  - Single-store status shows **"Top N of M"** when truncated; all-stores count
    badge shows **"N+"** when more than N were found.
  - Implemented entirely in `src/app.js` (`tierScore` / `relevance` / `rankItems`,
    wired into `runSingle` and `runMulti`). Result objects are untouched — only
    order and count shown.
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

> Node is **not on PATH** in the shipped environment. Use the preview tooling /
> `launch.json` node path, or invoke node explicitly, when local serving is needed.

---

## 9. Remaining TODOs (priority order)

1. **Brochures (next phase — start here).** Build the brochures feature. Scope is
   not yet defined in this repo; define requirements first (what a "brochure" is —
   e.g. store weekly-offers / flyer listings — its data source per store, whether
   it flows through a new connector endpoint or reuses `/search`, and its UI
   placement alongside the existing search modes). Keep the store-agnostic Core /
   thin-connector / normalized-contract rules intact when designing it.
2. **Amazon durability.** Configure PA-API secrets on the Worker (Amazon Associate
   account with PA-API access) so `pa-api` becomes the active path and results stop
   depending on the fragile HTML scraper — or formally accept Amazon as best-effort.
3. **Refresh README.md & CHANGELOG.md.** Bring them up to date with Souq branding,
   the 6-store multi-store architecture, connector routing, and Smart Ranking.
   (They still describe single-store "Panda Live Search v1.0.0".)
4. **Best-effort store monitoring.** Amazon (anti-bot) and Noon (RSC-flight
   parsing) are fragile to upstream markup changes; add a lightweight way to notice
   when they silently stop returning results.
5. **Consider surfacing more than the top 4.** Smart Ranking caps display at
   `DEFAULT_LIMIT = 4`; a "show more" affordance or configurable limit may be worth
   adding if users want to see the full ranked list.
```

---

_End of handoff._
