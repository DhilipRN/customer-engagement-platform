import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageSender } from '../src/services/messageSender.js';

const message = {
  id: 'message-1',
  business_id: 'business-1',
  message_text: 'Appointment reminder',
  metadata: { source: 'appointment_reminder' },
};

test('uses the simulated sender when a business has no WhatsApp configuration', async () => {
  let simulatedCalls = 0;
  const sender = createMessageSender({
    simulatedSender: { async send(value) { simulatedCalls += 1; assert.equal(value, message); return { success: true, status: 'sent' }; } },
    getBusinessProviderConfig: async (businessId) => { assert.equal(businessId, 'business-1'); return null; },
  });

  const result = await sender.send(message);
  assert.equal(simulatedCalls, 1);
  assert.equal(result.success, true);
});

test('routes configured businesses to WhatsApp and stores the provider message ID', async () => {
  let simulatedCalls = 0;
  let request;
  const sender = createMessageSender({
    simulatedSender: { async send() { simulatedCalls += 1; return { success: true }; } },
    whatsappClient: { async send(value) { request = value; return { success: true, provider: 'whatsapp', providerMessageId: 'wamid.3', status: 'sent' }; } },
    getBusinessProviderConfig: async () => ({ phoneNumberId: 'phone-1', accessToken: 'token-1' }),
  });

  const result = await sender.send(message, { to: '+15551234567' });
  assert.equal(simulatedCalls, 0);
  assert.equal(request.to, '+15551234567');
  assert.equal(request.payload.type, 'text');
  assert.equal(result.metadata.providerMessageId, 'wamid.3');
  assert.equal(message.metadata.providerMessageId, 'wamid.3');
});

test('returns provider failures without silently re-simulating the message', async () => {
  let simulatedCalls = 0;
  const sender = createMessageSender({
    simulatedSender: { async send() { simulatedCalls += 1; return { success: true }; } },
    whatsappClient: { async send() { return { success: false, provider: 'whatsapp', status: 'failed', code: 131026, error: 'Recipient cannot be reached.' }; } },
    getBusinessProviderConfig: async () => ({ phoneNumberId: 'phone-1', accessToken: 'token-1' }),
  });

  const result = await sender.send(message, { to: '+15551234567' });
  assert.equal(result.success, false);
  assert.equal(result.code, 131026);
  assert.equal(simulatedCalls, 0);
});
