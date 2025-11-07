// sheets.js - Google Sheets data fetching utilities

// Replace with your actual Google Sheet ID and API key
export const SHEET_ID = '1v68ejIFwH8umN2WCxg0SPCLLmdSi485-K97uTFDNths';
const API_KEY = 'YOUR_GOOGLE_API_KEY_HERE'; // Optional, for quota management
export const SHEET_NAME = 'Flights'; // Name of the sheet tab

/**
 * Fetch data from a public Google Sheet using the Sheets API
 * @param {string} range - The range to fetch (e.g., 'A1:Z100' or 'Sheet1!A:Z')
 * @returns {Promise<Array<Array<string>>>} 2D array of cell values
 */
export async function fetchSheetData(range = `${SHEET_NAME}!A:Z`) {
  if (!SHEET_ID || SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error('Google Sheet ID not configured. Please set SHEET_ID in sheets.js');
  }

  let url;
  if (API_KEY && API_KEY !== 'YOUR_GOOGLE_API_KEY_HERE') {
    // Use API key for higher quota limits
    url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  } else {
    // Use the simpler CSV export method (no API key required)
    return fetchSheetDataAsCSV();
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.values || [];
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    throw error;
  }
}

/**
 * Fetch Google Sheet data as CSV (simpler, no API key required)
 * @returns {Promise<Array<Array<string>>>} 2D array of cell values
 */
export async function fetchSheetDataAsCSV() {
  if (!SHEET_ID || SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    throw new Error('Google Sheet ID not configured. Please set SHEET_ID in sheets.js');
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
  
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error('Error fetching sheet CSV:', error);
    throw error;
  }
}

/**
 * Simple CSV parser
 * @param {string} csv - CSV text content
 * @returns {Array<Array<string>>} 2D array of cell values
 */
function parseCSV(csv) {
  const lines = csv.split('\n');
  const result = [];
  
  for (const line of lines) {
    if (line.trim() === '') continue;
    
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    row.push(current); // Add last cell
    result.push(row);
  }
  
  return result;
}

/**
 * Convert 2D array data to array of objects using first row as headers
 * @param {Array<Array<string>>} data - 2D array from sheet
 * @returns {Array<Object>} Array of objects with header keys
 */
export function sheetDataToObjects(data) {
  if (!data || data.length === 0) return [];
  
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
}

/**
 * Search for airline information in sheet data
 * @param {Array<Object>} airlines - Array of airline objects from sheet
 * @param {string} code - Airline code to search for
 * @returns {Object|null} Airline object or null if not found
 */
export function findAirlineByCode(airlines, code) {
  if (!airlines || !code) return null;
  
  const searchCode = code.toUpperCase();
  return airlines.find(airline => 
    airline.code?.toUpperCase() === searchCode ||
    airline.iata?.toUpperCase() === searchCode ||
    airline.icao?.toUpperCase() === searchCode
  ) || null;
}

/**
 * Search for airport information in sheet data
 * @param {Array<Object>} airports - Array of airport objects from sheet
 * @param {string} code - Airport IATA/ICAO code to search for
 * @returns {Object|null} Airport object or null if not found
 */
export function findAirportByCode(airports, code) {
  if (!airports || !code) return null;
  
  const searchCode = code.toUpperCase();
  return airports.find(airport => 
    airport.iata?.toUpperCase() === searchCode ||
    airport.icao?.toUpperCase() === searchCode
  ) || null;
}

/**
 * Fetch previous flight entries from the sheet
 * @param {string} range - The range to fetch (e.g., 'Sheet1!A:Z')
 * @returns {Promise<Array<Object>>} Array of previous flight entry objects
 */
export async function fetchPreviousFlightEntries(range = `${SHEET_NAME}!A:Z`) {
  try {
    const data = await fetchSheetData(range);
    return sheetDataToObjects(data);
  } catch (error) {
    console.error('Error fetching previous flight entries:', error);
    return [];
  }
}

/**
 * Get the most recent value for a specific field from previous entries
 * @param {Array<Object>} entries - Array of previous flight entries
 * @param {string} fieldName - Name of the field to get the last value for
 * @param {string} passengerName - Optional: filter by passenger name
 * @returns {string|null} Most recent value or null if not found
 */
