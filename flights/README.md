# Boarding Pass Form Parser

Single-page web app that:

- Uploads a boarding pass image
- Runs client-side OCR via Tesseract.js
- Heuristically parses key flight data
- Pre-fills an editable form
- Submits final data to a Google Sheet through a Google Apps Script Web App endpoint
 - Allows manual entry of Airplane Type (not parsed from image yet)
 - Includes a stub for barcode (BCBP) decoding to extract structured data later

## Tech Stack
- Static HTML/CSS/Vanilla JS (no build step required)
- [Tesseract.js](https://github.com/naptha/tesseract.js) via CDN
- Google Apps Script (for Sheets write API)
- Deployable on GitHub Pages (just push `index.html` and assets to `main` or `gh-pages`)

## Getting Started
### 1. Clone & Open
Simply open `index.html` in your browser (if using file:// some browsers block module imports; prefer a tiny local server).

### 2. Run a Local Dev Server (optional but recommended)
Using PowerShell:
```powershell
# Python 3
python -m http.server 8080
# or Node (if installed)
npx serve . -l 8080
```
Navigate to http://localhost:8080

### 3. Configure Google Apps Script
1. Create a new Google Apps Script project (standalone or attached to your Google Sheet).
2. Add a Code.gs file with something like:
```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.openById('YOUR_SHEET_ID').getSheetByName('Sheet1');
  const body = JSON.parse(e.postData.contents);
  const headers = ['timestamp','passengerName','airline','flightNumber','from','to','date','time','reason','companyPrivate','airplaneType','comment'];
  // Ensure header row exists
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const row = [
    new Date(),
    body.passengerName || '',
    body.airline || '',
    body.flightNumber || '',
    body.from || '',
    body.to || '',
    body.date || '',
    body.time || '',
    body.reason || '',
    body.companyPrivate || '',
    body.airplaneType || '',
    body.comment || ''
  ];
  sheet.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
```
3. Deploy > New Deployment > type: Web App
   - Execute as: Me
   - Who has access: Anyone with the link (or adjust as needed)
4. Copy the Web App URL and set it in `src/submit.js` replacing `YOUR_GOOGLE_APPS_SCRIPT_WEBAPP_URL`.

### 4. Test OCR
Use a clear boarding pass image. The raw OCR text is viewable via the disclosure element. Adjust parsing rules in `src/parser.js` as needed.

### 5. Deploy to GitHub Pages
Commit and push. In repository settings enable Pages for the branch containing `index.html` (root). After it builds, visit the published URL.

## Parser Heuristics
Located in `src/parser.js`:
- Extracts passenger name patterns like DOE/JANE or JANE DOE
- Attempts flight number (carrier code + digits)
- Grabs first plausible IATA pair (AAA BBB or AAA-BBB)
- Parses multiple date formats (DDMONYYYY, YYYY-MM-DD, DD/MM/YYYY, etc.)
- Finds first time pattern HH:MM or HHMM, with label proximity boosts
- Confidence scoring + source labels (pattern/near-label/fallback)
- Filters out times near the very top of the image (to avoid OS clock false positives)

Feel free to refine with additional samples; confidence is visualized by input border color.

## Airplane Type Field
`Airplane Type` is a manual input (e.g., A320, B737-800). It’s included in submissions but not currently parsed from the image.

## Barcode Decoding (Future)
`src/barcode.js` contains a stub for parsing BCBP (Bar Coded Boarding Pass) data. Implementing PDF417/Aztec decoding (e.g. with `@zxing/library`) will yield highly reliable structured fields (PNR, seat, date, flight number) with less heuristic uncertainty.
Proposed steps:
1. Migrate to an npm build (e.g., Vite) and `npm install @zxing/library`
2. Draw the uploaded image to a canvas; run the PDF417/Aztec decoder
3. Parse the decoded string with `parseBCBP()` to produce normalized fields
4. Merge barcode-derived values over OCR results when barcode confidence is high

## Improving Accuracy (Ideas)
- Add fuzzy matching for airline names using a map of carrier codes
- Integrate a structured barcode (PDF417 / Aztec) library if images include 2D codes
- Confidence scoring per extracted field
- Store last-used reason/company choices in localStorage
 - Use barcode decoding to override low-confidence OCR values
 - Distinguish scheduled vs actual departure time labels

## License
MIT (add a LICENSE file if distributing publicly).
