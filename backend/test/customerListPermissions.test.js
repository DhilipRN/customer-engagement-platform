import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCustomersRouter } from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';

function createCustomerListRouter({ authorization, lookupError = null } = {}) {
  return createCustomersRouter({
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
        return {
          data: id === BUSINESS_ID ? { id } : null,
          error: null,
        };
      },
    },
    customerService: {
      async listByBusinessId(businessId) {
        return {
          data: businessId === BUSINESS_ID
            ? [{ id: 'customer-1', business_id: BUSINESS_ID, name: 'Ada' }]
            : [],
          error: null,
        };
      },
    },
  });
}

async function requestCustomerList({
  role = 'client',
  businessId = BUSINESS_ID,
  authorization,
  lookupError,
  requestedBusinessId = BUSINESS_ID,
} = {}) {
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = {
      id: 'user-1',
      role,
      business_id: businessId,
    };
    next();
  });
  app.use('/customers', createCustomerListRouter({ authorization, lookupError }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(
      `http://127.0.0.1:${server.address().port}/customers?business_id=${requestedBusinessId}`,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admin customer-list access remains unchanged', async () => {
  const response = await requestCustomerList({
    role: 'admin',
    businessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].name, 'Ada');
});

test('legacy clients retain customer-list access for their assigned business', async () => {
  const response = await requestCustomerList({
    authorization: {
      authorized: true,
      source: 'legacy-client',
      permissions: { view_chats: true },
    },
  });

  assert.equal(response.status, 200);
});

test('receptionists with view_chats can list customers', async () => {
  const response = await requestCustomerList({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { view_chats: true },
    },
  });

  assert.equal(response.status, 200);
});

test('receptionists without view_chats receive 403', async () => {
  const response = await requestCustomerList({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { view_chats: false },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to view chats.',
  });
});

test('receptionists cannot list another business', async () => {
  const response = await requestCustomerList({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { view_chats: true },
    },
    requestedBusinessId: OTHER_BUSINESS_ID,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
});

test('customer-list authorization lookup failures fail closed', async () => {
  const response = await requestCustomerList({
    lookupError: { code: '42501', message: 'permission denied' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify customer-list access.',
  });
});

