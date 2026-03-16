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

// ── Story: fetch README.md and render with marked ─────────────────────────
fetch('README.md')
  .then(r => r.text())
  .then(md => {
    document.getElementById('story-body').innerHTML = marked.parse(md);
  })
  .catch(() => {
    document.getElementById('story-body').textContent = 'Could not load story.';
  });

// ── Album: load runs.json and show all photos ─────────────────────────────
fetch('data/runs.json')
  .then(r => r.json())
  .then(runs => {
    const grid  = document.getElementById('album-grid');
    const empty = document.getElementById('album-empty');

    const photos = [];
    for (const run of runs) {
      if (run.photos && run.photos.length) {
        for (const src of run.photos) {
          photos.push({ src, runTitle: run.title, runDate: run.date });
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
  })
  .catch(console.error);

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
