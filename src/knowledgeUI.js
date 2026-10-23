import { queryBrochureKnowledge } from './knowledgeClient.js';
import { t, getLang } from './i18n.js';
import { preferredSuggestions, mergeSuggestions } from './searchPreferences.js';

export function initKnowledgeSearch(input, form, lookup = queryBrochureKnowledge) {
  const list = document.getElementById('search-suggestions');
  let suggestions = [], active = -1, revision = 0, timer;
  const close = () => {
    revision++; clearTimeout(timer);
    suggestions = []; active = -1;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  function accept(index) {
    if (!suggestions[index]) return;
    input.value = suggestions[index].value;
    close(); input.focus(); update();
  }
  function paint(found) {
    suggestions = found; active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    for (const [i, suggestion] of found.entries()) {
      const li = document.createElement('li');
      li.id = `completion-${i}`; li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false'); li.dir = 'auto';
      const title = document.createElement('strong'); title.textContent = suggestion.value;
      li.append(title);
      // Keep focus, and consume the completed click before replacing the list.
      // Removing a row on pointerdown can send the click to a source below it.
      li.addEventListener('pointerdown', event => event.preventDefault());
      li.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); accept(i); });
      list.append(li);
    }
    list.hidden = !found.length;
    input.setAttribute('aria-expanded', String(!!found.length));
  }
  function update() {
    clearTimeout(timer);
    const current = ++revision, query = input.value;
    if (!query.trim()) { close(); return; }
    // Local preferences are synchronous, even on the first cold/offline visit.
    const personal = preferredSuggestions(query, Date.now(), { stepwise: true });
    paint(mergeSuggestions(personal, []));
    timer = setTimeout(async () => {
      try {
        // Rank a wider set locally so a favourite brand can outrank the eight
        // most popular brands, while the visible list stays short.
        const found = await lookup('suggest', { query, options: { sizes: true, varieties: true, limit:100, lang: getLang() } });
        if (current !== revision || document.activeElement !== input || active >= 0) return;
        const preferred = preferredSuggestions(query, Date.now(), { stepwise:true, candidates:found });
        paint(mergeSuggestions(preferred, found));
      } catch { /* history remains usable when the background index is unavailable */ }
    }, 160);
  }
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') return close();
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
      [...list.children].forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', `completion-${active}`);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault(); event.stopPropagation(); accept(active);
    }
  });
  form.addEventListener('submit', close);
}

