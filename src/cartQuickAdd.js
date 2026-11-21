// cartQuickAdd.js — the cart page's Quick add panel: put anything on the
// shopping list in a tap, whether or not any store has an offer for it.
//
//   • Search: type a product; suggestions come from the everyday list below
//     (instant) and the app's local brochure product index (the same
//     background index as the search box's suggestions). The typed text itself
//     can always be added as it is.
//   • Category: the Browse departments; one opens its everyday items as chips.
//
// A quick-add line is plain: no store, no price (cart.js stores it like any
// other item, under the "My list" group). It never calls the engine.

import { addToCart, cartItems, CART_EVENT } from './cart.js';
import { QUICK_DEPARTMENTS, QUICK_ITEMS } from './quickAddCatalog.js';
import { queryBrochureKnowledge } from './knowledgeClient.js';
import { knowledgeText } from './brochureKnowledge.js?v=20261023.search2';
import { t, getLang } from './i18n.js';

const ARABIC = /[؀-ۿ]/;
const label = (node, lang = getLang()) => (lang === 'ar' ? node.ar || node.en : node.en || node.ar);

// The everyday item a text names exactly ("milk" is not "fresh milk";
// "الحليب الطازج" is "حليب طازج").
export function quickItemFor(text) {
  const key = knowledgeText(text);
  if (!key) return null;
  return QUICK_ITEMS.find((it) => knowledgeText(it.en) === key || knowledgeText(it.ar) === key) || null;
}

// A cart entry for a list line. The same everyday item, or the same typed
// words, always get the same id — so adding again is one more of it.
export function listEntry(text) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (!value) return null;
  const known = quickItemFor(value);
  const base = { store: null, price: null, oldPrice: null, currency: 'SAR', image: null, size: null,
    sourceUrl: null, brochureId: null, pageIndex: null, validTo: null };
  if (known) return { ...base, id: `list:${known.id}`, name: known.en, nameAr: known.ar, icon: known.icon };
  const arabic = ARABIC.test(value);
  return { ...base, id: `list:${knowledgeText(value)}`, name: arabic ? null : value, nameAr: arabic ? value : null, icon: '📝' };
}

