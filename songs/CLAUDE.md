# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static, client-side music lyrics library with hands-free "Play Mode" section navigation for live performances (see [instructions.txt](instructions.txt) for the original requirements — note the original spec asked for continuous head-turn scrolling, which was tried and abandoned as impractical; see Architecture below). This directory (`songs/`) is a subfolder of the `christofschwarz.github.io` GitHub Pages repo — there is no separate git root, build step, package manager, or backend. Everything runs by opening the HTML files directly or serving them statically.

## Running / testing

- No build, install, or test commands — plain HTML/CSS/JS loaded via `<script>` tags and CDN links (SheetJS/xlsx, MediaPipe Hands, Tone.js).
- To develop: open `index.html` in a browser, or serve the folder with any static file server. Camera-based features (gesture control) require HTTPS or `localhost` — `file://` may not grant camera access in some browsers.
- There is no automated test suite; verify changes manually in-browser. `node --check js/*.js` catches syntax errors cheaply before testing in-browser.

## Architecture

**Single-page app**: `index.html` contains both the library view (`#libraryView`) and the song view (`#songView`) as sibling `.container` divs, toggled via `display` (see `showLibraryView()`/`showSongViewContainer()` in `js/app.js`). There is no page navigation between them — `openSong(index)` in `app.js` calls `enterSongView(song)` in `song.js` directly with the song object (no `localStorage` hand-off needed). A `#song` URL hash + `popstate` listener makes the browser/OS back gesture close the song view like a native back action. This architecture exists specifically so the camera permission grant and `MediaStream` survive moving between songs — see Camera below.

**Data flow**: song metadata lives in a Google Sheet (published as CSV, URL in [config.json](config.json)) rather than a bundled file. `js/app.js` fetches it, caches it to `localStorage` (`songsData`), and displays cached data immediately on load while refreshing in the background (stale-while-revalidate pattern — the diff deliberately ignores the `lyricsValid` field, which is only ever populated locally, or every refresh would look "changed"). Users can also load a local `.xlsx`/`.csv` via SheetJS as a fallback (`songs-database.csv` is a sample for that format). Song data from the sheet is treated as untrusted text (escaped via `escapeHtml()` before any `innerHTML` use) since the sheet may be shared/edited by others.

**Lyrics & chunking**: individual song lyrics are HTML files in `lyrics/` (formatted with `<h2>` section headers, `<p>`, `<br>`), or a Google Doc URL that gets fetched, sanitized (`sanitizeExternalHtml()` in `song.js` strips scripts/event handlers/`javascript:` URLs from the fetched HTML — it's from an external, potentially-shared document), and rendered. Either source is split into sections at each `<h2>` via `splitIntoChunks()` and shown one section at a time with tabs across the top (`generateChunkTabs()`/`selectChunk()`) — not as one continuously-scrolling page.

**Gesture control** (the "Play Mode" requirement): a continuous head-turn-to-scroll implementation (MediaPipe FaceMesh) was built first but abandoned — ordinary head movement while playing keyboard triggered accidental scrolling on stage. The current mechanism instead uses MediaPipe Hands to recognize two deliberate gestures that don't happen by accident while playing an instrument: 3 fingers = next section, 🤙 "call me" = previous section (`processGesture()`/`onHandResults()` in `song.js`). Gesture detection logic (`detectHandGesture()` and friends) lives in `js/gestures.js`, shared between `song.js` (the real navigation) and `js/hand.js` (`hand.html`'s standalone practice/calibration tool, reachable only via the menu's "Practice Gestures" link — not part of the primary song-viewing flow).

**Camera**: requested at most once per session via `enableSharedCamera()` in `app.js` (either from the library menu's "Enable Camera" button, or lazily on the first Play Mode tap), and the `MediaStream` is kept alive and reused across every song — `stopGesture()` deliberately does *not* stop the stream's tracks, only detaches the video element; the stream is only released via the camera toggle. This matters specifically for iOS Safari, which re-prompts for camera access on every `getUserMedia` call and on every full page navigation — both of which the SPA architecture and stream reuse avoid. Frame delivery to MediaPipe is driven by a manual `requestAnimationFrame` loop rather than MediaPipe's own `Camera` helper (from `@mediapipe/camera_utils`), because that helper calls `getUserMedia` internally and would silently open a second, independent stream.

**Count-in / tempo**: `js/playtones.js` generates a metronome count-in (Web Audio, using the song's `bpm`/beat data) triggered by the "Count In" button on the song view. `tone.html`/`css/tone.css` is a standalone Tone.js prototype/test page for count-in and WAV playback experiments — not wired into the main app.

**Styling**: shared styles are in `css/styles.css`, including the song view (`.song-header-bar`, `.song-actions-bar`, `.chunk-tabs`, `.chunk-viewer`). `body.song-page` (toggled by the view-switching functions above) makes the song view a full-viewport flex column so the chunk viewer fills whatever space is left below the fixed-size header/actions/tabs — this is the default, not just a mobile media query, since a phone screen during a performance is the primary target. `hand.css` and `tone.css` scope additional styles to their respective standalone pages only.

## Hosting constraint

Per [instructions.txt](instructions.txt), the app must stay backend-free to remain hostable on GitHub Pages — the Google Sheets CSV fetch, localStorage caching, and in-browser MediaPipe/Tone.js processing are all deliberate choices to avoid needing a server. If a change would require a backend (e.g., server-side data writes, auth), flag it before implementing — an Azure serverless function was the agreed fallback, not an assumed default.
