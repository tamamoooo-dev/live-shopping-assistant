// app.js — wires the UI to the Core + Panda provider.
// Pure DOM, no framework. Keep it small.

import { createMemory, adaptiveSearch } from './core.js';
import { pandaProvider } from './providers/panda.js';
import { amazonProvider } from './providers/amazon.js';
import { tamimiProvider } from './providers/tamimi.js';
import { danubeProvider } from './providers/danube.js';
import { luluProvider } from './providers/lulu.js';

const memory = createMemory('app');

// Available stores. The dropdown selects which provider id the connector is
// asked for; everything else (Core, UI flow) is identical.
const PROVIDERS = {
  panda: pandaProvider,
  amazon: amazonProvider,
  tamimi: tamimiProvider,
  danube: danubeProvider,
  lulu: luluProvider,
};

const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const button = document.getElementById('search-button');
const storeSelect = document.getElementById('store-select');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
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

  const providerId = (storeSelect && storeSelect.value) || 'panda';
  const provider = PROVIDERS[providerId];
  // If the selected store isn't known to this (possibly cached) script, say so
  // instead of silently searching a different store.
  if (!provider) {
    results.innerHTML = '';
    status.textContent = 'This store isn’t available yet — please reload the page.';
    return;
  }

  const token = {};
  inFlight = token;

  if (loadingText) loadingText.textContent = `Searching ${provider.label}…`;
  setBusy(true);
  status.textContent = '';
  results.innerHTML = '';

  try {
    const { results: items } = await adaptiveSearch(provider, q, memory);
    if (inFlight !== token) return; // a newer search took over
    render(items, q);
  } catch (err) {
    if (inFlight !== token) return;
    if (providerId === 'amazon') {
      // Amazon is experimental: a bot challenge or empty result is expected
      // occasionally — show a friendly note rather than an error.
      status.textContent = 'Amazon temporarily unavailable. Please try again, or switch to Panda.';
      console.warn('Amazon search failed:', err && err.details ? err.details : err);
    } else {
      showError(err, provider.label);
    }
  } finally {
    if (inFlight === token) setBusy(false);
  }
}

function setBusy(busy) {
  loading.hidden = !busy;
  button.disabled = busy;
  input.setAttribute('aria-busy', String(busy));
}

function showError(err, label = 'the store') {
  status.textContent =
    `Could not reach ${label} right now. Please check your connection and try again.`;
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
