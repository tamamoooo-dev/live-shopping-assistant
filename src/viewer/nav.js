// viewer/nav.js — page navigation chrome: the page indicator, the lazy
// thumbnail strip, and the full-screen overview grid (jump-to-page). All three
// reuse the page images the canvas already fetches (downscaled by CSS +
// loading=lazy), so navigation costs no new backend assets.

export function createNav(root, pages, { onJump }) {
  /* --- thumbnail strip -------------------------------------------------------- */
  const strip = document.createElement('div');
  strip.className = 'vv-thumbs';
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Pages');
  const thumbs = pages.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vv-thumb';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Page ${i + 1}`);
    const im = document.createElement('img');
    im.src = p.src;
    im.alt = '';
    im.loading = 'lazy';
    im.decoding = 'async';
    im.draggable = false;
    const n = document.createElement('span');
    n.textContent = String(i + 1);
    b.append(im, n);
    b.addEventListener('click', () => onJump(i));
    strip.appendChild(b);
    return b;
  });

  /* --- indicator (opens the overview) ------------------------------------------ */
  const indicator = document.createElement('button');
  indicator.type = 'button';
  indicator.className = 'vv-indicator';
  indicator.setAttribute('aria-label', 'Open page overview');
  indicator.setAttribute('aria-live', 'polite'); // announces "N / M" page turns

  /* --- overview grid ------------------------------------------------------------ */
  let grid = null;
  function openGrid(current) {
    if (grid) return;
    grid = document.createElement('div');
    grid.className = 'vv-grid';
    grid.setAttribute('role', 'dialog');
    grid.setAttribute('aria-label', 'All pages');
    const head = document.createElement('div');
    head.className = 'vv-grid-head';
    const title = document.createElement('span');
    title.textContent = `${pages.length} pages`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vv-grid-close';
    close.setAttribute('aria-label', 'Close overview');
    close.textContent = '✕';
    close.addEventListener('click', closeGrid);
    head.append(title, close);
    const cells = document.createElement('div');
    cells.className = 'vv-grid-cells';
    pages.forEach((p, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'vv-cell' + (i === current ? ' is-current' : '');
      c.setAttribute('aria-label', `Go to page ${i + 1}`);
      const im = document.createElement('img');
      im.src = p.src;
      im.alt = '';
      im.loading = 'lazy';
      im.decoding = 'async';
      const n = document.createElement('span');
      n.textContent = String(i + 1);
      c.append(im, n);
      c.addEventListener('click', () => {
        closeGrid();
        onJump(i);
      });
      cells.appendChild(c);
    });
    grid.append(head, cells);
    root.appendChild(grid);
    requestAnimationFrame(() => grid && grid.classList.add('is-open'));
    const cur = cells.children[current];
    if (cur) cur.scrollIntoView({ block: 'center' });
    close.focus({ preventScroll: true });
  }
  function closeGrid() {
    if (!grid) return;
    const g = grid;
    grid = null;
    g.classList.remove('is-open');
    setTimeout(() => g.remove(), 180);
  }
  indicator.addEventListener('click', () => (grid ? closeGrid() : openGrid(currentIdx)));

  let currentIdx = 0;
  return {
    strip,
    indicator,
    setPage(i) {
      currentIdx = i;
      indicator.textContent = `${i + 1} / ${pages.length}`;
      thumbs.forEach((b, n) => {
        const active = n === i;
        b.classList.toggle('is-current', active);
        b.setAttribute('aria-selected', String(active));
      });
      const cur = thumbs[i];
      if (cur) cur.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    },
    isGridOpen: () => !!grid,
    closeGrid,
    destroy() {
      closeGrid();
      strip.remove();
      indicator.remove();
    },
  };
}
