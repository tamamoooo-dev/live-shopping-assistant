import assert from 'node:assert/strict';
import { MANUAL_REFRESH_STALE_MS, manualRefreshReason } from './watchRefresh.js';

const now = Date.parse('2026-07-30T12:00:00Z');
const anchored = {
  active: true,
  anchorState: 'anchored_source',
  monitoringHealth: 'ok',
  checkedAt: new Date(now - 60_000).toISOString(),
};

assert.equal(manualRefreshReason({ ...anchored, monitoringHealth: 'provider_error' }, now), 'provider_failure');
assert.equal(manualRefreshReason({ ...anchored, monitoringHealth: 'unchecked', checkedAt: null }, now), 'not_yet_checked');
assert.equal(
  manualRefreshReason({ ...anchored, checkedAt: new Date(now - MANUAL_REFRESH_STALE_MS).toISOString() }, now),
  'stale',
);
assert.equal(manualRefreshReason(anchored, now), null);
assert.equal(manualRefreshReason({ ...anchored, anchorState: 'confirmation_required' }, now), null);
assert.equal(manualRefreshReason({ ...anchored, active: false }, now), null);

console.log('watchRefresh.test: 6 passed, 0 failed');
