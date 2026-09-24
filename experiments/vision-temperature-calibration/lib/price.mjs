// price.mjs — turn what the model said into a comparable price, or refuse.
//
// Every price in this experiment is an integer number of halalas (1 SAR = 100),
// so "12.95", 12.95 and "١٢٫٩٥" all compare equal and float noise can never make
// two identical readings disagree. Anything that is not unambiguously one price
// normalizes to null: a reading we cannot read is an INVALID reading, never a
// guessed one (the project's refuse-rather-than-guess rule).

const ARABIC_INDIC = /[٠-٩]/g; // ٠..٩
const EASTERN_ARABIC_INDIC = /[۰-۹]/g; // ۰..۹
const CURRENCY = /(sar|s\.r\.?|sr|ر\.?\s?س\.?|ريال|﷼)/gi;
const MAX_PLAUSIBLE_SAR = 100000;

export function normalizePrice(value) {
  if (value == null) return null;
  if (typeof value === 'number') return centsFromNumber(value);
  if (typeof value !== 'string') return null;

  let s = value
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ',') // Arabic thousands separator
    .replace(CURRENCY, '')
    .replace(/\s+/g, '');
  if (!s) return null;

  // "1,299" is a thousands separator; "12,95" is a decimal comma. Anything
  // else with a comma is ambiguous and refused.
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return centsFromNumber(Number(s));
}

function centsFromNumber(n) {
  if (!Number.isFinite(n) || n <= 0 || n >= MAX_PLAUSIBLE_SAR) return null;
  const cents = Math.round(n * 100);
  // More than two decimals (12.955) is not a shelf price.
  if (Math.abs(n * 100 - cents) > 1e-6) return null;
  return cents;
}

export function formatCents(cents) {
  if (cents == null) return 'invalid';
  return (cents / 100).toFixed(2);
}

// The message content of a chat completion. Mistral returns a string, or, for
// some models, an array of typed chunks — only the text chunks are the answer.
export function messageText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c && (c.type === 'text' || typeof c === 'string'))
      .map((c) => (typeof c === 'string' ? c : c.text || ''))
      .join('');
  }
  return null;
}

export function readPath(obj, path) {
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(key) ? cur[Number(key)] : cur[key];
  }
  return cur;
}

// Build the configured extractor. Two kinds:
//   { type: 'jsonPath', path: 'current_price', stripCodeFences: false }
//     JSON.parse the message text, read the field, normalize it.
//   { type: 'module', path: './adapter.mjs', export: 'parseCurrentPrice' }
//     A drop-in copy of the fallback's OWN parser, so the experiment reads the
//     answer exactly as the fallback would. Called as fn(text, response); its
//     return value (number, string or null) is normalized here.
// Either way the extractor returns { cents, error }.
export async function createPriceExtractor(spec, baseDir) {
  if (!spec || typeof spec !== 'object') throw new Error('priceParser is missing');
  if (spec.type === 'jsonPath') {
    if (!spec.path || /^<|SET/.test(spec.path)) {
      throw new Error('priceParser.path is not set — use the field the fallback reads the current price from');
    }
    return (text) => {
      if (text == null) return { cents: null, error: 'no-content' };
      let body = text.trim();
      if (spec.stripCodeFences) body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return { cents: null, error: 'not-json' };
      }
      const raw = readPath(parsed, spec.path);
      if (raw === undefined) return { cents: null, error: 'field-missing' };
      const cents = normalizePrice(raw);
      return cents == null ? { cents: null, error: 'unreadable-price' } : { cents, error: null };
    };
  }
  if (spec.type === 'module') {
    const { pathToFileURL } = await import('node:url');
    const { resolve } = await import('node:path');
    const mod = await import(pathToFileURL(resolve(baseDir, spec.path)).href);
    const fn = mod[spec.export || 'default'];
    if (typeof fn !== 'function') throw new Error(`priceParser module has no function export "${spec.export || 'default'}"`);
    // The module is the fallback's own parser, so its verdict is final: a
    // number it returns is a valid reading (converted to halalas only), and a
    // { current, old } reading keeps the old price for diagnostics. No
    // plausibility rule of this harness is layered on top of it.
    const toCents = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : normalizePrice(v));
    return (text, response) => {
      let raw;
      try {
        raw = fn(text, response);
      } catch (e) {
        return { cents: null, oldCents: null, error: `parser-threw: ${e.message}` };
      }
      if (raw == null) return { cents: null, oldCents: null, error: 'invalid-reading' };
      const reading = typeof raw === 'object' ? raw : { current: raw, old: null };
      const cents = toCents(reading.current);
      const oldCents = reading.old == null ? null : toCents(reading.old);
      return cents == null ? { cents: null, oldCents: null, error: 'unreadable-price' } : { cents, oldCents, error: null };
    };
  }
  throw new Error(`unknown priceParser.type "${spec.type}"`);
}
