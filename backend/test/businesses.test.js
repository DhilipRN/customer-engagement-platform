import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';

function createFakeBusinessService({ serviceCalls } = {}) {
  const businesses = [
    { id: BUSINESS_ID, name: 'Northwind Coffee', phone: '555-0100' },
    { id: OTHER_BUSINESS_ID, name: 'Southwind Coffee', phone: '555-0101' },
  ];

  return {
    async list() {
      return { data: businesses, error: null };
    },
    async findById(id) {
      return { data: businesses.find((business) => business.id === id) ?? null, error: null };
    },
    async create(values) {
      if (serviceCalls) serviceCalls.create += 1;
      const business = { id: '07373922-f6e5-4a5d-b855-4f14d762fce5', ...values };
      businesses.push(business);
      return { data: business, error: null };
    },
    async update(id, values) {
      if (serviceCalls) serviceCalls.update += 1;
      const business = businesses.find((item) => item.id === id);
      if (!business) {
        return { data: null, error: null };
      }
      Object.assign(business, values);
      return { data: business, error: null };
    },
    async remove(id) {
      if (serviceCalls) serviceCalls.remove += 1;
      const index = businesses.findIndex((business) => business.id === id);
      if (index === -1) {
        return { data: null, error: null };
      }
      return { data: businesses.splice(index, 1)[0], error: null };
    },
  };
}

function createFakeActivityEventService(events = [], { fail = false, error } = {}) {
  return {
    events,
    async create(event) {
      if (fail) {
        return {
          data: null,
          error: error ?? new Error('Simulated audit failure'),
        };
      }
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

async function withApi(callback, role = 'admin', businessId = null, options = {}) {
 const activityEventService = options.activityEventService ?? createFakeActivityEventService();
 const businessService = options.businessService ?? createFakeBusinessService({ serviceCalls: options.serviceCalls });
 const app = createApp({
  businessService,
  activityEventService,
  permissionService: options.permissionService ?? {
    async listAuthorizedBusinessIds(request) {
      return {
        data: request.profile.business_id ? [request.profile.business_id] : [],
        error: null,
      };
    },
    async getBusinessAuthorization(request, businessId) {
      if (request.profile.role === 'admin') {
        return {
          data: {
            authorized: true,
            source: 'admin',
            role: 'admin',
            permissions: Object.fromEntries([
              'view_chats',
              'view_customer_activity',
              'send_messages',
              'manage_customers',
            ].map((permission) => [permission, true])),
          },
          error: null,
        };
      }

      if (request.profile.business_id === businessId) {
        return {
          data: {
            authorized: true,
            source: 'legacy-client',
            role: 'client',
            permissions: { view_chats: true },
          },
          error: null,
        };
      }

      return { data: { authorized: false }, error: null };
    },
  },
  authMiddleware: (request, response, next) => {
    request.user = { id: 'user-1' };
    request.profile = { id: 'user-1', role, business_id: businessId };
    bypassAuth(request, response, next);
  },
});
  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, activityEventService);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('Business API supports listing and reading a business', async () => {
  await withApi(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/businesses`);
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).data[0].id, BUSINESS_ID);

    const detailResponse = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`);
    assert.equal(detailResponse.status, 200);
    assert.equal((await detailResponse.json()).data.name, 'Northwind Coffee');
  });
});

test('assigned clients can retrieve only their server-assigned business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/businesses/assigned?business_id=00000000-0000-4000-8000-000000000000`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      id: BUSINESS_ID,
      name: 'Northwind Coffee',
      phone: '555-0100',
    });
  }, 'client', BUSINESS_ID);
});

test('unassigned clients receive a clear no-business response', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/assigned`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'No business is assigned to this profile.',
    });
  }, 'client');
});

test('admins can discover all businesses through the accessible endpoint', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/accessible`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.map((business) => business.id), [
      BUSINESS_ID,
      OTHER_BUSINESS_ID,
    ]);
  });
});

test('legacy clients discover only their assigned business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/accessible`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.map((business) => business.id), [BUSINESS_ID]);
  }, 'client', BUSINESS_ID);
});

