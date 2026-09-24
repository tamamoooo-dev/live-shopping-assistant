// consensus.mjs — the two-consecutive-matching-readings acceptance rule.
//
// The rule under test (the fallback's acceptance mechanism, unchanged):
//   read, read again; if the two readings are the same valid price, ACCEPT it.
//   Otherwise read again and compare with the reading just before it, until two
//   CONSECUTIVE readings match or the reading cap is hit (NO CONSENSUS).
// An invalid reading (null) never matches anything, not even another invalid
// one: two failures to read a price are not agreement on a price.
//
// Two ways to score it, both reported:
//   observedConsensus — replay the rule on the readings in the order they were
//     actually taken. Honest, but one path per crop, so it is noisy.
//   consensusOverOrderings — the exact average of the rule over EVERY order in
//     which the crop's R observed readings could have arrived (drawing without
//     replacement, cap <= R). Separate API calls are independent draws, so this
//     average is a U-statistic: an UNBIASED estimate of each outcome's
//     probability, using every reading instead of one path. (The naive plug-in —
//     treat observed frequencies as the true distribution — overstates
//     agreement: with 8 readings, two reads agreeing on a value the model
//     returns half the time come out at ~0.28 on average instead of 0.25.)

export const INVALID = 'invalid';

export function observedConsensus(readings, cap) {
  if (!Number.isInteger(cap) || cap < 2) throw new Error('cap must be an integer >= 2');
  if (readings.length < cap) return { status: 'insufficient', value: null, calls: readings.length };
  for (let t = 1; t < cap; t++) {
    const a = readings[t - 1];
    const b = readings[t];
    if (a != null && a === b) return { status: 'accepted', value: b, calls: t + 1 };
  }
  return { status: 'no-consensus', value: null, calls: cap };
}

export function countReadings(readings) {
  const counts = new Map();
  for (const r of readings) {
    const k = r == null ? INVALID : r;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// readings: array of cents | null. Returns
//   { accept: Map<cents, probability>, noConsensus, expectedCalls }.
export function consensusOverOrderings(readings, cap) {
  if (!Number.isInteger(cap) || cap < 2) throw new Error('cap must be an integer >= 2');
  if (cap > readings.length) throw new Error(`cap ${cap} exceeds the ${readings.length} readings available`);
  const counted = countReadings(readings);
  const values = [...counted.keys()];
  const valid = values.map((v) => v !== INVALID);
  const counts = values.map((v) => counted.get(v));
  const total = readings.length;
  const V = values.length;
  const memo = new Map();

  // State: remaining counts + index of the last reading (-1 before the first).
  // Returns [P(accept value 0..V-1)..., P(no consensus), expected further calls].
  const rec = (last, taken) => {
    if (taken === cap) {
      const out = new Float64Array(V + 2);
      out[V] = 1;
      return out;
    }
    const memoKey = `${counts.join(',')}|${last}`;
    const hit = memo.get(memoKey);
    if (hit) return hit;
    const out = new Float64Array(V + 2);
    out[V + 1] = 1; // this reading
    const remaining = total - taken;
    for (let s = 0; s < V; s++) {
      if (!counts[s]) continue;
      const p = counts[s] / remaining;
      if (s === last && valid[s]) {
        out[s] += p;
        continue;
      }
      counts[s]--;
      const sub = rec(s, taken + 1);
      counts[s]++;
      for (let i = 0; i < V + 2; i++) out[i] += p * sub[i];
    }
    memo.set(memoKey, out);
    return out;
  };

  const res = rec(-1, 0);
  const accept = new Map();
  for (let s = 0; s < V; s++) if (valid[s] && res[s] > 0) accept.set(values[s], res[s]);
  return { accept, noConsensus: res[V], expectedCalls: res[V + 1] };
}
