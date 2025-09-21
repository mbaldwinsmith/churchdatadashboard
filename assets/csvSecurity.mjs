const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/;
const DANGEROUS_FORMULA_PREFIX = /^[=+\-@]/;
const MAX_TEXT_LENGTH = 120;

export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROWS = 10000;

export function describeFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 bytes';
  }

  const units = ['bytes', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? Math.round(size).toString() : size.toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${units[unitIndex]}`;
}

export function ensureNoBinaryData(text) {
  if (typeof text !== 'string') {
    throw new Error('Unable to read the file as text.');
  }

  if (CONTROL_CHAR_REGEX.test(text)) {
    throw new Error('The CSV file contains unsupported control characters.');
  }
}

export function sanitizeTextValue(value, fieldName) {
  if (value === undefined || value === null) {
    return '';
  }

  let stringValue = typeof value === 'string' ? value : String(value);

  if (CONTROL_CHAR_REGEX.test(stringValue)) {
    throw new Error(`${fieldName} contains unsupported control characters.`);
  }

  stringValue = stringValue.trim();

  if (!stringValue) {
    return '';
  }

  if (DANGEROUS_FORMULA_PREFIX.test(stringValue)) {
    throw new Error(
      `${fieldName} cannot start with "${stringValue[0]}" because it may be interpreted as a formula.`
    );
  }

  if (stringValue.length > MAX_TEXT_LENGTH) {
    throw new Error(`${fieldName} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  }

  return stringValue;
}

export function enforceRowLimit(rowCount) {
  if (rowCount > MAX_CSV_ROWS) {
    throw new Error(`The CSV file exceeds the maximum allowed ${MAX_CSV_ROWS.toLocaleString()} data rows.`);
  }
}
