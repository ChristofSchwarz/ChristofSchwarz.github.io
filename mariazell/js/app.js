// ── Config ────────────────────────────────────────────────────────────────
const TRAIL_COLORS    = ['#d95a18', '#9e3509']; // warm orange, dark burnt orange
const LANDMARK_COLOR  = '#7c3aed';              // purple
const TRACK_WEIGHT    = 3.5;

// ── State ─────────────────────────────────────────────────────────────────
let map;
let runsData       = [];
let landmarksData  = [];
let trackLayers    = {};    // id → L.GPX layer
let runColors      = {};    // id → color (stable, by original JSON order)
let activeIds      = new Set();
let activeLandmarkIds = new Set();
let landmarkMarkers   = {};  // id → L.Marker
let finishMarkers  = {};    // id → L.Marker
let elevationCache = {};
let chartState     = null;
let hoverMarker    = null;

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  map = L.map('map', { zoomControl: true });

  const baseLayers = {
    'Street': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }),
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community',
      maxZoom: 19
    }),
  };

  baseLayers['Street'].addTo(map);
  L.control.layers(baseLayers, null, { position: 'topright', collapsed: false }).addTo(map);

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

  runs.forEach((run, i) => {
    runColors[run.id] = TRAIL_COLORS[i % TRAIL_COLORS.length];
    activeIds.add(run.id);
  });

  // Load landmarks
  try {
    landmarksData = await fetch('data/landmarks.json').then(r => r.json());
  } catch (e) { landmarksData = []; }
  landmarksData.forEach(lm => activeLandmarkIds.add(lm.id));

  renderLifetimeStats(runs);
  renderRunList(sortedRuns());

  document.getElementById('sort-chrono').addEventListener('change', () => {
    renderRunList(sortedRuns());
  });
  await loadAllTracks(runsData);
  loadLandmarks(landmarksData);

  // Wire up elevation show/hide controls
  document.getElementById('elevation-close').addEventListener('click',       () => setElevationVisible(false));
  document.getElementById('elev-toggle-btn').addEventListener('click',       () => setElevationVisible(document.getElementById('elevation-panel').classList.contains('hidden')));
  document.getElementById('elev-mobile-reopen').addEventListener('click',   () => setElevationVisible(true));

  document.getElementById('photo-modal-backdrop').addEventListener('click', closePhotoModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhotoModal(); });

  // Re-render chart at correct size when window is resized
  window.addEventListener('resize', () => {
    if (chartState) updateElevationChart();
  });

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

  const runHTML = runs.map(run => runCardHTML(run)).join('');
  const lmHTML  = landmarksData.length
    ? `<div class="landmark-section-divider">Landmarks</div>` +
      landmarksData.map(lm => landmarkCardHTML(lm)).join('')
    : '';
  list.innerHTML = runHTML + lmHTML;

  list.querySelectorAll('.run-card').forEach(card => {
    card.addEventListener('click', () => {
      const run = runsData.find(r => r.id === card.dataset.id);
      if (run) toggleRun(run);
    });
  });

  list.querySelectorAll('.landmark-card').forEach(card => {
    card.addEventListener('click', () => {
      const lm = landmarksData.find(l => l.id === card.dataset.id);
      if (lm) toggleLandmark(lm);
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
    <div class="run-card" data-id="${run.id}" style="border-left-color:${color}">
      <div class="run-card-header">
        <span class="run-date">${dateStr}</span>
        <span class="run-distance">${km} km</span>
      </div>
      <div class="run-title">${escapeHtml(run.title)}</div>
      <div class="run-stats">
        <span>&#x23F1; ${dur}</span>
        <span>&#x26A1; ${pace}/km</span>
        <span>&#x2191; ${run.ascent} m</span>
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
    const combined   = allBounds.reduce((acc, b) => acc.extend(b));
    const elevOffset = Math.round(window.innerHeight * 0.25) + 20;
    map.fitBounds(combined, {
      paddingTopLeft:     [30, 30],
      paddingBottomRight: [30, elevOffset]
    });
  }

  // Add finish flags (reuses parseGPXElevation which also primes the cache)
  for (const run of runs) {
    addFinishMarker(run);
  }
  await updateElevationChart();
  setElevationVisible(true);
}

// ── Toggle a run on/off ────────────────────────────────────────────────────
function toggleRun(run) {
  const card = document.querySelector(`.run-card[data-id="${run.id}"]`);

  if (activeIds.has(run.id)) {
    activeIds.delete(run.id);
    card?.classList.add('inactive');
    setTrackOpacity(trackLayers[run.id], 0);
    if (finishMarkers[run.id]) finishMarkers[run.id].setOpacity(0);
  } else {
    activeIds.add(run.id);
    card?.classList.remove('inactive');
    setTrackOpacity(trackLayers[run.id], 0.85);
    if (finishMarkers[run.id]) finishMarkers[run.id].setOpacity(1);
    if (run.photos && run.photos.length > 0) renderPhotosInCard(run);
  }
  updateElevationChart();
}

function setTrackOpacity(layer, opacity) {
  if (!layer) return;
  layer.getLayers().forEach(l => {
    if (l.setStyle) l.setStyle({ opacity });
  });
}

async function addFinishMarker(run) {
  // Re-use elevation cache — it has lat/lon per point
  if (!elevationCache[run.id]) {
    elevationCache[run.id] = await parseGPXElevation(run.gpx);
  }
  const pts = elevationCache[run.id];
  if (!pts.length) return;

  const last = pts[pts.length - 1];
  const color = runColors[run.id] || TRAIL_COLORS[0];
  const flagSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24">
      <line x1="3" y1="1" x2="3" y2="23" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>
      <polygon points="3,1 16,6 3,12" fill="${color}" stroke="${color}" stroke-linejoin="round"/>
    </svg>`;

  const marker = L.marker([last.lat, last.lon], {
    icon: L.divIcon({
      html: flagSvg,
      className: 'finish-flag',
      iconSize:   [18, 24],
      iconAnchor: [3, 23]   // tip of the pole
    }),
    zIndexOffset: 500
  }).addTo(map);

  finishMarkers[run.id] = marker;
}

// ── Elevation visibility helpers ──────────────────────────────────────────
function setElevationVisible(visible) {
  const panel      = document.getElementById('elevation-panel');
  const toggleBtn  = document.getElementById('elev-toggle-btn');
  const mobileBtn  = document.getElementById('elev-mobile-reopen');

  if (visible) {
    panel.classList.remove('hidden');
    if (toggleBtn) toggleBtn.textContent = '▽ Hide elevation diagram';
    if (mobileBtn) mobileBtn.classList.remove('shown');
  } else {
    panel.classList.add('hidden');
    if (toggleBtn) toggleBtn.textContent = '△ Show elevation diagram';
    if (mobileBtn) mobileBtn.classList.add('shown');
  }
}

// ── Elevation profile — all active segments combined ──────────────────────
async function updateElevationChart() {
  // Use chronological order as the natural left-to-right sequence
  const ordered = runsData.slice().sort((a, b) => a.date.localeCompare(b.date));

  // Ensure all elevation data is loaded
  for (const run of ordered) {
    if (!elevationCache[run.id]) {
      elevationCache[run.id] = await parseGPXElevation(run.gpx);
    }
  }

  // Build segments with cumulative distance offsets
  let offset = 0;
  const segments = ordered.map(run => {
    const pts     = elevationCache[run.id] || [];
    const runDist = pts.length ? pts[pts.length - 1].d : run.distance / 1000;
    const seg     = { run, pts, active: activeIds.has(run.id),
                      offset, color: runColors[run.id] || TRAIL_COLORS[0] };
    offset += runDist;
    return seg;
  });

  const activeSegs = segments.filter(s => s.active && s.pts.length);
  if (!activeSegs.length) return;

  // Zoom X-axis to the span of active segments
  const visStart = activeSegs[0].offset;
  const lastSeg  = activeSegs[activeSegs.length - 1];
  const visEnd   = lastSeg.offset + lastSeg.pts[lastSeg.pts.length - 1].d;

  const allEles  = activeSegs.flatMap(s => s.pts.map(p => p.ele));
  const minEle   = Math.min(...allEles);
  const maxEle   = Math.max(...allEles);

  const title = activeSegs.length === 1
    ? activeSegs[0].run.title + ' — Elevation Profile'
    : 'Elevation Profile — ' + activeSegs.map(s => s.run.title).join(', ');
  document.getElementById('elevation-title').textContent = title;

  requestAnimationFrame(() =>
    renderMultiElevationChart(segments, visStart, visEnd, minEle, maxEle)
  );
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

function renderMultiElevationChart(segments, visStart, visEnd, minEle, maxEle) {
  const svg = document.getElementById('elevation-chart');
  const VW  = svg.clientWidth  || svg.parentElement.clientWidth  || 600;
  const VH  = svg.clientHeight || svg.parentElement.clientHeight || 120;
  svg.setAttribute('width',  VW);
  svg.setAttribute('height', VH);

  const pad = { top: 10, right: 20, bottom: 26, left: 46 };
  const w = VW - pad.left - pad.right;
  const h = VH - pad.top  - pad.bottom;

  const visRange = visEnd - visStart;
  const eleRange = maxEle - minEle || 1;

  const X = d   => pad.left + ((d - visStart) / visRange) * w;
  const Y = ele => pad.top  + h - ((ele - minEle) / eleRange) * h;

  // Gradient defs per active segment
  const defs = segments.filter(s => s.active).map((s, i) => `
    <linearGradient id="eg${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${s.color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${s.color}" stop-opacity="0.02"/>
    </linearGradient>`).join('');

  // Draw each active segment independently (gaps where inactive)
  let paths = '', gi = 0;
  for (const seg of segments) {
    if (!seg.active || !seg.pts.length) { continue; }
    const line = seg.pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${X(seg.offset + p.d).toFixed(1)},${Y(p.ele).toFixed(1)}`)
      .join(' ');
    const first = seg.pts[0], last = seg.pts[seg.pts.length - 1];
    const area  = line
      + ` L${X(seg.offset + last.d).toFixed(1)},${(pad.top + h).toFixed(1)}`
      + ` L${X(seg.offset + first.d).toFixed(1)},${(pad.top + h).toFixed(1)} Z`;
    paths += `<path d="${area}" fill="url(#eg${gi})"/>`;
    paths += `<path d="${line}" fill="none" stroke="${seg.color}" stroke-width="1.8" stroke-linejoin="round"/>`;
    gi++;
  }

  // Grid lines
  const gridLines = [minEle, (minEle + maxEle) / 2, maxEle].map(e =>
    `<line x1="${pad.left}" y1="${Y(e).toFixed(1)}" x2="${pad.left+w}" y2="${Y(e).toFixed(1)}" stroke="#f0efed" stroke-width="1"/>`
  ).join('');

  // Segment boundary lines (between consecutive segments, skip first)
  const boundaryLines = segments.slice(1).map(seg => {
    const x = X(seg.offset).toFixed(1);
    return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + h}"
      stroke="#ccc" stroke-width="1" stroke-dasharray="3,3"/>`;
  }).join('');

  // Distance axis (6 ticks across visible range)
  const distTicks = Array.from({ length: 6 }, (_, i) => {
    const d = visStart + (visRange / 5) * i;
    return `<text x="${X(d).toFixed(1)}" y="${VH-5}" text-anchor="middle" class="chart-label">${d.toFixed(1)}km</text>`;
  }).join('');

  // Elevation axis
  const eleTicks = [minEle, (minEle + maxEle) / 2, maxEle].map(e =>
    `<text x="${pad.left-4}" y="${Y(e).toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="chart-label">${Math.round(e)}m</text>`
  ).join('');

  svg.innerHTML = `
    <defs>${defs}</defs>
    ${gridLines}
    ${boundaryLines}
    ${paths}
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top+h}" stroke="#ddd" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top+h}" x2="${pad.left+w}" y2="${pad.top+h}" stroke="#ddd" stroke-width="1"/>
    ${eleTicks}
    ${distTicks}
    <line id="needle-line" x1="0" y1="${pad.top}" x2="0" y2="${pad.top+h}"
      stroke="#666" stroke-width="1.2" stroke-dasharray="3,2" opacity="0" pointer-events="none"/>
    <circle id="needle-dot" cx="0" cy="0" r="4"
      fill="#666" stroke="#fff" stroke-width="1.5" opacity="0" pointer-events="none"/>
    <rect id="chart-overlay" x="${pad.left}" y="${pad.top}" width="${w}" height="${h}" fill="transparent" cursor="crosshair"/>
  `;

  chartState = { segments, visStart, visRange, minEle, eleRange, pad, w, h, X, Y };

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
  const { segments, visStart, visRange, pad, w, X, Y } = chartState;

  const svg = document.getElementById('elevation-chart');
  const pt  = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const svgX = Math.max(pad.left, Math.min(pad.left + w,
    pt.matrixTransform(svg.getScreenCTM().inverse()).x));

  // Convert SVG x → cumulative distance
  const d = visStart + (svgX - pad.left) / w * visRange;

  // Find nearest point across all active segments
  let nearest = null, nearestSeg = null, minDiff = Infinity;
  for (const seg of segments) {
    if (!seg.active || !seg.pts.length) continue;
    for (const p of seg.pts) {
      const diff = Math.abs(seg.offset + p.d - d);
      if (diff < minDiff) { minDiff = diff; nearest = p; nearestSeg = seg; }
    }
  }
  if (!nearest) return;

  const nx    = X(nearestSeg.offset + nearest.d).toFixed(1);
  const ny    = Y(nearest.ele).toFixed(1);
  const color = nearestSeg.color;

  const line = document.getElementById('needle-line');
  const dot  = document.getElementById('needle-dot');
  line.setAttribute('x1', nx); line.setAttribute('x2', nx);
  line.setAttribute('stroke', color); line.setAttribute('opacity', '1');
  dot.setAttribute('cx', nx);  dot.setAttribute('cy', ny);
  dot.setAttribute('fill', color); dot.setAttribute('opacity', '1');

  if (!hoverMarker) {
    hoverMarker = L.circleMarker([nearest.lat, nearest.lon], {
      radius: 7, color: '#fff', fillColor: color, fillOpacity: 1, weight: 2
    }).addTo(map);
  } else {
    hoverMarker.setLatLng([nearest.lat, nearest.lon]);
    hoverMarker.setStyle({ fillColor: color });
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

// ── Landmarks ─────────────────────────────────────────────────────────────
function loadLandmarks(landmarks) {
  for (const lm of landmarks) {
    const pinSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28">
        <path d="M10 1 C5.03 1 1 5.03 1 10 C1 17 10 27 10 27 C10 27 19 17 19 10 C19 5.03 14.97 1 10 1 Z"
          fill="${LANDMARK_COLOR}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="3.5" fill="#fff"/>
      </svg>`;

    const marker = L.marker([lm.lat, lm.lon], {
      icon: L.divIcon({
        html: pinSvg,
        className: '',
        iconSize:   [20, 28],
        iconAnchor: [10, 27]
      }),
      zIndexOffset: 600
    }).addTo(map);

    landmarkMarkers[lm.id] = marker;
  }
}

function toggleLandmark(lm) {
  const card = document.querySelector(`.landmark-card[data-id="${lm.id}"]`);

  if (activeLandmarkIds.has(lm.id)) {
    activeLandmarkIds.delete(lm.id);
    card?.classList.add('inactive');
    if (landmarkMarkers[lm.id]) landmarkMarkers[lm.id].setOpacity(0);
  } else {
    activeLandmarkIds.add(lm.id);
    card?.classList.remove('inactive');
    if (landmarkMarkers[lm.id]) landmarkMarkers[lm.id].setOpacity(1);
  }
}

function landmarkCardHTML(lm) {
  const notes = lm.notes
    ? `<div class="run-notes">${escapeHtml(lm.notes)}</div>`
    : '';
  return `
    <div class="landmark-card" data-id="${lm.id}">
      <div class="landmark-card-header">
        <span class="landmark-label">&#x1F4CD; Landmark</span>
        ${lm.elevation ? `<span class="landmark-elevation">${lm.elevation} m</span>` : ''}
      </div>
      <div class="run-title">${escapeHtml(lm.title)}</div>
      ${notes}
    </div>`;
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
