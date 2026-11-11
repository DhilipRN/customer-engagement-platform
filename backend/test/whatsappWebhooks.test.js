import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const MESSAGE_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';

function createWebhookApp({ message, customer, activityEvents = [] } = {}) {
  const row = message ?? {
    id: MESSAGE_ID,
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    status: 'sent',
    metadata: { providerMessageId: 'wamid.sent-1' },
  };
  const updates = [];
  const created = [];
  const messageService = {
    async findByProviderMessageId(providerMessageId) {
      return {
        data: row.metadata?.providerMessageId === providerMessageId ? row : null,
        error: null,
      };
    },
    async update(id, values, businessId) {
      updates.push({ id, values, businessId });
      Object.assign(row, values);
      return { data: row, error: null };
    },
    async create(values) {
      created.push(values);
      return { data: { id: 'incoming-1', ...values }, error: null };
    },
  };
  const app = createApp({
    messageService,
    customerService: {
      async findByBusinessIdAndPhone(businessId, phone) {
        return businessId === BUSINESS_ID && phone === '+15551234567'
          ? { data: customer ?? { id: CUSTOMER_ID, business_id: BUSINESS_ID }, error: null }
          : { data: null, error: null };
      },
    },
    activityEventService: {
      async create(event) {
        activityEvents.push(event);
        return { data: { id: `event-${activityEvents.length}` }, error: null };
      },
    },
    getBusinessIdForPhoneNumberId: async (phoneNumberId) =>
      phoneNumberId === 'phone-number-1' ? BUSINESS_ID : null,
    authMiddleware: (_request, response) => response.status(401).json({ error: 'JWT should not be required.' }),
  });

  return { app, updates, created, row, activityEvents };
}

async function withServer(harness, callback) {
  const server = harness.app.listen();
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, harness);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function waitForProcessing() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

test('GET webhook handshake returns the challenge for a valid verify token', async () => {
  const harness = createWebhookApp();
  await withServer(harness, async (url) => {
    const response = await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=connectly-development-webhook-token&hub.challenge=challenge-123`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'challenge-123');
  });
});

test('GET webhook handshake rejects an invalid verify token', async () => {
  const harness = createWebhookApp();
  await withServer(harness, async (url) => {
    const response = await fetch(`${url}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`);
    assert.equal(response.status, 403);
  });
});

test('POST webhook parses delivered status and updates the matching message', async () => {
  const harness = createWebhookApp();
  await withServer(harness, async (url) => {
    const response = await fetch(`${url}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.sent-1', status: 'delivered', recipient_id: '+15551234567' }] } }] }] }),
    });
    assert.equal(response.status, 200);
    await waitForProcessing();
    assert.equal(harness.updates[0].values.status, 'delivered');
    assert.equal(harness.activityEvents[0].event_type, 'message.delivered');
  });
});

test('POST webhook parses read status', async () => {
  const harness = createWebhookApp();
  await withServer(harness, async (url) => {
    await fetch(`${url}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.sent-1', status: 'read', recipient_id: '+15551234567' }] } }] }] }),
    });
    await waitForProcessing();
    assert.equal(harness.updates[0].values.status, 'read');
    assert.equal(harness.activityEvents[0].event_type, 'message.read');
  });
});

test('POST webhook records an incoming customer message for the mapped business', async () => {
  const harness = createWebhookApp();
  await withServer(harness, async (url) => {
    const response = await fetch(`${url}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: 'phone-number-1' },
              messages: [{
                from: '+15551234567',
                id: 'wamid.inbound-1',
                timestamp: '1760000000',
                type: 'text',
                text: { body: 'I need to reschedule.' },
              }],
            },
          }],
        }],
      }),
    });
    assert.equal(response.status, 200);
    await waitForProcessing();
    assert.equal(harness.created.length, 1);
    assert.deepEqual(harness.created[0], {
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      message_text: 'I need to reschedule.',
      status: 'delivered',
      source: 'whatsapp_inbound',
      sent_at: '2025-10-09T08:53:20.000Z',
      metadata: {
        providerMessageId: 'wamid.inbound-1',
        channel: 'whatsapp',
        receivedAt: '2025-10-09T08:53:20.000Z',
      },
    });
  });
});

test('POST webhook records an incoming appointment button reply and confirmation activity', async () => {
  const harness = createWebhookApp();
  const appointmentId = '1b2b4e6d-5964-4f66-9b1b-c3b9fa6f6b55';
  await withServer(harness, async (url) => {
    const response = await fetch(`${url}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: 'phone-number-1' },
              messages: [{
                from: '+15551234567',
                id: 'wamid.button-reply-1',
                timestamp: '1760000000',
                type: 'interactive',
                interactive: {
                  type: 'button_reply',
                  button_reply: {
                    id: `CONFIRM_APPT_${appointmentId}`,
                    title: 'Confirm Appointment',
                  },
                },
              }],
            },
          }],
        }],
      }),
    });
    assert.equal(response.status, 200);
    await waitForProcessing();
    assert.equal(harness.created[0].message_text, 'Confirm Appointment');
    assert.equal(harness.created[0].metadata.buttonReplyId, `CONFIRM_APPT_${appointmentId}`);
    assert.equal(harness.created[0].metadata.buttonReplyTitle, 'Confirm Appointment');
    assert.equal(harness.activityEvents.at(-1).event_type, 'appointment.confirmed');
    assert.equal(harness.activityEvents.at(-1).entity_id, appointmentId);
  });
});
