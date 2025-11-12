// Global state
let songsData = [];
let allSongs = [];
let config = {};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    setupEventListeners();
    loadFromGoogleSheets();
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
        config.googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/1nJVZRkxuoC8G8dklkVRlNb9aIIYBG-l-Nl-LaGh5MwQ/export?format=csv';
    }
}

function setupEventListeners() {
    document.getElementById('menuBtn').addEventListener('click', toggleMenu);
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadFromGoogleSheets();
        setTimeout(() => {
            document.getElementById('menuPanel').style.display = 'none';
        }, 1500);
    });
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

async function processSongsData(data) {
    // Map column names (case-insensitive)
    songsData = data.map(row => {
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
    });
    
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
        interpretSelect.innerHTML += `<option value="${interpret}">${interpret}</option>`;
    });
    
    const keySelect = document.getElementById('filterKey');
    keySelect.innerHTML = '<option value="">🎼 All Keys</option>';
    keys.forEach(key => {
        keySelect.innerHTML += `<option value="${key}">${key}</option>`;
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
    
    // Check if it's a Google Doc link
    if (lyricsFile.includes('docs.google.com')) {
        try {
            // For Google Docs, we'll do a HEAD request to check if it's accessible
            const response = await fetch(lyricsFile, { 
                method: 'HEAD',
                mode: 'no-cors' // Google Docs won't allow CORS, but we can still detect some errors
            });
            // With no-cors mode, if fetch doesn't throw, the URL is probably valid
            return true;
        } catch (error) {
            // If fetch throws, the URL is definitely invalid
            return false;
        }
    } else {
        // For local files, check if the file exists
        try {
            const response = await fetch(`lyrics/${lyricsFile}`, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            return false;
        }
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
        const instrumentalClass = song.instrumental == '1' ? ' song-card-instrumental' : '';
        const errorClass = song.lyricsValid === false ? ' song-card-error' : '';
        return `
        <div class="song-card${instrumentalClass}${errorClass}" onclick="openSong(${allSongs.indexOf(song)})">
            <h3>${song.songName || 'Untitled'}</h3>
            <p class="artist">${song.interpret || 'Unknown Artist'}</p>
            <div class="metadata">
                ${song.year ? `<span class="tag">📅 ${song.year}</span>` : ''}
                ${song.key ? `<span class="tag">🎼 ${song.key}</span>` : ''}
                ${song.bpm ? `<span class="tag">🥁 ${song.bpm} bpm</span>` : ''}
            </div>
        </div>
    `}).join('');
}

function openSong(index) {
    // Save selected song index
    localStorage.setItem('selectedSongIndex', index);
    
    // Save current filter state
    const filterState = {
        searchTerm: document.getElementById('searchInput').value,
        sortBy: document.getElementById('sortBy').value,
        interpret: document.getElementById('filterInterpret').value,
        yearMin: document.getElementById('yearMin').value,
        yearMax: document.getElementById('yearMax').value,
        key: document.getElementById('filterKey').value,
        instrumental: document.getElementById('filterInstrumental').value,
        bpmMin: document.getElementById('bpmMin').value,
        bpmMax: document.getElementById('bpmMax').value
    };
    localStorage.setItem('filterState', JSON.stringify(filterState));
    
    window.location.href = 'song.html';
}

async function loadFromGoogleSheets() {
    try {
        document.getElementById('fileStatus').textContent = '⏳ Loading from Google Sheets...';
        
        const googleSheetsUrl = config.googleSheetsUrl || 'https://docs.google.com/spreadsheets/d/1nJVZRkxuoC8G8dklkVRlNb9aIIYBG-l-Nl-LaGh5MwQ/export?format=csv';
        const response = await fetch(googleSheetsUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch Google Sheets data');
        }
        
        const csvText = await response.text();
        console.log('Raw CSV:', csvText.substring(0, 500)); // Debug: see what we're getting
        
        const jsonData = parseCSV(csvText);
        console.log('Parsed data:', jsonData); // Debug: see parsed result
        
        processSongsData(jsonData);
        document.getElementById('fileStatus').textContent = `✓ ${jsonData.length} songs loaded from Google Sheets`;
        
    } catch (error) {
        console.error('Error loading from Google Sheets:', error);
        document.getElementById('fileStatus').textContent = '❌ Failed to load from Google Sheets';
        
        // Fallback to localStorage if available
        loadSavedData();
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
