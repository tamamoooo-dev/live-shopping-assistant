// alertsPage.js — the Alerts page (#/alerts): the user's price watches and the
// alerts they produced, plus the shared "watch a price" dialog that the search
// page (summary + result cards) opens.
//
// A watch = "tell me when I can buy this at ≤ my target price". Two kinds:
//   • product — a specific identifiable product (e.g. an Amazon ASIN): the
//     engine re-finds THAT product daily and reads its price.
//   • grocery — a staple query: the engine sweeps every online store AND the
//     current flyer offers daily and takes the best trustworthy price.
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
} from './brochure.js';
import { t } from './i18n.js';
import { notificationTarget } from './notificationNavigation.js';

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
const sourceLabel = (s) => (s === 'online' || s === 'flyer' ? t(`alerts.source.${s}`) : s);

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
  form.appendChild(
    el(
      'p',
      'wd-hint',
      opts.kind === 'product'
        ? t('watch.hintProduct', { store: storeLabel(opts.provider) || opts.provider })
        : t('watch.hintGrocery'),
    ),
  );

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
  const toggles = {};
  if (opts.kind === 'grocery') {
    for (const [key, labelKey] of [
      ['matchBrand', 'watch.matchBrand'],
      ['matchSize', 'watch.matchSize'],
      ['matchVariant', 'watch.matchVariant'],
    ]) {
      const control = el('label', 'wd-toggle');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      toggles[key] = checkbox;
      control.append(checkbox, el('span', null, t(labelKey)));
      advancedBody.appendChild(control);
    }
  }
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
  const advancedHint = el('p', 'wd-advanced-hint');
  advancedBody.appendChild(advancedHint);
  const refreshAdvancedHint = () => {
    if (toggles.matchSize && !toggles.matchSize.checked) {
      advancedHint.textContent = t('watch.unitPriceHint');
    } else {
      advancedHint.textContent = '';
    }
    if (toggles.matchBrand && !toggles.matchBrand.checked &&
        !toggles.matchSize.checked && !toggles.matchVariant.checked) {
      advancedHint.textContent = t('watch.categoryHint');
    }
  };
  for (const checkbox of Object.values(toggles)) checkbox.addEventListener('change', refreshAdvancedHint);
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
      // Unchecking any of these asks for a CLASS rather than a product. The
      // ENGINE turns them into a spec, using the same extractor that will
      // classify candidates at check time — deriving the spec here instead
      // would pin it in one vocabulary and test it in another.
      matchBrand: toggles.matchBrand ? toggles.matchBrand.checked : true,
      matchSize: toggles.matchSize ? toggles.matchSize.checked : true,
      matchVariant: toggles.matchVariant ? toggles.matchVariant.checked : true,
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
  if (['anchored_registry', 'anchored_source', 'anchored_spec'].includes(state)) return null;
  if (state === 'confirmation_required') {
    return { kind: 'needs-confirmation', label: t('alerts.needsConfirmation'), actionable: true };
  }
  if (state === 'unresolvable') {
    return { kind: 'unresolvable', label: t('alerts.unresolvable'), actionable: false };
  }
  return { kind: 'resolving', label: t('alerts.resolving'), actionable: false };
}

