import { STORE_ASSETS } from './identityAssets.js';

const aliases = {panda: 'hyperpanda', 'al madina': 'almadina', 'city flower': 'cityflower', 'mark & save': 'marksave', 'a market': 'amarket', 'hyper al wafa': 'alwafa'};

// Local assets keep identities available when a retailer/CDN is unreachable.
// Labels stay visible alongside these decorative marks in every context.
export function storeIcon(idOrLabel, large = false) {
  const key = String(idOrLabel || '').trim().toLowerCase();
  const id = aliases[key] || key;
  const asset = STORE_ASSETS[id];
  if (!asset) {
    const glyph = document.createElement('span');
    glyph.className = 'store-symbol' + (large ? ' is-large' : '');
    glyph.textContent = id === 'brochures' ? '▤' : '▧';
    glyph.setAttribute('aria-hidden', 'true');
    return glyph;
  }
  const img = document.createElement('img');
  img.className = 'store-logo' + (large ? ' is-large' : '');
  img.src = new URL('../' + asset.file, import.meta.url).href;
  img.alt = '';
  img.width = large ? 40 : 24;
  img.height = large ? 40 : 24;
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), {once: true});
  return img;
}
