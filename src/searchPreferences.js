import { profileGet, profileSet } from './profile.js';

const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[\u064b-\u065fـ]/g, '').replace(/\s+/g, ' ').trim();
let session;
function history() {
  if (session) return session;
  const saved = profileGet('searchHistory', []);
  session = (Array.isArray(saved) ? saved : []).filter(r => r && typeof r.value === 'string'
    && Number.isFinite(r.count) && Number.isFinite(r.at)).slice(0, 100);
  // Adopt the existing searches: returning users get predictions immediately.
  try {
    const recent = JSON.parse(localStorage.getItem('lsa.app.recent') || '[]');
    if (Array.isArray(recent)) for (const [i, value] of recent.entries()) {
      if (typeof value === 'string' && !session.some(r => normalize(r.value) === normalize(value)))
        session.push({ value, count: 1, at: Date.now() - i * 1000 });
    }
  } catch {}
  return session;
}
export function rememberSearch(value, now = Date.now()) {
  value = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (!value) return;
  const rows = history(), key = normalize(value), prior = rows.find(r => normalize(r.value) === key);
  session = [{ value, count: Math.min(100, (prior?.count || 0) + 1), at: now },
    ...rows.filter(r => normalize(r.value) !== key)].slice(0, 100);
  profileSet('searchHistory', session);
}
export function preferredSuggestions(query, now = Date.now(), { stepwise = false, candidates } = {}) {
  const key = normalize(query), tokens = key.split(' ').filter(Boolean);
  const ranked = history().filter(r => {
    const candidate = normalize(r.value).split(' ');
    return tokens.every((token, i) => candidate.some(w => i === tokens.length - 1 ? w.startsWith(token) : w === token));
  }).map(r => ({ ...r, score: Math.log2(1 + r.count) * 4
    + 3 / (1 + Math.max(0, now - r.at) / 86400000) + Number(normalize(r.value).startsWith(key)) * 2 }))
    .sort((a, b) => b.score - a.score || b.at - a.at);
  // History ranks complete canonical facets, including compound brand names
  // and variants. It must not truncate "أبو قوس" or "كامل الدسم" to one word.
  if (stepwise && candidates) {
    const ordered = new Map();
    for (const row of ranked) {
      const historical = normalize(row.value).split(' ');
      for (const candidate of candidates) if (normalize(candidate.value).split(' ').every(w => historical.includes(w))) {
        const id = normalize(candidate.value);
        if (!ordered.has(id)) ordered.set(id, {...candidate, personal:true});
      }
    }
    return [...ordered.values()].slice(0,6);
  }
  return ranked.slice(0,6)
    .map(r => {
      let value = r.value;
      if (stepwise && tokens.length) {
        const raw = query.trim().split(/\s+/), parts = r.value.split(/\s+/);
        const last = tokens.at(-1);
        const partial = parts.find(w => normalize(w).startsWith(last) && normalize(w) !== last);
        value = tokens.length === 1 && partial ? [...raw.slice(0, -1), partial].join(' ') : query.trim();
      }
      return { value, kind: 'history', personal: true };
    }).filter(r => normalize(r.value) !== key);
}
export function mergeSuggestions(personal, indexed, limit = 8) {
  const unique = new Map();
  for (const suggestion of [...personal, ...indexed]) {
    const key = normalize(suggestion.value);
    if (!unique.has(key)) unique.set(key, suggestion);
  }
  return [...unique.values()].slice(0, limit);
}
