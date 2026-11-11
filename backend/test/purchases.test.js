
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const PURCHASE_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';
const OTHER_PURCHASE_ID = 'f4b0c1dd-9f3a-4f92-a5fb-4e0f2d7e1c61';
const TEMPLATE_ID = '6a1e6a9d-0a1a-4a4a-8a1a-123456789abc';

function createFakeBusinessService() {
  return {
    async findById(id) {
      const businesses = {
        [BUSINESS_ID]: {
          id: BUSINESS_ID,
          name: 'Coffee House',
          google_review_link: 'https://example.com/review',
        },
        [OTHER_BUSINESS_ID]: {
          id: OTHER_BUSINESS_ID,
          name: 'Other Business',
          google_review_link: 'https://example.com/other-review',
        },
      };

      return { data: businesses[id] ?? null, error: null };
    },
  };
}

function createFakeCustomerService({ consentGiven = true } = {}) {
  return {
    async findById(id) {
      const customers = {
        [CUSTOMER_ID]: {
          id: CUSTOMER_ID,
          name: 'Dhilip',
          business_id: BUSINESS_ID,
          consent_given: consentGiven,
        },
        [OTHER_CUSTOMER_ID]: {
          id: OTHER_CUSTOMER_ID,
          name: 'Other Customer',
          business_id: OTHER_BUSINESS_ID,
          consent_given: consentGiven,
        },
      };

      return { data: customers[id] ?? null, error: null };
    },
  };
}

function createFakePurchaseService({ onCreate } = {}) {
  const purchases = [{
    id: PURCHASE_ID,
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    product_name: 'Coffee subscription',
    amount: 24.5,
    purchase_date: '2026-09-13',
  }];

  return {
    async list({ businessId, customerId }) {
      return {
        data: purchases.filter((purchase) => (
          purchase.business_id === businessId &&
          (!customerId || purchase.customer_id === customerId)
        )),
        error: null,
      };
    },

    async findById(id, businessId = null) {
  return {
    data: purchases.find((purchase) => (
      purchase.id === id &&
      (!businessId || purchase.business_id === businessId)
    )) ?? null,
    error: null,
  };
},

    async create(values) {
      onCreate?.();
      const purchase = {
        id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61',
        ...values,
      };

      purchases.push(purchase);
      return { data: purchase, error: null };
    },

async update(id, values, businessId = null) {
  const purchase = purchases.find((item) => (
    item.id === id &&
    (!businessId || item.business_id === businessId)
  ));

  if (!purchase) return { data: null, error: null };

  Object.assign(purchase, values);
  return { data: purchase, error: null };
},

    async remove(id, businessId = null) {
  const index = purchases.findIndex((purchase) => (
    purchase.id === id &&
    (!businessId || purchase.business_id === businessId)
  ));

  if (index === -1) return { data: null, error: null };

  return { data: purchases.splice(index, 1)[0], error: null };
},
  }
}

function createTrackedDeletionPurchaseService() {
  const purchases = [
    {
      id: PURCHASE_ID,
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      product_name: 'Coffee subscription',
      amount: 24.5,
      purchase_date: '2026-09-13',
    },
    {
      id: OTHER_PURCHASE_ID,
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
      product_name: 'Other business purchase',
      amount: 18.75,
      purchase_date: '2026-09-12',
    },
  ];
  const serviceCalls = { findById: 0, remove: 0 };

  return {
    purchases,
    serviceCalls,
    async findById(id, businessId = null) {
      serviceCalls.findById += 1;
      return {
        data: purchases.find((purchase) => (
          purchase.id === id &&
          (!businessId || purchase.business_id === businessId)
        )) ?? null,
        error: null,
      };
    },
    async remove(id, businessId = null) {
      serviceCalls.remove += 1;
      const index = purchases.findIndex((purchase) => (
        purchase.id === id &&
        (!businessId || purchase.business_id === businessId)
      ));

      if (index === -1) {
        return { data: null, error: null };
      }

      return { data: purchases.splice(index, 1)[0], error: null };
    },
  };
}

