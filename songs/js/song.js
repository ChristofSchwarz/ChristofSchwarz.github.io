// Global state
let currentSong = null;
let faceMesh = null;
let camera = null;
let gestureEnabled = false;
let lastHeadPosition = null;
let scrollAmount = 0;
let currentScrollDirection = 0; // -1 for down, 1 for up, 0 for none
let scrollAnimationId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSong();
    setupEventListeners();
    
    // Prime AudioContext on any user interaction (iOS requirement)
    document.body.addEventListener('touchstart', initAudioContext, { once: true });
    document.body.addEventListener('click', initAudioContext, { once: true });
    
    // Auto-start play mode after a short delay to ensure DOM is ready
    setTimeout(() => {
        startGesture();
    }, 500);
});

function setupEventListeners() {
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    document.getElementById('playModeBtn').addEventListener('click', togglePlayMode);
    document.getElementById('countInBtn').addEventListener('click', playCountIn);
    
    // Only add stopGestureBtn listener if it exists
    const stopBtn = document.getElementById('stopGestureBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', stopGesture);
    }
}

// Global AudioContext (created once, reused - required for iOS)
let audioContext = null;
let tickSounds = null; // Pre-generated audio buffers

// Initialize AudioContext on first user interaction
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Pre-generate tick sounds for better iOS compatibility
        generateTickSounds();
    }
    // Resume in case it's suspended (iOS requirement)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

// Pre-generate tick sounds as audio buffers
function generateTickSounds() {
    if (!audioContext || tickSounds) return;
    
    const sampleRate = audioContext.sampleRate;
    const duration = 0.08; // 80ms
    const length = sampleRate * duration;
    
    // Create regular tick
    const regularBuffer = audioContext.createBuffer(1, length, sampleRate);
    const regularData = regularBuffer.getChannelData(0);
    
    // Create accent tick
    const accentBuffer = audioContext.createBuffer(1, length, sampleRate);
    const accentData = accentBuffer.getChannelData(0);
    
    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 30); // Exponential decay
        
        // Regular tick at 800Hz
        regularData[i] = Math.sin(2 * Math.PI * 800 * t) * envelope * 0.5;
        
        // Accent tick at 1200Hz
        accentData[i] = Math.sin(2 * Math.PI * 1200 * t) * envelope * 0.7;
    }
    
    tickSounds = {
        regular: regularBuffer,
        accent: accentBuffer
    };
}

// Count-in functionality - plays 8 tick sounds at song's BPM
function playCountIn() {
    const bpm = parseFloat(currentSong.bpm);
    
    if (!bpm || bpm <= 0) {
        alert('BPM not specified for this song');
        return;
    }
    
    // Calculate the interval between beats in milliseconds
    const beatInterval = 60000 / bpm; // 60000ms = 1 minute
    
    // Initialize audio context (iOS requirement)
    const ctx = initAudioContext();
    
    // Disable button during count-in
    const countInBtn = document.getElementById('countInBtn');
    countInBtn.disabled = true;
    countInBtn.innerHTML = '<span class="btn-icon">🥁</span><span class="btn-text"> Counting...</span>';
    
    // Ensure context is resumed (iOS)
    ctx.resume().then(() => {
        // Ensure sounds are generated
        if (!tickSounds) {
            generateTickSounds();
        }
        
        // Function to play a single tick
        function playTick(time, isAccent = false) {
            const source = ctx.createBufferSource();
            const gainNode = ctx.createGain();
            
            source.buffer = isAccent ? tickSounds.accent : tickSounds.regular;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            gainNode.gain.value = 1.0;
            
            source.start(time);
        }
        
        // Schedule 8 ticks (2 bars of 4/4)
        const startTime = ctx.currentTime + 0.15; // Small delay for iOS
        for (let i = 0; i < 8; i++) {
            const tickTime = startTime + (i * beatInterval / 1000);
            // Accent on beats 1 and 5 (start of each bar)
            const isAccent = (i === 0 || i === 4);
            playTick(tickTime, isAccent);
        }
        
        // Re-enable button after count-in completes
        setTimeout(() => {
            countInBtn.disabled = false;
            countInBtn.innerHTML = '<span class="btn-icon">🥁</span><span class="btn-text"> Count In</span>';
        }, beatInterval * 8 + 300);
    }).catch((error) => {
        console.error('Error playing count-in:', error);
        alert('Could not play count-in audio. Please check your device settings.');
        countInBtn.disabled = false;
        countInBtn.innerHTML = '<span class="btn-icon">🥁</span><span class="btn-text"> Count In</span>';
    });
}

function loadSong() {
    const songIndex = localStorage.getItem('selectedSongIndex');
    const songsData = JSON.parse(localStorage.getItem('songsData') || '[]');
    
    if (!songIndex || !songsData.length) {
        alert('No song selected');
        window.location.href = 'index.html';
        return;
    }
    
    currentSong = songsData[songIndex];
    displaySongInfo();
    loadLyrics();
}

