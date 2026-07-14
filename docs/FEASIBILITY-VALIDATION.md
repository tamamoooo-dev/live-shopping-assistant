# Super Search — Feasibility Validation (Evidence-Based)

> **Companion to** [EXPANSION-ROADMAP.md](EXPANSION-ROADMAP.md). That document
> ranked candidates on *theoretical* feasibility. This one **replaces those
> guesses with measured evidence** from live probing, and revises the scores
> accordingly. Where the two disagree, **this file wins.**
>
> **Investigation date:** 2026-07-06. **Scope:** every Tier 1 and Tier 2
> candidate from the roadmap.
>
> **Status: LIVING DOCUMENT — the authority for retailer-integration decisions.**
> Every future decision to build, defer, or skip a retailer must cite the evidence
> here, not an assumption. **Do not overwrite a conclusion without new evidence.**
> When evidence changes (a source drops a gate, a probe result flips, a browser
> trace closes a gap), **update the relevant row in place, bump its score, and note
> what changed and when** in a short "Revision log" line at the bottom of this file
> — never fork a new disconnected report. Reproduce any verdict with the §1 probe
> method (`wrangler dev --remote` vs residential `curl`).

---

## 1. Methodology — how each claim was tested

The decisive question for this project is **Worker-egress reachability**: does the
source behave the same from a Cloudflare datacenter IP as from a browser? A
residential `curl` cannot answer this — it's exactly the trap that made ClicFlyer
look feasible for months (residential 200, Worker 302-loop).

So I tested from **three independent network vantages**:

1. **Cloudflare edge** — a throwaway probe Worker run via `wrangler dev --remote`,
   so its `fetch()` egresses from real Cloudflare datacenter IPs (verified egress
   IP `2a06:98c0:3600::103`, a Cloudflare range). `redirect: "manual"` so 302-loops
   are visible. **This is the ground truth for "can a connector Worker reach it."**