function createFakeReviewAutomationService({
  enabled = true,
  delay_minutes = 30,
  template_id = TEMPLATE_ID,
} = {}) {
  return {
    async findByBusinessId(businessId) {
      if (businessId !== BUSINESS_ID) {
        return { data: null, error: null };
      }

      return {
        data: {
          business_id: BUSINESS_ID,
          enabled,
          delay_minutes,
          template_id,
        },
        error: null,
      };
    },
  };
}

function createFakeMessageTemplateService() {
  return {
    async findById(id) {
      if (id !== TEMPLATE_ID) {
        return { data: null, error: null };
      }

      return {
        data: {
          id: TEMPLATE_ID,
          business_id: BUSINESS_ID,
          category: 'review',
          message:
            'Hi {{customer_name}}, thank you for purchasing {{product_name}} from {{business_name}}. Please leave a review: {{review_link}}',
        },
        error: null,
      };
    },
  };
}

function createFakeMessageService({ fail = false } = {}) {
  const messages = [];

  return {
    messages,

    async create(values) {
      if (fail) {
        return {
          data: null,
          error: new Error('Simulated message queue failure'),
        };
      }

      const message = {
        id: `message-${messages.length + 1}`,
        ...values,
      };

      messages.push(message);
      return { data: message, error: null };
    },
  };
}

