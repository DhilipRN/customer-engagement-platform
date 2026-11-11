import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppCloudClient } from '../src/services/whatsappCloudClient.js';

const request = {
  phoneNumberId: 'phone-number-1',
  accessToken: 'secret-token',
  to: '+15551234567',
};

test('formats template messages and normalizes successful Meta responses', async () => {
  let call;
  const client = createWhatsAppCloudClient({
    fetchImpl: async (url, options) => {
      call = { url, options };
      return { ok: true, async json() { return { messages: [{ id: 'wamid.1' }] }; } };
    },
  });

  const result = await client.send({
    ...request,
    payload: {
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Alex' }] }],
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, 'wamid.1');
  assert.equal(result.provider, 'whatsapp');
  assert.equal(JSON.parse(call.options.body).type, 'template');
  assert.equal(JSON.parse(call.options.body).template.name, 'appointment_reminder');
  assert.match(call.options.headers.Authorization, /secret-token/);
});

test('formats successful text messages', async () => {
  let body;
  const client = createWhatsAppCloudClient({
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { messages: [{ id: 'wamid.2' }] }; } };
    },
  });

  const result = await client.send({
    ...request,
    payload: { type: 'text', text: { body: 'Hello from Connectly' } },
  });

  assert.equal(result.success, true);
  assert.equal(body.type, 'text');
  assert.equal(body.text.body, 'Hello from Connectly');
});

test('formats template and direct interactive buttons for Meta', async () => {
  const bodies = [];
  const client = createWhatsAppCloudClient({
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, async json() { return { messages: [{ id: 'wamid.button' }] }; } };
    },
  });

  await client.send({
    ...request,
    payload: {
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'en' },
        buttons: [{ type: 'quick_reply', text: 'Confirm', payload: 'CONFIRM_APPT_1' }],
      },
    },
  });
  await client.send({
    ...request,
    payload: {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Please confirm' },
        action: { buttons: [{ id: 'CONFIRM_APPT_1', title: 'Confirm' }] },
      },
    },
  });

  assert.deepEqual(bodies[0].template.components, [{
    type: 'button',
    sub_type: 'quick_reply',
    index: '0',
    parameters: [{ type: 'payload', payload: 'CONFIRM_APPT_1' }],
  }]);
  assert.deepEqual(bodies[1].interactive.action.buttons, [{
    type: 'reply',
    reply: { id: 'CONFIRM_APPT_1', title: 'Confirm' },
  }]);
});

test('returns sanitized Meta API errors without leaking the access token', async () => {
  const token = 'secret-token-value';
  const client = createWhatsAppCloudClient({
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() {
        return { error: { code: 190, message: `Invalid OAuth access_token=${token}` } };
      },
    }),
  });

  const result = await client.send({
    ...request,
    accessToken: token,
    payload: { type: 'text', text: { body: 'Hello' } },
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 190);
  assert.match(result.error, /Invalid OAuth/);
  assert.doesNotMatch(result.error, new RegExp(token));
});