test('membership clients discover one or more server-authorized businesses', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/accessible`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.map((business) => business.id), [
      BUSINESS_ID,
      OTHER_BUSINESS_ID,
    ]);
  }, 'client', null, {
    permissionService: {
      async listAuthorizedBusinessIds() {
        return {
          data: [BUSINESS_ID, OTHER_BUSINESS_ID],
          error: null,
        };
      },
    },
  });
});

test('business discovery fails closed when membership lookup fails', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/accessible`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to process the business request.',
    });
  }, 'client', null, {
    permissionService: {
      async listAuthorizedBusinessIds() {
        return {
          data: null,
          error: new Error('business_memberships unavailable'),
        };
      },
    },
  });
});

test('admins receive effective permissions for an existing business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}/permissions`);

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.business_id, BUSINESS_ID);
    assert.equal(result.data.source, 'admin');
    assert.equal(result.data.permissions.view_chats, true);
  });
});

test('legacy clients receive permissions only for their assigned business', async () => {
  await withApi(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}/permissions`);
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).data.source, 'legacy-client');

    const denied = await fetch(`${baseUrl}/businesses/${OTHER_BUSINESS_ID}/permissions`);
    assert.equal(denied.status, 403);
  }, 'client', BUSINESS_ID);
});

test('membership clients receive the effective permission map for the authorized business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}/permissions`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, {
      business_id: BUSINESS_ID,
      source: 'membership',
      role: 'receptionist',
      permissions: { view_chats: true, view_campaigns: false },
    });

    const crossBusiness = await fetch(`${baseUrl}/businesses/${OTHER_BUSINESS_ID}/permissions`);
    assert.equal(crossBusiness.status, 403);
  }, 'client', OTHER_BUSINESS_ID, {
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (businessId !== BUSINESS_ID) return { data: { authorized: false }, error: null };
        return {
          data: {
            authorized: true,
            source: 'membership',
            role: 'receptionist',
            permissions: { view_chats: true, view_campaigns: false },
          },
          error: null,
        };
      },
    },
  });
});

test('permission discovery fails closed when authorization lookup fails', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}/permissions`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to process the business request.',
    });
  }, 'client', BUSINESS_ID, {
    permissionService: {
      async getBusinessAuthorization() {
        return { data: null, error: new Error('permission lookup failed') };
      },
    },
  });
});

test('admins retain business-management access and do not use assigned-client lookup', async () => {
  await withApi(async (baseUrl) => {
    const managementResponse = await fetch(`${baseUrl}/businesses`);
    assert.equal(managementResponse.status, 200);

    const assignedResponse = await fetch(`${baseUrl}/businesses/assigned`);
    assert.equal(assignedResponse.status, 404);
  });
});

test('Business API validates and creates a business', async () => {
  await withApi(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' }),
    });
    assert.equal(invalidResponse.status, 400);

    const createResponse = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Sunset Bakery  ', google_review_link: 'https://example.com/reviews' }),
    });
    assert.equal(createResponse.status, 201);
    assert.deepEqual(await createResponse.json(), {
      data: {
        id: '07373922-f6e5-4a5d-b855-4f14d762fce5',
        name: 'Sunset Bakery',
        google_review_link: 'https://example.com/reviews',
      },
    });
  });
});

test('Business API updates and deletes a business', async () => {
  await withApi(async (baseUrl) => {
    const updateResponse = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '42 Market Street' }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.address, '42 Market Street');

    const deleteResponse = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);

    const missingResponse = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`);
    assert.equal(missingResponse.status, 404);
  });
});

