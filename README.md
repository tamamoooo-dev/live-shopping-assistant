# Super Search

A personal Saudi shopping assistant for one user. Type a product in Arabic or
English and get, in one ranked grid:
- live prices from 7 online stores;
- this week's flyer offers from ~18 physical stores.

Around that grid it also offers:
- a comparison summary;
- price history;
- a Browse view of this week's market;
- tappable weekly brochures;
- a local cart;
- price watches that push to your phone.

Live at **https://tamamoooo-dev.github.io/live-shopping-assistant/** · License:
[MIT](LICENSE) · [Changelog](CHANGELOG.md)

This repo started as "Panda Live Search" (v1.0.0, 2026-06-30). The repos,
Workers and internal ids keep the old names.

## Read these first

| Document | What it holds |
|---|---|
| [HANDOFF.md](HANDOFF.md) | **Current state and the hard rules.** Start here: system map, crons, budgets, deploy, open decisions. |
| [HISTORY.md](HISTORY.md) | Every milestone's story: what, why, how it was verified. |
| [BROWSE-DESIGN.md](BROWSE-DESIGN.md) | The Browse pillar's design. |
| [docs/FEASIBILITY-VALIDATION.md](docs/FEASIBILITY-VALIDATION.md) | The measured authority for which stores can be integrated, or kept. |
| [docs/EXPANSION-ROADMAP.md](docs/EXPANSION-ROADMAP.md) | The July 12-month expansion strategy. |

## How it fits together

```
Browser: this repo (GitHub Pages, ES modules, no build step)
  ├─► shopping-connector Worker   stateless live store search
  └─► brochure-engine Worker      D1 + R2 + KV + Queues: flyers, offers,
                                  Vision reads (Mistral), price history,
                                  watches, /__ops console
```

Both Workers live in
[tamamoooo-dev/shopping-connector](https://github.com/tamamoooo-dev/shopping-connector).

## Develop

```bash
node server.js
```

The server listens on http://localhost:5173. Browsers will not load ES modules
from `file://`.

Run the tests (CI runs the same loop on every push):

```bash
for f in $(find src -name '*.test.mjs' | sort); do node "$f"; done
```

`src/match.js` mirrors the engine's `matching.js`. Both repos test their own
copy against the same `src/matcherParity.vectors.json`; HANDOFF §9 explains
how to regenerate it after a deliberate change to both.

## Deploy

Push to `main`. GitHub Pages serves it within a couple of minutes. The CDN
caches for 10 minutes, so spot-check with a cache-buster. All asset paths are
relative, because Pages serves from the `/live-shopping-assistant/` subpath.

This is a personal tool that reads stores' own public endpoints and D4D's
flyer data. It is not affiliated with any of them.
