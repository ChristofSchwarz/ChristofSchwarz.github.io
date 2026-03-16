const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const canvasCtx = canvasElement.getContext('2d');
const fingerCountDisplay = document.getElementById('fingerCount');
const statusText = document.getElementById('statusText');

let hands;
let camera;
let lastSelection = 0; // Track the last selected box (0 means none selected yet)
let currentChunk = 1; // Current chunk number (1-indexed)
let currentGesture = null; // Current detected gesture
let lastProcessedGesture = null; // Last gesture that triggered an action
let lastActionTime = 0; // Timestamp of last navigation action
const ACTION_COOLDOWN = 700; // Cooldown period in milliseconds (0.7 seconds)
let chunks = []; // Store parsed chunks from current song
let currentSong = 'wonderwall'; // Current song file name
let cameraActive = false; // Track camera state

// Initialize MediaPipe Hands
function initializeHands() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onResults);
}

// Calculate distance between two points
function getDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const dz = point1.z - point2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Check which fingers are extended
function getExtendedFingers(landmarks) {
    const extended = {
        thumb: false,
        index: false,
        middle: false,
        ring: false,
        pinky: false
    };
    
    const wrist = landmarks[0];
    
    // Thumb
    const thumbTip = landmarks[4];
    const thumbMCP = landmarks[2];
    const thumbDist = Math.abs(thumbTip.x - wrist.x);
    const thumbBaseDist = Math.abs(thumbMCP.x - wrist.x);
    extended.thumb = thumbDist > thumbBaseDist * 1.3;
    
    // Other fingers
    const fingerData = [
        { name: 'index', tip: 8, pip: 6 },
        { name: 'middle', tip: 12, pip: 10 },
        { name: 'ring', tip: 16, pip: 14 },
        { name: 'pinky', tip: 20, pip: 18 }
    ];
    
    fingerData.forEach(finger => {
        const tipY = landmarks[finger.tip].y;
        const pipY = landmarks[finger.pip].y;
        extended[finger.name] = tipY < pipY - 0.03;
    });
    
    return extended;
}

// Count extended fingers
function countFingers(landmarks) {
    if (!landmarks || landmarks.length === 0) return 0;
    const extended = getExtendedFingers(landmarks);
    return Object.values(extended).filter(v => v).length;
}

// Detect specific gestures
function detectGesture(landmarks) {
    if (!landmarks || landmarks.length === 0) return 'No hand';
    
    const extended = getExtendedFingers(landmarks);
    const fingerCount = Object.values(extended).filter(v => v).length;
    
    // Calculate distances for pinch/OK gestures
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = getDistance(thumbTip, indexTip);
    
    // Pinch - thumb and index very close (check this first)
    if (distance < 0.05) {
        return '🤏 Pinch';
    }
    
    // OK sign - thumb and index forming circle, other fingers extended
    if (distance < 0.08 && extended.middle && extended.ring && extended.pinky) {
        return '👌 OK';
    }
    
    // Peace sign - index and middle extended, others closed
    if (!extended.thumb && extended.index && extended.middle && !extended.ring && !extended.pinky) {
        return '✌️ Peace';
    }
    
    // Pointing - only index extended
    if (!extended.thumb && extended.index && !extended.middle && !extended.ring && !extended.pinky) {
        return '☝️ Pointing';
    }
    
    // Rock/Metal sign - index and pinky extended, middle and ring closed
    if (extended.index && !extended.middle && !extended.ring && extended.pinky) {
        return '🤘 Rock';
    }
    
    // Call me - thumb and pinky extended, others closed
    if (extended.thumb && !extended.index && !extended.middle && !extended.ring && extended.pinky) {
        return '🤙 Call Me';
    }
    
    // Thumbs up - only thumb extended, thumb pointing up
    if (extended.thumb && !extended.index && !extended.middle && !extended.ring && !extended.pinky) {
        const thumbBase = landmarks[2];
        if (thumbTip.y < thumbBase.y - 0.05) {
            return '👍 Thumbs Up';
        }
        if (thumbTip.y > thumbBase.y + 0.05) {
            return '👎 Thumbs Down';
        }
        return '👍/👎 Thumb';
    }
    
    // Open palm - all fingers extended and spread
    if (fingerCount === 5) {
        const indexTip = landmarks[8];
        const pinkyTip = landmarks[20];
        const spread = getDistance(indexTip, pinkyTip);
        if (spread > 0.12) {
            return '🖐️ Open Palm';
        }
    }
    
    // Fist
    if (fingerCount === 0) {
        return '✊ Fist';
    }
    
    // Default: show finger count
    return `${fingerCount} finger${fingerCount !== 1 ? 's' : ''}`;
}

