// ── Config ────────────────────────────────────────────────────────────────
const TRAIL_COLORS = ['#d95a18', '#2e7dd1', '#2da44e']; // orange, blue, green
const TRACK_WEIGHT = 3.5;

// ── State ─────────────────────────────────────────────────────────────────
let map;
let runsData    = [];
let trackLayers = {};    // id → L.GPX layer
let runColors   = {};    // id → color string
let activeIds   = new Set();
let elevationCache = {};
let chartState     = null;
let hoverMarker    = null;

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  map = L.map('map', { zoomControl: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);

  // Set a sensible default view (Austria) before tracks load
  map.setView([47.8, 15.1], 9);

  let runs;
  try {
    runs = await fetch('data/runs.json').then(r => r.json());
  } catch (e) {
    console.error('Could not load runs.json', e);
    return;
  }

  runsData = runs;

  // Assign a color to every run before rendering cards
  runs.forEach((run, i) => {
    runColors[run.id] = TRAIL_COLORS[i % TRAIL_COLORS.length];
    activeIds.add(run.id);
  });

  renderLifetimeStats(runs);
  renderRunList(sortedRuns());

  document.getElementById('sort-chrono').addEventListener('change', () => {
    renderRunList(sortedRuns());
  });
  await loadAllTracks(runsData);

  // Wire up UI events
  document.getElementById('elevation-close').addEventListener('click', () => {
    document.getElementById('elevation-panel').classList.add('hidden');
  });

  document.getElementById('photo-modal-backdrop').addEventListener('click', closePhotoModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhotoModal(); });

  // Mobile sidebar toggle
  document.getElementById('sidebar-handle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

// ── Lifetime stats ────────────────────────────────────────────────────────
function renderLifetimeStats(runs) {
  document.getElementById('stat-runs').textContent = runs.length;
  const handleLabel = document.getElementById('sidebar-handle-label');
  if (handleLabel) handleLabel.textContent = `${runs.length} run${runs.length !== 1 ? 's' : ''} — tap to show`;
  document.getElementById('stat-distance').textContent =
    (runs.reduce((s, r) => s + r.distance, 0) / 1000).toFixed(1);
  document.getElementById('stat-ascent').textContent =
    runs.reduce((s, r) => s + r.ascent, 0).toLocaleString();
}

// ── Sort helper ───────────────────────────────────────────────────────────
function sortedRuns() {
  const chrono = document.getElementById('sort-chrono').checked;
  return chrono
    ? runsData.slice().sort((a, b) => a.date.localeCompare(b.date))
    : runsData.slice().sort((a, b) => b.date.localeCompare(a.date));
}

// ── Run list sidebar ──────────────────────────────────────────────────────
function renderRunList(runs) {
  const list = document.getElementById('run-list');
  list.innerHTML = runs.map(run => runCardHTML(run)).join('');

  list.querySelectorAll('.run-card').forEach(card => {
    card.addEventListener('click', () => {
      const run = runsData.find(r => r.id === card.dataset.id);
      if (run) toggleRun(run);
    });
    card.querySelector('.btn-elev').addEventListener('click', e => {
      e.stopPropagation();
      const run = runsData.find(r => r.id === card.dataset.id);
      if (run) showElevationProfile(run);
    });
  });
}

function runCardHTML(run) {
  const date    = new Date(run.date + 'T12:00:00');
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const km      = (run.distance / 1000).toFixed(2);
  const pace    = formatPace(run.distance, run.duration);
  const dur     = formatDuration(run.duration);
  const photosNote = run.photos && run.photos.length
    ? `<div class="run-photos-count">&#x1F4F7; ${run.photos.length} photo${run.photos.length > 1 ? 's' : ''}</div>`
    : '';
  const notes = run.notes
    ? `<div class="run-notes">${escapeHtml(run.notes)}</div>`
    : '';

  const color = runColors[run.id] || TRAIL_COLORS[0];

  return `
    <div class="run-card" data-id="${run.id}" style="--track-c:${color}">
      <div class="run-card-header">
        <span class="run-date">${dateStr}</span>
        <span class="run-distance">${km} km</span>
      </div>
      <div class="run-title">${escapeHtml(run.title)}</div>
      <div class="run-stats">
        <span>&#x23F1; ${dur}</span>
        <span>&#x26A1; ${pace}/km</span>
        <span>&#x2191; ${run.ascent} m</span>
        <button class="btn-elev" title="Show elevation profile">&#9651; profile</button>
      </div>
      ${photosNote}
      ${notes}
    </div>`;
}

// ── Load all tracks (dimmed) ───────────────────────────────────────────────
async function loadAllTracks(runs) {
  const allBounds = [];

  const promises = runs.map(run => new Promise(resolve => {
    const gpxLayer = new L.GPX(run.gpx, {
      async: true,
      polyline_options: {
        color: runColors[run.id],
        weight: TRACK_WEIGHT,
        opacity: 0.85
      },
      marker_options: {
        startIconUrl: null,
        endIconUrl: null,
        shadowUrl: null
      }
    });

    gpxLayer.on('loaded', e => {
      trackLayers[run.id] = gpxLayer;
      const b = e.target.getBounds();
      if (b.isValid()) allBounds.push(b);
      resolve();
    });

    gpxLayer.on('error', () => resolve());
    gpxLayer.addTo(map);
  }));

  await Promise.all(promises);

  if (allBounds.length > 0) {
    const combined = allBounds.reduce((acc, b) => acc.extend(b));
    map.fitBounds(combined, { padding: [30, 30] });
  }
}

// ── Toggle a run on/off ────────────────────────────────────────────────────
function toggleRun(run) {
  const card = document.querySelector(`.run-card[data-id="${run.id}"]`);

  if (activeIds.has(run.id)) {
    activeIds.delete(run.id);
    card?.classList.add('inactive');
    setTrackOpacity(trackLayers[run.id], 0);
  } else {
    activeIds.add(run.id);
    card?.classList.remove('inactive');
    setTrackOpacity(trackLayers[run.id], 0.85);
    if (run.photos && run.photos.length > 0) renderPhotosInCard(run);
  }
}

function setTrackOpacity(layer, opacity) {
  if (!layer) return;
  layer.getLayers().forEach(l => {
    if (l.setStyle) l.setStyle({ opacity });
  });
}

// ── Elevation profile ─────────────────────────────────────────────────────
async function showElevationProfile(run) {
  if (!elevationCache[run.id]) {
    elevationCache[run.id] = await parseGPXElevation(run.gpx);
  }
  const points = elevationCache[run.id];
  if (!points.length) return;

  document.getElementById('elevation-title').textContent =
    run.title + ' — Elevation Profile';
  document.getElementById('elevation-panel').classList.remove('hidden');
  renderElevationChart(points);
}

async function parseGPXElevation(gpxUrl) {
  try {
    const res  = await fetch(gpxUrl);
    const text = await res.text();
    const doc  = new DOMParser().parseFromString(text, 'text/xml');
    const pts  = doc.querySelectorAll('trkpt');

    const data = [];
    let distance = 0, prevLat, prevLon;

    pts.forEach(pt => {
      const lat  = parseFloat(pt.getAttribute('lat'));
      const lon  = parseFloat(pt.getAttribute('lon'));
      const eleEl = pt.querySelector('ele');
      const ele  = eleEl ? parseFloat(eleEl.textContent) : null;

      if (prevLat !== undefined) {
        distance += haversine(prevLat, prevLon, lat, lon);
      }
      if (ele !== null) data.push({ d: distance / 1000, ele, lat, lon });
      prevLat = lat;
      prevLon = lon;
    });

    return data;
  } catch (e) {
    console.error('GPX parse error:', e);
    return [];
  }
}

function renderElevationChart(points) {
  // Fixed logical coordinate space; SVG scales via CSS width:100%
  const VW = 800, VH = 110;
  const pad = { top: 8, right: 18, bottom: 24, left: 42 };
  const w = VW - pad.left - pad.right;
  const h = VH - pad.top  - pad.bottom;

  const maxD   = points[points.length - 1].d;
  const eles   = points.map(p => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const range  = maxEle - minEle || 1;

  const X = d   => pad.left + (d / maxD)  * w;
  const Y = ele => pad.top  + h - ((ele - minEle) / range) * h;

  // Polyline path
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.d).toFixed(1)},${Y(p.ele).toFixed(1)}`)
    .join(' ');

  // Filled area
  const last = points[points.length - 1];
  const areaPath = linePath
    + ` L${X(last.d).toFixed(1)},${(pad.top + h).toFixed(1)}`
    + ` L${X(0).toFixed(1)},${(pad.top + h).toFixed(1)} Z`;

  // Distance axis labels (6 ticks)
  const distTicks = Array.from({ length: 6 }, (_, i) => {
    const d = (maxD / 5) * i;
    return `<text x="${X(d).toFixed(1)}" y="${VH - 5}" text-anchor="middle" class="chart-label">${d.toFixed(1)}km</text>`;
  }).join('');

  // Elevation axis labels (3 ticks)
  const eleTicks = [minEle, (minEle + maxEle) / 2, maxEle].map(e => {
    return `<text x="${pad.left - 4}" y="${Y(e).toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="chart-label">${Math.round(e)}m</text>`;
  }).join('');

  // Grid lines
  const gridLines = [minEle, (minEle + maxEle) / 2, maxEle].map(e => {
    const y = Y(e).toFixed(1);
    return `<line x1="${pad.left}" y1="${y}" x2="${pad.left + w}" y2="${y}" stroke="#f0efed" stroke-width="1"/>`;
  }).join('');

  const svg = document.getElementById('elevation-chart');
  svg.innerHTML = `
    <defs>
      <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${TRACK_COLOR}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${TRACK_COLOR}" stop-opacity="0.03"/>
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaPath}" fill="url(#eg)"/>
    <path d="${linePath}" fill="none" stroke="${TRACK_COLOR}" stroke-width="1.8" stroke-linejoin="round"/>
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + h}" stroke="#ddd" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top + h}" x2="${pad.left + w}" y2="${pad.top + h}" stroke="#ddd" stroke-width="1"/>
    ${eleTicks}
    ${distTicks}
    <line id="needle-line" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + h}"
      stroke="${TRACK_COLOR}" stroke-width="1.2" stroke-dasharray="3,2" opacity="0" pointer-events="none"/>
    <circle id="needle-dot" cx="0" cy="0" r="4"
      fill="${TRACK_COLOR}" stroke="#fff" stroke-width="1.5" opacity="0" pointer-events="none"/>
    <rect id="chart-overlay" x="${pad.left}" y="${pad.top}" width="${w}" height="${h}" fill="transparent" cursor="crosshair"/>
  `;

  chartState = { points, maxD, minEle, range, pad, w, h, X, Y };

  const overlay = document.getElementById('chart-overlay');
  overlay.addEventListener('mousemove',  onChartMouseMove);
  overlay.addEventListener('mouseleave', onChartMouseLeave);
  overlay.addEventListener('touchstart', onChartTouch, { passive: false });
  overlay.addEventListener('touchmove',  onChartTouch, { passive: false });
  overlay.addEventListener('touchend',   onChartMouseLeave);
}

