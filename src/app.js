// app.js — wires the UI to the Core + Panda provider.
// Pure DOM, no framework. Keep it small.

import { createMemory, adaptiveSearch } from './core.js';
import { pandaProvider } from './providers/panda.js';

const memory = createMemory('app');

const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const button = document.getElementById('search-button');
const loading = document.getElementById('loading');
const status = document.getElementById('status');
const results = document.getElementById('results');

let inFlight = null; // lets a newer search cancel an older one's rendering

form.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch(input.value);
});

async function runSearch(query) {
  const q = (query || '').trim();
  if (!q) {
    input.focus();
    return;
  }

  const token = {};
  inFlight = token;

  setBusy(true);
  status.textContent = '';
  results.innerHTML = '';

  try {
    const { results: items } = await adaptiveSearch(pandaProvider, q, memory);
    if (inFlight !== token) return; // a newer search took over
    render(items, q);
  } catch (err) {
    if (inFlight !== token) return;
    showError(err);
  } finally {
    if (inFlight === token) setBusy(false);
  }
}

function setBusy(busy) {
  loading.hidden = !busy;
  button.disabled = busy;
  input.setAttribute('aria-busy', String(busy));
}

function showError(err) {
  status.textContent =
    'Could not reach Panda right now. Please check your connection and try again.';
  if (err && err.details) console.warn('Search failed:', err.details);
  else console.warn('Search failed:', err);
}

function render(items, query) {
  if (!items.length) {
    status.textContent = `No results for “${query}”.`;
    return;
  }
  status.textContent = `${items.length} result${items.length > 1 ? 's' : ''} for “${query}”`;
  const frag = document.createDocumentFragment();
  for (const item of items) frag.appendChild(card(item));
  results.appendChild(frag);
}

function money(value, currency) {
  if (value == null) return '';
  return `${value.toFixed(2)} ${currency}`;
}

function card(item) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = item.link;
  a.target = '_blank';
  a.rel = 'noopener';

  // Image
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img';
  if (item.image) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = item.name;
    img.src = item.image;
    img.addEventListener('error', () => imgWrap.classList.add('no-img'));
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('no-img');
  }

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = item.name;
  body.appendChild(name);

  const meta = [item.brand, item.size].filter(Boolean).join(' · ');
  if (meta) {
    const m = document.createElement('div');
    m.className = 'card-meta';
    m.textContent = meta;
    body.appendChild(m);
  }

  const priceRow = document.createElement('div');
  priceRow.className = 'card-prices';
  if (item.price != null) {
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = money(item.price, item.currency);
    priceRow.appendChild(price);

    if (item.oldPrice != null) {
      const old = document.createElement('span');
      old.className = 'old-price';
      old.textContent = money(item.oldPrice, item.currency);
      priceRow.appendChild(old);
    }
    if (item.discountLabel) {
      const tag = document.createElement('span');
      tag.className = 'discount';
      tag.textContent = item.discountLabel;
      priceRow.appendChild(tag);
    }
  } else {
    const noPrice = document.createElement('span');
    noPrice.className = 'no-price';
    noPrice.textContent = 'Tap to see price';
    priceRow.appendChild(noPrice);
  }
  body.appendChild(priceRow);

  a.appendChild(imgWrap);
  a.appendChild(body);
  return a;
}

input.focus();
