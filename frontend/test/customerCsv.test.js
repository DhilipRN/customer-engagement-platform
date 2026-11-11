import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerImportTemplateToCsv,
  customerImportConfirmationMessage,
  customerImportResultMessage,
  canConfirmCustomerImport,
  CUSTOMER_EXPORT_FILENAME,
  CUSTOMER_IMPORT_TEMPLATE_FILENAME,
  customersToCsv,
  escapeCsvValue,
  filterCustomersForSearch,
  getImportableCustomerRows,
  parseConsentValue,
  parseCsv,
  validateCustomerImportCsv,
} from '../src/customerCsv.js';

const customers = Array.from({ length: 16 }, (_, index) => ({
  name: index === 0 ? 'Ada, Lovelace' : `Customer ${index}`,
  phone: `123456${String(index).padStart(4, '0')}`,
  email: index === 1 ? 'ada@example.com' : `customer${index}@example.com`,
  consent_given: index % 2 === 0,
  created_at: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
}));

test('CSV values escape commas, quotes, and newlines', () => {
  assert.equal(escapeCsvValue('Ada, "The Analyst"\nTeam'), '"Ada, ""The Analyst""\nTeam"');
});

test('CSV values protect spreadsheet formulas', () => {
  assert.equal(escapeCsvValue('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(escapeCsvValue('+15550101'), "'+15550101");
  assert.equal(escapeCsvValue('normal text'), 'normal text');
});

test('search filtering matches the existing Customers page behavior', () => {
  assert.deepEqual(
    filterCustomersForSearch(customers, 'ada@example.com'),
    [customers[1]],
  );
  assert.deepEqual(
    filterCustomersForSearch(customers, 'yes'),
    customers.filter((customer) => customer.consent_given),
  );
});

test('CSV export honors the active search filter', () => {
  const csv = customersToCsv(filterCustomersForSearch(customers, 'ada@example.com'));

  assert.match(csv, /ada@example.com/);
  assert.doesNotMatch(csv, /customer2@example.com/);
});

test('CSV export includes all filtered customers rather than the current page', () => {
  const csv = customersToCsv(filterCustomersForSearch(customers, ''));
  const lines = csv.trim().split('\r\n');

  assert.equal(lines.length, customers.length + 1);
  assert.match(lines[1], /"Ada, Lovelace"/);
  assert.match(csv, /Customer 15/);
  assert.match(csv, /Consent Given/);
});

test('CSV import template contains the required headers and example row', () => {
  const lines = customerImportTemplateToCsv().trim().split('\r\n');

  assert.equal(lines[0], 'name,phone,email,consent_given');
  assert.equal(
    lines[1],
    'Example Customer,9876543210,example.customer@example.com,false',
  );
  assert.equal(lines.length, 2);
});

test('import preview display row numbers start at 1 while original CSV rows remain available', () => {
  const result = validateCustomerImportCsv([
    'name,phone,email,consent_given',
    'First Customer,1234567890,,true',
    'Second Customer,1234567891,,false',
  ].join('\n'));

  assert.equal(result.rows[0].displayRowNumber, 1);
  assert.equal(result.rows[1].displayRowNumber, 2);
  assert.equal(result.rows[0].rowNumber, 2);
  assert.equal(result.rows[1].rowNumber, 3);
});

test('CSV parser supports quoted commas, escaped quotes, and quoted newlines', () => {
  assert.deepEqual(
    parseCsv('name,phone,email,consent_given\r\n"Doe, Jane",1234567890,"jane ""jd""@example.com","true"\r\n"Line 1\nLine 2",0987654321,,false'),
    [
      ['name', 'phone', 'email', 'consent_given'],
      ['Doe, Jane', '1234567890', 'jane "jd"@example.com', 'true'],
      ['Line 1\nLine 2', '0987654321', '', 'false'],
    ],
  );
});

test('customer import requires the exact template headers', () => {
  assert.throws(
    () => validateCustomerImportCsv('Name,phone,email,consent_given\nJane,1234567890,,true'),
    /headers must be exactly/,
  );
});

test('customer import validates creation fields and skips subsequent duplicate phones', () => {
  const result = validateCustomerImportCsv([
    'name,phone,email,consent_given',
    'Jane Doe,1234567890,jane@example.com,true',
    'Duplicate Jane,1234567890,,false',
    'Bad Phone,123,not-an-email,yes',
  ].join('\n'));

  assert.deepEqual(result.counts, { valid: 1, invalid: 1, duplicate: 1 });
  assert.equal(result.rows[0].status, 'valid');
  assert.equal(result.rows[1].status, 'duplicate');
  assert.equal(result.rows[2].status, 'invalid');
  assert.match(result.rows[2].errors.join(' '), /phone must contain exactly 10 digits/);
  assert.match(result.rows[2].errors.join(' '), /email must be valid/);
  assert.match(result.rows[2].errors.join(' '), /consent_given must be true or false/);
});

test('consent values trim whitespace, ignore case, and normalize to booleans', () => {
  assert.equal(parseConsentValue(' true '), true);
  assert.equal(parseConsentValue('TRUE'), true);
  assert.equal(parseConsentValue('\tfalse\n'), false);
  assert.equal(parseConsentValue('FaLsE'), false);

  const result = validateCustomerImportCsv([
    'name,phone,email,consent_given',
    'True Customer,1234567890,, TRUE ',
    'False Customer,1234567891,,false',
  ].join('\n'));

  assert.equal(result.rows[0].consent_given, true);
  assert.equal(result.rows[1].consent_given, false);
  assert.equal(result.counts.valid, 2);
});

test('invalid consent values are rejected and valid consent appears in preview data', () => {
  const result = validateCustomerImportCsv([
    'name,phone,email,consent_given',
    'Valid Customer,1234567890,,true',
    'Invalid Customer,1234567891,,yes',
  ].join('\n'));

  assert.equal(result.rows[0].status, 'valid');
  assert.equal(result.rows[0].consent_given, true);
  assert.equal(result.rows[1].status, 'invalid');
  assert.equal(result.rows[1].consent_given, undefined);
  assert.deepEqual(result.rows[1].errors, ['consent_given must be true or false.']);
});

test('customer export contains records and not the import template example', () => {
  const exportCsv = customersToCsv([customers[0]]);
  const templateCsv = customerImportTemplateToCsv();

  assert.match(exportCsv, /Ada, Lovelace/);
  assert.doesNotMatch(exportCsv, /Example Customer/);
  assert.match(templateCsv, /Example Customer/);
  assert.notEqual(CUSTOMER_EXPORT_FILENAME, CUSTOMER_IMPORT_TEMPLATE_FILENAME);
});

test('malformed CSV input is rejected', () => {
  assert.throws(
    () => parseCsv('name,phone,email,consent_given\n"Unclosed,1234567890,,true'),
    /unclosed quoted field/,
  );
  assert.throws(
    () => parseCsv('name,phone,email,consent_given\n"Closed"unexpected,1234567890,,true'),
    /unexpected content after a quoted field/,
  );
});

test('import confirmation and result helpers support explicit confirmation and outcome display', () => {
  const previewRows = [
    {
      rowNumber: 2,
      status: 'valid',
      name: 'Valid Customer',
      phone: '1234567890',
      email: '',
      consent_given: true,
    },
    {
      rowNumber: 3,
      status: 'duplicate',
      name: 'Duplicate Customer',
      phone: '1234567890',
      email: '',
      consent_given: false,
    },
  ];

  assert.deepEqual(getImportableCustomerRows(previewRows), [
    {
      rowNumber: 2,
      name: 'Valid Customer',
      phone: '1234567890',
      email: '',
      consent_given: true,
    },
  ]);
  assert.equal(
    customerImportConfirmationMessage(1),
    'Import 1 customer into the selected business?',
  );
  assert.equal(
    customerImportResultMessage({ imported: 1, skipped_duplicate: 2, failed: 0 }),
    'Imported: 1 · Skipped duplicates: 2 · Failed: 0',
  );
});

test('Confirm Import enablement requires a business, valid rows, and no active import/result', () => {
  const enabled = {
    importSubmitting: false,
    importResult: null,
    importBusinessId: 'business-1',
    validCount: 3,
  };

  assert.equal(canConfirmCustomerImport(enabled), true);
  assert.equal(canConfirmCustomerImport({ ...enabled, importBusinessId: '' }), false);
  assert.equal(canConfirmCustomerImport({ ...enabled, validCount: 0 }), false);
  assert.equal(canConfirmCustomerImport({ ...enabled, importSubmitting: true }), false);
  assert.equal(canConfirmCustomerImport({ ...enabled, importResult: { summary: {} } }), false);
});
