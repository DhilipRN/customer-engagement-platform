import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';


const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const MISSING_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const OTHER_CUSTOMER_ID = 'a8a4f8b3-3a27-4f1f-9e0f-6ef4e2e6b9a1';

function createFakeBusinessService() {
  return {
    async findById(id) {
      return {
        data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id)
          ? { id, name: 'Northwind Coffee' }
          : null,
        error: null,
      };
    },
  };
}

function createFakeCustomerService() {
  const customers = [
    {
      id: CUSTOMER_ID,
      business_id: BUSINESS_ID,
      name: 'Ada Lovelace',
      phone: '1234567890',
      email: 'ada@example.com',
      consent_given: true,
    },
    {
      id: OTHER_CUSTOMER_ID,
      business_id: BUSINESS_ID,
      name: 'Another Customer',
      phone: '9876543210',
      email: 'another@example.com',
      consent_given: true,
    },
  ];

  return {
    async listByBusinessId(businessId) {
      return { data: customers.filter((customer) => customer.business_id === businessId), error: null };
    },
    async findByBusinessIdAndPhone(businessId, phone, excludedCustomerId = null) {
      return {
        data: customers.find(
          (customer) =>
            customer.business_id === businessId &&
            customer.phone === phone &&
            customer.id !== excludedCustomerId,
        ) ?? null,
        error: null,
      };
    },
    async findById(id) {
      return { data: customers.find((customer) => customer.id === id) ?? null, error: null };
    },
    async create(values) {
      const customer = { id: '2205fdc5-37a0-4390-a4b9-47914f3aadb5', ...values };
      customers.push(customer);
      return { data: customer, error: null };
    },
    async update(id, values) {
      const customer = customers.find((item) => item.id === id);
      if (!customer) {
        return { data: null, error: null };
      }
      Object.assign(customer, values);
      return { data: customer, error: null };
    },
    async remove(id) {
      const index = customers.findIndex((customer) => customer.id === id);
      if (index === -1) {
        return { data: null, error: null };
      }
      return { data: customers.splice(index, 1)[0], error: null };
    },
  };
}

function createTrackedDeletionCustomerService() {
  const customers = [
    {
      id: CUSTOMER_ID,
      business_id: BUSINESS_ID,
      name: 'Ada Lovelace',
      phone: '1234567890',
      email: 'ada@example.com',
      consent_given: true,
    },
    {
      id: OTHER_CUSTOMER_ID,
      business_id: OTHER_BUSINESS_ID,
      name: 'Other Business Customer',
      phone: '9876543210',
      email: 'other@example.com',
      consent_given: true,
    },
  ];
  const serviceCalls = { findById: 0, remove: 0 };

  return {
    customers,
    serviceCalls,
    async findById(id, businessId = null) {
      serviceCalls.findById += 1;
      return {
        data: customers.find(
          (customer) => customer.id === id &&
            (!businessId || customer.business_id === businessId),
        ) ?? null,
        error: null,
      };
    },
    async remove(id, businessId = null) {
      serviceCalls.remove += 1;
      const index = customers.findIndex(
        (customer) => customer.id === id &&
          (!businessId || customer.business_id === businessId),
      );

      if (index === -1) {
        return { data: null, error: null };
      }

      return { data: customers.splice(index, 1)[0], error: null };
    },
  };
}

function createFakeActivityEventService(events = []) {
  return {
    events,
    async create(event) {
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

function rejectAuthentication(_request, response, _next) {
  return response.status(401).json({ error: 'Authentication required.' });
}

async function withApi(
  callback,
  authMiddleware = bypassAuth,
  activityEventService = createFakeActivityEventService(),
  customerService = createFakeCustomerService(),
) {
  const app = createApp({
    businessService: createFakeBusinessService(),
    customerService,
    activityEventService,
    authMiddleware,
  });
  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('Customer API requires a valid existing business when listing customers', async () => {
  await withApi(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/customers`);
    assert.equal(invalidResponse.status, 400);

    const missingResponse = await fetch(`${baseUrl}/customers?business_id=${MISSING_BUSINESS_ID}`);
    assert.equal(missingResponse.status, 404);

    const response = await fetch(`${baseUrl}/customers?business_id=${BUSINESS_ID}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, CUSTOMER_ID);
  });
});

test('Customer API validates consent and existing businesses before creation', async () => {
  await withApi(async (baseUrl) => {
    const missingConsent = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, name: 'Grace Hopper', phone: '+15550101' }),
    });
    assert.equal(missingConsent.status, 400);

    const missingBusiness = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: MISSING_BUSINESS_ID,
        name: 'Grace Hopper',
        phone: '9876543211',
        consent_given: true,
      }),
    });
    assert.equal(missingBusiness.status, 404);

    const createResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: '  Grace Hopper  ',
        phone: '9876543211',
        email: 'grace@example.com',
        consent_given: false,
      }),
    });
    assert.equal(createResponse.status, 201);
    assert.equal((await createResponse.json()).data.consent_given, false);
  });
});

test('Customer API rejects duplicate phones within a business without inserting', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Duplicate Phone',
        phone: '1234567890',
        consent_given: true,
      }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: 'A customer with this phone number already exists in this business.',
    });
  });
});

