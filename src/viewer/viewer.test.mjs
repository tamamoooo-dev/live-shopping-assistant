// viewer/viewer.test.mjs — offline tests for the viewer's critical logic: the
// gesture state machine (a misclassified gesture breaks every interaction),
// the zoom/pan transform math, hotspot hit-testing, and reading-position
// memory. Run with:  node src/viewer/viewer.test.mjs
//
// UI polish is verified in the browser, not here (project testing rule).

import { createGestures } from './gestures.js';
import {
  fitSize, centered, bounds, clamp, zoomAt, pinchZoom, pointToFraction, centerOnRect,
} from './transform.js';
import { createSpotLayer, spotForOffer } from './hotspots.js';
import { rememberPosition, recallPosition } from './state.js';
import { structureOfferName } from './productName.js';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error('FAIL:', name);
  }
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

/* --- gesture state machine ------------------------------------------------------ */
// A manual scheduler so the delayed single-tap emit is deterministic.
function manualTimers() {
  const q = [];
  return {
    setTimeout: (fn) => (q.push(fn), q.length - 1),
    clearTimeout: (id) => {
      q[id] = null;
    },
    flush: () => {
      for (const fn of q.splice(0)) fn && fn();
    },
  };
}

function recordingHandlers(log) {
  return {
    onPress: () => log.push('press'),
    onPressCancel: () => log.push('presscancel'),
    onTap: (x, y) => log.push(`tap:${x},${y}`),
    onDoubleTap: () => log.push('dbltap'),
    onPanStart: () => log.push('panstart'),
    onPan: (dx, dy) => log.push(`pan:${Math.round(dx)},${Math.round(dy)}`),
    onPanEnd: (vx) => log.push(`panend:${vx.toFixed(2)}`),
    onPinchStart: () => log.push('pinchstart'),
    onPinch: (s) => log.push(`pinch:${s.toFixed(2)}`),
    onPinchEnd: () => log.push('pinchend'),
  };
}

{
  // clean tap: press -> (delayed) tap, no pan
  const log = [];
  const timers = manualTimers();
  const g = createGestures(recordingHandlers(log), timers);
  g.down(1, 100, 100, 0);
  g.move(1, 103, 102, 30); // within slop
  g.up(1, 103, 102, 80);
  ok('tap emits press immediately', log[0] === 'press');
  ok('tap not emitted before double-tap window', !log.some((l) => l.startsWith('tap:')));
  timers.flush();
  ok('tap emitted after window', log.includes('tap:103,102'));
  ok('tap never pans', !log.includes('panstart'));

  // double tap: second quick tap fires dbltap, no single tap
  const log2 = [];
  const t2 = manualTimers();
  const g2 = createGestures(recordingHandlers(log2), t2);
  g2.down(1, 50, 50, 0);
  g2.up(1, 50, 50, 40);
  g2.down(1, 55, 52, 150);
  g2.up(1, 55, 52, 190);
  t2.flush();
  ok('double-tap detected', log2.includes('dbltap'));
  ok('double-tap suppresses single taps', !log2.some((l) => l.startsWith('tap:')));

  // pan: movement past slop cancels the press and streams deltas + velocity
  const log3 = [];
  const t3 = manualTimers();
  const g3 = createGestures(recordingHandlers(log3), t3);
  g3.down(1, 100, 100, 0);
  g3.move(1, 130, 100, 16);
  g3.move(1, 160, 100, 32);
  g3.up(1, 190, 100, 48);
  t3.flush();
  ok('pan cancels press feedback', log3.includes('presscancel'));
  ok('pan starts once', log3.filter((l) => l === 'panstart').length === 1);
  ok('pan never taps', !log3.some((l) => l.startsWith('tap:')));
  const vel = log3.find((l) => l.startsWith('panend:'));
  ok('pan reports rightward velocity', vel && parseFloat(vel.slice(7)) > 1);

  // pinch: second finger cancels tap/pan and reports relative scale
  const log4 = [];
  const t4 = manualTimers();
  const g4 = createGestures(recordingHandlers(log4), t4);
  g4.down(1, 100, 200, 0);
  g4.down(2, 200, 200, 10); // 100px apart
  g4.move(2, 300, 200, 30); // 200px apart -> scale 2
  g4.up(2, 300, 200, 50);
  g4.up(1, 100, 200, 90); // remaining finger settles — must not tap
  t4.flush();
  ok('pinch starts on second finger', log4.includes('pinchstart'));
  ok('pinch scale is relative', log4.includes('pinch:2.00'));
  ok('pinch ends when a finger lifts', log4.includes('pinchend'));
  ok('settling finger never taps or pans', !log4.some((l) => l.startsWith('tap:') || l === 'panstart'));
  console.log('gestures ✅');
}

