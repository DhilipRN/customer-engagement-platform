import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const BUS1_CUSTOMER_ID = 'a3e5695b-7760-44bc-95df-c1468b7ae1e7';
const BUS1_BUSINESS_ID = '32dd92e0-c123-4681-8cdf-fe8df14acbe9';

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createFakeServices({ customerError = null, purchaseError = null, appointmentError = null } = {}) {
  const customers = [
    { id: '00000000-0000-4000-8000-000000000001', business_id: BUSINESS_ID, name: 'No Purchase' },
    { id: '00000000-0000-4000-8000-000000000002', business_id: BUSINESS_ID, name: 'Old Purchase' },
    { id: '00000000-0000-4000-8000-000000000003', business_id: BUSINESS_ID, name: 'Boundary Purchase' },
    { id: '00000000-0000-4000-8000-000000000004', business_id: BUSINESS_ID, name: 'Recent Purchase' },
    { id: '00000000-0000-4000-8000-000000000005', business_id: BUSINESS_ID, name: 'Multiple Purchases' },
    { id: '00000000-0000-4000-8000-000000000006', business_id: BUSINESS_ID, name: 'Missing Purchase Date' },
    { id: '00000000-0000-4000-8000-000000000007', business_id: OTHER_BUSINESS_ID, name: 'Other Business Customer' },
    { id: '00000000-0000-4000-8000-000000000008', business_id: BUSINESS_ID, name: 'Old 60 Day Purchase' },
    { id: '00000000-0000-4000-8000-000000000009', business_id: BUSINESS_ID, name: 'Old 90 Day Purchase' },
    { id: '00000000-0000-4000-8000-000000000010', business_id: BUSINESS_ID, name: 'Scheduled Only' },
    { id: '00000000-0000-4000-8000-000000000011', business_id: BUSINESS_ID, name: 'Cancelled Only' },
    { id: '00000000-0000-4000-8000-000000000012', business_id: BUSINESS_ID, name: 'No Show Only' },
    { id: '00000000-0000-4000-8000-000000000013', business_id: BUSINESS_ID, name: 'Recent Completed Visit' },
    { id: '00000000-0000-4000-8000-000000000014', business_id: BUSINESS_ID, name: 'Old Completed Visit' },
    { id: '00000000-0000-4000-8000-000000000015', business_id: BUSINESS_ID, name: 'Purchase And Visit' },
    { id: BUS1_CUSTOMER_ID, business_id: BUS1_BUSINESS_ID, name: 'Bus1' },
  ];

  const purchases = [
    { id: '10000000-0000-4000-8000-000000000001', business_id: BUSINESS_ID, customer_id: customers[1].id, purchase_date: dateOffset(-31) },
    { id: '10000000-0000-4000-8000-000000000002', business_id: BUSINESS_ID, customer_id: customers[2].id, purchase_date: dateOffset(-30) },
    { id: '10000000-0000-4000-8000-000000000003', business_id: BUSINESS_ID, customer_id: customers[3].id, purchase_date: dateOffset(-1) },
    { id: '10000000-0000-4000-8000-000000000004', business_id: BUSINESS_ID, customer_id: customers[4].id, purchase_date: dateOffset(-100) },
    { id: '10000000-0000-4000-8000-000000000005', business_id: BUSINESS_ID, customer_id: customers[4].id, purchase_date: dateOffset(-1) },
    { id: '10000000-0000-4000-8000-000000000006', business_id: BUSINESS_ID, customer_id: customers[5].id, purchase_date: null },
    { id: '10000000-0000-4000-8000-000000000007', business_id: OTHER_BUSINESS_ID, customer_id: customers[6].id, purchase_date: dateOffset(-100) },
    { id: '10000000-0000-4000-8000-000000000008', business_id: BUSINESS_ID, customer_id: customers[7].id, purchase_date: dateOffset(-61) },
    { id: '10000000-0000-4000-8000-000000000009', business_id: BUSINESS_ID, customer_id: customers[8].id, purchase_date: dateOffset(-91) },
    { id: '10000000-0000-4000-8000-000000000010', business_id: BUSINESS_ID, customer_id: customers[14].id, purchase_date: dateOffset(-1) },
    { id: '10000000-0000-4000-8000-000000000011', business_id: BUS1_BUSINESS_ID, customer_id: BUS1_CUSTOMER_ID, purchase_date: '2026-09-07 00:00:00+00' },
  ];

  const appointments = [
    { business_id: BUSINESS_ID, customer_id: customers[1].id, appointment_date: dateOffset(-1), status: 'completed' },
    { business_id: BUSINESS_ID, customer_id: customers[3].id, appointment_date: dateOffset(-100), status: 'completed' },
    { business_id: BUSINESS_ID, customer_id: customers[9].id, appointment_date: dateOffset(-1), status: 'scheduled' },
    { business_id: BUSINESS_ID, customer_id: customers[10].id, appointment_date: dateOffset(-1), status: 'cancelled' },
    { business_id: BUSINESS_ID, customer_id: customers[11].id, appointment_date: dateOffset(-1), status: 'no_show' },
    { business_id: BUSINESS_ID, customer_id: customers[12].id, appointment_date: dateOffset(-1), status: 'completed' },
    { business_id: BUSINESS_ID, customer_id: customers[13].id, appointment_date: dateOffset(-31), status: 'completed' },
    { business_id: BUSINESS_ID, customer_id: customers[13].id, appointment_date: dateOffset(-100), status: 'completed' },
    { business_id: BUSINESS_ID, customer_id: customers[14].id, appointment_date: dateOffset(-1), status: 'completed' },
    { business_id: OTHER_BUSINESS_ID, customer_id: customers[6].id, appointment_date: dateOffset(-100), status: 'completed' },
  ];

  return {
    businessService: {
      async findById(id) {
        return {
          data: [BUSINESS_ID, OTHER_BUSINESS_ID, BUS1_BUSINESS_ID].includes(id) ? { id } : null,
          error: null,
        };
      },
    },
    customerService: {
      async listByBusinessId(businessId) {
        return {
          data: customerError ? null : customers.filter((customer) => customer.business_id === businessId),
          error: customerError,
        };
      },
    },
    purchaseService: {
      async list({ businessId }) {
        return {
          data: purchaseError ? null : purchases.filter((purchase) => purchase.business_id === businessId),
          error: purchaseError,
        };
      },
    },
    appointmentService: {
      async listCompletedByBusinessId(businessId) {
        return {
          data: appointmentError
            ? null
            : appointments.filter((appointment) => appointment.business_id === businessId),
          error: appointmentError,
        };
      },
    },
  };
}

