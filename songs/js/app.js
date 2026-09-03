// Global state
let songsData = [];
let allSongs = [];
let config = {};
// The current filter+sort result, kept around so song.js's "Next/Previous
// in order" suggestions can navigate through it without recomputing the
// filter state from the (hidden, since we're in song view) library form.
let lastFilteredSongs = [];

const FALLBACK_GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1nJVZRkxuoC8G8dklkVRlNb9aIIYBG-l-Nl-LaGh5MwQ/export?format=csv';

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    setupEventListeners();

    // Check for cached data first
    const cachedData = localStorage.getItem('songsData');
    if (cachedData) {
        try {
            // Immediately load and display cached data
            songsData = JSON.parse(cachedData);
            allSongs = [...songsData];
            populateFilters();
            restoreFilterState();
            filterSongs();

            const cachedTimestamp = localStorage.getItem('songsDataTimestamp');
            const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp) : 0;
            const cacheAgeMinutes = Math.floor(cacheAge / 60000);
            document.getElementById('fileStatus').textContent = `✓ ${songsData.length} songs (cached ${cacheAgeMinutes}m ago)`;

            // Load fresh data in background
            loadFromGoogleSheetsBackground();
        } catch (error) {
            console.error('Error loading cached data:', error);
            // If cache fails, load normally
            loadFromGoogleSheets();
        }
    } else {
        // No cache, load normally
        loadFromGoogleSheets();
    }
});

// Load configuration from config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        config = await response.json();

        // Set Google Drive folder link
        const driveFolderLink = document.getElementById('driveFolderLink');
        if (driveFolderLink && config.googleDriveFolder) {
            driveFolderLink.href = config.googleDriveFolder;
        }

        // Set Edit Google Sheet link
        const editSheetLink = document.getElementById('editSheetLink');
        if (editSheetLink && config.googleSheetsUrl) {
            // Convert export URL to edit URL
            const editUrl = config.googleSheetsUrl.replace('/export?format=csv', '/edit');
            editSheetLink.href = editUrl;
        }
    } catch (error) {
        console.error('Error loading config:', error);
        // Fallback to hardcoded URL if config fails
        config.googleSheetsUrl = FALLBACK_GOOGLE_SHEETS_URL;
    }
}

function setupEventListeners() {
    document.getElementById('menuBtn').addEventListener('click', toggleMenu);
    // The song page's camera button has its own handler in song.js (it
    // also drives gesture recognition, not just the raw stream) - only
    // the library header button uses this generic stream-only toggle.
    document.getElementById('cameraHeaderBtn').addEventListener('click', toggleSharedCamera);
    document.getElementById('refreshBtn').addEventListener('click', refreshAllFromGoogleDrive);
    document.getElementById('excelUpload').addEventListener('change', handleFileUpload);
    document.getElementById('searchInput').addEventListener('input', filterSongs);
    document.getElementById('sortBy').addEventListener('change', filterSongs);
    document.getElementById('filterInterpret').addEventListener('change', filterSongs);
    document.getElementById('filterKey').addEventListener('change', filterSongs);
    document.getElementById('filterInstrumental').addEventListener('change', filterSongs);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);

    // Year range sliders
    const yearMin = document.getElementById('yearMin');
    const yearMax = document.getElementById('yearMax');
    const yearLabel = document.getElementById('yearRangeLabel');

    yearMin.addEventListener('input', function() {
        if (parseInt(this.value) > parseInt(yearMax.value)) {
            this.value = yearMax.value;
        }
        updateYearLabel();
        filterSongs();
    });

    yearMax.addEventListener('input', function() {
        if (parseInt(this.value) < parseInt(yearMin.value)) {
            this.value = yearMin.value;
        }
        updateYearLabel();
        filterSongs();
    });

    function updateYearLabel() {
        yearLabel.textContent = `${yearMin.value} - ${yearMax.value}`;
    }

    // BPM range sliders
    const bpmMin = document.getElementById('bpmMin');
    const bpmMax = document.getElementById('bpmMax');
    const bpmLabel = document.getElementById('bpmRangeLabel');

    bpmMin.addEventListener('input', function() {
        if (parseInt(this.value) > parseInt(bpmMax.value)) {
            this.value = bpmMax.value;
        }
        updateBpmLabel();
        filterSongs();
    });

    bpmMax.addEventListener('input', function() {
        if (parseInt(this.value) < parseInt(bpmMin.value)) {
            this.value = bpmMin.value;
        }
        updateBpmLabel();
        filterSongs();
    });

    function updateBpmLabel() {
        bpmLabel.textContent = `${bpmMin.value} - ${bpmMax.value}`;
    }

    // Initialize labels
    updateYearLabel();
    updateBpmLabel();
}

