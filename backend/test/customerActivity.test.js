import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import {
  calculateInactiveDays,
  createCustomersRouter,
} from '../src/routes/customers.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'd628b835-66a6-4880-99ba-8c620d211e03';

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function requestCustomerList({ customerService, purchaseService, appointmentService }) {
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 'user-1' };
    request.profile = { id: 'user-1', role: 'client', business_id: BUSINESS_ID };
    request.businessAuthorization = {
      authorized: true,
      source: 'membership',
      membership: { business_id: BUSINESS_ID },
      permissions: { view_chats: true },
    };
    next();
  });
  app.use('/customers', createCustomersRouter({
    customerService,
    purchaseService,
    appointmentService,
    businessService: {
      async findById(id) {
        return { data: id === BUSINESS_ID ? { id } : null, error: null };
      },
    },
    businessAccessMiddleware: (_request, _response, next) => next(),
  }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    return await fetch(
      `http://127.0.0.1:${server.address().port}/customers?business_id=${BUSINESS_ID}`,
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('customer list aggregates purchase and completed appointment activity per business', async () => {
  const customers = [
    { id: 'customer-1', business_id: BUSINESS_ID, name: 'Both' },
    { id: 'customer-2', business_id: BUSINESS_ID, name: 'Purchase Only' },
    { id: 'customer-3', business_id: BUSINESS_ID, name: 'Never Active' },
  ];

  const response = await requestCustomerList({
    customerService: {
      async listByBusinessId(businessId) {
        assert.equal(businessId, BUSINESS_ID);
        return { data: customers, error: null };
      },
    },
    purchaseService: {
      async list({ businessId }) {
        assert.equal(businessId, BUSINESS_ID);
        return {
          data: [
            { customer_id: 'customer-1', business_id: BUSINESS_ID, purchase_date: dateDaysAgo(20) },
            { customer_id: 'customer-2', business_id: BUSINESS_ID, purchase_date: dateDaysAgo(40) },
            { customer_id: 'other', business_id: OTHER_BUSINESS_ID, purchase_date: dateDaysAgo(1) },
          ],
          error: null,
        };
      },
    },
    appointmentService: {
      async listCompletedByBusinessId(businessId) {
        assert.equal(businessId, BUSINESS_ID);
        return {
          data: [
            { customer_id: 'customer-1', business_id: BUSINESS_ID, appointment_date: dateDaysAgo(30), status: 'completed' },
            { customer_id: 'customer-1', business_id: BUSINESS_ID, appointment_date: dateDaysAgo(5), status: 'completed' },
            { customer_id: 'customer-2', business_id: BUSINESS_ID, appointment_date: dateDaysAgo(2), status: 'scheduled' },
          ],
          error: null,
        };
      },
      async listUpcomingByBusinessId(businessId) {
        assert.equal(businessId, BUSINESS_ID);
        return {
          data: [
            { customer_id: 'customer-1', business_id: BUSINESS_ID, appointment_date: '2099-01-10', appointment_time: '10:00:00', status: 'scheduled' },
            { customer_id: 'customer-1', business_id: BUSINESS_ID, appointment_date: '2099-01-05', appointment_time: '09:30:00', status: 'scheduled' },
            { customer_id: 'customer-1', business_id: BUSINESS_ID, appointment_date: '2099-01-01', appointment_time: '09:30:00', status: 'cancelled' },
            { customer_id: 'customer-2', business_id: BUSINESS_ID, appointment_date: '2099-01-02', appointment_time: '09:30:00', status: 'completed' },
            { customer_id: 'customer-3', business_id: BUSINESS_ID, appointment_date: '2099-01-03', appointment_time: '09:30:00', status: 'no_show' },
          ],
          error: null,
        };
      },
    },
  });

  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.data.map((customer) => ({
    name: customer.name,
    last_purchase_date: customer.last_purchase_date,
    last_completed_appointment_date: customer.last_completed_appointment_date,
    inactive_days: customer.inactive_days,
    next_appointment_date: customer.next_appointment_date,
    next_appointment_time: customer.next_appointment_time,
  })), [
    {
      name: 'Both',
      last_purchase_date: dateDaysAgo(20),
      last_completed_appointment_date: dateDaysAgo(5),
      inactive_days: 5,
      next_appointment_date: '2099-01-05',
      next_appointment_time: '09:30:00',
    },
    {
      name: 'Purchase Only',
      last_purchase_date: dateDaysAgo(40),
      last_completed_appointment_date: null,
      inactive_days: 40,
      next_appointment_date: null,
      next_appointment_time: null,
    },
    {
      name: 'Never Active',
      last_purchase_date: null,
      last_completed_appointment_date: null,
      inactive_days: null,
      next_appointment_date: null,
      next_appointment_time: null,
    },
  ]);
});

test('inactive days never becomes negative for a future activity date', () => {
  assert.equal(
    calculateInactiveDays('2026-10-26', new Date('2026-10-25T00:00:00.000Z')),
    0,
  );
});