async function withApi(callback, { role = 'admin', businessId = BUSINESS_ID, services, authMiddleware } = {}) {
  const app = createApp({
    ...createFakeServices(),
    ...services,
    authMiddleware: authMiddleware ?? ((request, _response, next) => {
      request.profile = { role, business_id: businessId };
      next();
    }),
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

test('Customer comeback supports 30-, 60-, and 90-day periods', async () => {
  await withApi(async (baseUrl) => {
    for (const days of [30, 60, 90]) {
      const response = await fetch(
        `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=${days}`
      );

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.inactivity_days, days);
      assert.equal(result.cutoff_date, dateOffset(-days));

      const ids = result.data.map((customer) => customer.id);
      assert.ok(ids.includes('00000000-0000-4000-8000-000000000001'));
      assert.equal(
        ids.includes('00000000-0000-4000-8000-000000000002'),
        false,
      );
      assert.equal(
        ids.includes('00000000-0000-4000-8000-000000000008'),
        days < 90,
      );
      assert.equal(
        ids.includes('00000000-0000-4000-8000-000000000009'),
        true,
      );
      assert.ok(!ids.includes('00000000-0000-4000-8000-000000000003'));
      assert.ok(!ids.includes('00000000-0000-4000-8000-000000000004'));
    }
  });
});

test('Customer comeback uses the latest purchase and handles missing purchase dates', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    const result = await response.json();
    const ids = result.data.map((customer) => customer.id);

    assert.ok(!ids.includes('00000000-0000-4000-8000-000000000005'));
    assert.ok(!ids.includes('00000000-0000-4000-8000-000000000006'));

    const noPurchase = result.data.find(
      (customer) => customer.id === '00000000-0000-4000-8000-000000000001'
    );
    assert.equal(noPurchase.last_purchase_date, null);
    assert.equal(noPurchase.has_purchase_history, false);

    const purchaseOnlyCustomer = result.data.find(
      (customer) => customer.id === '00000000-0000-4000-8000-000000000008'
    );
    assert.equal(purchaseOnlyCustomer.last_purchase_date, dateOffset(-61));
    assert.equal(purchaseOnlyCustomer.has_purchase_history, true);
    assert.equal(purchaseOnlyCustomer.last_completed_appointment_date, null);
    assert.equal(purchaseOnlyCustomer.has_completed_appointment_history, false);
    assert.equal(purchaseOnlyCustomer.last_activity_date, dateOffset(-61));
  });
});

