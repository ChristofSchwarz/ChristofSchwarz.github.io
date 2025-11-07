// barcode.js - stub for decoding boarding pass barcodes (BCBP standard)
// Many boarding passes include a PDF417 or Aztec code with structured data.
// This module outlines the approach; decoder implementation to be added.
// Reference: IATA Bar Coded Boarding Pass (BCBP) standard.

/*
BCBP primary data structure (linear fixed-length fields):
  Format Code (1 char)
  Number of Legs Encoded (1 char)
  Passenger Name (20 chars)
  Electronic Ticket Indicator (1 char)
  Operating Carrier PNR Code (7 chars)
  From City Airport Code (3 chars)
  To City Airport Code (3 chars)
  Operating Carrier Designator (3 chars)
  Flight Number (5 chars)
  Date of Flight (3 chars, Julian day)
  Compartment Code (1 char)
  Seat Number (4 chars)
  Check-in Sequence Number (5 chars)
  Passenger Status (1 char)
Optional fields may follow including version number, security data, etc.
*/

export async function decodeBarcode(imageElement) {
  // Decode using ZXing Browser convenience API from the UMD global.
  if (!imageElement || !(imageElement.complete || imageElement.naturalWidth)) {
    return { raw: null, data: null, error: 'Image not ready.' };
  }
  try {
    const ZX = window.ZXingBrowser;
    if (!ZX || !ZX.BrowserMultiFormatReader) {
      return { raw: null, data: null, error: 'ZXingBrowser not loaded' };
    }

    const reader = new ZX.BrowserMultiFormatReader();
    // Prefer a single decode attempt from the already-loaded <img> element
    const result = await reader.decodeFromImageElement(imageElement);
    if (!result) return { raw: null, data: null, error: 'No barcode found.' };

    const raw = result.text || (typeof result.getText === 'function' ? result.getText() : '');
    const parsed = parseBCBP(raw);
    const format = result.format || (typeof result.getBarcodeFormat === 'function' ? result.getBarcodeFormat() : undefined);
    return { raw, data: parsed, error: null, format };
  } catch (err) {
    return { raw: null, data: null, error: err && err.message ? err.message : String(err) };
  }
}

export function parseBCBP(rawString) {
  if (!rawString || rawString.length < 60) return null;
  const fmt = rawString[0];
  const legs = rawString[1];
  const name = rawString.slice(2, 22).trim();
  const ticketInd = rawString[22];
  const pnr = rawString.slice(23, 30).trim();
  const from = rawString.slice(30, 33);
  const to = rawString.slice(33, 36);
  const carrier = rawString.slice(36, 39);
  const flightNum = rawString.slice(39, 44).trim();
  const julianDay = rawString.slice(44, 47);
  const compartment = rawString[47];
  const seat = rawString.slice(48, 52).trim();
  const seq = rawString.slice(52, 57).trim();
  const status = rawString[57];

  const flightDate = julianToDate(julianDay);

  return {
    formatCode: fmt,
    legsEncoded: legs,
    passengerName: normalizeName(name),
    pnr,
    from,
    to,
    operatingCarrier: carrier,
    flightNumber: (carrier + flightNum).replace(/\s+/g, ''),
    date: flightDate,
    compartmentCode: compartment,
    bookingClass: compartment, // Mapping compartment code directly to booking class (e.g., Y, J, F)
    seat,
    checkInSeq: seq,
    passengerStatus: status,
    source: 'barcode'
  };
}

function julianToDate(julian) {
  // julian = DDD (day of year). Assume current year.
  const year = new Date().getFullYear();
  const day = parseInt(julian, 10);
  if (!day || day < 1 || day > 366) return undefined;
  const dt = new Date(Date.UTC(year, 0, day));
  const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
  const dd = String(dt.getUTCDate()).padStart(2,'0');
  return `${year}-${mm}-${dd}`;
}

function normalizeName(n) {
  // BCBP passenger name often LAST/FIRST or LAST/FIRST MRS
  return n.replace(/\s+/g, ' ').replace(/\/$/, '').trim();
}
