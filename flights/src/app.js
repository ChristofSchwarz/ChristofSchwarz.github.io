import { AIRLINE_CODE_MAP } from './parser.js';
import { submitFormData } from './submit.js';
import { decodeBarcode } from './barcode.js';
import { 
  fetchSheetData, 
  sheetDataToObjects, 
  findAirlineByCode, 
  findAirportByCode,
  fetchPreviousFlightEntries,
  getFieldSuggestions,
  getUniqueFieldValues,
  SHEET_ID,
  SHEET_NAME
} from './sheets.js';

const imageInput = document.getElementById('imageInput');
const previewImage = document.getElementById('previewImage');
const form = document.getElementById('flightForm');
const barcodeStatus = document.getElementById('barcodeStatus');
const barcodeRaw = document.getElementById('barcodeRaw');
const iataDatalist = document.getElementById('iataList');
const clearBtn = document.getElementById('clearBtn');
const submitBtn = document.getElementById('submitBtn');
const submitStatus = document.getElementById('submitStatus');
const radioGroupContainer = document.querySelector('fieldset.inline');

// Sheet data cache
let airlineSheetData = null;
let airportSheetData = null;
let previousFlightEntries = null;

// Form fields
const fields = {
  passengerName: document.getElementById('passengerName'),
  morePassengers: document.getElementById('morePassengers'),
  airline: document.getElementById('airline'),
  flightNumber: document.getElementById('flightNumber'),
  from: document.getElementById('from'),
  to: document.getElementById('to'),
  date: document.getElementById('date'),
  time: document.getElementById('time'),
  reason: document.getElementById('reason'),
  airplaneType: document.getElementById('airplaneType'),
  bookingClass: document.getElementById('bookingClass'),
  comment: document.getElementById('comment'),
};

imageInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Preview image
  const url = URL.createObjectURL(file);
  previewImage.src = url;
  previewImage.style.display = 'block';

  // Wait for image load, then auto-decode barcode
  await waitForImage(previewImage);
  await autoDecodeBarcode();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // Final guard: if still invalid, block
  if (!isFormValid()) {
    submitStatus.textContent = 'Please fill in all required fields.';
    submitStatus.className = 'status error';
    return;
  }
  submitStatus.textContent = 'Submitting…';
  submitBtn.disabled = true;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  data.companyPrivate = formData.get('companyPrivate');
  
  // Add origin domain for security verification
  data.origin = window.location.hostname || window.location.origin;
  
  // Add Google Sheet configuration (not hardcoded in Apps Script)
  data.sheetId = SHEET_ID;
  data.sheetName = SHEET_NAME;
  
  try {
    await submitFormData(data);
    submitStatus.textContent = 'Success! Data sent.';
    submitStatus.className = 'status success';
    form.reset();
    updateSubmitDisabled(); // re-disable after reset
  } catch (err) {
    console.error(err);
    submitStatus.textContent = 'Submission failed.';
    submitStatus.className = 'status error';
  } finally {
    submitBtn.disabled = !isFormValid();
  }
});

function applyConfidenceStyle(inputEl, meta) {
  const c = meta.confidence ?? 0;
  let color = '#c8d1dc';
  if (c >= 0.85) color = '#2e7d32'; // green
  else if (c >= 0.6) color = '#ff9800'; // amber
  else color = '#c62828'; // red
  inputEl.style.borderColor = color;
  inputEl.title = `Confidence ${(c * 100).toFixed(0)}% — ${meta.source || 'heuristic'}`;
}

