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
let chunks = []; // Store parsed chunks for the current practice content
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
        const gesture = detectHandGesture(landmarks);
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
    const isNext = gesture === '🤙 Call Me';
    const isPrevious = gesture === '3 fingers';
    
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

// Built-in practice content, so this page works standalone for calibrating
// gestures before a show without depending on any real song data.
const PRACTICE_CHUNKS = [
    '<h2>Verse</h2><p>Practice section 1. Make the <strong>🤙 call-me</strong> sign to jump to the next section.</p>',
    '<h2>Chorus</h2><p>Practice section 2. Show <strong>3 fingers</strong> to go back.</p>',
    '<h2>Bridge</h2><p>Practice section 3. You can also tap a box above to jump directly.</p>'
];

function loadPracticeContent() {
    chunks = PRACTICE_CHUNKS;
    generateSelectionBoxes();
    lastSelection = 0;
    currentChunk = 1;
    selectBox(1);
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

    loadPracticeContent();

    initializeHands();
    startCamera();

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
});
