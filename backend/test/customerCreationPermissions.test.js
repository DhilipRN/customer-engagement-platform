import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCustomersRouter } from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';

function createCustomerCreationRouter({ authorization, lookupError = null } = {}) {
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
      async findByBusinessIdAndPhone() {
        return { data: null, error: null };
      },
      async create(values) {
        return {
          data: {
            id: 'e693ff85-1344-4764-9d10-e2d4cbbeedc7',
            ...values,
          },
          error: null,
        };
      },
    },
    activityEventService: {
      async create() {
        return { data: { id: 'event-1' }, error: null };
      },
    },
  });
}

async function requestCustomerCreation({
  role = 'client',
  businessId = BUSINESS_ID,
  authorization,
  lookupError,
  requestedBusinessId = BUSINESS_ID,
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = {
      id: 'user-1',
      role,
      business_id: businessId,
    };
    next();
  });
  app.use('/customers', createCustomerCreationRouter({ authorization, lookupError }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(
      `http://127.0.0.1:${server.address().port}/customers`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          business_id: requestedBusinessId,
          name: 'New Contact',
          phone: '9876543210',
          consent_given: true,
        }),
      },
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admin customer creation remains allowed', async () => {
  const response = await requestCustomerCreation({
    role: 'admin',
    businessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
  });

  assert.equal(response.status, 201);
});

test('legacy clients retain customer creation for their assigned business', async () => {
  const response = await requestCustomerCreation({
    authorization: {
      authorized: true,
      source: 'legacy-client',
      permissions: { manage_customers: true },
    },
  });

  assert.equal(response.status, 201);
});

test('receptionists with manage_customers can create customers', async () => {
  const response = await requestCustomerCreation({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: true },
    },
  });

  assert.equal(response.status, 201);
});

test('receptionists without manage_customers receive 403', async () => {
  const response = await requestCustomerCreation({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: false },
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to manage customers.',
  });
});

test('customer creation rejects another business', async () => {
  const response = await requestCustomerCreation({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: true },
    },
    requestedBusinessId: OTHER_BUSINESS_ID,
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
});

test('customer-creation authorization lookup failures fail closed', async () => {
  const response = await requestCustomerCreation({
    lookupError: { code: '42501', message: 'permission denied' },
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: 'Unable to verify customer-creation access.',
  });
});