// Populate IATA datalist (trimmed representative list; extend as needed)
const IATA_CODES = [
  'ATL','PEK','LAX','DXB','HND','ORD','LHR','HKG','PVG','CDG','DFW','CAN','AMS','FRA','IST','JFK','SIN','DEN','ICN','BKK','SFO','KUL','MAD','LAS','BCN','MIA','SEA','MUC','FCO','CLT','PHX','IAH','SYD','MCO','EWR','MSP','BOS','DTW','PHL','YYZ','MAN','LGW','GRU','BOG','SLC','BOM','MNL','CPH','OSL','ARN','ZRH','VIE','DUB','HEL','DOH','PRG','WAW','LIS','BRU','EDM','YVR','YUL','AKL','JNB','GIG','SCL','LIM','SJU','SAN','TPA','PDX','AUS','DAL','HNL','OGG','MAA','DEL','HYD','BLR','NRT','GDL','CUN','MEX','JED','RUH','AUH','DOH','KIX','NBO','ADD','CAI','CMN','TUN','DUR','CPT','BNE','PER','ADL','HAN','SGN','CGK','TPE','KTM','SVO','LED','DOH','KWI','JFK','LGA','DCA','IAD','STL','RDU'
];

if (iataDatalist && !iataDatalist.dataset.populated) {
  iataDatalist.dataset.populated = 'true';
  const frag = document.createDocumentFragment();
  IATA_CODES.sort().forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    frag.appendChild(opt);
  });
  iataDatalist.appendChild(frag);
}

// Validation helpers
const REQUIRED_KEYS = ['passengerName','airline','from','to','date','time','bookingClass','reason'];
function isFormValid() {
  // All required fields non-empty and a companyPrivate radio chosen
  for (const k of REQUIRED_KEYS) {
    const el = fields[k];
    if (!el || !(el.value || '').trim()) return false;
  }
  const radios = document.getElementsByName('companyPrivate');
  let radioChosen = false;
  radios.forEach?.(r => { if (r.checked) radioChosen = true; });
  return radioChosen;
}
function updateSubmitDisabled() {
  // Update visual states for required fields
  updateRequiredStyles();
  // Toggle submit disabled
  submitBtn.disabled = !isFormValid();
}
function updateRequiredStyles() {
  // Input fields
  REQUIRED_KEYS.forEach(k => {
    const el = fields[k];
    if (!el) return;
    const filled = !!(el.value || '').trim();
    el.classList.toggle('required-empty', !filled);
    el.classList.toggle('required-filled', filled);
  });
  // Radio group container
  const radios = document.getElementsByName('companyPrivate');
  let radioChosen = false;
  radios.forEach?.(r => { if (r.checked) radioChosen = true; });
  if (radioGroupContainer) {
    radioGroupContainer.classList.toggle('required-group-empty', !radioChosen);
    radioGroupContainer.classList.toggle('required-group-filled', radioChosen);
  }
}
// Attach listeners to update disabled state
REQUIRED_KEYS.forEach(k => {
  const el = fields[k];
  if (el) {
    el.addEventListener('input', updateSubmitDisabled);
    el.addEventListener('change', updateSubmitDisabled);
  }
});
document.getElementsByName('companyPrivate').forEach?.(r => r.addEventListener('change', updateSubmitDisabled));

// Add passenger name listener for auto-suggestions
if (fields.passengerName) {
  fields.passengerName.addEventListener('input', debounce(suggestFieldValues, 500));
  fields.passengerName.addEventListener('change', suggestFieldValues);
}

// Debounce helper function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initial state
updateSubmitDisabled();

