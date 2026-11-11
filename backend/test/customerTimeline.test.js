import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createBusinessAccessMiddleware } from '../src/middleware/auth.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = 'a8a4f8b3-3a27-4f1f-9e0f-6ef4e2e6b9a1';

function createServices() {
  const messages = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      message_text: 'Older message',
      status: 'sent',
      created_at: '2026-10-08T10:00:00.000Z',
      source: 'campaign',
      template_id: null,
      campaign_id: null,
      appointment_id: null,
      purchase_id: null,
      scheduled_at: null,
      sent_at: '2026-10-08T10:01:00.000Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      message_text: 'Newest message',
      status: 'queued',
      created_at: '2026-10-10T10:00:00.000Z',
      source: 'customer_comeback',
      template_id: null,
      campaign_id: null,
      appointment_id: null,
      purchase_id: null,
      scheduled_at: '2026-10-10T10:00:00.000Z',
      sent_at: null,
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
      message_text: 'Other business message',
      status: 'sent',
      created_at: '2026-10-12T10:00:00.000Z',
    },
  ];

  const events = [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      visibility: 'audit_only',
      event_type: 'customer.updated',
      entity_type: 'customer',
      actor_type: 'user',
      actor_user_id: null,
      occurred_at: '2026-10-11T10:00:00.000Z',
      recorded_at: '2026-10-11T10:00:01.000Z',
      is_reconstructed: false,
      before: null,
      after: null,
      metadata: null,
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      visibility: 'customer_timeline',
      event_type: 'customer.created',
      entity_type: 'customer',
      actor_type: 'user',
      actor_user_id: null,
      occurred_at: '2026-10-10T10:00:00.000Z',
      recorded_at: '2026-10-10T10:00:01.000Z',
      is_reconstructed: true,
      before: null,
      after: { name: 'Customer' },
      metadata: null,
    },
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
      visibility: 'customer_timeline',
      event_type: 'customer.created',
      entity_type: 'customer',
      actor_type: 'user',
      actor_user_id: null,
      occurred_at: '2026-10-12T10:00:00.000Z',
      is_reconstructed: false,
    },
  ];

  return {
    businessService: {
      async findById(id) {
        return {
          data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id } : null,
          error: null,
        };
      },
    },
    customerService: {
      async findById(id, businessId) {
        const customer = id === CUSTOMER_ID
          ? { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer' }
          : id === OTHER_CUSTOMER_ID
            ? { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID, name: 'Other' }
            : null;
        return {
          data: customer && customer.business_id === businessId ? customer : null,
          error: null,
        };
      },
    },
    messageService: {
      async listByCustomerId(businessId, customerId) {
        return {
          data: messages.filter(
            (message) => message.business_id === businessId && message.customer_id === customerId,
          ),
          error: null,
        };
      },
    },
    activityEventService: {
      async listCustomerTimeline(businessId, customerId) {
        return {
          data: events.filter(
            (event) => event.business_id === businessId && event.customer_id === customerId,
          ),
          error: null,
        };
      },
    },
  };
}

async function withApi(
  callback,
  authMiddleware = (_request, _response, next) => next(),
  { businessAccessMiddleware } = {},
) {
  const app = createApp({
    ...createServices(),
    authMiddleware,
    businessAccessMiddleware,
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

function membershipAccess(permissions, { lookupError = null } = {}) {
  const authMiddleware = (request, _response, next) => {
    request.profile = {
      id: 'receptionist-1',
      role: 'client',
      business_id: BUSINESS_ID,
    };
    request.user = { id: 'receptionist-1' };
    next();
  };
  const businessAccessMiddleware = createBusinessAccessMiddleware({
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        if (lookupError) {
          return { data: null, error: lookupError };
        }

        return {
          data: {
            authorized: businessId === BUSINESS_ID,
            source: 'membership',
            role: 'receptionist',
            permissions,
          },
          error: null,
        };
      },
    },
  });

  return { authMiddleware, businessAccessMiddleware };
}

test('customer timeline merges messages and visible activity in deterministic order', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&limit=2`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].type, 'message');
    assert.equal(body.data[0].message.message_text, 'Newest message');
    assert.equal(body.data[1].type, 'activity');
    assert.equal(body.data[1].label, 'Customer Created');
    assert.equal(body.data[1].is_reconstructed, true);
    assert.equal(body.has_more, true);
  });
});

test('customer timeline paginates and excludes audit-only events', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&page=2&limit=2`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].type, 'message');
    assert.equal(body.data[0].message.message_text, 'Older message');
    assert.equal(body.data.some((item) => item.activity?.event_type === 'customer.updated'), false);
    assert.equal(body.has_more, false);
  });
});

