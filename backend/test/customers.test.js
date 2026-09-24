import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const MISSING_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';

function createFakeBusinessService() {
  return {
    async findById(id) {
      return {
        data: id === BUSINESS_ID ? { id: BUSINESS_ID, name: 'Northwind Coffee' } : null,
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
      phone: '+15550100',
      email: 'ada@example.com',
      consent_given: true,
    },
  ];

  return {
    async listByBusinessId(businessId) {
      return { data: customers.filter((customer) => customer.business_id === businessId), error: null };
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

async function withApi(callback) {
  const app = createApp({
    businessService: createFakeBusinessService(),
    customerService: createFakeCustomerService(),
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
        phone: '9876543210',
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
        phone: '9876543210',
        email: 'grace@example.com',
        consent_given: false,
      }),
    });
    assert.equal(createResponse.status, 201);
    assert.equal((await createResponse.json()).data.consent_given, false);
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

test('Customer API rejects invalid customer identifiers', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/customers/invalid-id`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'customer id must be a valid UUID.' });
  });
});