function toggleMenu() {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel.style.display === 'none') {
        menuPanel.style.display = 'block';
    } else {
        menuPanel.style.display = 'none';
    }
}

// ---------------------------------------------------------------------
// Shared camera stream
//
// getUserMedia is requested at most once per session (either here, or
// lazily on the first "Play Mode" tap in song.js) and the resulting
// MediaStream is kept alive and reused for every song. iOS Safari
// re-prompts for camera access on every getUserMedia call and on every
// full page navigation, which made Play Mode ask for permission on every
// single song. Since the library and song views now live on one page and
// never navigate away, the stream and its permission grant simply persist.
// ---------------------------------------------------------------------
let sharedCameraStream = null;

async function enableSharedCamera() {
    if (sharedCameraStream && sharedCameraStream.active) {
        return sharedCameraStream;
    }
    sharedCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
    });
    return sharedCameraStream;
}

function releaseSharedCamera() {
    if (sharedCameraStream) {
        sharedCameraStream.getTracks().forEach(track => track.stop());
        sharedCameraStream = null;
    }
}

function updateCameraToggleLabel() {
    const isOn = sharedCameraStream && sharedCameraStream.active;
    document.querySelectorAll('[data-camera-toggle]').forEach(btn => {
        btn.classList.toggle('active', isOn);
        btn.title = isOn ? 'Camera on - tap to turn off' : 'Camera off - tap to turn on';
    });
}

async function toggleSharedCamera() {
    if (sharedCameraStream && sharedCameraStream.active) {
        if (typeof stopGesture === 'function') stopGesture();
        releaseSharedCamera();
        updateCameraToggleLabel();
        return;
    }
    document.querySelectorAll('[data-camera-toggle]').forEach(btn => {
        btn.title = 'Requesting camera...';
    });
    try {
        await enableSharedCamera();
    } catch (error) {
        alert('Could not access camera: ' + error.message);
    }
    updateCameraToggleLabel();
}

// ---------------------------------------------------------------------
// View switching (library <-> song). No page navigation happens here -
// both views live in index.html and are just shown/hidden, so the camera
// stream above (and any in-progress Play Mode) survives moving between
// songs. The '#song' hash lets the browser/OS back gesture close the song
// view like a native back action instead of leaving the site.
// ---------------------------------------------------------------------
function showLibraryView() {
    document.getElementById('songView').style.display = 'none';
    document.getElementById('libraryView').style.display = 'block';
    document.body.classList.remove('song-page');
}

function showSongViewContainer() {
    document.getElementById('libraryView').style.display = 'none';
    // Leave display unset here (not 'block') so the CSS rule
    // `body.song-page #songView { display: flex }` can take over - an
    // inline 'block' would win over it and break .chunk-viewer's flex:1,
    // leaving it sized to its own content instead of filling the screen.
    document.getElementById('songView').style.display = '';
    document.body.classList.add('song-page');
}

