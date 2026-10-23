import { createBrochureKnowledge } from './brochureKnowledge.js?v=20261023.archive1';

let indexPromise;
function load() {
  return indexPromise ||= fetch(new URL('../data/brochure-knowledge.json.gz?v=20261023.archive1', import.meta.url))
    .then(async response => {
      if (!response.ok) throw Error('Index unavailable');
      const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
      return createBrochureKnowledge(await new Response(stream).json());
    }).catch(error => { indexPromise = null; throw error; });
}
self.onmessage = async ({ data: { id, action, query, options, observation } }) => {
  try {
    const index = await load();
    let result;
    if (action === 'facets') result = index.facets(options.selected, options.lang);
    else if (action === 'suggest') result = index.suggest(query, options);
    else if (action === 'identify') result = index.identify(observation, options);
    else if (action === 'explore') {
      const matches = index.find(query, { limit: 100 });
      result = matches.slice(0, 30).map(row => ({ query: index.productQuery(row, options.lang),
        observations: row.observations, trusted: row.trusted, examples: row.examples, stores: row.stores,
        chain: row.fields.map(e => options.lang === 'ar' ? e.ar || e.en : e.en || e.ar).join(' › ') }));
    } else result = { ...index.graph.stats, exportedAt: index.graph.exportedAt };
    self.postMessage({ id, result });
  } catch { self.postMessage({ id, error: 'Index unavailable' }); }
};
