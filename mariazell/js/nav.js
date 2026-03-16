// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    const target = tab.dataset.tab;

    document.querySelectorAll('.nav-tab[data-tab]').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === target));
    document.querySelectorAll('.tab-section').forEach(s =>
      s.classList.toggle('active', s.id === 'tab-' + target));
  });
});

// ── Load runs.json once, then render story + album ────────────────────────
fetch('data/runs.json')
  .then(r => r.json())
  .then(runs => {
    renderStory(runs);
    renderAlbum(runs);
  })
  .catch(console.error);

// ── Story: fetch README.md, inject dynamic route table, render markdown ───
function renderStory(runs) {
  fetch('README.md')
    .then(r => r.text())
    .then(md => {
      const table = buildRouteTable(runs);
      const html  = marked.parse(md.replace('[[route-table]]', table));
      document.getElementById('story-body').innerHTML = html;
    })
    .catch(() => {
      document.getElementById('story-body').textContent = 'Geschichte konnte nicht geladen werden.';
    });
}

function buildRouteTable(runs) {
  const sorted = runs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const rows = sorted.map((run, i) => {
    const from = run.from || '—';
    const to   = run.to   || '—';
    const km   = (run.distance / 1000).toFixed(1);
    return `| ${i + 1} | ${escapeHtml(from)} → ${escapeHtml(to)} | ${km} km |`;
  });
  return [
    '| Etappe | Von → Nach | Distanz |',
    '|--------|------------|---------|',
    ...rows,
    '| … | *mehr folgt* | — |'
  ].join('\n');
}

// ── Album: show all photos from runs ─────────────────────────────────────
function renderAlbum(runs) {
  const grid  = document.getElementById('album-grid');
  const empty = document.getElementById('album-empty');

  const photos = [];
  for (const run of runs) {
    if (run.photos && run.photos.length) {
      for (const src of run.photos) {
        photos.push({ src, runTitle: run.title });
      }
    }
  }

  if (!photos.length) {
    empty.classList.remove('hidden');
    return;
  }

  grid.innerHTML = photos.map(p => `
    <div class="album-item" data-src="${p.src}">
      <img src="${p.src}" alt="${escapeHtml(p.runTitle)}" loading="lazy" />
      <div class="album-caption">${escapeHtml(p.runTitle)}</div>
    </div>`
  ).join('');

  grid.querySelectorAll('.album-item').forEach(item => {
    item.addEventListener('click', () => openPhotoModal(item.dataset.src));
  });
}

// ── Photo modal ───────────────────────────────────────────────────────────
function openPhotoModal(src) {
  document.getElementById('photo-modal-img').src = src;
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.add('hidden');
  document.getElementById('photo-modal-img').src = '';
}

document.getElementById('photo-modal-backdrop').addEventListener('click', closePhotoModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhotoModal(); });

// ── Helper ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
