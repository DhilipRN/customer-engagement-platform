import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createCustomersRouter } from '../src/routes/customers.js';
import { createMessagesRouter } from '../src/routes/messages.js';
import { createCampaignsRouter } from '../src/routes/campaigns.js';
import { createMessageTemplatesRouter } from '../src/routes/messageTemplates.js';
import { createPurchasesRouter } from '../src/routes/purchases.js';
import { createAppointmentsRouter } from '../src/routes/Appointments.js';
import { createReviewAutomationsRouter } from '../src/routes/reviewAutomations.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const MESSAGE_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';
const OTHER_MESSAGE_ID = '8d12bc49-7b2c-4c83-94dc-b5f6bb027f72';
const CAMPAIGN_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';

function membershipAccess({ authorizedBusinessId = BUSINESS_ID, missingContext = false } = {}) {
  return (request, response, next) => {
    const requestedBusinessId = request.query?.business_id ||
      request.body?.business_id ||
      authorizedBusinessId;

    if (missingContext) {
      request.businessAuthorization = {
        authorized: true,
        source: 'membership',
        membership: null,
      };
      return next();
    }

    if (requestedBusinessId !== authorizedBusinessId) {
      return response.status(403).json({
        error: 'You do not have access to this business.',
      });
    }

    request.businessAuthorization = {
      authorized: true,
      source: 'membership',
      membership: { business_id: authorizedBusinessId },
      permissions: {
        view_chats: true,
        manage_customers: true,
        send_messages: true,
      },
    };
    return next();
  };
}

function createCustomerRouter({ accessMiddleware, calls }) {
  const customers = [
    { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Business customer', phone: '9876543210' },
    { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID, name: 'Other customer', phone: '9876543211' },
  ];

  return createCustomersRouter({
    businessAccessMiddleware: accessMiddleware,
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
      async create() {
        return { data: { id: 'event-1' }, error: null };
      },
    },
  });
}

function createMessageRouter({ accessMiddleware, calls }) {
  const messages = [
    { id: MESSAGE_ID, business_id: BUSINESS_ID, customer_id: CUSTOMER_ID, message_text: 'Business message', status: 'pending' },
    { id: OTHER_MESSAGE_ID, business_id: OTHER_BUSINESS_ID, customer_id: OTHER_CUSTOMER_ID, message_text: 'Other message', status: 'pending' },
  ];

  return createMessagesRouter({
    businessAccessMiddleware: accessMiddleware,
    messageService: {
      async findById(id, businessId = null) {
        calls.push(['findById', id, businessId]);
        return {
          data: messages.find((message) => (
            message.id === id && (!businessId || message.business_id === businessId)
          )) ?? null,
          error: null,
        };
      },
      async update(id, values, businessId = null) {
        calls.push(['update', id, businessId]);
        const message = messages.find((item) => (
          item.id === id && (!businessId || item.business_id === businessId)
        ));
        return { data: message ? { ...message, ...values } : null, error: null };
      },
      async remove(id, businessId = null) {
        calls.push(['remove', id, businessId]);
        const message = messages.find((item) => (
          item.id === id && (!businessId || item.business_id === businessId)
        ));
        return { data: message ?? null, error: null };
      },
    },
  });
}

