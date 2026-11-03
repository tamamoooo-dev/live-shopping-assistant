// alertsPage.v2.js — the Alerts page (#/alerts): the user's price watches and the
// alerts they produced, plus the shared "watch a price" dialog that the search
// page (summary + result cards) opens.
//
// A watch = "tell me when I can buy this at ≤ my target price". Since v4 every
// new watch is a VALUE WATCH: this exact product (brand, variant, size per
// item) in any pack, at any store or flyer, compared PER ITEM — 12 cans for 50
// beats one can for 5. The engine indexes every store in the background, keeps
// a verdict per listing (the owner can overrule it here), and checks at
// 07:00/19:00 Riyadh. Older watches (v3 tracks) still render as before.
//
// All engine knowledge stays in brochure.js (project rule 2); this module only
// renders and calls its thin clients. Everything is best-effort: engine down →
// an honest "unavailable" note, never a broken page.

import {
  listWatches,
  createWatch,
  updateWatch,
  deleteWatch,
  listAlerts,
  markAlertsSeen,
  storeLabel,
  watchCandidates,
  confirmWatchProduct,
  confirmWatchSource,
  declineWatchCandidates,
  diagnoseWatch,
  repairWatch,
  refreshWatch,
  watchListings,
  answerWatchListing,
} from './brochure.js';
import { t } from './i18n.js';
import { notificationTarget } from './notificationNavigation.js?v=20260825.7';
import { manualRefreshReason } from './watchRefresh.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function money(v, c = 'SAR') {
  return v == null ? '' : `${Number(v).toFixed(2)} ${c}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Alert source label — a translated label for known sources, else the raw
// source string the engine sent (never a bare i18n key).
const sourceLabel = (s) => (['online', 'flyer', 'browser'].includes(s) ? t(`alerts.source.${s}`) : s);

// --- the unseen-alerts badge (topbar + tab bar) --------------------------------
export function setAlertsBadge(n) {
  for (const link of document.querySelectorAll('[data-nav="alerts"]')) {
    let dot = link.querySelector('.nav-badge');
    if (n > 0) {
      if (!dot) {
        dot = el('span', 'nav-badge');
        link.appendChild(dot);
      }
      dot.textContent = n > 9 ? '9+' : String(n);
    } else if (dot) {
      dot.remove();
    }
  }
}

// Poll once at boot so the badge appears without visiting the page.
export async function refreshAlertsBadge() {
  const data = await listWatches();
  if (data) setAlertsBadge(data.unseenAlerts || 0);
}

// --- the watch dialog (shared with the search page) ----------------------------
// openWatchDialog({ kind, query, label, suggestedPrice, currentPrice, provider,
// productId, link, image, sizeText, onCreated })
export function openWatchDialog(opts) {
  document.querySelector('.watch-dialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.className = 'watch-dialog';

  const form = el('form', 'wd-form');
  form.method = 'dialog';

  form.appendChild(el('h2', 'wd-title', t('watch.title')));
  const what = el('div', 'wd-what');
  what.dir = 'auto';
  what.textContent = opts.label || opts.query;
  form.appendChild(what);
  form.appendChild(el('p', 'wd-hint', t('watch.hintValue')));

  const row = el('label', 'wd-row');
  row.appendChild(el('span', 'wd-label', t('watch.rowLabel')));
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.05';
  input.min = '0.05';
  input.required = true;
  input.className = 'wd-input';
  if (opts.suggestedPrice != null) input.value = String(Math.round(opts.suggestedPrice * 20) / 20);
  row.appendChild(input);
  form.appendChild(row);
  if (opts.currentPrice != null) {
    form.appendChild(el('p', 'wd-current', t('watch.currentBest', { price: money(opts.currentPrice) })));
  }

  const advanced = el('details', 'wd-advanced');
  advanced.appendChild(el('summary', 'wd-advanced-title', t('watch.advanced')));
  const advancedBody = el('div', 'wd-advanced-body');
  const searchRow = el('label', 'wd-row');
  searchRow.appendChild(el('span', 'wd-label', t('watch.searchQuery')));
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.maxLength = 120;
  searchInput.className = 'wd-input';
  searchInput.placeholder = opts.query || t('watch.searchPlaceholder');
  searchRow.appendChild(searchInput);
  advancedBody.appendChild(searchRow);
  advancedBody.appendChild(el('p', 'wd-advanced-hint', t('watch.searchHintValue')));
  const closeRow = el('label', 'wd-row');
  closeRow.appendChild(el('span', 'wd-label', t('watch.closeThreshold')));
  const closeInput = document.createElement('input');
  closeInput.type = 'number';
  closeInput.min = '0.1';
  closeInput.max = '100';
  closeInput.step = '0.1';
  closeInput.placeholder = t('watch.closePlaceholder');
  closeInput.className = 'wd-input';
  closeRow.appendChild(closeInput);
  advancedBody.appendChild(closeRow);
  advanced.appendChild(advancedBody);
  form.appendChild(advanced);

  const err = el('p', 'wd-error');
  err.hidden = true;
  form.appendChild(err);

  const actions = el('div', 'wd-actions');
  const cancel = el('button', 'wd-cancel', t('watch.cancel'));
  cancel.type = 'button';
  cancel.addEventListener('click', () => dlg.close());
  const save = el('button', 'wd-save', t('watch.start'));
  save.type = 'submit';
  actions.append(cancel, save);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetPrice = Number(input.value);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return;
    save.disabled = true;
    save.textContent = t('watch.saving');
    const res = await createWatch({
      kind: opts.kind,
      query: opts.query,
      label: opts.label,
      targetPrice,
      provider: opts.provider,
      productId: opts.productId,
      registryProductId: opts.registryProductId,
      link: opts.link,
      image: opts.image,
      sizeText: opts.sizeText,
      brand: opts.brand,
      category: opts.category,
      // THE LISTING the user is actually looking at. The engine resolves
      // identity from this, in the foreground, at creation. Sending the
      // structured fields (brand, size) rather than only a label is what lets
      // the resolver bind the right product instead of asking — the retailer's
      // own brand and size columns are the strongest evidence available.
      listing: opts.listing || {
        id: opts.productId,
        provider: opts.provider,
        name: opts.label || opts.query,
        brand: opts.brand || null,
        size: opts.sizeText || null,
        link: opts.link || null,
        image: opts.image || null,
      },
      // Blank means the engine-generated wording. An entered phrase is one
      // more store search; it never changes which product is watched.
      customSearchQuery: searchInput.value.trim() || null,
      closeThreshold: closeInput.value === '' ? null : Number(closeInput.value),
    });
    if (res.error) {
      err.textContent = res.error;
      err.hidden = false;
      save.disabled = false;
      save.textContent = t('watch.start');
      return;
    }
    dlg.close();
    invalidate(); // the Alerts page re-renders on next visit
    if (opts.onCreated) opts.onCreated(res.watch);
  });

  dlg.appendChild(form);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // backdrop click
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  input.focus();
  input.select();
}

// --- the page ------------------------------------------------------------------
let rendered = false;
function invalidate() {
  rendered = false;
}

// A watch renders in one of two living states, read straight from its latest
// check: 🟢 a deal (current best is at/below target) or 🔴 still watching.
// Visual hierarchy — the product (thumb + name) is primary and state-coloured,
// then the friendly status, the current best price, and the quiet
// scope/target/checked line last.
// The confirmation picker. Deliberately inline and minimal — this is a
// single-user tool, and the question ("which of these is it?") does not need a
// modal. Candidates come from the engine; "none of these" is not offered
// because minting a product from a name the resolver already rejected would
// re-create exactly the ambiguity the user is here to settle.
async function openConfirmPicker(w, cta, onUpdate) {
  if (cta.dataset.open === '1') return;
  cta.dataset.open = '1';
  cta.disabled = true;
  const list = el('div', 'watch-candidates');
  list.appendChild(el('div', 'watch-candidates-title', t('alerts.confirmTitle')));
  cta.after(list);

  const result = await watchCandidates(w.id);
  if (!result.candidates.length || !result.version) {
    list.appendChild(el('div', 'watch-candidates-empty', t('alerts.confirmNone')));
    cta.disabled = false;
    cta.dataset.open = '0';
    return;
  }
  if (result.reason) list.appendChild(el('div', 'watch-candidates-empty', result.reason));
  for (const c of result.candidates) {
    const btn = el('button', 'watch-candidate');
    btn.type = 'button';
    btn.dir = 'auto';
    if (c.image) {
      const img = document.createElement('img');
      img.src = c.image;
      img.alt = '';
      img.loading = 'lazy';
      btn.appendChild(img);
    }
    const size = c.size?.value && c.size?.unit
      ? `${c.count && c.count > 1 ? `${c.count} × ` : ''}${c.size.value} ${c.size.unit}`
      : c.size || null;
    const copy = el('span', 'watch-candidate-copy');
    copy.appendChild(el('strong', null, c.name || c.nameAr || c.productId));
    copy.appendChild(el(
      'span',
      null,
      [c.brand, size, (c.providers || []).map(storeLabel).filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · '),
    ));
    const evidence = c.runnerEvidence || c.evidence || [];
    if (evidence.length) copy.appendChild(el('small', null, evidence.join(' · ')));
    btn.appendChild(copy);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = c.type === 'source'
        ? await confirmWatchSource(w.id, c.provider, c.productId, result.version)
        : await confirmWatchProduct(w.id, c.productId, result.version);
      if (res.error) {
        btn.disabled = false;
        list.appendChild(el('div', 'watch-candidates-empty', res.error));
        return;
      }
      list.replaceChildren(el('div', 'watch-candidates-empty', t('alerts.confirmed')));
      if (onUpdate) onUpdate();
    });
    list.appendChild(btn);
  }
  const actions = el('div', 'watch-candidate-actions');
  const none = el('button', 'watch-confirm', t('alerts.confirmNoneAction'));
  none.type = 'button';
  none.addEventListener('click', async () => {
    none.disabled = true;
    const res = await declineWatchCandidates(w.id, result.version);
    if (res.error) {
      none.disabled = false;
      list.appendChild(el('div', 'watch-candidates-empty', res.error));
      return;
    }
    if (onUpdate) onUpdate();
  });
  const later = el('button', 'watch-diagnose', t('alerts.confirmLater'));
  later.type = 'button';
  later.addEventListener('click', () => {
    list.remove();
    cta.disabled = false;
    cta.dataset.open = '0';
  });
  actions.append(none, later);
  list.appendChild(actions);
}

// Is this watch actually monitoring? A watch with no product anchor is not,
// and must never render as if it were. `unanchored` carries the ENGINE's own
// explanation (last_resolution + reason) rather than a guess made here.
// "Why is this quiet?" — shown on demand for a watch that IS anchored but is
// not finding its product. The engine reports each live candidate with the
// resolver's own rejection reason; this only renders it.
async function openDiagnostics(w, cta) {
  if (cta.dataset.open === '1') return;
  cta.dataset.open = '1';
  cta.disabled = true;
  const panel = el('div', 'watch-diagnostics');
  panel.appendChild(el('div', 'watch-candidates-title', t('alerts.diagnoseTitle')));
  cta.after(panel);

  const d = await diagnoseWatch(w.id);
  cta.disabled = false;
  cta.dataset.open = '0';
  if (!d) {
    panel.replaceChildren(el('div', 'watch-candidates-empty', t('alerts.diagnoseFailed')));
    return;
  }
  panel.replaceChildren(el('div', 'watch-candidates-title', t('alerts.diagnoseTitle')));
  panel.appendChild(el(
    'div', 'watch-candidates-empty',
    t('alerts.diagnoseSummary', { seen: d.seen ?? 0, matched: d.matched ?? 0 }),
  ));
  for (const c of (d.candidates || []).slice(0, 8)) {
    const row = el('div', `watch-diag-row ${c.matched ? 'is-match' : ''}`);
    row.dir = 'auto';
    row.textContent = `${c.matched ? '✓' : '✕'} ${c.name || '—'} · ${c.store || ''}`
      + (c.reason ? ` · ${c.reason}` : '');
    panel.appendChild(row);
  }
  for (const note of (d.notes || []).slice(0, 3)) {
    panel.appendChild(el('div', 'watch-candidates-empty', note));
  }
}

// A watch's spec, parsed. Stored as JSON text by the engine.
function parseWatchSpec(w) {
  if (!w || !w.spec) return null;
  if (typeof w.spec === 'object') return w.spec;
  try { return JSON.parse(w.spec); } catch { return null; }
}

function anchorState(w) {
  const state = w.anchorState || (
    w.registryProductId ? 'anchored_registry' :
      w.spec ? 'anchored_spec' :
        w.lastResolution === 'needs-confirmation' ? 'confirmation_required' :
          w.lastResolution === 'unresolvable' ? 'unresolvable' : 'resolving'
  );
  if (['anchored_registry', 'anchored_source', 'anchored_spec', 'anchored_value'].includes(state)) return null;
  if (state === 'confirmation_required') {
    return { kind: 'needs-confirmation', label: t('alerts.needsConfirmation'), actionable: true };
  }
  if (state === 'unresolvable') {
    return { kind: 'unresolvable', label: t('alerts.unresolvable'), actionable: false };
  }
  return { kind: 'resolving', label: t('alerts.resolving'), actionable: false };
}

// Thumbnail — the product at a glance. Falls back to a neutral tile when
// there's no image or it fails to load (a watch must never show a broken img).
function watchThumb(w) {
  const thumb = el('div', 'watch-thumb');
  if (w.image) {
    const img = document.createElement('img');
    img.src = w.image;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      thumb.classList.add('is-empty');
    });
    thumb.appendChild(img);
  } else {
    thumb.classList.add('is-empty');
  }
  return thumb;
}

// The product name, linked to where the current best price is.
function watchName(w) {
  const name = el('a', 'watch-name');
  name.dir = 'auto';
  name.textContent = w.label || w.query;
  const navTarget = notificationTarget(w, {
    store: w.lastStore || w.provider,
    source: w.lastSource,
    name: w.lastName,
    link: w.lastLink || w.link,
  });
  name.href = navTarget.href;
  if (navTarget.kind === 'external') {
    name.target = '_blank';
    name.rel = 'noopener';
  }
  return name;
}

function watchDelete(w, row, onDelete) {
  const del = el('button', 'watch-delete', '✕');
  del.type = 'button';
  del.title = t('alerts.stopWatching');
  del.setAttribute('aria-label', t('alerts.stopWatchingItem', { label: w.label || w.query }));
  del.addEventListener('click', () => onDelete(w, row));
  return del;
}

// The per-watch settings: the extra search phrase and the close band.
function watchSettings(w, row, onUpdate) {
  const advanced = el('details', 'watch-advanced');
  advanced.appendChild(el('summary', 'watch-advanced-title', t('watch.advanced')));
  const body = el('div', 'watch-advanced-body');
  const exactAmazon = w.watchTrack === 'amazon_exact';
  const valueWatch = w.watchTrack === 'indexed_value';
  let searchInput = null;
  if (!exactAmazon) {
    const search = el('label', 'watch-close-control');
    search.appendChild(el('span', null, t('watch.searchQuery')));
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.maxLength = 120;
    searchInput.value = w.customSearchQuery || '';
    searchInput.placeholder = w.systemSearchQuery || w.query || t('watch.searchPlaceholder');
    search.appendChild(searchInput);
    body.appendChild(search);
    body.appendChild(el('p', 'watch-advanced-hint', t(valueWatch ? 'watch.searchHintValue' : 'watch.searchHint')));
  }
  const close = el('label', 'watch-close-control');
  close.appendChild(el('span', null, t('watch.closeThreshold')));
  const closeInput = document.createElement('input');
  closeInput.type = 'number';
  closeInput.min = '0.1';
  closeInput.max = '100';
  closeInput.step = '0.1';
  closeInput.value = w.closeThreshold ?? '';
  closeInput.placeholder = t('watch.closePlaceholder');
  close.appendChild(closeInput);
  body.appendChild(close);
  const save = el('button', 'watch-settings-save', t('watch.saveSettings'));
  save.type = 'button';
  const saveError = el('p', 'wd-error');
  saveError.hidden = true;
  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = t('watch.saving');
    const res = await updateWatch(w.id, {
      ...(!exactAmazon ? { customSearchQuery: searchInput.value.trim() || null } : {}),
      closeThreshold: closeInput.value === '' ? null : Number(closeInput.value),
    });
    if (res.error) {
      saveError.textContent = res.error;
      saveError.hidden = false;
      save.disabled = false;
      save.textContent = t('watch.saveSettings');
      return;
    }
    onUpdate(res.watch, row);
  });
  body.append(save, saveError);
  advanced.appendChild(body);
  return advanced;
}

const perItem = (v, c) => `${money(v, c)} ${t('alerts.perItem')}`;

// "6 × 185 g" / "185 g" for a listing in the index.
function packText(pack, item) {
  const size = item ? itemText(item) : null;
  if (pack > 1) return size ? `${pack} × ${size}` : t('alerts.packOf', { count: pack });
  return size || '';
}

function itemText(item) {
  if (!item) return '';
  if (item.unit === 'ml') return item.value >= 1000 ? `${+(item.value / 1000).toFixed(3)} L` : `${item.value} ml`;
  if (item.unit === 'g') return item.value >= 1000 ? `${+(item.value / 1000).toFixed(3)} kg` : `${item.value} g`;
  if (item.unit === 'pcs') return t('alerts.pieces', { count: item.value });
  return `${item.value} ${item.unit}`;
}

// What a Value Watch is tracking, store by store, with the owner's answers.
// The engine decides every listing once (rules, then its checker); a wrong
// decision is corrected here and the engine never overrides the correction.
async function openListings(w, cta, onUpdate) {
  // The panel opens below the row of buttons, not between them.
  const host = cta.closest('.watch-actions') || cta;
  const existing = host.nextElementSibling;
  if (existing?.classList.contains('watch-listings')) {
    existing.remove();
    cta.textContent = t('alerts.listingsCta');
    return;
  }
  cta.disabled = true;
  const panel = el('div', 'watch-listings');
  panel.appendChild(el('div', 'watch-candidates-empty', t('alerts.loading')));
  host.after(panel);
  const view = await watchListings(w.id);
  cta.disabled = false;
  cta.textContent = t('alerts.listingsHide');
  if (!view) {
    panel.replaceChildren(el('div', 'watch-candidates-empty', t('alerts.diagnoseFailed')));
    return;
  }
  renderListings(w, panel, view, onUpdate);
}

function renderListings(w, panel, view, onUpdate, note = null) {
  panel.replaceChildren();
  if (note) panel.appendChild(el('div', 'watch-listings-note', note));
  const groups = [
    ['match', t('alerts.listingsMatched'), true],
    ['pending', t('alerts.listingsPending'), true],
    ['reject', t('alerts.listingsRejected'), false],
  ];
  for (const [verdict, title, open] of groups) {
    const rows = view.listings.filter((l) => l.verdict === verdict);
    if (!rows.length) continue;
    const group = el('details', `watch-listings-group is-${verdict}`);
    group.open = open;
    group.appendChild(el('summary', 'watch-candidates-title', `${title} (${rows.length})`));
    for (const l of rows.slice(0, 30)) group.appendChild(listingRow(w, l, panel, onUpdate));
    panel.appendChild(group);
  }
  if (!view.listings.length) {
    panel.appendChild(el('div', 'watch-candidates-empty', t('alerts.listingsNone')));
  }
}

function listingRow(w, l, panel, onUpdate) {
  const row = el('div', `watch-listing is-${l.verdict}`);
  const copy = el('div', 'watch-listing-copy');
  const name = l.link ? el('a', 'watch-listing-name') : el('span', 'watch-listing-name');
  name.dir = 'auto';
  name.textContent = l.name || l.listingId;
  if (l.link) {
    name.href = l.link;
    name.target = '_blank';
    name.rel = 'noopener';
  }
  copy.appendChild(name);
  const bits = [storeLabel(l.store) || l.store];
  // A flyer offer, or a price read in the owner's own browser (Lulu, Carrefour).
  if (l.source === 'flyer' || l.source === 'browser') bits.push(t(`alerts.source.${l.source}`));
  const size = packText(l.pack, l.item);
  if (size) bits.push(size);
  if (l.price != null) bits.push(money(l.price));
  if (l.value != null && (l.pack || 1) > 1) bits.push(perItem(l.value));
  // Out of stock: still tracked, never the deal.
  if (l.inStock === false) bits.push(t('alerts.listingOutOfStock'));
  const facts = el('div', 'watch-listing-facts', bits.join(' · '));
  facts.dir = 'auto';
  copy.appendChild(facts);
  const why = l.verdictBy === 'user'
    ? t('alerts.listingByYou')
    : l.reason || null;
  if (why) {
    const reason = el('div', 'watch-listing-reason', why);
    reason.dir = 'auto';
    copy.appendChild(reason);
  }
  row.appendChild(copy);
  const answer = l.verdict === 'match'
    ? { verdict: 'reject', label: t('alerts.listingNotThis') }
    : { verdict: 'match', label: t('alerts.listingIsThis') };
  const btn = el('button', 'watch-listing-answer', answer.label);
  btn.type = 'button';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const res = await answerWatchListing(w.id, { store: l.store, listingId: l.listingId, verdict: answer.verdict });
    if (res.error) {
      btn.disabled = false;
      btn.textContent = res.error;
      return;
    }
    renderListings(w, panel, res, onUpdate, t('alerts.listingsRecheck'));
  });
  row.appendChild(btn);
  return row;
}

// The size-per-item question, asked only when the picked listing did not say
// and the stores list the product in several sizes.
function sizeChooser(w, choices, onUpdate) {
  const box = el('div', 'watch-size-choice');
  box.appendChild(el('div', 'watch-candidates-title', t('alerts.whichSize')));
  for (const item of choices) {
    const btn = el('button', 'watch-candidate', itemText(item));
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await answerWatchListing(w.id, { item });
      if (res.error) {
        btn.disabled = false;
        btn.textContent = res.error;
        return;
      }
      if (onUpdate) onUpdate();
    });
    box.appendChild(btn);
  }
  return box;
}

// Which watch cards are open. Kept across the page's own repaints (a saved
// setting or an answered listing redraws the list), forgotten on reload.
const openWatches = new Set();

// A Value Watch card. Closed it is two lines: the product, then the best price
// per item, where, and the target — plus "N to confirm" when listings wait for
// the owner, because those are how a deal gets missed. Everything else opens
// with the arrow.
function valueWatchRow(w, onDelete, onUpdate) {
  const v = w.value || {};
  const target = v.targetValue ?? w.targetUnitPrice ?? w.targetPrice;
  const best = v.best || null;
  const indexing = !w.checkedAt && ['pending', 'indexing'].includes(w.indexState);
  const retrying = w.run?.status === 'retrying' || w.run?.status === 'running';
  const hasDeal = Boolean(w.isBelow) || (w.lastPrice != null && w.lastPrice <= target + 1e-9);
  const isClose = !hasDeal && Boolean(w.isClose);
  const row = el('div', `watch-row is-compact ${hasDeal ? 'is-deal' : isClose ? 'is-close' : 'is-watching'}`);
  row.appendChild(watchThumb(w));
  const main = el('div', 'watch-main');
  main.appendChild(watchName(w));

  const line = el('div', 'watch-line');
  line.dir = 'auto';
  const price = el('span', 'watch-price');
  if (best && best.value != null) {
    const store = storeLabel(best.store) || best.store || '';
    price.textContent = (hasDeal ? '✓ ' : '')
      + perItem(best.value)
      + (store ? ` · ${store}` : '')
      + (best.source === 'flyer' ? t('alerts.flyerSuffix') : '');
    if (hasDeal) price.classList.add('is-deal');
  } else {
    price.textContent = indexing ? t('alerts.indexingShort') : retrying ? t('alerts.retryingShort') : t('alerts.checkingDaily');
    price.classList.add('is-pending');
  }
  line.appendChild(price);
  if (target != null) line.appendChild(el('span', 'watch-target', t('alerts.target', { price: money(target) })));
  if (v.pending) line.appendChild(el('span', 'watch-badge', t('alerts.toConfirm', { count: v.pending })));
  main.appendChild(line);
  row.appendChild(main);

  const toggle = el('button', 'watch-toggle');
  toggle.type = 'button';
  toggle.appendChild(el('span', 'watch-toggle-icon'));
  row.appendChild(toggle);
  row.appendChild(watchDelete(w, row, onDelete));

  // The details are built the first time the card opens.
  const more = el('div', 'watch-more');
  more.id = `watch-more-${w.id}`;
  toggle.setAttribute('aria-controls', more.id);
  const setOpen = (open) => {
    if (open && !more.childElementCount) {
      watchDetails(more, w, { target, best, hasDeal, isClose, indexing, retrying, row, onUpdate });
    }
    more.hidden = !open;
    row.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    const label = t(open ? 'alerts.hideDetails' : 'alerts.showDetails');
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    if (open) openWatches.add(w.id);
    else openWatches.delete(w.id);
  };
  toggle.addEventListener('click', () => setOpen(more.hidden));
  row.appendChild(more);
  // A size question cannot wait behind the arrow: the watch needs the answer.
  const needsAnswer = !v.item && Array.isArray(v.sizeChoices) && v.sizeChoices.length > 1;
  setOpen(openWatches.has(w.id) || needsAnswer);
  return row;
}

// The opened card: what "the same product" means, what the index holds, who
// did not answer, the settings and the actions.
function watchDetails(more, w, { target, best, hasDeal, isClose, indexing, retrying, row, onUpdate }) {
  const v = w.value || {};
  const add = (cls, text) => {
    const node = el('div', cls, text);
    node.dir = 'auto';
    more.appendChild(node);
    return node;
  };
  add('watch-status', indexing
    ? t('alerts.indexing')
    : retrying
      ? t('alerts.retrying', { attempt: w.run?.attempts || 1 })
      : hasDeal ? t('alerts.dealFound') : isClose ? t('alerts.closePrice') : t('alerts.stillWatching'));
  add('watch-reason', v.itemLabel ? t('alerts.valueBasis', { item: v.itemLabel }) : t('alerts.valueBasisUnknown'));
  if (!v.item && Array.isArray(v.sizeChoices) && v.sizeChoices.length > 1) {
    more.appendChild(sizeChooser(w, v.sizeChoices, onUpdate));
  }
  // The pack behind the best price per item: what you actually pay.
  if (best && best.value != null && (best.pack || 1) > 1) {
    add('watch-reason', t('alerts.forPack', { price: money(best.purchasePrice), count: best.pack }));
  }
  // What the index holds, and who did not answer (never a silent gap).
  if (v.matched != null) {
    const parts = [t('alerts.tracking', { count: v.matched, stores: (v.storesAnswered || []).length })];
    if (v.pending) parts.push(t('alerts.trackingPending', { count: v.pending }));
    add('watch-reason', parts.join(' · '));
  }
  const names = (stores) => stores.map((s) => storeLabel(s) || s).join(', ');
  // Stores checked on request in the owner's browser; each price stands 12
  // hours, and while it does the store is not reported as down or blocked.
  const checked = Object.entries(v.browser || {}).filter(([, c]) => c && c.at);
  const fresh = new Set(checked.filter(([, c]) => Date.now() - Date.parse(c.at) < 12 * 3600 * 1000).map(([s]) => s));
  const down = (v.storesFailed || []).filter((s) => !fresh.has(s));
  const blocked = (v.storesBlocked || []).filter((s) => !fresh.has(s));
  if (down.length) add('watch-reason', t('alerts.storesDown', { stores: names(down) }));
  if (blocked.length) add('watch-reason', t('alerts.storesBlocked', { stores: names(blocked) }));
  if (checked.length) {
    add('watch-reason', t('alerts.browserChecked', {
      stores: checked.map(([s, c]) => `${storeLabel(s) || s} ${fmtDate(c.at)}`).join(', '),
    }));
  }
  if (w.monitoringHealth && !['ok', 'unchecked'].includes(w.monitoringHealth) && w.monitoringHealthReason) {
    add('watch-reason', w.monitoringHealthReason);
  }

  const targetText = (v.pack || 1) > 1 && v.targetPackPrice != null
    ? t('alerts.valueTarget', { price: money(v.targetPackPrice), count: v.pack, each: money(target) })
    : t('alerts.target', { price: money(target) });
  const bits = [t('alerts.scopeValue'), targetText];
  if (w.closeThreshold != null) bits.push(t('alerts.closeWithin', { percent: w.closeThreshold }));
  bits.push(w.checkedAt ? t('alerts.checkedAt', { date: fmtDate(w.checkedAt) }) : t('alerts.firstCheck'));
  add('watch-meta', bits.join(' · '));

  const actions = el('div', 'watch-actions');
  const listings = el('button', 'watch-diagnose', t('alerts.listingsCta'));
  listings.type = 'button';
  listings.addEventListener('click', () => openListings(w, listings, onUpdate));
  const recheck = el('button', 'watch-refresh', t('alerts.recheckAll'));
  recheck.type = 'button';
  recheck.addEventListener('click', async () => {
    recheck.disabled = true;
    const res = await refreshWatch(w.id);
    recheck.textContent = res.error || t('alerts.recheckQueued');
  });
  actions.append(listings, recheck);
  more.appendChild(actions);
  more.appendChild(watchSettings(w, row, onUpdate));
}

function watchRow(w, onDelete, onUpdate) {
  if (w.watchTrack === 'indexed_value') return valueWatchRow(w, onDelete, onUpdate);
  // The comparison basis is DERIVED from the anchor, exactly as the engine
  // derives it: a Flexible Watch that leaves size free compares per unit.
  const spec = parseWatchSpec(w);
  const unitMode = spec ? spec.size == null : false;
  const target = unitMode && w.targetUnitPrice != null ? w.targetUnitPrice : w.targetPrice;
  const unanchored = anchorState(w);
  const hasDeal = !unanchored && w.lastPrice != null && w.lastPrice <= target + 1e-9;
  const isClose =
    !hasDeal &&
    w.lastPrice != null &&
    w.closeThreshold != null &&
    w.lastPrice <= target * (1 + Number(w.closeThreshold) / 100) + 1e-9;
  const state = unanchored
    ? `is-unanchored is-${unanchored.kind}`
    : hasDeal ? 'is-deal' : isClose ? 'is-close' : 'is-watching';
  const row = el('div', `watch-row ${state}`);

  row.appendChild(watchThumb(w));

  const main = el('div', 'watch-main');

  // Primary — the product name, the thing the eye should land on; its colour
  // carries the state (green = deal, red = watching).
  main.appendChild(watchName(w));

  // Secondary — the living status. Friendly and active, never technical. The
  // colour cue lives on the title above; this line stays neutral.
  const retrying = w.run?.status === 'retrying' || w.run?.status === 'running';
  const status = el(
    'div',
    'watch-status',
    unanchored
      ? unanchored.label
      : retrying
        ? t('alerts.retrying', { attempt: w.run?.attempts || 1 })
        : hasDeal ? t('alerts.dealFound') : isClose ? t('alerts.closePrice') : t('alerts.stillWatching'),
  );
  main.appendChild(status);

  // Keep the phrase that will actually reach every store visible on the card.
  // The advanced override is a user instruction, so hiding it behind a closed
  // details element made a correct backend change look unchanged.
  const effectiveQuery = w.customSearchQuery || w.systemSearchQuery;
  if (effectiveQuery) {
    const queryLine = el(
      'div',
      'watch-reason',
      `${t('watch.searchQuery')}: ${effectiveQuery}`,
    );
    queryLine.dir = 'auto';
    main.appendChild(queryLine);
  }

  // The engine's own reason, verbatim. A quiet watch must be able to say why
  // it is quiet — that is the difference between this design and the one it
  // replaced, and paraphrasing it here would put the explanation back out of
  // sync with the check that produced it.
  const identityReason = w.identityResolutionReason || w.lastResolutionReason;
  if (unanchored && identityReason) {
    const why = el('div', 'watch-reason', identityReason);
    why.dir = 'auto';
    main.appendChild(why);
  }

  // An ANCHORED watch that keeps reporting something other than 'ok' is the
  // case diagnostics exists for: the anchor is fine, so the real question is
  // which candidates the resolver saw and why it rejected each one.
  if (!unanchored && w.monitoringHealth &&
      !['ok', 'unchecked'].includes(w.monitoringHealth)) {
    if (w.monitoringHealthReason) {
      const healthReason = el('div', 'watch-reason', w.monitoringHealthReason);
      healthReason.dir = 'auto';
      main.appendChild(healthReason);
    }
    const why = el('button', 'watch-diagnose', t('alerts.diagnoseCta'));
    why.type = 'button';
    why.addEventListener('click', () => openDiagnostics(w, why));
    main.appendChild(why);
  }

  // A manual retry is exceptional: provider failure, first evaluation, or a
  // check older than the daily schedule plus grace. The endpoint enforces the
  // same gate. A successful evaluation repaints the row without this button.
  if (!unanchored && !w.watchTrack && manualRefreshReason(w)) {
    const refresh = el('button', 'watch-refresh', t('alerts.refreshNow'));
    refresh.type = 'button';
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = t('alerts.refreshing');
      const result = await refreshWatch(w.id);
      if (result.error) {
        refresh.disabled = false;
        refresh.textContent = result.error;
        return;
      }
      if (onUpdate) onUpdate(result.watch, row);
    });
    main.appendChild(refresh);
  }

  // Only 'needs-confirmation' has a user action: the resolver found more than
  // one plausible product and is asking rather than guessing.
  if (unanchored?.actionable) {
    const cta = el('button', 'watch-confirm', t('alerts.confirmCta'));
    cta.type = 'button';
    cta.addEventListener('click', () => openConfirmPicker(w, cta, onUpdate));
    main.appendChild(cta);
  }
  if (!w.watchTrack && ((unanchored && !unanchored.actionable) ||
      (!unanchored && ['anchor_unavailable', 'not_found'].includes(w.monitoringHealth)))) {
    const repair = el('button', 'watch-diagnose', t('alerts.repairCta'));
    repair.type = 'button';
    repair.addEventListener('click', async () => {
      repair.disabled = true;
      repair.textContent = t('alerts.repairing');
      const result = await repairWatch(w.id);
      if (result.error) {
        repair.disabled = false;
        repair.textContent = result.error;
        return;
      }
      if (onUpdate) onUpdate();
    });
    main.appendChild(repair);
  }

  // Current best price — the number the user actually cares about. An
  // unanchored watch has no current price by definition: showing the last one
  // it ever found would be the stale-number bug the redesign removed.
  const price = el('div', 'watch-price');
  if (unanchored) {
    price.textContent = unanchored.kind === 'resolving'
      ? t('alerts.resolvingPrice')
      : t('alerts.pendingMigration');
    price.classList.add('is-pending');
  } else if (w.lastPrice != null) {
    const store = storeLabel(w.lastStore) || w.lastStore || '';
    price.textContent =
      (w.lastUnitLabel ? `${Number(w.lastPrice).toFixed(2)} ${w.lastUnitLabel}` : money(w.lastPrice)) +
      (store ? ` ${t('alerts.atStore', { store })}` : '') +
      (w.lastSource === 'flyer' ? t('alerts.flyerSuffix') : '');
    if (hasDeal) price.classList.add('is-deal');
  } else {
    price.textContent = retrying ? t('alerts.retryingShort') : t('alerts.checkingDaily');
    price.classList.add('is-pending');
  }
  main.appendChild(price);

  // Tertiary — quiet supporting details.
  // A spec-anchored watch covers a CLASS; a product-anchored one covers one
  // product. That is now readable straight off the anchor rather than inferred
  // from three booleans that no longer drive anything.
  const categoryLevel = Boolean(spec);
  const scope = (w.scope || (w.kind === 'product' ? 'store' : 'market')) === 'store'
    ? t('alerts.scopeProduct', { store: storeLabel(w.provider) || w.provider })
    : categoryLevel
      ? t('alerts.scopeCategory')
      : t('alerts.scopeAll');
  const targetText = unitMode && w.unitLabel
    ? `${Number(target).toFixed(2)} ${w.unitLabel}`
    : money(target);
  const bits = [scope, t('alerts.target', { price: targetText })];
  if (w.closeThreshold != null) bits.push(t('alerts.closeWithin', { percent: w.closeThreshold }));
  bits.push(w.checkedAt ? t('alerts.checkedAt', { date: fmtDate(w.checkedAt) }) : t('alerts.firstCheck'));
  const meta = el('div', 'watch-meta', bits.join(' · '));
  meta.dir = 'auto';
  main.appendChild(meta);

  main.appendChild(watchSettings(w, row, onUpdate));

  row.appendChild(main);
  row.appendChild(watchDelete(w, row, onDelete));

  return row;
}

function alertRow(a, watchById, onDelete) {
  const row = el('div', 'alert-row');
  if (!a.seen) row.classList.add('is-unseen');
  if (a.alertType === 'close') row.classList.add('is-close');
  const w = watchById.get(a.watchId);
  // A Value Watch alert carries the price PER ITEM ('per-item') and the price
  // actually paid for the pack.
  const fmt = (v) => (a.unitLabel === 'per-item'
    ? perItem(v, a.currency)
    : a.unitLabel ? `${Number(v).toFixed(2)} ${a.unitLabel}` : money(v, a.currency));

  const main = el('div', 'alert-main');
  const title = el('div', 'alert-title');
  title.dir = 'auto';
  title.textContent = t(
    a.alertType === 'close' ? 'alerts.closeHit' : a.alertType === 'lower' ? 'alerts.lowerHit' : 'alerts.hit',
    {
      label: w ? w.label || w.query : a.name || t('alerts.watchedProduct'),
      price: fmt(a.price),
    },
  );
  main.appendChild(title);
  const detail = el('div', 'alert-detail');
  detail.dir = 'auto';
  const bits = [];
  if (a.name) bits.push(a.name);
  if (a.unitLabel === 'per-item' && a.purchasePrice != null && Math.abs(a.purchasePrice - a.price) > 0.005) {
    bits.push(t('alerts.paid', { price: money(a.purchasePrice, a.currency) }));
  }
  bits.push(t('alerts.atStore', { store: storeLabel(a.store) || a.store || '—' }));
  bits.push(t('alerts.targetWas', { price: fmt(a.targetPrice) }));
  if (a.source) bits.push(sourceLabel(a.source));
  detail.textContent = bits.join(' · ');
  main.appendChild(detail);
  if (a.source === 'flyer') {
    main.appendChild(el('div', 'alert-note', t('alerts.flyerVerify')));
  }
  row.appendChild(main);

  const side = el('div', 'alert-side');
  side.appendChild(el('span', 'alert-when', fmtDate(a.observedAt)));
  {
    const go = el('a', 'alert-link', t('alerts.view'));
    const target = notificationTarget(w || {}, a);
    go.href = target.href;
    if (target.kind === 'external') {
      go.target = '_blank';
      go.rel = 'noopener';
    }
    side.appendChild(go);
  }
  row.appendChild(side);

  // A completed alert is deletable with the SAME action as an active watch
  // (the engine's DELETE /watches removes the watch and its alerts together).
  // Only offered when we know which watch produced it.
  if (a.watchId && typeof onDelete === 'function') {
    const label = w ? w.label || w.query : a.name || t('alerts.watchedProduct');
    const del = el('button', 'watch-delete', '✕');
    del.type = 'button';
    del.title = t('alerts.deleteAlert');
    del.setAttribute('aria-label', t('alerts.deleteAlertItem', { label }));
    del.addEventListener('click', () => onDelete(a, row));
    row.appendChild(del);
  }
  return row;
}

export async function initAlertsPage(force = false) {
  if (rendered && !force) return;
  rendered = true;
  const root = document.getElementById('alerts-root');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(el('p', 'alerts-loading', t('alerts.loading')));

  const [watchData, alertData] = await Promise.all([listWatches(), listAlerts(50)]);
  root.innerHTML = '';

  if (!watchData) {
    root.appendChild(el('p', 'alerts-empty', t('alerts.unreachable')));
    rendered = false; // retry on next visit
    return;
  }

  const watchById = new Map(watchData.watches.map((w) => [w.id, w]));

  // Watches
  const wHead = el('div', 'alerts-section-head');
  wHead.appendChild(el('h2', null, t('alerts.watchedTitle')));
  wHead.appendChild(el('span', 'alerts-count', t('alerts.watchCount', { count: watchData.watches.length, max: watchData.max })));
  root.appendChild(wHead);
  if (!watchData.watches.length) {
    const empty = el('div', 'alerts-empty');
    empty.append(
      el('p', null, t('alerts.noneWatched')),
      el('p', 'alerts-empty-hint', t('alerts.noneWatchedHint')),
    );
    root.appendChild(empty);
  } else {
    const list = el('div', 'watch-list');
    for (const w of watchData.watches) {
      list.appendChild(
        watchRow(
          w,
          async (watch, row) => {
            row.classList.add('is-deleting');
            const okDel = await deleteWatch(watch.id);
            if (okDel) row.remove();
            else row.classList.remove('is-deleting');
          },
          () => initAlertsPage(true),
        ),
      );
    }
    root.appendChild(list);
  }

  // Alerts
  const aHead = el('div', 'alerts-section-head');
  aHead.appendChild(el('h2', null, t('alerts.alertsTitle')));
  root.appendChild(aHead);
  if (!alertData || !alertData.alerts.length) {
    root.appendChild(el('p', 'alerts-empty', t('alerts.noAlerts')));
  } else {
    const list = el('div', 'alert-list');
    const onAlertDelete = async (alert, row) => {
      row.classList.add('is-deleting');
      const okDel = await deleteWatch(alert.watchId);
      // Deleting the watch cascades to its alerts (and drops it from the
      // Watches list), so repaint both sections to stay consistent.
      if (okDel) initAlertsPage(true);
      else row.classList.remove('is-deleting');
    };
    for (const a of alertData.alerts) list.appendChild(alertRow(a, watchById, onAlertDelete));
    root.appendChild(list);
  }

  // Viewing the page marks alerts read and clears the badge.
  if (alertData && alertData.unseen > 0) {
    await markAlertsSeen();
  }
  setAlertsBadge(0);
}
