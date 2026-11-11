import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { createMessageTemplateService } from '../src/services/messageTemplates.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';
const OTHER_TEMPLATE_ID = '5b0a3cbb-fbf1-4f8c-93e5-5e4e3f2d0aa9';

function createFakeBusinessService() {
  return {
    async findById(id) {
      return { data: id === BUSINESS_ID ? { id, name: 'Northwind Coffee' } : null, error: null };
    },
  };
}

function createFakeTemplateService({ mutationCalls } = {}) {
  const templates = [{
    id: TEMPLATE_ID,
    business_id: BUSINESS_ID,
    name: 'Review request',
    category: 'review',
    message: 'Hi {{customer_name}}, please review {{business_name}} at {{review_link}}.',
  }, {
    id: OTHER_TEMPLATE_ID,
    business_id: OTHER_BUSINESS_ID,
    name: 'Other review request',
    category: 'review',
    message: 'Hi {{customer_name}}, please review {{business_name}}.',
  }];

  return {
    templates,
    async listByBusinessId(businessId) {
      return { data: templates.filter((template) => template.business_id === businessId), error: null };
    },
    async findById(id, businessId = null) {
      return { data: templates.find((template) => template.id === id && (!businessId || template.business_id === businessId)) ?? null, error: null };
    },
    async create(values) {
      mutationCalls && (mutationCalls.create += 1);
      const template = { id: '81b1940f-38f4-4db1-a3db-0f24c91c980f', ...values };
      templates.push(template);
      return { data: template, error: null };
    },
    async update(id, values, businessId = null) {
      mutationCalls && (mutationCalls.update += 1);
      const template = templates.find((item) => item.id === id && (!businessId || item.business_id === businessId));
      if (!template) return { data: null, error: null };
      Object.assign(template, values);
      return { data: template, error: null };
    },
    async remove(id, businessId = null) {
      mutationCalls && (mutationCalls.remove += 1);
      const index = templates.findIndex((template) => template.id === id && (!businessId || template.business_id === businessId));
      if (index === -1) return { data: null, error: null };
      return { data: templates.splice(index, 1)[0], error: null };
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

function createMetadataCompatibilityClient() {
  const calls = [];
  let insertAttempt = 0;
  const query = {
    insert(values) {
      calls.push({ operation: 'insert', values });
      insertAttempt += 1;
      return query;
    },
    update(values) {
      calls.push({ operation: 'update', values });
      return query;
    },
    eq() { return query; },
    select() { return query; },
    async single() {
      return insertAttempt === 1
        ? { data: null, error: { code: 'PGRST204', message: "column 'metadata' does not exist" } }
        : { data: { id: TEMPLATE_ID }, error: null };
    },
    async maybeSingle() { return { data: { id: TEMPLATE_ID }, error: null }; },
  };
  return { calls, from: () => query };
}

async function withApi(callback, options = {}) {
  const activityEventService = options.activityEventService ?? createFakeActivityEventService();
  const app = createApp({
    businessService: createFakeBusinessService(),
    messageTemplateService: options.messageTemplateService ?? createFakeTemplateService(),
    activityEventService,
    authMiddleware: bypassAuth,
  });
  const server = app.listen();
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`, activityEventService);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function withClientApi(callback, options = {}) {
  const app = createApp({
    businessService: {
      async findById(id) {
        return { data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id, name: 'Business' } : null, error: null };
      },
    },
    messageTemplateService: options.messageTemplateService ?? createFakeTemplateService(),
    authMiddleware: (request, _response, next) => {
      request.profile = { role: 'client', business_id: BUSINESS_ID };
      next();
    },
  });
  const server = app.listen();
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('Message template service retries legacy inserts without metadata when the column is unavailable', async () => {
  const client = createMetadataCompatibilityClient();
  const service = createMessageTemplateService(client);
  const result = await service.create({
    business_id: BUSINESS_ID,
    name: 'Appointment reminder',
    category: 'transactional',
    message: 'Hi {{customer_name}}',
    metadata: { meta_category: 'utility', buttons: [] },
  });

  assert.equal(result.error, null);
  assert.deepEqual(client.calls.map((call) => call.values), [
    {
      business_id: BUSINESS_ID,
      name: 'Appointment reminder',
      category: 'transactional',
      message: 'Hi {{customer_name}}',
      metadata: { meta_category: 'utility', buttons: [] },
    },
    {
      business_id: BUSINESS_ID,
      name: 'Appointment reminder',
      category: 'transactional',
      message: 'Hi {{customer_name}}',
    },
  ]);
});

test('Message Template API requires a valid existing business when listing', async () => {
  await withApi(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/message-templates`);
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/message-templates?business_id=${BUSINESS_ID}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, TEMPLATE_ID);
  });
});

