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
    document.getElementById('filterFromYear').addEventListener('change', (e) => {
        if (e.target.value) {
            document.getElementById('filterBeforeYear').value = '';
        }
        filterSongs();
    });
    document.getElementById('filterBeforeYear').addEventListener('change', (e) => {
        if (e.target.value) {
            document.getElementById('filterFromYear').value = '';
        }
        filterSongs();
    });
    document.getElementById('filterKey').addEventListener('change', filterSongs);
    document.getElementById('filterInstrumental').addEventListener('change', filterSongs);
    document.getElementById('filterBpmMin').addEventListener('input', filterSongs);
    document.getElementById('filterBpmMax').addEventListener('input', filterSongs);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
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

function processSongsData(data) {
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
            instrumental: normalized['instrumental'] || '',
            originalLink: normalized['link to original song'] || normalized['original'] || normalized['originallink'] || '',
            karaokeLink: normalized['link to karaoke version'] || normalized['karaoke'] || normalized['karaokelink'] || '',
            lyricsFile: normalized['lyrics file'] || normalized['lyricsfile'] || normalized['file'] || ''
        };
    });
    
    allSongs = [...songsData];
    
    // Save to localStorage as cache
    localStorage.setItem('songsData', JSON.stringify(songsData));
    localStorage.setItem('songsDataTimestamp', Date.now().toString());
    
    populateFilters();
    restoreFilterState(); // Restore saved filter state
    filterSongs(); // Use filterSongs instead of displaySongs to apply default sorting
}

function restoreFilterState() {
    const savedState = localStorage.getItem('filterState');
    if (savedState) {
        try {
            const filterState = JSON.parse(savedState);
            
            // Restore all filter values (including empty strings)
            document.getElementById('searchInput').value = filterState.searchTerm || '';
            document.getElementById('sortBy').value = filterState.sortBy || 'artist';
            document.getElementById('filterInterpret').value = filterState.interpret || '';
            document.getElementById('filterFromYear').value = filterState.fromYear || '';
            document.getElementById('filterBeforeYear').value = filterState.beforeYear || '';
            document.getElementById('filterKey').value = filterState.key || '';
            document.getElementById('filterInstrumental').value = filterState.instrumental || '';
            document.getElementById('filterBpmMin').value = filterState.bpmMin || '';
            document.getElementById('filterBpmMax').value = filterState.bpmMax || '';
            
        } catch (error) {
            console.error('Error restoring filter state:', error);
        }
    }
}