export function getLastFieldValue(entries, fieldName, passengerName = null) {
  if (!entries || entries.length === 0) return null;
  
  // Filter by passenger name if provided
  let filteredEntries = entries;
  if (passengerName) {
    const searchName = passengerName.toLowerCase().trim();
    filteredEntries = entries.filter(entry => {
      const entryName = (entry.passengerName || entry['Passenger Name'] || entry.name || '').toLowerCase().trim();
      return entryName === searchName;
    });
  }
  
  // Sort by date (most recent first) if date field exists
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const dateA = new Date(a.date || a.Date || a.timestamp || 0);
    const dateB = new Date(b.date || b.Date || b.timestamp || 0);
    return dateB - dateA; // Most recent first
  });
  
  // Find the most recent non-empty value for the field
  for (const entry of sortedEntries) {
    const value = entry[fieldName] || 
                 entry[fieldName.toLowerCase()] || 
                 entry[fieldName.replace(/([A-Z])/g, ' $1').trim()] || // camelCase to "Camel Case"
                 entry[fieldName.replace(/\s+/g, '')]; // "Field Name" to "fieldname"
    
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  
  return null;
}

/**
 * Get suggestions for multiple fields based on previous entries
 * @param {Array<Object>} entries - Array of previous flight entries
 * @param {string} passengerName - Optional: filter by passenger name
 * @returns {Object} Object with field suggestions
 */
export function getFieldSuggestions(entries, passengerName = null) {
  const suggestions = {};
  
  // Common field mappings (form field name -> possible sheet column names)
  const fieldMappings = {
    reason: ['reason', 'Reason for Travel', 'reason for travel', 'Reason', 'purpose', 'Purpose'],
    airplaneType: ['airplaneType', 'Airplane Type', 'airplane type', 'Aircraft Type', 'aircraft', 'plane'],
    bookingClass: ['bookingClass', 'Booking Class', 'booking class', 'Class', 'class', 'cabin'],
    airline: ['airline', 'Airline', 'carrier', 'Carrier'],
    morePassengers: ['morePassengers', 'More Passengers', 'more passengers', 'Additional Passengers', 'Other Passengers', 'Co-Passengers'],
    comment: ['comment', 'Comment', 'comments', 'Comments', 'notes', 'Notes', 'remarks', 'Remarks']
  };
  
  Object.entries(fieldMappings).forEach(([formField, possibleColumns]) => {
    for (const columnName of possibleColumns) {
      const value = getLastFieldValue(entries, columnName, passengerName);
      if (value) {
        suggestions[formField] = value;
        break; // Use first match found
      }
    }
  });
  
  return suggestions;
}

/**
 * Get unique values for a field from previous entries (for datalist suggestions)
 * @param {Array<Object>} entries - Array of previous flight entries
 * @param {string} fieldName - Name of the field to get unique values for
 * @param {number} limit - Maximum number of suggestions to return
 * @returns {Array<string>} Array of unique values, most recent first
 */
export function getUniqueFieldValues(entries, fieldName, limit = 10) {
  if (!entries || entries.length === 0) return [];
  
  const values = new Set();
  const recentValues = [];
  
  // Sort by date (most recent first)
  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = new Date(a.date || a.Date || a.timestamp || 0);
    const dateB = new Date(b.date || b.Date || b.timestamp || 0);
    return dateB - dateA;
  });
  
  // Collect unique values, preserving recency order
  for (const entry of sortedEntries) {
    const value = entry[fieldName] || 
                 entry[fieldName.toLowerCase()] || 
                 entry[fieldName.replace(/([A-Z])/g, ' $1').trim()];
    
    if (value && String(value).trim() && !values.has(String(value).trim())) {
      const trimmedValue = String(value).trim();
      values.add(trimmedValue);
      recentValues.push(trimmedValue);
      
      if (recentValues.length >= limit) break;
    }
  }
  
  return recentValues;
}

// Example usage:
/*
// In your main app.js, you could do:

import { fetchSheetData, sheetDataToObjects, findAirlineByCode } from './sheets.js';

// Fetch airline data from a sheet
const airlineData = await fetchSheetData('Airlines!A:D');
const airlines = sheetDataToObjects(airlineData);

// Look up an airline
const airline = findAirlineByCode(airlines, 'UA');
console.log(airline); // { code: 'UA', name: 'United Airlines', ... }
*/