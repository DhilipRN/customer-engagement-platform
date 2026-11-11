import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createBusinessAccessMiddleware } from '../src/middleware/auth.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';
const OTHER_TEMPLATE_ID = '6a1e6a9d-0a1a-4a4a-8a1a-123456789abc';

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createServices({
  customer = { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer A', consent_given: true },
  purchases = [{
    id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61',
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    product_name: 'Coffee subscription',
    purchase_date: dateOffset(-61),
  }],
  appointments = [],
  template = {
    id: TEMPLATE_ID,
    business_id: BUSINESS_ID,
    message: 'Hi {{customer_name}}, visit {{business_name}} again.',
  },
  exclusions = [],
  createMessage,
  messageCalls = { create: 0 },
} = {}) {
  const created = [];

  return {
    businessService: {
      findById: async (id) => ({
        data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id)
          ? { id, name: 'Test Business', google_review_link: 'https://example.com/review' }
          : null,
        error: null,
      }),
    },
    customerService: {
      findById: async (id, businessId) => ({
        data: id === customer.id && businessId === customer.business_id
          ? customer
          : id === OTHER_CUSTOMER_ID && businessId === OTHER_BUSINESS_ID
            ? { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID, name: 'Other', consent_given: true }
            : null,
        error: null,
      }),
    },
    purchaseService: {
      list: async ({ businessId, customerId }) => ({
        data: purchases.filter((purchase) =>
          purchase.business_id === businessId && purchase.customer_id === customerId
        ),
        error: null,
      }),
    },
    appointmentService: {
      listCompletedByBusinessId: async (businessId) => ({
        data: appointments.filter((appointment) => appointment.business_id === businessId),
        error: null,
      }),
    },
    messageTemplateService: {
      findById: async (id, businessId) => ({
        data: id === template.id && businessId === template.business_id
          ? template
          : id === OTHER_TEMPLATE_ID && businessId === OTHER_BUSINESS_ID
            ? { id: OTHER_TEMPLATE_ID, business_id: OTHER_BUSINESS_ID, message: 'Other' }
            : null,
        error: null,
      }),
    },
    exclusionService: {
      listByBusinessId: async (businessId) => ({
        data: exclusions.filter((exclusion) => exclusion.business_id === businessId),
        error: null,
      }),
    },
    messageService: {
      create: async (values) => {
        messageCalls.create += 1;
        return createMessage
          ? createMessage(values, created)
          : (created.push(values), { data: { id: '2205fdc5-37a0-4390-a4b9-47914f3aadb5', ...values }, error: null });
      },
    },
    created,
    messageCalls,
  };
}

async function withApi(callback, {
  profile = { id: 'test-user-id', role: 'admin', business_id: null },
  services = createServices(),
  authMiddleware,
  businessAccessMiddleware = createBusinessAccessMiddleware({
    permissionService: {
      async getBusinessAuthorization(request, businessId) {
        if (request.user?.id !== request.profile?.id) {
          return { data: { authorized: false }, error: null };
        }

        if (request.profile.role === 'admin') {
          return { data: { authorized: true }, error: null };
        }

        return {
          data: {
            authorized: request.profile.role === 'client' &&
              request.profile.business_id === businessId,
            source: 'legacy-client',
            permissions: {
              view_automations: true,
              manage_automations: true,
            },
          },
          error: null,
        };
      },
    },
  }),
} = {}) {
  const app = createApp({
    ...services,
    customerComebackMessageService: services.messageService,
    customerComebackExclusionService: services.exclusionService,
    businessAccessMiddleware,
    authMiddleware: authMiddleware ?? ((request, response, next) => {
      request.profile = profile;
      request.user = { id: 'test-user-id' };
      bypassAuth(request, response, next);
    }),
  });
  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, services);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function requestBody(overrides = {}) {
  return {
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    template_id: TEMPLATE_ID,
    days: 30,
    ...overrides,
  };
}

