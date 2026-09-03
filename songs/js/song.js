// Global state
let currentSong = null;
let chunks = []; // Current song's lyrics, split into sections by <h2>
let chunkTitles = []; // Section title for each chunk (from its <h2>, or '' )
let currentChunkIndex = 0;
let autoStartTimer = null;

// Hand-gesture navigation. Continuous head-turn scrolling was tried first
// but proved impractical on stage: ordinary head movement while playing
// keyboard kept triggering accidental scrolling. Two deliberate, unlikely-
// to-happen-by-accident hand gestures ("call me" / 3 fingers) replace it.
let hands = null;
let gestureEnabled = false;
let handsFrameLoopId = null;
let currentGesture = null;
let lastProcessedGesture = null;
let lastActionTime = 0;
const ACTION_COOLDOWN = 700; // ms - matches hand.html's practice tool

// Listeners are attached once - the song view is shown/hidden in place,
// it never reloads, so re-attaching on every song would stack duplicates.
document.addEventListener('DOMContentLoaded', setupSongEventListeners);

function setupSongEventListeners() {
    document.getElementById('backBtn').addEventListener('click', () => {
        exitSongView();
        if (location.hash === '#song') {
            history.back();
        }
    });

    document.getElementById('cameraSongBtn').addEventListener('click', toggleCameraAndGesture);
    document.getElementById('songMenuBtn').addEventListener('click', toggleSongMenu);

    // Keyboard fallback for testing without a camera
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('songView').style.display === 'none') return;
        if (e.key === 'ArrowRight') nextChunk();
        else if (e.key === 'ArrowLeft') previousChunk();
        else if (e.key >= '1' && e.key <= '9') selectChunk(parseInt(e.key) - 1);
    });

    // Re-fit the current chunk's text on orientation change / viewport resize
    window.addEventListener('resize', () => {
        if (document.getElementById('songView').style.display !== 'none') {
            fitLyricsText();
        }
    });
}

// Called by app.js's openSong() with the song object directly - no
// localStorage round-trip needed since both views live on the same page.
function enterSongView(song) {
    currentSong = song;
    showSongViewContainer(); // defined in app.js
    window.scrollTo(0, 0); // iOS Safari can carry a stale scroll offset that clips the header behind its own chrome
    document.getElementById('songMenuPanel').style.display = 'none';
    displaySongInfo();
    loadLyrics();

    // Auto-start gesture control shortly after opening, so both hands can
    // stay on the instrument from the moment the song is up.
    clearTimeout(autoStartTimer);
    autoStartTimer = setTimeout(() => {
        startGesture();
    }, 500);
}

function exitSongView() {
    clearTimeout(autoStartTimer);
    stopGesture();
    showLibraryView(); // defined in app.js
}

// Count-in lives behind a tap on the bpm tag itself (see displaySongInfo)
// rather than a dedicated button - the bpm value is already on screen, so
// a separate button was redundant with it.
function playCountIn() {
    const bpm = parseFloat(currentSong.bpm);

    if (!bpm || bpm <= 0) {
        alert('BPM not specified for this song');
        return;
    }

    // Get strokes per beat from song data, default to 4
    const strokesPerBeat = parseInt(currentSong.beat) || 4;

    const bpmTag = document.getElementById('bpmTag');
    if (bpmTag) {
        bpmTag.style.pointerEvents = 'none';
        bpmTag.classList.add('counting');
    }

    // Play count-in using playtones.js library (from window scope)
    const success = window.playCountInTones(bpm, strokesPerBeat,
        // onComplete callback
        () => {
            if (bpmTag) {
                bpmTag.style.pointerEvents = 'auto';
                bpmTag.classList.remove('counting');
            }
        },
        // onTick callback (optional - for visual feedback)
        null
    );

    if (!success) {
        alert('Could not play count-in. Invalid BPM or strokes per beat.');
        if (bpmTag) {
            bpmTag.style.pointerEvents = 'auto';
            bpmTag.classList.remove('counting');
        }
    }
}