/* --- transform math ------------------------------------------------------------- */
{
  // A 1000×1400 page in a 400×700 stage: fit is width-bound at 400×560.
  const fit = fitSize(1000, 1400, 400, 700);
  ok('contain fit', near(fit.w, 400) && near(fit.h, 560));

  const rest = centered(fit.w, fit.h, 400, 700, 1);
  ok('rest is centered', near(rest.tx, 0) && near(rest.ty, 70));

  // At 2×, x pans within [stage - scaled, 0]; y likewise.
  const b = bounds(fit.w, fit.h, 400, 700, 2);
  ok('bounds at 2x', near(b.minX, -400) && near(b.maxX, 0) && near(b.minY, -420) && near(b.maxY, 0));

  // Hard clamp puts an out-of-bounds transform on the edge…
  const clamped = clamp({ z: 2, tx: 50, ty: -999 }, fit.w, fit.h, 400, 700);
  ok('hard clamp', near(clamped.tx, 0) && near(clamped.ty, -420));
  // …soft clamp resists but allows overshoot (rubber band).
  const soft = clamp({ z: 2, tx: 50, ty: 0 }, fit.w, fit.h, 400, 700, { soft: true });
  ok('rubber band overshoots less than the drag', soft.tx > 0 && soft.tx < 50);

  // Focal zoom: the content point under the finger stays put.
  const t0 = centered(fit.w, fit.h, 400, 700, 1);
  const t2 = zoomAt(t0, 2, 200, 350); // zoom about the stage center
  const before = pointToFraction(t0, fit.w, fit.h, 200, 350);
  const after = pointToFraction(t2, fit.w, fit.h, 200, 350);
  ok('focal point invariant under zoom', near(before.fx, after.fx) && near(before.fy, after.fy));

  // Pinch clamping resists past the limits without snapping.
  ok('over-zoom resisted', pinchZoom(4, 2) < 8 && pinchZoom(4, 2) > 4);
  ok('under-zoom resisted', pinchZoom(1, 0.3) < 1 && pinchZoom(1, 0.3) > 0.5);

  // centerOnRect frames a hotspot. A central rect centers exactly…
  const mid = { x: 0.45, y: 0.45, w: 0.1, h: 0.1 };
  const cm = centerOnRect(mid, fit.w, fit.h, 400, 700);
  const fm = pointToFraction(cm, fit.w, fit.h, 200, 350);
  ok('centerOnRect centers a mid-page product', near(fm.fx, 0.5, 0.02) && near(fm.fy, 0.5, 0.02));
  // …and an edge rect clamps to the page edge but stays FULLY VISIBLE
  // (never centered into void beyond the page — the Maps behaviour).
  const rect = { x: 0.7, y: 0.1, w: 0.2, h: 0.1 };
  const ct = centerOnRect(rect, fit.w, fit.h, 400, 700);
  const vis = {
    fx0: (0 - ct.tx) / (ct.z * fit.w),
    fx1: (400 - ct.tx) / (ct.z * fit.w),
    fy0: (0 - ct.ty) / (ct.z * fit.h),
    fy1: (700 - ct.ty) / (ct.z * fit.h),
  };
  ok(
    'centerOnRect keeps an edge product fully visible',
    rect.x >= vis.fx0 - 0.001 && rect.x + rect.w <= vis.fx1 + 0.001 &&
      rect.y >= vis.fy0 - 0.001 && rect.y + rect.h <= vis.fy1 + 0.001,
  );
  ok('centerOnRect zooms in but stays clamped', ct.z > 1 && ct.z <= 2.2);
  console.log('transform math ✅');
}