test('Customer Comeback messages queue a scoped, rendered message', async () => {
  await withApi(async (url, services) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });

    assert.equal(response.status, 201);
    const message = (await response.json()).data;
    assert.equal(message.business_id, BUSINESS_ID);
    assert.equal(message.customer_id, CUSTOMER_ID);
    assert.equal(message.status, 'queued');
    assert.equal(message.source, 'customer_comeback');
    assert.deepEqual(message.metadata, { inactivity_days: 30 });
    assert.equal(message.campaign_id, null);
    assert.match(message.idempotency_key, new RegExp(`^customer_comeback:${BUSINESS_ID}:${CUSTOMER_ID}:`));
    assert.equal(message.message_text, 'Hi Customer A, visit Test Business again.');
    assert.equal(services.created.length, 1);
  });
});

test('Customer Comeback queue metadata and idempotency keys reflect 30, 60, and 90 days', async () => {
  for (const days of [30, 60, 90]) {
    const services = createServices({
      purchases: [{
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        purchase_date: dateOffset(-91),
      }],
    });

    await withApi(async (url) => {
      const response = await fetch(`${url}/customer-comeback-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody({ days })),
      });

      assert.equal(response.status, 201);
      const message = (await response.json()).data;
      assert.equal(message.status, 'queued');
      assert.equal(message.source, 'customer_comeback');
      assert.deepEqual(message.metadata, { inactivity_days: days });
      assert.equal(
        message.idempotency_key,
        `customer_comeback:${BUSINESS_ID}:${CUSTOMER_ID}:${TEMPLATE_ID}:${days}`,
      );
      assert.equal(services.created.length, 1);
    }, { services });
  }
});

test('Customer Comeback messages use the client assigned business and reject tampering', async () => {
  await withApi(async (url, services) => {
    const valid = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody(), business_id: undefined }),
    });
    assert.equal(valid.status, 201);
    assert.equal(services.messageCalls.create, 1);

    const tampered = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody({ business_id: OTHER_BUSINESS_ID })),
    });
    assert.equal(tampered.status, 403);
    assert.equal(services.messageCalls.create, 1);
  }, { profile: { id: 'test-user-id', role: 'client', business_id: BUSINESS_ID } });
});

test('Customer Comeback messages deny mismatched profile and user identities', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...requestBody(), business_id: undefined }),
    });

    assert.equal(response.status, 403);
  }, {
    profile: { id: 'different-user-id', role: 'client', business_id: BUSINESS_ID },
  });
});

test('Customer Comeback messages enforce consent and persistent exclusions', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /consent/i);
  }, {
    services: createServices({
      customer: { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Customer A', consent_given: false },
    }),
  });

  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /excluded/i);
  }, {
    services: createServices({
      exclusions: [{ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
    }),
  });
});

test('Customer Comeback messages reject recent activity and wrong-business templates', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not currently eligible/i);
  }, {
    services: createServices({
      appointments: [{
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        appointment_date: dateOffset(-1),
        status: 'completed',
      }],
    }),
  });

  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody({ template_id: OTHER_TEMPLATE_ID })),
    });
    assert.equal(response.status, 404);
  });
});

test('Customer Comeback messages reject unresolved template variables', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unavailable/i);
  }, {
    services: createServices({
      template: {
        id: TEMPLATE_ID,
        business_id: BUSINESS_ID,
        message: 'Purchase: {{product_name}} on {{purchase_date}} at {{review_link}}',
      },
      purchases: [{
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        purchase_date: dateOffset(-61),
      }],
    }),
  });
});

test('Customer Comeback messages handle duplicate idempotency keys without a second queue insert', async () => {
  let createCalls = 0;
  await withApi(async (url, services) => {
    const body = JSON.stringify(requestBody());
    const first = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${url}/customer-comeback-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(second.status, 409);
    assert.equal(services.created.length, 1);
  }, {
    services: createServices({
      createMessage: (values, created) => {
        createCalls += 1;
        if (createCalls === 1) {
          created.push(values);
          return { data: { id: 'message-1' }, error: null };
        }

        return { data: null, error: { code: '23505' } };
      },
    }),
  });
});
