# Music Lyrics Library

A web-based music lyrics library with gesture control for hands-free scrolling during performances.

## Features

- 📚 **Song Library Management**: Upload and manage your song collection via Excel/CSV files
- 🔍 **Advanced Filtering**: Search and filter by song name, artist, year, key, and BPM
- 🎤 **Play Mode**: Gesture-controlled scrolling using head movements
- 📹 **Camera Integration**: Uses MediaPipe for real-time head tracking
- 🎵 **External Links**: Quick access to original songs and karaoke versions
- 💾 **Local Storage**: Songs persist in your browser

## How to Use

### 1. Prepare Your Data

Create an Excel or CSV file with the following columns:
- Song Name
- Interpret (Artist)
- Year of release
- key (Musical key)
- bpm
- link to original song
- link to Karaoke version
- lyrics file (HTML filename in the `lyrics` folder)

**Example**: See `songs-database.csv`

### 2. Create Lyrics Files

Create HTML files in the `lyrics` folder with your song lyrics. Use HTML formatting:
- `<h2>` for section headers (Verse, Chorus, etc.)
- `<p>` for lyrics paragraphs
- `<br>` for line breaks
- `<strong>` or `<em>` for emphasis

**Example**: See `lyrics/wonderwall.html`

### 3. Run the Application

Open `index.html` in a modern web browser (Chrome, Edge, or Firefox recommended).

### 4. Load Your Songs

Click "Load Song Database" and select your Excel/CSV file.

### 5. Browse and Filter

Use the search bar and filters to find songs. Click any song card to view lyrics.

### 6. Play Mode (Gesture Control)

1. Click the song to view lyrics
2. Click "🎤 Play Mode" button
3. Allow camera access when prompted
4. Turn your head **right** to scroll down
5. Turn your head **left** to scroll up
6. Click "Stop" to disable gesture control

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
music_page/
├── index.html           # Main library page
├── song.html            # Individual song view
├── songs-database.csv   # Example song database
├── css/
│   └── styles.css       # All styles
├── js/
│   ├── app.js          # Main library logic
│   └── song.js         # Song view and gesture control
└── lyrics/
    ├── wonderwall.html
    ├── hotel-california.html
    └── bohemian-rhapsody.html
```

## Technologies Used

- **MediaPipe Face Mesh**: Head tracking and gesture recognition
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
- Check that column names in your Excel file match the required format
- Ensure lyrics files exist in the `lyrics` folder
- Check browser console for error messages

**Gesture control not scrolling?**
- Ensure good lighting for face detection
- Turn your head more distinctly
- Check that the camera can see your full face

## Future Enhancements

- Playlist creation
- Transpose key functionality
- Dark mode
- Mobile-optimized gesture control
- Voice commands
- PDF export

---

Created for musicians who need hands-free lyrics access during performances! 🎸🎹🎤
