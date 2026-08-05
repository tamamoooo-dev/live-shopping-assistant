import { enrichmentState } from './enrichmentStatus.js';

let failures = 0;
const check = (name, condition) => {
  if (condition) console.log(`ok - ${name}`);
  else {
    failures += 1;
    console.error(`FAIL - ${name}`);
  }
};

check('missing enrichment is red', enrichmentState({}) === 'missing');
check(
  'non-Medium enrichment is green',
  enrichmentState({ enriched: true, enrichmentModel: 'mistral-small-2603' }) === 'enriched',
);
check(
  'Medium enrichment is purple',
  enrichmentState({ enriched: true, enrichmentModel: 'mistral-medium-latest' }) === 'medium',
);
check(
  'a Medium recovery model is purple too',
  enrichmentState({ enriched: true, enrichmentModel: 'mistral-small-2603+mistral-medium-latest' }) === 'medium',
);

if (failures) process.exit(1);
console.log('enrichment status tests passed');