function displaySongInfo() {
    document.getElementById('songTitle').textContent = currentSong.songName || 'Untitled';
    document.getElementById('songArtist').textContent = currentSong.interpret || '';

    const tags = [];
    if (currentSong.year) tags.push(`<span class="tag">${escapeHtml(currentSong.year)}</span>`);
    if (currentSong.key) tags.push(`<span class="tag">🎼 ${escapeHtml(currentSong.key)}</span>`);
    if (currentSong.bpm) tags.push(`<span class="tag tag-bpm" id="bpmTag" title="Tap for count-in">${escapeHtml(currentSong.bpm)} bpm</span>`);
    document.getElementById('songMeta').innerHTML = tags.join('');

    const bpmTag = document.getElementById('bpmTag');
    if (bpmTag) bpmTag.addEventListener('click', playCountIn);

    // Set up links
    const originalLink = document.getElementById('originalLink');
    if (currentSong.originalLink) {
        originalLink.href = currentSong.originalLink;
        originalLink.style.display = 'inline-block';
    } else {
        originalLink.style.display = 'none';
    }

    const karaokeLink = document.getElementById('karaokeLink');
    if (currentSong.karaokeLink) {
        karaokeLink.href = currentSong.karaokeLink;
        karaokeLink.style.display = 'inline-block';
    } else {
        karaokeLink.style.display = 'none';
    }

    renderSongSuggestions();
}

// "Next/Previous in order" walk lastFilteredSongs (app.js) - the library's
// current filter+sort result - so they respect whatever the user had set
// on the filter page. The artist/key suggestions deliberately search
// allSongs instead, ignoring the active filter, since the point is to
// surface songs the filter might currently be hiding.
function renderSongSuggestions() {
    const container = document.getElementById('songSuggestions');
    container.innerHTML = '';

    const addSuggestion = (label, song) => {
        const btn = document.createElement('button');
        btn.className = 'upload-label';
        btn.textContent = label;
        btn.addEventListener('click', () => openSong(allSongs.indexOf(song))); // openSong defined in app.js
        container.appendChild(btn);
    };

    const orderIndex = lastFilteredSongs.indexOf(currentSong); // lastFilteredSongs defined in app.js
    if (orderIndex !== -1) {
        const next = lastFilteredSongs[orderIndex + 1];
        const prev = lastFilteredSongs[orderIndex - 1];
        if (next) addSuggestion(`Next in order: ${next.songName || 'Untitled'}`, next);
        if (prev) addSuggestion(`Previous in order: ${prev.songName || 'Untitled'}`, prev);
    }

    const byTitle = (a, b) => (a.songName || '').localeCompare(b.songName || '');

    if (currentSong.interpret) {
        const sameArtist = allSongs
            .filter(s => s !== currentSong && s.interpret === currentSong.interpret)
            .sort(byTitle);
        if (sameArtist.length > 0) {
            addSuggestion(`Other songs by ${currentSong.interpret}`, sameArtist[0]);
        }
    }

    if (currentSong.key) {
        const sameKey = allSongs
            .filter(s => s !== currentSong && s.key === currentSong.key)
            .sort(byTitle);
        if (sameKey.length > 0) {
            addSuggestion(`Other songs in ${currentSong.key}`, sameKey[0]);
        }
    }
}

// Split a lyrics HTML string into sections at each <h2>. A song with no
// <h2> headings at all becomes a single chunk holding everything.
function splitIntoChunks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const h2Tags = doc.body.querySelectorAll('h2');

    if (h2Tags.length === 0) {
        return [{ html: doc.body.innerHTML, title: 'All' }];
    }

    const result = [];
    h2Tags.forEach(h2 => {
        let chunkHtml = h2.outerHTML;
        let el = h2.nextElementSibling;
        while (el && el.tagName !== 'H2') {
            chunkHtml += el.outerHTML;
            el = el.nextElementSibling;
        }
        result.push({ html: chunkHtml, title: h2.textContent.trim() });
    });
    return result;
}

function generateChunkTabs() {
    const tabsContainer = document.getElementById('chunkTabs');

    // A single chunk means the doc has no <h2> sections to navigate between -
    // the tab row would just be dead chrome eating space from the lyrics.
    if (chunks.length <= 1) {
        tabsContainer.style.display = 'none';
        tabsContainer.innerHTML = '';
        return;
    }
    tabsContainer.style.display = '';

    tabsContainer.innerHTML = chunks.map((chunk, i) => `
        <div class="chunk-tab" data-index="${i}">
            <div class="tab-title">${escapeHtml(chunk.title)}</div>
        </div>
    `).join('');

    tabsContainer.querySelectorAll('.chunk-tab').forEach(tab => {
        tab.addEventListener('click', () => selectChunk(parseInt(tab.dataset.index)));
    });
}

