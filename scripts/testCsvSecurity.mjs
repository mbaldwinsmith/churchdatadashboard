import assert from 'node:assert/strict';
import {
  ensureNoBinaryData,
  sanitizeTextValue,
  MAX_CSV_ROWS
} from '../assets/csvSecurity.mjs';
import { parseCsv } from '../assets/csvParser.mjs';

const CONTROL_BEL = String.fromCharCode(0x07);
const CONTROL_NUL = String.fromCharCode(0x00);

function expectThrows(fn, messageSubstring) {
  let errorCaught = false;
  try {
    fn();
  } catch (error) {
    errorCaught = true;
    if (messageSubstring) {
      assert.match(
        error.message,
        new RegExp(messageSubstring.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      );
    }
  }
  assert.ok(errorCaught, 'Expected function to throw an error');
}

function testSanitizeTextValue() {
  assert.equal(sanitizeTextValue('  Central  ', 'Site'), 'Central');
  assert.equal(sanitizeTextValue(2024, 'Year'), '2024');
  assert.equal(sanitizeTextValue('', 'Optional'), '');
  expectThrows(() => sanitizeTextValue('=HYPERLINK("http://example.com")', 'Site'), 'Site cannot start');
  expectThrows(
    () => sanitizeTextValue(`${CONTROL_BEL}Bell`, 'Site'),
    'unsupported control characters'
  );
}

function testEnsureNoBinaryData() {
  ensureNoBinaryData('Week,Date\n1,2024-01-07');
  expectThrows(
    () => ensureNoBinaryData(`Week,Date\n1,2024-01-07${CONTROL_NUL}`),
    'unsupported control characters'
  );
}

function testParseCsvRejectsFormulaInjection() {
  const maliciousCsv = [
    'Week,Date,Year,Month,Site,Service,Attendance,Kids Checked-in',
    "1,2024-01-07,2024,January,=cmd|' /C calc'!A0,9am,100,10"
  ].join('\n');
  expectThrows(() => parseCsv(maliciousCsv), 'Site cannot start');
}

function testParseCsvRejectsHugeFiles() {
  const header = 'Week,Date,Year,Month,Site,Service,Attendance,Kids Checked-in';
  const row = '1,2024-01-07,2024,January,Central,9am,100,10';
  const rows = new Array(MAX_CSV_ROWS + 1).fill(row);
  const csv = [header, ...rows].join('\n');
  expectThrows(() => parseCsv(csv), 'maximum allowed');
}

function testParseCsvValidData() {
  const csv = [
    'Week,Date,Year,Month,Site,Service,Attendance,Kids Checked-in',
    '1,2024-01-07,2024,January,Central,9am,100,10'
  ].join('\n');
  const result = parseCsv(csv);
  assert.equal(result.length, 1);
  assert.equal(result[0].Site, 'Central');
  assert.equal(result[0]['Kids Checked-in'], 10);
}

function run() {
  testSanitizeTextValue();
  testEnsureNoBinaryData();
  testParseCsvRejectsFormulaInjection();
  testParseCsvRejectsHugeFiles();
  testParseCsvValidData();
  console.log('Security CSV tests passed.');
}

run();