test('Customer API allows the same phone in another business and a different phone in the same business', async () => {
  await withApi(async (baseUrl) => {
    const otherBusinessResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: OTHER_BUSINESS_ID,
        name: 'Other Business Customer',
        phone: '1234567890',
        consent_given: true,
      }),
    });

    assert.equal(otherBusinessResponse.status, 201);

    const differentPhoneResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Different Phone Customer',
        phone: '1234567891',
        consent_given: true,
      }),
    });

    assert.equal(differentPhoneResponse.status, 201);
  });
});

test('Customer API rejects editing a customer to another customer phone in the same business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '9876543210' }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: 'A customer with this phone number already exists in this business.',
    });
  });
});

test('Customer API allows editing a customer without changing its own phone', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Customer',
        phone: '1234567890',
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.phone, '1234567890');
    assert.equal(result.data.name, 'Updated Customer');
  });
});

test('Customer API reads, updates, and deletes customers', async () => {
  await withApi(async (baseUrl) => {
    const getResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`);
    assert.equal(getResponse.status, 200);

    const updateResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent_given: false }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.consent_given, false);

    const deleteResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);

    const missingResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`);
    assert.equal(missingResponse.status, 404);
  });
});

test('Customer API scopes deletion before calling the removal service', async () => {
  const clientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: BUSINESS_ID };
    next();
  };
  const customerService = createTrackedDeletionCustomerService();
  const events = [];
  const activityEventService = createFakeActivityEventService(events);
  const otherCustomerBefore = structuredClone(
    customerService.customers.find((customer) => customer.id === OTHER_CUSTOMER_ID),
  );

  await withApi(async (baseUrl) => {
    const deleteResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(customerService.serviceCalls.remove, 1);
    assert.equal(events.at(-1).event_type, 'customer.deleted');
    assert.equal(events.at(-1).entity_id, CUSTOMER_ID);

    const crossBusinessResponse = await fetch(`${baseUrl}/customers/${OTHER_CUSTOMER_ID}`, {
      method: 'DELETE',
    });
    assert.equal(crossBusinessResponse.status, 404);
    assert.equal(customerService.serviceCalls.remove, 1);
    assert.deepEqual(
      customerService.customers.find((customer) => customer.id === OTHER_CUSTOMER_ID),
      otherCustomerBefore,
    );

    const missingResponse = await fetch(
      `${baseUrl}/customers/0b7a2d62-f4f0-4b8f-9d78-75d63b4e2a55`,
      { method: 'DELETE' },
    );
    assert.equal(missingResponse.status, 404);
    assert.equal(customerService.serviceCalls.remove, 1);
  }, clientAuth, activityEventService, customerService);
});

test('Customer API rejects invalid customer identifiers', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers/invalid-id`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'customer id must be a valid UUID.' });
  });
});

test('Customer API denies unassigned clients, including ID-based operations', async () => {
  const unassignedClientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: null };
    next();
  };

  await withApi(async (baseUrl) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/customers?business_id=${BUSINESS_ID}`),
      fetch(`${baseUrl}/customers/${CUSTOMER_ID}`),
      fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          name: 'Unassigned Client',
          phone: '9876543210',
          consent_given: true,
        }),
      }),
      fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_given: false }),
      }),
      fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, { method: 'DELETE' }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [403, 403, 403, 403, 403],
    );
}, unassignedClientAuth);
});

test('Customer API denies unassigned client deletion before calling remove', async () => {
  const unassignedClientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: null };
    next();
  };
  const customerService = createTrackedDeletionCustomerService();
  const customerBefore = structuredClone(customerService.customers);

  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'DELETE',
    });

    assert.equal(response.status, 403);
    assert.equal(customerService.serviceCalls.remove, 0);
    assert.deepEqual(customerService.customers, customerBefore);
  }, unassignedClientAuth, undefined, customerService);
});

test('Customer API records create, update, consent-change, and delete audit events', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Audited Customer',
        phone: '9876543212',
        consent_given: true,
      }),
    });
    assert.equal(createResponse.status, 201);

    const updateResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Audited Customer', consent_given: false }),
    });
    assert.equal(updateResponse.status, 200);

    const deleteResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 204);
  }, bypassAuth, activityEventService);

  assert.deepEqual(events.map((event) => event.event_type), [
    'customer.created',
    'customer.updated',
    'customer.consent_changed',
    'customer.deleted',
  ]);
  assert.deepEqual(events[1].before, { name: 'Ada Lovelace' });
  assert.deepEqual(events[1].after, { name: 'Updated Audited Customer' });
  assert.deepEqual(events[2].before, { consent_given: true });
  assert.deepEqual(events[2].after, { consent_given: false });
  assert.equal(events[3].customer_id, null);
  assert.equal(events[3].entity_id, CUSTOMER_ID);
});

test('Customer API exposes an explicit error when audit persistence fails', async () => {
  const activityEventService = {
    async create() {
      return { data: null, error: new Error('audit database unavailable') };
    },
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Audit Failure Customer',
        phone: '9876543212',
        consent_given: true,
      }),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Customer operation succeeded, but its audit event could not be recorded.',
    });
  }, bypassAuth, activityEventService);
});

test('Customer API rejects requests without authentication', async () => {
  await withApi(async (baseUrl) => {
    const responses = await Promise.all([
      fetch(`${baseUrl}/customers`),
      fetch(`${baseUrl}/customers/${CUSTOMER_ID}`),
      fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: BUSINESS_ID,
          name: 'Unauthenticated Customer',
          phone: '9876543213',
          consent_given: true,
        }),
      }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.status),
      [401, 401, 401],
    );
  }, rejectAuthentication);
});
