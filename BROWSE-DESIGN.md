# Browse — Design Document

> **Status:** Rev 2 — approved, implemented, and **LIVE IN PRODUCTION**
> (2026-07-16; verification record in HISTORY §31). This document is now the
> architecture reference for the shipped system. Phase 4 (§11 — brand
> mining, shelf refinements, For-you/In-season rails, collections, per-deal
> "why exceptional" explainer) is the open roadmap. Standing principles for
> all future Browse work: canonical knowledge stays provider-independent
> (Provider → Mapping → Canonical → Browse); new knowledge modules
> (packaging, attributes, brand relationships) follow the §5 extension shape;
> reuse over duplication, always. Search is frozen (HANDOFF rule 9) — Browse
> changes nothing about Search, ranking, or matching.
>
> **Rev 2 changes (review):** (1) provider-independent canonical taxonomy —
> Provider → Mapping → Canonical Knowledge → Browse; D4D is one mapped source,
> never the foundation. (2) **Exceptional Deals** — a flagship experience that
> scores deal QUALITY (not advertised discount) transparently. (3) Lightweight
> collections (optional, declarative). (4) Explicit extension points for
> future knowledge modules (packaging, attributes, brand relationships).
> (5) Reuse map corrected against the current codebase (viewer v2 offer
> deep-link, existing viewer brand knowledge, centralized i18n).

---

## 0. TL;DR

Browse is **"walk this week's market"** — a structured, cross-store remix of
the ~8,000 live flyer deals the engine already holds, organized into a
navigable **graph** (Departments → Aisles → Shelves ↔ Brands ↔ Deals ↔ Stores
↔ Flyer pages) with **dynamic rails** (Biggest drops, Lowest ever, Ending
soon, New this week…) computed from data the pipeline already produces.

Three deliberately small canonical knowledge bases (a **canonical
department/aisle taxonomy** with per-provider category mappings — D4D is one
mapped source, never the foundation; a **brand knowledge base** seeded from
the viewer's existing curated list; and the **existing family/type lexicons**
reused as shelves) plus ingest-time derivation (identity + brand columns,
D1-only, zero subrequests) give every entry point the user asked for — with
no weekly curation, no paid APIs, and no new budget pressure. The flagship
experience is **Exceptional Deals** (§7.5): a transparent, history-backed
deal-quality score, never advertised discount alone. A new supermarket
provider automatically enriches Browse the day its first flyer ingests.

---

## 1. Ground truth: what the substrate actually is (measured 2026-07-15)

| Fact | Value |
|---|---|
| Offer rows in D1 (≤180-day retention) | 35,901 |
| **Live offers right now** (valid_to ≥ today) | **8,032** |
| …with a product image (D4D CDN crop) | 100% |
| …with a bilingual/EN/AR display name | 87% |
| …with a strike-through "was" price | 93% |
| Distinct D4D category slugs | 96 (~85 live in any week) |
| Stores | 18 (Central/Riyadh), refreshed Tue/Wed/Fri |
| Price-history identities (cross-week memory) | ~13.6k+, growing weekly |
| Brand signal | Strong: OCR names lead with brands (Nivea, Nadec, Sadia, Almarai, Dettol…) but no brand column exists yet |

Two structural truths drive everything below:

**Truth 1 — the catalog is OFFERS, not shelf stock.** Super Search does not
know what's *in* a supermarket; it knows what 18 supermarkets chose to
*promote this week*, plus the price memory of everything ever promoted. A
Browse that pretends to be a full-catalog store (like an online supermarket's
browse tree) would feel arbitrarily gappy — the "Milk" shelf has 64 items one
week and 12 the next, controlled by flyer editors, not by us.

**Truth 2 — D4D's taxonomy is free curated knowledge.** Every offer carries
one of ~96 stable, human-curated category slugs (`cheese-creame`,
`fresh-chicken-poultry`, `laundry`, `mobiles`…). This is exactly the
"lightweight knowledge layer" the vision asks for, and we already ingest it.

