// Global state
let songsData = [];
let allSongs = [];

// Google Sheets configuration
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1nJVZRkxuoC8G8dklkVRlNb9aIIYBG-l-Nl-LaGh5MwQ/export?format=csv';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadFromGoogleSheets();
});

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
    document.getElementById('filterInterpret').addEventListener('change', filterSongs);
    document.getElementById('filterYear').addEventListener('change', filterSongs);
    document.getElementById('filterKey').addEventListener('change', filterSongs);
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
    displaySongs(songsData);
}

function populateFilters() {
    // Get unique values
    const interprets = [...new Set(songsData.map(s => s.interpret).filter(Boolean))].sort();
    const years = [...new Set(songsData.map(s => s.year).filter(Boolean))].sort();
    const keys = [...new Set(songsData.map(s => s.key).filter(Boolean))].sort();
    
    // Populate selects
    const interpretSelect = document.getElementById('filterInterpret');
    interpretSelect.innerHTML = '<option value="">All Artists</option>';
    interprets.forEach(interpret => {
        interpretSelect.innerHTML += `<option value="${interpret}">${interpret}</option>`;
    });
    
    const yearSelect = document.getElementById('filterYear');
    yearSelect.innerHTML = '<option value="">All Years</option>';
    years.forEach(year => {
        yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
    
    const keySelect = document.getElementById('filterKey');
    keySelect.innerHTML = '<option value="">All Keys</option>';
    keys.forEach(key => {
        keySelect.innerHTML += `<option value="${key}">${key}</option>`;
    });
}

function filterSongs() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterInterpret = document.getElementById('filterInterpret').value;
    const filterYear = document.getElementById('filterYear').value;
    const filterKey = document.getElementById('filterKey').value;
    const filterBpmMin = document.getElementById('filterBpmMin').value;
    const filterBpmMax = document.getElementById('filterBpmMax').value;
    
    let filtered = allSongs.filter(song => {
        // Search filter
        const matchesSearch = !searchTerm || 
            song.songName.toLowerCase().includes(searchTerm) ||
            song.interpret.toLowerCase().includes(searchTerm);
        
        // Interpret filter
        const matchesInterpret = !filterInterpret || song.interpret === filterInterpret;
        
        // Year filter
        const matchesYear = !filterYear || song.year == filterYear;
        
        // Key filter
        const matchesKey = !filterKey || song.key === filterKey;
        
        // BPM filter
        const bpm = parseFloat(song.bpm);
        const matchesBpmMin = !filterBpmMin || (bpm >= parseFloat(filterBpmMin));
        const matchesBpmMax = !filterBpmMax || (bpm <= parseFloat(filterBpmMax));
        
        return matchesSearch && matchesInterpret && matchesYear && matchesKey && matchesBpmMin && matchesBpmMax;
    });
    
    displaySongs(filtered);
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterInterpret').value = '';
    document.getElementById('filterYear').value = '';
    document.getElementById('filterKey').value = '';
    document.getElementById('filterBpmMin').value = '';
    document.getElementById('filterBpmMax').value = '';
    displaySongs(allSongs);
}

function displaySongs(songs) {
    const songList = document.getElementById('songList');
    
    if (songs.length === 0) {
        songList.innerHTML = '<p class="empty-state">No songs found</p>';
        return;
    }
    
    songList.innerHTML = songs.map((song, index) => `
        <div class="song-card" onclick="openSong(${allSongs.indexOf(song)})">
            <h3>${song.songName || 'Untitled'}</h3>
            <p class="artist">${song.interpret || 'Unknown Artist'}</p>
            <div class="metadata">
                ${song.year ? `<span class="tag">📅 ${song.year}</span>` : ''}
                ${song.key ? `<span class="tag">🎹 ${song.key}</span>` : ''}
                ${song.bpm ? `<span class="tag">🥁 ${song.bpm} BPM</span>` : ''}
            </div>
        </div>
    `).join('');
}

function openSong(index) {
    // Save selected song index
    localStorage.setItem('selectedSongIndex', index);
    window.location.href = 'song.html';
}

async function loadFromGoogleSheets() {
    try {
        document.getElementById('fileStatus').textContent = '⏳ Loading from Google Sheets...';
        
        const response = await fetch(GOOGLE_SHEET_URL);
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
