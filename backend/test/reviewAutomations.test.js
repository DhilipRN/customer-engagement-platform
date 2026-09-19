
import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const TEMPLATE_ID = '4a9f2baa-eae0-4f7c-b2d4-4d3d2e1cffb8';
const OTHER_TEMPLATE_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const AUTOMATION_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';

function fakeBusinessService() {
  return {
    findById: async (id) => ({
      data: id === BUSINESS_ID ? { id } : null,
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

function fakeReviewAutomationService() {
  const rows = [
    {
      id: AUTOMATION_ID,
      business_id: BUSINESS_ID,
      enabled: true,
      delay_minutes: 120,
      template_id: TEMPLATE_ID,
    },
  ];

  return {
    findByBusinessId: async (businessId) => ({
      data: rows.find((row) => row.business_id === businessId) ?? null,
      error: null,
    }),

    findById: async (id) => ({
      data: rows.find((row) => row.id === id) ?? null,
      error: null,
    }),

    create: async (values) => {
      const row = {
        id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61',
        ...values,
      };
      rows.push(row);
      return { data: row, error: null };
    },

    update: async (id, values) => {
      const row = rows.find((item) => item.id === id);

      if (!row) {
        return { data: null, error: null };
      }

      Object.assign(row, values);
      return { data: row, error: null };
    },

    remove: async (id) => {
      const index = rows.findIndex((row) => row.id === id);

      return {
        data: index < 0 ? null : rows.splice(index, 1)[0],
        error: null,
      };
    },
  };
}

async function withApi(callback) {
  const server = createApp({
    businessService: fakeBusinessService(),
    messageTemplateService: fakeTemplateService(),
    reviewAutomationService: fakeReviewAutomationService(),
  }).listen();

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
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