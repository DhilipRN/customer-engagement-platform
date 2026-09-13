import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';

function createFakeBusinessService() {
  const businesses = [
    { id: BUSINESS_ID, name: 'Northwind Coffee', phone: '555-0100' },
  ];

  return {
    async list() {
      return { data: businesses, error: null };
    },
    async findById(id) {
      return { data: businesses.find((business) => business.id === id) ?? null, error: null };
    },
    async create(values) {
      const business = { id: '07373922-f6e5-4a5d-b855-4f14d762fce5', ...values };
      businesses.push(business);
      return { data: business, error: null };
    },
    async update(id, values) {
      const business = businesses.find((item) => item.id === id);
      if (!business) {
        return { data: null, error: null };
      }
      Object.assign(business, values);
      return { data: business, error: null };
    },
    async remove(id) {
      const index = businesses.findIndex((business) => business.id === id);
      if (index === -1) {
        return { data: null, error: null };
      }
      return { data: businesses.splice(index, 1)[0], error: null };
    },
  };
}

async function withApi(callback) {
  const app = createApp({ businessService: createFakeBusinessService() });
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
