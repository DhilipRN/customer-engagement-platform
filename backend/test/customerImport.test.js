import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createCustomersRouter } from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';

function createImportFixture({ authorization, customers = [], createErrorForPhone } = {}) {
  const storedCustomers = customers.map((customer) => ({ ...customer }));
  const events = [];
  let nextId = 1;

  return {
    customers: storedCustomers,
    events,
    businessService: {
      async findById(id) {
        return {
          data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id } : null,
          error: null,
        };
      },
    },
    customerService: {
      async findByBusinessIdAndPhone(businessId, phone) {
        return {
          data: storedCustomers.find(
            (customer) => customer.business_id === businessId && customer.phone === phone,
          ) ?? null,
          error: null,
        };
      },
      async create(values) {
        if (values.phone === createErrorForPhone) {
          return { data: null, error: new Error('insert failed') };
        }

        const customer = {
          id: `customer-${nextId++}`,
          ...values,
        };
        storedCustomers.push(customer);
        return { data: customer, error: null };
      },
    },
    activityEventService: {
      async create(event) {
        events.push(event);
        return { data: { id: `event-${events.length}` }, error: null };
      },
    },
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (businessId === OTHER_BUSINESS_ID) {
          return { data: { authorized: false, permissions: {} }, error: null };
        }
        return {
          data: {
            ...authorization,
            membership: authorization?.source === 'membership'
              ? authorization.membership ?? {
                business_id: businessId,
                role: authorization.role ?? 'receptionist',
              }
              : authorization?.membership,
          },
          error: null,
        };
      },
    },
  };
}

async function requestImport({
  fixture,
  rows,
  businessId = BUSINESS_ID,
  role = 'client',
  profileBusinessId = BUSINESS_ID,
  authorization = {
    authorized: true,
    source: 'membership',
    role: 'receptionist',
    permissions: { manage_customers: true },
  },
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
  app.use('/customers', createCustomersRouter({
    ...fixture,
    businessAccessMiddleware: (_request, _response, next) => next(),
  }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/customers/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, rows }),
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('customer import uses the authorized business, ignores row business IDs, and does not overwrite duplicates', async () => {
  const existing = {
    id: 'existing-1',
    business_id: BUSINESS_ID,
    name: 'Existing Customer',
    phone: '1234567890',
  };
  const fixture = createImportFixture({
    customers: [existing],
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: true },
    },
  });

  const response = await requestImport({
    fixture,
    rows: [
      {
        rowNumber: 2,
        business_id: OTHER_BUSINESS_ID,
        name: 'New Customer',
        phone: '9876543210',
        email: 'new@example.com',
        consent_given: true,
      },
      {
        rowNumber: 3,
        name: 'Existing Replacement',
        phone: '1234567890',
        consent_given: false,
      },
      {
        rowNumber: 4,
        name: 'Duplicate New',
        phone: '9876543210',
        consent_given: false,
      },
    ],
  });

  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.summary, { imported: 1, skipped_duplicate: 2, failed: 0 });
  assert.equal(fixture.customers.length, 2);
  assert.equal(fixture.customers[0].name, 'Existing Customer');
  assert.equal(fixture.customers[1].business_id, BUSINESS_ID);
  assert.equal(fixture.events.length, 1);
});

test('customer import reports validation and create failures while importing other valid rows', async () => {
  const fixture = createImportFixture({
    createErrorForPhone: '9999999999',
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'owner',
      permissions: { manage_customers: true },
    },
  });

  const response = await requestImport({
    fixture,
    rows: [
      { rowNumber: 2, name: '', phone: '123', consent_given: 'yes' },
      { rowNumber: 3, name: 'Insert Failure', phone: '9999999999', consent_given: true },
      { rowNumber: 4, name: 'Imported Customer', phone: '9876543210', consent_given: false },
    ],
  });

  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.summary, { imported: 1, skipped_duplicate: 0, failed: 2 });
  assert.equal(result.data[0].status, 'failed');
  assert.equal(result.data[2].status, 'imported');
  assert.equal(fixture.customers.length, 1);
});

test('customer import enforces the manage_customers permission', async () => {
  const fixture = createImportFixture({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: false },
    },
  });

  const response = await requestImport({
    fixture,
    rows: [{ name: 'Denied Customer', phone: '9876543210', consent_given: true }],
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have permission to manage customers.',
  });
  assert.equal(fixture.customers.length, 0);
});

test('customer import rejects cross-business requests before creating records', async () => {
  const fixture = createImportFixture({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: true },
    },
  });

  const response = await requestImport({
    fixture,
    businessId: OTHER_BUSINESS_ID,
    rows: [{ name: 'Cross Business', phone: '9876543210', consent_given: true }],
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
  assert.equal(fixture.customers.length, 0);
});

test('customer import derives the client business when no business ID is sent', async () => {
  const fixture = createImportFixture({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { manage_customers: true },
    },
  });

  const response = await requestImport({
    fixture,
    businessId: undefined,
    rows: [{ name: 'Derived Business Customer', phone: '9876543210', consent_given: true }],
  });

  assert.equal(response.status, 200);
  assert.equal(fixture.customers[0].business_id, BUSINESS_ID);
});

test('admin customer import remains allowed for an explicitly selected existing business', async () => {
  const fixture = createImportFixture({
    authorization: { authorized: true, source: 'admin', permissions: {} },
  });

  const response = await requestImport({
    fixture,
    role: 'admin',
    profileBusinessId: null,
    rows: [{ name: 'Admin Customer', phone: '9876543210', consent_given: true }],
    authorization: { authorized: true, source: 'admin', permissions: {} },
  });

  assert.equal(response.status, 200);
  assert.equal(fixture.customers[0].business_id, BUSINESS_ID);
});

test('customer import treats a database unique violation as a duplicate skip', async () => {
  const fixture = createImportFixture({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'owner',
      permissions: { manage_customers: true },
    },
  });
  fixture.customerService.create = async () => ({
    data: null,
    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
  });

  const response = await requestImport({
    fixture,
    rows: [{ name: 'Race Customer', phone: '9876543210', consent_given: true }],
  });

  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.summary, { imported: 0, skipped_duplicate: 1, failed: 0 });
});

test('customer import is rejected when the application authentication middleware rejects the request', async () => {
  const fixture = createImportFixture();
  const app = createApp({
    businessService: fixture.businessService,
    customerService: fixture.customerService,
    activityEventService: fixture.activityEventService,
    permissionService: fixture.permissionService,
    authMiddleware: (_request, response) => response.status(401).json({ error: 'Authentication required.' }),
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/customers/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        rows: [{ name: 'Unauthenticated', phone: '9876543210', consent_given: true }],
      }),
    });

    assert.equal(response.status, 401);
    assert.equal(fixture.customers.length, 0);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