// Handle detection results
function onResults(results) {
    // Set canvas size to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw video frame
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand landmarks
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 1, radius: 3});
        
        // Detect gesture
        const gesture = detectGesture(landmarks);
        currentGesture = gesture;
        
        // Process gesture for navigation
        processGesture(gesture);
        
        // Update display with detected gesture
        fingerCountDisplay.textContent = gesture;
        statusText.textContent = 'Hand detected'
    } else {
        currentGesture = null;
        lastProcessedGesture = null;
        fingerCountDisplay.textContent = '-';
        statusText.textContent = 'No hand detected';
    }

    canvasCtx.restore();
}

// Draw connectors between landmarks
function drawConnectors(ctx, landmarks, connections, style) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    
    for (const connection of connections) {
        const start = landmarks[connection[0]];
        const end = landmarks[connection[1]];
        
        ctx.beginPath();
        ctx.moveTo(start.x * canvasElement.width, start.y * canvasElement.height);
        ctx.lineTo(end.x * canvasElement.width, end.y * canvasElement.height);
        ctx.stroke();
    }
}

// Draw individual landmarks
function drawLandmarks(ctx, landmarks, style) {
    ctx.fillStyle = style.color;
    
    for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(
            landmark.x * canvasElement.width,
            landmark.y * canvasElement.height,
            style.radius,
            0,
            2 * Math.PI
        );
        ctx.fill();
    }
}

// Hand connections for drawing
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

// Navigate to next chunk
function nextChunk() {
    if (currentChunk < chunks.length) {
        currentChunk++;
        selectBox(currentChunk);
    }
}

// Navigate to previous chunk
function previousChunk() {
    if (currentChunk > 1) {
        currentChunk--;
        selectBox(currentChunk);
    }
}

// Process gesture for navigation
function processGesture(gesture) {
    const currentTime = Date.now();
    
    // Check if we're in cooldown period
    if (currentTime - lastActionTime < ACTION_COOLDOWN) {
        return; // Ignore all gestures during cooldown
    }
    
    // Check if this is a navigation gesture
    const isNext = gesture === '3 fingers';
    const isPrevious = gesture === '🤙 Call Me';
    
    if (isNext || isPrevious) {
        // If this gesture is different from what we last processed, execute action
        if (currentGesture !== lastProcessedGesture) {
            if (isNext) {
                nextChunk();
                lastActionTime = currentTime;
            } else if (isPrevious) {
                previousChunk();
                lastActionTime = currentTime;
            }
            lastProcessedGesture = currentGesture;
        }
    } else {
        // Gesture ended or changed to non-navigation gesture
        // Reset so next navigation gesture will trigger
        if (currentGesture !== lastProcessedGesture) {
            lastProcessedGesture = null;
        }
    }
}

// Select box (used by both gesture and click)
function selectBox(boxNumber) {
    if (boxNumber === lastSelection) return; // Already selected
    
    // Remove highlight from all boxes
    document.querySelectorAll('.selection-box').forEach(box => {
        box.classList.remove('highlighted');
    });
    
    // Highlight the selected box
    if (boxNumber >= 1 && boxNumber <= chunks.length) {
        const box = document.getElementById(`box${boxNumber}`);
        if (box) {
            box.classList.add('highlighted');
            lastSelection = boxNumber;
            currentChunk = boxNumber;
            displayChunk(boxNumber - 1); // Display corresponding chunk (0-indexed)
        }
    }
}

// Highlight selection box (called by gesture detection)
function highlightBox(boxNumber) {
    selectBox(boxNumber);
}

// Display chunk content
function displayChunk(chunkIndex) {
    const chunkContent = document.getElementById('chunkContent');
    if (chunkIndex >= 0 && chunkIndex < chunks.length) {
        chunkContent.innerHTML = chunks[chunkIndex];
    }
}

// Display song metadata
function displaySongMetadata(song) {
    const pageTitle = document.getElementById('pageTitle');
    const metadata = document.getElementById('songMetadata');
    const editButton = document.getElementById('editButton');
    
    // Update page title with song name and artist
    if (song.songName) {
        pageTitle.textContent = song.songName;
    }
    
    // Show Edit button if song has a URL lyrics file
    if (song.lyricsFile && (song.lyricsFile.startsWith('http://') || song.lyricsFile.startsWith('https://'))) {
        editButton.style.display = 'inline-block';
    }
    
    // Build metadata tags
    const tags = [];
    if (song.interpret) {
        tags.push(`<span class="tag">🎤 ${song.interpret}</span>`);
    }
    if (song.year) {
        tags.push(`<span class="tag">📅 ${song.year}</span>`);
    }
    if (song.key) {
        tags.push(`<span class="tag">🎼 ${song.key}</span>`);
    }
    if (song.bpm) {
        tags.push(`<span class="tag">🥁 ${song.bpm} bpm</span>`);
    }
    
    if (tags.length > 0) {
        metadata.innerHTML = tags.join('');
        metadata.style.display = 'block';
    }
}

