import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessWhatsAppSettings } from '../src/services/businessWhatsAppSettings.js';
import { createMessageSender } from '../src/services/messageSender.js';

const BUSINESS_A = 'business-a';
const BUSINESS_B = 'business-b';

test('retrieves settings with a masked token and no plaintext credential', async () => {
  const settings = createBusinessWhatsAppSettings({
    storage: new Map(),
    whatsappClient: {},
  });
  await settings.updateSettings(BUSINESS_A, {
    phoneNumberId: 'phone-a',
    wabaId: 'waba-a',
    accessToken: 'super-secret-token-1234',
    isEnabled: true,
  });

  const result = await settings.getSettings(BUSINESS_A);
  assert.equal(result.hasToken, true);
  assert.equal(result.maskedToken, '••••••••1234');
  assert.doesNotMatch(JSON.stringify(result), /super-secret-token-1234/);
  assert.equal(result.phoneNumberId, 'phone-a');
  assert.equal(result.wabaId, 'waba-a');
});

test('updates identifiers and preserves the existing token when omitted', async () => {
  const settings = createBusinessWhatsAppSettings({ storage: new Map(), whatsappClient: {} });
  await settings.updateSettings(BUSINESS_A, {
    phoneNumberId: 'phone-a',
    wabaId: 'waba-a',
    accessToken: 'token-a',
    isEnabled: true,
  });

  const updated = await settings.updateSettings(BUSINESS_A, {
    phoneNumberId: 'phone-a-2',
    wabaId: 'waba-a-2',
    accessToken: '',
    isEnabled: false,
  });

  assert.equal(updated.phoneNumberId, 'phone-a-2');
  assert.equal(updated.wabaId, 'waba-a-2');
  assert.equal(updated.maskedToken, '••••••••en-a');
  assert.equal(updated.isEnabled, false);
  assert.equal(updated.status, 'disabled');
});

test('verifies credentials and returns the verified phone details', async () => {
  const settings = createBusinessWhatsAppSettings({
    storage: new Map(),
    whatsappClient: {
      async getPhoneNumber(request) {
        assert.deepEqual(request, { phoneNumberId: 'phone-a', accessToken: 'token-a' });
        return {
          success: true,
          verifiedName: 'Connectly Clinic',
          displayPhoneNumber: '+15550001111',
        };
      },
    },
  });

  assert.deepEqual(
    await settings.testConnection({ phoneNumberId: 'phone-a', accessToken: 'token-a' }),
    { success: true, verifiedName: 'Connectly Clinic', displayPhoneNumber: '+15550001111' },
  );
});

test('returns a clean connection error without leaking the access token', async () => {
  const settings = createBusinessWhatsAppSettings({
    storage: new Map(),
    whatsappClient: {
      async getPhoneNumber() {
        return {
          success: false,
          code: 190,
          error: 'Invalid OAuth access_token=token-a',
        };
      },
    },
  });

  const result = await settings.testConnection({ phoneNumberId: 'phone-a', accessToken: 'token-a' });
  assert.equal(result.success, false);
  assert.equal(result.code, 190);
  assert.doesNotMatch(result.error, /token-a/);
  assert.match(result.error, /redacted/);
});

test('message sender uses Business A settings and simulates unconfigured Business B', async () => {
  const settings = createBusinessWhatsAppSettings({
    storage: new Map(),
    whatsappClient: {},
  });
  await settings.updateSettings(BUSINESS_A, {
    phoneNumberId: 'phone-a',
    accessToken: 'token-a',
    isEnabled: true,
  });

  const whatsappCalls = [];
  let simulatedCalls = 0;
  const sender = createMessageSender({
    simulatedSender: {
      async send() {
        simulatedCalls += 1;
        return { success: true, status: 'sent' };
      },
    },
    whatsappClient: {
      async send(request) {
        whatsappCalls.push(request);
        return { success: true, providerMessageId: 'wamid.a', status: 'sent' };
      },
    },
    getBusinessProviderConfig: (businessId) => settings.getProviderConfig(businessId),
  });

  await sender.send({ business_id: BUSINESS_A, message_text: 'Hello' }, { to: '+15550001111' });
  await sender.send({ business_id: BUSINESS_B, message_text: 'Hello' }, { to: '+15550002222' });

  assert.equal(whatsappCalls.length, 1);
  assert.equal(whatsappCalls[0].phoneNumberId, 'phone-a');
  assert.equal(whatsappCalls[0].accessToken, 'token-a');
  assert.equal(simulatedCalls, 1);
});
