import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_CUSTOMER_ID = '8c144f5c-55c0-4d48-a21c-a3fb3adf2a33';
const PURCHASE_ID = 'b5d4484c-5001-4cdc-b276-8ee96715d6b4';

function createFakeBusinessService() {
  return {
    async findById(id) {
      return { data: id === BUSINESS_ID ? { id } : null, error: null };
    },
  };
}

function createFakeCustomerService() {
  return {
    async findById(id) {
      const customers = {
        [CUSTOMER_ID]: { id: CUSTOMER_ID, business_id: BUSINESS_ID },
        [OTHER_CUSTOMER_ID]: { id: OTHER_CUSTOMER_ID, business_id: OTHER_BUSINESS_ID },
      };
      return { data: customers[id] ?? null, error: null };
    },
  };
}

function createFakePurchaseService() {
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
          purchase.business_id === businessId && (!customerId || purchase.customer_id === customerId)
        )),
        error: null,
      };
    },
    async findById(id) {
      return { data: purchases.find((purchase) => purchase.id === id) ?? null, error: null };
    },
    async create(values) {
      const purchase = { id: '9c01ac38-6a1b-4b92-93cb-a4e5aa916e61', ...values };
      purchases.push(purchase);
      return { data: purchase, error: null };
    },
    async update(id, values) {
      const purchase = purchases.find((item) => item.id === id);
      if (!purchase) return { data: null, error: null };
      Object.assign(purchase, values);
      return { data: purchase, error: null };
    },
    async remove(id) {
      const index = purchases.findIndex((purchase) => purchase.id === id);
      if (index === -1) return { data: null, error: null };
      return { data: purchases.splice(index, 1)[0], error: null };
    },
  };
}

async function withApi(callback) {
  const app = createApp({
    businessService: createFakeBusinessService(),
    customerService: createFakeCustomerService(),
    purchaseService: createFakePurchaseService(),
  });
  const server = app.listen();
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('Purchase API validates scoped list filters', async () => {
  await withApi(async (baseUrl) => {
    const missingBusiness = await fetch(`${baseUrl}/purchases`);
    assert.equal(missingBusiness.status, 400);

    const mismatchedCustomer = await fetch(
      `${baseUrl}/purchases?business_id=${BUSINESS_ID}&customer_id=${OTHER_CUSTOMER_ID}`,
    );
    assert.equal(mismatchedCustomer.status, 400);

    const response = await fetch(`${baseUrl}/purchases?business_id=${BUSINESS_ID}&customer_id=${CUSTOMER_ID}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data[0].id, PURCHASE_ID);
  });
});

test('Purchase API validates parents and purchase fields before creation', async () => {
  await withApi(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID, amount: -1 }),
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

    const deleted = await fetch(`${baseUrl}/purchases/${PURCHASE_ID}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
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
