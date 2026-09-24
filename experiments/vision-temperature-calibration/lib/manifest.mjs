// manifest.mjs — the labelled crop set: real D4D product crops whose correct
// current price is known.
//
// Accepted formats (image paths are relative to the manifest file):
//   CSV   id,image,current_price,old_price,d4d_price,store,notes
//   JSON  [{ id, image, currentPrice, oldPrice?, d4dPrice?, store?, notes? }]
//         or { crops: [...] }
// current_price  the price a shopper pays, read by a person from the crop.
// old_price      the crossed-out price when one is VISIBLE on the crop, else empty.
// d4d_price      optional: the price the D4D description states, used only to
//                measure the independent D4D validation signal, never as truth.
//
// The crop bytes are frozen at load: every crop's sha256 is recorded in the
// run, and a resumed run refuses to continue if any byte changed.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { normalizePrice } from './price.mjs';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== '') return o[k];
  return null;
};

export function mimeOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.slice(0, 4).toString('latin1') === 'RIFF' && bytes.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (bytes.slice(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  return null;
}

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function loadManifest(manifestPath) {
  const file = resolve(manifestPath);
  const text = readFileSync(file, 'utf8');
  const raw = extname(file).toLowerCase() === '.csv'
    ? parseCsv(text)
    : (() => { const j = JSON.parse(text); return Array.isArray(j) ? j : j.crops; })();
  if (!Array.isArray(raw) || !raw.length) throw new Error(`manifest ${manifestPath} has no crops`);

  const errors = [];
  const seen = new Set();
  const crops = raw.map((r, i) => {
    const where = `row ${i + 1}`;
    const id = String(pick(r, 'id') ?? '').trim();
    if (!id) errors.push(`${where}: missing id`);
    else if (seen.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    seen.add(id);

    const currentRaw = pick(r, 'currentPrice', 'current_price');
    const oldRaw = pick(r, 'oldPrice', 'old_price');
    const d4dRaw = pick(r, 'd4dPrice', 'd4d_price');
    const currentPrice = normalizePrice(currentRaw);
    const oldPrice = oldRaw == null ? null : normalizePrice(oldRaw);
    const d4dPrice = d4dRaw == null ? null : normalizePrice(d4dRaw);
    if (currentPrice == null) errors.push(`${where} (${id}): current price "${currentRaw}" is not a price`);
    if (oldRaw != null && oldPrice == null) errors.push(`${where} (${id}): old price "${oldRaw}" is not a price`);
    if (d4dRaw != null && d4dPrice == null) errors.push(`${where} (${id}): D4D price "${d4dRaw}" is not a price`);
    if (oldPrice != null && oldPrice === currentPrice) errors.push(`${where} (${id}): old price equals current price`);

    const image = pick(r, 'image');
    let bytes = null;
    let imagePath = null;
    if (!image) errors.push(`${where} (${id}): missing image`);
    else {
      imagePath = resolve(dirname(file), image);
      try {
        bytes = readFileSync(imagePath);
      } catch {
        errors.push(`${where} (${id}): cannot read image ${imagePath}`);
      }
    }
    const mime = bytes ? mimeOf(bytes) : null;
    if (bytes && !mime) errors.push(`${where} (${id}): ${image} is not a JPEG/PNG/WebP/GIF`);

    return {
      id,
      imagePath,
      imageSha256: bytes ? sha256(bytes) : null,
      mime,
      bytes,
      currentPrice,
      oldPrice,
      d4dPrice,
      store: pick(r, 'store'),
      notes: pick(r, 'notes'),
    };
  });
  if (errors.length) throw new Error(`manifest has ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  return crops;
}

// What gets stored with the run: everything except the bytes.
export const cropRecord = ({ bytes, ...rest }) => rest;
