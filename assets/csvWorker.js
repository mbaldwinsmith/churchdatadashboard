import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.mjs';
import { REQUIRED_HEADERS, normalizeCsvRow } from './csvParser.mjs';
import { ensureNoBinaryData, enforceRowLimit } from './csvSecurity.mjs';

self.addEventListener('message', (event) => {
  const { text } = event.data || {};

  if (typeof text !== 'string') {
    self.postMessage({ type: 'error', message: 'Unable to read the file as text.' });
    return;
  }

  try {
    ensureNoBinaryData(text);

    const results = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => (typeof header === 'string' ? header.trim() : header)
    });

    const headers = Array.isArray(results.meta?.fields)
      ? results.meta.fields.map((field) => field.trim())
      : [];

    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
      throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    }

    const records = [];

    results.data.forEach((row, index) => {
      const entry = {};
      headers.forEach((header) => {
        const value = row[header];
        entry[header] = typeof value === 'string' ? value.trim() : value ?? '';
      });

      const isEmptyRow = headers.every((header) => String(entry[header] ?? '').trim() === '');
      if (isEmptyRow) {
        return;
      }

      try {
        records.push(normalizeCsvRow(entry));
        enforceRowLimit(records.length);
      } catch (error) {
        throw new Error(`Row ${index + 2}: ${error.message}`);
      }
    });

    if (!records.length) {
      throw new Error('The CSV file does not contain any data rows.');
    }

    self.postMessage({ type: 'success', payload: records });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || 'Failed to parse CSV file.' });
  }
});
