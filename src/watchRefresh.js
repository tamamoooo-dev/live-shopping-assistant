export const MANUAL_REFRESH_STALE_MS = 26 * 60 * 60 * 1000;

const anchored = (watch = {}) =>
  ['anchored_registry', 'anchored_source', 'anchored_spec'].includes(watch.anchorState) ||
  Boolean(watch.registryProductId || watch.spec);

export function manualRefreshReason(watch, now = Date.now()) {
  if (!watch || watch.active === false || !anchored(watch)) return null;
  if (watch.monitoringHealth === 'provider_error') return 'provider_failure';
  if (watch.monitoringHealth === 'unchecked' || !watch.checkedAt) return 'not_yet_checked';
  const checkedAt = Date.parse(watch.checkedAt);
  if (Number.isFinite(checkedAt) && now - checkedAt >= MANUAL_REFRESH_STALE_MS) return 'stale';
  return null;
}
