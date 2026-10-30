import { STORE_ASSETS } from './identityAssets.js';

const aliases = {panda: 'hyperpanda', 'al madina': 'almadina', 'city flower': 'cityflower', 'mark & save': 'marksave', 'a market': 'amarket', 'hyper al wafa': 'alwafa'};

// The Brochures tab's own icon, so the flyer source reads the same everywhere.
const BROCHURES_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5A2.5 2.5 0 0 1 17.5 21H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M8 7.5h8M8 11h8M8 14.5h5"/></svg>';

// Local assets keep identities available when a retailer/CDN is unreachable.
// Where a mark stands alone (the search source chips and results strip), the
// chip carries the label as its tooltip and accessible name.
export function storeIcon(idOrLabel, large = false) {
  const key = String(idOrLabel || '').trim().toLowerCase();
  const id = aliases[key] || key;
  const asset = STORE_ASSETS[id];
  if (!asset) {
    const glyph = document.createElement('span');
    glyph.className = 'store-symbol' + (large ? ' is-large' : '');
    if (id === 'brochures') glyph.innerHTML = BROCHURES_SVG;
    else glyph.textContent = '▧';
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