export async function openKnowledgeDialog(observation = {}, { openSearch } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'knowledge-dialog';
  const heading = document.createElement('h2');
  heading.textContent = t('knowledge.title');
  const lead = document.createElement('p');
  lead.textContent = t('knowledge.lead');
  const stats = document.createElement('p');
  stats.className = 'knowledge-meta';
  stats.setAttribute('role', 'status');
  stats.textContent = t('knowledge.loading');
  const form = document.createElement('form');
  const explorer = document.createElement('section');
  explorer.className = 'knowledge-explorer';
  let selected = [], browseRevision = 0;
  async function browse() {
    const current = ++browseRevision;
    try {
      const data = await queryBrochureKnowledge('facets', { options: { selected, lang: getLang() } });
      if (current !== browseRevision || !dialog.isConnected) return;
      explorer.replaceChildren();
      const heading = document.createElement('h3');
      heading.textContent = t('knowledge.explore');
      const path = document.createElement('p');
      path.dir = 'auto';
      path.textContent = data.selected.map(s=>s.label).join(' › ') || t('knowledge.brand');
      const reset = document.createElement('button');
      reset.type = 'button'; reset.textContent = t('knowledge.reset');
      reset.addEventListener('click', () => {
        selected = [];
        revision++;
        for (const input of Object.values(fields)) input.value = '';
        results.replaceChildren();
        browse();
      });
      const count = document.createElement('p');
      count.className = 'knowledge-meta';
      count.textContent = t('knowledge.combinations', { n: data.combinations });
      const choices = document.createElement('div');
      choices.className = 'knowledge-facets';
      const filter = document.createElement('input');
      filter.type = 'search'; filter.placeholder = t('knowledge.filter');
      filter.setAttribute('aria-label', t('knowledge.filter'));
      function paint() {
        choices.replaceChildren();
        for (const choice of data.choices.filter(c=>c.label.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())).slice(0,60)) {
          const button = document.createElement('button');
          button.type = 'button'; button.dir = 'auto';
          button.textContent = `${choice.label} (${choice.observations})`;
          button.addEventListener('click', () => {
            selected = [...selected, choice.id];
            const field = data.next === 'variant' ? 'variant' : data.next;
            if (fields[field]) fields[field].value = choice.label;
            fields.name.value = '';
            browse(); check();
          });
          choices.append(button);
        }
      }
      filter.addEventListener('input', paint);
      if (data.next) {
        const next = document.createElement('p');
        next.textContent = t(`knowledge.${data.next}`);
        explorer.append(heading,path,reset,count,next,filter,choices);
      } else explorer.append(heading,path,reset,count);
      paint();
    } catch { explorer.textContent = t('knowledge.unavailable'); }
  }
  const fields = {};
  for (const field of ['name', 'brand', 'category', 'variant', 'size']) {
    const label = document.createElement('label');
    label.textContent = t(`knowledge.${field}`);
    const input = document.createElement('input');
    input.name = field;
    input.dir = 'auto';
    input.value = observation[field] || '';
    label.append(input);
    form.append(label);
    fields[field] = input;
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = t('knowledge.check');
  form.append(submit);
  const results = document.createElement('div');
  results.className = 'knowledge-candidates';
  results.setAttribute('aria-live', 'polite');
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = t('knowledge.close');
  close.addEventListener('click', () => dialog.close());
  dialog.append(heading, lead, close, stats, explorer, form, results);
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  browse();
  let revision = 0;
  async function check(event) {
    event?.preventDefault();
    const current = ++revision;
    results.textContent = t('knowledge.loading');
    try {
      const matches = await queryBrochureKnowledge('identify', {
        observation: Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
        options: { lang: getLang() },
      });
      if (current !== revision || !dialog.isConnected) return;
      results.replaceChildren();
      if (!matches.length) results.textContent = t('knowledge.empty');
      for (const match of matches) {
        const card = document.createElement('article');
        const name = document.createElement('strong');
        name.dir = 'auto'; name.textContent = match.query;
        const evidence = document.createElement('p');
        evidence.textContent = t('knowledge.evidence', { n: match.observations, stores: match.stores.length });
        const conflicts = document.createElement('p');
        conflicts.textContent = match.conflicts.length
          ? t('knowledge.conflicts', { fields: match.conflicts.map(f => t(`knowledge.${f}`)).join(', ') })
          : t('knowledge.matches');
        const source = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = t('knowledge.sources');
        source.append(summary);
        for (const example of match.examples) {
          const line = document.createElement('p');
          line.dir = 'auto';
          line.textContent = `${example.name || example.nameAr} · ${example.offerId} · ${example.seen?.slice(0,10) || ''}`;
          if (example.brochureId) line.append(document.createTextNode(` · ${example.brochureId}${example.pageIndex != null ? ` · ${t('knowledge.page', { n: example.pageIndex + 1 })}` : ''}`));
          if (example.sourceUrl) {
            try {
              const url = new URL(example.sourceUrl);
              if (url.protocol === 'https:') {
                const link = document.createElement('a');
                link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.textContent = t('knowledge.openSource');
                line.append(document.createTextNode(' · '), link);
              }
            } catch {}
          }
          source.append(line);
        }
        const use = document.createElement('button');
        use.type = 'button'; use.textContent = t('knowledge.use');
        use.addEventListener('click', () => {
          dialog.close();
          if (openSearch) openSearch(match.query);
          else window.dispatchEvent(new CustomEvent('supersearch:search-query', { detail: { query: match.query } }));
        });
        card.append(name, evidence, conflicts, source, use);
        results.append(card);
      }
    } catch { if (current === revision) results.textContent = t('knowledge.unavailable'); }
  }
  form.addEventListener('submit', check);
  queryBrochureKnowledge('stats').then(data => {
    if (!dialog.isConnected) return;
    stats.textContent = t('knowledge.stats', { n: data.observations, combinations: data.combinations,
      date: data.exportedAt?.slice(0,10) || '' });
  }).catch(() => { stats.textContent = t('knowledge.unavailable'); });
  if (Object.values(observation).some(Boolean)) check();
}