test('Customer comeback normalizes Supabase timestamp purchase dates', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUS1_BUSINESS_ID}&days=30`
    );
    const result = await response.json();
    const bus1 = result.data.find((customer) => customer.id === BUS1_CUSTOMER_ID);

    assert.ok(bus1);
    assert.equal(bus1.last_purchase_date, '2026-09-07');
    assert.equal(bus1.last_activity_date, '2026-09-07');
  });
});

test('Customer comeback uses completed appointment activity and excludes other statuses', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    const result = await response.json();
    const byId = new Map(result.data.map((customer) => [customer.id, customer]));

    assert.ok(!byId.has('00000000-0000-4000-8000-000000000002'));
    assert.ok(!byId.has('00000000-0000-4000-8000-000000000004'));
    assert.ok(!byId.has('00000000-0000-4000-8000-000000000013'));

    for (const id of [
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
    ]) {
      const customer = byId.get(id);
      assert.ok(customer);
      assert.equal(customer.has_completed_appointment_history, false);
      assert.equal(customer.last_completed_appointment_date, null);
      assert.equal(customer.last_activity_date, null);
    }

    const oldVisit = byId.get('00000000-0000-4000-8000-000000000014');
    assert.ok(oldVisit);
    assert.equal(oldVisit.has_completed_appointment_history, true);
    assert.equal(oldVisit.last_completed_appointment_date, dateOffset(-31));
    assert.equal(oldVisit.last_activity_date, dateOffset(-31));

    const purchaseAndVisit = byId.get('00000000-0000-4000-8000-000000000015');
    assert.equal(purchaseAndVisit, undefined);
  });
});

test('Customer comeback rejects invalid inactivity periods', async () => {
  await withApi(async (baseUrl) => {
    for (const days of ['0', '29', '31', '120', '']) {
      const response = await fetch(
        `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=${days}`
      );
      assert.equal(response.status, 400);
    }
  });
});

test('Customer comeback enforces business isolation and unassigned-client denial', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${OTHER_BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 403);
  }, { role: 'client' });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 403);
  }, { role: 'client', businessId: null });
});

test('Customer comeback returns service failures as server errors', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 500);
  }, {
    services: {
      ...createFakeServices({ customerError: new Error('Customer query failed') }),
    },
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 500);
  }, {
    services: {
      ...createFakeServices({ purchaseError: new Error('Purchase query failed') }),
    },
  });

  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 500);
  }, {
    services: {
      ...createFakeServices({ appointmentError: new Error('Appointment query failed') }),
    },
  });
});

test('Customer comeback requires an existing business', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=00000000-0000-4000-8000-000000000099&days=30`
    );
    assert.equal(response.status, 404);
  });
});

test('Unauthenticated customer comeback requests are rejected', async () => {
  await withApi(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/customers/inactive?business_id=${BUSINESS_ID}&days=30`
    );
    assert.equal(response.status, 401);
  }, {
    authMiddleware: (_request, response) => {
      response.status(401).json({ error: 'Authentication required.' });
    },
  });
});