function onChartTouch(e) {
  e.preventDefault();
  const touch = e.touches[0];
  if (touch) onChartMoveAt(touch.clientX, touch.clientY);
}

function onChartMouseMove(e) {
  onChartMoveAt(e.clientX, e.clientY);
}

function onChartMoveAt(clientX, clientY) {
  if (!chartState) return;
  const { points, maxD, minEle, range, pad, w, h, X, Y } = chartState;

  const svg = document.getElementById('elevation-chart');
  const pt  = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const svgX = Math.max(pad.left, Math.min(pad.left + w,
    pt.matrixTransform(svg.getScreenCTM().inverse()).x));

  const d = (svgX - pad.left) / w * maxD;

  // Find nearest point by distance along track
  let nearest = points[0], minDiff = Infinity;
  for (const p of points) {
    const diff = Math.abs(p.d - d);
    if (diff < minDiff) { minDiff = diff; nearest = p; }
  }

  const nx = X(nearest.d).toFixed(1);
  const ny = Y(nearest.ele).toFixed(1);

  // Move needle
  const line = document.getElementById('needle-line');
  const dot  = document.getElementById('needle-dot');
  line.setAttribute('x1', nx); line.setAttribute('x2', nx); line.setAttribute('opacity', '1');
  dot.setAttribute('cx', nx);  dot.setAttribute('cy', ny);  dot.setAttribute('opacity', '1');

  // Move map marker
  if (!hoverMarker) {
    hoverMarker = L.circleMarker([nearest.lat, nearest.lon], {
      radius: 7, color: '#fff', fillColor: TRACK_COLOR,
      fillOpacity: 1, weight: 2
    }).addTo(map);
  } else {
    hoverMarker.setLatLng([nearest.lat, nearest.lon]);
    if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
  }
}

function onChartMouseLeave() {
  const line = document.getElementById('needle-line');
  const dot  = document.getElementById('needle-dot');
  if (line) line.setAttribute('opacity', '0');
  if (dot)  dot.setAttribute('opacity', '0');
  if (hoverMarker) hoverMarker.remove();
  hoverMarker = null;
}

// ── Photos in card ────────────────────────────────────────────────────────
function renderPhotosInCard(run) {
  const card = document.querySelector(`.run-card[data-id="${run.id}"]`);
  if (!card) return;

  let gallery = card.querySelector('.run-photos-gallery');
  if (gallery) return; // already rendered

  gallery = document.createElement('div');
  gallery.className = 'run-photos-gallery';
  gallery.innerHTML = run.photos.map(src =>
    `<img src="${src}" alt="Run photo" />`
  ).join('');

  gallery.querySelectorAll('img').forEach(img => {
    img.addEventListener('click', e => {
      e.stopPropagation();
      openPhotoModal(img.src);
    });
  });

  card.appendChild(gallery);
}

function openPhotoModal(src) {
  document.getElementById('photo-modal-img').src = src;
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.add('hidden');
  document.getElementById('photo-modal-img').src = '';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(distanceM, durationS) {
  const secPerKm = durationS / (distanceM / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
