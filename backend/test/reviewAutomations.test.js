
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';
const OTHER_TEMPLATE_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const AUTOMATION_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';
const OTHER_AUTOMATION_ID = '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61';

function fakeBusinessService() {
  return {
    findById: async (id) => ({
      data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id, name: 'Business', google_review_link: 'https://example.com/review' } : null,
      error: null,
    }),
  };
}

function fakeTemplateService() {
  return {
    findById: async (id) => ({
      data:
        id === TEMPLATE_ID
          ? { id, business_id: BUSINESS_ID }
          : id === OTHER_TEMPLATE_ID
            ? {
                id,
                business_id: 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62',
              }
            : null,
      error: null,
    }),
  };
}

function fakeReviewAutomationService({ updateResult, mutationCalls = { create: 0, update: 0, remove: 0 } } = {}) {
  const rows = [
    {
      id: AUTOMATION_ID,
      business_id: BUSINESS_ID,
      enabled: true,
      delay_minutes: 120,
      template_id: TEMPLATE_ID,
    },
    {
      id: OTHER_AUTOMATION_ID,
      business_id: OTHER_BUSINESS_ID,
      enabled: true,
      delay_minutes: 120,
      template_id: OTHER_TEMPLATE_ID,
    },
  ];

  return {
    rows,
    findByBusinessId: async (businessId) => ({
      data: rows.find((row) => row.business_id === businessId) ?? null,
      error: null,
    }),

    findById: async (id, businessId = null) => ({
      data: rows.find((row) => row.id === id && (!businessId || row.business_id === businessId)) ?? null,
      error: null,
    }),

    create: async (values) => {
      mutationCalls.create += 1;
      const row = {
        id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61',
        ...values,
      };
      rows.push(row);
      return { data: row, error: null };
    },

    update: async (id, values, businessId = null) => {
      mutationCalls.update += 1;
      if (updateResult) return updateResult;
      const row = rows.find((item) => item.id === id && (!businessId || item.business_id === businessId));

      if (!row) {
        return { data: null, error: null };
      }

      Object.assign(row, values);
      return { data: row, error: null };
    },

    remove: async (id, businessId = null) => {
      mutationCalls.remove += 1;
      const index = rows.findIndex((row) => row.id === id && (!businessId || row.business_id === businessId));

      return {
        data: index < 0 ? null : rows.splice(index, 1)[0],
        error: null,
      };
    },
  };
}

function createFakeActivityEventService(events = [], { fail = false } = {}) {
  return {
    events,
    async create(event) {
      if (fail) return { data: null, error: new Error('Simulated audit failure') };
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

async function withClientApi(callback, options = {}) {
  const reviewAutomationService = options.reviewAutomationService ?? fakeReviewAutomationService(options);
  const server = createApp({
    businessService: fakeBusinessService(),
    messageTemplateService: fakeTemplateService(),
    reviewAutomationService,
    customerService: { listByBusinessId: async () => ({ data: [], error: null }) },
    purchaseService: { list: async () => ({ data: [], error: null }) },
    messageService: { list: async () => ({ data: [], error: null }) },
    authMiddleware: (request, _response, next) => {
      request.profile = { role: 'client', business_id: BUSINESS_ID };
      next();
    },
  }).listen();

  try {
    await callback(`http://127.0.0.1:${server.address().port}`, reviewAutomationService);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

async function withApi(callback, options = {}) {
  const activityEventService = options.activityEventService ?? createFakeActivityEventService();
  const server = createApp({
    businessService: fakeBusinessService(),
    messageTemplateService: fakeTemplateService(),
    reviewAutomationService: options.reviewAutomationService ?? fakeReviewAutomationService(options),
    activityEventService,
    authMiddleware: bypassAuth,
  }).listen();

  try {
    await callback(`http://127.0.0.1:${server.address().port}`, activityEventService);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test('Review Automation API validates business and template ownership', async () => {
  await withApi(async (url) => {
    assert.equal((await fetch(`${url}/review-automations`)).status, 400);

    const wrongTemplate = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        template_id: OTHER_TEMPLATE_ID,
      }),
    });

    assert.equal(wrongTemplate.status, 400);

    assert.equal(
      (await fetch(`${url}/review-automations?business_id=${BUSINESS_ID}`))
        .status,
      200
    );
  });
});

test('Review Automation API creates and updates automation settings', async () => {
  await withApi(async (url) => {
    const create = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        enabled: true,
        delay_minutes: 180,
        template_id: TEMPLATE_ID,
      }),
    });

    assert.equal(create.status, 201);

    const update = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        delay_minutes: 60,
      }),
    });

    assert.equal(update.status, 200);
    const result = await update.json();

    assert.equal(result.data.enabled, false);
    assert.equal(result.data.delay_minutes, 60);
  });
});