function populateFilters() {
    // Get unique values
    const interprets = [...new Set(songsData.map(s => s.interpret).filter(Boolean))].sort();
    const years = [...new Set(songsData.map(s => s.year).filter(Boolean))].sort((a, b) => b - a);
    const keys = [...new Set(songsData.map(s => s.key).filter(Boolean))].sort();
    
    // Populate selects
    const interpretSelect = document.getElementById('filterInterpret');
    interpretSelect.innerHTML = '<option value="">All Artists</option>';
    interprets.forEach(interpret => {
        interpretSelect.innerHTML += `<option value="${interpret}">${interpret}</option>`;
    });
    
    const fromYearSelect = document.getElementById('filterFromYear');
    fromYearSelect.innerHTML = '<option value="">From Year</option>';
    years.forEach(year => {
        fromYearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    const beforeYearSelect = document.getElementById('filterBeforeYear');
    beforeYearSelect.innerHTML = '<option value="">Before Year</option>';
    years.forEach(year => {
        beforeYearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    const keySelect = document.getElementById('filterKey');
    keySelect.innerHTML = '<option value="">All Keys</option>';
    keys.forEach(key => {
        keySelect.innerHTML += `<option value="${key}">${key}</option>`;
    });
}

function filterSongs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortBy = document.getElementById('sortBy').value;
    const filterInterpret = document.getElementById('filterInterpret').value;
    const filterFromYear = document.getElementById('filterFromYear').value;
    const filterBeforeYear = document.getElementById('filterBeforeYear').value;
    const filterKey = document.getElementById('filterKey').value;
    const filterInstrumental = document.getElementById('filterInstrumental').value;
    const filterBpmMin = document.getElementById('filterBpmMin').value;
    const filterBpmMax = document.getElementById('filterBpmMax').value;
    
    let filtered = allSongs.filter(song => {
        // Search filter
        const matchesSearch = !searchTerm || 
            song.songName.toLowerCase().includes(searchTerm) ||
            song.interpret.toLowerCase().includes(searchTerm);
        
        // Interpret filter
        const matchesInterpret = !filterInterpret || song.interpret === filterInterpret;
        
        // Year filter - either From Year (>=) or Before Year (<=)
        const songYear = parseInt(song.year);
        const matchesYear = (!filterFromYear || songYear >= parseInt(filterFromYear)) &&
                           (!filterBeforeYear || songYear <= parseInt(filterBeforeYear));
        
        // Key filter
        const matchesKey = !filterKey || song.key === filterKey;
        
        // Instrumental filter
        const matchesInstrumental = !filterInstrumental || song.instrumental == filterInstrumental;
        
        // BPM filter
        const bpm = parseFloat(song.bpm);
        const matchesBpmMin = !filterBpmMin || (bpm >= parseFloat(filterBpmMin));
        const matchesBpmMax = !filterBpmMax || (bpm <= parseFloat(filterBpmMax));
        
        return matchesSearch && matchesInterpret && matchesYear && matchesKey && matchesInstrumental && matchesBpmMin && matchesBpmMax;
    });
    
    // Sort the filtered results
    filtered.sort((a, b) => {
        if (sortBy === 'artist') {
            // Sort by Artist, then Song title
            const artistCompare = (a.interpret || '').localeCompare(b.interpret || '');
            if (artistCompare !== 0) return artistCompare;
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
    document.getElementById('filterFromYear').value = '';
    document.getElementById('filterBeforeYear').value = '';
    document.getElementById('filterKey').value = '';
    document.getElementById('filterInstrumental').value = '';
    document.getElementById('filterBpmMin').value = '';
    document.getElementById('filterBpmMax').value = '';
    
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
        counter.textContent = `${songs.length} song${songs.length !== 1 ? 's' : ''}`;
    }
    
    if (songs.length === 0) {
        songList.innerHTML = '<p class="empty-state">No songs found</p>';
        return;
    }
    
    // First render the cards immediately
    songList.innerHTML = songs.map((song, index) => `
        <div class="song-card" id="song-card-${allSongs.indexOf(song)}" onclick="openSong(${allSongs.indexOf(song)})">
            <h3>${song.songName || 'Untitled'}</h3>
            <p class="artist">${song.interpret || 'Unknown Artist'}</p>
            <div class="metadata">
                ${song.year ? `<span class="tag">📅 ${song.year}</span>` : ''}
                ${song.key ? `<span class="tag">🎼 ${song.key}</span>` : ''}
                ${song.bpm ? `<span class="tag">🥁 ${song.bpm} BPM</span>` : ''}
                ${song.instrumental == '1' ? `<span class="tag">🎹</span>` : ''}
            </div>
        </div>
    `).join('');
    
    // Then validate links asynchronously and add error class if needed
    songs.forEach(async (song, index) => {
        const cardId = `song-card-${allSongs.indexOf(song)}`;
        const card = document.getElementById(cardId);
        
        // Skip validation for instrumental songs (they don't need lyrics)
        if (song.instrumental == '1') {
            return;
        }
        
        if (card && song.lyricsFile) {
            const isValid = await checkLyricsLink(song.lyricsFile);
            if (!isValid) {
                card.classList.add('song-card-error');
            }
        } else if (card && !song.lyricsFile) {
            // If there's no lyrics file at all, mark as error
            card.classList.add('song-card-error');
        }
    });
}

function openSong(index) {
    // Save selected song index
    localStorage.setItem('selectedSongIndex', index);
    
    // Save current filter state
    const filterState = {
        searchTerm: document.getElementById('searchInput').value,
        sortBy: document.getElementById('sortBy').value,
        interpret: document.getElementById('filterInterpret').value,
        fromYear: document.getElementById('filterFromYear').value,
        beforeYear: document.getElementById('filterBeforeYear').value,
        key: document.getElementById('filterKey').value,
        instrumental: document.getElementById('filterInstrumental').value,
        bpmMin: document.getElementById('filterBpmMin').value,
        bpmMax: document.getElementById('filterBpmMax').value
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
