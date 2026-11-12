// browserRelay.js — "use my browser": a store that refuses the connector
// (Lulu's firewall) can still be searched by the owner's own Chrome.
//
// The owner installs the "Super Search: my browser" extension on their PC
// (serverless-connector/browser-relay/). It shows a 12-character code. Typed
// here once, the code travels as the X-Relay-Key header with this browser's
// own searches of that store; the connector hands such a search to the Chrome
// holding the same code and returns its answer like any store's.
//
// Only a search the person starts here goes that way. Without a code nothing
// changes: the store shows "blocks online checks", as before.
//
// The code is stored with the local profile (this browser only).

import { t } from './i18n.js';
import { profileGet, profileSet } from './profile.js';

const CONNECTOR_BASE = 'https://shopping-connector.tamamoooo.workers.dev';
export const RELAY_HEADER = 'X-Relay-Key';
// Stores the extension can read.
export const RELAY_STORES = new Set(['lulu']);
const STATES = new Set(['offline', 'refused', 'stopped', 'paused', 'busy', 'timeout', 'no-price', 'error']);

// The code as people type it: any case, dashes or spaces, 0 for O, 1 for I.
export function cleanRelayKey(raw) {
  const key = String(raw || '')
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/[^A-Z2-7]/g, '');
  return /^[A-Z2-7]{12}$/.test(key) ? key : null;
}

export function relayKey() {
  return cleanRelayKey(profileGet('relayKey', ''));
}

// Why the browser did not answer, per store, from the last search.
const last = new Map();
export function noteRelayState(store, state) {
  if (state) last.set(store, STATES.has(state) ? state : 'error');
  else last.delete(store);
}

export function setRelayKey(raw) {
  const key = cleanRelayKey(raw);
  profileSet('relayKey', key || '');
  last.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lsa:relay-changed'));
  return key;
}

// One short line for a blocked store: what the owner can do, or why their
// browser did not answer. null for a store the extension cannot read.
export function relayNote(store) {
  if (!RELAY_STORES.has(store)) return null;
  if (!relayKey()) return t('relay.offer');
  const state = last.get(store);
  return state ? t(`relay.state.${state}`) : null;
}

// true / false, or null when the connector could not be asked.
export async function relayConnected() {
  const key = relayKey();
  if (!key) return false;
  try {
    const res = await fetch(`${CONNECTOR_BASE}/relay/status`, { headers: { [RELAY_HEADER]: key } });
    if (!res.ok) return null;
    return Boolean((await res.json()).connected);
  } catch {
    return null;
  }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const dashed = (key) => key.replace(/(.{4})(?=.)/g, '$1-');

// The one place the code is typed, changed or removed. `store` names the
// blocked store whose chip was tapped, so the last reason can be shown.
export function openRelayDialog(store = null) {
  const dlg = el('dialog', 'watch-dialog relay-dialog');
  const form = el('form', 'wd-form');
  form.noValidate = true;
  form.append(el('h3', 'wd-title', t('relay.title')));
  form.append(el('p', 'wd-hint', t('relay.what')));
  form.append(el('p', 'wd-hint', t('relay.how')));

  const row = el('label', 'wd-row');
  row.append(el('span', 'wd-label', t('relay.codeLabel')));
  const input = el('input', 'wd-input relay-code');
  input.type = 'text';
  input.dir = 'ltr';
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  input.maxLength = 20;
  input.placeholder = 'XXXX-XXXX-XXXX';
  const current = relayKey();
  if (current) input.value = dashed(current);
  row.append(input);
  form.append(row);

  const state = el('p', 'wd-current relay-state');
  form.append(state);
  const error = el('p', 'wd-error');
  error.hidden = true;
  form.append(error);

  const showState = async () => {
    if (!relayKey()) {
      state.textContent = '';
      return;
    }
    state.textContent = t('relay.checking');
    const connected = await relayConnected();
    if (!state.isConnected) return;
    const why = store && connected ? relayNote(store) : null;
    state.textContent = connected === null ? t('relay.unknown') : connected ? why || t('relay.connected') : t('relay.notConnected');
    state.classList.toggle('is-on', connected === true && !why);
  };

  const actions = el('div', 'wd-actions');
  if (current) {
    const remove = el('button', 'wd-cancel relay-remove', t('relay.remove'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      setRelayKey('');
      dlg.close();
    });
    actions.append(remove);
  }
  const cancel = el('button', 'wd-cancel', t('relay.close'));
  cancel.type = 'button';
  cancel.addEventListener('click', () => dlg.close());
  const save = el('button', 'wd-save', t('relay.save'));
  save.type = 'submit';
  actions.append(cancel, save);
  form.append(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = cleanRelayKey(input.value);
    if (!key) {
      error.textContent = t('relay.badCode');
      error.hidden = false;
      return;
    }
    if (key !== relayKey()) setRelayKey(key);
    dlg.close();
  });

  dlg.append(form);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  if (!current) input.focus();
  showState();
}
