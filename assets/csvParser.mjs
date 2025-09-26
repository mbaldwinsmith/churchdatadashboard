// CSV parsing helpers that convert uploaded attendance spreadsheets into the
// normalized objects consumed by the dashboard. Security checks are delegated
// to the csvSecurity module.
import { ensureNoBinaryData, sanitizeTextValue, enforceRowLimit } from './csvSecurity.mjs';

// Ordered month names used for validation and presentation.
export const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

// Provide a sortable index for each month name (January -> 0, ...).
export const monthRank = monthNames.reduce((acc, name, index) => {
  acc[name] = index;
  return acc;
}, {});

// Expected column headers for uploaded CSV files. The parser throws if any are missing.
export const REQUIRED_HEADERS = [
  'Week',
  'Date',
  'Year',
  'Month',
  'Site',
  'Service',
  'Attendance',
  'Kids Checked-in'
];

// Lightweight CSV line parser that respects quoted fields and escaped quotes.
function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

// Fall back to the month of the parsed date when a CSV cell omits or misspells
// the month name.
function normalizeMonth(value, date) {
  if (value) {
    const match = monthNames.find((month) => month.toLowerCase() === value.toLowerCase());
    if (match) {
      return match;
    }
  }
  return monthNames[date.getMonth()];
}

// Convert a raw CSV row into a sanitized, typed record the dashboard can trust.
function normalizeCsvRow(entry) {
  const weekValue = Number(entry.Week);
  if (!Number.isFinite(weekValue)) {
    throw new Error('Week must be a number.');
  }
  const week = Math.round(weekValue);

  if (!entry.Date) {
    throw new Error('Date is required.');
  }

  const parsedDate = parseIsoDateLocal(entry.Date);

  const site = sanitizeTextValue(entry.Site, 'Site');
  if (!site) {
    throw new Error('Site is required.');
  }

  const service = sanitizeTextValue(entry.Service, 'Service');
  if (!service) {
    throw new Error('Service is required.');
  }

  const attendanceValue = Number(entry.Attendance);
  if (!Number.isFinite(attendanceValue)) {
    throw new Error('Attendance must be a number.');
  }
  const attendance = Math.round(attendanceValue);

  const kidsValue = Number(entry['Kids Checked-in']);
  if (!Number.isFinite(kidsValue)) {
    throw new Error('Kids Checked-in must be a number.');
  }
  const kids = Math.round(kidsValue);

  const yearInput = sanitizeTextValue(entry.Year, 'Year');
  const yearValue = yearInput || String(parsedDate.getFullYear());
  const monthInput = sanitizeTextValue(entry.Month, 'Month');
  const monthValue = normalizeMonth(monthInput, parsedDate);

  return {
    Week: week,
    Date: entry.Date,
    Year: yearValue,
    Month: monthValue,
    Site: site,
    Service: service,
    Attendance: attendance,
    'Kids Checked-in': kids
  };
}

// Strictly parse YYYY-MM-DD strings into real Date objects in the local timezone.
export function parseIsoDateLocal(value) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const parts = value.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const [yearPart, monthPart, dayPart] = parts;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (![year, month, day].every((part) => Number.isInteger(part))) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid Date value "${value}".`);
  }

  return date;
}

// Parse a CSV string into normalized attendance records with validation applied.
export function parseCsv(text) {
  ensureNoBinaryData(text);

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    throw new Error('The CSV file is empty.');
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missing.length) {
    throw new Error(`The CSV file is missing required columns: ${missing.join(', ')}.`);
  }

  const records = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim()) {
      continue;
    }

    const values = parseCsvLine(rawLine);
    const entry = {};
    headers.forEach((header, headerIndex) => {
      entry[header] = values[headerIndex]?.trim() ?? '';
    });

    try {
      records.push(normalizeCsvRow(entry));
      enforceRowLimit(records.length);
    } catch (error) {
      throw new Error(`Row ${index + 1}: ${error.message}`);
    }
  }

  if (!records.length) {
    throw new Error('The CSV file does not contain any data rows.');
  }

  return records;
}
