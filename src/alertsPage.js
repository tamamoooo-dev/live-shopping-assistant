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
  deleteWatch,
  listAlerts,
  markAlertsSeen,
  storeLabel,
} from './brochure.js';

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

const SOURCE_LABEL = { online: 'online store', flyer: "this week's flyer" };

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

  form.appendChild(el('h2', 'wd-title', 'Watch this price'));
  const what = el('div', 'wd-what');
  what.dir = 'auto';
  what.textContent = opts.label || opts.query;
  form.appendChild(what);
  form.appendChild(
    el(
      'p',
      'wd-hint',
      opts.kind === 'product'
        ? `Checked daily at ${storeLabel(opts.provider) || opts.provider}. You'll get an alert when this exact product drops to your target.`
        : "Checked daily across every online store and this week's flyers. You'll get an alert when a matching product reaches your target.",
    ),
  );

  const row = el('label', 'wd-row');
  row.appendChild(el('span', 'wd-label', 'Alert me at or below (SAR)'));
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
    form.appendChild(el('p', 'wd-current', `Current best: ${money(opts.currentPrice)}`));
  }

  const err = el('p', 'wd-error');
  err.hidden = true;
  form.appendChild(err);

  const actions = el('div', 'wd-actions');
  const cancel = el('button', 'wd-cancel', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dlg.close());
  const save = el('button', 'wd-save', 'Start watching');
  save.type = 'submit';
  actions.append(cancel, save);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetPrice = Number(input.value);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return;
    save.disabled = true;
    save.textContent = 'Saving…';
    const res = await createWatch({
      kind: opts.kind,
      query: opts.query,
      label: opts.label,
      targetPrice,
      provider: opts.provider,
      productId: opts.productId,
      link: opts.link,
      image: opts.image,
      sizeText: opts.sizeText,
    });
    if (res.error) {
      err.textContent = res.error;
      err.hidden = false;
      save.disabled = false;
      save.textContent = 'Start watching';
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
function watchRow(w, onDelete) {
  const hasDeal = w.lastPrice != null && w.lastPrice <= w.targetPrice + 1e-9;
  const row = el('div', `watch-row ${hasDeal ? 'is-deal' : 'is-watching'}`);

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
  const name = el(w.lastLink || w.link ? 'a' : 'span', 'watch-name');
  name.dir = 'auto';
  name.textContent = w.label || w.query;
  const href = w.lastLink || w.link;
  if (href) {
    name.href = href;
    name.target = '_blank';
    name.rel = 'noopener';
  }
  main.appendChild(name);

  // Secondary — the living status. Friendly and active, never technical. The
  // colour cue lives on the title above; this line stays neutral.
  const status = el('div', 'watch-status', hasDeal ? '✓ Deal found!' : '● Still watching…');
  main.appendChild(status);

  // Current best price — the number the user actually cares about. Shown for
  // both states when a price is known; a gentle note while we're still looking.
  const price = el('div', 'watch-price');
  if (w.lastPrice != null) {
    const store = storeLabel(w.lastStore) || w.lastStore || '';
    price.textContent =
      money(w.lastPrice) +
      (store ? ` at ${store}` : '') +
      (w.lastSource === 'flyer' ? ' (flyer)' : '');
    if (hasDeal) price.classList.add('is-deal');
  } else {
    price.textContent = 'Checking every store daily…';
    price.classList.add('is-pending');
  }
  main.appendChild(price);

  // Tertiary — quiet supporting details.
  const scope =
    w.kind === 'product'
      ? `${storeLabel(w.provider) || w.provider} · this product`
      : 'All stores + flyers';
  const bits = [scope, `target ${money(w.targetPrice)}`];
  bits.push(w.checkedAt ? `checked ${fmtDate(w.checkedAt)}` : 'first check tonight');
  const meta = el('div', 'watch-meta', bits.join(' · '));
  meta.dir = 'auto';
  main.appendChild(meta);

  row.appendChild(main);

  const del = el('button', 'watch-delete', '✕');
  del.type = 'button';
  del.title = 'Stop watching';
  del.setAttribute('aria-label', `Stop watching ${w.label || w.query}`);
  del.addEventListener('click', () => onDelete(w, row));
  row.appendChild(del);

  return row;
}

function alertRow(a, watchById) {
  const row = el('div', 'alert-row');
  if (!a.seen) row.classList.add('is-unseen');
  const w = watchById.get(a.watchId);

  const main = el('div', 'alert-main');
  const title = el('div', 'alert-title');
  title.dir = 'auto';
  title.textContent = `${w ? w.label || w.query : a.name || 'Watched product'} hit ${money(a.price, a.currency)}`;
  main.appendChild(title);
  const detail = el('div', 'alert-detail');
  detail.dir = 'auto';
  const bits = [];
  if (a.name) bits.push(a.name);
  bits.push(`at ${storeLabel(a.store) || a.store || '—'}`);
  bits.push(`target was ${money(a.targetPrice, a.currency)}`);
  if (a.source) bits.push(SOURCE_LABEL[a.source] || a.source);
  detail.textContent = bits.join(' · ');
  main.appendChild(detail);
  if (a.source === 'flyer') {
    main.appendChild(el('div', 'alert-note', 'Flyer price — verify on the flyer before you go.'));
  }
  row.appendChild(main);

  const side = el('div', 'alert-side');
  side.appendChild(el('span', 'alert-when', fmtDate(a.observedAt)));
  if (a.link) {
    const go = el('a', 'alert-link', 'View ↗');
    go.href = a.link;
    go.target = '_blank';
    go.rel = 'noopener';
    side.appendChild(go);
  }
  row.appendChild(side);
  return row;
}

export async function initAlertsPage(force = false) {
  if (rendered && !force) return;
  rendered = true;
  const root = document.getElementById('alerts-root');
  if (!root) return;
  root.innerHTML = '';
  root.appendChild(el('p', 'alerts-loading', 'Loading your watches…'));

  const [watchData, alertData] = await Promise.all([listWatches(), listAlerts(50)]);
  root.innerHTML = '';

  if (!watchData) {
    root.appendChild(el('p', 'alerts-empty', 'The alerts service is unreachable right now — try again in a minute.'));
    rendered = false; // retry on next visit
    return;
  }

  const watchById = new Map(watchData.watches.map((w) => [w.id, w]));

  // Watches
  const wHead = el('div', 'alerts-section-head');
  wHead.appendChild(el('h2', null, 'Watched prices'));
  wHead.appendChild(el('span', 'alerts-count', `${watchData.watches.length} / ${watchData.max}`));
  root.appendChild(wHead);
  if (!watchData.watches.length) {
    const empty = el('div', 'alerts-empty');
    empty.append(
      el('p', null, 'Nothing watched yet.'),
      el('p', 'alerts-empty-hint', 'Search for a product, then use “🔔 Watch price” in the summary — or the bell on any result — to set a target price. The engine checks every store and flyer daily.'),
    );
    root.appendChild(empty);
  } else {
    const list = el('div', 'watch-list');
    for (const w of watchData.watches) {
      list.appendChild(
        watchRow(w, async (watch, row) => {
          row.classList.add('is-deleting');
          const okDel = await deleteWatch(watch.id);
          if (okDel) row.remove();
          else row.classList.remove('is-deleting');
        }),
      );
    }
    root.appendChild(list);
  }

  // Alerts
  const aHead = el('div', 'alerts-section-head');
  aHead.appendChild(el('h2', null, 'Alerts'));
  root.appendChild(aHead);
  if (!alertData || !alertData.alerts.length) {
    root.appendChild(el('p', 'alerts-empty', 'No alerts yet — you’ll see one here (and on the badge) the moment a watched price is reached.'));
  } else {
    const list = el('div', 'alert-list');
    for (const a of alertData.alerts) list.appendChild(alertRow(a, watchById));
    root.appendChild(list);
  }

  // Viewing the page marks alerts read and clears the badge.
  if (alertData && alertData.unseen > 0) {
    await markAlertsSeen();
  }
  setAlertsBadge(0);
}