function displaySongInfo() {
    document.getElementById('songTitle').textContent = currentSong.songName || 'Untitled';
    
    const metaParts = [];
    if (currentSong.interpret) metaParts.push(currentSong.interpret);
    if (currentSong.year) metaParts.push(currentSong.year);
    if (currentSong.key) metaParts.push(`Key: ${currentSong.key}`);
    if (currentSong.bpm) metaParts.push(`${currentSong.bpm} BPM`);
    
    document.getElementById('songMeta').textContent = metaParts.join(' • ');
    
    // Set up links
    if (currentSong.originalLink) {
        const originalLink = document.getElementById('originalLink');
        originalLink.href = currentSong.originalLink;
        originalLink.style.display = 'inline-block';
    }
    
    if (currentSong.karaokeLink) {
        const karaokeLink = document.getElementById('karaokeLink');
        karaokeLink.href = currentSong.karaokeLink;
        karaokeLink.style.display = 'inline-block';
    }
    
    // Disable Count In button if no BPM
    const countInBtn = document.getElementById('countInBtn');
    const bpm = parseFloat(currentSong.bpm);
    if (!bpm || bpm <= 0) {
        countInBtn.disabled = true;
        countInBtn.style.opacity = '0.5';
        countInBtn.style.cursor = 'not-allowed';
    } else {
        countInBtn.disabled = false;
        countInBtn.style.opacity = '1';
        countInBtn.style.cursor = 'pointer';
    }
}

async function loadLyrics() {
    const lyricsContainer = document.getElementById('lyricsContent');
    const editLink = document.getElementById('editLink');
    
    // Always show Edit button but make it active only for Google Docs
    editLink.style.display = 'inline-block';
    
    if (currentSong.lyricsFile) {
        // Check if it's a Google Docs URL
        if (currentSong.lyricsFile.includes('docs.google.com/document')) {
            // Enable Edit button for Google Docs
            editLink.href = currentSong.lyricsFile;
            editLink.style.opacity = '1';
            editLink.style.cursor = 'pointer';
            editLink.style.pointerEvents = 'auto';
            
            await loadGoogleDocLyrics(currentSong.lyricsFile, lyricsContainer);
        } else {
            // Disable Edit button for local files
            editLink.removeAttribute('href');
            editLink.style.opacity = '0.5';
            editLink.style.cursor = 'not-allowed';
            editLink.style.pointerEvents = 'none';
            
            // Load local HTML file
            try {
                const fullPath = `lyrics/${currentSong.lyricsFile}`;
                const response = await fetch(fullPath);
                if (response.ok) {
                    const html = await response.text();
                    lyricsContainer.innerHTML = html;
                } else {
                    lyricsContainer.innerHTML = `
                        <p style="color: #d32f2f;">❌ Lyrics file not found</p>
                        <p><strong>Tried to load:</strong> <code>${fullPath}</code></p>
                        <p><em>Please check the file path in your spreadsheet.</em></p>
                    `;
                }
            } catch (error) {
                lyricsContainer.innerHTML = `
                    <p style="color: #d32f2f;">❌ Error loading lyrics</p>
                    <p><strong>File:</strong> <code>lyrics/${currentSong.lyricsFile}</code></p>
                    <p><strong>Error:</strong> ${error.message}</p>
                `;
            }
        }
    } else {
        // Disable Edit button when no lyrics file
        editLink.removeAttribute('href');
        editLink.style.opacity = '0.5';
        editLink.style.cursor = 'not-allowed';
        editLink.style.pointerEvents = 'none';
        
        lyricsContainer.innerHTML = `
            <p><em>No lyrics file specified for this song.</em></p>
            <p>To add lyrics, create an HTML file in the 'lyrics' folder, or provide a Google Docs URL in your spreadsheet.</p>
        `;
    }
}

async function loadGoogleDocLyrics(docUrl, container) {
    try {
        container.innerHTML = '<p>⏳ Loading lyrics from Google Docs...</p>';
        
        // Extract document ID from URL
        const docIdMatch = docUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!docIdMatch) {
            throw new Error('Invalid Google Docs URL');
        }
        
        const docId = docIdMatch[1];
        
        // Use Google Docs export URL to get HTML
        const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
        
        const response = await fetch(exportUrl);
        if (!response.ok) {
            throw new Error('Failed to fetch Google Doc. Make sure the document is set to "Anyone with the link can view".');
        }
        
        const html = await response.text();
        
        // Parse and clean the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract the body content and remove unnecessary Google Docs styling
        const bodyContent = doc.querySelector('body');
        if (bodyContent) {
            // Remove inline styles that might interfere
            const allElements = bodyContent.querySelectorAll('*');
            allElements.forEach(el => {
                el.removeAttribute('style');
                el.removeAttribute('class');
            });
            
            container.innerHTML = bodyContent.innerHTML;
        } else {
            throw new Error('Could not parse Google Doc content');
        }
        
    } catch (error) {
        container.innerHTML = `
            <p style="color: #d32f2f;">❌ Error loading lyrics from Google Docs:</p>
            <p>${error.message}</p>
            <p><em>Make sure the document is shared as "Anyone with the link can view"</em></p>
        `;
    }
}