function selectChunk(index) {
    if (index < 0 || index >= chunks.length) return;
    currentChunkIndex = index;

    document.querySelectorAll('.chunk-tab').forEach((tab, i) => {
        tab.classList.toggle('active', i === index);
    });

    const lyricsContainer = document.getElementById('lyricsContent');
    lyricsContainer.innerHTML = chunks[index].html;
    fitLyricsText();

    const chunkViewer = document.querySelector('.chunk-viewer');
    if (chunkViewer) chunkViewer.scrollTop = 0;
}

// Gestures only jump between whole chunks - there's no hands-free way to
// scroll within one - so each chunk needs to fit its space without
// scrolling. Shrink the font size down from its CSS-defined size until the
// content fits, rather than a fixed size that overflows on longer verses.
function fitLyricsText() {
    const container = document.querySelector('.chunk-viewer');
    const content = document.getElementById('lyricsContent');
    if (!container || !content) return;

    content.style.fontSize = ''; // reset to the CSS-defined base size first
    const baseFontSize = parseFloat(getComputedStyle(content).fontSize);
    const minFontSize = baseFontSize * 0.6; // stays readable from a music stand

    let fontSize = baseFontSize;
    while (content.scrollHeight > container.clientHeight && fontSize > minFontSize) {
        fontSize -= 1;
        content.style.fontSize = `${fontSize}px`;
    }
}

function nextChunk() {
    if (currentChunkIndex < chunks.length - 1) selectChunk(currentChunkIndex + 1);
}

function previousChunk() {
    if (currentChunkIndex > 0) selectChunk(currentChunkIndex - 1);
}

async function loadLyrics() {
    const lyricsContainer = document.getElementById('lyricsContent');
    const editLink = document.getElementById('editLink');
    chunks = [];
    document.getElementById('chunkTabs').innerHTML = '';

    // Always show Edit button but make it active only for Google Docs
    editLink.style.display = 'inline-block';

    if (!currentSong.lyricsFile) {
        editLink.removeAttribute('href');
        editLink.style.opacity = '0.5';
        editLink.style.cursor = 'not-allowed';
        editLink.style.pointerEvents = 'none';

        lyricsContainer.innerHTML = `
            <p><em>❌ No lyrics file specified for this song.</em></p>
            <p>To add lyrics, create an HTML file in the 'lyrics' folder, or provide a Google Docs URL in your spreadsheet.</p>
        `;
        return;
    }

    if (currentSong.lyricsFile.includes('docs.google.com/document')) {
        // Enable Edit button for Google Docs
        editLink.href = currentSong.lyricsFile;
        editLink.style.opacity = '1';
        editLink.style.cursor = 'pointer';
        editLink.style.pointerEvents = 'auto';

        await loadGoogleDocLyrics(currentSong.lyricsFile);
        return;
    }

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
            chunks = splitIntoChunks(html);
            generateChunkTabs();
            selectChunk(0);
        } else {
            lyricsContainer.innerHTML = `
                <p style="color: #d32f2f;">❌ Lyrics file not found</p>
                <p><strong>Tried to load:</strong> <code>${escapeHtml(fullPath)}</code></p>
                <p><em>Please check the file path in your spreadsheet.</em></p>
            `;
        }
    } catch (error) {
        lyricsContainer.innerHTML = `
            <p style="color: #d32f2f;">❌ Error loading lyrics</p>
            <p><strong>File:</strong> <code>lyrics/${escapeHtml(currentSong.lyricsFile)}</code></p>
            <p><strong>Error:</strong> ${escapeHtml(error.message)}</p>
        `;
    }
}

// Strip anything from fetched HTML that could execute script when injected
// via innerHTML: script/embed-like tags outright, and any event-handler
// ("on*") attribute or javascript: URL on the elements that remain.
function sanitizeExternalHtml(rootElement) {
    rootElement.querySelectorAll('script, iframe, object, embed, link, meta').forEach(el => el.remove());

    rootElement.querySelectorAll('*').forEach(el => {
        el.removeAttribute('style');
        el.removeAttribute('class');
        [...el.attributes].forEach(attr => {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value))) {
                el.removeAttribute(attr.name);
            }
        });
    });
}

async function loadGoogleDocLyrics(docUrl) {
    const lyricsContainer = document.getElementById('lyricsContent');
    try {
        lyricsContainer.innerHTML = '<p>⏳ Loading lyrics from Google Docs...</p>';

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

        const bodyContent = doc.querySelector('body');
        if (!bodyContent) {
            throw new Error('Could not parse Google Doc content');
        }

        sanitizeExternalHtml(bodyContent);

        chunks = splitIntoChunks(bodyContent.innerHTML);
        generateChunkTabs();
        selectChunk(0);

    } catch (error) {
        lyricsContainer.innerHTML = `
            <p style="color: #d32f2f;">❌ Error loading lyrics from Google Docs:</p>
            <p>${escapeHtml(error.message)}</p>
            <p><em>Make sure the document is shared as "Anyone with the link can view"</em></p>
        `;
    }
}