test('Review Automation API reads and deletes automation', async () => {
  await withApi(async (url) => {
    const read = await fetch(`${url}/review-automations/${AUTOMATION_ID}`);

    assert.equal(read.status, 200);

    const remove = await fetch(
      `${url}/review-automations/${AUTOMATION_ID}`,
      { method: 'DELETE' }
    );

    assert.equal(remove.status, 204);

    const missing = await fetch(
      `${url}/review-automations/${AUTOMATION_ID}`
    );

    assert.equal(missing.status, 404);
  });
});

test('Review Automation API isolates client access by business', async () => {
  const mutationCalls = { create: 0, update: 0, remove: 0 };
  const reviewAutomationService = fakeReviewAutomationService({ mutationCalls });
  const automationBefore = structuredClone(
    reviewAutomationService.rows.find((row) => row.id === OTHER_AUTOMATION_ID),
  );

  await withClientApi(async (url) => {
    assert.equal((await fetch(`${url}/review-automations?business_id=${OTHER_BUSINESS_ID}`)).status, 403);
    assert.equal((await fetch(`${url}/review-automations/selected-customers?business_id=${OTHER_BUSINESS_ID}`)).status, 403);

    const wrongBusinessSchedule = await fetch(`${url}/review-automations/selected-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: OTHER_BUSINESS_ID, customer_ids: [AUTOMATION_ID], template_id: TEMPLATE_ID }),
    });
    assert.equal(wrongBusinessSchedule.status, 403);

    assert.equal((await fetch(`${url}/review-automations/${OTHER_AUTOMATION_ID}`)).status, 404);

    const wrongBusinessCreate = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: OTHER_BUSINESS_ID, template_id: TEMPLATE_ID }),
    });
    assert.equal(wrongBusinessCreate.status, 403);
    assert.equal(mutationCalls.create, 0);

    const wrongTemplateCreate = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, template_id: OTHER_TEMPLATE_ID }),
    });
    assert.equal(wrongTemplateCreate.status, 400);

    const wrongBusinessUpdate = await fetch(`${url}/review-automations/${OTHER_AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(wrongBusinessUpdate.status, 404);
    assert.equal(mutationCalls.update, 0);
    assert.deepEqual(
      reviewAutomationService.rows.find((row) => row.id === OTHER_AUTOMATION_ID),
      automationBefore,
    );
    assert.equal((await fetch(`${url}/review-automations/${OTHER_AUTOMATION_ID}`, { method: 'DELETE' })).status, 404);
    assert.equal(mutationCalls.remove, 0);
    assert.deepEqual(
      reviewAutomationService.rows.find((row) => row.id === OTHER_AUTOMATION_ID),
      automationBefore,
    );
  }, { reviewAutomationService, mutationCalls });
});

test('Review Automation API returns 404 when an update affects no automation', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Review automation not found.' });
  }, { updateResult: { data: null, error: null } });
});

test('Review Automation API records configuration and enabled-state audit events', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (url) => {
    const create = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        enabled: true,
        delay_minutes: 180,
        template_id: TEMPLATE_ID,
      }),
    });
    assert.equal(create.status, 201);

    const update = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay_minutes: 60 }),
    });
    assert.equal(update.status, 200);

    const disable = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(disable.status, 200);

    const enable = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enable.status, 200);

    const remove = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'DELETE',
    });
    assert.equal(remove.status, 204);
  }, { activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), [
    'review_automation.created',
    'review_automation.updated',
    'review_automation.disabled',
    'review_automation.enabled',
    'review_automation.deleted',
  ]);
  assert.deepEqual(events[1].before, { delay_minutes: 120 });
  assert.deepEqual(events[1].after, { delay_minutes: 60 });
  assert.deepEqual(events[2].before, { enabled: true });
  assert.deepEqual(events[2].after, { enabled: false });
  assert.equal(events[4].entity_id, AUTOMATION_ID);
  assert.equal(events[4].customer_id, null);
});

test('Review Automation API reports audit persistence failures explicitly', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/review-automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        enabled: true,
        delay_minutes: 120,
        template_id: TEMPLATE_ID,
      }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Review automation operation succeeded, but its audit event could not be recorded.',
    });
  }, { activityEventService: createFakeActivityEventService([], { fail: true }) });
});

test('Review Automation API reports update audit persistence failures explicitly', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay_minutes: 60 }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Review automation operation succeeded, but its audit event could not be recorded.',
    });
  }, { activityEventService: createFakeActivityEventService([], { fail: true }) });
});

test('Review Automation API reports delete audit persistence failures explicitly', async () => {
  await withApi(async (url) => {
    const response = await fetch(`${url}/review-automations/${AUTOMATION_ID}`, {
      method: 'DELETE',
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Review automation operation succeeded, but its audit event could not be recorded.',
    });
  }, { activityEventService: createFakeActivityEventService([], { fail: true }) });
});
