import { BROCHURES_SOURCE_ID, splitSearchSources } from './searchSources.js';

function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`ok - ${label}`);
}

const panda = { id: 'panda', kind: 'online', provider: { id: 'panda' } };
const amazon = { id: 'amazon', kind: 'online', provider: { id: 'amazon' } };
const brochures = { id: BROCHURES_SOURCE_ID, kind: 'brochures' };

{
  const plan = splitSearchSources([brochures]);
  check('Brochures searches no online retailers', plan.stores.length === 0);
  check('Brochures enables the brochure endpoint', plan.brochures === true);
}

{
  const plan = splitSearchSources([panda]);
  check('a retailer searches its online provider', plan.stores.length === 1 && plan.stores[0] === panda);
  check('a retailer alone does not search brochures', plan.brochures === false);
}

{
  const plan = splitSearchSources([panda, amazon, brochures]);
  check('mixed selection keeps only actual retailers in the online plan', plan.stores.length === 2);
  check('mixed selection also searches brochures once', plan.brochures === true);
}

{
  const plan = splitSearchSources([]);
  check('empty selection dispatches nothing', plan.stores.length === 0 && plan.brochures === false);
}

console.log('search source tests passed');
