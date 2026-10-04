import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID =
  '11111111-1111-4111-8111-111111111111';

const CUSTOMER_ID =
  '22222222-2222-4222-8222-222222222222';

const TEMPLATE_ID =
  '33333333-3333-4333-8333-333333333333';

const APPOINTMENT_ID =
  '44444444-4444-4444-8444-444444444444';

const OTHER_BUSINESS_ID =
  '55555555-5555-4555-8555-555555555555';

const validPayload = {
  business_id: BUSINESS_ID,
  customer_id: CUSTOMER_ID,
  appointment_date: '2026-10-15',
  appointment_time: '09:30',
  appointment_type: 'Consultation',
  reminder_enabled: true,
  reminder_minutes: 1440,
  template_id: TEMPLATE_ID,
};

function createServices(overrides = {}) {
  return {
    appointmentService: {
      listByBusinessId: async () => ({
        data: [],
        error: null,
      }),

      findById: async () => ({
        data: null,
        error: null,
      }),

      create: async (values) => ({
        data: {
          id: APPOINTMENT_ID,
          ...values,
        },
        error: null,
      }),

      update: async (id, values) => ({
        data: {
          id,
          business_id: BUSINESS_ID,
          ...values,
        },
        error: null,
      }),

      remove: async (id) => ({
        data: { id },
        error: null,
      }),

      ...overrides.appointmentService,
    },

    businessService: {
      findById: async (id) => ({
        data: {
          id,
          name: 'Test Business',
        },
        error: null,
      }),

      ...overrides.businessService,
    },

    customerService: {
      findById: async (id) => ({
        data: {
          id,
          business_id: BUSINESS_ID,
        },
        error: null,
      }),

      ...overrides.customerService,
    },

    messageTemplateService: {
      findById: async (id) => ({
        data: {
          id,
          business_id: BUSINESS_ID,
        },
        error: null,
      }),

      ...overrides.messageTemplateService,
    },
  };
}

async function withTestServer(
  overrides,
  run
) {
 const app = createApp({
  ...createServices(overrides),
  authMiddleware: bypassAuth,
});
  const server = app.listen(0,'127.0.0.1');
 

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();

  const baseUrl =
    `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

test(
  'Appointments API rejects an invalid business UUID',
  async () => {
    await withTestServer({}, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/appointments?business_id=invalid`
      );

      assert.equal(response.status, 400);

      const result = await response.json();

      assert.match(
        result.error,
        /valid UUID/
      );
    });
  }
);

test(
  'Appointments API lists appointments by business',
  async () => {
    const expectedAppointment = {
      id: APPOINTMENT_ID,
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      appointment_date: '2026-10-15',
      appointment_time: '09:30',
      appointment_type: 'Consultation',
      status: 'scheduled',
    };

    await withTestServer(
      {
        appointmentService: {
          listByBusinessId: async (businessId) => {
            assert.equal(
              businessId,
              BUSINESS_ID
            );

            return {
              data: [expectedAppointment],
              error: null,
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments?business_id=${BUSINESS_ID}`
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.deepEqual(
          result.data,
          [expectedAppointment]
        );
      }
    );
  }
);

test(
  'Appointments API validates and creates an appointment',
  async () => {
    let createdValues;

    await withTestServer(
      {
        appointmentService: {
          create: async (values) => {
            createdValues = values;

            return {
              data: {
                id: APPOINTMENT_ID,
                ...values,
              },
              error: null,
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(validPayload),
          }
        );

        assert.equal(response.status, 201);

        const result = await response.json();

        assert.equal(
          result.data.id,
          APPOINTMENT_ID
        );

        assert.equal(
          result.data.appointment_type,
          'Consultation'
        );

        assert.equal(
          result.data.status,
          'scheduled'
        );

        assert.deepEqual(
          createdValues,
          {
            ...validPayload,
            status: 'scheduled',
          }
        );
      }
    );
  }
);

test(
  'Appointments API rejects a customer from another business',
  async () => {
    let createCalled = false;

    await withTestServer(
      {
        customerService: {
          findById: async (id) => ({
            data: {
              id,
              business_id: OTHER_BUSINESS_ID,
            },
            error: null,
          }),
        },

        appointmentService: {
          create: async (values) => {
            createCalled = true;

            return {
              data: values,
              error: null,
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(validPayload),
          }
        );

        assert.equal(response.status, 400);

        const result = await response.json();

        assert.match(
          result.error,
          /does not belong/
        );

        assert.equal(createCalled, false);
      }
    );
  }
);

test(
  'Appointments API rejects invalid dates and times',
  async () => {
    const invalidPayload = {
      ...validPayload,
      appointment_date: '2026-02-30',
      appointment_time: '25:80',
    };

    await withTestServer(
      {},
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(invalidPayload),
          }
        );

        assert.equal(response.status, 400);

        const result = await response.json();

        assert.ok(
          result.errors.some((error) =>
            error.startsWith('appointment_date')
          )
        );

        assert.ok(
          result.errors.some((error) =>
            error.startsWith('appointment_time')
          )
        );
      }
    );
  }
);

test(
  'Appointments API updates an appointment',
  async () => {
    await withTestServer(
      {
        appointmentService: {
          findById: async (id) => ({
            data: {
              id,
              business_id: BUSINESS_ID,
              status: 'scheduled',
            },
            error: null,
          }),

          update: async (id, values) => ({
            data: {
              id,
              business_id: BUSINESS_ID,
              ...values,
            },
            error: null,
          }),
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments/${APPOINTMENT_ID}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              appointment_type: 'Follow-up',
              status: 'completed',
            }),
          }
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.equal(
          result.data.appointment_type,
          'Follow-up'
        );

        assert.equal(
          result.data.status,
          'completed'
        );
      }
    );
  }
);

test(
  'Appointments API deletes an appointment',
  async () => {
    await withTestServer(
      {},
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments/${APPOINTMENT_ID}`,
          {
            method: 'DELETE',
          }
        );

        assert.equal(response.status, 204);
      }
    );
  }
);