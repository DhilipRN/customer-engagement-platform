import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCustomersForSearch } from '../src/customerCsv.js';
import {
  DEFAULT_CUSTOMER_SORT_DIRECTION,
  DEFAULT_CUSTOMER_SORT_KEY,
  filterCustomersByActivity,
  formatCustomerActivityDate,
  formatInactiveDays,
  formatNextAppointment,
  getCustomerInitials,
  getCustomerListingColumns,
  getInactiveStatus,
  nextCustomerSort,
  summarizeCustomerActivity,
  sortCustomers,
} from '../src/customerActivity.js';
import {
  buildCustomerAppointmentsUrl,
  buildCustomerDetailsUrl,
  buildCustomerTimelineUrl,
  formatAppointmentTime,
  formatTimelineTime,
  getCustomerDetailsDisplay,
  getMessageHistoryDisplay,
  splitCustomerAppointments,
} from '../src/customerDetails.js';

const customers = [
  {
    name: 'Zoe',
    phone: '2000000000',
    email: 'zoe@example.com',
    consent_given: false,
    last_purchase_date: '2026-01-10',
    last_completed_appointment_date: '2026-02-10',
    inactive_days: 30,
    created_at: '2026-01-03T00:00:00.000Z',
  },
  {
    name: 'Alice',
    phone: '1000000000',
    email: 'alice@example.com',
    consent_given: true,
    last_purchase_date: '2026-03-10',
    last_completed_appointment_date: null,
    inactive_days: 90,
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    name: 'Mia',
    phone: '3000000000',
    email: '',
    consent_given: true,
    last_purchase_date: null,
    last_completed_appointment_date: null,
    inactive_days: null,
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

test('customer activity sorting handles every sortable column in both directions', () => {
  const expectedAscending = {
    name: ['Alice', 'Mia', 'Zoe'],
    phone: ['Alice', 'Zoe', 'Mia'],
    email: ['Alice', 'Zoe', 'Mia'],
    consent_given: ['Zoe', 'Alice', 'Mia'],
    last_purchase_date: ['Zoe', 'Alice', 'Mia'],
    last_completed_appointment_date: ['Zoe', 'Alice', 'Mia'],
    inactive_days: ['Zoe', 'Alice', 'Mia'],
    created_at: ['Mia', 'Alice', 'Zoe'],
  };
  const expectedDescending = {
    name: ['Zoe', 'Mia', 'Alice'],
    phone: ['Mia', 'Zoe', 'Alice'],
    email: ['Zoe', 'Alice', 'Mia'],
    consent_given: ['Alice', 'Mia', 'Zoe'],
    last_purchase_date: ['Alice', 'Zoe', 'Mia'],
    last_completed_appointment_date: ['Zoe', 'Alice', 'Mia'],
    inactive_days: ['Alice', 'Zoe', 'Mia'],
    created_at: ['Zoe', 'Alice', 'Mia'],
  };

  for (const [key, names] of Object.entries(expectedAscending)) {
    assert.deepEqual(sortCustomers(customers, key, 'asc').map((customer) => customer.name), names);
    assert.deepEqual(
      sortCustomers(customers, key, 'desc').map((customer) => customer.name),
      expectedDescending[key],
    );
  }
});

test('default customer sort is created date newest first and can be restored', () => {
  assert.equal(DEFAULT_CUSTOMER_SORT_KEY, 'created_at');
  assert.equal(DEFAULT_CUSTOMER_SORT_DIRECTION, 'desc');
  assert.deepEqual(
    sortCustomers(customers, DEFAULT_CUSTOMER_SORT_KEY, DEFAULT_CUSTOMER_SORT_DIRECTION)
      .map((customer) => customer.name),
    ['Zoe', 'Alice', 'Mia'],
  );
});

test('customer email listing column is hidden by default and shown when selected', () => {
  const hiddenColumns = getCustomerListingColumns();
  const visibleColumns = getCustomerListingColumns(true);

  assert.equal(hiddenColumns.includes('email'), false);
  assert.equal(visibleColumns.includes('email'), true);
  assert.deepEqual(
    visibleColumns.filter((column) => column !== 'email'),
    hiddenColumns,
  );
});

test('customer details lookup preserves business context and safe display fallbacks', () => {
  assert.equal(
    buildCustomerDetailsUrl({ id: 'patient/1', business_id: 'business & 1' }),
    'http://localhost:3000/customers/patient%2F1?business_id=business%20%26%201',
  );
  assert.deepEqual(
    getCustomerDetailsDisplay({
      name: 'Asha Patient',
      phone: '+91 90000 00000',
      email: 'asha@example.com',
      consent_given: true,
      created_at: '2026-10-26T00:00:00.000Z',
    }),
    {
      name: 'Asha Patient',
      phone: '+91 90000 00000',
      email: 'asha@example.com',
      consent: 'Given',
      registered: '2026-10-26T00:00:00.000Z',
    },
  );
  assert.deepEqual(getCustomerDetailsDisplay(null), {
    name: '—',
    phone: '—',
    email: '—',
    consent: 'Not given',
    registered: null,
  });
});

test('customer appointment details keep business scope and split upcoming from past statuses', () => {
  assert.equal(
    buildCustomerAppointmentsUrl({ id: 'patient/1', business_id: 'business & 1' }),
    'http://localhost:3000/appointments?business_id=business%20%26%201&customer_id=patient%2F1',
  );

  const sections = splitCustomerAppointments([
    { id: 'future', appointment_date: '2026-11-01', appointment_time: '09:30', status: 'scheduled' },
    { id: 'past', appointment_date: '2026-10-01', appointment_time: '09:30', status: 'scheduled' },
    { id: 'completed', appointment_date: '2026-10-20', appointment_time: '09:30', status: 'completed' },
    { id: 'cancelled', appointment_date: '2026-11-02', appointment_time: '09:30', status: 'cancelled' },
    { id: 'no-show', appointment_date: '2026-11-03', appointment_time: '09:30', status: 'no_show' },
  ], new Date('2026-10-26T00:00:00.000Z'));

  assert.deepEqual(sections.upcoming.map((appointment) => appointment.id), ['future']);
  assert.deepEqual(
    sections.past.map((appointment) => appointment.id),
    ['past', 'completed', 'cancelled', 'no-show'],
  );
  assert.equal(formatAppointmentTime('09:30:00'), '09:30');
  assert.equal(formatAppointmentTime(null), 'Time unavailable');
});

test('customer message history uses the business-scoped timeline and includes activity events', () => {
  assert.equal(
    buildCustomerTimelineUrl({ id: 'patient/1', business_id: 'business & 1' }),
    'http://localhost:3000/customers/patient%2F1/timeline?business_id=business%20%26%201&page=1&limit=50',
  );

  assert.deepEqual(
    getMessageHistoryDisplay({
      type: 'message',
      timestamp: '2026-10-26T09:30:00.000Z',
      message: {
        message_text: 'Appointment reminder',
        source: 'appointment_reminder',
        status: 'sent',
      },
    }),
    {
      content: 'Appointment reminder',
      channel: 'appointment_reminder',
      status: 'sent',
      timestamp: '2026-10-26T09:30:00.000Z',
    },
  );
  assert.deepEqual(
    getMessageHistoryDisplay({
      type: 'activity',
      label: 'Review Request Sent',
      timestamp: '2026-10-26T10:00:00.000Z',
      activity: { metadata: { status: 'sent' } },
    }),
    {
      content: 'Review Request Sent',
      channel: 'Activity',
      status: 'sent',
      timestamp: '2026-10-26T10:00:00.000Z',
    },
  );
  assert.match(formatTimelineTime('2026-10-26T09:30:00.000Z'), /9:30|09:30/);
});

test('header sorting cycles through ascending, descending, and default sort', () => {
  const ascending = nextCustomerSort('name', '', 'desc');
  assert.deepEqual(ascending, { sortKey: 'name', sortDirection: 'asc' });

  const descending = nextCustomerSort('name', ascending.sortKey, ascending.sortDirection);
  assert.deepEqual(descending, { sortKey: 'name', sortDirection: 'desc' });

  const defaultSort = nextCustomerSort('name', descending.sortKey, descending.sortDirection);
  assert.deepEqual(defaultSort, {
    sortKey: '',
    sortDirection: DEFAULT_CUSTOMER_SORT_DIRECTION,
  });
});

test('activity filters combine with search and preserve the full result before pagination', () => {
  const searched = filterCustomersForSearch(customers, 'example.com');
  const filtered = filterCustomersByActivity(searched, 'inactive_30');
  const sorted = sortCustomers(filtered, 'name', 'asc');

  assert.deepEqual(sorted.map((customer) => customer.name), ['Alice', 'Zoe']);
  assert.equal(sorted.length, 2);
});

test('activity quick filters identify never active and consented customers', () => {
  assert.deepEqual(
    filterCustomersByActivity(customers, 'inactive_90').map((customer) => customer.name),
    ['Alice'],
  );
  assert.deepEqual(
    filterCustomersByActivity(customers, 'never_active').map((customer) => customer.name),
    ['Mia'],
  );
  assert.deepEqual(
    filterCustomersByActivity(customers, 'consent_given').map((customer) => customer.name),
    ['Alice', 'Mia'],
  );
});

test('upcoming appointment filters and sorting use the next appointment only', () => {
  const withAppointments = [
    { name: 'Soon', inactive_days: 2, next_appointment_date: '2026-11-01', next_appointment_time: '09:30:00' },
    { name: 'Later', inactive_days: 20, next_appointment_date: '2026-11-02', next_appointment_time: '08:00:00' },
    { name: 'None', inactive_days: null, next_appointment_date: null, next_appointment_time: null },
  ];

  assert.deepEqual(
    filterCustomersByActivity(withAppointments, 'upcoming_appointment').map((customer) => customer.name),
    ['Soon', 'Later'],
  );
  assert.deepEqual(
    filterCustomersByActivity(withAppointments, 'no_upcoming_appointment').map((customer) => customer.name),
    ['None'],
  );
  assert.deepEqual(
    sortCustomers(withAppointments, 'next_appointment_date', 'asc').map((customer) => customer.name),
    ['Soon', 'Later', 'None'],
  );
  assert.equal(
    formatNextAppointment(withAppointments[0]),
    `${formatCustomerActivityDate('2026-11-01')}, 09:30`,
  );
  assert.equal(formatNextAppointment(withAppointments[2]), 'No upcoming appointment');
});

test('activity values format missing dates and inactive days clearly', () => {
  assert.equal(formatCustomerActivityDate(null), '-');
  assert.match(formatCustomerActivityDate('2026-03-10'), /Mar/);
  assert.match(formatCustomerActivityDate('2026-03-10'), /2026/);
  assert.equal(formatInactiveDays(customers[0]), '30 days');
  assert.equal(formatInactiveDays(customers[2]), 'Never active');
  assert.equal(formatInactiveDays({ inactive_days: -1 }), '0 days');
});

test('activity summaries and status thresholds use the listing rules', () => {
  assert.equal(getInactiveStatus(0), 'active');
  assert.equal(getInactiveStatus(14), 'active');
  assert.equal(getInactiveStatus(15), 'idle');
  assert.equal(getInactiveStatus(29), 'idle');
  assert.equal(getInactiveStatus(30), 'inactive');
  assert.equal(getInactiveStatus(null), 'never');

  assert.deepEqual(summarizeCustomerActivity(customers), {
    total: 3,
    active: 0,
    inactive15to29: 0,
    inactive30: 2,
    neverActive: 1,
  });
  assert.equal(getCustomerInitials('Ada Lovelace'), 'AL');
  assert.equal(getCustomerInitials('Madonna'), 'MA');
  assert.equal(getCustomerInitials(''), '?');
});
