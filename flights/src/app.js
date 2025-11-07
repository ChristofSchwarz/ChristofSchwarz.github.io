import { AIRLINE_CODE_MAP } from './parser.js';
import { submitFormData } from './submit.js';
import { decodeBarcode } from './barcode.js';

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

// Form fields
const fields = {
  passengerName: document.getElementById('passengerName'),
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
const REQUIRED_KEYS = ['passengerName','airline','flightNumber','from','to','date','time','bookingClass','reason'];
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

fields.from?.addEventListener('input', () => { sanitizeIATA(fields.from); updateSubmitDisabled(); });
fields.to?.addEventListener('input', () => { sanitizeIATA(fields.to); updateSubmitDisabled(); });
fields.flightNumber?.addEventListener('input', () => { sanitizeFlightNumber(fields.flightNumber); updateSubmitDisabled(); });
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
        let airlineName;
        for (const len of [2,3,1]) {
          const code = fn.slice(0, len);
          if (AIRLINE_CODE_MAP[code]) { airlineName = AIRLINE_CODE_MAP[code]; break; }
        }
        if (airlineName) {
          fields.airline.value = airlineName;
          applyConfidenceStyle(fields.airline, { confidence: 0.95, source: 'barcode-derived' });
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

