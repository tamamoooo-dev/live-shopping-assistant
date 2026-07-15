// viewer/hotspots.js — the product tap layer. Spots render as visual +
// accessibility elements only (pointer-events: none): every TOUCH decision is
// made by the gesture arbiter, which asks this layer to hit-test page
// fractions. That split is what guarantees the brief's "no accidental taps
// during pan": a spot can only activate on a clean TAP verdict, never on a
// pan/pinch that happens to start on it — and pressed feedback appears the
// instant a finger lands on a product.
//
// Keyboard/screen-reader users still get real <button>s (click handlers fire
// on Enter/Space via the a11y tree even with pointer-events off).

export function createSpotLayer(contentEl, spots, offers, { onActivate, labelOf }) {
  const layer = document.createElement('div');
  layer.className = 'vv-spots';
  const byId = new Map(); // offerId -> element
  for (const s of spots) {
    const offer = offers[s.offerId];
    if (!offer) continue;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'vv-spot';
    el.style.left = `${s.x * 100}%`;
    el.style.top = `${s.y * 100}%`;
    el.style.width = `${s.w * 100}%`;
    el.style.height = `${s.h * 100}%`;
    el.setAttribute('aria-label', labelOf(offer));
    el.addEventListener('click', () => onActivate(offer, s)); // keyboard path
    layer.appendChild(el);
    byId.set(String(s.offerId), el);
  }
  contentEl.appendChild(layer);

  let pressed = null;
  return {
    spots,
    // The spot under page fractions (fx, fy), or null. Smallest spot wins when
    // boxes overlap (the more specific product).
    //
    // minW/minH (page fractions, optional) give every spot a MINIMUM hit box —
    // the caller passes ~44px converted to fractions so small products stay
    // tappable at any zoom. Coordinates never change: the halo is centered on
    // the spot's real box, and a finger inside a spot's REAL box always beats
    // a neighbour's halo.
    hit(fx, fy, minW = 0, minH = 0) {
      let best = null;
      let bestDirect = false;
      for (const s of spots) {
        if (!offers[s.offerId]) continue;
        const direct = fx >= s.x && fx <= s.x + s.w && fy >= s.y && fy <= s.y + s.h;
        let inside = direct;
        if (!inside) {
          const ex = Math.max(0, (minW - s.w) / 2);
          const ey = Math.max(0, (minH - s.h) / 2);
          inside =
            fx >= s.x - ex && fx <= s.x + s.w + ex && fy >= s.y - ey && fy <= s.y + s.h + ey;
        }
        if (!inside) continue;
        if (!best || (direct && !bestDirect) || (direct === bestDirect && s.w * s.h < best.w * best.h)) {
          best = s;
          bestDirect = direct;
        }
      }
      return best;
    },
    press(spot) {
      this.release();
      const el = byId.get(String(spot.offerId));
      if (el) {
        el.classList.add('is-pressed');
        pressed = el;
      }
    },
    release() {
      if (pressed) {
        pressed.classList.remove('is-pressed');
        pressed = null;
      }
    },
    // The search-landing pulse: briefly draw the eye to one product.
    pulse(offerId) {
      const el = byId.get(String(offerId));
      if (!el) return false;
      el.classList.remove('is-pulse'); // restart if already running
      void el.offsetWidth;
      el.classList.add('is-pulse');
      setTimeout(() => el.classList.remove('is-pulse'), 2600);
      return true;
    },
    flash() {
      layer.classList.add('vv-spots-flash');
      setTimeout(() => layer.classList.remove('vv-spots-flash'), 1500);
    },
    destroy() {
      layer.remove();
    },
  };
}

// The spot (and its page source-index) carrying a given offer id — the search
// integration's "where on the flyer is this product?" lookup.
export function spotForOffer(hotspots, offerId) {
  if (!hotspots || offerId == null) return null;
  const id = String(offerId);
  for (const [pageIndex, spots] of hotspots.spotsByIndex) {
    for (const s of spots) if (String(s.offerId) === id) return { pageIndex, spot: s };
  }
  return null;
}