## 2. The core reframe (challenging the brief)

The brief says *"browse products the same way you walk through a real
supermarket."* Taken literally, that's the wrong goal for this substrate —
and also already built: the **tappable brochure viewer IS the literal
aisle-walk** (page by page, tap what catches your eye). Duplicating it with
extra chrome would produce a worse ClickFlyer.

What no physical walk — and no flyer app — can give the user is the
**cross-store, price-aware view**: *"show me every cheese on promotion in
Riyadh this week, tell me which deal is genuinely good, and let me start from
whatever is in my head — a department, a brand, a craving."* That is Browse.

So the two pillars divide cleanly:

- **Brochures** = walk ONE store's aisles (spatial, serendipitous, visual).
- **Browse** = walk THE MARKET (structured, comparative, intelligent).

They cross-link: every Browse card can deep-link into its flyer page (the
`page_ref`/hotspot machinery already exists), and the brochure product sheet
can link out to the offer's brand/shelf. Browse never claims completeness:
its framing everywhere is **"this week's offers"**, which is honest and —
because everything shown is by definition a deal — is a strength, not a gap.

Other assumptions in the brief I'm rejecting (with reasons):

| Brief idea | Verdict | Why |
|---|---|---|
| "Popular products" entry point | **Replaced** | Single-user app, no popularity telemetry. Substitute: **"In many stores"** (breadth of promotion = the market voting with flyer space) and a client-side **"For you"** rail from the user's own cart/watches/recent searches. Honest signals only. |
| Packaging / Units / Attributes knowledge modules | **Dropped** | `parseSize` already handles units/packs. No reliable attribute signal exists in flyer OCR beyond family/type/size — a speculative attribute model would be empty scaffolding. |
| Brand pages with "brand insights" | **Kept, bounded** | Insights limited to what the data proves: discount depth, store coverage, families spanned, price-history highlights. No invented editorial. |
| Seasonal browsing via a curated calendar | **Replaced with data-driven seasonality** | A category whose share of this week's offers spikes vs its own 8-week average IS the season (stores merchandise Ramadan/school/summer for us). Zero calendar KB, zero Hijri math, self-maintaining. |
| A navigation tree | **Replaced with a graph** | §4. The "multiple equal entry points" requirement falls out of graph structure for free. |

## 3. Design principles (inherited + new)

1. **Derive, never curate.** Every Browse surface must be computable from
   the offers/price-history substrate plus the three small KBs. If a feature
   needs weekly human input, it's the wrong feature.
2. **Failure mode is "unclassified", never "wrong".** Same philosophy as the
   family lexicons: a brandless offer is fine (it still lives on its shelf);
   a wrongly-branded offer poisons a brand page. Precision over recall
   everywhere.
3. **Honesty rules carry over** (HANDOFF rule 6): AI-extracted price
   disclaimer, flyer deep-link on every card, "lowest ever" claims only with
   stated depth (`weeks_seen`), no fake urgency.
4. **Reuse the product sheet.** Browse introduces NO new product page — every
   card opens the same detail sheet the brochure viewer already has (crop,
   price, add-to-cart, similar offers), extended with price-history badges.
5. **Search stays frozen.** Browse reads the same D1 tables through new
   read-only endpoints. It shares `productFamily`/`offerFamily` as a
   *consumer*; it does not touch matching, ranking, or the mirrors.
6. **$0 and budget-neutral.** All derivation is D1-only at ingest (like the
   price-history harvest: zero subrequests, zero KV writes). All reads are
   D1 + Cache API. The KV write budget (§8 of HANDOFF) is untouched.

## 4. Information architecture: the Browse graph

Not a tree. A small typed graph where **every node is a page/sheet and every
edge is a tap**:

```
Department ──contains──► Aisle (D4D slug) ──contains──► Deal
    │                        │                           ▲ │
    │                        └──subdivides──► Shelf ─────┘ │
    │                            (family lexicon)          │
Brand ◄──made-by────────────────────────────────────────────┘
  │  └──spans──► Shelf / Aisle          Deal ──seen-in──► Flyer page (viewer)
  │                                     Deal ──sold-at──► Store
  └──sold-at──► Store                   Deal ──is────► Product identity
                                                        (price history)
```

| Node | Backing data | Cardinality | Example |
|---|---|---|---|
| **Department** | canonical taxonomy (KB #1) | ~11 | Dairy & Eggs |
| **Aisle** | canonical taxonomy (KB #1); provider categories map INTO it | ~60 | `cheese` |
| **Shelf** | existing family lexicons (KB #3) | ~70 families | cheese / milk / yogurt |
| **Brand** | brand lexicon (KB #2) + mining (§6) | ~200 seeded, grows itself | Kiri, Herfy |
| **Deal** | an `offers` row | ~8k live | Kiri squares 24pc, 13.95 SAR |
| **Product identity** | `price_identities` | ~13.6k | its cross-week price series |
| **Store** | existing 18 providers | 18 | Danube |
| **Flyer page** | brochure + hotspot snapshot | — | tap-through to the viewer |

Why BOTH Aisle and Shelf: they answer different mental queries. The aisle is
the CANONICAL editorial grouping every provider category maps into (a
"Cheese & Cream" aisle — fine for walking); the shelf is our semantic family
("cheese" exactly — fine for craving). Aisles are complete (every offer with
a provider category lands in one, even unnamed offers); shelves are precise
(87%-named offers classify via `offerFamily`, name-first with category
fallback — already built). The UI presents aisles as the default subdivision
of a department and shelf chips as refinements; users never see the
distinction as jargon.

**Provider independence (Rev 2):** Browse speaks ONLY canonical ids.

```
Provider category (d4d "cheese-creame", future source X "dairy/cheese")
        │  per-provider mapping  (KB #1b — data, not code)
        ▼
Canonical aisle (cheese-cream) ── belongs to ──► Department (dairy-eggs)
        ▼
Browse API / UI (canonical ids only; no provider slug ever leaves the engine)
```

Canonicalization happens **at read time** (a pure in-memory lookup keyed by
`(source, category)`): no schema change, and a mapping improvement applies
retroactively to every stored offer on the next request. A new offers source
integrates by adding ONE mapping table — the taxonomy, the API, the frontend,
and all derived knowledge are untouched.

**Entry points, all equal, all just filtered views of the same Deal set:**
Departments · Brands · Shelves ("I want cheese") · Rails (Deals-first) ·
Stores · Seasonal · For-you. Adding an entry point later = adding a filter +
a tile, not a new architecture.

## 5. The three canonical knowledge bases (small, stable, by design)

**KB #1 — Canonical taxonomy + provider mappings** (new; engine-side data).
Two deliberately separate files, mirroring the proven Brand Knowledge /
OCR-normalization split in the viewer:

- **`taxonomy.js` (the truth):** ~11 departments and ~60 canonical aisles,
  each `{ id, en, ar }`, every aisle belonging to exactly one department.
  Provider-agnostic — it never mentions D4D or any slug. This is Super
  Search's own supermarket vocabulary and changes maybe twice a year.
- **`mapping.js` (the bridges):** one small object per offers source,
  `{ d4d: { 'cheese-creame': 'cheese-cream', … } }`, covering that source's
  category slugs one-to-one (same "exactly one or leave it out" discipline as
  `CATEGORY_FAMILY`). An **unmapped provider category** lands in the visible
  `other` aisle ("More / المزيد") and is countable from ops — nothing breaks,
  nothing hides, and the fix is one mapping line whenever convenient. A new
  provider = a new object here, zero code.

Department sketch (canonical aisles grouped; the D4D mapping feeds them):

| Department (EN / AR) | D4D slugs (examples) |
|---|---|
| Fresh / الطازج | fresh-fruits, fresh-vegetables, fresh-chicken-poultry, meat-fresh-chilled, fresh-fish, deli-speaclity-meats |
| Dairy & Eggs / الألبان والبيض | milk-laban, yogurt-labneh, cheese-creame, butter-margarine, eggs, powdered-condensed-milk |
| Beverages / المشروبات | water, juices-drinks, soft-drinks, tea-coffee, malt-beverages, powdered-drinks-syrups |
| Pantry / البقالة | rice, pasta-noodles, oil-ghee, flour-baking, canned-packeted, sauces-spreads, salts-spices-paste, pulses-beans-grains, sugar-sweetener |
| Snacks & Sweets / الحلويات والتسالي | chocolates-candies, biscuits, snacks, cakes-pastry, dried-fruits-dates, cereals-bars, ice-ice-cream |
| Frozen / المجمدات | frozen-chicken-poultry, frozen-meat, frozen-fish, frozen-fruits-veg, other-frozen-food |
| Bakery / المخبوزات | bread-buns |
| Baby / الطفل | baby-care, baby-diapers |
| Beauty & Health / الجمال والصحة | skin-face-care, hair-care, bath-body, dental-care, fragrance, shaving-hair-removal, feminine-hygiene, health-care |
| Household / المنزل | laundry, cleaning, dishwasher, toilet-paper-tissue, facial-tissue, foils-cling, disposables, household-essentials |
| Home, Electronics & More / الأجهزة والمزيد | kitchen-appliance, small/large-appliances, tv, mobiles, tabs, computer-laptop, cookware, dining-serving, home-furnishing-decor, lighting, luggage, school-stationary, gifts-toys, clothing, footwear, accessories… |

An **unmapped slug** (D4D adds one) lands in a visible "More / المزيد"
bucket and increments an ops counter — nothing breaks, nothing hides, and
the fix is one line whenever convenient. This map changes maybe twice a year.

**KB #2 — Brand knowledge** (engine-side). The app ALREADY has a curated
brand knowledge base: `src/viewer/brandKnowledge.js` (~70 bilingual entries,
canonical names only) with a separate OCR-repair layer
(`viewer/brandNormalize.js`) — built for product-sheet display names. Browse
reuses this proven shape rather than inventing a second one: the engine gets
`browse/brands.js` holding the same knowledge/normalize split (entries gain a
`slug`), seeded from the viewer's list and grown toward ~150–250 major
Saudi + global FMCG brands. Its only job is bilingual identity — bridging
"Almarai" ↔ "المراعي" so one brand page unifies both scripts. It is NOT a
product catalog and never lists products, and it does NOT enter the
frontend/engine matching mirrors (rule 2 stays two-file). The engine copy is
the **canonical home** going forward; the viewer's display-repair module
stays as-is for now (different concern: repairing raw OCR for sheet titles),
with a follow-up option to have the viewer consume engine-tagged brands.

**KB #3 — the existing family/type lexicons** (reused verbatim as Shelf
definitions and card metadata). Zero new curation; they already grow via the
established "grow when a real query misses" rule.

Everything else is **derived state**, regenerated from the substrate.

**Extension points (Rev 2 — future knowledge modules, NOT built now):** every
knowledge module has the same shape — a small pure-data file plus a pure
classifier function, living under `browse/`, consumed at read time (or as a
nullable ingest-time column when aggregation needs an index). Packaging,
product attributes, and brand relationships slot in later as new modules of
that exact shape: a new file, possibly one nullable column, zero
architectural change. The rule for admitting one is unchanged — it must be
derivable from data the pipeline already produces, and its failure mode must
be "unclassified", never "wrong".

## 6. Derived knowledge: brand extraction + mining (the one new mechanism)

Runs inside the existing per-store ingest child, right after the offers
upsert, exactly like the price-history harvest: **D1-only, zero
subrequests**, idempotent, converges on re-ingest.

**Step 1 — Lexicon tagging (precision path).** For each offer, scan the
derived display names (`name`, `name_ar`) for a whole-word match against KB
#2 variants (normalized via the existing `normalizeText`). Hit → set
`offers.brand_slug`. Brand names are proper nouns, so whole-word matching
anywhere in the name is safe ("جبنة المراعي" and "Almarai Cheese" both tag).

**Step 2 — Mining (recall path, English names v1).** Weekly, per store
child or in the coordinator: candidate = the **leading token** of `name`
(retail English names lead with the brand) that is NOT in any existing
lexicon (families, types, produce, banner words, processed markers, units,
generic stoplist), not numeric, length ≥ 3. Aggregate candidates over the
trailing 8 weeks: a candidate seen on **≥4 distinct products** across **≥2
distinct stores** becomes an `observed`-tier brand row. Below threshold =
ignored. This is the self-enrichment loop: a new brand that starts appearing
in Saudi flyers surfaces in Browse automatically within a week or two, with
no code change and no curation.

**Step 3 — the `brands` derived table** (regenerated, never hand-edited):
`{ slug, name_en, name_ar, tier(canonical|observed), offers_current,
stores_current, families (top N json), first_seen, last_seen }`. Counters
refresh on each ingest; a brand with zero live offers stays in the table
(its price history remains browsable) but drops out of default brand
listings.

**Guardrails (rule: unclassified beats wrong):**
- Arabic-led names are tagged by lexicon only in v1 — Arabic brand mining
  (prefix-attached ب/ال, OCR variance) is deferred until the English-mined
  brand list can seed transliteration candidates.
- Mined brands render exactly as OCR'd (e.g. "Geepas") until/unless promoted
  to the lexicon with an Arabic name — promotion is optional polish, never
  required maintenance.
- A mined token that later collides with a lexicon addition defers to the
  lexicon (canonical tier wins).
- `brand_slug` is nullable forever; ~13% of offers are nameless and many
  named ones are generic ("Fresh Chicken 1kg") — they simply have no brand
  edge, and every other edge still works.

**Product-identity badge join.** The price-history harvest already derives
an identity per offer at ingest; persist it (`offers.identity`) so Browse
cards can join `price_history` cheaply for badges: *lowest ever*, *↓X% vs
was*, *weeks seen*, *back on offer*. No new computation — just keeping a key
the harvest already has in hand.

Schema delta (for scale, not implementation now): `offers` + `brand_slug`,
`identity` (nullable TEXT, backfillable via the existing
`/prices/backfill`-style guarded route); new `brands` table; two indexes
(`ix_offers_brand`, `ix_offers_category`).

## 7. API design (engine, read-only, D1 + Cache API)

Two endpoints, mirroring the existing read style (`/offers?q=`):

**`GET /browse`** — the one-shot home payload, cacheable ~6h (substrate
changes 3×/week):
```
{ asOf, disclaimer,
  departments: [ { id, nameEn, nameAr, liveOffers, topAisles:[…] } ],
  brands:      { total, top: [ { slug, nameEn, nameAr, liveOffers, stores } ] },
  rails:       [ { id, titleEn, titleAr, items: [OfferCard ×12] } ] }
```

**`GET /browse/offers?dept=|aisle=|shelf=|brand=|store=|rail=&sort=&limit=&offset=`**
— the universal listing behind every node page. All ids are CANONICAL
(provider slugs never appear on the API). Filters compose (brand+shelf =
"Herfy → Frozen"); `rail=` reproduces any home rail in full ("see all").
Sorts: `discount` (default: old_price−price %), `price`, `newest`
(detected_at), `ending` (valid_to). Returns `OfferCard`s:
```
{ …rowToOffer projection…, brand:{slug,nameEn,nameAr}?, family?,
  badges:{ drop_pct?, lowest_ever?, weeks_seen?, ends_in_days?,
           store_count? , new_this_week? } }
```

**Brand page = `GET /browse/brand/<slug>`** (or brands detail folded into
`/browse/offers?brand=` + a `meta` block): brand header, families spanned
(the Herfy multi-family case is just `GROUP BY family`), per-store best
deal, price-history highlights (identities of this brand at all-time-low).

Everything is derivable in single-digit D1 queries over ≤8k live rows with
the two new indexes. The frontend consumes these exclusively through
`src/brochure.js` (rule 7), best-effort as always — engine down means Browse
shows its cached-or-empty state and Search is unaffected.

### 7.5 Exceptional Deals — the flagship rail (Rev 2)

Answers *"what are the most exceptional supermarket offers right now?"* —
and must earn daily-routine trust, so it never ranks by advertised discount
alone and every qualifying deal SHOWS its reasons as badges. The score is a
transparent sum of independent, data-backed signals, computed per current
offer (identity join gives the history side):

| Signal | Test | Points | Badge |
|---|---|---|---|
| **Lowest ever** | price ≤ min(price_history) with `weeks_seen ≥ 4` | +50 | "أدنى سعر مسجل · Lowest in N weeks" |
| **Deep cut** | advertised drop ≥ 40% (real strike price) | +30 | "−45%" |
| **Big cut** | advertised drop ≥ 25% | +15 | "−30%" |
| **Rarely on offer** | product known ≥ 8 weeks and on offer ≤ 25% of them | +20 | "نادراً ما يُخفض · Rarely discounted" |
| **Multi-buy** | name carries a real multi-buy marker (1+1, "مجانا", "free") | +10 | "1+1" |
| **Return low** | back at its historical low after ≥ 4 weeks away | +15 | "عاد لأدنى سعر" |

An offer **qualifies at score ≥ 50** — i.e. a verified lowest-ever, or a deep
advertised cut with corroboration (rarity / multi-buy / return), never a
lone marketing claim. Ranked by score, ties by drop depth. The formula lives
in ONE pure, unit-tested module (`browse/deals.js`) and this table is its
documentation — adjusting a weight is a one-line change with tests.

Honesty guarantees: the advertised drop contributes at most 30 points (it is
D4D-extracted marketing data), history-backed signals dominate; depth is
always stated on the badge; every card keeps the flyer deep-link + the
machine-extraction disclaimer. With ~8k live offers this typically surfaces
a few dozen genuinely exceptional deals — a finite, checkable daily list,
not an infinite feed.

**Rails catalogue** (each shows its honesty line):

| Rail | Formula | Why it's honest |
|---|---|---|
| **Exceptional Deals** | §7.5 score ≥ 50, top N | every badge is a verifiable signal; history-backed signals outweigh advertised ones |
| Biggest drops | max (old_price−price)/old_price, old_price required | 93% of offers carry a real strike price; sanity gate already enforces old>new |
| Lowest ever | current price = min(price_history) AND weeks_seen ≥ 4 | depth stated on the badge ("lowest in 14 weeks") |
| Ending soon | valid_to within 48h | real dates from JSON-LD, no fake urgency |
| New this week | identity first_seen = this ISO week | new-to-the-MARKET, labeled as such |
| In many stores | same shelf+brand+size live in ≥3 stores | breadth = market-wide promotion, replaces fake "popular" |
| Back on offer | identity reappeared after ≥4 weeks absence | pure derivation |
| In season now | aisle's share of live offers ≥ 2× its own 8-week average | stores merchandise the season for us; no calendar KB |
| For you (client-side) | user's cart/watch/recent-search terms matched against live offers with the existing frontend matcher | private, localStorage-only, zero backend |

### 7.6 Collections (Rev 2 — lightweight, optional)

A collection is a **named, declarative saved view** over canonical knowledge
— not a category, not a brand, no per-product curation ever:

```
{ id: 'coffee-lovers', en: 'Coffee Lovers', ar: 'لعشاق القهوة',
  filter: { aisles: ['tea-coffee'], families: ['coffee'] },
  window: null }                     // always-on
{ id: 'ramadan', en: 'Ramadan', ar: 'رمضان',
  filter: { aisles: ['dates-dried-fruits', 'juices-drinks', …] },
  window: { calendar: 'islamic', month: 8..9 } }   // auto via Intl, no manual dates
```

Rendering one is just `/browse/offers` with the collection's filter; a
seasonal `window` (computed from `Intl` calendars — no manually maintained
date table) decides whether its tile shows at all. The data-driven "In
season now" rail stays the primary seasonal signal (the stores merchandise
the season for us); explicit collections are optional editorial sugar on
top. Ships in Phase 3; adding one later is data, not code.

## 8. UX design (mobile-first, bilingual)

**Navigation:** Browse becomes a first-class tab (`#/browse`) beside Search,
Brochures, Alerts, Cart. Sub-routes: `#/browse/dept/<id>`,
`#/browse/aisle/<slug>`, `#/browse/shelf/<family>`, `#/browse/brand/<slug>`,
`#/browse/rail/<id>`, `#/browse/store/<id>`. Hash-router, no build step,
same as today.

**Browse home ("the market floor"):**
1. Header: "سوق هذا الأسبوع · This week's market — 8,032 offers · 18 stores"
   (live numbers = trust + freshness).
2. **Exceptional Deals** — the flagship rail, first thing under the header
   (the daily-routine hook: "what's genuinely worth it today").
3. **Department tiles** (11, two rows, icon + live count) and a **Brands
   tile row** (top brands by live-offer count + "All brands A–Z / أ–ي") —
   rendered as PEERS at the same visual level. This is the brief's
   "Departments or Brands, both equally visible", literally.
4. Rails, one horizontal scroller each (Biggest drops, Lowest ever, Ending
   soon, In season now, For you, New this week…). Streaming-platform idiom:
   rails give deal-first serendipity without an infinite feed — this is a
   decision tool, not a dopamine feed; every rail is finite with "see all".

**Department page:** aisle chip bar (sticky) + shelf refinements where
families exist; the same card grid; store filter chip; sort control
(discount default). **Shelf page** ("Cheese"): brand facet chips derived
from the live result set (tap Kiri → brand+shelf intersection).

**Brand page:** identity header (bilingual name, live counts), families
spanned as chips (Herfy → Frozen · Bakery · Sauces…), best-deal-per-store
strip, current offers grid, price-history highlights, and an explicit
**bridge to Search** ("search Kiri across online stores →" — one tap into
the existing Search with the query prefilled). Browse and Search stay
independent; a link is not a dependency.

**Card & sheet (pure reuse — Rev 2, corrected against the current code):**
Browse cards are the marketplace's flyer-card idiom (crop image, store
badge, price + was-price) with Browse badges added (↓34%, أدنى سعر, ends
Fri); the card builders (`cardImage`/`priceRow`/`storeBadge`) are exported
from `marketplace.js` and shared, never reimplemented. Tapping a card does
EXACTLY what a search flyer card already does: `brochureForOffer(offer)` →
`openBrochureViewer(b, label, { targetPageId, targetOfferId })` — the viewer
lands on the offer's page, flies to its hotspot, pulses it, and opens the
existing product sheet (crop hero, price + disclaimer, Add to Cart, similar
offers, watch, full-comparison hand-off). This machinery shipped with viewer
v2 and needs NO changes — Browse only adds callers. When the edition isn't
held, the card falls back to the offer's flyer deep-link, same as search.

**Bilingual:** every node carries en/ar names (departments/rails from
config, brands from lexicon/OCR, deals from derived names). RTL-aware rails.
Arabic-first labels, matching the current UI.

## 9. Scalability & budgets (the math)

- **Ingest cost:** brand tagging + counters ≈ a few D1 statements per store
  child — the same shape as the price harvest, **0 subrequests, 0 KV
  writes**. Untouched: the 50-subrequest child budget, the 1,000/day KV
  write budget, the 32-invocation event budget.
- **Read cost:** `/browse` is one cached payload; listing queries scan ≤8k
  live rows via indexes. D1 free tier (5M reads/day) is orders of magnitude
  above a single-user app.
- **Growth:** offers are retention-pruned at ~180 days (bounded);
  `brands` grows with distinct real brands (~hundreds, self-bounding);
  identities already prune at 365 days. Adding store #19 = existing provider
  config line → its offers, brands, aisles, rails enrich automatically.
  Multi-region later: every table is already keyed store+region; Browse
  filters gain a region parameter and nothing else changes.
- **Upstream risk:** Browse adds no new upstream dependency — it consumes
  only what the offers ingest already fetches. A D4D category-slug rename
  degrades to "More" visibly; a D4D outage leaves Browse serving the last
  ingest (stale, not broken) — same failure envelope as today.

## 10. Shopping-intelligence roadmap (all derivable, no new sources)

1. **Deal-quality transparency** (v1, ships with rails): every discount
   badge is verifiable — drop % from the flyer's own strike price,
   lowest-ever from our observed series with depth stated.
2. **Brand insights** (v2): per brand — average discount depth, which store
   promotes it most, price trend of its staple identities. Pure SQL.
3. **Weekly "worth it" digest** (v2): intersection rail (lowest-ever ∩ big
   drop ∩ multi-store) — the five deals objectively worth a trip. Could feed
   the existing ntfy push as an opt-in weekly notification.
4. **Cart intelligence** (v3): "your cart at Danube totals X; two items are
   cheaper at Othaim this week" — cart already stores per-store items;
   identities + live offers make the swap suggestion computable client-side.
5. **Future AI (explicitly optional, interface-ready, $0-compatible):** the
   design isolates enrichment behind data, not code — an LLM (or a better
   heuristic) could later (a) clean OCR display names, (b) mine Arabic
   brands, (c) map new D4D slugs, by writing the same columns/tables with a
   `confidence` tier. Browser-side models (WebGPU) or a free-tier batch
   could slot in without touching the architecture. Nothing ships depending
   on it.

## 11. Rollout phases (each independently shippable & verifiable)

| Phase | Scope | New risk |
|---|---|---|
| **1 — Market floor (engine)** | Canonical taxonomy + D4D mapping (KB #1), `offers.identity` column (migration + ingest write + backfill), Exceptional Deals scorer (`browse/deals.js`, tested), `/browse` + `/browse/offers` (canonical filters, sorts, rails: exceptional/drops/lowest-ever/ending/new). | Ingest write-path gains one derived column (same pattern as price harvest) |
| **2 — Market floor (frontend)** | Browse tab + routes, market floor (Exceptional Deals rail, department + brand-placeholder tiles, rails), listing pages with sort/store chips, cards + tap-through via exported marketplace primitives, i18n strings EN/AR. | Pure additive UI; engine reads best-effort as always |
| **3 — Brands** | Engine `browse/brands.js` (knowledge + normalize, seeded from the viewer's list), `brand_slug` tagging at ingest + backfill, mining (observed tier), `brands` in `/browse`, brand pages + facets. | Second derived column; mining thresholds are conservative |
| **4 — Intelligence & collections** | Shelf refinements, For-you rail, In-season rail, collections, brand insights, worth-it digest, cart intelligence. | Client-side mostly |

Each phase compiles, tests, and ships independently; Phases 1+2 already
deliver the brief's core: open Browse, see the whole market, no typing.

## 12. Resolved / open questions

1. **Non-grocery depth:** included as one "Home, Electronics & More"
   department (it's real flyer content; hiding it would misrepresent the
   market). Trivially demotable later — it's one taxonomy entry.
2. **Brand seeding:** resolved — the viewer's existing curated
   `brandKnowledge.js` (~70 entries) is the seed; mining adds observed-tier
   brands automatically. No approval pass needed.
3. **Push digest** (§10.3) — still open; Browse ships fully pull-based and
   the digest can reuse the existing ntfy plumbing whenever wanted.
