import assert from 'node:assert/strict';
import { createBrochureKnowledge } from './brochureKnowledge.js';

const e = (kind, id, en, ar, extra = {}) => ({ id: `${kind}:${id}`, kind, en, ar, aliases: [en, ar], ...extra });
const entities = [e('brand','nadec','Nadec','نادك'), e('brand','other','Other','اخرى'),
  e('category','milk','milk','حليب',{family:'milk'}), e('category','cheese','cheese','جبن',{family:'cheese'}),
  e('variant','full-fat','full fat','كامل الدسم'), e('variant','low-fat','low fat','قليل الدسم'),
  e('size','200','200 ml','200 مل'), e('size','pack','18 x 200 ml','18 × 200 مل'),
  e('size','185','185 ml','185 مل')];
const row = (category, variants, size, extra = {}) => ({ brand:'brand:nadec', category:`category:${category}`,
  variants:variants.map(v=>`variant:${v}`), size:`size:${size}`, name:'Nadec', nameAr:'نادك',
  observations:3, trusted:0, productIds:[], stores:['tamimi'], examples:[{offerId:'tamimi:central:d4d:1'}], ...extra });
const graph = { version:'brochure-knowledge-v1', entities, products:[
  row('milk',['full-fat'],'pack'), row('milk',['low-fat'],'200'),
  row('cheese',[],'185',{nameAr:'جبن حليب نادك 200 مل'}),
  row('milk',['full-fat','low-fat'],'185',{assortment:true}),
] };
const k = createBrochureKnowledge(graph);
assert(k.suggest('نادك حليب').some(s=>s.value==='نادك حليب كامل الدسم'));
assert(k.suggest('Nadec milk').some(s=>s.value==='Nadec milk full fat'));
assert(k.suggest('نادك حليب كامل الدسم').some(s=>s.value.includes('18 × 200 مل')));
assert(!k.suggest('نادك حليب', {varieties:false}).some(s=>s.kind==='variant'));
assert(!k.suggest('نادك حليب', {sizes:false}).some(s=>s.kind==='size'));
assert(!k.suggest('نادك حليب', {sizes:false,varieties:false}).length);
assert(!k.find('نادك حليب').some(r=>r.category==='category:cheese'));
assert(!k.find('حليب 200 مل').some(r=>r.size==='size:185'));
assert(k.find('حليب 18 x 200 ml').every(r=>r.size==='size:pack'));
assert(k.suggest('Nadex milk').every(s=>s.correction));
assert(!k.suggest('nonexistent product').length);
assert(!k.suggest('Nadec milk low fat 185 ml').length);
assert(k.identify({brand:'Nadec',category:'milk',size:'185 ml'}).some(r=>r.conflicts.includes('size')));
assert(!k.productQuery(graph.products[3]).includes('full fat'));
assert(k.suggest('نا').some(s=>s.value==='نادك'));
assert(k.find('الحليب ٠٫٢ لتر').length > 0);
assert(k.find('الحليب ٠٫٢ لتر').every(r=>['size:200','size:pack'].includes(r.size)));
assert(k.find('Nadec milk 0.2 L').length > 0);
assert(k.find('Nadec milk 0.2 L').every(r=>r.size!=='size:185'));
assert(k.facets(['brand:nadec','category:milk','variant:full-fat']).choices.every(c=>c.id!=='size:185'));
const raw=createBrochureKnowledge({...graph,products:[{...graph.products[0],vision:0}]});
assert.equal(raw.suggest('Nadec milk').length,0);
console.log('Brochure knowledge: bilingual completion, source-only links, assortment, category, size, typo and conflict checks passed');

// Arabic articles distinguish two real grocery brands: Al Rabie juice vs Rabea tea.
const teaGraph={version:'brochure-knowledge-v1',entities:[e('brand','alrabie','Al Rabie','الربيع'),e('brand','rabea','Rabea','ربيع'),e('category','tea','tea','شاي')],products:[
 {...graph.products[0],brand:'brand:alrabie',category:'category:tea',name:'Al Rabie tea',nameAr:'شاي الربيع'},
 {...graph.products[0],brand:'brand:rabea',category:'category:tea',name:'Rabea tea',nameAr:'شاي ربيع'},
]};
const tea=createBrochureKnowledge(teaGraph);
assert(tea.find('شاي ربيع').every(p=>p.brand==='brand:rabea'));
assert(tea.find('شاي ربيع').length>0);
assert(tea.find('شاي الربيع').every(p=>p.brand==='brand:alrabie'));
assert(tea.find('شاي الربيع').length>0);
const unverified=createBrochureKnowledge({...graph,products:[{...graph.products[0],classificationReviewRequired:true}]});
assert.equal(unverified.suggest('Nadec milk').length,0);
