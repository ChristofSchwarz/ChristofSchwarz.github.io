# Music Lyrics Library

A web-based music lyrics library with hands-free section navigation during performances.

## Features

- 📚 **Song Library Management**: Upload and manage your song collection via Excel/CSV files, or a linked Google Sheet
- 🔍 **Advanced Filtering**: Search and filter by song name, artist, year, key, and BPM
- ✋ **Play Mode**: Gesture-controlled navigation between lyrics sections (verse/chorus/...) using two hand gestures
- 📹 **Camera Integration**: Uses MediaPipe Hands for real-time gesture recognition; the camera is requested once and reused across every song, so it isn't re-prompted per song on iOS
- 🎵 **External Links**: Quick access to original songs and karaoke versions
- 💾 **Local Storage**: Song data is cached in your browser

## How to Use

### 1. Maintain Your Song Data

Song metadata (name, artist, year, key, bpm, links) lives in a Google Sheet, linked via `googleSheetsUrl` in `config.json`. The app fetches it automatically on load - just edit the sheet (the menu's "✏️ Edit linked Google Sheet" link opens it directly) and use "🔄 Refresh from Google Sheets" to pull changes in. Expected columns:
- Song Name
- Interpret (Artist)
- Year of release
- key (Musical key)
- bpm
- link to original song
- link to Karaoke version
- lyrics file (a Google Docs URL, or an HTML filename in the `lyrics` folder)

If you'd rather not use Google Sheets, "📁 Load Local File (Excel/CSV)" in the menu loads the same shape from a local `.xlsx`/`.csv` instead.

### 2. Write Lyrics

Each song's lyrics can either be a Google Doc (put its share URL in the "lyrics file" column - it must be shared as "Anyone with the link can view"), or an HTML file placed in the `lyrics` folder. Either way, use `<h2>` to mark section headings (Verse, Chorus, ...) - the app splits lyrics into sections at each `<h2>` and shows them one at a time with tabs to jump between them:
- `<h2>` for section headers
- `<p>` for lyrics paragraphs
- `<br>` for line breaks
- `<strong>` or `<em>` for emphasis

### 3. Run the Application

Open `index.html` in a modern web browser (Chrome, Edge, or Firefox recommended).

### 4. Browse and Filter

Use the search bar and filters to find songs. Click any song card to view lyrics.

### 5. Play Mode (Gesture Control)

Lyrics are split into sections at each `<h2>` heading and shown one at a time, with tabs across the top to jump between them. Play Mode starts automatically a moment after you open a song (allow camera access when prompted the first time), and navigates hands-free:

- **Make a "call me" 🤙 sign** to go to the next section
- **Show 3 fingers** to go to the previous section

These two gestures were chosen because they don't happen by accident while playing an instrument - an earlier version scrolled continuously based on head turns, but ordinary head movement while playing keyboard triggered it accidentally, so it was replaced with this. Tap the ✋ button in the header to pause/resume gesture control, or use the tabs / arrow keys to jump to a section directly.

## Hosting on GitHub Pages

1. Create a repository named `<yourusername>.github.io`
2. Upload all files to the repository
3. Enable GitHub Pages in repository settings
4. Access your site at `https://<yourusername>.github.io/`

## Browser Requirements

- Modern browser with WebRTC support (Chrome 80+, Edge 80+, Firefox 75+)
- Camera access for gesture control
- JavaScript enabled

## File Structure

```
songs/
├── index.html           # Library + song viewer (single page, no navigation between them)
├── hand.html             # Standalone gesture practice/calibration tool
├── config.json           # Linked Google Sheet / Drive folder URLs
├── css/
│   └── styles.css       # All styles
├── js/
│   ├── app.js            # Library logic, shared camera stream, view switching
│   ├── song.js           # Song view: lyrics chunking, tabs, gesture navigation
│   ├── gestures.js       # Shared MediaPipe Hands gesture detection (used by song.js and hand.js)
│   ├── hand.js           # hand.html's finger-count practice tool
│   └── playtones.js      # Count-in metronome
└── lyrics/               # Optional local lyrics files (see "Write Lyrics" above)
```

## Technologies Used

- **MediaPipe Hands**: Real-time finger-gesture recognition
- **SheetJS (XLSX)**: Excel/CSV file parsing
- **Vanilla JavaScript**: No framework dependencies
- **CSS3**: Modern styling with gradients and animations

## Privacy Note

All processing happens locally in your browser. The camera feed is used only for gesture detection and is never transmitted or stored anywhere.

## Troubleshooting

**Camera not working?**
- Ensure you've granted camera permissions
- Try using HTTPS (required for camera access on some browsers)
- Use GitHub Pages or a local HTTPS server

**Songs not loading?**
- Check that `config.json`'s `googleSheetsUrl` points to a sheet published/exported as CSV
- Check that column names in the sheet (or your Excel file) match the required format
- For Google Doc lyrics, make sure the doc is shared as "Anyone with the link can view"; for local lyrics, ensure the file exists in the `lyrics` folder
- Check browser console for error messages

**Gesture control not navigating?**
- Ensure good lighting so your hand is clearly visible
- Hold the gesture steady and make sure your whole hand is in frame
- Use "👋 Practice Gestures" from the menu to check gestures are being recognized before a show

## Future Enhancements

- Playlist creation
- Transpose key functionality
- Dark mode
- Mobile-optimized gesture control
- Voice commands
- PDF export

---

Created for musicians who need hands-free lyrics access during performances! 🎸🎹🎤