// Enforce uppercase and allowed characters for specific fields
function sanitizeIATA(el) {
  const clean = (el.value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  if (clean !== el.value) el.value = clean;
}
function sanitizeFlightNumber(el) {
  const clean = (el.value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (clean !== el.value) el.value = clean;
}

// Format "More Passengers" field with proper + separation
function formatMorePassengers(el) {
  if (!el.value) return;
  
  // Split by various separators and rejoin with " + "
  const names = el.value
    .split(/[,;+&]/)  // Split by comma, semicolon, plus, or ampersand
    .map(name => name.trim())
    .filter(name => name.length > 0);
  
  if (names.length > 1) {
    el.value = names.join('+');
  }
}

fields.from?.addEventListener('input', () => { 
  sanitizeIATA(fields.from); 
  updateSubmitDisabled();
  // Try to enhance with airport info
  if (fields.from.value.length === 3) {
    const airportInfo = lookupAirport(fields.from.value);
    if (airportInfo) {
      fields.from.title = `${airportInfo.name}${airportInfo.city ? `, ${airportInfo.city}` : ''}${airportInfo.country ? `, ${airportInfo.country}` : ''} (${airportInfo.source})`;
    }
  }
});

fields.to?.addEventListener('input', () => { 
  sanitizeIATA(fields.to); 
  updateSubmitDisabled();
  // Try to enhance with airport info
  if (fields.to.value.length === 3) {
    const airportInfo = lookupAirport(fields.to.value);
    if (airportInfo) {
      fields.to.title = `${airportInfo.name}${airportInfo.city ? `, ${airportInfo.city}` : ''}${airportInfo.country ? `, ${airportInfo.country}` : ''} (${airportInfo.source})`;
    }
  }
});

fields.flightNumber?.addEventListener('input', () => { 
  sanitizeFlightNumber(fields.flightNumber); 
  updateSubmitDisabled();
  // Try to auto-fill airline based on flight number
  if (fields.flightNumber.value.length >= 2 && !fields.airline.value) {
    const fn = fields.flightNumber.value.toUpperCase();
    for (const len of [2,3,1]) {
      const code = fn.slice(0, len);
      const airlineInfo = lookupAirline(code);
      if (airlineInfo) {
        fields.airline.value = airlineInfo.name;
        applyConfidenceStyle(fields.airline, {
          confidence: airlineInfo.confidence * 0.8, // Slightly lower confidence for auto-fill
          source: `auto-${airlineInfo.source}`
        });
        break;
      }
    }
  }
});

// Format "More Passengers" field on blur
fields.morePassengers?.addEventListener('blur', () => { 
  formatMorePassengers(fields.morePassengers); 
});
// Automatic barcode decoding only; button removed.

async function autoDecodeBarcode() {
  if (!previewImage?.src) return;
  barcodeStatus.textContent = 'Decoding barcode…';
  barcodeStatus.className = 'status working';
  barcodeRaw.textContent = '';
  try {
    const res = await decodeBarcode(previewImage);
    if (res.error) {
      barcodeStatus.textContent = `No barcode: ${res.error}`;
      barcodeStatus.className = 'status error';
      return;
    }
    barcodeStatus.textContent = `Barcode decoded (${res.format || 'unknown format'})`;
    barcodeStatus.className = 'status success';
    if (res.raw) barcodeRaw.textContent = res.raw;
    if (res.data) {
      const map = {
        passengerName: 'passengerName',
        from: 'from',
        to: 'to',
        flightNumber: 'flightNumber',
        date: 'date',
        bookingClass: 'bookingClass',
      };
      Object.entries(map).forEach(([srcKey, fieldKey]) => {
        const v = res.data[srcKey];
        if (v && fields[fieldKey]) {
          fields[fieldKey].value = v;
          applyConfidenceStyle(fields[fieldKey], { confidence: 0.98, source: 'barcode' });
        }
      });
      // Hardcoded friendly name overrides for known passengers
      if (res.data.passengerName && fields.passengerName) {
        const SPECIAL_NAME_MAP = {
          'SCHWARZ/CHRISTOF': 'Christof',
          'DERGOVITS/EVA': 'Eva',
          'DERGOVITS/JULIA': 'Julia',
          'DERGOVITS/MARTINA': 'Martina',
        };
        const raw = String(res.data.passengerName).trim().toUpperCase();
        const alias = SPECIAL_NAME_MAP[raw];
        if (alias) {
          fields.passengerName.value = alias;
          applyConfidenceStyle(fields.passengerName, { confidence: 1.0, source: 'personal-alias' });
        }
      }
      // Airline via flightNumber prefix -> human-friendly name when possible
      if (res.data.flightNumber && fields.airline && !fields.airline.value) {
        const fn = String(res.data.flightNumber).toUpperCase();
        let airlineInfo = null;
        
        // Try different prefix lengths
        for (const len of [2,3,1]) {
          const code = fn.slice(0, len);
          airlineInfo = lookupAirline(code);
          if (airlineInfo) break;
        }
        
        if (airlineInfo) {
          fields.airline.value = airlineInfo.name;
          applyConfidenceStyle(fields.airline, {
            confidence: airlineInfo.confidence,
            source: airlineInfo.source
          });
        } else {
          // Fallback to showing the code
          fields.airline.value = fn.slice(0,2);
          applyConfidenceStyle(fields.airline, { confidence: 0.7, source: 'barcode-code' });
        }
      }
    }
    // After auto-fill, reevaluate submit enabling
    updateSubmitDisabled();
  } catch (err) {
    console.error(err);
    barcodeStatus.textContent = 'Barcode decode failed.';
    barcodeStatus.className = 'status error';
  }
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

clearBtn?.addEventListener('click', () => {
  form.reset();
  // Clear field styles and titles
  Object.values(fields).forEach((el) => {
    if (el) {
      el.style.borderColor = '';
      el.title = '';
    }
  });
  // Clear preview and statuses
  previewImage.src = '';
  previewImage.style.display = 'none';
  barcodeStatus.textContent = '';
  barcodeStatus.className = 'status';
  barcodeRaw.textContent = '';
  updateSubmitDisabled();
});

// Load sheet data on app startup (optional)
async function loadSheetData() {
  try {
    // Load previous flight entries first
    try {
      previousFlightEntries = await fetchPreviousFlightEntries();
      console.log(`Loaded ${previousFlightEntries.length} previous flight entries`);
      
      // Set up field suggestions based on previous entries
      setupFieldSuggestions();
    } catch (err) {
      console.log('Previous flight entries not accessible:', err.message);
    }

    // Load airline data from sheet (if configured)
    try {
      const airlineData = await fetchSheetData('Airlines!A:Z'); // Adjust range as needed
      airlineSheetData = sheetDataToObjects(airlineData);
      console.log(`Loaded ${airlineSheetData.length} airlines from sheet`);
    } catch (err) {
      console.log('Airline sheet not configured or accessible:', err.message);
    }

    // Load airport data from sheet (if configured)
    try {
      const airportData = await fetchSheetData('Airports!A:Z'); // Adjust range as needed
      airportSheetData = sheetDataToObjects(airportData);
      console.log(`Loaded ${airportSheetData.length} airports from sheet`);
      
      // Update IATA datalist with sheet data if available
      updateIataDatalistFromSheet();
    } catch (err) {
      console.log('Airport sheet not configured or accessible:', err.message);
    }
  } catch (err) {
    console.log('Sheet data loading failed:', err.message);
  }
}

// Enhanced airline lookup that tries sheet data first, then falls back to hardcoded map
function lookupAirline(code) {
  // Try sheet data first
  if (airlineSheetData) {
    const airline = findAirlineByCode(airlineSheetData, code);
    if (airline) {
      return {
        name: airline.name || airline.airline_name || code,
        confidence: 0.98,
        source: 'sheet-data'
      };
    }
  }
  
  // Fallback to hardcoded map
  if (AIRLINE_CODE_MAP[code]) {
    return {
      name: AIRLINE_CODE_MAP[code],
      confidence: 0.95,
      source: 'hardcoded-map'
    };
  }
  
  return null;
}

// Enhanced airport lookup
function lookupAirport(code) {
  if (airportSheetData) {
    const airport = findAirportByCode(airportSheetData, code);
    if (airport) {
      return {
        name: airport.name || airport.airport_name || code,
        city: airport.city || '',
        country: airport.country || '',
        confidence: 0.98,
        source: 'sheet-data'
      };
    }
  }
  return null;
}

// Update IATA datalist with airports from sheet
function updateIataDatalistFromSheet() {
  if (!iataDatalist || !airportSheetData || iataDatalist.dataset.sheetPopulated) return;
  
  // Clear existing options and add sheet data
  iataDatalist.innerHTML = '';
  iataDatalist.dataset.sheetPopulated = 'true';
  
  const frag = document.createDocumentFragment();
  const codes = new Set();
  
  // Add codes from sheet data
  airportSheetData.forEach(airport => {
    if (airport.iata && airport.iata.length === 3) {
      codes.add(airport.iata.toUpperCase());
    }
  });
  
  // Add hardcoded codes as fallback
  IATA_CODES.forEach(code => codes.add(code));
  
  Array.from(codes).sort().forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    frag.appendChild(opt);
  });
  
  iataDatalist.appendChild(frag);
}

// Call this on page load
document.addEventListener('DOMContentLoaded', loadSheetData);

// Set up field suggestions based on previous entries
function setupFieldSuggestions() {
  if (!previousFlightEntries || previousFlightEntries.length === 0) return;
  
  console.log('Setting up field suggestions from', previousFlightEntries.length, 'entries');
  console.log('Sample entry:', previousFlightEntries[0]); // Debug: see what columns we have
  
  // Create datalist for "Reason for Travel" field
  const reasonField = fields.reason;
  if (reasonField) {
    const reasonDatalist = document.getElementById('reasonList');
    if (reasonDatalist) {
      // Use only the last 20 entries for reason suggestions to keep them relevant
      const last20Entries = getLastNEntries(previousFlightEntries, 20);
      
      // Try multiple possible column names for "reason"
      const reasonColumnNames = ['reason', 'Reason for Travel', 'reason for travel', 'Reason', 'purpose', 'Purpose', 'Zweck'];
      let reasonValues = [];
      
      for (const columnName of reasonColumnNames) {
        reasonValues = getUniqueFieldValues(last20Entries, columnName, 15);
        if (reasonValues.length > 0) {
          console.log(`Found ${reasonValues.length} reason values from last 20 entries using column: "${columnName}"`);
          break;
        }
      }
      
      populateDatalist(reasonDatalist, reasonValues);
      
      // Set placeholder with most recent value
      if (reasonValues.length > 0) {
        reasonField.placeholder = `e.g., ${reasonValues[0]}`;
      }
    }
  }
  
  // Create datalist for "Airplane Type" field
  const airplaneField = fields.airplaneType;
  if (airplaneField) {
    const airplaneDatalist = document.getElementById('airplaneList');
    if (airplaneDatalist) {
      const airplaneColumnNames = ['airplaneType', 'Airplane Type', 'airplane type', 'Aircraft Type', 'aircraft', 'plane', 'Flugzeugtyp'];
      let airplaneValues = [];
      
      for (const columnName of airplaneColumnNames) {
        airplaneValues = getUniqueFieldValues(previousFlightEntries, columnName, 15);
        if (airplaneValues.length > 0) {
          console.log(`Found ${airplaneValues.length} airplane values using column: "${columnName}"`);
          break;
        }
      }
      
      populateDatalist(airplaneDatalist, airplaneValues);
      
      if (airplaneValues.length > 0) {
        airplaneField.placeholder = `e.g., ${airplaneValues[0]}`;
      }
    }
  }
  
  // Create datalist for "Booking Class" field
  const classField = fields.bookingClass;
  if (classField) {
    const classDatalist = document.getElementById('classList');
    if (classDatalist) {
      const classColumnNames = ['bookingClass', 'Booking Class', 'booking class', 'Class', 'class', 'cabin', 'Klasse'];
      let classValues = [];
      
      for (const columnName of classColumnNames) {
        classValues = getUniqueFieldValues(previousFlightEntries, columnName, 10);
        if (classValues.length > 0) {
          console.log(`Found ${classValues.length} class values using column: "${columnName}"`);
          break;
        }
      }
      
      populateDatalist(classDatalist, classValues);
      
      if (classValues.length > 0) {
        classField.placeholder = `e.g., ${classValues[0]}`;
      }
    }
  }
  
  // Create datalist for "More Passengers" field
  const morePassengersField = fields.morePassengers;
  if (morePassengersField) {
    const morePassengersDatalist = document.getElementById('morePassengersList');
    if (morePassengersDatalist) {
      const morePassengersColumnNames = ['morePassengers', 'More Passengers', 'more passengers', 'Additional Passengers', 'Other Passengers', 'Co-Passengers'];
      let morePassengersValues = [];
      
      for (const columnName of morePassengersColumnNames) {
        morePassengersValues = getUniqueFieldValues(previousFlightEntries, columnName, 10);
        if (morePassengersValues.length > 0) {
          console.log(`Found ${morePassengersValues.length} more passengers values using column: "${columnName}"`);
          break;
        }
      }
      
      populateDatalist(morePassengersDatalist, morePassengersValues);
      
      if (morePassengersValues.length > 0) {
        morePassengersField.placeholder = `e.g., ${morePassengersValues[0]}`;
      }
    }
  }
}

// Helper function to populate datalist with options
function populateDatalist(datalist, values) {
  // Clear existing options
  datalist.innerHTML = '';
  
  const fragment = document.createDocumentFragment();
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    fragment.appendChild(option);
  });
  
  datalist.appendChild(fragment);
}

