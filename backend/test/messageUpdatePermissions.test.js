import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMessagesRouter } from '../src/routes/messages.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const MESSAGE_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';

function createRouter({ authorization, lookupError = null, calls = [] } = {}) {
  const message = {
    id: MESSAGE_ID,
    business_id: BUSINESS_ID,
    message_text: 'Original',
    status: 'pending',
  };

  return createMessagesRouter({
    businessAccessMiddleware: (_request, _response, next) => next(),
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (lookupError) {
          return { data: null, error: lookupError };
        }

        if (businessId === OTHER_BUSINESS_ID || !businessId) {
          return { data: { authorized: false, permissions: {} }, error: null };
        }

        return { data: authorization, error: null };
      },
    },
    messageService: {
      async findById(id, businessId = null) {
        calls.push(['findById', id, businessId]);
        return {
          data: id === MESSAGE_ID && (!businessId || businessId === BUSINESS_ID)
            ? message
            : null,
          error: null,
        };
      },
      async update(id, values, businessId = null) {
        calls.push(['update', id, values, businessId]);
        return {
          data: id === MESSAGE_ID && (!businessId || businessId === BUSINESS_ID)
            ? { ...message, ...values }
            : null,
          error: null,
        };
      },
    },
  });
}

async function requestUpdate({
  role = 'client',
  profileBusinessId = BUSINESS_ID,
  authorization,
  lookupError,
  calls = [],
  path = `/${MESSAGE_ID}?business_id=${BUSINESS_ID}`,
  body = { message_text: 'Updated' },
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = {
      id: 'user-1',
      role,
      business_id: profileBusinessId,
    };
    next();
  });
  app.use('/messages', createRouter({ authorization, lookupError, calls }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/messages${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admins retain message update access', async () => {
  const calls = [];
  const response = await requestUpdate({
    role: 'admin',
    profileBusinessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
    calls,
    path: `/${MESSAGE_ID}`,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['findById', MESSAGE_ID, null]);
  assert.equal(calls[1][0], 'update');
  assert.equal(calls[1][3], null);
});

test('legacy clients retain message update behavior', async () => {
  const response = await requestUpdate({
    authorization: {
      authorized: true,
      source: 'legacy-client',
      permissions: { send_messages: true },
    },
  });
  assert.equal(response.status, 200);
});

test('membership users with send_messages can update in the authorized business', async () => {
  const calls = [];
  const response = await requestUpdate({
    profileBusinessId: null,
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { send_messages: true },
    },
    calls,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['findById', MESSAGE_ID, BUSINESS_ID]);
  assert.equal(calls[1][3], BUSINESS_ID);
});

test('membership users without send_messages receive 403 before lookup', async () => {
  const calls = [];
  const response = await requestUpdate({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { send_messages: false },
    },
    calls,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to send messages.',
  });
  assert.deepEqual(calls, []);
});

test('cross-business message updates are rejected before lookup', async () => {
  const calls = [];
  const response = await requestUpdate({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { send_messages: true },
    },
    calls,
    path: `/${MESSAGE_ID}?business_id=${OTHER_BUSINESS_ID}`,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test('missing authorization context fails closed without an unscoped lookup', async () => {
  const calls = [];
  const response = await requestUpdate({
    profileBusinessId: null,
    calls,
    path: `/${MESSAGE_ID}`,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
  assert.deepEqual(calls, []);
});

test('authorization lookup failures fail closed', async () => {
  const calls = [];
  const response = await requestUpdate({
    lookupError: { code: '42501', message: 'permission denied' },
    calls,
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify message-update access.',
  });
  assert.deepEqual(calls, []);
});

test('existing message validation remains unchanged after permission approval', async () => {
  const calls = [];
  const response = await requestUpdate({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { send_messages: true },
    },
    calls,
    body: { status: 'sent' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    errors: ['sent_at is required when status is sent.'],
  });
  assert.deepEqual(calls, [['findById', MESSAGE_ID, BUSINESS_ID]]);
});

