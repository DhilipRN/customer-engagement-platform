import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = 'a8a4f8b3-3a27-4f1f-9e0f-6ef4e2e6b9a1';

function createCustomerService() {
  const customers = [
    { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer A' },
    { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID, name: 'Customer B' },
  ];

  return {
    findById: async (id, businessId = null) => ({
      data: customers.find((customer) =>
        customer.id === id && (!businessId || customer.business_id === businessId)
      ) ?? null,
      error: null,
    }),
  };
}

function createExclusionService({ duplicate = false, initialRows = [], calls = { remove: 0 } } = {}) {
  const rows = initialRows.map((row) => ({ ...row }));

  return {
    rows,
    listByBusinessId: async (businessId) => ({
      data: rows.filter((row) => row.business_id === businessId),
      error: null,
    }),
    create: async (businessId, customerId, createdBy) => {
      if (duplicate || rows.some((row) =>
        row.business_id === businessId && row.customer_id === customerId
      )) {
        return { data: null, error: { code: '23505' } };
      }

      const row = { business_id: businessId, customer_id: customerId, created_by: createdBy };
      rows.push(row);
      return { data: row, error: null };
    },
    remove: async (businessId, customerId) => {
      calls.remove += 1;
      const index = rows.findIndex((row) =>
        row.business_id === businessId && row.customer_id === customerId
      );

      return {
        data: index === -1 ? null : rows.splice(index, 1)[0],
        error: null,
      };
    },
  };
}

async function withApi(callback, profile, exclusionService = createExclusionService()) {
  const app = createApp({
    customerService: createCustomerService(),
    customerComebackExclusionService: exclusionService,
    businessAccessMiddleware: (request, response, next) => {
      if (profile?.role === 'admin') return next();
      const requestedBusinessId = request.query?.business_id || request.body?.business_id;
      if (requestedBusinessId && requestedBusinessId !== profile?.business_id) {
        return response.status(403).json({ error: 'You do not have access to this business.' });
      }
      request.businessAuthorization = {
        authorized: true,
        source: 'legacy-client',
        permissions: {
          view_automations: true,
          manage_automations: true,
        },
      };
      return next();
    },
    authMiddleware: (request, _response, next) => {
      if (!profile) return _response.status(401).json({ error: 'Authentication required.' });
      request.profile = profile;
      request.user = { id: profile.id ?? 'admin-user-id' };
      next();
    },
  });
  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('admin can list, create, and delete Customer Comeback exclusions', async () => {
  await withApi(async (url) => {
    const create = await fetch(`${url}/customer-comeback-exclusions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }),
    });
    assert.equal(create.status, 201);

    const list = await fetch(`${url}/customer-comeback-exclusions?business_id=${BUSINESS_ID}`);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data.length, 1);

    const remove = await fetch(`${url}/customer-comeback-exclusions/${CUSTOMER_ID}?business_id=${BUSINESS_ID}`, {
      method: 'DELETE',
    });
    assert.equal(remove.status, 204);
  }, { role: 'admin', id: 'admin-user-id' });
});

test('client is restricted to the assigned business and customer ownership', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/customer-comeback-exclusions?business_id=${OTHER_BUSINESS_ID}`)).status, 403);

    const wrongCustomer = await fetch(`${url}/customer-comeback-exclusions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: OTHER_CUSTOMER_ID }),
    });
    assert.equal(wrongCustomer.status, 404);

    const create = await fetch(`${url}/customer-comeback-exclusions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: CUSTOMER_ID }),
    });
    assert.equal(create.status, 201);
  }, { role: 'client', business_id: BUSINESS_ID, id: 'client-user-id' });
});

test('client cannot delete a Customer Comeback exclusion from another business', async () => {
  const calls = { remove: 0 };
  const exclusionService = createExclusionService({
    initialRows: [{
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
      created_by: 'business-b-owner',
    }],
    calls,
  });
  const before = structuredClone(exclusionService.rows[0]);

  await withApi(async (url) => {
    const response = await fetch(
      `${url}/customer-comeback-exclusions/${OTHER_CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}`,
      { method: 'DELETE' },
    );

    assert.equal(response.status, 403);
    assert.equal(calls.remove, 0);
    assert.deepEqual(exclusionService.rows[0], before);
  }, { role: 'client', business_id: BUSINESS_ID, id: 'client-user-id' }, exclusionService);
});

test('exclusion routes validate requests, duplicate creation, and missing deletion', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/customer-comeback-exclusions`)).status, 400);
    assert.equal((await fetch(`${url}/customer-comeback-exclusions?business_id=not-a-uuid`)).status, 400);

    const missingCustomer = await fetch(`${url}/customer-comeback-exclusions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID }),
    });
    assert.equal(missingCustomer.status, 400);

    const duplicateService = createExclusionService({ duplicate: true });
    await withApi(async (duplicateUrl) => {
      const duplicate = await fetch(`${duplicateUrl}/customer-comeback-exclusions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }),
      });
      assert.equal(duplicate.status, 409);
    }, { role: 'admin', id: 'admin-user-id' }, duplicateService);

    const missingDelete = await fetch(`${url}/customer-comeback-exclusions/${CUSTOMER_ID}?business_id=${BUSINESS_ID}`, {
      method: 'DELETE',
    });
    assert.equal(missingDelete.status, 404);
  }, { role: 'admin', id: 'admin-user-id' });
});

test('exclusion routes require authentication', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/customer-comeback-exclusions?business_id=${BUSINESS_ID}`)).status, 401);
  }, null);
});
