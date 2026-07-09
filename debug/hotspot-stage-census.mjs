// debug/hotspot-stage-census.mjs — measures the hotspot runtime path against
// the LIVE PRODUCTION engine, stage by stage, for Al Madina page 6. NOT shipped.
//
//   D1/KV --GET /brochures/hotspots--> [1 API] --loadHotspots--> [2 viewer.js]
//     --renderSpots--> [3 DOM buttons] --(click listener)--> [4 interactive]
//
// This reads the ACTUAL production response the viewer receives, then applies
// the EXACT transforms the frontend applies, citing the shipped lines:
//
//   stage 2 (received):   brochure.js loadHotspots() keeps every page's spots
//                         and the whole offers map, unfiltered (brochure.js:281-282)
//   stage 3 (DOM):        viewer.js renderSpots() creates ONE <button.bv-spot>
//                         per spot, but ONLY when hotspots.offers[s.offerId]
//                         exists — `if (!offer) continue;` (viewer.js:279)
//   stage 4 (interactive): each created button gets a click listener
//                         unconditionally (viewer.js:291) -> stage 4 == stage 3
//
// So the ONLY place a count can drop is viewer.js:279, gated by offer coverage
// of the API payload. This harness reports each stage's exact number and, if
// page 6's API spot count is already low, says so and stops (the loss is then
// upstream in the stored state, not the viewer).
//
// Usage (needs egress to the production worker -> run in CI):
//   node debug/hotspot-stage-census.mjs [--store almadina] [--region central] [--page 6]

const ENGINE_BASE = 'https://brochure-engine.tamamoooo.workers.dev';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] != null ? args[i + 1] : d; };
const store = opt('store', 'almadina');
const region = opt('region', 'central');
const detailPage = Number(opt('page', '6')); // 1-based

async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

// Faithful reproduction of brochure.js loadHotspots() shaping (brochure.js:281-282).
function shapeLikeViewer(apiDoc) {
  const spotsByIndex = new Map((apiDoc.pages || []).map((p) => [p.index, p.spots || []]));
  return { spotsByIndex, offers: apiDoc.offers || {} };
}

// Faithful reproduction of viewer.js renderSpots() DOM creation (viewer.js:277-292):
//   for (const s of spots) { const offer = hotspots.offers[s.offerId];
//                            if (!offer) continue;   // <-- the gate
//                            ...spotLayer.appendChild(btn); }
// Returns { received, domCreated, interactive, orphans } for one page's spots.
function renderSpotsCount(shaped, pageIndex) {
  const spots = shaped.spotsByIndex.get(pageIndex) || [];
  let domCreated = 0;
  const orphans = [];
  for (const s of spots) {
    const offer = shaped.offers[s.offerId];
    if (!offer) { orphans.push(s.offerId); continue; } // viewer.js:279
    domCreated += 1; // viewer.js:280-292 (button built + appended)
  }
  // Every created button gets its click listener unconditionally (viewer.js:291),
  // so interactivity == DOM creation.
  return { received: spots.length, domCreated, interactive: domCreated, orphans };
}

async function main() {
  console.log(`engine: ${ENGINE_BASE}`);
  // The viewer gets its brochure object from /brochures (brochure.js loadBrochures).
  const list = await getJson(`${ENGINE_BASE}/brochures?store=${store}&region=${region}`);
  const brochures = (list.brochures || []).filter((b) => b.sourceType === 'images');
  console.log(`held images brochures for ${store}/${region}: ${brochures.length}`);
  if (!brochures.length) { console.log('no image brochures held — nothing to trace'); return; }

  for (const b of brochures) {
    // stage 1: the exact API response the viewer receives (loadHotspots fetch).
    const api = await getJson(`${ENGINE_BASE}/brochures/hotspots?id=${encodeURIComponent(b.id)}`);
    const apiPages = api.pages || [];
    const apiOffers = api.offers || {};
    const apiTotalSpots = apiPages.reduce((n, p) => n + (p.spots?.length || 0), 0);
    const shaped = shapeLikeViewer(api); // stage 2

    console.log(`\n=== ${b.id}`);
    console.log(`    title="${b.title}"  edition=${b.edition}`);
    console.log(`    [stage 1 API] pages=${apiPages.length} · total spots=${apiTotalSpots} · offers in map=${Object.keys(apiOffers).length} · flyerRef=${api.flyerRef}`);
    console.log(`    [stage 2 viewer.js] spotsByIndex pages=${shaped.spotsByIndex.size} · offers=${Object.keys(shaped.offers).length}  (loadHotspots passes all through — brochure.js:281-282)`);

    console.log('\n  page(1-based) idx | 1:API 2:recv 3:DOM 4:interactive | orphans (spot offerIds with NO offer)');
    console.log('  ------------------------------------------------------------------------------------------');
    let tot = { api: 0, dom: 0 };
    for (const p of apiPages) {
      const c = renderSpotsCount(shaped, p.index);
      tot.api += c.received; tot.dom += c.domCreated;
      const marker = p.index === detailPage - 1 ? ` <== page ${detailPage}` : '';
      const orphStr = c.orphans.length ? `${c.orphans.length} (${c.orphans.slice(0, 6).join(',')}${c.orphans.length > 6 ? '…' : ''})` : '';
      console.log(`  ${String(p.index + 1).padStart(6)}       ${String(p.index).padStart(3)} | ${String(c.received).padStart(5)} ${String(c.received).padStart(5)} ${String(c.domCreated).padStart(5)} ${String(c.interactive).padStart(12)} | ${orphStr}${marker}`);
    }
    console.log('  ------------------------------------------------------------------------------------------');
    console.log(`  TOTAL             | ${String(tot.api).padStart(5)} ${String(tot.api).padStart(5)} ${String(tot.dom).padStart(5)} ${String(tot.dom).padStart(12)} |`);

    // page-6 verdict
    const pg = apiPages.find((p) => p.index === detailPage - 1);
    console.log(`\n  --- PAGE ${detailPage} verdict ---`);
    if (!pg) { console.log(`  page ${detailPage} not present in this brochure.`); continue; }
    const c = renderSpotsCount(shaped, pg.index);
    console.log(`  stage 1 (API returned):        ${c.received}`);
    console.log(`  stage 2 (viewer.js received):  ${c.received}`);
    console.log(`  stage 3 (DOM buttons created):  ${c.domCreated}`);
    console.log(`  stage 4 (interactive):          ${c.interactive}`);
    if (c.received <= 3) {
      console.log(`  >>> The API ALREADY returns only ${c.received} spots for page ${detailPage}.`);
      console.log(`  >>> The loss is UPSTREAM in the stored state (KV hotspots.json / D1 offers), NOT the viewer.`);
    } else if (c.domCreated < c.received) {
      console.log(`  >>> The API returned ${c.received} spots but only ${c.domCreated} have a matching offer.`);
      console.log(`  >>> ${c.received - c.domCreated} spots are dropped at viewer.js:279 ('if (!offer) continue;') — rendered as NOTHING, never interactive.`);
      console.log(`  >>> The missing offers are the ${c.orphans.length} orphan offerIds above: the stored OFFERS (D1) are stale/partial vs the stored hotspots.json.`);
    } else {
      console.log(`  >>> All ${c.received} spots have offers -> all ${c.domCreated} become interactive. Page ${detailPage} is healthy in production.`);
    }
  }
}

main().catch((e) => { console.error(`stage census failed: ${e.message}`); process.exit(1); });