// The camera button is the single on/off control for both the shared
// stream and gesture recognition - there's no separate "Play Mode" toggle,
// since turning the camera off inherently stops gestures too. Checked
// against the stream itself (not gestureEnabled) so a tap during the
// ~500ms auto-start window after opening a song still turns it off rather
// than racing to (re)start it.
async function toggleCameraAndGesture() {
    if (sharedCameraStream && sharedCameraStream.active) {
        stopGesture();
        releaseSharedCamera(); // both defined in app.js
        if (typeof updateCameraToggleLabel === 'function') updateCameraToggleLabel();
    } else {
        await startGesture();
    }
}

function toggleSongMenu() {
    const menuPanel = document.getElementById('songMenuPanel');
    menuPanel.style.display = menuPanel.style.display === 'none' ? 'block' : 'none';
}

async function startGesture() {
    if (gestureEnabled) return;

    try {
        document.getElementById('gestureStatus').textContent = 'Starting...';

        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });
        hands.onResults(onHandResults);

        // Reuse the shared camera stream (requested once, from the library
        // page or this first Play Mode tap) instead of asking for the
        // camera again - repeated getUserMedia calls are what triggered a
        // new permission prompt on iOS every time a song was opened.
        // The self-view video stays out of sight on the song page (see
        // .camera-wrapper's display:none in index.html) - only hand.html's
        // practice tool shows a live preview. It's still needed here as
        // MediaPipe's frame source, just never rendered.
        const videoElement = document.getElementById('cameraFeed');
        const stream = await enableSharedCamera(); // defined in app.js
        if (typeof updateCameraToggleLabel === 'function') updateCameraToggleLabel();

        videoElement.srcObject = stream;
        await videoElement.play().catch(() => {}); // iOS sometimes needs an explicit play() after re-attaching a stream

        gestureEnabled = true;
        document.getElementById('gestureStatus').textContent = '✋';

        // Drive Hands with our own frame loop rather than MediaPipe's
        // Camera helper, which internally calls getUserMedia itself and
        // would silently open a second, independent camera stream.
        const pumpFrame = async () => {
            if (!gestureEnabled || !hands) return;
            await hands.send({ image: videoElement });
            handsFrameLoopId = requestAnimationFrame(pumpFrame);
        };
        handsFrameLoopId = requestAnimationFrame(pumpFrame);

    } catch (error) {
        alert('Error accessing camera: ' + error.message);
        stopGesture();
    }
}

function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        currentGesture = null;
        lastProcessedGesture = null;
        document.getElementById('gestureStatus').textContent = '✋';
        return;
    }

    const gesture = detectHandGesture(results.multiHandLandmarks[0]); // from gestures.js
    currentGesture = gesture;
    document.getElementById('gestureStatus').textContent = gesture;
    processGesture(gesture);
}

// "call me" sign = next section, 3 fingers = previous section. Both were
// chosen specifically because they don't happen by accident while playing.
function processGesture(gesture) {
    const now = Date.now();
    if (now - lastActionTime < ACTION_COOLDOWN) return;

    const isNext = gesture === '🤙 Call Me';
    const isPrevious = gesture === '3 fingers';
    if (!isNext && !isPrevious) {
        if (currentGesture !== lastProcessedGesture) lastProcessedGesture = null;
        return;
    }

    if (currentGesture !== lastProcessedGesture) {
        if (isNext) nextChunk();
        else previousChunk();
        lastActionTime = now;
        lastProcessedGesture = currentGesture;
    }
}

function stopGesture() {
    gestureEnabled = false;
    currentGesture = null;
    lastProcessedGesture = null;

    if (handsFrameLoopId !== null) {
        cancelAnimationFrame(handsFrameLoopId);
        handsFrameLoopId = null;
    }

    // Detach the video element, but deliberately do NOT stop the shared
    // stream's tracks here - callers that want the stream fully released
    // (the camera toggle buttons) call releaseSharedCamera() separately,
    // so switching songs can reuse the stream without a new iOS prompt.
    const videoElement = document.getElementById('cameraFeed');
    if (videoElement) videoElement.srcObject = null;

    if (hands) {
        hands.close();
        hands = null;
    }
}
