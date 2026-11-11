import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMessagesRouter } from '../src/routes/messages.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';

function createMessageRouter({ authorization, lookupError = null, customer = {} } = {}) {
  return createMessagesRouter({
    businessAccessMiddleware: (_request, _response, next) => next(),
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (lookupError) {
          return { data: null, error: lookupError };
        }

        if (businessId === OTHER_BUSINESS_ID) {
          return {
            data: { authorized: false, permissions: {} },
            error: null,
          };
        }

        return { data: authorization, error: null };
      },
    },
    businessService: {
      async findById(id) {
        return { data: id === BUSINESS_ID ? { id } : null, error: null };
      },
    },
    customerService: {
      async findById(id) {
        return {
          data: id === CUSTOMER_ID
            ? { id, business_id: BUSINESS_ID, consent_given: customer.consent_given ?? true }
            : null,
          error: null,
        };
      },
    },
    messageService: {
      async create(values) {
        return { data: { id: '2205fdc5-37a0-4390-a4b9-47914f3aadb5', ...values }, error: null };
      },
    },
  });
}

async function requestMessage({
  role = 'client',
  businessId = BUSINESS_ID,
  authorization,
  lookupError,
  requestedBusinessId = BUSINESS_ID,
  customer = {},
  body = {},
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = { id: 'user-1', role, business_id: businessId };
    next();
  });
  app.use('/messages', createMessageRouter({ authorization, lookupError, customer }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        business_id: requestedBusinessId,
        customer_id: CUSTOMER_ID,
        message_text: 'Hello',
        ...body,
      }),
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admins can still create messages', async () => {
  const response = await requestMessage({
    role: 'admin',
    businessId: null,
    authorization: { authorized: true, permissions: {} },
  });

  assert.equal(response.status, 201);
});

test('legacy clients retain message creation for their assigned business', async () => {
  const response = await requestMessage({
    authorization: {
      authorized: true,
      source: 'legacy-client',
      permissions: { send_messages: true },
    },
  });

  assert.equal(response.status, 201);
});

test('receptionists with send_messages can create messages', async () => {
  const response = await requestMessage({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { send_messages: true },
    },
  });

  assert.equal(response.status, 201);
});

test('receptionists without send_messages receive 403', async () => {
  const response = await requestMessage({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { send_messages: false },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to send messages.',
  });
});

test('cross-business message creation is rejected', async () => {
  const response = await requestMessage({
    requestedBusinessId: OTHER_BUSINESS_ID,
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { send_messages: true },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
});

test('authorization lookup failures fail closed', async () => {
  const response = await requestMessage({
    lookupError: { code: '42501', message: 'permission denied' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify message-send access.',
  });
});

test('customer consent remains required when sending permission is granted', async () => {
  const response = await requestMessage({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { send_messages: true },
    },
    customer: { consent_given: false },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Customer has not provided consent to receive messages.',
  });
});
