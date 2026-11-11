import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCustomersRouter } from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';

function createInactiveRouter({ authorization, lookupError = null, calls = [] } = {}) {
  return createCustomersRouter({
    businessAccessMiddleware: (_request, _response, next) => next(),
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        calls.push(['authorize', businessId]);
        if (lookupError) return { data: null, error: lookupError };
        if (businessId === OTHER_BUSINESS_ID) {
          return { data: { authorized: false, permissions: {} }, error: null };
        }
        return { data: authorization, error: null };
      },
    },
    businessService: {
      async findById(businessId) {
        calls.push(['business', businessId]);
        return {
          data: businessId === BUSINESS_ID ? { id: businessId } : null,
          error: null,
        };
      },
    },
    customerService: {
      async listByBusinessId(businessId) {
        calls.push(['customers', businessId]);
        return {
          data: businessId === BUSINESS_ID
            ? [{ id: 'customer-1', business_id: BUSINESS_ID, name: 'Ada' }]
            : [],
          error: null,
        };
      },
    },
    purchaseService: {
      async list({ businessId }) {
        calls.push(['purchases', businessId]);
        return { data: [], error: null };
      },
    },
    appointmentService: {
      async listCompletedByBusinessId(businessId) {
        calls.push(['appointments', businessId]);
        return { data: [], error: null };
      },
    },
  });
}

async function requestInactive({
  role = 'client',
  profileBusinessId = BUSINESS_ID,
  authorization,
  lookupError,
  requestedBusinessId = BUSINESS_ID,
  includeAuth = true,
} = {}) {
  const calls = [];
  const app = express();
  app.use((request, _response, next) => {
    if (includeAuth) {
      request.user = { id: 'user-1' };
      request.profile = {
        id: 'user-1',
        role,
        business_id: profileBusinessId,
      };
    }
    next();
  });
  app.use('/customers', createInactiveRouter({ authorization, lookupError, calls }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/customers/inactive?business_id=${requestedBusinessId}&days=30`,
    );
    return { response, calls };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admins retain inactive-customer access and response shape', async () => {
  const { response, calls } = await requestInactive({
    role: 'admin',
    profileBusinessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.inactivity_days, 30);
  assert.ok(typeof body.cutoff_date === 'string');
  assert.equal(body.data[0].name, 'Ada');
  assert.deepEqual(calls, [
    ['business', BUSINESS_ID],
    ['customers', BUSINESS_ID],
    ['purchases', BUSINESS_ID],
    ['appointments', BUSINESS_ID],
  ]);
});

test('legacy clients retain inactive-customer access in their assigned business', async () => {
  const { response } = await requestInactive({
    authorization: {
      authorized: true,
      source: 'legacy-client',
      permissions: { view_chats: true },
    },
  });
  assert.equal(response.status, 200);
});

test('membership users with view_chats can read inactive customers', async () => {
  const { response } = await requestInactive({
    profileBusinessId: null,
    authorization: {
      authorized: true,
      source: 'membership',
      membership: { business_id: BUSINESS_ID, role: 'receptionist' },
      permissions: { view_chats: true },
    },
  });
  assert.equal(response.status, 200);
});

test('membership users without view_chats receive 403', async () => {
  const { response, calls } = await requestInactive({
    authorization: {
      authorized: true,
      source: 'membership',
      membership: { business_id: BUSINESS_ID, role: 'receptionist' },
      permissions: { view_chats: false },
    },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to view chats.',
  });
  assert.deepEqual(calls, [['authorize', BUSINESS_ID]]);
});

test('inactive-customer access is isolated by business', async () => {
  const { response, calls } = await requestInactive({
    authorization: {
      authorized: true,
      source: 'membership',
      membership: { business_id: BUSINESS_ID, role: 'receptionist' },
      permissions: { view_chats: true },
    },
    requestedBusinessId: OTHER_BUSINESS_ID,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(calls, [['authorize', OTHER_BUSINESS_ID]]);
});

test('missing authorization context is denied before inactive-customer queries', async () => {
  const { response, calls } = await requestInactive({
    includeAuth: false,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test('inactive-customer authorization lookup failures fail closed', async () => {
  const { response, calls } = await requestInactive({
    lookupError: { code: '42501', message: 'permission denied' },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify customer-list access.',
  });
  assert.deepEqual(calls, [['authorize', BUSINESS_ID]]);
});
