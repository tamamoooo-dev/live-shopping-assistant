# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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