window.addEventListener('popstate', () => {
    if (location.hash !== '#song') {
        exitSongView(); // defined in song.js
    }
});

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            processSongsData(jsonData);
            document.getElementById('fileStatus').textContent = `✓ Loaded ${jsonData.length} songs`;

            // Close menu after successful upload
            setTimeout(() => {
                document.getElementById('menuPanel').style.display = 'none';
            }, 1500);
        } catch (error) {
            alert('Error reading file: ' + error.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// Map a raw spreadsheet/CSV row (whatever the column names happen to be)
// into the song shape the rest of the app expects.
function normalizeSongRow(row) {
    const normalized = {};
    Object.keys(row).forEach(key => {
        const lowerKey = key.toLowerCase().trim();
        normalized[lowerKey] = row[key];
    });

    return {
        songName: normalized['song name'] || normalized['songname'] || normalized['title'] || '',
        interpret: normalized['interpret'] || normalized['artist'] || '',
        year: normalized['year'] || normalized['year of release'] || '',
        key: normalized['key'] || '',
        bpm: normalized['bpm'] || '',
        beat: normalized['beat'] || '',
        instrumental: normalized['instrumental'] || '',
        originalLink: normalized['link to original song'] || normalized['original'] || normalized['originallink'] || '',
        karaokeLink: normalized['link to karaoke version'] || normalized['karaoke'] || normalized['karaokelink'] || '',
        lyricsFile: normalized['lyrics file'] || normalized['lyricsfile'] || normalized['file'] || '',
        lyricsValid: null // Will be set during validation
    };
}

async function processSongsData(data) {
    songsData = data.map(normalizeSongRow);
    allSongs = [...songsData];

    // Validate lyrics links once on load
    await validateAllLyrics();

    // Save to localStorage as cache
    localStorage.setItem('songsData', JSON.stringify(songsData));
    localStorage.setItem('songsDataTimestamp', Date.now().toString());

    populateFilters();
    restoreFilterState(); // Restore saved filter state
    filterSongs(); // Use filterSongs instead of displaySongs to apply default sorting
}

// Validate all lyrics links once during data load
async function validateAllLyrics() {
    const validationPromises = songsData.map(async (song) => {
        // Skip validation for instrumental songs
        if (song.instrumental == '1') {
            song.lyricsValid = true; // Instrumental songs don't need lyrics
            return;
        }

        if (!song.lyricsFile) {
            song.lyricsValid = false;
            return;
        }

        song.lyricsValid = await checkLyricsLink(song.lyricsFile);
    });

    await Promise.all(validationPromises);
}

function restoreFilterState() {
    const savedState = localStorage.getItem('filterState');
    if (savedState) {
        try {
            const filterState = JSON.parse(savedState);

            // Check if this is old toggle-based state - if so, ignore it
            if (filterState.yearMode !== undefined || filterState.bpmMode !== undefined) {
                console.log('Old filter state format detected, skipping restore');
                localStorage.removeItem('filterState');
                return;
            }

            // Restore all filter values (including empty strings)
            document.getElementById('searchInput').value = filterState.searchTerm || '';
            document.getElementById('sortBy').value = filterState.sortBy || 'artist';
            document.getElementById('filterInterpret').value = filterState.interpret || '';
            document.getElementById('filterKey').value = filterState.key || '';
            document.getElementById('filterInstrumental').value = filterState.instrumental || '';

            // Restore year range sliders (only if values exist in saved state)
            if (filterState.yearMin !== undefined && filterState.yearMax !== undefined) {
                document.getElementById('yearMin').value = filterState.yearMin;
                document.getElementById('yearMax').value = filterState.yearMax;
                document.getElementById('yearRangeLabel').textContent =
                    `${filterState.yearMin} - ${filterState.yearMax}`;
            }

            // Restore BPM range sliders (only if values exist in saved state)
            if (filterState.bpmMin !== undefined && filterState.bpmMax !== undefined) {
                document.getElementById('bpmMin').value = filterState.bpmMin;
                document.getElementById('bpmMax').value = filterState.bpmMax;
                document.getElementById('bpmRangeLabel').textContent =
                    `${filterState.bpmMin} - ${filterState.bpmMax}`;
            }

        } catch (error) {
            console.error('Error restoring filter state:', error);
        }
    }
}

// Escape a value for safe interpolation into innerHTML. Song data comes
// from a Google Sheet that may be shared/edited by others, so it's treated
// as untrusted text (not markup) everywhere except the dedicated lyrics
// containers, which are meant to hold HTML.
function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : value;
    return div.innerHTML;
}

function populateFilters() {
    // Get unique values
    const interprets = [...new Set(songsData.map(s => s.interpret).filter(Boolean))].sort();
    const years = songsData.map(s => parseInt(s.year)).filter(y => !isNaN(y) && y > 0);
    const bpms = songsData.map(s => parseFloat(s.bpm)).filter(b => !isNaN(b) && b > 0);
    const keys = [...new Set(songsData.map(s => s.key).filter(Boolean))].sort();

    // Set year range slider bounds
    if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        const yearMinSlider = document.getElementById('yearMin');
        const yearMaxSlider = document.getElementById('yearMax');

        yearMinSlider.min = minYear;
        yearMinSlider.max = maxYear;
        yearMaxSlider.min = minYear;
        yearMaxSlider.max = maxYear;

        // Set to full range initially (no filter) - but don't override if already set
        const currentYearMin = yearMinSlider.value;
        const currentYearMax = yearMaxSlider.value;

        // Only initialize if values are at the default HTML values (1900/2100)
        if (currentYearMin === '1900' || currentYearMin < minYear || currentYearMin > maxYear) {
            yearMinSlider.value = minYear;
        }
        if (currentYearMax === '2100' || currentYearMax < minYear || currentYearMax > maxYear) {
            yearMaxSlider.value = maxYear;
        }

        document.getElementById('yearRangeLabel').textContent = `${yearMinSlider.value} - ${yearMaxSlider.value}`;
    }

    // Set BPM range slider bounds
    if (bpms.length > 0) {
        const minBpm = Math.floor(Math.min(...bpms));
        const maxBpm = Math.ceil(Math.max(...bpms));
        const bpmMinSlider = document.getElementById('bpmMin');
        const bpmMaxSlider = document.getElementById('bpmMax');

        bpmMinSlider.min = minBpm;
        bpmMinSlider.max = maxBpm;
        bpmMaxSlider.min = minBpm;
        bpmMaxSlider.max = maxBpm;

        // Set to full range initially (no filter) - but don't override if already set
        const currentBpmMin = bpmMinSlider.value;
        const currentBpmMax = bpmMaxSlider.value;

        // Only initialize if values are at the default HTML values (40/240)
        if (currentBpmMin === '40' || currentBpmMin < minBpm || currentBpmMin > maxBpm) {
            bpmMinSlider.value = minBpm;
        }
        if (currentBpmMax === '240' || currentBpmMax < minBpm || currentBpmMax > maxBpm) {
            bpmMaxSlider.value = maxBpm;
        }

        document.getElementById('bpmRangeLabel').textContent = `${bpmMinSlider.value} - ${bpmMaxSlider.value}`;
    }

    // Populate selects
    const interpretSelect = document.getElementById('filterInterpret');
    interpretSelect.innerHTML = '<option value="">👥 All Artists</option>';
    interprets.forEach(interpret => {
        const safe = escapeHtml(interpret);
        interpretSelect.innerHTML += `<option value="${safe}">${safe}</option>`;
    });

    const keySelect = document.getElementById('filterKey');
    keySelect.innerHTML = '<option value="">🎼 All Keys</option>';
    keys.forEach(key => {
        const safe = escapeHtml(key);
        keySelect.innerHTML += `<option value="${safe}">${safe}</option>`;
    });
}