test('client timeline access uses the assigned business and rejects a mismatched query business', async () => {
  const clientAuth = (request, _response, next) => {
    request.user = { id: '11111111-1111-4111-8111-111111111111' };
    request.profile = {
      id: request.user.id,
      role: 'client',
      business_id: BUSINESS_ID,
    };
    next();
  };
  const clientBusinessAccess = createBusinessAccessMiddleware({
    permissionService: {
      async getBusinessAuthorization(_request, businessId) {
        return {
          data: {
            authorized: businessId === BUSINESS_ID,
            source: 'legacy-client',
            permissions: {
              view_chats: true,
              view_customer_activity: true,
            },
          },
          error: null,
        };
      },
    },
  });

  await withApi(async (baseUrl) => {
    const assignedResponse = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}/timeline`);
    assert.equal(assignedResponse.status, 200);
    assert.equal((await assignedResponse.json()).data.length, 3);

    const otherBusinessResponse = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${OTHER_BUSINESS_ID}`,
    );
    assert.equal(otherBusinessResponse.status, 403);
  }, clientAuth, { businessAccessMiddleware: clientBusinessAccess });
});

test('customer timeline denies unauthenticated requests and cross-business customers', async () => {
  await withApi(async (baseUrl) => {
    const unauthenticated = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}`,
    );
    assert.equal(unauthenticated.status, 401);
  }, (_request, response) => response.status(401).json({ error: 'Authentication required.' }));

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${OTHER_CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}`,
    );
    assert.equal(response.status, 404);
  });
});

test('admin timeline validates pagination and requires a business selection', async () => {
  await withApi(async (baseUrl) => {
    const missingBusiness = await fetch(`${baseUrl}/customers/${CUSTOMER_ID}/timeline`);
    assert.equal(missingBusiness.status, 400);

    const invalidPagination = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&limit=51`,
    );
    assert.equal(invalidPagination.status, 400);
  });
});

test('receptionists with view_chats but without activity permission receive messages only', async () => {
  const access = membershipAccess({
    view_chats: true,
    view_customer_activity: false,
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&limit=1`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].type, 'message');
    assert.equal(body.has_more, true);
    assert.equal(body.data.some((item) => item.type === 'activity'), false);
  }, access.authMiddleware, access);
});

test('receptionists with both timeline permissions receive messages and customer activity', async () => {
  const access = membershipAccess({
    view_chats: true,
    view_customer_activity: true,
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&limit=2`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 2);
    assert.equal(body.data.some((item) => item.type === 'message'), true);
    assert.equal(body.data.some((item) => item.type === 'activity'), true);
    assert.equal(body.has_more, true);
  }, access.authMiddleware, access);
});

test('receptionists without view_chats receive 403 before timeline loading', async () => {
  const access = membershipAccess({
    view_chats: false,
    view_customer_activity: true,
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}`,
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'You do not have permission to view chats.',
    });
  }, access.authMiddleware, access);
});

test('filtered timeline pagination reports has_more from messages only', async () => {
  const access = membershipAccess({
    view_chats: true,
    view_customer_activity: false,
  });

  await withApi(async (baseUrl) => {
    const pageOne = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&page=1&limit=1`,
    );
    const pageTwo = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}&page=2&limit=1`,
    );

    assert.equal(pageOne.status, 200);
    assert.equal(pageTwo.status, 200);
    assert.equal((await pageOne.json()).has_more, true);
    assert.equal((await pageTwo.json()).has_more, false);
  }, access.authMiddleware, access);
});

test('membership timeline authorization rejects another business and lookup failures', async () => {
  const access = membershipAccess({
    view_chats: true,
    view_customer_activity: true,
  });

  await withApi(async (baseUrl) => {
    const crossBusiness = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${OTHER_BUSINESS_ID}`,
    );
    assert.equal(crossBusiness.status, 403);
  }, access.authMiddleware, access);

  const failingAccess = membershipAccess(
    { view_chats: true, view_customer_activity: true },
    { lookupError: { code: '42501', message: 'permission denied' } },
  );

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/${CUSTOMER_ID}/timeline?business_id=${BUSINESS_ID}`,
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to verify business access.',
    });
  }, failingAccess.authMiddleware, failingAccess);
});