test('Message Template API validates categories and supported variables', async () => {
  await withApi(async (baseUrl) => {
    const unsupported = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Unsafe',
        category: 'review',
        message: 'Hi {{unknown_variable}}',
      }),
    });
    assert.equal(unsupported.status, 400);

    const created = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: '  Purchase follow-up  ',
        category: 'transactional',
        message: 'Hi {{customer_name}}, thanks for {{product_name}} on {{purchase_date}}.',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.name, 'Purchase follow-up');
  });
});

test('Message Template API normalizes Meta categories in create, list, and detail responses', async () => {
  const messageTemplateService = createFakeTemplateService();
  await withApi(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Utility reminder',
        category: 'utility',
        message: 'Hi {{customer_name}}',
        metadata: { language: 'en' },
      }),
    });
    assert.equal(created.status, 201);
    const createdData = (await created.json()).data;
    assert.equal(createdData.category, 'utility');

    const updated = await fetch(`${baseUrl}/message-templates/${createdData.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'utility', metadata: { meta_category: 'utility', language: 'hi' } }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.category, 'utility');

    const list = await fetch(`${baseUrl}/message-templates?business_id=${BUSINESS_ID}`);
    const listed = (await list.json()).data.find((template) => template.id === createdData.id);
    assert.equal(listed.category, 'utility');

    const detail = await fetch(`${baseUrl}/message-templates/${createdData.id}`);
    assert.equal((await detail.json()).data.category, 'utility');
  }, { messageTemplateService });
});

test('Message Template API accepts Meta categories and validated interactive metadata', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Appointment reminder',
        category: 'utility',
        message: 'Hi {{customer_name}}, your appointment is confirmed.',
        metadata: {
          meta_template_name: 'appointment_reminder_v1',
          language: 'en',
          buttons: [
            { type: 'quick_reply', text: 'Confirm Appointment' },
            { type: 'cta', text: 'Call Clinic', url: 'https://example.com/call' },
          ],
        },
      }),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.data.category, 'utility');
    assert.equal(result.data.metadata.buttons.length, 2);
    assert.equal(result.data.metadata.meta_template_name, 'appointment_reminder_v1');
    assert.equal(result.data.metadata.meta_category, 'utility');
  });
});

test('Message Template API rejects unsupported metadata fields', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Invalid metadata',
        category: 'utility',
        message: 'Hi {{customer_name}}',
        metadata: { accessToken: 'must-not-be-stored' },
      }),
    });
    assert.equal(response.status, 400);
  });
});

test('Message Template API reads, updates, and deletes templates', async () => {
  await withApi(async (baseUrl) => {
    const detail = await fetch(`${baseUrl}/message-templates/${TEMPLATE_ID}`);
    assert.equal(detail.status, 200);

    const updated = await fetch(`${baseUrl}/message-templates/${TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'other' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.category, 'other');

    const deleted = await fetch(`${baseUrl}/message-templates/${TEMPLATE_ID}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
  });
});

test('Message Template API rejects invalid template identifiers', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message-templates/not-a-uuid`);
    assert.equal(response.status, 400);
  });
});

