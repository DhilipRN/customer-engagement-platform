import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMessagesRouter } from '../src/routes/messages.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const MESSAGE_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';

const message = {
  id: MESSAGE_ID,
  business_id: BUSINESS_ID,
  customer_id: CUSTOMER_ID,
  message_text: 'Hello',
  status: 'sent',
};

function createReadRouter({ authorization, lookupError = null } = {}) {
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
      async findById() {
        return { data: { id: CUSTOMER_ID, business_id: BUSINESS_ID }, error: null };
      },
      async listByBusinessId() {
        return { data: [{ id: CUSTOMER_ID, name: 'Customer' }], error: null };
      },
    },
    messageService: {
      async list(filters) {
        return {
          data: filters.businessId === BUSINESS_ID ? [message] : [],
          error: null,
        };
      },
      async findById(id, businessId) {
        return {
          data: id === MESSAGE_ID && (!businessId || businessId === BUSINESS_ID)
            ? message
            : null,
          error: null,
        };
      },
    },
  });
}

async function requestRead({
  role = 'client',
  businessId = BUSINESS_ID,
  authorization,
  lookupError,
  path = `?business_id=${BUSINESS_ID}`,
} = {}) {
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = { id: 'user-1', role, business_id: businessId };
    next();
  });
  app.use('/messages', createReadRouter({ authorization, lookupError }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/messages${path}`,
    );
    return response;
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const adminAuthorization = {
  authorized: true,
  source: 'admin',
  permissions: { view_chats: true },
};

const legacyAuthorization = {
  authorized: true,
  source: 'legacy-client',
  permissions: { view_chats: true },
};

const receptionistAuthorization = {
  authorized: true,
  source: 'membership',
  role: 'receptionist',
  permissions: { view_chats: true },
};

test('admins retain message list and detail access', async () => {
  const listResponse = await requestRead({
    role: 'admin',
    businessId: null,
    authorization: adminAuthorization,
  });
  assert.equal(listResponse.status, 200);

  const detailResponse = await requestRead({
    role: 'admin',
    businessId: null,
    authorization: adminAuthorization,
    path: `/${MESSAGE_ID}`,
  });
  assert.equal(detailResponse.status, 200);
  assert.deepEqual((await detailResponse.json()).data, message);
});

test('legacy clients retain reads within their assigned business', async () => {
  const response = await requestRead({ authorization: legacyAuthorization });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].id, MESSAGE_ID);
});

test('receptionists with view_chats can read authorized messages', async () => {
  const response = await requestRead({ authorization: receptionistAuthorization });
  assert.equal(response.status, 200);
});

test('receptionists without view_chats receive 403 for list and detail', async () => {
  const authorization = {
    ...receptionistAuthorization,
    permissions: { view_chats: false },
  };

  const listResponse = await requestRead({ authorization });
  assert.equal(listResponse.status, 403);
  assert.deepEqual(await listResponse.json(), {
    error: 'You do not have permission to view chats.',
  });

  const detailResponse = await requestRead({
    authorization,
    path: `/${MESSAGE_ID}?business_id=${BUSINESS_ID}`,
  });
  assert.equal(detailResponse.status, 403);
});

test('cross-business message reads are rejected', async () => {
  const response = await requestRead({
    authorization: receptionistAuthorization,
    path: `?business_id=${OTHER_BUSINESS_ID}`,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
});

test('message-read authorization lookup failures do not expose data', async () => {
  const response = await requestRead({
    lookupError: { code: '42501', message: 'permission denied' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify message-read access.',
  });
});

