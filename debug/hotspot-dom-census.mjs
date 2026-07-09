// debug/hotspot-dom-census.mjs — drives the REAL shipped viewer.js in a real
// browser (Chromium/Playwright) against the LIVE production engine and reports
// the ACTUAL .bv-spot DOM element count for Al Madina page 6. NOT shipped.
//
// This is the literal-DOM confirmation of debug/hotspot-stage-census.mjs:
//   stage 1 (API)         = the /brochures/hotspots response body (intercepted)
//   stage 2 (received)    = spots after loadHotspots shaping (from the same body)
//   stage 3 (DOM created) = document.querySelectorAll('.bv-spot').length on page 6
//   stage 4 (interactive) = those .bv-spot that are <button type=button> (each
//                           gets a click listener in renderSpots, viewer.js:291)
//
// Usage (needs egress -> CI):  node debug/hotspot-dom-census.mjs [--page 6]

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const store = opt('store', 'almadina');
const region = opt('region', 'central');
const page6 = Number(opt('page', '6'));
const PORT = 5199;

function startServer() {
  const p = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
  return p;
}

async function main() {
  const server = startServer();
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Intercept the API responses (stage 1) exactly as the browser receives them.
  const apiByBrochure = new Map();
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('/brochures/hotspots')) {
      try {
        const j = await res.json();
        const id = new URL(u).searchParams.get('id');
        apiByBrochure.set(id, j);
      } catch { /* ignore */ }
    }
  });

  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser error]', m.text()); });

  await page.goto(`http://localhost:${PORT}/debug/viewer-harness.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', { timeout: 15000 });

  const dom = await page.evaluate(async ({ store, region, page6 }) => window.__probeHotspots(store, region, page6),
    { store, region, page6 });

  console.log(`\n=== literal-DOM hotspot census (page ${page6}) — real viewer.js in Chromium ===`);
  for (const d of dom) {
    const api = apiByBrochure.get(d.id) || {};
    const apiPage = (api.pages || []).find((p) => p.index === page6 - 1);
    const apiSpots = apiPage ? (apiPage.spots?.length || 0) : 0;
    const offerKeys = new Set(Object.keys(api.offers || {}));
    const withOffer = apiPage ? (apiPage.spots || []).filter((s) => offerKeys.has(String(s.offerId))).length : 0;
    console.log(`\n--- ${d.id}  ("${d.title}")  viewer showed page: ${d.onPage}`);
    console.log(`  stage 1 (API returned page ${page6}):   ${apiSpots} spots, ${offerKeys.size} offers in map, ${withOffer} spots with a matching offer`);
    console.log(`  stage 3 (DOM .bv-spot on page ${page6}):  ${d.domSpotCount}`);
    console.log(`  stage 4 (interactive buttons):           ${d.interactiveCount}`);
    if (apiSpots > 3 && d.domSpotCount < apiSpots) {
      console.log(`  >>> ${apiSpots - d.domSpotCount} of ${apiSpots} spots produced NO DOM element -> dropped at viewer.js:279 ('if (!offer) continue;').`);
    }
  }

  await browser.close();
  server.kill();
}

main().catch((e) => { console.error(`dom census failed: ${e.message}`); console.error(e.stack); process.exit(1); });
