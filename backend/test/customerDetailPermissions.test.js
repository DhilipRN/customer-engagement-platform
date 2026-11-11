import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCustomersRouter } from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';

function createRouter({ authorization, lookupError = null, calls, events = [] } = {}) {
  const customers = [
    { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer', phone: '9876543210', consent_given: true },
    { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID, name: 'Other', phone: '9876543211', consent_given: true },
  ];

  return createCustomersRouter({
    businessAccessMiddleware: (_request, _response, next) => next(),
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (lookupError) {
          return { data: null, error: lookupError };
        }

        if (!businessId) {
          return { data: { authorized: false, permissions: {} }, error: null };
        }

        if (businessId === OTHER_BUSINESS_ID) {
          return { data: { authorized: false, permissions: {} }, error: null };
        }

        return { data: authorization, error: null };
      },
    },
    customerService: {
      async findById(id, businessId = null) {
        calls.push(['findById', id, businessId]);
        return {
          data: customers.find((customer) => (
            customer.id === id && (!businessId || customer.business_id === businessId)
          )) ?? null,
          error: null,
        };
      },
      async findByBusinessIdAndPhone(businessId, phone) {
        calls.push(['findByBusinessIdAndPhone', businessId, phone]);
        return { data: null, error: null };
      },
      async update(id, values, businessId = null) {
        calls.push(['update', id, businessId]);
        const customer = customers.find((item) => (
          item.id === id && (!businessId || item.business_id === businessId)
        ));
        return { data: customer ? { ...customer, ...values } : null, error: null };
      },
      async remove(id, businessId = null) {
        calls.push(['remove', id, businessId]);
        const customer = customers.find((item) => (
          item.id === id && (!businessId || item.business_id === businessId)
        ));
        return { data: customer ?? null, error: null };
      },
    },
    activityEventService: {
      async create(payload) {
        events.push(payload);
        return { data: { id: 'event-1' }, error: null };
      },
    },
  });
}