function filterSongs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortBy = document.getElementById('sortBy').value;
    const filterInterpret = document.getElementById('filterInterpret').value;
    const yearMin = parseInt(document.getElementById('yearMin').value);
    const yearMax = parseInt(document.getElementById('yearMax').value);
    const filterKey = document.getElementById('filterKey').value;
    const filterInstrumental = document.getElementById('filterInstrumental').value;
    const bpmMin = parseFloat(document.getElementById('bpmMin').value);
    const bpmMax = parseFloat(document.getElementById('bpmMax').value);

    let filtered = allSongs.filter(song => {
        // Search filter
        const matchesSearch = !searchTerm ||
            song.songName.toLowerCase().includes(searchTerm) ||
            song.interpret.toLowerCase().includes(searchTerm);

        // Interpret filter
        const matchesInterpret = !filterInterpret || song.interpret === filterInterpret;

        // Year range filter
        const songYear = parseInt(song.year);
        const matchesYear = isNaN(songYear) || (songYear >= yearMin && songYear <= yearMax);

        // Key filter
        const matchesKey = !filterKey || song.key === filterKey;

        // Instrumental filter
        const matchesInstrumental = !filterInstrumental || song.instrumental == filterInstrumental;

        // BPM range filter
        const songBpm = parseFloat(song.bpm);
        const matchesBpm = isNaN(songBpm) || (songBpm >= bpmMin && songBpm <= bpmMax);

        return matchesSearch && matchesInterpret && matchesYear && matchesKey && matchesInstrumental && matchesBpm;
    });

    // Sort the filtered results
    filtered.sort((a, b) => {
        if (sortBy === 'artist') {
            // Sort by Artist, then Song title
            const artistCompare = (a.interpret || '').localeCompare(b.interpret || '');
            if (artistCompare !== 0) return artistCompare;
            return (a.songName || '').localeCompare(b.songName || '');
        } else if (sortBy === 'yearAsc') {
            // Sort by Year ascending (oldest first)
            const yearA = parseInt(a.year) || 0;
            const yearB = parseInt(b.year) || 0;
            if (yearA !== yearB) return yearA - yearB;
            // Secondary sort by song title
            return (a.songName || '').localeCompare(b.songName || '');
        } else if (sortBy === 'yearDesc') {
            // Sort by Year descending (newest first)
            const yearA = parseInt(a.year) || 0;
            const yearB = parseInt(b.year) || 0;
            if (yearA !== yearB) return yearB - yearA;
            // Secondary sort by song title
            return (a.songName || '').localeCompare(b.songName || '');
        } else {
            // Sort by Song title only
            return (a.songName || '').localeCompare(b.songName || '');
        }
    });

    lastFilteredSongs = filtered;
    displaySongs(filtered);
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterInterpret').value = '';
    document.getElementById('filterKey').value = '';
    document.getElementById('filterInstrumental').value = '';

    // Reset year range sliders to full range
    const yearMinSlider = document.getElementById('yearMin');
    const yearMaxSlider = document.getElementById('yearMax');
    yearMinSlider.value = yearMinSlider.min;
    yearMaxSlider.value = yearMaxSlider.max;
    document.getElementById('yearRangeLabel').textContent = `${yearMinSlider.value} - ${yearMaxSlider.value}`;

    // Reset BPM range sliders to full range
    const bpmMinSlider = document.getElementById('bpmMin');
    const bpmMaxSlider = document.getElementById('bpmMax');
    bpmMinSlider.value = bpmMinSlider.min;
    bpmMaxSlider.value = bpmMaxSlider.max;
    document.getElementById('bpmRangeLabel').textContent = `${bpmMinSlider.value} - ${bpmMaxSlider.value}`;

    // Clear saved filter state
    localStorage.removeItem('filterState');

    filterSongs();
}

