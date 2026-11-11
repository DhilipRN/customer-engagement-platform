import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createActivityEventService,
  validateActivityEvent,
} from '../src/services/activityEvents.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const USER_ID = '2c7d7c1e-fb32-4a57-9f84-6e57b3f1f6d1';
const ENTITY_ID = '1b2b4e6d-5964-4f66-9b1b-c3b9fa6f6b55';

const validEvent = {
  scope_type: 'business',
  business_id: BUSINESS_ID,
  actor_user_id: USER_ID,
  actor_type: 'user',
  event_type: 'customer.updated',
  entity_type: 'customer',
  entity_id: CUSTOMER_ID,
  customer_id: CUSTOMER_ID,
  occurred_at: '2026-10-14T10:00:00.000Z',
  is_reconstructed: false,
  before: { phone: '1234567890', consent_given: false },
  after: { phone: '0987654321', consent_given: true },
  metadata: { operation: 'update' },
  visibility: 'audit_only',
};

function createFakeSupabase(result, calls, { throwOnSingle = false } = {}) {
  const query = {
    insert(values) {
      calls.push(['insert', values]);
      return query;
    },
    select(columns) {
      calls.push(['select', columns]);
      return query;
    },
    single() {
      if (throwOnSingle) throw new Error('database unavailable');
      return Promise.resolve(result);
    },
  };

  return {
    from(table) {
      calls.push(['from', table]);
      return query;
    },
  };
}

test('activity event service records validated fields and excludes generated fields', async () => {
  const calls = [];
  const row = { id: ENTITY_ID, ...validEvent, recorded_at: '2026-10-14T10:01:00.000Z' };
  const service = createActivityEventService(
    createFakeSupabase({ data: row, error: null }, calls)
  );

  const result = await service.create(validEvent);

  assert.deepEqual(result.data, row);
  assert.equal(calls[0][0], 'from');
  assert.deepEqual(calls[1], ['insert', validEvent]);
  assert.deepEqual(calls[2], ['select', '*']);
});

test('activity event validation supports platform events without a business', () => {
  const result = validateActivityEvent({
    ...validEvent,
    scope_type: 'platform',
    business_id: null,
    actor_type: 'system',
    actor_user_id: null,
    visibility: 'audit_only',
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.values.business_id, null);
});

test('business-created audit events allow google review links', () => {
  const result = validateActivityEvent({
    ...validEvent,
    event_type: 'business.created',
    entity_type: 'business',
    entity_id: BUSINESS_ID,
    customer_id: null,
    before: null,
    after: {
      name: 'Sunset Bakery',
      google_review_link: 'https://example.com/reviews',
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.values.after.google_review_link, 'https://example.com/reviews');
});

test('business-updated audit events allow google review links in before and after', () => {
  const result = validateActivityEvent({
    ...validEvent,
    event_type: 'business.updated',
    entity_type: 'business',
    entity_id: BUSINESS_ID,
    customer_id: null,
    before: { google_review_link: 'https://example.com/old-reviews' },
    after: { google_review_link: 'https://example.com/new-reviews' },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.values.before.google_review_link, 'https://example.com/old-reviews');
  assert.equal(result.values.after.google_review_link, 'https://example.com/new-reviews');
});

test('business audit events still reject unknown business fields', () => {
  const result = validateActivityEvent({
    ...validEvent,
    event_type: 'business.created',
    entity_type: 'business',
    entity_id: BUSINESS_ID,
    customer_id: null,
    before: null,
    after: { tax_registration_number: 'not-allowed' },
  });

  assert.equal(result.values, null);
  assert.match(result.errors.join(' '), /tax_registration_number/);
});

test('message-template creation audit payloads allow validated metadata', () => {
  const result = validateActivityEvent({
    ...validEvent,
    event_type: 'message_template.created',
    entity_type: 'message_template',
    before: null,
    after: {
      name: 'Appointment reminder',
      category: 'transactional',
      message: 'Hi {{customer_name}}',
      metadata: {
        meta_category: 'utility',
        meta_template_name: 'appointment_reminder_v1',
        language: 'en',
        header: 'Appointment reminder',
        footer: 'Reply for help',
        buttons: [{ type: 'quick_reply', text: 'Confirm appointment' }],
      },
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.values.after.metadata.buttons[0].text, 'Confirm appointment');
});

test('message-template update audit payloads allow metadata in before and after', () => {
  const result = validateActivityEvent({
    ...validEvent,
    event_type: 'message_template.updated',
    entity_type: 'message_template',
    before: {
      metadata: { language: 'en', buttons: [{ type: 'quick_reply', text: 'Confirm' }] },
    },
    after: {
      metadata: { language: 'hi', buttons: [{ type: 'cta', text: 'Call clinic', url: 'https://example.com' }] },
    },
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.values.after.metadata.language, 'hi');
});

test('activity event validation rejects invalid scope, identity, names, visibility, and payload fields', async () => {
  const calls = [];
  const service = createActivityEventService(
    createFakeSupabase({ data: null, error: null }, calls)
  );
  const result = await service.create({
    ...validEvent,
    scope_type: 'platform',
    business_id: BUSINESS_ID,
    actor_type: 'robot',
    entity_id: 'not-a-uuid',
    event_type: '',
    visibility: 'public',
    metadata: { access_token: 'must-not-be-stored' },
  });

  assert.equal(result.data, null);
  assert.equal(result.error.code, 'VALIDATION_ERROR');
  assert.match(result.error.message, /scope_type|actor_type|entity_id|event_type|visibility|access_token/);
  assert.deepEqual(calls, []);
});

test('activity event validation rejects non-JSON payload values', () => {
  const result = validateActivityEvent({
    ...validEvent,
    metadata: { amount: Number.NaN },
  });

  assert.equal(result.values, null);
  assert.match(result.errors.join(' '), /non-finite number/);
});

test('activity event service returns database errors explicitly', async () => {
  const databaseError = { code: '42501', message: 'permission denied' };
  const calls = [];
  const service = createActivityEventService(
    createFakeSupabase({ data: null, error: databaseError }, calls)
  );

  const result = await service.create(validEvent);

  assert.deepEqual(result, { data: null, error: databaseError });
});

test('activity event service converts rejected database calls into explicit errors', async () => {
  const calls = [];
  const service = createActivityEventService(
    createFakeSupabase(null, calls, { throwOnSingle: true })
  );

  const result = await service.create(validEvent);

  assert.equal(result.data, null);
  assert.equal(result.error.message, 'database unavailable');
});