// Generate selection boxes from chunks
function generateSelectionBoxes() {
    const parser = new DOMParser();
    const selectionBoxes = document.getElementById('selectionBoxes');
    selectionBoxes.innerHTML = '';
    
    for (let i = 1; i <= chunks.length; i++) {
        const box = document.createElement('div');
        box.className = 'selection-box';
        box.id = `box${i}`;
        
        // Extract h2 title from chunk
        const chunkDoc = parser.parseFromString(chunks[i-1], 'text/html');
        const h2Title = chunkDoc.querySelector('h2')?.textContent || (chunks.length === 1 ? 'All' : '');
        
        box.innerHTML = `
            <div class="box-number">${i}</div>
            <div class="box-title">${h2Title}</div>
        `;
        
        // Add click handler
        box.addEventListener('click', () => {
            selectBox(i);
        });
        
        selectionBoxes.appendChild(box);
    }
}

// Load lyrics from Google Sheet URL
async function loadFromGoogleSheet(url) {
    try {
        console.log('Loading from URL:', url);
        document.getElementById('chunkContent').innerHTML = '<p>Loading from Google Sheet...</p>';
        
        // Convert Google Docs edit URL to export format if needed
        let fetchUrl = url;
        if (url.includes('docs.google.com/document')) {
            // Convert edit URL to export URL
            fetchUrl = url.replace(/\/edit.*$/, '/export?format=html');
            console.log('Converted to export URL:', fetchUrl);
        }
        
        // Fetch the Google Sheet/Doc
        const response = await fetch(fetchUrl);
        console.log('Response status:', response.status);
        if (!response.ok) {
            throw new Error('Failed to fetch lyrics');
        }
        
        const html = await response.text();
        console.log('Fetched HTML length:', html.length);
        
        // Parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract h1 for page title if present
        const h1Tag = doc.querySelector('h1');
        if (h1Tag) {
            const pageTitle = h1Tag.textContent.trim();
            document.querySelector('header h1').textContent = pageTitle;
        }
        
        // Find all h2 tags
        const h2Tags = doc.querySelectorAll('h2');
        
        // Split content into chunks based on h2 tags
        chunks = [];
        
        if (h2Tags.length === 0) {
            // No h2 tags found - create single chunk with all content
            const bodyContent = doc.body.innerHTML;
            chunks.push(bodyContent);
            console.log('No h2 tags found, created single chunk');
        } else {
            // Split by h2 tags
            for (let i = 0; i < h2Tags.length; i++) {
                const h2 = h2Tags[i];
                let chunkHTML = h2.outerHTML;
                
                // Collect all elements until next h2 or end
                let currentElement = h2.nextElementSibling;
                while (currentElement && currentElement.tagName !== 'H2') {
                    chunkHTML += currentElement.outerHTML;
                    currentElement = currentElement.nextElementSibling;
                }
                
                chunks.push(chunkHTML);
            }
        }
        
        // Generate selection boxes
        generateSelectionBoxes();
        
        // Reset selection and display first chunk
        lastSelection = 0;
        currentChunk = 1;
        if (chunks.length > 0) {
            selectBox(1);
        }
        
    } catch (error) {
        console.error('Error loading from Google Sheet:', error);
        document.getElementById('chunkContent').innerHTML = '<p>Error loading lyrics. Please try again.</p>';
    }
}

// Load and parse song lyrics
async function loadSong(songName) {
    try {
        currentSong = songName;
        const response = await fetch(`lyrics/${songName}.html`);
        const html = await response.text();
        
        // Parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract h1 for page title if present
        const h1Tag = doc.querySelector('h1');
        if (h1Tag) {
            const pageTitle = h1Tag.textContent.trim();
            document.querySelector('header h1').textContent = pageTitle;
        } else {
            // Reset to default title
            document.querySelector('header h1').textContent = '👋 Hand Gesture Recognition';
        }
        
        // Find all h2 tags
        const h2Tags = doc.querySelectorAll('h2');
        
        // Split content into chunks based on h2 tags
        chunks = [];
        for (let i = 0; i < h2Tags.length; i++) {
            const h2 = h2Tags[i];
            let chunkHTML = h2.outerHTML;
            
            // Collect all elements until next h2 or end
            let currentElement = h2.nextElementSibling;
            while (currentElement && currentElement.tagName !== 'H2') {
                chunkHTML += currentElement.outerHTML;
                currentElement = currentElement.nextElementSibling;
            }
            
            chunks.push(chunkHTML);
        }
        
        // Generate selection boxes
        generateSelectionBoxes();
        
        // Reset selection and display first chunk
        lastSelection = 0;
        currentChunk = 1;
        if (chunks.length > 0) {
            selectBox(1);
        }
        
    } catch (error) {
        console.error(`Error loading ${songName}.html:`, error);
        document.getElementById('chunkContent').innerHTML = '<p>Error loading content</p>';
    }
}

