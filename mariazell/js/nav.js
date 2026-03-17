// ── Tab switching ──────────────────────────────────────────────────────────
function activateTab(target) {
  document.querySelectorAll('.nav-tab[data-tab]').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === target));
  document.querySelectorAll('.tab-section').forEach(s =>
    s.classList.toggle('active', s.id === 'tab-' + target));
  history.replaceState(null, '', '#' + target);
}

document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    activateTab(tab.dataset.tab);
  });
});

// Activate tab from URL hash on load (e.g. index.html#album)
const initialTab = window.location.hash.replace('#', '');
if (initialTab && document.getElementById('tab-' + initialTab)) {
  activateTab(initialTab);
}

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
let allPhotos = [];

function renderAlbum(runs) {
  const grid  = document.getElementById('album-grid');
  const empty = document.getElementById('album-empty');

  allPhotos = [];
  for (const run of runs) {
    if (run.photos && run.photos.length) {
      for (const src of run.photos) {
        allPhotos.push({ src, runTitle: run.title });
      }
    }
  }

  if (!allPhotos.length) {
    empty.classList.remove('hidden');
    return;
  }

  grid.innerHTML = allPhotos.map((p, i) => `
    <div class="album-item" data-index="${i}">
      <img src="${p.src}" alt="${escapeHtml(p.runTitle)}" loading="lazy" />
      <div class="album-caption">${escapeHtml(p.runTitle)}</div>
    </div>`
  ).join('');

  grid.querySelectorAll('.album-item').forEach(item => {
    item.addEventListener('click', () => openPhotoModal(+item.dataset.index));
  });
}

// ── Photo modal ───────────────────────────────────────────────────────────
let currentPhotoIndex = 0;

function openPhotoModal(index) {
  currentPhotoIndex = index;
  const photo = allPhotos[index];
  document.getElementById('photo-modal-img').src = photo.src;
  document.getElementById('photo-modal-img').alt = photo.runTitle;
  document.getElementById('modal-prev').style.visibility = index > 0 ? 'visible' : 'hidden';
  document.getElementById('modal-next').style.visibility = index < allPhotos.length - 1 ? 'visible' : 'hidden';
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.add('hidden');
  document.getElementById('photo-modal-img').src = '';
}

document.getElementById('photo-modal-backdrop').addEventListener('click', closePhotoModal);
document.getElementById('modal-prev').addEventListener('click', e => {
  e.stopPropagation();
  if (currentPhotoIndex > 0) openPhotoModal(currentPhotoIndex - 1);
});
document.getElementById('modal-next').addEventListener('click', e => {
  e.stopPropagation();
  if (currentPhotoIndex < allPhotos.length - 1) openPhotoModal(currentPhotoIndex + 1);
});

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (document.getElementById('photo-modal').classList.contains('hidden')) return;
  if (e.key === 'Escape')     closePhotoModal();
  if (e.key === 'ArrowRight') openPhotoModal(Math.min(currentPhotoIndex + 1, allPhotos.length - 1));
  if (e.key === 'ArrowLeft')  openPhotoModal(Math.max(currentPhotoIndex - 1, 0));
});

// Swipe gesture
let touchStartX = 0;
const modal = document.getElementById('photo-modal');
modal.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
modal.addEventListener('touchend', e => {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) < 40) return;
  if (delta < 0) openPhotoModal(Math.min(currentPhotoIndex + 1, allPhotos.length - 1));
  else           openPhotoModal(Math.max(currentPhotoIndex - 1, 0));
});

// ── Helper ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