async function requestRoute({ router, basePath, method, path, profile, body } = {}) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = profile;
    next();
  });
  app.use(basePath, router);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(`http://127.0.0.1:${server.address().port}${basePath}${path}`, {
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

test('membership business scope is used when profile.business_id is null', async () => {
  const customerCalls = [];
  const customerProfile = { id: 'user-1', role: 'client', business_id: null };
  const customerRouter = createCustomerRouter({
    accessMiddleware: membershipAccess(),
    calls: customerCalls,
  });

  const customerResponse = await requestRoute({
    router: customerRouter,
    basePath: '/customers',
    method: 'GET',
    path: `/${CUSTOMER_ID}?business_id=${BUSINESS_ID}`,
    profile: customerProfile,
  });
  assert.equal(customerResponse.status, 200);
  assert.deepEqual(customerCalls[0], ['findById', CUSTOMER_ID, BUSINESS_ID]);

  const messageCalls = [];
  const messageRouter = createMessageRouter({
    accessMiddleware: membershipAccess(),
    calls: messageCalls,
  });
  const messageResponse = await requestRoute({
    router: messageRouter,
    basePath: '/messages',
    method: 'PUT',
    path: `/${MESSAGE_ID}?business_id=${BUSINESS_ID}`,
    profile: customerProfile,
    body: { message_text: 'Updated' },
  });
  assert.equal(messageResponse.status, 200);
  assert.deepEqual(messageCalls[0], ['findById', MESSAGE_ID, BUSINESS_ID]);
  assert.deepEqual(messageCalls[1], ['update', MESSAGE_ID, BUSINESS_ID]);
});

test('membership scope wins over a different legacy profile business', async () => {
  const profile = { id: 'user-1', role: 'client', business_id: OTHER_BUSINESS_ID };
  const customerCalls = [];
  const customerRouter = createCustomerRouter({
    accessMiddleware: membershipAccess(),
    calls: customerCalls,
  });

  const customerResponse = await requestRoute({
    router: customerRouter,
    basePath: '/customers',
    method: 'GET',
    path: `/${OTHER_CUSTOMER_ID}?business_id=${BUSINESS_ID}`,
    profile,
  });
  assert.equal(customerResponse.status, 404);
  assert.deepEqual(customerCalls[0], ['findById', OTHER_CUSTOMER_ID, BUSINESS_ID]);

  const messageCalls = [];
  const messageRouter = createMessageRouter({
    accessMiddleware: membershipAccess(),
    calls: messageCalls,
  });
  const messageResponse = await requestRoute({
    router: messageRouter,
    basePath: '/messages',
    method: 'PUT',
    path: `/${OTHER_MESSAGE_ID}?business_id=${BUSINESS_ID}`,
    profile,
    body: { message_text: 'Should not update' },
  });
  assert.equal(messageResponse.status, 404);
  assert.deepEqual(messageCalls, [['findById', OTHER_MESSAGE_ID, BUSINESS_ID]]);
});

test('cross-business customer and message mutations are rejected before service access', async () => {
  const profile = { id: 'user-1', role: 'client', business_id: BUSINESS_ID };
  const customerCalls = [];
  const customerRouter = createCustomerRouter({
    accessMiddleware: membershipAccess(),
    calls: customerCalls,
  });
  const customerPaths = [
    { method: 'GET', path: `/${OTHER_CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}` },
    { method: 'PUT', path: `/${CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}`, body: { name: 'Nope' } },
    { method: 'DELETE', path: `/${CUSTOMER_ID}?business_id=${OTHER_BUSINESS_ID}` },
  ];

  for (const request of customerPaths) {
    const response = await requestRoute({
      router: customerRouter,
      basePath: '/customers',
      profile,
      ...request,
    });
    assert.equal(response.status, 403);
  }
  assert.deepEqual(customerCalls, []);

  const messageCalls = [];
  const messageRouter = createMessageRouter({
    accessMiddleware: membershipAccess(),
    calls: messageCalls,
  });
  for (const request of [
    { method: 'PUT', path: `/${MESSAGE_ID}?business_id=${OTHER_BUSINESS_ID}`, body: { message_text: 'Nope' } },
    { method: 'DELETE', path: `/${MESSAGE_ID}?business_id=${OTHER_BUSINESS_ID}` },
  ]) {
    const response = await requestRoute({
      router: messageRouter,
      basePath: '/messages',
      profile,
      ...request,
    });
    assert.equal(response.status, 403);
  }
  assert.deepEqual(messageCalls, []);
});

test('missing authorized business context fails closed without unscoped lookups', async () => {
  const profile = { id: 'user-1', role: 'client', business_id: null };
  const customerCalls = [];
  const customerResponse = await requestRoute({
    router: createCustomerRouter({
      accessMiddleware: membershipAccess({ missingContext: true }),
      calls: customerCalls,
    }),
    basePath: '/customers',
    method: 'GET',
    path: `/${CUSTOMER_ID}`,
    profile,
  });
  assert.equal(customerResponse.status, 403);
  assert.deepEqual(customerCalls, []);

  const messageCalls = [];
  const messageResponse = await requestRoute({
    router: createMessageRouter({
      accessMiddleware: membershipAccess({ missingContext: true }),
      calls: messageCalls,
    }),
    basePath: '/messages',
    method: 'DELETE',
    path: `/${MESSAGE_ID}`,
    profile,
  });
  assert.equal(messageResponse.status, 403);
  assert.deepEqual(messageCalls, []);
});

test('admin and legacy client scopes remain compatible', async () => {
  const adminCalls = [];
  const adminResponse = await requestRoute({
    router: createCustomerRouter({
      accessMiddleware: (_request, _response, next) => next(),
      calls: adminCalls,
    }),
    basePath: '/customers',
    method: 'GET',
    path: `/${CUSTOMER_ID}`,
    profile: { id: 'admin-1', role: 'admin', business_id: null },
  });
  assert.equal(adminResponse.status, 200);
  assert.deepEqual(adminCalls[0], ['findById', CUSTOMER_ID, null]);

  const legacyCalls = [];
  const legacyResponse = await requestRoute({
    router: createMessageRouter({
      accessMiddleware: (_request, _response, next) => next(),
      calls: legacyCalls,
    }),
    basePath: '/messages',
    method: 'DELETE',
    path: `/${MESSAGE_ID}`,
    profile: { id: 'client-1', role: 'client', business_id: BUSINESS_ID },
  });
  assert.equal(legacyResponse.status, 403);
  assert.deepEqual(legacyCalls, []);
});

test('membership scope is used for remaining business-owned detail lookups', async () => {
  const profile = { id: 'user-1', role: 'client', business_id: OTHER_BUSINESS_ID };
  const routes = [
    {
      router: createCampaignsRouter({
        businessAccessMiddleware: membershipAccess(),
        campaignService: {
          async findById(id, businessId) {
            assert.deepEqual([id, businessId], [CAMPAIGN_ID, BUSINESS_ID]);
            return { data: null, error: null };
          },
        },
      }),
      basePath: '/campaigns',
      path: `/${CAMPAIGN_ID}`,
    },
    {
      router: createMessageTemplatesRouter({
        businessAccessMiddleware: membershipAccess(),
        messageTemplateService: {
          async findById(id, businessId) {
            assert.deepEqual([id, businessId], [TEMPLATE_ID, BUSINESS_ID]);
            return { data: null, error: null };
          },
        },
      }),
      basePath: '/message-templates',
      path: `/${TEMPLATE_ID}`,
    },
    {
      router: createPurchasesRouter({
        businessAccessMiddleware: membershipAccess(),
        purchaseService: {
          async findById(id, businessId) {
            assert.deepEqual([id, businessId], [CUSTOMER_ID, BUSINESS_ID]);
            return { data: null, error: null };
          },
        },
      }),
      basePath: '/purchases',
      path: `/${CUSTOMER_ID}`,
    },
    {
      router: createAppointmentsRouter({
        businessAccessMiddleware: membershipAccess(),
        appointmentService: {
          async findById(id, businessId) {
            assert.deepEqual([id, businessId], [CUSTOMER_ID, BUSINESS_ID]);
            return { data: null, error: null };
          },
        },
      }),
      basePath: '/appointments',
      path: `/${CUSTOMER_ID}`,
    },
    {
      router: createReviewAutomationsRouter({
        businessAccessMiddleware: membershipAccess(),
        reviewAutomationService: {
          async findById(id, businessId) {
            assert.deepEqual([id, businessId], [CUSTOMER_ID, BUSINESS_ID]);
            return { data: null, error: null };
          },
        },
      }),
      basePath: '/review-automations',
      path: `/${CUSTOMER_ID}`,
    },
  ];

  for (const route of routes) {
    const response = await requestRoute({
      router: route.router,
      basePath: route.basePath,
      method: 'GET',
      path: route.path,
      profile,
    });
    assert.equal(response.status, 404);
  }
});
