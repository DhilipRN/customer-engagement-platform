import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduledCampaignProcessor } from '../src/services/scheduledCampaignProcessor.js';
import { createScheduledAppointmentReminderProcessor } from '../src/services/scheduledAppointmentReminderProcessor.js';

const BUSINESS_ID = 'business-1';
const CUSTOMER_ID = 'customer-1';
const TEMPLATE_ID = 'template-1';

function createFakeActivityEventService(events) {
  return {
    async create(event) {
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

function createSupabaseClient({ campaign = false } = {}) {
  const queuedMessages = [];
  const queuedMessage = {
    id: 'message-1',
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
  };
  const appointment = {
    id: 'appointment-1',
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    appointment_date: '2026-10-16',
    appointment_time: '10:00:00',
    reminder_enabled: true,
    reminder_minutes: 1440,
    template_id: TEMPLATE_ID,
    status: 'scheduled',
  };

  const client = {
    from(table) {
      let result = table === 'campaigns'
        ? { data: campaign ? [{ id: 'campaign-1', business_id: BUSINESS_ID, template_id: TEMPLATE_ID }]: [], error: null }
        : table === 'message_templates'
          ? { data: { id: TEMPLATE_ID, business_id: BUSINESS_ID, message: 'Hello {{customer_name}}', metadata: { meta_template_name: 'appointment_reminder', language: 'en', header: 'Appointment', footer: 'Reply to confirm', buttons: [{ type: 'quick_reply', text: 'Confirm Appointment' }] } }, error: null }
          : table === 'customers'
            ? { data: [{ id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer', consent_given: true }], error: null }
            : table === 'appointments'
              ? { data: [appointment], error: null }
              : table === 'businesses'
                ? { data: { id: BUSINESS_ID, name: 'Business' }, error: null }
                : { data: [], error: null };

      const chain = {
        select() { return chain; },
        eq() { return chain; },
        not() { return chain; },
        lte() { return chain; },
        order() { return chain; },
        maybeSingle() {
          return Promise.resolve({
            data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
            error: result.error,
          });
        },
        single() {
          return Promise.resolve({
            data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
            error: result.error,
          });
        },
        insert(values) {
          if (table === 'messages') {
            queuedMessages.push(values);
            result = { data: { ...queuedMessage, ...values }, error: null };
          }
          return chain;
        },
        update(values) {
          if (table === 'campaigns') {
            result = { data: { id: 'campaign-1', business_id: BUSINESS_ID, status: values.status }, error: null };
          }
          return chain;
        },
        then(resolve, reject) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return chain;
    },
  };
  client.queuedMessages = queuedMessages;
  return client;
}

test('scheduled campaign queueing records a system message.queued event', async () => {
  const events = [];
  const processor = createScheduledCampaignProcessor(
    createSupabaseClient({ campaign: true }),
    createFakeActivityEventService(events),
  );

  const results = await processor.processDueCampaigns('2026-10-15T10:00:00.000Z');

  assert.equal(results[0].status, 'running', JSON.stringify(results));
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'message.queued');
  assert.equal(events[0].actor_type, 'system');
  assert.equal(events[0].business_id, BUSINESS_ID);
  assert.equal(events[0].metadata.source, 'campaign');
});

test('appointment reminder queueing records a system message.queued event', async () => {
  const events = [];
  const supabase = createSupabaseClient();
  const processor = createScheduledAppointmentReminderProcessor(
    supabase,
    createFakeActivityEventService(events),
  );

  const results = await processor.processDueAppointmentReminders('2026-10-15T10:00:00.000Z');

  assert.equal(results[0].status, 'queued');
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'message.queued');
  assert.equal(events[0].actor_user_id, null);
  assert.equal(events[0].visibility, 'audit_only');
  assert.equal(events[0].metadata.source, 'appointment_reminder');
  assert.equal(supabase.queuedMessages[0].metadata.meta_template_name, 'appointment_reminder');
  assert.equal(supabase.queuedMessages[0].metadata.buttons[0].payload, 'CONFIRM_APPT_appointment-1');
});