// Everyday items matching a query: names starting with it first, then names
// containing it, in either language.
export function matchQuickItems(query, limit = 4) {
  const q = knowledgeText(query);
  if (!q) return [];
  const scored = [];
  for (const it of QUICK_ITEMS) {
    const names = [knowledgeText(it.en), knowledgeText(it.ar)];
    const rank = names.some((n) => n.startsWith(q)) ? 0 : names.some((n) => n.includes(q)) ? 1 : -1;
    if (rank >= 0) scored.push({ it, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((s) => s.it);
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const qtyById = () => new Map(cartItems().map((it) => [it.id, it.qty || 1]));

export function mountQuickAdd(container) {
  const panel = el('section', 'cart-quick');
  panel.setAttribute('aria-label', t('cart.quick.title'));

  const form = el('form', 'cart-quick-form');
  form.setAttribute('role', 'search');
  const input = el('input', 'cart-quick-input');
  Object.assign(input, { type: 'search', autocomplete: 'off', placeholder: t('cart.quick.placeholder') });
  input.setAttribute('aria-label', t('cart.quick.inputLabel'));
  input.setAttribute('enterkeyhint', 'done');
  input.dir = 'auto';
  const submit = el('button', 'cart-quick-submit', t('cart.quick.add'));
  submit.type = 'submit';
  form.append(input, submit);

  const suggest = el('div', 'cart-quick-suggest');
  suggest.hidden = true;
  const status = el('p', 'cart-quick-status');
  status.setAttribute('role', 'status');

  const depts = el('div', 'cart-quick-depts');
  const items = el('div', 'cart-quick-items');
  items.hidden = true;
  panel.append(form, suggest, status, depts, items);
  container.append(panel);

  // --- adding -----------------------------------------------------------------
  let statusTimer;
  function add(entry) {
    if (!entry) return;
    addToCart(entry);
    clearTimeout(statusTimer);
    status.textContent = t('cart.quick.added', { name: label({ en: entry.name, ar: entry.nameAr }) });
    statusTimer = setTimeout(() => { status.textContent = ''; }, 1800);
  }

  // --- search -----------------------------------------------------------------
  let revision = 0;
  let timer;
  function row(text, { typed = false } = {}) {
    const b = el('button', `cart-quick-row${typed ? ' is-typed' : ''}`);
    b.type = 'button';
    b.dir = 'auto';
    b.append(el('span', 'cart-quick-plus', '+'), el('span', null, typed ? t('cart.quick.addTyped', { name: text }) : text));
    // Keep the keyboard up on desktop; the click adds and refocuses anyway.
    b.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') e.preventDefault(); });
    b.addEventListener('click', () => {
      add(listEntry(text));
      input.value = '';
      paint([]);
      input.focus({ preventScroll: true });
    });
    return b;
  }
  function paint(rows) {
    suggest.replaceChildren(...rows);
    suggest.hidden = !rows.length;
  }
  function update() {
    clearTimeout(timer);
    const current = ++revision;
    const query = input.value.trim();
    if (!query) return paint([]);
    const seen = new Set();
    const rows = [];
    const push = (text, opts) => {
      const key = knowledgeText(text);
      if (!key || seen.has(key) || rows.length >= 7) return;
      seen.add(key);
      rows.push(row(text, opts));
    };
    // The typed words first, unless they ARE an everyday item (then that item).
    const exact = quickItemFor(query);
    if (exact) push(label(exact));
    else push(query, { typed: true });
    for (const it of matchQuickItems(query)) push(label(it));
    paint(rows);
    timer = setTimeout(async () => {
      try {
        const found = await queryBrochureKnowledge('suggest', {
          query, options: { sizes: true, varieties: true, limit: 6, lang: getLang() },
        });
        if (current !== revision) return;
        for (const s of found || []) push(s.value);
        paint(rows);
      } catch { /* the index is optional: typed words and everyday items still work */ }
    }, 160);
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; paint([]); } });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    add(listEntry(value));
    input.value = '';
    paint([]);
    input.focus({ preventScroll: true });
  });

  // --- categories -------------------------------------------------------------
  let open = null;
  for (const d of QUICK_DEPARTMENTS) {
    const chip = el('button', 'cart-quick-dept');
    chip.type = 'button';
    chip.dataset.dept = d.id;
    chip.setAttribute('aria-pressed', 'false');
    chip.append(el('span', 'cart-quick-dept-icon', d.icon), el('span', null, label(d)));
    chip.addEventListener('click', () => {
      open = open === d.id ? null : d.id;
      for (const c of depts.children) c.setAttribute('aria-pressed', String(c.dataset.dept === open));
      paintItems();
    });
    depts.append(chip);
  }
  function paintItems() {
    const dept = QUICK_DEPARTMENTS.find((d) => d.id === open);
    items.hidden = !dept;
    if (!dept) return items.replaceChildren();
    const held = qtyById();
    items.replaceChildren(...dept.items.map((it) => {
      const qty = held.get(`list:${it.id}`) || 0;
      const chip = el('button', `cart-quick-item${qty ? ' is-in' : ''}`);
      chip.type = 'button';
      chip.append(el('span', 'cart-quick-plus', qty ? '✓' : '+'), el('span', null, label(it)));
      if (qty > 1) chip.append(el('span', 'cart-quick-qty', `×${qty}`));
      chip.setAttribute('aria-label', t('cart.quick.addItem', { name: label(it) }));
      chip.addEventListener('click', () => add(listEntry(label(it))));
      return chip;
    }));
  }
  // Chips show what is already on the list (✓ and ×2) as the cart changes.
  window.addEventListener(CART_EVENT, () => { if (open && panel.isConnected) paintItems(); });
}
