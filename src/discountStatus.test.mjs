import { discountPercent, discountState } from './discountStatus.js';

import assert from 'node:assert/strict';

assert.equal(discountState({ price: 86, oldPrice: 100 }), 'low', 'less than 15% is red');
assert.equal(discountState({ price: 85, oldPrice: 100 }), 'mid', 'exactly 15% is green');
assert.equal(discountState({ price: 55, oldPrice: 100 }), 'mid', 'exactly 45% is green');
assert.equal(discountState({ price: 54, oldPrice: 100 }), 'high', 'more than 45% is purple');
assert.equal(discountState({ price: 10 }), null, 'missing old price has no dot');
assert.equal(discountState({ price: null, oldPrice: 20 }), null, 'missing current price has no dot');
assert.equal(discountState({ price: 10, oldPrice: 10 }), null, 'no actual discount has no dot');
assert.equal(discountState({ price: 'not-a-price', oldPrice: 20 }), null, 'invalid price has no dot');
assert.equal(discountPercent({ price: 75, oldPrice: 100 }), 25, 'percentage is derived from current and old price');

console.log('discount status tests passed');