test('Message Template API isolates client access by business', async () => {
  const mutationCalls = { create: 0, update: 0, remove: 0 };
  const messageTemplateService = createFakeTemplateService({ mutationCalls });
  const templateBefore = structuredClone(
    messageTemplateService.templates.find((template) => template.id === OTHER_TEMPLATE_ID),
  );

  await withClientApi(async (baseUrl) => {
    const forbiddenList = await fetch(`${baseUrl}/message-templates?business_id=${OTHER_BUSINESS_ID}`);
    assert.equal(forbiddenList.status, 403);

    const forbiddenDetail = await fetch(`${baseUrl}/message-templates/${OTHER_TEMPLATE_ID}`);
    assert.equal(forbiddenDetail.status, 404);

    const forbiddenCreate = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: OTHER_BUSINESS_ID,
        name: 'Tampered',
        category: 'review',
        message: 'Hi {{customer_name}}',
      }),
    });
    assert.equal(forbiddenCreate.status, 403);
    assert.equal(mutationCalls.create, 0);

    const forbiddenUpdate = await fetch(`${baseUrl}/message-templates/${OTHER_TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tampered' }),
    });
    assert.equal(forbiddenUpdate.status, 404);
    assert.equal(mutationCalls.update, 0);
    assert.deepEqual(
      messageTemplateService.templates.find((template) => template.id === OTHER_TEMPLATE_ID),
      templateBefore,
    );

    const forbiddenDelete = await fetch(`${baseUrl}/message-templates/${OTHER_TEMPLATE_ID}`, { method: 'DELETE' });
    assert.equal(forbiddenDelete.status, 404);
    assert.equal(mutationCalls.remove, 0);
    assert.deepEqual(
      messageTemplateService.templates.find((template) => template.id === OTHER_TEMPLATE_ID),
      templateBefore,
    );
  }, { messageTemplateService });
});

test('Message Template API records create, update, and delete audit events', async () => {
  const events = [];
  const activityEventService = createFakeActivityEventService(events);

  await withApi(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Lifecycle template',
        category: 'utility',
        message: 'Hello {{customer_name}}',
        metadata: {
          language: 'en',
          buttons: [{ type: 'quick_reply', text: 'Confirm' }],
        },
      }),
    });
    assert.equal(created.status, 201);

    const templateId = '81b1940f-38f4-4db1-a3db-0f24c91c980f';
    const updated = await fetch(`${baseUrl}/message-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated lifecycle template',
        message: 'Updated {{customer_name}}',
      }),
    });
    assert.equal(updated.status, 200);

    const deleted = await fetch(`${baseUrl}/message-templates/${templateId}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
  }, { activityEventService });

  assert.deepEqual(events.map((event) => event.event_type), [
    'message_template.created',
    'message_template.updated',
    'message_template.deleted',
  ]);
  assert.equal(events[0].after.category, 'transactional');
  assert.equal(events[0].after.metadata.language, 'en');
  assert.equal(events[0].after.metadata.buttons[0].text, 'Confirm');
  assert.deepEqual(events[1].before, {
    name: 'Lifecycle template',
    message: 'Hello {{customer_name}}',
  });
  assert.deepEqual(events[1].after, {
    name: 'Updated lifecycle template',
    message: 'Updated {{customer_name}}',
  });
  assert.equal(events[2].entity_id, '81b1940f-38f4-4db1-a3db-0f24c91c980f');
  assert.equal(events[2].customer_id, null);
});

test('Message Template API reports audit persistence failures explicitly', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/message-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        name: 'Audit failure template',
        category: 'other',
        message: 'Hello {{customer_name}}',
      }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Message-template operation succeeded, but its audit event could not be recorded.',
    });
  }, { activityEventService: createFakeActivityEventService([], { fail: true }) });
});
