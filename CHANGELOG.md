# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## Since 1.0.0 — continuous delivery (2026-07 → 2026-10)

After 1.0.0 the project stopped cutting releases: every push to `main` deploys.
[HISTORY.md](HISTORY.md) records each milestone in full. In brief:

- **July 2026.** Flyer offers from D4D and the brochure engine:
  - tappable brochures, price history, price watches;
  - Browse;
  - Journey Coherence (one shared gate ladder);
  - packaging and size-aware search;
  - the Featured ranking (Lowest-price ordering locked);
  - local profiles;
  - Vision reading of every flyer crop, with the Product Registry.

  HISTORY sections up to §49.
- **August 2026.** Comparable Quantity v4 (one denominator for every unit
  price), flyer Zoom, Noon's TanStack payload, and the per-item "each" price.
  HISTORY §50–§53.
- **September 2026.**
  - Unpriced D4D products made tappable and priced by Vision;
  - one model (`ministral-14b-2512`) and one key pool;
  - Workers Paid throughput;
  - Grand Hyper replaced by Mkhazin;
  - the local OCR track measured and parked.

  HISTORY §54–§55.
- **October 2026.**
  - Production committed, plus a deploy script that names its commit;
  - watches fixed;
  - Vision read in parallel lanes;
  - CI in both repos, with matcher-mirror golden vectors;
  - a daily health digest;
  - a weekly D1 export to R2.

  HISTORY §56.

## [1.0.0] — 2026-06-30

First frozen release. A pure static, single-store live shopping assistant for
Panda Saudi. The browser talks directly to Panda's public API — no backend, no
build step, no cached prices.

### Added
- **Live search** against Panda Saudi. Every search hits the live site; prices
  are never cached.
- **Results** show product image, name, current price, previous price (when on
  offer), discount label, brand, size, and a link to the product page.
- **Arabic and English** search. Input language is auto-detected; Arabic input
  searches the Arabic catalogue and links to the Arabic product page.
- **Modular architecture** — `Core → Panda Provider → Search Strategies →
  Normalized Result`. The Core contains no Panda-specific logic.
- **Adaptive search.** The Panda provider exposes two public methods; the Core
  tries them in order, remembers the one that worked (in `localStorage`), tries
  it first next time, and automatically rediscovers another if it stops working:
  - `products-v3` — the rich products endpoint (prices + images). Primary.
  - `suggestions-v3` — search suggestions (names + links). Fallback.
- **Mobile-first UI** — search box, button, loading indicator, results list.
  16px inputs to avoid iOS Safari zoom; safe-area insets; RTL product names.
  No login, accounts, ads, or settings.
- **Static-host ready** — ES modules with relative paths (works at a domain
  root or a project subpath), `.nojekyll` for GitHub Pages, all subresources
  over HTTPS (no mixed content). Verified on a static host: live search returns
  results with the browser calling Panda directly and no backend in the loop.
- **Optional local dev server** (`server.js`) — zero-dependency static file
  server for working on the app locally.
- **Docs** — README with deployment instructions (GitHub Pages, Netlify,
  Cloudflare Pages), LICENSE (MIT), and this changelog.

### Notes
- Single store only (Panda Saudi) by design. The provider interface is built so
  another store can be added later as a sibling file without changing the Core.
- This is a personal tool that reads Panda's own public website endpoints. It is
  not affiliated with Panda.

[1.0.0]: https://github.com/your-username/panda-live-search/releases/tag/v1.0.0