// Helper function to get the last N entries sorted by date
function getLastNEntries(entries, n = 20) {
  if (!entries || entries.length === 0) return [];
  
  // Sort by date (most recent first) if date field exists
  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = new Date(a.timestamp || 0);
    const dateB = new Date(b.timestamp || 0);
    return dateB - dateA; // Most recent first
  });
  
  // Return the last N entries
  return sortedEntries.slice(-n);
}

// Auto-suggest based on passenger name
function suggestFieldValues() {
  if (!previousFlightEntries || !fields.passengerName.value) return;
  
  const passengerName = fields.passengerName.value.trim();
  if (passengerName.length < 2) return; // Wait for meaningful input
  
  const suggestions = getFieldSuggestions(previousFlightEntries, passengerName);
  
  let suggestionsApplied = 0;
  
  // Apply suggestions to empty fields only
  Object.entries(suggestions).forEach(([fieldName, value]) => {
    const field = fields[fieldName];
    if (field && !field.value && value) {
      field.value = value;
      suggestionsApplied++;
      
      // Add visual indicator that this is a suggestion
      field.style.backgroundColor = '#e8f5e8';
      field.style.borderColor = '#4caf50';
      field.title = `Auto-filled from previous entry: "${value}" - Click to edit`;
      
      // Remove the styling after user interaction
      const removeStyleOnEdit = () => {
        field.style.backgroundColor = '';
        field.style.borderColor = '';
        field.title = '';
        field.removeEventListener('input', removeStyleOnEdit);
        field.removeEventListener('focus', removeStyleOnEdit);
      };
      field.addEventListener('input', removeStyleOnEdit);
      field.addEventListener('focus', removeStyleOnEdit);
    }
  });
  
  // Show notification if suggestions were applied
  if (suggestionsApplied > 0) {
    showSuggestionNotification(suggestionsApplied, passengerName);
  }
  
  updateSubmitDisabled();
}

// Show notification when suggestions are applied
function showSuggestionNotification(count, passengerName) {
  // Remove any existing notification
  const existingNotification = document.querySelector('.suggestion-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'suggestion-notification';
  notification.innerHTML = `
    <span>✨ Auto-filled ${count} field${count > 1 ? 's' : ''} based on previous entries for "${passengerName}"</span>
    <button type="button" onclick="this.parentElement.remove()">×</button>
  `;
  
  // Insert after the passenger name field
  const passengerLabel = fields.passengerName.closest('label');
  if (passengerLabel) {
    passengerLabel.insertAdjacentElement('afterend', notification);
  }
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

