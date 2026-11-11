import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNewPatientPayload,
  createAppointmentCustomerLookup,
  findPatientsByPhone,
  getAppointmentCustomer,
  normalizePhoneNumber,
  selectAppointmentPatient,
} from '../src/appointmentPatient.js';
import {
  formatReminderTiming,
  getReminderDisplay,
  indexReminderStatuses,
} from '../src/appointmentReminders.js';

const BUSINESS_ID = 'business-a';
const OTHER_BUSINESS_ID = 'business-b';

const customers = [
  { id: 'patient-1', business_id: BUSINESS_ID, name: 'Ada Lovelace', phone: '(987) 654-3210' },
  { id: 'patient-2', business_id: BUSINESS_ID, name: 'Ada Byron', phone: '9876543210' },
  { id: 'patient-3', business_id: OTHER_BUSINESS_ID, name: 'Other Clinic', phone: '9876543210' },
];

test('patient phone lookup normalizes punctuation and preserves business isolation', () => {
  assert.equal(normalizePhoneNumber('(987) 654-3210'), '9876543210');
  assert.deepEqual(
    findPatientsByPhone(customers, BUSINESS_ID, '987-654-3210').map((patient) => patient.id),
    ['patient-1', 'patient-2'],
  );
  assert.deepEqual(findPatientsByPhone(customers, OTHER_BUSINESS_ID, '9876543210').map((patient) => patient.id), ['patient-3']);
});

test('patient lookup returns every match and no cross-business records', () => {
  assert.equal(findPatientsByPhone(customers, BUSINESS_ID, '9876543210').length, 2);
  assert.deepEqual(findPatientsByPhone(customers, BUSINESS_ID, '5555555555'), []);
  assert.deepEqual(findPatientsByPhone(customers, '', '9876543210'), []);
});

test('customer lookup normalizes the query without changing the matched phone format', () => {
  const matches = findPatientsByPhone(customers, BUSINESS_ID, '(987) 654-3210');

  assert.equal(matches[0].name, 'Ada Lovelace');
  assert.equal(matches[0].phone, '(987) 654-3210');
});

test('inline patient creation preserves consent and selects the new patient without losing appointment details', () => {
  const payload = buildNewPatientPayload({
    name: 'New Patient',
    phone: '(555) 123-4567',
    email: 'new@example.com',
    consent_given: false,
  }, BUSINESS_ID);

  assert.deepEqual(payload, {
    name: 'New Patient',
    phone: '5551234567',
    email: 'new@example.com',
    consent_given: false,
    business_id: BUSINESS_ID,
  });

  const appointment = {
    business_id: BUSINESS_ID,
    appointment_date: '2026-11-05',
    appointment_time: '09:30',
    appointment_type: 'Consultation',
    reminder_enabled: true,
    reminder_minutes: 1440,
    template_id: 'template-1',
    customer_id: '',
  };

  assert.deepEqual(
    selectAppointmentPatient(appointment, { id: 'new-patient' }),
    { ...appointment, customer_id: 'new-patient' },
  );
});

test('appointment reload resolves the customer by business and customer ids', () => {
  const lookup = createAppointmentCustomerLookup([
    { id: 'same-id', business_id: BUSINESS_ID, name: 'Business A Patient' },
    { id: 'same-id', business_id: OTHER_BUSINESS_ID, name: 'Business B Patient' },
  ]);

  assert.equal(
    getAppointmentCustomer(
      { business_id: BUSINESS_ID, customer_id: 'same-id' },
      lookup,
    ).name,
    'Business A Patient',
  );
  assert.equal(
    getAppointmentCustomer(
      { business_id: 'unavailable-business', customer_id: 'same-id' },
      lookup,
    ),
    null,
  );
});

test('appointment reminder display uses recorded statuses without inferring delivery', () => {
  const appointment = {
    id: 'appointment-1',
    reminder_enabled: true,
    reminder_minutes: 1440,
  };
  const statuses = indexReminderStatuses([
    {
      appointment_id: 'appointment-1',
      status: 'sent',
      scheduled_at: '2026-11-04T09:30:00.000Z',
      sent_at: '2026-11-04T09:30:03.000Z',
    },
  ]);

  assert.deepEqual(getReminderDisplay(appointment, statuses), {
    status: 'sent',
    timestamp: '2026-11-04T09:30:03.000Z',
    timestampLabel: 'Sent',
  });
  assert.equal(
    getReminderDisplay({ ...appointment, id: 'appointment-2' }, statuses).status,
    'Configured',
  );
  assert.equal(
    getReminderDisplay({ ...appointment, reminder_enabled: false }, statuses).status,
    'Disabled',
  );
  assert.equal(formatReminderTiming(1440), '1 day before');
  assert.equal(formatReminderTiming(120), '2 hours before');
});
