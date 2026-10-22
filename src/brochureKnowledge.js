// Search projection of the observed brochure graph. No identity minting,
// registry reassignment, external catalog, or implicit query rewriting.
import { querySize, queryTokens } from './match.js';

export function knowledgeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[\u064b-\u065f\u0670ـ]/g, '')
    .replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/(\d)(\p{L})/gu, '$1 $2').replace(/[^\p{L}\p{N}.]+/gu, ' ').trim()
    .split(/\s+/).map(token => /^[\u0600-\u06ff]+$/.test(token)
      && token.replace(/^(وال|ال)/, '').length >= 2 ? token.replace(/^(وال|ال)/, '') : token).join(' ');
}
const words = value => knowledgeText(value).split(/\s+/).filter(Boolean);
const oneEdit = (a, b) => {
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, errors = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++errors > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return errors + Number(i < a.length || j < b.length) === 1;
};

export function createBrochureKnowledge(graph) {
  if (graph?.version !== 'brochure-knowledge-v1' || !Array.isArray(graph.products) || !Array.isArray(graph.entities)) {
    throw Error('Unsupported brochure index');
  }
  const entities = new Map(graph.entities.map(e => [e.id, { ...e,
    tokens: [...new Set((e.aliases || [e.en, e.ar]).flatMap(words))] }]));
  const keys = p => [p.brand, p.category, ...(p.variants || []), p.size, p.aisle, p.department].filter(Boolean);
  const rows = graph.products.map(p => {
    const fields = keys(p).map(id => entities.get(id)).filter(Boolean);
    const tokens = [...new Set([...words(p.name), ...words(p.nameAr), ...(p.names || []).flatMap(words), ...fields.flatMap(e => e.tokens)])];
    return { ...p, fields, tokens };
  });
  // Inverted whole-token index narrows candidates before prefix/fuzzy checks.
  const inverted = new Map();
  rows.forEach((r, i) => r.tokens.forEach(token => {
    if (!inverted.has(token)) inverted.set(token, []);
    inverted.get(token).push(i);
  }));
  const phrases = [...entities.values()].filter(e => ['brand','category','variant'].includes(e.kind))
    .flatMap(entity => (entity.aliases || []).map(alias => ({ entity, phrase: knowledgeText(alias) })))
    .sort((a,b) => b.phrase.length - a.phrase.length);
  function find(query, { limit = 80, fuzzy = false } = {}) {
    const sizeQuery = querySize(query);
    const tokens = words(sizeQuery ? queryTokens(query).join(' ') : query).slice(0, 18);
    if (!tokens.length) return [];
    const normalized = ` ${knowledgeText(query)} `;
    const matches = phrases.filter(e => normalized.includes(` ${e.phrase} `));
    const queryCategory = matches.find(e => e.entity.kind === 'category')?.entity;
    const queryBrand = matches.find(e => e.entity.kind === 'brand' && e.entity.normalized !== false)?.entity;
    const queryVariants = matches.filter(e => e.entity.kind === 'variant'
      && !matches.some(other => other.entity.kind !== 'variant' && other.phrase.includes(e.phrase)))
      .filter((entry, i, all) => !all.some((other,j) => j < i && other.phrase.includes(entry.phrase)))
      .map(e => e.entity.id);
    const exactPools = tokens.map(t => inverted.get(t)).filter(Boolean);
    const pool = exactPools.length ? exactPools.reduce((a,b) => a.length <= b.length ? a : b).map(i => rows[i]) : rows;
    return pool.map(row => {
      if (queryBrand && row.brand && row.brand !== queryBrand.id) return null;
      if (queryCategory && row.category) {
        const category = entities.get(row.category);
        const broad = queryCategory.id === `category:${queryCategory.family}`;
        if (category.id !== queryCategory.id && !(broad && category.family === queryCategory.family)) return null;
      }
      if (!row.assortment && queryVariants.some(id => !row.variants.includes(id))) return null;
      if (sizeQuery && row.size) {
        const size = entities.get(row.size);
        const canonical = querySize(size.en);
        if (canonical?.unit !== sizeQuery.unit) return null;
        // A plain "200 ml" selects the per-item measure; an explicit pack
        // must also have the same count. Never equate 18x200ml with 200ml.
        const each = canonical?.each ?? (canonical?.total / (canonical?.pack || 1));
        const wanted = sizeQuery.each ?? (sizeQuery.total / (sizeQuery.pack || 1));
        if (!Number.isFinite(each) || !Number.isFinite(wanted) || Math.abs(each - wanted) > 0.001) return null;
        if (sizeQuery.pack > 1 && sizeQuery.pack !== canonical.pack) return null;
      }
      let correction = false;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (row.tokens.includes(t)) continue;
        if (i === tokens.length - 1 && row.tokens.some(w => w.startsWith(t))) continue;
        if (fuzzy && !correction && row.tokens.some(w => oneEdit(t, w))) { correction = true; continue; }
        return null;
      }
      return { ...row, correction };
    }).filter(Boolean).sort((a,b) => Number(a.correction) - Number(b.correction)
      || b.trusted - a.trusted || b.observations - a.observations).slice(0, limit);
  }
  const label = (e, lang) => lang === 'ar' ? e.ar || e.en : e.en || e.ar;
  function productQuery(p, lang = 'en', { sizes = true, varieties = true } = {}) {
    if (!p.category) return lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr;
    return [p.brand, p.category, ...(varieties && !p.assortment ? p.variants || [] : []), sizes && !p.assortment ? p.size : null]
      .map(id => entities.get(id)).filter(Boolean).map(e => label(e, lang)).join(' ')
      || (lang === 'ar' ? p.nameAr || p.name : p.name || p.nameAr);
  }
  function suggest(query, { sizes = true, varieties = true, limit = 8, lang } = {}) {
    lang ||= /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en';
    const tokens = words(query);
    if (!tokens.length) return [];
    let candidates = find(query, { limit: 300 });
    if (!candidates.length) candidates = find(query, { limit: 100, fuzzy: true });
    const output = new Map();
    for (const row of candidates) {
      // Unclassified source text is valuable for review, but cannot support
      // precise category/variant/size completion from incidental OCR words.
      if (!row.category || row.vision === 0) continue;
      const allowed = row.fields.filter(e => ['brand', 'category'].includes(e.kind)
        || (!row.assortment && sizes && e.kind === 'size') || (!row.assortment && varieties && e.kind === 'variant'));
      // Finish an unfinished last word first; only then add the next facet.
      const last = tokens.at(-1);
      const sizeTail = querySize(query) && /^(?:[\d.]+|ml|l|ltr|g|kg|gm|pcs|مل|لتر|جم|كجم)$/iu.test(last);
      const partial = !sizeTail && allowed.find(e => e.tokens.some(w => w.startsWith(last) && w !== last)
        && !e.tokens.includes(last));
      const missing = allowed.find(e => !tokens.some(t => e.tokens.includes(t)));
      const next = partial || missing;
      if (!next) continue;
      let value;
      if (row.correction) value = productQuery(row, lang, { sizes, varieties });
      else if (partial) {
        const rawWords = query.trim().split(/\s+/);
        const phraseWords = label(partial, lang).split(/\s+/);
        // A phrase may already have its first words typed ("Al Sa").
        let consumed = 1;
        for (let n = Math.min(rawWords.length, phraseWords.length); n > 1; n--) {
          const typed = words(rawWords.slice(-n).join(' '));
          const full = words(phraseWords.slice(0,n).join(' '));
          if (typed.every((w,i) => full[i]?.startsWith(w))) { consumed = n; break; }
        }
        value = [...rawWords.slice(0, -consumed), label(partial, lang)].join(' ');
      } else value = `${query.trim()} ${label(next, lang)}`;
      if (knowledgeText(value) === knowledgeText(query)) continue;
      const key = knowledgeText(value);
      if (output.has(key)) continue;
      output.set(key, { value, kind: row.correction ? 'correction' : next.kind,
        correction: row.correction, observations: row.observations, stores: row.stores.length,
        example: row.examples[0], chain: allowed.map(e => label(e, lang)).join(' · ') });
      if (output.size >= limit) break;
    }
    return [...output.values()];
  }
  function identify(observation, { lang = 'en', limit = 8 } = {}) {
    const explicit = ['brand', 'category', 'variant', 'size'].filter(k => observation[k]?.trim());
    const query = observation.name || explicit.map(k => observation[k]).join(' ');
    // Prefer full coverage; when a read conflicts, retrieve by each explicit
    // field so the UI can show the actual mismatch rather than silently repair.
    const pool = new Map();
    for (const q of [query, ...explicit.map(k => observation[k])]) {
      for (const row of find(q, { fuzzy: true, limit: 150 })) pool.set(row, row);
    }
    const unique = new Map();
    for (const row of pool.values()) {
      const conflicts = explicit.filter(k => {
        const kind = k === 'variant' ? 'variant' : k;
        const fieldWords = row.fields.filter(e => e.kind === kind).flatMap(e => e.tokens);
        return !words(observation[k]).every(t => fieldWords.includes(t));
      });
      const key = JSON.stringify([keys(row), row.category ? '' : row.name || row.nameAr]);
      unique.set(key, { query: productQuery(row, lang), conflicts, observations: row.observations,
        trusted: row.trusted, productIds: row.productIds, examples: row.examples, stores: row.stores,
        name: row.name, nameAr: row.nameAr });
    }
    return [...unique.values()].sort((a,b) => a.conflicts.length - b.conflicts.length
      || b.trusted - a.trusted || b.observations - a.observations).slice(0, limit);
  }
  function facets(selected = [], lang = 'en') {
    const pool = rows.filter(row => selected.every(id => {
      if (keys(row).includes(id)) return true;
      const field = entities.get(id);
      return field?.kind === 'category' && field.id === `category:${field.family}`
        && entities.get(row.category)?.family === field.family;
    }));
    const kinds = ['brand','category','variant','size'];
    const next = kinds.find(kind => !selected.some(id => entities.get(id)?.kind === kind));
    const counts = new Map();
    for (const row of pool) for (const original of row.fields) {
      if (original.kind !== next || (row.assortment && ['variant','size'].includes(next))) continue;
      // Milk subtypes (fresh/UHT/powder) share the observed milk parent.
      // The row retains its precise subtype for lookup and source inspection.
      const field = next === 'category' && original.family
        ? entities.get(`category:${original.family}`) || original : original;
      const prior = counts.get(field.id) || { id: field.id, label: label(field,lang), observations: 0 };
      prior.observations += row.observations;
      counts.set(field.id, prior);
    }
    return { next, selected: selected.map(id => ({ id, label: label(entities.get(id),lang) })),
      choices: [...counts.values()].sort((a,b) => b.observations - a.observations),
      combinations: pool.length, examples: pool.slice(0,12).map(row => ({
        query: productQuery(row,lang), observations: row.observations, stores: row.stores,
        examples: row.examples, conflicts: [], assortment: row.assortment,
      })) };
  }
  return { graph, entities, find, suggest, identify, productQuery, facets };
}
