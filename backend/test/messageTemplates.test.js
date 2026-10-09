import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';
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

function createFakeTemplateService() {
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
    async listByBusinessId(businessId) {
      return { data: templates.filter((template) => template.business_id === businessId), error: null };
    },
    async findById(id, businessId = null) {
      return { data: templates.find((template) => template.id === id && (!businessId || template.business_id === businessId)) ?? null, error: null };
    },
    async create(values) {
      const template = { id: '81b1940f-38f4-4db1-a3db-0f24c91c980f', ...values };
      templates.push(template);
      return { data: template, error: null };
    },
    async update(id, values, businessId = null) {
      const template = templates.find((item) => item.id === id && (!businessId || item.business_id === businessId));
      if (!template) return { data: null, error: null };
      Object.assign(template, values);
      return { data: template, error: null };
    },
    async remove(id, businessId = null) {
      const index = templates.findIndex((template) => template.id === id && (!businessId || template.business_id === businessId));
      if (index === -1) return { data: null, error: null };
      return { data: templates.splice(index, 1)[0], error: null };
    },
  };
}

async function withApi(callback) {
  const app = createApp({
    businessService: createFakeBusinessService(),
    messageTemplateService: createFakeTemplateService(),
    authMiddleware: bypassAuth,
  });
  const server = app.listen();
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function withClientApi(callback) {
  const app = createApp({
    businessService: {
      async findById(id) {
        return { data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id, name: 'Business' } : null, error: null };
      },
    },
    messageTemplateService: createFakeTemplateService(),
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

    const forbiddenUpdate = await fetch(`${baseUrl}/message-templates/${OTHER_TEMPLATE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tampered' }),
    });
    assert.equal(forbiddenUpdate.status, 404);

    const forbiddenDelete = await fetch(`${baseUrl}/message-templates/${OTHER_TEMPLATE_ID}`, { method: 'DELETE' });
    assert.equal(forbiddenDelete.status, 404);
  });
});