async function requestCustomer({
  role = 'client',
  profileBusinessId = BUSINESS_ID,
  authorization,
  lookupError,
  calls = [],
  events = [],
  method = 'GET',
  path = `/${CUSTOMER_ID}?business_id=${BUSINESS_ID}`,
  body,
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
  app.use('/customers', createRouter({ authorization, lookupError, calls, events }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/customers${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('admins retain customer detail and update access', async () => {
  const detailCalls = [];
  const detail = await requestCustomer({
    role: 'admin',
    profileBusinessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
    calls: detailCalls,
  });
  assert.equal(detail.status, 200);
  assert.deepEqual(detailCalls[0], ['findById', CUSTOMER_ID, null]);

  const updateCalls = [];
  const update = await requestCustomer({
    role: 'admin',
    profileBusinessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
    calls: updateCalls,
    method: 'PUT',
    body: { name: 'Updated by admin' },
  });
  assert.equal(update.status, 200);
  assert.deepEqual(updateCalls[0], ['findById', CUSTOMER_ID, null]);
  assert.deepEqual(updateCalls[1], ['findByBusinessIdAndPhone', BUSINESS_ID, '9876543210']);
  assert.deepEqual(updateCalls[2], ['update', CUSTOMER_ID, null]);

  const deleteCalls = [];
  const deletion = await requestCustomer({
    role: 'admin',
    profileBusinessId: null,
    authorization: { authorized: true, source: 'admin', permissions: {} },
    calls: deleteCalls,
    method: 'DELETE',
  });
  assert.equal(deletion.status, 204);
  assert.deepEqual(deleteCalls[0], ['remove', CUSTOMER_ID, null]);
});

test('legacy clients retain detail and update capabilities', async () => {
  const authorization = {
    authorized: true,
    source: 'legacy-client',
    permissions: { view_chats: true, manage_customers: true },
  };
  const detail = await requestCustomer({ authorization });
  assert.equal(detail.status, 200);

  const update = await requestCustomer({
    authorization,
    method: 'PUT',
    body: { name: 'Updated legacy customer' },
  });
  assert.equal(update.status, 200);

  const deletion = await requestCustomer({
    authorization,
    method: 'DELETE',
  });
  assert.equal(deletion.status, 204);
});

test('membership users need view_chats for customer detail', async () => {
  const calls = [];
  const response = await requestCustomer({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { view_chats: true },
    },
    calls,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['findById', CUSTOMER_ID, BUSINESS_ID]);

  const deniedCalls = [];
  const denied = await requestCustomer({
    authorization: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      membership: { business_id: BUSINESS_ID },
      permissions: { view_chats: false },
    },
    calls: deniedCalls,
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(deniedCalls, []);
});

test('membership users need manage_customers for customer update', async () => {
  const authorization = {
    authorized: true,
    source: 'membership',
    role: 'receptionist',
    membership: { business_id: BUSINESS_ID },
    permissions: { manage_customers: true },
  };
  const events = [];
  const calls = [];
  const response = await requestCustomer({
    authorization,
    calls,
    events,
    method: 'PUT',
    body: { name: 'Updated receptionist customer' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], ['findById', CUSTOMER_ID, BUSINESS_ID]);
  assert.deepEqual(calls[2], ['update', CUSTOMER_ID, BUSINESS_ID]);
  assert.equal(events[0].event_type, 'customer.updated');

  const deniedCalls = [];
  const denied = await requestCustomer({
    authorization: {
      ...authorization,
      permissions: { manage_customers: false },
    },
    calls: deniedCalls,
    method: 'PUT',
    body: { name: 'Should not update' },
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(deniedCalls, []);
});

test('membership users need manage_customers for customer deletion', async () => {
  const authorization = {
    authorized: true,
    source: 'membership',
    role: 'receptionist',
    membership: { business_id: BUSINESS_ID },
    permissions: { manage_customers: true },
  };
  const calls = [];
  const events = [];
  const response = await requestCustomer({
    authorization,
    calls,
    events,
    method: 'DELETE',
  });
  assert.equal(response.status, 204);
  assert.deepEqual(calls, [['remove', CUSTOMER_ID, BUSINESS_ID]]);
  assert.equal(events[0].event_type, 'customer.deleted');

  const deniedCalls = [];
  const denied = await requestCustomer({
    authorization: {
      ...authorization,
      permissions: { manage_customers: false },
    },
    calls: deniedCalls,
    method: 'DELETE',
  });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), {
    error: 'You do not have permission to manage customers.',
  });
  assert.deepEqual(deniedCalls, []);
});

test('cross-business detail and update requests are rejected before customer access', async () => {
  const authorization = {
    authorized: true,
    source: 'membership',
    role: 'receptionist',
    membership: { business_id: BUSINESS_ID },
    permissions: { view_chats: true, manage_customers: true },
  };
  const detailCalls = [];
  const detail = await requestCustomer({
    authorization,
    calls: detailCalls,
    path: `/${CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}`,
  });
  assert.equal(detail.status, 403);
  assert.deepEqual(detailCalls, []);

  const updateCalls = [];
  const update = await requestCustomer({
    authorization,
    calls: updateCalls,
    method: 'PUT',
    path: `/${CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}`,
    body: { name: 'Should not update' },
  });
  assert.equal(update.status, 403);
  assert.deepEqual(updateCalls, []);

  const deleteCalls = [];
  const deletion = await requestCustomer({
    authorization,
    calls: deleteCalls,
    method: 'DELETE',
    path: `/${CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}`,
  });
  assert.equal(deletion.status, 403);
  assert.deepEqual(deleteCalls, []);
});

test('permission lookup failures fail closed for detail and update', async () => {
  const detail = await requestCustomer({
    lookupError: { code: '42501', message: 'permission denied' },
  });
  assert.equal(detail.status, 500);
  assert.deepEqual(await detail.json(), {
    error: 'Unable to verify customer-detail access.',
  });

  const update = await requestCustomer({
    lookupError: { code: '42501', message: 'permission denied' },
    method: 'PUT',
    body: { name: 'Should not update' },
  });
  assert.equal(update.status, 500);
  assert.deepEqual(await update.json(), {
    error: 'Unable to verify customer-update access.',
  });

  const deletion = await requestCustomer({
    lookupError: { code: '42501', message: 'permission denied' },
    method: 'DELETE',
  });
  assert.equal(deletion.status, 500);
  assert.deepEqual(await deletion.json(), {
    error: 'Unable to verify customer-deletion access.',
  });
});

test('missing authorization context denies deletion before service access', async () => {
  const calls = [];
  const response = await requestCustomer({
    profileBusinessId: null,
    calls,
    method: 'DELETE',
    path: `/${CUSTOMER_ID}`,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'You do not have access to this business.',
  });
  assert.deepEqual(calls, []);
});
