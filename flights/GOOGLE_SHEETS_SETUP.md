# Google Sheets Integration Setup

## Overview
Your flight app can now read data from publicly accessible Google Sheets to enhance airline and airport lookups. This provides a dynamic way to maintain airline codes, airport information, and other reference data without code changes.

## Setup Instructions

### Step 1: Create Your Google Sheets

#### Airlines Sheet
Create a sheet named "Airlines" with columns like:
```
code | name | iata | icao | country
UA   | United Airlines | UA | UAL | United States
LH   | Lufthansa | LH | DLH | Germany
BA   | British Airways | BA | BAW | United Kingdom
```

#### Airports Sheet  
Create a sheet named "Airports" with columns like:
```
iata | icao | name | city | country
LAX  | KLAX | Los Angeles International Airport | Los Angeles | United States
LHR  | EGLL | London Heathrow Airport | London | United Kingdom
FRA  | EDDF | Frankfurt Airport | Frankfurt | Germany
```

### Step 2: Make Your Sheet Public
1. Open your Google Sheet
2. Click the "Share" button (top right)
3. Click "Change to anyone with the link"
4. Set permission to "Viewer"
5. Copy the share link

### Step 3: Extract Sheet ID
From a URL like:
`https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit`

The Sheet ID is: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`

### Step 4: Configure Your App
Edit `src/sheets.js` and replace:
```javascript
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';
```
with:
```javascript
const SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
```

### Step 5: Optional - Get Google API Key
For higher rate limits, you can get a free Google API key:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the "Google Sheets API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy the API key and update `sheets.js`:

```javascript
const API_KEY = 'YOUR_ACTUAL_API_KEY_HERE';
```

## Features Added

### Enhanced Airline Lookup
- The app now checks your Google Sheet for airline codes first
- Falls back to the hardcoded `AIRLINE_CODE_MAP` if not found
- Shows confidence level and data source in field tooltips

### Airport Information
- IATA datalist is populated from your sheet data
- Hover over airport fields to see full airport names and locations
- Real-time lookup as you type airport codes

### Auto-fill from Flight Numbers
- When you enter a flight number, the app automatically tries to determine the airline
- Uses both sheet data and hardcoded mappings

### Previous Entry Suggestions ⭐ NEW!
- **Auto-suggests previous values** when you enter a passenger name
- **Smart field suggestions** for "Reason for Travel", "Airplane Type", "Booking Class"
- **Dropdown suggestions** from your previous entries in datalists
- **Visual indicators** show when fields are auto-filled from previous data
- **Most recent values** are suggested first and shown as placeholders

## Sheet Data Structure

The app expects these column names (case-insensitive):

### Airlines Sheet
- `code`, `iata`, or `icao` - for the airline code
- `name` or `airline_name` - for the display name

### Airports Sheet  
- `iata` or `icao` - for the airport code
- `name` or `airport_name` - for the airport name
- `city` - for the city name (optional)
- `country` - for the country name (optional)

## Usage Without API Key
If you don't configure an API key, the app will use the CSV export method:
- No quota limits for public sheets
- Slightly slower response time
- Perfect for most use cases

## Testing
1. Open your browser's developer console
2. Load your app
3. You should see messages like:
   ```
   Loaded 150 airlines from sheet
   Loaded 500 airports from sheet
   ```

## Troubleshooting

### "Sheet ID not configured" Error
- Make sure you've replaced `YOUR_GOOGLE_SHEET_ID_HERE` in `sheets.js`

### "HTTP 403" or "HTTP 404" Errors
- Verify your sheet is set to "Anyone with the link can view"
- Check that the Sheet ID is correct
- Ensure sheet tabs are named "Airlines" and "Airports" (or update the ranges in the code)

### No Data Loading
- Check browser console for error messages
- Verify your sheet has the expected column headers
- Test the CSV export URL directly: `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=0`

## Advanced Customization

You can modify the ranges in `loadSheetData()` function in `app.js`:
```javascript
const airlineData = await fetchSheetData('MyAirlines!A1:D100'); // Custom range
const airportData = await fetchSheetData('MyAirports!B:F');      // Different columns
```