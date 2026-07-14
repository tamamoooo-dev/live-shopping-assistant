# Super Search — Expansion Roadmap (12-Month Technical Plan)

> **Status:** Planning document. **No implementation, no code, no architecture
> changes** are proposed here — only prioritized opportunities and the reasoning
> behind them. Read alongside [HANDOFF.md](../HANDOFF.md) (current state) and
> [HISTORY.md](../HISTORY.md) (decisions already settled).
>
> **Author's frame:** Super Search is a *personal, single-user Saudi shopping
> assistant* with a hard **$0 running-cost** constraint (GitHub Pages +
> Cloudflare Workers Free plan only) and a **Worker-only egress** reality. Every
> feasibility score below is scored against *that* environment — a retailer that
> is trivial to scrape from a residential IP but blocks Cloudflare datacenter
> egress is **not** feasible here. This is the single most important lens in the
> document and it is what separates it from a generic "list of Saudi shops."

---

## 0. How to read this document

1. **§1 Scoring model** — what the 1–10 feasibility and value scores mean.
2. **§2 Master table** — every candidate retailer/platform, one row each, with
   the full attribute set condensed for scanning.
3. **§3 Tier 1 / §4 Tier 2 / §5 Tier 3** — full attribute profiles for the
   candidates that matter, most-detailed at the top.
4. **§6 Platform unlocks** — the connectors that light up *many* retailers from
   one integration (this is where the leverage is).
5. **§7 Not worth integrating** — explicit rejections with reasons, so they
   aren't re-litigated (mirrors the discipline of the HANDOFF "settled" notes).
6. **§8 Ranked roadmap** — effort × impact, sequenced across ~12 months.
7. **§9 Future Opportunities** — the feature/product ideas (loyalty, coupons,
   basket optimization, price intelligence, etc.).
8. **§10 Risks & guardrails** — what could break the plan.

---

## 1. Scoring model

Two independent 1–10 axes. They are deliberately *not* combined into one number
until §8, because effort and value trade off differently for a single-user tool
than for a commercial product.

**Feasibility (1–10)** — how buildable *within this project's constraints*.
Weighs, in rough order of impact:

- **Worker-reachability** — does the source respond normally to Cloudflare
  datacenter egress? (The #1 killer — see HungerStation/Keeta/ClicFlyer.)
- **Data shape** — clean JSON API > structured HTML > JS-rendered SPA > signed/
  encrypted API.
- **Auth burden** — none > guest-token bootstrap (like Ninja) > account login >
  encrypted-credential gate (like ClicFlyer mobile).
- **Anti-bot posture** — plain fetch > UA rotation (like Amazon) > Cloudflare
  challenge > active fingerprinting.
- **Fit to the frozen 10-key result contract** and the honesty/matching rules.

**User value (1–10)** — how much it improves *this user's* grocery/household
price comparison, weighing catalog overlap with everyday baskets, price quality,
promo/flyer richness, and whether it fills a category gap the current 7+18
stores don't already cover.

A candidate needs **both** scores healthy to rank. High value + low feasibility
= parked (documented, not attempted). High feasibility + low value = deferred.

---

## 2. Master candidate table

Legend — **Cat**: G=Grocery, H=Hypermarket, Ph=Pharmacy, Cv=Convenience,
W=Wholesale, E=Electronics, Ho=Home, B=Beauty, Pt=Pet, Ba=Baby, Sp=Specialty,
**Plat**=multi-retailer platform. **Feas/Val**: 1–10. **Strategy**: the
recommended connector approach.

| # | Retailer / Platform | Cat | Feas | Val | Tier | Strategy |
|---|---|---|---|---|---|---|
| 1 | **Nahdi** (nahdionline.com) | Ph/B | 7 | 9 | 1 | Search endpoint / API |
| 2 | **Carrefour KSA — online** (carrefourksa.com) | H/G | 6 | 9 | 1 | Search endpoint (MAF unlock) |
| 3 | **Jarir** (jarir.com) | E/Sp | 7 | 8 | 1 | Search endpoint / HTML |
| 4 | **Othaim — online** (othaimmarkets.com) | H/G | 6 | 8 | 1 | Search endpoint (flyer store already) |
| 5 | **Nana** (nana.sa) | G/H | 6 | 8 | 1 | API / search endpoint |
| 6 | **Salla platform** (salla.sa storefronts) | Plat | 7 | 7 | 1 | Storefront/API pattern (multi-unlock) |
| 7 | **Al Dawaa** (aldawaa.com) | Ph | 6 | 7 | 2 | Search endpoint / HTML |
| 8 | **eXtra** (extra.com) | E | 6 | 7 | 2 | Search endpoint / HTML |
| 9 | **Bindawood** (bindawoodstores.com) | H/G | 6 | 7 | 2 | API / search endpoint |
| 10 | **Spinneys KSA** (spinneys.com) | G | 5 | 6 | 2 | HTML / search endpoint |
| 11 | **Zid platform** (zid.store storefronts) | Plat | 6 | 6 | 2 | Storefront/API pattern (multi-unlock) |
| 12 | **Landmark platform** (Home Centre, Babyshop…) | Plat/Ho/Ba | 6 | 6 | 2 | Shared platform connector (multi-unlock) |
| 13 | **Mumzworld** (mumzworld.com) | Ba | 6 | 6 | 2 | Search endpoint / API |
| 14 | **Golden Scent** (goldenscent.com) | B | 6 | 5 | 2 | HTML / search endpoint |
| 15 | **Al Sadhan** (alsadhan.com) | G/H | 5 | 6 | 2 | HTML / D4D flyer + online |
| 16 | **Nesto — online** (nestoksa.com) | H/G | 5 | 6 | 2 | Search endpoint (flyer store already) |
| 17 | **Saco** (saco.sa) | Ho | 5 | 5 | 3 | HTML / search endpoint |
| 18 | **IKEA KSA** (ikea.com/sa) | Ho | 4 | 5 | 3 | HTML (heavy SPA) |
| 19 | **Whites Pharmacy** (whitespharmacy.com) | Ph/B | 5 | 4 | 3 | HTML |
| 20 | **Sephora KSA** (sephora.sa) | B | 4 | 4 | 3 | HTML (SPA) |
| 21 | **Jahez Groceries** (jahez.net) | Cv/G | 3 | 5 | 3 | App API (gated) — park |
| 22 | **ToYou** (toyou.io) | Cv/G | 3 | 4 | 3 | App API (gated) — park |
| 23 | **Careem Quik** | Cv/G | 2 | 4 | 3 | App API (signed) — park |
| 24 | **AliExpress / SHEIN** | Sp | 3 | 3 | 3 | Anti-bot heavy — park |
| 25 | **HungerStation Market** | G/Cv | 1 | 5 | ✗ | **Settled: not addable** |
| 26 | **Keeta Market** | G/Cv | 1 | 5 | ✗ | **Settled: signed Meituan API** |
| 27 | **ClicFlyer** (flyer aggregator) | Plat | 2 | 6 | ✗ | **Settled: closed 2026-07-05** |
| 28 | **Talabat Mart** | G/Cv | 2 | 4 | ✗ | Gated q-commerce, KSA volatility |
| 29 | **Namshi** (fashion) | Sp | 5 | 2 | ✗ | Off-mission (fashion) |

Scores are relative and calibrated to the existing fleet: the 7 live stores sit
around feasibility 6–9 (Ninja 7, Panda/Tamimi/Danube/Lulu 8–9, Amazon/Noon
best-effort ~6). Anything scored ≤3 feasibility is a *park* (document, don't
attempt) until the environment or the source changes.

---

## 3. Tier 1 — implement next (full profiles)

These are the highest **value × feasibility** wins. Each closes a real category
gap or adds a large everyday-basket catalog reachable from a Worker.

### 3.1 Nahdi — `nahdionline.com` · **Feasibility 7 · Value 9**

- **Category:** Pharmacy + Beauty/personal care (also baby, mother & child).
- **Website:** https://www.nahdionline.com
- **Geographic coverage:** Nationwide KSA (largest pharmacy retailer in the
  Kingdom, 1,000+ physical stores; strong Riyadh presence).
- **Estimated catalog size:** Large — tens of thousands of SKUs (OTC meds,
  supplements, personal care, baby, cosmetics, some FMCG).
- **Search capability:** Yes — on-site search with autosuggest; modern
  React/Next storefront typically backed by a JSON search endpoint.
- **Product detail pages:** Yes, rich (images, price, promo, brand, pack size).
- **Pricing quality:** High — first-party, SAR, VAT-inclusive, current.
- **Product images:** Yes, CDN-hosted, high quality.
- **Promotional prices:** Yes — frequent promos, strikethrough old price maps
  cleanly onto `oldPrice`/`discountLabel`.
- **Weekly brochures:** Yes — Nahdi runs periodic promo catalogs; **already
  potentially reachable via the D4D aggregator** as a flyer store (verify slug),
  which would be a *one-config-line* add independent of live search.
- **Delivery coverage:** Nationwide + rapid delivery in metros.
- **Auth requirements:** Browse/search expected to be anonymous; watch for a
  city/location cookie affecting price/availability (like Lulu's pz-locale).
- **Bot protection:** Moderate — mainstream storefront; may sit behind a CDN.
  Needs a Worker-egress probe (the ClicFlyer lesson: assume nothing until a
  datacenter-IP fetch is tested).
- **Public API:** No official public API; a private storefront JSON endpoint is
  the likely integration surface.
- **Implementation complexity:** Medium — one provider file in both repos +
  registration, plus mapping their promo model to the 10-key contract.
- **Recommended strategy:** **Search endpoint** (private JSON) with an HTML-parse
  fallback; **plus** a D4D flyer-store config if the slug exists.
- **Maintenance effort:** Low–Medium (storefront JSON is fairly stable; promo
  markup is the fragile seam).
- **Why Tier 1:** Pharmacy/personal-care is the **single biggest category gap**
  in the current fleet (the 7 live stores are all grocery/hyper/general). Nahdi
  is the market leader with deep everyday-basket overlap (baby formula, diapers,
  supplements, personal care) that the grocery stores stock thinly and price
  worse. Highest value on the board.

### 3.2 Carrefour KSA (online catalog) — `carrefourksa.com` · **Feas 6 · Val 9**

- **Category:** Hypermarket + Grocery.
- **Website:** https://www.carrefourksa.com
- **Geographic coverage:** Nationwide KSA (operated by Majid Al Futtaim).
- **Catalog size:** Very large — full hypermarket range (fresh, FMCG, household,
  some electronics/home).
- **Search capability:** Yes — mature storefront search with a JSON API
  (`/api/v...` product search is the known MAF pattern).
- **Product detail pages:** Yes, rich.
- **Pricing quality:** High — first-party SAR, VAT-inclusive; **store/area-
  scoped pricing** (needs a location context like Lulu).
- **Product images:** Yes, CDN.
- **Promotional prices:** Yes — heavy weekly promos, multi-buy offers.
- **Weekly brochures:** **Already integrated as a D4D flyer store** (`carrefour`
  in the 18). This item is specifically about adding **live online search** to
  complement the flyer coverage.
- **Delivery coverage:** Nationwide + express.
- **Auth requirements:** Anonymous browse; **latitude/longitude or store
  selection likely required** for correct price/stock — this is the main risk.
- **Bot protection:** Moderate–High — MAF fronts with a CDN and sometimes an
  `appId`/token header; needs a Worker-egress probe and header discovery.
- **Public API:** No official public API; storefront JSON is the surface.
- **Implementation complexity:** Medium–High — the location-context requirement
  and token header push this above a simple JSON grab.
- **Recommended strategy:** **Search endpoint** (JSON) with a fixed Riyadh
  store/geo context baked into the provider.
- **Maintenance effort:** Medium (token/appId rotation is the watch item).
- **Multi-retailer angle:** MAF's platform also backs other regional properties;
  a working Carrefour connector is a template for the **MAF platform pattern**
  (§6). Highest catalog overlap with the user's core grocery basket, hence Val 9.

### 3.3 Jarir — `jarir.com` · **Feasibility 7 · Value 8**

- **Category:** Electronics + Specialty (books, office, school, some appliances,
  smart home, baby/toys).
- **Website:** https://www.jarir.com
- **Geographic coverage:** Nationwide KSA (also GCC).
- **Catalog size:** Large — deep electronics + office + books catalog.
- **Search capability:** Yes — solid on-site search, JSON-backed.
- **Product detail pages:** Yes, rich with specs.
- **Pricing quality:** High — first-party SAR, VAT-inclusive; Jarir is a **price
  reference point** many Saudis benchmark against for electronics.
- **Product images:** Yes, high quality.
- **Promotional prices:** Yes — regular promos + a well-known printed/PDF
  catalog.
- **Weekly brochures:** Yes — Jarir's periodic catalog is iconic; a PDF/catalog
  ingest is plausible (though its cadence is monthly-ish, not weekly).
- **Delivery coverage:** Nationwide + pickup.
- **Auth requirements:** Anonymous browse/search.
- **Bot protection:** Low–Moderate — mainstream, generally fetch-friendly.
- **Public API:** No official public API; storefront JSON.
- **Implementation complexity:** Low–Medium.
- **Recommended strategy:** **Search endpoint** with HTML fallback.
- **Why Tier 1:** Fills the **electronics category gap** with the most trusted
  Saudi price reference, and is one of the more Worker-friendly big retailers.
  Complements Amazon.sa/Noon (which are best-effort/fragile) with a stable
  first-party electronics source.

### 3.4 Othaim (online store) — `othaimmarkets.com` · **Feas 6 · Val 8**

- **Category:** Hypermarket + Grocery.
- **Website:** https://www.othaimmarkets.com
- **Geographic coverage:** Nationwide KSA, very strong Central/Riyadh.
- **Catalog size:** Large hypermarket range.
- **Search capability:** Yes — the site is already the source of Othaim's
  **official weekly PDF** (the engine resolves it from the RSC flight of
  `/offers`), so the storefront is Worker-reachable and Next.js-based; a product
  search endpoint is the natural extension.
- **Product detail pages:** Yes.
- **Pricing quality:** High — first-party SAR.
- **Product images:** Yes.
- **Promotional prices:** Yes.
- **Weekly brochures:** **Already the best-quality flyer source in the fleet**
  (official PDF, not D4D). This item adds **live online search** so Othaim offers
  can also surface as live-priced grid cards, not only flyer offers.
- **Delivery coverage:** Nationwide.
- **Auth requirements:** Anonymous browse.
- **Bot protection:** Low–Moderate (already proven Worker-reachable for the PDF
  resolution path).
- **Public API:** Storefront JSON / RSC.
- **Implementation complexity:** Low–Medium (the site is already partly
  understood by the engine).
- **Recommended strategy:** **Search endpoint** (reuse RSC/JSON knowledge).
- **Why Tier 1:** Lowest-risk of the new grocery adds because the site is already
  a proven, parsed source; high everyday-basket overlap; and it upgrades Othaim
  from flyer-only to fully live.

### 3.5 Nana — `nana.sa` (nana direct) · **Feasibility 6 · Value 8**

- **Category:** Grocery / Hypermarket aggregation (Nana delivers from Panda,
  Othaim, Tamimi, and its own dark stores).
- **Website:** https://nana.sa (and app).
- **Geographic coverage:** Major KSA metros incl. Riyadh.
- **Catalog size:** Large — aggregates multiple grocers' catalogs.
- **Search capability:** Yes — app/storefront JSON API.
- **Product detail pages:** Yes.
- **Pricing quality:** High but **delivery-marked-up** — Nana prices can exceed
  in-store; must be labeled as a delivery-platform price (honesty rule 6), not
  treated as the store's shelf price.
- **Product images:** Yes.
- **Promotional prices:** Yes.
- **Weekly brochures:** No (q-commerce model).
- **Delivery coverage:** On-demand delivery in covered metros.
- **Auth requirements:** Likely a **guest token bootstrap** (Ninja-style) and a
  location/address context — this is the feasibility swing factor.
- **Bot protection:** Moderate — app-first API; test Worker egress.
- **Public API:** Private app API.
- **Implementation complexity:** Medium (token + location context, like Ninja).
- **Recommended strategy:** **API** with guest-token bootstrap, fixed Riyadh
  location; label as delivery pricing.
- **Why Tier 1:** Adds q-commerce price visibility (a category the fleet lacks
  since HungerStation/Keeta are blocked) via a Worker-reachable path, using the
  proven Ninja token pattern. The delivery-markup caveat caps it below the
  first-party grocers, but coverage value is high.

### 3.6 Salla platform connector — `salla.sa` storefronts · **Feas 7 · Val 7**

*(This is a platform unlock — see §6 for the full multi-retailer argument; profiled
here because it belongs in the first implementation wave.)*

- **Category:** Platform (hosts thousands of Saudi SME merchants across
  Grocery, Beauty, Specialty, Pet, Baby, Home).
- **Website:** https://salla.sa (merchant storefronts on custom domains +
  `*.salla.sa`).
- **Coverage:** KSA-wide; the dominant local SME e-commerce platform.
- **Catalog size:** Per store small–medium, but **collectively enormous** across
  many niche retailers (specialty grocery, honey/dates, supplements, pet, etc.).
- **Search capability:** Yes — Salla exposes a **consistent storefront structure
  and a documented Merchant/Storefront API** across all tenants; one parser/
  client works for every Salla store.
- **Pricing/images/promos:** Yes, uniform schema across tenants.
- **Brochures:** No.
- **Auth:** Public storefront pages are anonymous; the official API needs a
  per-merchant token (only relevant if a merchant opts in — for read-only
  price comparison, the public storefront pattern is the path).
- **Bot protection:** Low — SME storefronts.
- **Public API:** **Yes** — Salla has official developer APIs; even without them
  the shared storefront tech makes one connector reusable.
- **Implementation complexity:** Medium (build once), then **near-zero per added
  store** (config-line adds, exactly like D4D flyer stores).
- **Recommended strategy:** **Shared storefront/API connector**, then curate a
  short allowlist of Salla stores that carry relevant niche categories.
- **Why Tier 1:** It's the **second big multiplier after D4D** — one build
  unlocks a long tail of specialty retailers (dates, honey, spices, pet, baby,
  supplements) the mainstream grocers stock poorly. High leverage per unit
  effort.

---

## 4. Tier 2 — strong additions after Tier 1

Condensed profiles (full attribute set, tighter prose). These are good adds but
either overlap existing coverage, need more discovery, or serve narrower baskets.

### 4.1 Al Dawaa — `aldawaa.com` · **Feas 6 · Val 7**
Pharmacy #2 nationwide. Rounds out pharmacy price comparison against Nahdi (§3.1)
— having *two* pharmacies is what makes pharmacy price *comparison* meaningful
(the whole point of the app). Modern storefront, likely JSON search, moderate
anti-bot. **Strategy:** search endpoint / HTML. Add right after Nahdi so the
pharmacy category launches as a comparison, not a single source.

### 4.2 eXtra — `extra.com` · **Feas 6 · Val 7**
Electronics (United Electronics Co.). The natural comparison partner to Jarir
(§3.3) — same logic as the pharmacy pair. Large catalog, frequent promos,
financing offers. Storefront JSON/HTML; moderate anti-bot. **Strategy:** search
endpoint. Sequence directly after Jarir to launch electronics as a 2-source
comparison.

### 4.3 Bindawood — `bindawoodstores.com` · **Feas 6 · Val 7**
Major grocery/hyper (Bindawood Holding, which also owns Danube — already
integrated). Strong Western-region roots, growing Riyadh. Likely shares
platform/tech DNA with Danube (Spree-family?), which could make the connector a
near-clone. **Strategy:** API/search endpoint; **check for D4D flyer slug too.**
Value from additional grocery price points on the core basket.

### 4.4 Spinneys KSA — `spinneys.com` · **Feas 5 · Val 6**
Premium grocery, growing KSA footprint. Good for premium/imported SKUs the
mainstream grocers lack. Feasibility unknown until a Worker-egress probe;
storefront may be a heavier SPA. **Strategy:** HTML/search endpoint. Also a
plausible D4D flyer store.

### 4.5 Zid platform — `zid.store` storefronts · **Feas 6 · Val 6**
The #2 Saudi SME e-commerce platform after Salla. Same multiplier logic (§6):
one connector, many niche stores. Slightly lower priority than Salla only because
Salla has larger merchant density. **Strategy:** shared storefront/API pattern.

### 4.6 Landmark Group platform — Home Centre / Babyshop / Max / Centrepoint · **Feas 6 · Val 6**
One shared commerce platform (Akinon-adjacent tech, similar to Lulu's stack)
backs **Home Centre (Home), Babyshop (Baby), Max/Splash (fashion — skip),
Centrepoint**. A single connector unlocks the **Home and Baby** categories at
once. **Strategy:** shared platform connector, register only the on-mission
banners (Home Centre, Babyshop). See §6.

### 4.7 Mumzworld — `mumzworld.com` · **Feas 6 · Val 6**
Largest regional baby/mother retailer. Deep baby catalog (formula, diapers,
gear) with real price competition against grocery/pharmacy. Clean modern
storefront, JSON search. **Strategy:** search endpoint/API. Strong if the user's
basket skews baby; otherwise Nahdi already covers the essentials.

### 4.8 Al Sadhan — `alsadhan.com` · **Feas 5 · Val 6**
Established Riyadh grocery/hyper. Central-region overlap with the flyer fleet.
Likely a D4D flyer candidate first (cheap add), online search second.
**Strategy:** D4D flyer config + HTML/search endpoint.

### 4.9 Nesto (online) — `nestoksa.com` · **Feas 5 · Val 6**
Already a D4D **flyer** store; this adds live online search. Value = upgrading an
existing flyer store to fully live, same pattern as Othaim (§3.4) but lower
priority (Othaim's site is already better understood). **Strategy:** search
endpoint.

### 4.10 Golden Scent — `goldenscent.com` · **Feas 6 · Val 5**
Beauty/fragrance specialist. Clean storefront, JSON. Narrower basket relevance
but fills Beauty depth beyond Nahdi's personal-care range. **Strategy:** HTML/
search endpoint. (Sephora/Faces are heavier SPAs — see Tier 3.)

---

## 5. Tier 3 — future opportunities, lower priority

Full attribute set kept terse; these are parked-but-plausible.

| Retailer | Cat | Feas | Val | Why Tier 3 (one-liner) |
|---|---|---|---|---|
| **Saco** (saco.sa) | Home/DIY | 5 | 5 | Home-improvement niche; narrow basket overlap; storefront workable. |
| **IKEA KSA** (ikea.com/sa) | Home | 4 | 5 | Heavy SPA, geo/store-scoped stock; high effort for occasional-purchase category. |
| **Whites Pharmacy** | Ph/B | 5 | 4 | Third pharmacy; only worth it after Nahdi+Al Dawaa prove the category. |
| **Sephora KSA** (sephora.sa) | Beauty | 4 | 4 | Premium beauty; heavy SPA + likely bot protection; low everyday overlap. |
| **Faces / Ounass** | Beauty/Lux | 4 | 3 | Luxury; off the value-shopping mission. |
| **Jahez Groceries** | Cv/G | 3 | 5 | Real q-commerce value but app-signed API; **park** until a Worker path is proven. |
| **ToYou** | Cv/G | 3 | 4 | Same as Jahez — gated app API; park. |
| **Careem Quik** | Cv/G | 2 | 4 | Signed app API + geo gate; park (HungerStation-class difficulty). |
| **Mrsool** | Cv/G | 2 | 3 | Errand model, unstructured catalog; low fit. |
| **AliExpress** | Sp | 3 | 3 | Global marketplace, heavy anti-bot, off-mission for grocery; park. |
| **SHEIN** | Sp | 3 | 2 | Fashion, aggressive anti-bot; off-mission. |
| **noon.com main** | Sp | 4 | 6 | Main site blocks datacenter IPs (only Noon **Minutes** is integrated); revisit only if a Worker path appears. |

**Tier 3 rule of thumb:** none of these should be attempted until every Tier 1
item ships and at least half of Tier 2. Several (Jahez/ToYou/Careem) are really
*parked technical bets* awaiting the same breakthrough that HungerStation/Keeta
need — a Worker-reachable, unsigned path.

---

## 6. Platform unlocks — connectors that light up many retailers at once

This is the highest-leverage section. The project already has **one** proven
multiplier — **D4D** — where a new flyer store is a single config line
(HANDOFF §3). The strategy for the next 12 months should bias toward *finding
the next D4D-shaped multipliers* rather than one-off scrapers.

| Platform | What it unlocks | Leverage | Priority |
|---|---|---|---|
| **D4D aggregator** *(existing)* | Any Saudi flyer store it covers — one config line each | Proven; already 18 stores | Keep extending (add Nahdi, Al Sadhan, Spinneys slugs if present) |
| **Salla** | Thousands of SME storefronts (specialty grocery, dates, honey, pet, baby, supplements) via one shared storefront/API pattern | **Very high** — closest analog to D4D for *live* catalogs | **Tier 1 (§3.6)** |
| **Zid** | #2 SME platform; same shared-storefront leverage | High | Tier 2 (§4.5) |
| **Landmark Group platform** | Home Centre + Babyshop + Centrepoint from one connector (shared commerce stack) | Medium–High (2–3 on-mission banners) | Tier 2 (§4.6) |
| **Majid Al Futtaim (MAF)** | Carrefour + other MAF retail properties share a storefront API pattern | Medium (Carrefour is the main prize) | Falls out of Tier 1 Carrefour (§3.2) |
| **ZopSmart** | Tamimi (already integrated) runs on ZopSmart, which also powers other **GCC grocers** — the same client shape may port | Medium (regional, verify KSA tenants) | Investigate opportunistically |
| **Akinon** | Lulu (already integrated) runs on Akinon; other Akinon-hosted KSA retailers reuse the list-JSON pattern | Medium | Investigate opportunistically |
| **Spree / Shopify** | Danube runs a Spree-family API; Bindawood may share it. Generic Shopify (`/products.json`) covers many small brand D2C stores | Medium (long tail) | Opportunistic |

**Recommendation:** treat **Salla** as the flagship new multiplier (Tier 1), and
whenever a one-off retailer is investigated, first ask *"what platform is this on,
and does that platform have other KSA tenants I want?"* — because a connector
written against the **platform** amortizes across every future store on it. This
is the single most important structural principle for keeping the maintenance
burden flat as the fleet grows (critical under the $0 / single-maintainer
reality).

---

## 7. Retailers NOT worth integrating (explicit rejections)

Documented so they are not re-investigated without new evidence — mirroring the
HANDOFF "settled" discipline.

| Retailer | Verdict | Reason |
|---|---|---|
| **HungerStation Market** | **Do not attempt** | Menu API is Cloudflare-gated to datacenter IPs; not addable from a Worker. *(HANDOFF §4, settled.)* |
| **Keeta Market** | **Do not attempt** | Signed Meituan "Sailor" API + geo-gate; not reproducible from a Worker without forging app credentials. *(Settled.)* |
| **ClicFlyer** | **Closed** | Web zone 302-loops Worker egress; mobile API behind an RSA+AES-GCM encrypted-credential gate. Deep study 2026-07-05 (HISTORY §31) — D4D remains the flyer foundation. Do **not** reopen absent an official/partner API or relaxed constraints. |
| **Talabat Mart** | Reject (for now) | Gated q-commerce menu API; KSA market position volatile. Same class as HungerStation; no Worker path. |
| **Careem Quik / Jahez / ToYou** | Park, don't reject | Real value but signed app APIs; not integrable today. Kept in Tier 3 as parked bets, not active work. |
| **Namshi / SHEIN / Ounass** (fashion/luxury) | Reject | **Off-mission.** Super Search is a grocery/household **value** comparison tool; fashion catalogs are volatile, size-driven, and don't fit the 10-key contract or the per-unit-value comparison model. |
| **Individual Salla/Zid stores, integrated one-by-one** | Reject the *approach* | Never integrate these as bespoke providers — always via the **platform connector** (§6), or the maintenance cost explodes. |
| **Manuel Market** | Already retired | Dead on D4D since 2025-09, no official offers page (HANDOFF §4). History rows kept; do not re-add. |
| **OffersInMe** | Superseded | Replaced by D4D; stale data. |

**General exclusion principle:** reject anything that is (a) not Worker-reachable,
(b) off the grocery/household/pharmacy/electronics value-shopping mission, or
(c) integrable only as a one-off when a platform connector would do — unless it
clears a genuinely high value bar (which is why the parked q-commerce bets stay
listed rather than deleted).

---

## 8. Ranked implementation roadmap (effort × impact, ~12 months)

Sequencing logic: **launch categories as comparisons, not single sources**
(a lone pharmacy has little value; two pharmacies create a comparison), **front-
load multipliers**, and keep each wave inside the free-plan budgets (HANDOFF §8 —
re-run the KV-write and subrequest math before *every* store add, especially for
flyer-store additions).

### Wave 1 (months 1–3) — new categories + first multiplier
Highest impact per unit effort; each opens a category the fleet lacks.

1. **Nahdi** (Tier 1) — opens Pharmacy/personal-care. *Highest single value.*
2. **Al Dawaa** (Tier 2) — makes Pharmacy a real comparison. *Ship close to Nahdi.*
3. **Jarir** (Tier 1) — opens a stable Electronics source.
4. **eXtra** (Tier 2) — makes Electronics a comparison.
5. **Othaim online** (Tier 1) — lowest-risk grocery add (site already understood).

*Rationale:* by end of Wave 1 the app covers Grocery+Hyper (existing) **plus**
Pharmacy and Electronics as genuine 2-source comparisons — the biggest visible
jump in usefulness available.

### Wave 2 (months 3–6) — grocery depth + the Salla multiplier
6. **Carrefour online** (Tier 1) — deepest grocery-basket overlap (accept the
   location-context effort).
7. **Salla platform connector** (Tier 1) — the multiplier; then curate ~5–10
   niche stores (dates/honey/spices/pet/supplements).
8. **Nana** (Tier 1) — q-commerce price visibility via the Ninja token pattern.

*Rationale:* Carrefour maximizes core-basket price points; Salla starts the long-
tail flywheel at near-zero marginal cost per store; Nana adds the delivery-price
dimension the blocked q-commerce players denied us.

### Wave 3 (months 6–9) — platform leverage + baby/home
9. **Landmark platform connector** → **Home Centre + Babyshop** (Home + Baby in
   one build).
10. **Mumzworld** (Tier 2) — baby depth / comparison partner to Babyshop.
11. **Bindawood** (Tier 2) — likely a Danube-shaped clone; cheap grocery add.
12. **Zid platform connector** (Tier 2) — second SME multiplier.

### Wave 4 (months 9–12) — rounding out + opportunistic
13. **Spinneys** / **Al Sadhan** / **Nesto online** — grocery breadth (each also
    a D4D flyer check first).
14. **Golden Scent** — beauty depth.
15. **Opportunistic platform probes** — ZopSmart/Akinon/Shopify tenants
    discovered while doing the above (register any that are free wins).

### Effort × impact quadrant (summary)

- **High impact / Low effort (do first):** Nahdi, Al Dawaa, Jarir, eXtra, Othaim
  online, Bindawood (if Danube-shaped), Salla connector.
- **High impact / High effort (schedule deliberately):** Carrefour (location
  context), Nana (token+geo), Landmark platform.
- **Low impact / Low effort (opportunistic fill):** Nesto online, Al Sadhan,
  Golden Scent, additional Salla/Zid stores, D4D slug additions.
- **Low impact / High effort (avoid):** IKEA, Sephora, luxury/fashion, any gated
  q-commerce.

**Budget guardrail for every wave:** the KV write budget (≈1,000 writes/day) is
the binding constraint on *flyer* stores, not live-search stores (live stores are
stateless and cost only subrequests at query time). So live-search adds
(Nahdi/Jarir/Carrefour/etc.) are cheap on the stateful budget; **flyer-store**
adds (any new D4D config) must re-do the §8 math first.

---

## 9. Future Opportunities (strategic feature roadmap)

Beyond adding retailers, these features compound the value of the catalog the app
already has. Ordered roughly by value-per-effort given the existing architecture
(price-history harvest, matching mirror, D4D offers, hotspots, cart, watches).

### 9.1 Near-term, high-leverage (build on assets already present)

- **Cheapest complete shopping basket** — the app already has a cart, per-store
  grouping, and cross-store prices. The natural next step: given a basket, compute
  the **cheapest single-store total** *and* the **cheapest split** (which items
  to buy where), surfacing the trade-off vs. delivery/effort. This is arguably the
  **single highest-value feature** on this list — it turns per-product comparison
  into whole-trip optimization, and most of the data plumbing exists.
- **Multi-product basket optimization** — the generalization of the above:
  factor in delivery thresholds, minimum-order values, and per-store promos
  (e.g. buy-2-get-1) when splitting the basket. Uses the existing offers/matching
  layers.
- **Smart deal detection** — the price-history harvest (catalog-wide, HANDOFF §5)
  already knows lowest-ever/highest/trend per identity. Surface a **"real deal"
  badge** only when a current flyer/live price is at or near the lowest-ever for
  that identity (with the ≥2-week confidence gate already in place). Directly
  extends the honesty model; low incremental effort.
- **Historical price intelligence (deeper)** — expose per-product price charts in
  the product sheet (the data exists in `price_history`); add "typical price
  band," "you're paying X% above the 90-day low," and per-store trend arrows.
- **Stock availability** — many storefront JSONs already carry an in-stock flag;
  capturing it lets the grid grey-out or de-rank out-of-stock listings and lets
  watches distinguish "price met but out of stock."
- **Barcode search** — a phone-camera barcode scan → EAN/UPC lookup → resolve to
  the matched product across stores. High everyday utility for a grocery app; the
  matching mirror already normalizes to product identities the barcode can key
  into. Requires an EAN→product map (harvest from storefront JSONs that expose
  barcodes).
- **Notification enhancements** — the watch/alert + ntfy path exists (HANDOFF §5).
  Add: basket-level alerts ("your usual basket is 12% cheaper this week at X"),
  flyer-drop notifications ("new Othaim flyer is live"), and lowest-ever alerts
  driven by the deal-detection logic.

### 9.2 Medium-term (new data, moderate effort)

- **Location-aware pricing** — several targets (Carrefour, Lulu, Nahdi) price by
  store/area. Formalize a single "Riyadh location context" abstraction so every
  geo-scoped provider reports comparable shelf prices, and expose the assumption
  to the user (honesty). Prerequisite for trustworthy multi-store baskets.
- **Loyalty program awareness** — many Saudi retailers have loyalty schemes
  (Nahdi *Nahdiyat*, Tamimi, Panda, Carrefour SHARE). Even without integrating
  accounts, the app can **annotate** listings with "loyalty price available" and,
  where the storefront exposes a member price, show both. Full account-linked
  loyalty is out of scope for a $0 single-user tool, but surfacing the *existence*
  and the member-vs-regular delta is cheap and useful.
- **Digital coupons** — retailers and D4D-style aggregators publish coupon codes/
  digital-clip offers. A lightweight coupon catalog per store (manually curated or
  scraped where structured) shown next to matching products. Pairs naturally with
  deal detection.
- **Wishlist / watch synchronization** — today's cart + watches are localStorage/
  single-device. A tiny optional sync (still $0 — the KV engine could hold an
  opaque per-user blob under the existing budget) would let the user's basket and
  watches follow them across phone/desktop. Scope carefully against the single-
  user, no-auth posture.
- **Seasonal sale prediction** — the price-history data plus the Saudi retail
  calendar (Ramadan, Eid, back-to-school, White Friday/Black Friday, National
  Day) enables a **"prices for this category usually drop in ~3 weeks"** hint.
  Conservative, explainable heuristics only — no opaque ML — consistent with the
  project's deterministic-and-honest philosophy.

### 9.3 Longer-term / exploratory (higher effort or new infra)

- **AI shopping assistant** — a natural-language front door ("what's the cheapest
  way to buy ingredients for machboos this week?") that composes existing
  primitives: matching, offers search, basket optimization, price history. Given
  the $0 constraint, this leans on client-side orchestration + the existing
  Workers, not a hosted LLM backend, unless a free tier fits. Value is high but it
  should sit **on top of** the deterministic engine, never replace the ranking law
  (HANDOFF rule 9).
- **Voice search** — browser Web Speech API → existing search. Cheap to prototype
  (client-only), genuinely useful for hands-in-the-kitchen grocery use; Arabic STT
  quality is the main risk. Low infra cost makes it a good experiment.
- **Personalized recommendations** — "you buy X monthly; it's cheapest now at Y."
  Derivable from the local cart/watch history + price intelligence, entirely
  client-side. Keep it transparent (rule-based, explainable) to fit the honesty
  ethos.
- **Cashback / price-guarantee awareness** — surface where a retailer offers a
  price-match guarantee or a cashback-platform partnership exists. Informational
  annotation, not a financial integration — low effort, moderate utility.
- **Flyer OCR improvements** — the current offer names are D4D's AI OCR extraction
  and are "still rough" (HANDOFF §11 TODO 4). Better name derivation is a
  compounding win: it improves offers search **and** converges price-history
  identities (fewer series splits). The project deliberately **defers building its
  own OCR** (HANDOFF §1) — so the practical path is improving `deriveNames`
  heuristics and debris-guards, not a new OCR pipeline. High compounding value,
  bounded effort, and it self-heals on the next weekly upsert.

### 9.4 Feature prioritization summary

| Feature | Value | Effort | Verdict |
|---|---|---|---|
| Cheapest complete basket | Very high | Medium | **Build first** — uses existing cart+prices |
| Smart deal detection | High | Low | **Build first** — extends price-history |
| Barcode search | High | Medium | Strong near-term |
| Basket/flyer-drop notifications | High | Low–Med | Strong near-term |
| Deeper price-history UI | Medium–High | Low | Cheap win |
| Stock availability | Medium | Low–Med | Cheap win, needs field capture |
| `deriveNames` / flyer OCR quality | High (compounding) | Medium | Ongoing improvement |
| Location-aware pricing abstraction | High (enabler) | Medium | Prereq for trustworthy baskets |
| Loyalty/coupon annotation | Medium | Low–Med | Good annotation-only scope |
| Seasonal sale prediction | Medium | Medium | Conservative heuristics only |
| Wishlist/watch sync | Medium | Medium | Scope vs. no-auth posture |
| AI assistant / voice / recs | High (exploratory) | High | On top of engine, not replacing it |
| Cashback / price-guarantee | Low–Med | Low | Informational only |

---

## 10. Risks & guardrails

- **Worker-egress is the recurring killer.** Every new retailer must pass a
  Cloudflare-datacenter-IP probe **before** any provider work — the ClicFlyer
  study is the cautionary tale (looked feasible, wasn't). Budget a discovery spike
  per candidate; don't assume browser-reachable == Worker-reachable.
- **The matching mirror doubles every store's cost.** Rule 2 (HANDOFF §3): a new
  store touching synonyms/families/brands means edits in **both** `src/match.js`
  and `brochure-engine/src/matching.js` plus their tests. Factor this into every
  effort estimate; it's the #1 regression risk.
- **Free-plan budgets bind on flyer stores, not live stores.** Live-search adds
  are cheap on the stateful side; **any D4D flyer-store add** must re-run the KV-
  write/subrequest math (HANDOFF §8) first.
- **Honesty rules constrain what new sources can claim.** Delivery-platform prices
  (Nana, q-commerce) and OCR flyer prices can never join strong lowest-price
  equivalence groups (rule 6). New sources must be labeled with their price
  provenance, or they erode the comparison's trustworthiness.
- **Platform connectors are the maintenance hedge.** Prefer Salla/Zid/Landmark/MAF
  platform connectors over one-off scrapers wherever possible — flat maintenance
  as the fleet grows is essential for a single maintainer at $0.
- **Scope creep vs. mission.** The app is a grocery/household/pharmacy/electronics
  **value** tool. Fashion, luxury, and general-marketplace adds dilute the
  per-unit-value comparison model and should stay rejected (§7).

---

## 11. One-paragraph executive summary

Over the next 12 months the highest-value moves are: **(1)** open the two missing
everyday categories — **Pharmacy** (Nahdi + Al Dawaa) and **Electronics** (Jarir +
eXtra) — each launched as a two-source comparison; **(2)** deepen core grocery
with **Othaim-online, Carrefour-online, Nana, and Bindawood**; **(3)** build the
**Salla platform connector** as the next D4D-style multiplier to unlock a long
tail of specialty stores at near-zero marginal cost, followed by **Zid** and the
**Landmark** platform for Home/Baby; and **(4)** on the feature side, ship
**cheapest-complete-basket optimization** and **smart deal detection** on top of
the price-history and cart assets that already exist — the two features that
convert Super Search from a per-product comparison into a whole-trip money-saving
engine. Everything is gated by the non-negotiables: Worker-reachability, the $0
budget (KV writes bind flyer stores), the matching-mirror double-cost, and the
honesty rules. Blocked/settled targets (HungerStation, Keeta, ClicFlyer, gated
q-commerce) stay parked, not reopened, absent new external evidence.
