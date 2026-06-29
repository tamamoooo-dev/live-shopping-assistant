# Panda Live Search

A tiny personal shopping assistant that searches the **live Panda Saudi**
website every time and shows the current product image, name, price, previous
price (when on offer) and a link.

No accounts, no ads, no settings, no cached prices. Every search hits Panda live.

It is a **pure static website**: the browser talks directly to Panda's public
API. There is **no backend, no build step, and nothing to run on a server** —
just static files (`index.html`, `styles.css`, and the ES modules in `src/`).

## Deploy (static HTTPS host)

The app is served as-is. Host the folder on any static HTTPS host. The code uses
ES modules with relative paths, so it works at a domain root **or** a project
subpath (e.g. `https://you.github.io/panda-live-search/`). `.nojekyll` is
included so GitHub Pages serves the `src/` folder untouched.

### GitHub Pages

```bash
# from inside this folder (a git repo is already initialised)
git remote add origin https://github.com/<you>/panda-live-search.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: "Deploy from
a branch" → Branch: `main` / `/ (root)` → Save.** Your site goes live at
`https://<you>.github.io/panda-live-search/`.

### Netlify / Cloudflare Pages

Either drag-and-drop this folder onto **app.netlify.com/drop**, or connect the
repo in Cloudflare Pages with an **empty build command** and the project folder
as the output directory. No framework preset, no build.

## Optional: run it locally

You only need this for local development. Browsers won't load ES modules from a
`file://` page, so use the tiny included static server:

```bash
node server.js   # -> http://localhost:5173
```

To open it on your phone during development, visit
`http://<your-computer-ip>:5173` from the same Wi-Fi.

## How it works

```
Core  →  Panda Provider  →  Search Strategies  →  Normalized Result
```

- **Core** (`src/core.js`) — knows nothing about Panda. It tries a provider's
  search strategies until one returns results, remembers which one worked
  (in `localStorage`), tries it first next time, and forgets it if it ever
  stops working so a new one is rediscovered automatically.
- **Panda Provider** (`src/providers/panda.js`) — the only Panda-specific code:
  the API host, headers, response parsing, and links.
- **Search Strategies** — Panda is tried via two public methods:
  1. `products-v3` — the rich products endpoint (prices + images). _Primary._
  2. `suggestions-v3` — search suggestions (names + links). _Fallback._
- **Normalized Result** — every strategy returns the same shape:
  `{ id, name, image, price, oldPrice, currency, link, size, brand, discountLabel }`.

## Adding another store later

Create `src/providers/<store>.js` that exports a provider with the same shape
(`{ id, label, strategies }`), then register it in `src/app.js`. The Core does
not change.

## Notes

- Search language follows your input: Arabic text searches the Arabic catalogue,
  otherwise English.
- This is a personal tool that reads Panda's own public website endpoints. It is
  not affiliated with Panda. Be considerate — it's for your own everyday use.