async function togglePlayMode() {
    if (!gestureEnabled) {
        await startGesture();
    } else {
        stopGesture();
    }
}

async function startGesture() {
    try {
        // Check if running on Safari
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        if (isSafari) {
            // alert('⚠️ Gesture control may not work properly on Safari.\n\nMediaPipe Face Mesh has limited Safari support. For best experience, please use:\n• Chrome\n• Edge\n• Firefox\n\nYou can still try, but functionality may be limited.');
        }
        
        document.getElementById('gestureStatus').textContent = 'Starting...';
        
        // Initialize MediaPipe Face Mesh
        faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });
        
        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        faceMesh.onResults(onFaceResults);
        
        // Start camera
        const videoElement = document.getElementById('cameraFeed');
        const cameraWrapper = document.querySelector('.camera-wrapper');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }
        });
        
        videoElement.srcObject = stream;
        cameraWrapper.style.display = 'block';
        
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await faceMesh.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });
        
        camera.start();
        gestureEnabled = true;
        
        document.getElementById('gestureStatus').textContent = 'Active';
        document.getElementById('playModeBtn').innerHTML = '<span class="btn-icon">⏸</span><span class="btn-text"> Stop</span>';
        
    } catch (error) {
        // Detect actual Safari browser (not Chrome/Edge on iOS which also use WebKit)
        const ua = navigator.userAgent;
        const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Chromium|Edg/.test(ua);
        const errorMsg = isSafari 
            ? 'Safari detected: Gesture control is not supported on Safari.\n\nPlease use Chrome, Edge, or Firefox for gesture control functionality.'
            : 'Error accessing camera: ' + error.message;
        alert(errorMsg);
        stopGesture();
    }
}

function onFaceResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        currentScrollDirection = 0;
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    
    // Get nose tip (landmark 1) and left/right face points
    const noseTip = landmarks[1];
    const leftFace = landmarks[234];
    const rightFace = landmarks[454];
    
    // Calculate head rotation based on face landmarks
    const faceWidth = rightFace.x - leftFace.x;
    const noseOffset = noseTip.x - ((leftFace.x + rightFace.x) / 2);
    const rotationRatio = noseOffset / faceWidth;
    
    // Detect head turn - LEFT = DOWN, RIGHT = UP (reversed)
    // Increased thresholds from 0.15 to 0.25 for less sensitivity
    if (rotationRatio < -0.25) {
        currentScrollDirection = -1; // Down
        document.getElementById('gestureStatus').textContent = '⬇️ Down';
        startContinuousScroll();
    } else if (rotationRatio > 0.25) {
        currentScrollDirection = 1; // Up
        document.getElementById('gestureStatus').textContent = '⬆️ Up';
        startContinuousScroll();
    } else {
        currentScrollDirection = 0; // Stop
        document.getElementById('gestureStatus').textContent = 'Active';
    }
}

function startContinuousScroll() {
    if (scrollAnimationId !== null) return; // Already scrolling
    
    const container = document.querySelector('.lyrics-container-fullwidth');
    if (container) {
        // Disable smooth scrolling for programmatic control (iOS compatibility)
        container.style.scrollBehavior = 'auto';
    }
    
    function scroll() {
        if (currentScrollDirection === 0 || !gestureEnabled) {
            scrollAnimationId = null;
            // Re-enable smooth scrolling when done
            if (container) {
                container.style.scrollBehavior = 'smooth';
            }
            return;
        }
        
        if (container) {
            const scrollAmount = 5;
            if (currentScrollDirection === -1) {
                // Scroll down
                container.scrollTop += scrollAmount;
            } else if (currentScrollDirection === 1) {
                // Scroll up
                container.scrollTop -= scrollAmount;
            }
        }
        
        scrollAnimationId = requestAnimationFrame(scroll);
    }
    
    scrollAnimationId = requestAnimationFrame(scroll);
}

function scrollDown() {
    const container = document.querySelector('.lyrics-container-fullwidth');
    if (container) {
        container.scrollTop += 15; // Faster scrolling
    }
}

function scrollUp() {
    const container = document.querySelector('.lyrics-container-fullwidth');
    if (container) {
        container.scrollTop -= 15; // Faster scrolling
    }
}

function stopGesture() {
    gestureEnabled = false;
    currentScrollDirection = 0;
    
    // Cancel any ongoing scroll animation
    if (scrollAnimationId !== null) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
    }
    
    // Restore smooth scrolling
    const container = document.querySelector('.lyrics-container-fullwidth');
    if (container) {
        container.style.scrollBehavior = 'smooth';
    }
    
    // Stop camera
    const videoElement = document.getElementById('cameraFeed');
    const cameraWrapper = document.querySelector('.camera-wrapper');
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    cameraWrapper.style.display = 'none';
    
    // Clean up
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    if (faceMesh) {
        faceMesh.close();
        faceMesh = null;
    }
    
    document.getElementById('playModeBtn').innerHTML = '<span class="btn-icon">▶</span><span class="btn-text"> Play Mode</span>';
}