// Initialize camera
async function startCamera() {
    try {
        statusText.textContent = 'Starting camera...';
        
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (cameraActive) {
                    await hands.send({image: videoElement});
                }
            },
            width: 640,
            height: 480
        });
        
        await camera.start();
        cameraActive = true;
        statusText.textContent = 'Camera ready. Show your hand!';
        
    } catch (error) {
        console.error('Error accessing camera:', error);
        statusText.textContent = 'Error: Could not access camera';
        fingerCountDisplay.textContent = '❌';
    }
}

// Stop camera
function stopCamera() {
    if (camera) {
        camera.stop();
        cameraActive = false;
        statusText.textContent = 'Camera paused';
        fingerCountDisplay.textContent = '⏸️';
    }
}

// Resume camera
async function resumeCamera() {
    if (camera) {
        await camera.start();
        cameraActive = true;
        statusText.textContent = 'Camera ready. Show your hand!';
    }
}

// Initialize everything
window.addEventListener('DOMContentLoaded', async () => {
    // Check for debug mode in URL
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.has('debug');
    
    // Show/hide top-row based on debug mode
    const topRow = document.querySelector('.top-row');
    if (!debugMode && topRow) {
        topRow.style.display = 'none';
    }
    
    // Check if song index parameter is present
    const songIndex = urlParams.get('index');
    console.log('Song index parameter:', songIndex);
    
    if (songIndex !== null) {
        // Load from localStorage
        const songDataStr = localStorage.getItem('selectedSong');
        if (songDataStr) {
            const songData = JSON.parse(songDataStr);
            console.log('Loaded song data:', songData);
            
            // Display song metadata
            displaySongMetadata(songData);
            
            // Load lyrics from URL
            if (songData.lyricsFile) {
                await loadFromGoogleSheet(songData.lyricsFile);
            } else {
                document.getElementById('chunkContent').innerHTML = '<p>No lyrics available for this song.</p>';
            }
        } else {
            console.log('No song data in localStorage');
            await loadSong('wonderwall');
        }
    } else {
        // Fallback to local song files
        console.log('No index parameter, loading default song');
        await loadSong('wonderwall');
    }
    
    initializeHands();
    startCamera();
    
    // Add song selector change handler
    const songSelect = document.getElementById('songSelect');
    songSelect.addEventListener('change', async (e) => {
        await loadSong(e.target.value);
    });
    
    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') {
            nextChunk();
        } else if (e.key === 'ArrowLeft') {
            previousChunk();
        } else if (e.key >= '1' && e.key <= '9') {
            const chunkNumber = parseInt(e.key);
            if (chunkNumber <= chunks.length) {
                selectBox(chunkNumber);
            }
        }
    });
    
    // Add back button handler
    const backButton = document.getElementById('backButton');
    backButton.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // Add edit button handler
    const editButton = document.getElementById('editButton');
    editButton.addEventListener('click', () => {
        const songDataStr = localStorage.getItem('selectedSong');
        if (songDataStr) {
            const songData = JSON.parse(songDataStr);
            if (songData.lyricsFile) {
                // Open the lyrics file URL in a new tab
                window.open(songData.lyricsFile, '_blank');
            }
        }
    });
    
    // Add camera toggle button handler
    const cameraToggle = document.getElementById('cameraToggle');
    cameraToggle.addEventListener('click', () => {
        if (cameraActive) {
            stopCamera();
            cameraToggle.textContent = '▶️ Play Camera';
            cameraToggle.style.background = '#4caf50';
        } else {
            resumeCamera();
            cameraToggle.textContent = '⏸️ Pause Camera';
            cameraToggle.style.background = '#667eea';
        }
    });
    
    // Add count-in button handler
    const countInButton = document.getElementById('countInButton');
    countInButton.addEventListener('click', () => {
        // Get BPM from song metadata
        const songDataStr = localStorage.getItem('selectedSong');
        if (!songDataStr) {
            console.log('No song data available for count-in');
            return;
        }
        
        const songData = JSON.parse(songDataStr);
        const bpm = parseInt(songData.bpm) || 120;
        const strokesPerBeat = 4; // Default to quarter notes
        
        // Disable button during playback
        countInButton.disabled = true;
        countInButton.textContent = '🥁 Counting...';
        
        // Play count-in using playtones.js
        const success = window.playCountInTones(bpm, strokesPerBeat, 
            () => {
                // On complete
                countInButton.disabled = false;
                countInButton.textContent = '🥁 Count In';
            },
            null // No tick callback needed
        );
        
        if (!success) {
            console.error('Failed to start count-in');
            countInButton.disabled = false;
            countInButton.textContent = '🥁 Count In';
        }
    });
});
