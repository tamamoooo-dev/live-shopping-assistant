import { notificationTarget } from './notificationNavigation.js';

function check(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`ok - ${name}`);
}

const snickers = notificationTarget(
  { query: '  Snickers   50g ', lastStore: 'panda', lastLink: 'https://panda.sa/removed' },
  { store: 'panda', link: 'https://panda.sa/expired' },
);
check('retailer URL is replaced by Super Search', snickers.kind === 'search');
check('query is normalized', snickers.href === '#/search?q=Snickers+50g');

const twix = notificationTarget(
  { query: 'Twix', link: '#/brochures?brochure=expired&page=2' },
  { store: 'othaim', source: 'flyer', link: '#/brochures?brochure=expired&page=2' },
);
check('brochure page is replaced by Super Search', twix.href === '#/search?q=Twix');

const amazon = notificationTarget(
  { kind: 'product', provider: 'amazon', query: 'Echo Dot' },
  { store: 'amazon', link: 'https://www.amazon.sa/dp/B0TEST' },
);
check('Amazon remains direct', amazon.kind === 'external' && amazon.href.includes('amazon.sa/dp/B0TEST'));

const forged = notificationTarget(
  { kind: 'product', provider: 'amazon', query: 'Echo Dot' },
  { store: 'amazon', link: 'https://example.com/not-amazon' },
);
check('non-Amazon external URL is never direct', forged.kind === 'search');

const registry = notificationTarget(
  { kind: 'registry', productId: 'pr_twix1', label: 'Twix Chocolate 50g', query: 'chocolate' },
  { store: 'lulu', name: 'Twix 50 g', link: 'https://lulu.example/old' },
);
check(
  'internal identity is retained with a text fallback',
  registry.href === '#/search?q=Twix+Chocolate+50g&product=pr_twix1',
);

console.log('notification navigation tests passed');
