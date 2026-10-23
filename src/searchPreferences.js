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
export function preferredSuggestions(query, now = Date.now()) {
  const key = normalize(query), tokens = key.split(' ').filter(Boolean);
  return history().filter(r => {
    const candidate = normalize(r.value).split(' ');
    return tokens.every((token, i) => candidate.some(w => i === tokens.length - 1 ? w.startsWith(token) : w === token));
  }).map(r => ({ ...r, score: Math.log2(1 + r.count) * 4
    + 3 / (1 + Math.max(0, now - r.at) / 86400000) + Number(normalize(r.value).startsWith(key)) * 2 }))
    .sort((a, b) => b.score - a.score || b.at - a.at).slice(0, 6)
    .map(r => ({ value: r.value, kind: 'history', personal: true }));
}
export function mergeSuggestions(personal, indexed, limit = 8) {
  const unique = new Map();
  for (const suggestion of [...personal, ...indexed]) {
    const key = normalize(suggestion.value);
    if (!unique.has(key)) unique.set(key, suggestion);
  }
  return [...unique.values()].slice(0, limit);
}