function createFakeActivityEventService(events = [], { fail = false } = {}) {
  return {
    events,

    async create(event) {
      if (fail) {
        return { data: null, error: new Error('Simulated audit failure') };
      }

      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

async function withApi(callback, options = {}) {
  const messageService = options.messageService ?? createFakeMessageService();
  const activityEventService =
    options.activityEventService ?? createFakeActivityEventService();

  const app = createApp({
    businessService: createFakeBusinessService(),
    authMiddleware: bypassAuth,
    customerService: createFakeCustomerService({
      consentGiven: options.consentGiven ?? true,
    }),
    purchaseService: options.purchaseService ?? createFakePurchaseService(),
    reviewAutomationService: createFakeReviewAutomationService({
      enabled: options.enabled ?? true,
      delay_minutes: options.delay_minutes ?? 30,
      template_id: options.template_id ?? TEMPLATE_ID,
    }),
    messageTemplateService: createFakeMessageTemplateService(),
    messageService,
    activityEventService,
    authMiddleware: options.authMiddleware ?? bypassAuth,
  });

  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, messageService, activityEventService);
  } finally {
    await new Promise((resolve, reject) => (
      server.close((error) => (error ? reject(error) : resolve()))
    ));
  }
}

async function createPurchase(baseUrl) {
  return fetch(`${baseUrl}/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      product_name: 'Croissant',
      amount: 4.75,
      purchase_date: '2026-09-12',
    }),
  });
}

test('Purchase API validates scoped list filters', async () => {
  await withApi(async (baseUrl) => {
    const missingBusiness = await fetch(`${baseUrl}/purchases`);
    assert.equal(missingBusiness.status, 400);

    const mismatchedCustomer = await fetch(
      `${baseUrl}/purchases?business_id=${BUSINESS_ID}&customer_id=${OTHER_CUSTOMER_ID}`,
    );
    assert.equal(mismatchedCustomer.status, 400);

    const response = await fetch(
      `${baseUrl}/purchases?business_id=${BUSINESS_ID}&customer_id=${CUSTOMER_ID}`,
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, PURCHASE_ID);
  });
});

test('Purchase API validates parents and purchase fields before creation', async () => {
  await withApi(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        amount: -1,
      }),
    });

    assert.equal(invalid.status, 400);

    const mismatchedCustomer = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        customer_id: OTHER_CUSTOMER_ID,
        product_name: 'Coffee',
        amount: 5,
        purchase_date: '2026-09-13',
      }),
    });

    assert.equal(mismatchedCustomer.status, 400);

    const created = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        product_name: '  Croissant  ',
        amount: 4.75,
        purchase_date: '2026-09-12',
      }),
    });

    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.product_name, 'Croissant');
  });
});

test('Purchase API reads, updates, and deletes purchases', async () => {
  await withApi(async (baseUrl) => {
    const detail = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`);
    assert.equal(detail.status, 200);

    const updated = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 25 }),
    });

    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.amount, 25);

    const deleted = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`, {
      method: 'DELETE',
    });

    assert.equal(deleted.status, 204);
  });
});

test('Purchase API scopes deletion before calling the removal service', async () => {
  const assignedClientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: BUSINESS_ID };
    next();
  };
  const purchaseService = createTrackedDeletionPurchaseService();
  const events = [];
  const activityEventService = createFakeActivityEventService(events);
  const otherPurchaseBefore = structuredClone(
    purchaseService.purchases.find((purchase) => purchase.id === OTHER_PURCHASE_ID),
  );

  await withApi(async (baseUrl) => {
    const deleted = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
    assert.equal(purchaseService.serviceCalls.remove, 1);

    const deletedEvent = events.at(-1);
    assert.equal(deletedEvent.event_type, 'purchase.deleted');
    assert.equal(deletedEvent.entity_id, PURCHASE_ID);
    assert.equal(deletedEvent.business_id, BUSINESS_ID);
    assert.equal(deletedEvent.customer_id, CUSTOMER_ID);
    assert.deepEqual(deletedEvent.before, {
      product_name: 'Coffee subscription',
      amount: 24.5,
      purchase_date: '2026-09-13',
    });

    const crossBusiness = await fetch(`${baseUrl}/purchases/${OTHER_PURCHASE_ID}`, {
      method: 'DELETE',
    });
    assert.equal(crossBusiness.status, 404);
    assert.equal(purchaseService.serviceCalls.remove, 1);
    assert.deepEqual(
      purchaseService.purchases.find((purchase) => purchase.id === OTHER_PURCHASE_ID),
      otherPurchaseBefore,
    );

    const missing = await fetch(
      `${baseUrl}/purchases/0b7a2d62-f4f0-4b8f-9d78-75d63b4e2a55`,
      { method: 'DELETE' },
    );
    assert.equal(missing.status, 404);
    assert.equal(purchaseService.serviceCalls.remove, 1);
  }, {
    authMiddleware: assignedClientAuth,
    purchaseService,
    activityEventService,
  });
});

test('Purchase API rejects invalid identifiers and dates', async () => {
  await withApi(async (baseUrl) => {
    const invalidId = await fetch(`${baseUrl}/purchases/invalid-id`);
    assert.equal(invalidId.status, 400);

    const invalidDate = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        product_name: 'Coffee',
        amount: 5,
        purchase_date: '2026-02-30',
      }),
    });

    assert.equal(invalidDate.status, 400);
  });
});

test('Purchase creation queues a review message when automation is enabled and consent is given', async () => {
  await withApi(async (baseUrl, messageService) => {
    const response = await createPurchase(baseUrl);

    assert.equal(response.status, 201);
    assert.equal(messageService.messages.length, 1);

    const message = messageService.messages[0];

    assert.equal(message.business_id, BUSINESS_ID);
    assert.equal(message.customer_id, CUSTOMER_ID);
    assert.equal(message.campaign_id, null);
    assert.equal(message.template_id, TEMPLATE_ID);
    assert.equal(message.status, 'queued');

    assert.equal(
      message.message_text,
      'Hi Dhilip, thank you for purchasing Croissant from Coffee House. Please leave a review: https://example.com/review',
    );

    assert.ok(Number.isFinite(Date.parse(message.scheduled_at)));
    assert.ok(
      Date.parse(message.scheduled_at) >= Date.now() + 29 * 60 * 1000,
      'Message should be scheduled approximately 30 minutes in the future.',
    );
  });
});

test('Purchase creation does not queue a review message when automation is disabled', async () => {
  await withApi(async (baseUrl, messageService) => {
    const response = await createPurchase(baseUrl);

    assert.equal(response.status, 201);
    assert.equal(messageService.messages.length, 0);
  }, { enabled: false });
});

test('Purchase creation does not queue a review message without customer consent', async () => {
  await withApi(async (baseUrl, messageService) => {
    const response = await createPurchase(baseUrl);

    assert.equal(response.status, 201);
    assert.equal(messageService.messages.length, 0);
  }, { consentGiven: false });
});

test('Purchase creation remains successful if review message queueing fails', async () => {
  const messageService = createFakeMessageService({ fail: true });

  await withApi(async (baseUrl) => {
    const response = await createPurchase(baseUrl);

    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.product_name, 'Croissant');
  }, { messageService });
});

test('Purchase API records create, update, and delete audit events', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (baseUrl) => {
    const created = await createPurchase(baseUrl);
    assert.equal(created.status, 201);

    const updated = await fetch(
      `${baseUrl}/purchases/9c01ac38-6a1b-4b92-93cb-a4e5aa916e61`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 6.25 }),
      },
    );
    assert.equal(updated.status, 200);

    const deleted = await fetch(
      `${baseUrl}/purchases/9c01ac38-6a1b-4b92-93cb-a4e5aa916e61`,
      { method: 'DELETE' },
    );
    assert.equal(deleted.status, 204);
  }, { activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), [
    'purchase.created',
    'purchase.updated',
    'purchase.deleted',
  ]);
  assert.equal(events[0].entity_id, '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61');
  assert.equal(events[0].customer_id, CUSTOMER_ID);
  assert.deepEqual(events[1].before, { amount: 4.75 });
  assert.deepEqual(events[1].after, { amount: 6.25 });
  assert.deepEqual(events[2].before, {
    product_name: 'Croissant',
    amount: 6.25,
    purchase_date: '2026-09-12',
  });
});

test('Purchase API denies an assigned client access to another business', async () => {
  let createCalls = 0;
  const assignedClientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: BUSINESS_ID };
    next();
  };

  await withApi(async (baseUrl) => {
    const list = await fetch(
      `${baseUrl}/purchases?business_id=${OTHER_BUSINESS_ID}`,
    );
    assert.equal(list.status, 403);

    const create = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: OTHER_BUSINESS_ID,
        customer_id: OTHER_CUSTOMER_ID,
        product_name: 'Unauthorized purchase',
        amount: 1,
        purchase_date: '2026-09-12',
      }),
    });
    assert.equal(create.status, 403);
    assert.equal(createCalls, 0);
  }, {
    authMiddleware: assignedClientAuth,
    purchaseService: createFakePurchaseService({ onCreate: () => { createCalls += 1; } }),
  });
});

test('Purchase API denies unassigned client deletion before calling remove', async () => {
  const unassignedClientAuth = (request, _response, next) => {
    request.profile = { role: 'client', business_id: null };
    next();
  };
  const purchaseService = createTrackedDeletionPurchaseService();
  const purchasesBefore = structuredClone(purchaseService.purchases);

  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`, {
      method: 'DELETE',
    });

    assert.equal(response.status, 403);
    assert.equal(purchaseService.serviceCalls.remove, 0);
    assert.deepEqual(purchaseService.purchases, purchasesBefore);
  }, {
    authMiddleware: unassignedClientAuth,
    purchaseService,
  });
});

test('Purchase API reports audit persistence failures explicitly', async () => {
  const messageService = createFakeMessageService();
  const activityEventService = createFakeActivityEventService([], { fail: true });

  await withApi(async (baseUrl) => {
    const response = await createPurchase(baseUrl);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Purchase operation succeeded, but its audit event could not be recorded.',
    });
    assert.equal(messageService.messages.length, 0);
  }, { activityEventService, messageService });
});
