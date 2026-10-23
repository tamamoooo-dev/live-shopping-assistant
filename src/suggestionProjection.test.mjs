import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createBrochureKnowledge } from './brochureKnowledge.js';
const source = fs.readFileSync(new URL('../data/brochure-knowledge.json.gz', import.meta.url));
const packed = fs.readFileSync(new URL('../data/brochure-suggestions.json.gz', import.meta.url));
const projection = JSON.parse(gunzipSync(packed));
assert.equal(projection.sourceSha256,createHash('sha256').update(source).digest('hex'),
  'Regenerate the suggestion projection whenever the archive changes');
assert(packed.length < source.length / 4,'Autocomplete must not download the full inspection archive');
const full = createBrochureKnowledge(JSON.parse(gunzipSync(source)));
const small = createBrochureKnowledge(projection);
const values = (index,query) => index.suggest(query).map(s=>s.value);
for (const query of ['ح','حلي','حليب','حليب نادك','حليب نادك كامل الدسم','شاي','شاي ربيع',
  'حمص','milk','Nadec milk','Nadec milk full fat','tea','Al Sa']) {
  assert.deepEqual(values(small,query),values(full,query),`The small projection preserves canonical facets: ${query}`);
}
assert.equal(new Set(values(small,'حلي')).size,values(small,'حلي').length,'Deduplicate bilingual aliases and observed brands');
assert(values(small,'حليب').includes('حليب نادك'),'Incidental unnormalized brand tokens cannot block the brand stage');
console.log('Archive-derived autocomplete projection: source hash, size budget, first-letter, brand, variant and pack parity passed.');
