// request.mjs — the request template: the EXACT body the fallback sends to
// Mistral, copied from the engine, with the crop replaced by a placeholder.
//
// The experiment changes one thing and only one thing: `temperature`. The model,
// prompt, response format, top_p and every other field go out byte-for-byte as
// the template has them, and the template's hash (with temperature removed) is
// recorded so every result is tied to the exact configuration that produced it.

import { createHash } from 'node:crypto';

export const IMAGE_PLACEHOLDER = '{{IMAGE_DATA_URL}}';

function walk(node, fn, path = []) {
  fn(node, path);
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, fn, [...path, i]));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, fn, [...path, k]);
}

function stable(node) {
  if (Array.isArray(node)) return node.map(stable);
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.keys(node).sort().map((k) => [k, stable(node[k])]));
  }
  return node;
}

// Validates the template and returns { problems, warnings }. Problems block a run.
export function checkTemplate(template, { requiredModel, allowRandomSeed = false } = {}) {
  const problems = [];
  const warnings = [];
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    return { problems: ['template must be a JSON object (the chat-completions request body)'], warnings };
  }

  const model = template.model;
  if (typeof model !== 'string' || !model.trim() || /[<>]|SET\b/.test(model)) {
    problems.push('template.model is not set — paste the exact model id the fallback sends');
  }
  if (typeof requiredModel !== 'string' || !requiredModel.trim() || /[<>]|SET\b/.test(requiredModel)) {
    problems.push('config.requiredModel is not set — it must repeat the exact model id, as a guard against running the wrong model');
  } else if (model !== requiredModel) {
    problems.push(`template.model "${model}" does not equal config.requiredModel "${requiredModel}" — refusing to run a different model`);
  }

  let placeholders = 0;
  const strays = [];
  walk(template, (node, path) => {
    if (typeof node !== 'string') return;
    if (node === IMAGE_PLACEHOLDER) placeholders++;
    else if (/\{\{[^}]*\}\}/.test(node) || /<SET[^>]*>|<PASTE[^>]*>/.test(node)) strays.push(path.join('.'));
  });
  if (placeholders !== 1) {
    problems.push(`template must contain "${IMAGE_PLACEHOLDER}" exactly once, as the whole string where the crop goes (found ${placeholders})`);
  }
  if (strays.length) problems.push(`template still has unfilled placeholders at: ${strays.join(', ')}`);

  if (template.stream) problems.push('template.stream must not be true');
  if (template.n != null && template.n !== 1) {
    problems.push('template.n must be absent or 1 — each reading is its own call, as in the fallback');
  }
  if (template.random_seed != null || template.seed != null) {
    const msg = 'template sets a random seed — with a fixed seed repeated calls are not independent, so the two-reading rule measures nothing';
    if (allowRandomSeed) warnings.push(`${msg} (allowed by --allow-random-seed because the fallback itself sends it)`);
    else problems.push(`${msg}. If the fallback really sends it, rerun with --allow-random-seed`);
  }
  if (template.temperature != null) {
    warnings.push(`template.temperature (${template.temperature}) is overridden per call by the experiment`);
  }
  return { problems, warnings };
}

// Identity of the configuration under test: everything but temperature.
export function templateHash(template) {
  const { temperature, ...rest } = template;
  return createHash('sha256').update(JSON.stringify(stable(rest))).digest('hex');
}

export function buildBody(template, { imageDataUrl, temperature }) {
  const body = JSON.parse(JSON.stringify(template), (k, v) => (v === IMAGE_PLACEHOLDER ? imageDataUrl : v));
  body.temperature = temperature;
  return body;
}

// "ministral-14b-latest" and "ministral-14b-2512" are the same model family;
// "mistral-medium-latest" is not. Used to refuse readings from a model other
// than the one requested (an alias resolving somewhere unexpected).
export function modelFamily(id) {
  return String(id || '')
    .toLowerCase()
    .replace(/-(latest|\d{4}(-\d{2}(-\d{2})?)?)$/, '');
}