// Check if a lyrics file link is valid
async function checkLyricsLink(lyricsFile) {
    if (!lyricsFile) {
        return false; // No link provided
    }

    if (lyricsFile.includes('docs.google.com')) {
        // A HEAD request in no-cors mode returns an opaque response that
        // resolves whether or not the document actually exists, so it can't
        // reliably validate Google Docs links. Trust the sheet instead of
        // showing a "broken" badge that isn't actually meaningful.
        return true;
    }

    // For local files, check if the file exists
    try {
        const response = await fetch(`lyrics/${lyricsFile}`, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function displaySongs(songs) {
    const songList = document.getElementById('songList');

    // Update song counter
    const counter = document.getElementById('songCounter');
    if (counter) {
        const countText = songs.length;
        const labelText = songs.length !== 1 ? 'songs' : 'song';
        counter.innerHTML = `${countText} <span class="counter-label">${labelText}</span>`;
    }

    if (songs.length === 0) {
        songList.innerHTML = '<p class="empty-state">No songs found</p>';
        return;
    }

    // Render cards using cached validation results
    songList.innerHTML = songs.map((song, index) => {
        const isInstrumental = song.instrumental == '1';
        const isMissingLyrics = song.lyricsValid === false;
        return `
        <div class="song-card" onclick="openSong(${allSongs.indexOf(song)})">
            <h3>${escapeHtml(song.songName) || 'Untitled'}${isInstrumental ? '<span class="tag-instrumental">🎹</span>' : ''}</h3>
            <p class="artist">${escapeHtml(song.interpret) || 'Unknown Artist'}</p>
            <div class="metadata">
                ${song.year ? `<span class="tag">${escapeHtml(song.year)}</span>` : ''}
                ${song.key ? `<span class="tag">🎼 ${escapeHtml(song.key)}</span>` : ''}
                ${song.bpm ? `<span class="tag">${escapeHtml(song.bpm)} bpm</span>` : ''}
                ${isMissingLyrics ? '<span class="tag tag-missing-lyrics">❌ Missing lyrics</span>' : ''}
            </div>
        </div>
    `}).join('');
}

function openSong(index) {
    const song = allSongs[index];
    history.pushState({ view: 'song' }, '', '#song');
    enterSongView(song); // defined in song.js
}

async function loadFromGoogleSheets() {
    try {
        document.getElementById('fileStatus').textContent = '⏳ Loading from Google Sheets...';

        const googleSheetsUrl = config.googleSheetsUrl || FALLBACK_GOOGLE_SHEETS_URL;
        const response = await fetch(googleSheetsUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch Google Sheets data');
        }

        const csvText = await response.text();
        const jsonData = parseCSV(csvText);

        processSongsData(jsonData);
        document.getElementById('fileStatus').textContent = `✓ ${jsonData.length} songs loaded from Google Sheets`;

    } catch (error) {
        console.error('Error loading from Google Sheets:', error);
        document.getElementById('fileStatus').textContent = '❌ Failed to load from Google Sheets';

        // Fallback to localStorage if available
        loadSavedData();
    }
}

// The menu's "Refresh from Google Drive" action - refreshes the sheet
// metadata, then re-fetches and re-caches every song's Google Doc lyrics
// (see fetchAndCacheGoogleDoc in song.js) so the whole library is ready
// offline, not just the songs the user happened to open before. Fetching
// dozens of docs can take tens of seconds, so it's shown as a blocking
// overlay with running progress rather than a silent background task.
async function refreshAllFromGoogleDrive() {
    const overlay = document.getElementById('refreshOverlay');
    const overlayText = document.getElementById('refreshOverlayText');
    document.getElementById('menuPanel').style.display = 'none';
    overlay.style.display = 'flex';
    overlayText.textContent = 'Refreshing song list…';

    try {
        await loadFromGoogleSheets();

        const docSongs = songsData.filter(s => s.lyricsFile && s.lyricsFile.includes('docs.google.com/document'));
        let done = 0;
        overlayText.textContent = `Refreshing lyrics… 0 / ${docSongs.length}`;

        const CONCURRENCY = 5;
        let cursor = 0;
        async function worker() {
            while (cursor < docSongs.length) {
                const song = docSongs[cursor++];
                try {
                    await fetchAndCacheGoogleDoc(song.lyricsFile); // defined in song.js
                } catch (error) {
                    console.error(`Failed to refresh lyrics for "${song.songName}":`, error);
                }
                done++;
                overlayText.textContent = `Refreshing lyrics… ${done} / ${docSongs.length}`;
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, docSongs.length) }, worker));

        overlayText.textContent = `✓ Refreshed ${docSongs.length} song${docSongs.length !== 1 ? 's' : ''} for offline use`;
        await new Promise(resolve => setTimeout(resolve, 1200));
    } catch (error) {
        console.error('Refresh from Google Drive failed:', error);
        overlayText.textContent = '❌ Refresh failed - check your connection';
        await new Promise(resolve => setTimeout(resolve, 1800));
    } finally {
        overlay.style.display = 'none';
    }
}

// Load from Google Sheets in background and update if data changed
async function loadFromGoogleSheetsBackground() {
    try {
        const googleSheetsUrl = config.googleSheetsUrl || FALLBACK_GOOGLE_SHEETS_URL;
        const response = await fetch(googleSheetsUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch Google Sheets data');
        }

        const csvText = await response.text();
        const jsonData = parseCSV(csvText);
        const tempData = jsonData.map(normalizeSongRow);

        // Compare ignoring lyricsValid: it's only ever populated locally
        // after validateAllLyrics() runs, so a freshly-normalized row always
        // has it as null and would otherwise make every refresh look
        // "changed" even when nothing in the sheet actually did.
        const stripValidity = (list) => JSON.stringify(list.map(({ lyricsValid, ...rest }) => rest));
        const hasChanged = stripValidity(songsData) !== stripValidity(tempData);

        if (hasChanged) {
            console.log('Background refresh: Data changed, updating...');
            await processSongsData(jsonData);
            document.getElementById('fileStatus').textContent = `✓ ${jsonData.length} songs (refreshed)`;
        } else {
            console.log('Background refresh: No changes detected');
            // Update timestamp even though data hasn't changed
            localStorage.setItem('songsDataTimestamp', Date.now().toString());
        }

    } catch (error) {
        console.error('Background refresh failed:', error);
        // Silently fail - user already has cached data displayed
    }
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        // Handle CSV with quoted values that may contain commas
        const values = parseCSVLine(lines[i]);
        const row = {};

        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });

        data.push(row);
    }

    return data;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            // Clean up the value and extract URL from chip format if present
            let value = current.trim();

            // Check if this is a Google Sheets chip format: "Text", "URL"
            // or just extract any URL pattern
            const urlMatch = value.match(/https:\/\/[^\s,"]+/);
            if (urlMatch) {
                value = urlMatch[0];
            }

            values.push(value);
            current = '';
        } else {
            current += char;
        }
    }

    // Handle last value
    let value = current.trim();
    const urlMatch = value.match(/https:\/\/[^\s,"]+/);
    if (urlMatch) {
        value = urlMatch[0];
    }

    values.push(value);
    return values;
}

function loadSavedData() {
    const savedData = localStorage.getItem('songsData');
    if (savedData) {
        try {
            songsData = JSON.parse(savedData);
            allSongs = [...songsData];
            populateFilters();
            displaySongs(songsData);
            document.getElementById('fileStatus').textContent = `✓ ${songsData.length} songs loaded (cached)`;
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    } else {
        document.getElementById('fileStatus').textContent = 'Please check Google Sheets URL or upload a file';
    }
}