test('Business API rejects invalid identifiers', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/businesses/not-a-uuid`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'business id must be a valid UUID.' });
  });
});

test('Business API denies all management endpoints to clients', async () => {
  const serviceCalls = { create: 0, update: 0, remove: 0 };

  await withApi(async (baseUrl) => {
    const requests = [
      fetch(`${baseUrl}/businesses`),
      fetch(`${baseUrl}/businesses/${BUSINESS_ID}`),
      fetch(`${baseUrl}/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Business' }),
      }),
      fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized Update' }),
      }),
      fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, { method: 'DELETE' }),
    ];

    const responses = await Promise.all(requests);
    assert.deepEqual(
      responses.map((response) => response.status),
      [403, 403, 403, 403, 403],
    );
    assert.equal(serviceCalls.create, 0);
    assert.equal(serviceCalls.update, 0);
    assert.equal(serviceCalls.remove, 0);
  }, 'client', null, { serviceCalls });
});

test('Business API records create, update, and delete audit events', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sunset Bakery',
        phone: '555-0199',
        google_review_link: 'https://example.com/reviews',
      }),
    });
    assert.equal(created.status, 201);

    const updated = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '42 Market Street' }),
    });
    assert.equal(updated.status, 200);

    const deleted = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
  }, 'admin', null, { activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), [
    'business.created',
    'business.updated',
    'business.deleted',
  ]);
  assert.equal(events[0].entity_type, 'business');
  assert.equal(events[0].entity_id, '07373922-f6e5-4a5d-b855-4f14d762fce5');
  assert.deepEqual(events[1].before, { address: undefined });
  assert.deepEqual(events[1].after, { address: '42 Market Street' });
  assert.deepEqual(events[2].before, {
    name: 'Northwind Coffee',
    phone: '555-0100',
    address: '42 Market Street',
  });
  assert.equal(events[2].customer_id, null);
});

test('Business API reports audit persistence failures explicitly', async () => {
  const failingAudit = createFakeActivityEventService([], {
    fail: true,
    error: {
      code: '42501',
      message: 'permission denied for table activity_events; key=sb_secret_test-secret',
    },
  });
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args);

  try {
    await withApi(async (baseUrl) => {
      const created = await fetch(`${baseUrl}/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Audit Failure Business' }),
      });
      assert.equal(created.status, 201);
      const createdResult = await created.json();
      assert.equal(createdResult.data.name, 'Audit Failure Business');
      assert.equal(createdResult.warning, 'Audit event could not be recorded.');
    }, 'admin', null, { activityEventService: failingAudit });

    await withApi(async (baseUrl) => {
      const updated = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: 'Audit Failure Address' }),
      });
      assert.equal(updated.status, 200);
      const updatedResult = await updated.json();
      assert.equal(updatedResult.data.address, 'Audit Failure Address');
      assert.equal(updatedResult.warning, 'Audit event could not be recorded.');
    }, 'admin', null, { activityEventService: failingAudit });

    await withApi(async (baseUrl) => {
      const deleted = await fetch(`${baseUrl}/businesses/${BUSINESS_ID}`, {
        method: 'DELETE',
      });
      assert.equal(deleted.status, 200);
      const deletedResult = await deleted.json();
      assert.equal(deletedResult.data.id, BUSINESS_ID);
      assert.equal(deletedResult.warning, 'Audit event could not be recorded.');
    }, 'admin', null, { activityEventService: failingAudit });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(logs, [
    [
      'Business audit event persistence failed',
      {
        operation: 'create',
        event_type: 'business.created',
        error: {
          code: '42501',
          message: 'permission denied for table activity_events; key=[REDACTED_KEY]',
        },
      },
    ],
    [
      'Business audit event persistence failed',
      {
        operation: 'update',
        event_type: 'business.updated',
        error: {
          code: '42501',
          message: 'permission denied for table activity_events; key=[REDACTED_KEY]',
        },
      },
    ],
    [
      'Business audit event persistence failed',
      {
        operation: 'delete',
        event_type: 'business.deleted',
        error: {
          code: '42501',
          message: 'permission denied for table activity_events; key=[REDACTED_KEY]',
        },
      },
    ],
  ]);
});

test('Business API does not record events for rejected operations', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(invalid.status, 400);

    const missing = await fetch(`${baseUrl}/businesses/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE',
    });
    assert.equal(missing.status, 404);
  }, 'admin', null, { activityEventService });

  assert.equal(events.length, 0);
});
