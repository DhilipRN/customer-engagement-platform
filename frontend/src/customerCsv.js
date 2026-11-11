export const CUSTOMER_CSV_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'consent_given', label: 'Consent Given' },
  { key: 'created_at', label: 'Created At' },
];

export const CUSTOMER_IMPORT_TEMPLATE_COLUMNS = [
  { key: 'name', label: 'name' },
  { key: 'phone', label: 'phone' },
  { key: 'email', label: 'email' },
  { key: 'consent_given', label: 'consent_given' },
];

export const CUSTOMER_EXPORT_FILENAME = 'customers-export.csv';
export const CUSTOMER_IMPORT_TEMPLATE_FILENAME = 'customer-import-template.csv';

const CUSTOMER_IMPORT_HEADERS = CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map(
  (column) => column.label
);

function protectSpreadsheetFormula(value) {
  const text = String(value ?? '');

  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function escapeCsvValue(value) {
  const text = protectSpreadsheetFormula(value);
  const escaped = text.replaceAll('"', '""');

  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function filterCustomersForSearch(customers, searchTerm) {
  const search = String(searchTerm ?? '').trim().toLowerCase();

  if (!search) return customers;

  return customers.filter((customer) => (
    String(customer.name || '').toLowerCase().includes(search) ||
    String(customer.phone || '').toLowerCase().includes(search) ||
    String(customer.email || '').toLowerCase().includes(search) ||
    String(customer.businessName || '').toLowerCase().includes(search) ||
    (customer.consent_given ? 'yes' : 'no').includes(search)
  ));
}

export function customersToCsv(customers) {
  return rowsToCsv(CUSTOMER_CSV_COLUMNS, customers ?? []);
}

export function customerImportTemplateToCsv() {
  return rowsToCsv(CUSTOMER_IMPORT_TEMPLATE_COLUMNS, [
    {
      name: 'Example Customer',
      phone: '9876543210',
      email: 'example.customer@example.com',
      consent_given: false,
    },
  ]);
}

export function parseCsv(csvText) {
  const text = String(csvText ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote) {
      if (character === ',') {
        row.push(field);
        field = '';
        closedQuote = false;
      } else if (character === '\r' || character === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        closedQuote = false;
        if (character === '\r' && text[index + 1] === '\n') index += 1;
      } else {
        throw new Error('Malformed CSV: unexpected content after a quoted field.');
      }
      continue;
    }

    if (character === '"') {
      if (field !== '') {
        throw new Error('Malformed CSV: quoted fields must start at a field boundary.');
      }
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error('Malformed CSV: unclosed quoted field.');
  }

  if (closedQuote || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function parseConsentValue(value) {
  const normalizedValue = String(value ?? '').trim().toLowerCase();

  if (normalizedValue === 'true') return true;
  if (normalizedValue === 'false') return false;
  return null;
}

function validateImportRow(values, rowNumber) {
  const errors = [];
  const name = String(values[0] ?? '').trim();
  const phone = String(values[1] ?? '').trim();
  const email = String(values[2] ?? '').trim();
  const consentGiven = parseConsentValue(values[3]);

  if (!name) errors.push('name is required.');
  if (!phone) {
    errors.push('phone is required.');
  } else if (!/^\d{10}$/.test(phone)) {
    errors.push('phone must contain exactly 10 digits.');
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.push('email must be valid.');
  }

  if (consentGiven === null) {
    errors.push('consent_given must be true or false.');
  }

  return {
    rowNumber,
    name,
    phone,
    email,
    consent_given: consentGiven === null ? undefined : consentGiven,
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
  };
}

export function validateCustomerImportCsv(csvText) {
  const rows = parseCsv(csvText);

  if (rows.length === 0 || rows[0].join(',') !== CUSTOMER_IMPORT_HEADERS.join(',')) {
    throw new Error(`CSV headers must be exactly: ${CUSTOMER_IMPORT_HEADERS.join(',')}.`);
  }

  const seenPhones = new Set();
  const previewRows = rows.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    const previewRow = validateImportRow(values, rowNumber);
    previewRow.displayRowNumber = index + 1;

    if (values.length !== CUSTOMER_IMPORT_HEADERS.length) {
      previewRow.status = 'invalid';
      previewRow.errors.push(`Expected ${CUSTOMER_IMPORT_HEADERS.length} columns.`);
    }

    if (previewRow.status === 'valid' && seenPhones.has(previewRow.phone)) {
      previewRow.status = 'duplicate';
      previewRow.errors = ['Duplicate phone number in uploaded file; skipped.'];
    } else if (previewRow.status === 'valid') {
      seenPhones.add(previewRow.phone);
    }

    return previewRow;
  });

  return {
    rows: previewRows,
    counts: {
      valid: previewRows.filter((row) => row.status === 'valid').length,
      invalid: previewRows.filter((row) => row.status === 'invalid').length,
      duplicate: previewRows.filter((row) => row.status === 'duplicate').length,
    },
  };
}

export function getImportableCustomerRows(previewRows) {
  return (previewRows ?? [])
    .filter((row) => row.status === 'valid')
    .map((row) => ({
      rowNumber: row.rowNumber,
      name: row.name,
      phone: row.phone,
      email: row.email,
      consent_given: row.consent_given,
    }));
}

export function customerImportConfirmationMessage(count) {
  return `Import ${count} customer${count === 1 ? '' : 's'} into the selected business?`;
}

export function customerImportResultMessage(summary) {
  return `Imported: ${summary.imported} · Skipped duplicates: ${summary.skipped_duplicate} · Failed: ${summary.failed}`;
}

export function canConfirmCustomerImport({
  importSubmitting,
  importResult,
  importBusinessId,
  validCount,
}) {
  return !importSubmitting &&
    !importResult &&
    Boolean(importBusinessId) &&
    validCount > 0;
}

function rowsToCsv(columns, rows) {
  const header = columns
    .map((column) => escapeCsvValue(column.label))
    .join(',');
  const csvRows = rows.map((row) => columns
    .map((column) => escapeCsvValue(row[column.key]))
    .join(','));

  return `\uFEFF${[header, ...csvRows].join('\r\n')}\r\n`;
}

export function downloadCustomersCsv(customers, filename = CUSTOMER_EXPORT_FILENAME) {
  downloadCsv(customersToCsv(customers), filename);
}

export function downloadCustomerImportTemplate(filename = CUSTOMER_IMPORT_TEMPLATE_FILENAME) {
  downloadCsv(customerImportTemplateToCsv(), filename);
}

function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