2. **Residential** — `curl` from the user's machine (KSA residential IP).
3. **Third-party** — `WebFetch` (Anthropic's fetcher, a different cloud network),
   used to cross-check connection-level refusals.

**Probe validated against known controls before trusting any result:**

| Control | Expected (from HANDOFF) | Observed from edge | Verdict |
|---|---|---|---|
| ClicFlyer web | 302→`/Home/Error` (Worker block) | **302, `location: /Home/Error`** | ✅ reproduced exactly |
| Panda API | JSON, reachable | JSON response (422 on stub params) | ✅ reachable |

The probe faithfully reproduces the documented ClicFlyer Worker-block, so its
verdicts on new candidates are trustworthy. For each candidate I recorded: HTTP
status, redirect target, `server`/CDN header, content-type, body size, whether
products/prices/images/JSON are present, and the platform signature.

**What I could NOT test this session:** live-browser XHR capture (the Chrome
extension was disconnected), so a few SPA API contracts (exact Nana/Nesto/Extra
endpoints, Carrefour's token flow) are characterized from static evidence rather
than a captured network trace. Those are flagged explicitly below.

---

## 2. Headline findings (the things that change the plan)

1. **Two clean "server-rendered search" wins, reachable from the edge with real
   product data:** **Jarir** (897 KB HTML, SAR + price fields, product links) and
   **Spinneys** (994 KB, 41 price-hits, 327 images). **Nahdi** (JSON-LD products)
   and **Mumzworld** (Next SSR, prices+images) close behind. These are the safest
   builds on the board — no JS execution, no tokens.

2. **A shared hosted-search cluster exists.** **Nahdi, Mumzworld, Spinneys, and
   GoldenScent all run Algolia; Extra runs Unbxd.** Both are public CDN search
   APIs — unconditionally Worker-reachable, clean JSON with prices/images, needing
   only a scraped public app-id + search-only key. This is a **second D4D-style
   platform pattern** ("hosted-search cluster") beyond the Salla one.

3. **Salla platform-unlock is real — validated on a live store.** `store.alshifahoney.com`
   returns **200 from the edge**, server-rendered with 168 product refs, 28 SAR
   price-hits, and JSON-LD, on Salla's uniform shared theme. One connector genuinely
   spans every Salla tenant, and products are in the HTML without running JS.

4. **Three candidates are HARD-BLOCKED (evidence, not assumption):**
   - **Landmark (Home Centre + Babyshop)** — Cloudflare **managed-challenge 403
     from the edge** vs **200 + full HTML residentially**. Classic Worker-egress
     block, ClicFlyer-class.
   - **Al Dawaa** — **connection refused/failed from all three vantages** (edge 523,
     residential 000, WebFetch ECONNREFUSED). TLS/JA3-level bot protection a Worker
     can't forge.
   - **Carrefour KSA online** — **every path (homepage and every `/api/…` guess)
     returns an identical 53-byte empty `<p></p>` shell**, residentially too. The
     whole domain sits behind an app-bootstrap/token gate; there is no clean JSON
     endpoint reachable without executing the site's JS. This is a big downgrade
     from the roadmap's optimistic score.

5. **Two candidates have no usable web target at all:**
   - **Bindawood** — `www.bindawoodstores.com` origin dead (CF 530 / error 1016
     "origin DNS error"); `bindawood.com` resolves to a GoDaddy **parking IP**
     (160.153.0.59). Web store is dead; BinDawood is app-only. (Danube, already
     integrated, covers the same parent group.)
   - **Al Sadhan** — `alsadhan.com` is a **301 redirect to Gmail**
     (`mail.google.com/a/alsadhan.com`). No e-commerce site at that domain.

---

## 3. Per-candidate evidence & revised scores

Legend: **Feas(old→new)** = roadmap score → evidence-based score. "Edge" = the
Cloudflare-egress observation.

### Tier 1 candidates

#### Nahdi — pharmacy · **Feas 7 → 8** · Val 9 (unchanged)
- **Edge:** homepage `308→/en-sa` (reachable, Cloudflare-fronted, no challenge);
  `catalogsearch/result?q=panadol` → **421 KB server-rendered page with
  `application/ld+json` product data, 9 price-hits.**
- **Rendering:** server-rendered Magento search page **plus** an Algolia backend
  (`algoliaConfig`/`algoliaIndexName` in the JS; creds loaded via bundle, not
  inline).
- **Two viable connector paths:** (a) HTML/JSON-LD scrape of `catalogsearch`;
  (b) direct Algolia query (scrape app-id + search key). Either is Worker-reachable.
- **Images/prices/PDP:** all present. **Promos:** Magento promo model.
- **Blockers:** none material; Algolia creds must be re-scraped if rotated.
- **Verdict:** **Confirmed strong. Top Tier 1.** Highest value (only pharmacy) and
  now measured-feasible.

#### Jarir — electronics · **Feas 7 → 8** · Val 8 (unchanged)
- **Edge:** `catalogsearch/result?search=iphone` → **897 KB server-rendered HTML,
  200**, containing SAR prices, `"price"` fields, and product-page links.
- **Rendering:** **server-side** (Magento-family). No token, no JS execution needed.
- **Connector:** plain **HTML scraper** on the search-results URL. Simplest build
  on the board.
- **Blockers:** none observed. Cloudflare-fronted but does not challenge egress.
- **Verdict:** **Confirmed strong. Cleanest new integration.** Recommend first.

#### Salla platform — multi-store unlock · **Feas 7 → 7** (validated) · Val 7
- **Edge:** live store `store.alshifahoney.com/en` → **200, 115 KB**; search page
  → **200, 75 KB**. Platform host is Cloudflare-fronted but responds normally to
  egress (a *closed* store returns 410, i.e. real semantics, not a block).
- **Rendering:** **server-rendered products in the HTML** (168 product refs, 28 SAR
  hits, JSON-LD) on Salla's **uniform theme** (`cdn.assets.salla.network`, Lit).
- **Connector:** **one shared storefront/JSON-LD parser** works across all tenants
  → near-zero marginal cost per added store (D4D-shaped leverage), plus an official
  Storefront API exists for opt-in merchants.
- **Blockers:** must curate an allowlist of relevant stores; per-store catalogs are
  small.
- **Verdict:** **Validated multiplier. Keep Tier 1** — the highest leverage-per-hour
  item after the two clean scrapers.

#### Othaim online — hypermarket · **Feas 6 → 6** · Val 8
- **Edge:** homepage `301→/ar/` then reachable Next.js pages; a guessed
  `/ar/search?q=` returned a **Next.js 404** (i.e. reachable, wrong route).
- **Rendering:** Next.js/RSC — the engine **already parses Othaim's offers RSC
  flight** (HANDOFF §5), so the site is a known, Worker-reachable quantity.
- **Connector:** search endpoint / RSC route — needs the correct product-search
  path discovered (modest).
- **Blockers:** endpoint discovery only.
- **Verdict:** **Unchanged; solid.** Upgrades Othaim from flyer-only to live.

#### Nana — q-commerce grocery · **Feas 6 → 5** · Val 8
- **Edge:** `store.nana.sa` reachable (200 shell; wrong `/api/method/…` returns a
  **Frappe** 404 page).
- **Rendering:** **client-side SPA on Frappe** (`frappe-web.min.js`,
  `/assets/frappe/`). Products load via `/api/method/*` JSON (method name not yet
  captured — needs a browser network trace, which I couldn't run this session).
- **Connector:** **API** (Frappe `/api/method/*`), guest/location context like Ninja.
- **Blockers:** (1) exact API method undiscovered (browser sniff needed);
  (2) delivery-marked-up prices → must be labeled, cannot join lowest-price groups
  (honesty rule 6).
- **Verdict:** **Slight downgrade** — reachable but discovery-dependent and price
  provenance is caveated. Still Tier 1 by value.

#### Carrefour KSA online — hypermarket · **Feas 6 → 4** · Val 9
- **Edge & residential:** homepage **and every `/api/v1`, `/api/v8`, `/api/v1/search`
  guess** all return an **identical 53-byte `<p></p>` shell** — even with
  `Accept: application/json` + `appId` headers.
- **Interpretation:** the entire `www.carrefourksa.com` domain is fronted by an
  edge layer that serves an empty shell to any request lacking a JS-minted
  token/cookie. **No clean JSON endpoint is reachable without executing the site's
  bootstrap.** This is *not* a datacenter block (residential sees the same shell) —
  it's an app-token gate.
- **Connector:** would require reverse-engineering the token/appId flow from a
  captured browser session (fragile, high effort) — closer to the ClicFlyer-mobile
  situation than to a clean API.
- **Verdict:** **Major downgrade (6→4).** Highest *value*, but the online catalog
  is **not cheaply integrable**. **Recommendation: keep relying on Carrefour's D4D
  flyer coverage (already integrated); do not attempt the online API without a
  browser-captured token trace proving a stable path.**

### Tier 2 candidates

#### Spinneys — grocery · **Feas 5 → 7** · Val 6
- **Edge:** search page → **200, 994 KB server-rendered, 41 price-hits, 327 image
  refs.** Django site (`/accounts/web-api/…`, `/wishlist/api-create/…`) + Algolia.
- **Connector:** **HTML scraper** (rich SSR) or Algolia. No token needed.
- **Verdict:** **Upgrade (5→7).** Measured as one of the richer, cleaner targets —
  better than assumed.

#### Mumzworld — baby · **Feas 6 → 7** · Val 6
- **Edge:** `search?q=diapers` → **200, 776 KB Next.js SSR, 14 price-hits, 51
  images.** Algolia + Magento backend.
- **Connector:** HTML/`__NEXT_DATA__` scrape or Algolia. Worker-reachable, no
  challenge.
- **Verdict:** **Upgrade (6→7).** Confirmed clean.

#### eXtra — electronics · **Feas 6 → 6** · Val 7
- **Edge:** reachable (real pages/404s, not blocked); MAGENTO/Hybris signatures
  (`cdn.extra.com/hybris/…`). Search powered by **Unbxd** (`search.unbxd.io`,
  site-key `ss-unbxd-auk-extra-saudi-en-prod…`). Direct `/search/autocomplete`
  guesses 302→`/error` (header-gated).
- **Connector:** **Unbxd hosted-search API** (scrape site key + api key — the api
  key wasn't inline; needs one browser trace) or the Hybris search-results page.
- **Blockers:** exact Unbxd credentials/endpoint need one network capture.
- **Verdict:** **Unchanged (6).** Reachable; endpoint discovery is the only cost.

#### GoldenScent — beauty · **Feas 6 → 6** · Val 5
- **Edge:** search page → **200, 115 KB**, Algolia-instrumented; fewer inline
  product fields (3 price-hits) → **more client-rendered**, data via Algolia.
- **Connector:** **Algolia** query (same pattern as Nahdi/Mumzworld/Spinneys).
- **Verdict:** **Unchanged (6).** Viable via the shared Algolia pattern.

#### Nesto online — hypermarket · **Feas 5 → 5** · Val 6
- **Edge:** `nestoksa.com` reachable (200 Angular shell). Angular SPA
  (`main-*.js`); API base **lazy-loaded, not statically discoverable** (bundle grep
  found only Angular internals).
- **Connector:** **API** — but the endpoint needs a runtime/browser network trace
  (not captured this session).
- **Verdict:** **Unchanged (5).** Reachable but discovery-blocked without a browser.

#### Zid platform — multi-store unlock · **Feas 6 → 6 (NOT independently validated)** · Val 6
- **Status:** could not obtain a clean live-store domain to probe this session.
  Same *class* as Salla (Saudi SME platform, uniform storefront tech), so the
  Salla result is *suggestive* but **not proof**.
- **Verdict:** **Score held with an explicit caveat** — before committing, run the
  exact same live-store edge probe that validated Salla. Do not treat as confirmed.

#### Al Dawaa — pharmacy · **Feas 6 → 3** · Val 7
- **All three vantages failed:** edge **523** (origin unreachable), residential
  `curl` **000** (connection failed), WebFetch **ECONNREFUSED** (64.98.135.41).
- **Interpretation:** aggressive **TLS/JA3 / connection-level bot protection** that
  rejects non-browser clients regardless of IP. A Cloudflare Worker cannot forge a
  browser TLS fingerprint.
- **Verdict:** **Major downgrade (6→3). Park.** This breaks the "launch pharmacy as
  a Nahdi+Al Dawaa comparison" plan — **Nahdi may have to launch pharmacy solo**,
  or a third pharmacy (Whites/United) must be validated as the comparison partner.
  Needs a real-browser trace to see if *any* automated path exists.

#### Bindawood — grocery · **Feas 6 → 3** · Val 7
- **Edge & residential:** `www.bindawoodstores.com` → CF **530 / error 1016**
  (origin DNS failure), no response either vantage; `bindawood.com` → GoDaddy
  **parking IP**.
- **Verdict:** **Downgrade (6→3). Reject as a web target.** No live storefront;
  BinDawood is app-only, and Danube (same holding) is already integrated.

#### Landmark platform (Home Centre / Babyshop) — home/baby · **Feas 6 → 2** · Val 6
- **Edge:** **403 Cloudflare managed challenge** ("Just a moment…", Turnstile in
  CSP) on both banners.
- **Residential:** **200 + full HTML** (Home Centre 797 KB, Babyshop 592 KB).
- **Interpretation:** **confirmed Worker-egress block** — Landmark's bot management
  challenges datacenter IPs, passes residential. ClicFlyer-class.
- **Verdict:** **Major downgrade (6→2). Park.** The "one connector unlocks Home +
  Baby" thesis fails at the egress layer. Revisit only if a non-challenged API host
  is found.

#### Al Sadhan — grocery · **Feas 5 → 2** · Val 6
- **Edge:** `alsadhan.com` → **301 to `mail.google.com/a/alsadhan.com`.** No online
  store at this domain.
- **Verdict:** **Downgrade (5→2). Reject as online-search.** Only a D4D flyer add is
  possible, and only if a D4D slug exists.

---

## 4. Revised feasibility table (measured)

| Retailer | Old Feas | **New Feas** | Reachable from CF edge? | Rendering | Recommended strategy | Evidence |
|---|---|---|---|---|---|---|
| **Jarir** | 7 | **8** | ✅ 200 | Server-side | HTML scraper | 897 KB SSR search, SAR+price fields |
| **Nahdi** | 7 | **8** | ✅ 200 | Server-side + Algolia | HTML/JSON-LD or Algolia | 421 KB SSR, JSON-LD products |
| **Spinneys** | 5 | **7** | ✅ 200 | Server-side + Algolia | HTML scraper | 994 KB SSR, 41 price / 327 img |
| **Mumzworld** | 6 | **7** | ✅ 200 | Next SSR + Algolia | HTML/Next data | 776 KB SSR, 14 price / 51 img |
| **Salla platform** | 7 | **7** | ✅ 200 | Server-side (uniform) | Shared storefront parser | Live store 200, 168 product / JSON-LD |
| **Othaim online** | 6 | **6** | ✅ (Next) | Next/RSC | Search endpoint | Reachable; engine already parses RSC |
| **eXtra** | 6 | **6** | ✅ | Hybris + Unbxd | Unbxd API / HTML | Reachable; Unbxd site-key found |
| **GoldenScent** | 6 | **6** | ✅ 200 | Client + Algolia | Algolia API | 115 KB, Algolia-driven |
| **Zid platform** | 6 | **6*** | ⚠️ unproven | (likely SSR) | Shared parser | *NOT validated — probe before committing |
| **Nana** | 6 | **5** | ✅ (shell) | SPA on Frappe | Frappe `/api/method/*` | Reachable; method undiscovered |
| **Nesto online** | 5 | **5** | ✅ (shell) | Angular SPA | API (needs sniff) | Reachable; API base lazy-loaded |
| **Carrefour online** | 6 | **4** | ⚠️ shell only | JS-token-gated | Token reverse-eng (hard) | 53-byte `<p></p>` on every path |
| **Al Dawaa** | 6 | **3** | ❌ 523/refused | — | none viable now | Refused from 3 vantages (TLS/JA3) |
| **Bindawood** | 6 | **3** | ❌ dead origin | — | none (app-only) | 530/1016; parked domain |
| **Landmark (HC/Babyshop)** | 6 | **2** | ❌ 403 challenge | — | none (egress-blocked) | Edge 403 vs residential 200 |
| **Al Sadhan** | 5 | **2** | ❌ no store | — | D4D flyer only | Redirects to Gmail |

`*` Zid score retained on analogy only; treat as unverified.

---

## 5. What this does to the roadmap

**Promoted (measured cleaner than assumed) — do these first:**
- **Jarir (8)** and **Nahdi (8)** — the two highest measured-feasibility × value
  wins. Clean server-rendered targets.
- **Spinneys (7)** and **Mumzworld (7)** — upgraded; rich SSR data, no tokens.
- **Salla connector (7)** — multiplier validated on a live store.

**Demoted / blocked (evidence killed or wounded them):**
- **Al Dawaa (3)** and **Carrefour online (4)** — the two biggest casualties. This
  **breaks two roadmap assumptions**: (a) pharmacy can't launch as Nahdi+Al Dawaa
  — Nahdi likely launches **solo** (validate Whites/United as the comparison
  partner instead); (b) Carrefour stays **flyer-only** (its D4D coverage already
  exists) unless a browser-captured token path proves stable.
- **Landmark (2)** — the "Home + Baby in one connector" plan fails at egress.
  Mumzworld (7) now carries the Baby category alone.
- **Bindawood (3)** and **Al Sadhan (2)** — no web target; drop from the online
  plan (flyer-only at best).

**Revised Wave 1 (highest-confidence, measured):**
1. **Jarir** — cleanest build (pure HTML scrape).
2. **Nahdi** — opens pharmacy (solo launch; JSON-LD or Algolia).
3. **Spinneys** — rich SSR grocery add.
4. **Mumzworld** — opens baby (solo; Landmark blocked).
5. **Salla connector** — start the SME long-tail multiplier.

**New cross-cutting opportunity — the "hosted-search" connector pattern:** because
**Nahdi, Mumzworld, Spinneys, and GoldenScent all run Algolia** (and Extra runs
Unbxd), a small reusable "scrape app-id/key + query the hosted index" helper
amortizes across four+ retailers — a second D4D-style multiplier alongside Salla.
Worth building the helper once during the Nahdi work and reusing it.

**Still needs a browser network trace before building (Chrome was offline this
session):** Nana's Frappe method, Nesto's Angular API, Extra's Unbxd credentials,
Carrefour's token flow (if attempted at all), and a live-store probe for **Zid**.
None of these are egress-blocked — they're endpoint-discovery tasks — but they
shouldn't be scored as "confirmed" until the trace is captured.

---

## 6. Confidence summary

| Verdict class | Retailers | Confidence |
|---|---|---|
| **Confirmed feasible (build-ready)** | Jarir, Nahdi, Spinneys, Mumzworld, Salla | **High** — measured product data from edge |
| **Reachable, endpoint discovery pending** | Othaim, eXtra, GoldenScent, Nana, Nesto | **Medium** — reachable, needs one browser trace |
| **Wounded — integrate only with caveats** | Carrefour (token gate) | **Low** — no clean path found |
| **Unverified platform** | Zid | **Unknown** — probe before committing |
| **Blocked / no target (park or reject)** | Al Dawaa, Bindawood, Landmark, Al Sadhan | **High** — measured blockers |

All conclusions are reproducible: re-run the edge probe (`wrangler dev --remote` +
the recorded URLs) and compare against a residential `curl` — the divergence is
the evidence.

---

## 7. Executive summary — one page, every candidate

Read this table alone to decide where to spend engineering time.
**Effort:** Low / Med / High. **Confidence:** in the *verdict*, from measured
evidence. **Verdict:** ✅ Build · 🟡 Investigate further (one browser trace) · 🔴 Skip.

| Name | Evidence collected | CF Worker reachable | Search technology | Data quality (prices/images/links) | Recommended connector | Effort | Confidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Jarir** | Edge 200, 897 KB SSR search; SAR + price fields + product links | ✅ Yes | Server-rendered (Magento-family) | ✅ Full — in HTML | HTML scraper | **Low** | High | ✅ **Build** |
| **Nahdi** | Edge 200, 421 KB SSR; JSON-LD products; Algolia in bundle | ✅ Yes | SSR + **Algolia** | ✅ Full — JSON-LD | HTML/JSON-LD or Algolia | Med | High | ✅ **Build** |
| **Spinneys** | Edge 200, 994 KB SSR; 41 price / 327 image hits; Algolia | ✅ Yes | SSR (Django) + Algolia | ✅ Rich | HTML scraper | Low–Med | High | ✅ **Build** |
| **Mumzworld** | Edge 200, 776 KB Next SSR; 14 price / 51 image hits; Algolia | ✅ Yes | Next SSR + Algolia | ✅ Full | HTML/Next-data or Algolia | Med | High | ✅ **Build** |
| **Salla (platform)** | Live store edge 200; 168 product refs, 28 SAR, JSON-LD; uniform theme | ✅ Yes | Server-rendered, uniform tenants | ✅ Full — JSON-LD | Shared storefront parser (multi-unlock) | Med once, ~0/store | High | ✅ **Build** |
| **Othaim (online)** | Edge reachable (Next/RSC); engine already parses its RSC | ✅ Yes | Next.js / RSC | Likely full (unconfirmed route) | Search endpoint / RSC | Med | Medium | 🟡 **Investigate** (find search route) |
| **eXtra** | Edge reachable (real pages/404); Unbxd site-key found | ✅ Yes | Hybris + **Unbxd** hosted search | Likely full via Unbxd | Unbxd API / HTML | Med | Medium | 🟡 **Investigate** (capture Unbxd key) |
| **GoldenScent** | Edge 200, 115 KB; Algolia-driven, sparse inline data | ✅ Yes | Client-rendered + Algolia | Via Algolia (not in HTML) | Algolia API | Med | Medium | 🟡 **Investigate** (Algolia creds) |
| **Nana** | Edge reachable shell; Frappe 404 on wrong method | ✅ Yes | SPA on **Frappe** `/api/method/*` | Full but **delivery-marked-up** | Frappe API + location | Med–High | Medium | 🟡 **Investigate** (find API method; label price) |
| **Nesto (online)** | Edge 200 Angular shell; API base lazy-loaded, not in bundle | ✅ Yes | Angular SPA | Unknown (needs trace) | API (needs sniff) | Med–High | Medium | 🟡 **Investigate** (sniff API) |
| **Zid (platform)** | **Not probed** — no clean live store this session | ⚠️ Unproven | Likely SSR (Salla-class) | Unknown | Shared storefront parser | Med | **Low** | 🟡 **Investigate** (repeat the Salla probe) |
| **Carrefour (online)** | Edge + residential: every path = 53-byte `<p></p>` shell, incl. all `/api/…` | ⚠️ Shell only | JS/token-gated app | ❌ None without token | Token reverse-eng (fragile) | **High** | High | 🔴 **Skip** (stay flyer-only) |
| **Al Dawaa** | Refused from 3 vantages: edge 523, residential 000, WebFetch ECONNREFUSED | ❌ No | — (TLS/JA3 blocked) | ❌ Unobtainable | None viable | — | High | 🔴 **Skip** (park; try a browser trace) |
| **Bindawood** | Edge/res: origin dead (CF 1016); `bindawood.com` = GoDaddy parking IP | ❌ No | — (no web store) | ❌ None | None (app-only) | — | High | 🔴 **Skip** (Danube covers group) |
| **Landmark (Home Centre / Babyshop)** | Edge **403 CF challenge** vs residential **200 + full HTML** | ❌ No (egress-blocked) | — (bot-managed) | ❌ Blocked from Worker | None (egress block) | — | High | 🔴 **Skip** (ClicFlyer-class) |
| **Al Sadhan** | `alsadhan.com` = 301 → Gmail; no storefront | ❌ No (no site) | — | ❌ None | D4D flyer only (if slug) | — | High | 🔴 **Skip** as online search |

**Cross-cutting multiplier (not a single retailer):** a **hosted-search helper**
(scrape app-id/key → query the index directly) is reusable across **Nahdi,
Mumzworld, Spinneys, GoldenScent** (Algolia) and **eXtra** (Unbxd) — build it once
during the Nahdi work. **Salla** is the second reusable multiplier (one parser →
many SME stores). These two patterns, plus the existing **D4D** flyer multiplier,
are where leverage compounds.

**One-glance investment guide (6-month readout):**
- **Spend here first:** Jarir, Nahdi, Spinneys, Mumzworld, Salla — all ✅, measured.
- **Cheap follow-ups after one browser trace each:** Othaim, eXtra, GoldenScent,
  Nana, Nesto, Zid — all 🟡, reachable, discovery-gated.
- **Do not spend engineering time** on Carrefour-online, Al Dawaa, Bindawood,
  Landmark, or Al Sadhan — 🔴, blocked/dead with high-confidence evidence. Revisit
  only if a source drops a gate or a browser-captured path emerges.

_Controls used to trust the probe (not candidates): ClicFlyer reproduced its
documented 302→/Home/Error Worker-block; Panda returned JSON as expected._

---

## 8. Revision log

Append one line per material change; update the row/score above in place, then
record here what changed and why. Never delete a prior conclusion — supersede it.

| Date | Change | Evidence |
|---|---|---|
| 2026-07-06 | Initial evidence-based investigation of all Tier 1/2 candidates; scores revised from the roadmap's theoretical values. | Edge probe (`wrangler dev --remote`) vs residential `curl`, controls validated. |