function watchRow(w, onDelete, onUpdate) {
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

  // Thumbnail — the product at a glance. Falls back to a neutral tile when
  // there's no image or it fails to load (a watch must never show a broken img).
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
  row.appendChild(thumb);

  const main = el('div', 'watch-main');

  // Primary — the product name, the thing the eye should land on; its colour
  // carries the state (green = deal, red = watching).
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
  main.appendChild(name);

  // Secondary — the living status. Friendly and active, never technical. The
  // colour cue lives on the title above; this line stays neutral.
  const status = el(
    'div',
    'watch-status',
    unanchored
      ? unanchored.label
      : hasDeal ? t('alerts.dealFound') : isClose ? t('alerts.closePrice') : t('alerts.stillWatching'),
  );
  main.appendChild(status);

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

  // Only 'needs-confirmation' has a user action: the resolver found more than
  // one plausible product and is asking rather than guessing.
  if (unanchored?.actionable) {
    const cta = el('button', 'watch-confirm', t('alerts.confirmCta'));
    cta.type = 'button';
    cta.addEventListener('click', () => openConfirmPicker(w, cta, onUpdate));
    main.appendChild(cta);
  }
  if ((unanchored && !unanchored.actionable) ||
      (!unanchored && ['anchor_unavailable', 'not_found'].includes(w.monitoringHealth))) {
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
    price.textContent = t('alerts.checkingDaily');
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

  {
    const advanced = el('details', 'watch-advanced');
    advanced.appendChild(el('summary', 'watch-advanced-title', t('watch.advanced')));
    const body = el('div', 'watch-advanced-body');
    const controls = {};
    if (w.kind === 'grocery') {
      for (const [key, labelKey] of [
        ['matchBrand', 'watch.matchBrand'],
        ['matchSize', 'watch.matchSize'],
        ['matchVariant', 'watch.matchVariant'],
      ]) {
        const control = el('label', 'wd-toggle');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = w[key] !== false;
        controls[key] = checkbox;
        control.append(checkbox, el('span', null, t(labelKey)));
        body.appendChild(control);
      }
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
    const hint = el('p', 'watch-advanced-hint');
    const refreshHint = () => {
      if (!controls.matchBrand) {
        hint.textContent = '';
        return;
      }
      hint.textContent = !controls.matchBrand.checked &&
        !controls.matchSize.checked &&
        !controls.matchVariant.checked
        ? t('watch.categoryHint')
        : !controls.matchSize.checked
          ? t('watch.unitPriceHint')
          : '';
    };
    for (const checkbox of Object.values(controls)) checkbox.addEventListener('change', refreshHint);
    refreshHint();
    body.appendChild(hint);
    const save = el('button', 'watch-settings-save', t('watch.saveSettings'));
    save.type = 'button';
    const saveError = el('p', 'wd-error');
    saveError.hidden = true;
    save.addEventListener('click', async () => {
      save.disabled = true;
      save.textContent = t('watch.saving');
      const res = await updateWatch(w.id, {
        ...(w.kind === 'grocery' ? {
          matchBrand: controls.matchBrand.checked,
          matchSize: controls.matchSize.checked,
          matchVariant: controls.matchVariant.checked,
        } : {}),
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
    main.appendChild(advanced);
  }

  row.appendChild(main);

  const del = el('button', 'watch-delete', '✕');
  del.type = 'button';
  del.title = t('alerts.stopWatching');
  del.setAttribute('aria-label', t('alerts.stopWatchingItem', { label: w.label || w.query }));
  del.addEventListener('click', () => onDelete(w, row));
  row.appendChild(del);

  return row;
}

function alertRow(a, watchById, onDelete) {
  const row = el('div', 'alert-row');
  if (!a.seen) row.classList.add('is-unseen');
  if (a.alertType === 'close') row.classList.add('is-close');
  const w = watchById.get(a.watchId);

  const main = el('div', 'alert-main');
  const title = el('div', 'alert-title');
  title.dir = 'auto';
  title.textContent = t(a.alertType === 'close' ? 'alerts.closeHit' : 'alerts.hit', {
    label: w ? w.label || w.query : a.name || t('alerts.watchedProduct'),
    price: a.unitLabel
      ? `${Number(a.price).toFixed(2)} ${a.unitLabel}`
      : money(a.price, a.currency),
  });
  main.appendChild(title);
  const detail = el('div', 'alert-detail');
  detail.dir = 'auto';
  const bits = [];
  if (a.name) bits.push(a.name);
  bits.push(t('alerts.atStore', { store: storeLabel(a.store) || a.store || '—' }));
  bits.push(t('alerts.targetWas', {
    price: a.unitLabel
      ? `${Number(a.targetPrice).toFixed(2)} ${a.unitLabel}`
      : money(a.targetPrice, a.currency),
  }));
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
