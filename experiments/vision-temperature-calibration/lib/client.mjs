// client.mjs — one chat-completions call with timeout, backoff and a global pace.
//
// Transport failures (timeouts, 429, 5xx) are retried and, if they never clear,
// recorded as transport errors: they are not readings and are retried on the
// next resume. A 4xx other than 429 means the configuration is wrong (bad key,
// unknown model, invalid body), so it stops the whole run instead of burning
// calls on the same error.

export class FatalRequestError extends Error {}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPacer(minIntervalMs) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + minIntervalMs;
    if (at > now) await sleep(at - now);
  };
}

export async function postChat({ endpoint, apiKey, body, timeoutMs, maxRetries, pace, log = () => {} }) {
  let attempt = 0;
  for (;;) {
    await pace();
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let status = null;
    let retryAfterMs = null;
    let failure;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        // The same two headers the engine's postMistral sends, nothing more.
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      status = res.status;
      const text = await res.text();
      const latencyMs = Date.now() - started;
      if (res.ok) {
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          failure = `HTTP ${status} with a non-JSON body`;
        }
        if (json) return { ok: true, status, latencyMs, attempts: attempt + 1, response: json };
      } else if (!RETRYABLE.has(status)) {
        throw new FatalRequestError(`HTTP ${status}: ${text.slice(0, 500)}`);
      } else {
        failure = `HTTP ${status}`;
        const ra = Number(res.headers.get('retry-after'));
        if (Number.isFinite(ra) && ra > 0) retryAfterMs = ra * 1000;
      }
    } catch (e) {
      if (e instanceof FatalRequestError) throw e;
      failure = e.name === 'AbortError' ? `timeout after ${timeoutMs} ms` : `network: ${e.message}`;
    } finally {
      clearTimeout(timer);
    }
    if (attempt >= maxRetries) {
      return { ok: false, status, latencyMs: Date.now() - started, attempts: attempt + 1, error: failure };
    }
    const backoff = retryAfterMs ?? Math.min(60000, 2000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    log(`  retry ${attempt + 1}/${maxRetries} in ${Math.round(backoff / 1000)}s (${failure})`);
    await sleep(backoff);
    attempt++;
  }
}