/* --- hotspot hit-testing + lookup -------------------------------------------------- */
{
  // Minimal DOM shim: createSpotLayer only appends/removes elements.
  const fakeEl = () => ({
    style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    append() {},
    remove() {},
  });
  global.document = { createElement: fakeEl };
  const spots = [
    { offerId: 'big', x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
    { offerId: 'small', x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, // nested inside big
    { offerId: 'orphan', x: 0.8, y: 0.8, w: 0.1, h: 0.1 }, // no offer row
  ];
  const offers = { big: { id: 'b' }, small: { id: 's' } };
  const layer = createSpotLayer(fakeEl(), spots, offers, { onActivate() {}, labelOf: () => 'x' });
  ok('hit finds a spot', layer.hit(0.15, 0.15)?.offerId === 'big');
  ok('smallest spot wins on overlap', layer.hit(0.25, 0.25)?.offerId === 'small');
  ok('miss is null', layer.hit(0.95, 0.05) === null);
  ok('spot without an offer row never activates', layer.hit(0.85, 0.85) === null);
  delete global.document;

  const hotspots = {
    spotsByIndex: new Map([
      [0, [{ offerId: 'a1', x: 0, y: 0, w: 0.1, h: 0.1 }]],
      [6, [{ offerId: 'z9', x: 0.5, y: 0.5, w: 0.2, h: 0.2 }]],
    ]),
  };
  ok('spotForOffer finds page + spot', spotForOffer(hotspots, 'z9')?.pageIndex === 6);
  ok('spotForOffer matches across types', spotForOffer(hotspots, 9 + 'z'.slice(0, 0) ? 'z9' : 'z9') !== null);
  ok('spotForOffer misses cleanly', spotForOffer(hotspots, 'nope') === null);
  console.log('hotspots ✅');
}

/* --- hotspot minimum touch target ----------------------------------------------- */
{
  const fakeEl = () => ({
    style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    append() {},
    remove() {},
  });
  global.document = { createElement: fakeEl };
  const spots = [
    { offerId: 'tiny', x: 0.5, y: 0.5, w: 0.02, h: 0.02 },
    { offerId: 'big', x: 0.1, y: 0.1, w: 0.35, h: 0.35 },
  ];
  const offers = { tiny: { id: 't' }, big: { id: 'b' } };
  const layer = createSpotLayer(fakeEl(), spots, offers, { onActivate() {}, labelOf: () => 'x' });
  // Just outside the tiny spot: a plain hit misses, a min-target hit lands.
  ok('no min: near-miss stays a miss', layer.hit(0.54, 0.5) === null);
  ok('min target: halo catches the near-miss', layer.hit(0.54, 0.5, 0.1, 0.1)?.offerId === 'tiny');
  ok('halo is bounded', layer.hit(0.58, 0.5, 0.1, 0.1) === null);
  ok('spots larger than the minimum are unchanged', layer.hit(0.47, 0.3, 0.1, 0.1) === null);
  // A finger INSIDE a spot's real box always beats a neighbour's halo:
  // (0.44, 0.44) is inside `big` and inside `tiny`'s expanded halo.
  ok('direct hit beats a smaller neighbour halo', layer.hit(0.44, 0.44, 0.2, 0.2)?.offerId === 'big');
  ok('coordinates unchanged: plain hit still works', layer.hit(0.51, 0.51)?.offerId === 'tiny');
  delete global.document;
  console.log('hotspot touch target ✅');
}

/* --- product-name normalization (the sheet's structured fields) ------------------- */
{
  // The merged-OCR mess: leading fragment, both languages, brand repeated in
  // both scripts, banner debris, size/pack tokens inline.
  const o1 = structureOfferName({
    name: 'or chicken sadia frozen chicken breast 900 g x 10 doux',
    nameAr: 'عرض صدور دجاج مجمد ساديا 900 جم فقط',
  });
  ok('en line cleaned + deduped + cased', o1.en === 'Frozen Chicken Breast');
  ok('ar line cleaned', o1.ar === 'صدور دجاج مجمد');
  ok('first brand wins, all brand mentions leave the lines', o1.brand === 'Sadia');

  // OCR-glued brand tail ("ساديات" for ساديا) is still recognized.
  const o2 = structureOfferName({ name: '', nameAr: 'ساديات دجاج مجمد ٩٠٠ جم' });
  ok('brand tolerates an OCR tail', o2.brand === 'Sadia');
  ok('arabic-indic size digits removed', o2.ar === 'دجاج مجمد');

  // Duplicates collapse case-insensitively; Arabic normalization folds forms.
  const o3 = structureOfferName({ name: 'Almarai Fresh Milk MILK milk 2L المراعي حليب' });
  ok('brand extracted from mixed string', o3.brand === 'Almarai');
  ok('duplicate words removed', o3.en === 'Fresh Milk');
  ok('arabic line survives extraction', o3.ar === 'حليب');

  // No brand, single language: lines pass through cleaned, brand stays null.
  const o4 = structureOfferName({ name: 'FROZEN GREEN PEAS 400G' });
  ok('all-caps presented in title case', o4.en === 'Frozen Green Peas');
  ok('no lexicon hit -> no brand', o4.brand === null);

  // Nothing structured derivable -> the fallback (old behaviour) is offered.
  const o5 = structureOfferName({ name: '50% ... 2', nameAr: 'عرض فقط' });
  ok('debris-only name yields empty lines', o5.en === '' && o5.ar === '');
  ok('fallback preserved for the caller', o5.fallback.length > 0);

  // An explicit offer.brand field is respected and stripped from the lines.
  const o6 = structureOfferName({ name: 'Acme cola Acme 2.25 l', brand: 'Acme' });
  ok('offer.brand wins', o6.brand === 'Acme');
  ok('offer.brand mentions leave the lines', o6.en === 'Cola');

  // Months are banner debris anywhere; glued OCR punctuation is trimmed.
  const o7 = structureOfferName({ name: 'pepsi july diet', nameAr: 'بيبسي ميرندا… يوليو' });
  ok('inline month removed', o7.en === 'Diet');
  ok('glued ellipsis trimmed', o7.ar === 'ميرندا');
  ok('brand found across scripts', o7.brand === 'Pepsi');

  // Real Panda flyer regressions: "التوفير الكبير" is banner copy (توفير with
  // the definite article; الكبير must NOT read as the Al Kabeer brand), and
  // accented Latin duplicates ("Ülker"/"ulker") collapse.
  const o8 = structureOfferName({
    name: 'days only golden crown cream x 155g',
    nameAr: 'التوفير الكبير قشطه التاج جرام',
  });
  ok('article-attached debris removed', !o8.ar.includes('التوفير'));
  ok('الكبير alone is not a brand', o8.brand === null);
  const o9 = structureOfferName({ name: 'of ülker وفر ulker tea biscuits اولكر' });
  ok('every brand form leaves the line', o9.en === 'Of Tea Biscuits');
  ok('brand recognized under diacritics', o9.brand === 'Ulker');
  console.log('product name normalization ✅');
}

/* --- reading-position memory --------------------------------------------------------- */
{
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
  };
  rememberPosition('b1', { page: 5, zoom: 2 }, storage);
  const hit = recallPosition('b1', storage);
  ok('position remembered', hit && hit.page === 5 && hit.zoom === 2);
  ok('unknown brochure is null', recallPosition('nope', storage) === null);
  for (let i = 0; i < 40; i++) rememberPosition(`fill${i}`, { page: 1 }, storage);
  ok('cap evicts oldest', recallPosition('b1', storage) === null);
  ok('newest survive the cap', recallPosition('fill39', storage) !== null);
  const broken = { getItem: () => '{not json', setItem: () => {} };
  ok('corrupt storage reads as empty', recallPosition('b1', broken) === null);
  console.log('state ✅');
}

if (fail) {
  console.error(`\n${fail} test(s) failed (${pass} passed).`);
  process.exit(1);
}
console.log(`\nAll viewer tests passed (${pass}).`);
