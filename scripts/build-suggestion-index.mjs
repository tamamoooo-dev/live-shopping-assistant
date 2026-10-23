// Derive the small autocomplete projection from the same reviewed archive.
// Run after replacing data/brochure-knowledge.json.gz. No external catalog.
import fs from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const base = new URL('../data/', import.meta.url);
const source = fs.readFileSync(new URL('brochure-knowledge.json.gz', base));
const graph = JSON.parse(gunzipSync(source));
const products = graph.products.filter(p => p.category && p.vision !== 0
  && !p.classificationReviewRequired && p.category !== 'category:review-required').map(p => ({
  brand:p.brand, category:p.category, variants:p.variants || [], size:p.size,
  assortment:!!p.assortment, observations:p.observations, trusted:p.trusted,
  stores:p.stores || [], examples:[],
}));
const used = new Set(products.flatMap(p => [p.brand,p.category,...p.variants,p.size]));
for (const e of graph.entities) if (used.has(e.id) && e.family) used.add(`category:${e.family}`);
const entities = graph.entities.filter(e => used.has(e.id));
const projection = {version:graph.version, exportedAt:graph.exportedAt,
  sourceSha256:createHash('sha256').update(source).digest('hex'), entities, products};
const packed = gzipSync(JSON.stringify(projection));
fs.writeFileSync(new URL('brochure-suggestions.json.gz', base), packed);
console.log(JSON.stringify({products:products.length, entities:entities.length, bytes:packed.length}));
