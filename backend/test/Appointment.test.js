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

const OTHER_CUSTOMER_ID =
  '66666666-6666-4666-8666-666666666666';

const OTHER_TEMPLATE_ID =
  '77777777-7777-4777-8777-777777777777';

const OTHER_APPOINTMENT_ID =
  '88888888-8888-4888-8888-888888888888';

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

function createServices(overrides = {}) {
  return {
    appointmentService: {
      listByBusinessId: async () => ({
        data: [],
        error: null,
      }),

      listByIds: async () => ({
        data: [],
        error: null,
      }),

      findById: async (id) => ({
        data: id === APPOINTMENT_ID
          ? {
            id: APPOINTMENT_ID,
            business_id: BUSINESS_ID,
            customer_id: CUSTOMER_ID,
            template_id: TEMPLATE_ID,
            appointment_date: '2026-10-15',
            appointment_time: '09:30',
            appointment_type: 'Consultation',
            status: 'scheduled',
          }
          : null,
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

    messageService: overrides.messageService,

    activityEventService:
      overrides.activityEventService ?? createFakeActivityEventService(),
  };
}

async function withTestServer(
  overrides,
  run
) {
 const app = createApp({
  ...createServices(overrides),
  authMiddleware: overrides.authMiddleware ?? bypassAuth,
  businessAccessMiddleware: overrides.businessAccessMiddleware,
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

function createClientAppointmentService({ mutationCalls } = {}) {
  const rows = [
    {
      id: APPOINTMENT_ID,
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      template_id: TEMPLATE_ID,
      appointment_date: '2026-10-15',
      appointment_time: '09:30',
      appointment_type: 'Consultation',
      status: 'scheduled',
    },
    {
      id: OTHER_APPOINTMENT_ID,
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
      template_id: OTHER_TEMPLATE_ID,
      appointment_date: '2026-10-16',
      appointment_time: '10:30',
      appointment_type: 'Other consultation',
      status: 'scheduled',
    },
  ];

  return {
    rows,
    listByBusinessId: async (businessId) => ({
      data: rows.filter((row) => row.business_id === businessId),
      error: null,
    }),
    findById: async (id, businessId = null) => ({
      data: rows.find((row) => row.id === id && (!businessId || row.business_id === businessId)) ?? null,
      error: null,
    }),
    create: async (values) => { mutationCalls && (mutationCalls.create += 1); return ({
      data: { id: '99999999-9999-4999-8999-999999999999', ...values },
      error: null,
    }); },
    update: async (id, values, businessId = null) => {
      const row = rows.find((item) => item.id === id && (!businessId || item.business_id === businessId));
      mutationCalls && (mutationCalls.update += 1);
      if (!row) return { data: null, error: null };
      Object.assign(row, values);
      return { data: row, error: null };
    },
    remove: async (id, businessId = null) => {
      mutationCalls && (mutationCalls.remove += 1);
      const index = rows.findIndex((row) => row.id === id && (!businessId || row.business_id === businessId));
      return { data: index < 0 ? null : rows[index], error: null };
    },
  };
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
  'Appointments API filters a customer appointment history within the business',
  async () => {
    await withTestServer(
      {
        appointmentService: {
          listByBusinessId: async (businessId, customerId) => {
            assert.equal(businessId, BUSINESS_ID);
            assert.equal(customerId, CUSTOMER_ID);
            return {
              data: [{
                id: APPOINTMENT_ID,
                business_id: BUSINESS_ID,
                customer_id: CUSTOMER_ID,
                appointment_date: '2026-10-15',
                appointment_time: '09:30',
                status: 'scheduled',
              }],
              error: null,
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments?business_id=${BUSINESS_ID}&customer_id=${CUSTOMER_ID}`,
        );

        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.data[0].customer_id, CUSTOMER_ID);

        const invalidResponse = await fetch(
          `${baseUrl}/appointments?business_id=${BUSINESS_ID}&customer_id=not-a-uuid`,
        );
        assert.equal(invalidResponse.status, 400);
      },
    );
  },
);

test(
  'Appointments API exposes reminder statuses without exposing message content',
  async () => {
    await withTestServer(
      {
        messageService: {
          listAppointmentReminderStatuses: async (businessId) => {
            assert.equal(businessId, BUSINESS_ID);
            return {
              data: [{
                id: '99999999-9999-4999-8999-999999999999',
                appointment_id: APPOINTMENT_ID,
                status: 'sent',
                scheduled_at: '2026-10-14T09:30:00.000Z',
                sent_at: '2026-10-14T09:30:03.000Z',
                created_at: '2026-10-14T09:30:00.000Z',
                source: 'appointment_reminder',
                template_id: TEMPLATE_ID,
              }],
              error: null,
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments/reminders?business_id=${BUSINESS_ID}`,
        );

        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.data[0].status, 'sent');
        assert.equal(result.data[0].appointment_id, APPOINTMENT_ID);
        assert.equal(Object.hasOwn(result.data[0], 'message_text'), false);
      },
    );
  },
);

test(
  'Appointments API protects reminder summaries with view_appointments',
  async () => {
    let messageServiceCalled = false;

    await withTestServer(
      {
        authMiddleware: (request, _response, next) => {
          request.user = { id: 'client-user' };
          request.profile = { role: 'client', business_id: BUSINESS_ID };
          next();
        },
        businessAccessMiddleware: (request, _response, next) => {
          request.businessAuthorization = {
            authorized: true,
            permissions: { view_appointments: false },
          };
          next();
        },
        messageService: {
          listAppointmentReminderStatuses: async () => {
            messageServiceCalled = true;
            return { data: [], error: null };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/appointments/reminders?business_id=${BUSINESS_ID}`,
        );

        assert.equal(response.status, 403);
        assert.equal(messageServiceCalled, false);
      },
    );
  },
);

test(
  'Appointments API bulk queues eligible reminders and reports skips',
  async () => {
    const created = [];
    const existing = new Set();

    await withTestServer(
      {
        appointmentService: {
          listByIds: async (ids) => ({
            data: ids
              .filter((id) => id === APPOINTMENT_ID || id === OTHER_APPOINTMENT_ID)
              .map((id) => id === APPOINTMENT_ID
                ? {
                  id,
                  business_id: BUSINESS_ID,
                  customer_id: CUSTOMER_ID,
                  appointment_date: '2026-11-15',
                  appointment_time: '09:30',
                  appointment_type: 'Consultation',
                  status: 'scheduled',
                  reminder_enabled: true,
                  reminder_minutes: 1440,
                  template_id: TEMPLATE_ID,
                }
                : {
                  id,
                  business_id: BUSINESS_ID,
                  customer_id: CUSTOMER_ID,
                  appointment_date: '2026-11-16',
                  appointment_time: '10:30',
                  status: 'scheduled',
                  reminder_enabled: false,
                  template_id: TEMPLATE_ID,
                }),
            error: null,
          }),
        },
        customerService: {
          findById: async () => ({
            data: { id: CUSTOMER_ID, business_id: BUSINESS_ID, name: 'Patient', consent_given: true },
            error: null,
          }),
        },
        businessService: {
          findById: async () => ({ data: { id: BUSINESS_ID, name: 'Clinic' }, error: null }),
        },
        messageTemplateService: {
          findById: async () => ({ data: { id: TEMPLATE_ID, business_id: BUSINESS_ID, message: 'Hi {{customer_name}}' }, error: null }),
        },
        messageService: {
          findByAppointmentId: async (id) => ({
            data: existing.has(id) ? { id: `message-${id}` } : null,
            error: null,
          }),
          create: async (values) => {
            existing.add(values.appointment_id);
            created.push(values);
            return { data: { id: `message-${created.length}`, ...values }, error: null };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/appointments/reminders/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment_ids: [APPOINTMENT_ID, OTHER_APPOINTMENT_ID, APPOINTMENT_ID] }),
        });

        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.data.queued_count, 1);
        assert.equal(result.data.skipped_count, 2);
        assert.deepEqual(result.data.skipped.map((item) => item.reason), [
          'reminder_disabled',
          'duplicate_request',
        ]);
        assert.equal(created.length, 1);
      },
    );
  },
);

test(
  'Appointments API rejects invalid bulk IDs and scopes client appointments',
  async () => {
    await withTestServer(
      {
        authMiddleware: (request, _response, next) => {
          request.user = { id: 'client-user' };
          request.profile = { role: 'client', business_id: BUSINESS_ID };
          next();
        },
        businessAccessMiddleware: (request, _response, next) => {
          request.businessAuthorization = {
            authorized: true,
            source: 'membership',
            membership: { business_id: BUSINESS_ID, role: 'owner' },
            permissions: { manage_appointments: true, view_appointments: true },
          };
          next();
        },
        appointmentService: {
          listByIds: async (_ids, businessId) => {
            assert.equal(businessId, BUSINESS_ID);
            return { data: [], error: null };
          },
        },
      },
      async (baseUrl) => {
        const invalid = await fetch(`${baseUrl}/appointments/reminders/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment_ids: ['invalid'] }),
        });
        assert.equal(invalid.status, 400);

        const outsideScope = await fetch(`${baseUrl}/appointments/reminders/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment_ids: [OTHER_APPOINTMENT_ID] }),
        });
        assert.equal(outsideScope.status, 200);
        const result = await outsideScope.json();
        assert.equal(result.data.skipped[0].reason, 'not_found_or_not_authorized');
      },
    );
  },
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
  'Appointments API defaults omitted reminders to disabled and preserves explicit values',
  async () => {
    const createdValues = [];

    await withTestServer(
      {
        appointmentService: {
          create: async (values) => {
            createdValues.push(values);

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
        const omittedReminderPayload = {
          ...validPayload,
        };
        delete omittedReminderPayload.reminder_enabled;
        delete omittedReminderPayload.template_id;

        const omittedReminder = await fetch(
          `${baseUrl}/appointments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(omittedReminderPayload),
          }
        );

        assert.equal(omittedReminder.status, 201);
        assert.equal(createdValues[0].reminder_enabled, false);
        assert.equal(createdValues[0].template_id, null);

        const explicitDisabled = await fetch(
          `${baseUrl}/appointments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...validPayload,
              reminder_enabled: false,
            }),
          }
        );

        assert.equal(explicitDisabled.status, 201);
        assert.equal(createdValues[1].reminder_enabled, false);
        assert.equal(createdValues[1].template_id, TEMPLATE_ID);

        assert.equal(validPayload.reminder_enabled, true);
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
              template_id: TEMPLATE_ID,
            }),
          }
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.equal(
          result.data.appointment_type,
          'Follow-up'
        );
        assert.equal(result.data.template_id, TEMPLATE_ID);

        const clearResponse = await fetch(
          `${baseUrl}/appointments/${APPOINTMENT_ID}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ template_id: null }),
          }
        );

        assert.equal(clearResponse.status, 200);
        assert.equal((await clearResponse.json()).data.template_id, null);

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

test(
  'Appointments API isolates client access by business',
  async () => {
    const mutationCalls = { create: 0, update: 0, remove: 0 };
    const appointmentService = createClientAppointmentService({ mutationCalls });
    const otherAppointmentBefore = structuredClone(
      appointmentService.rows.find((row) => row.id === OTHER_APPOINTMENT_ID),
    );
    await withTestServer(
      {
        appointmentService,
        businessService: {
          findById: async (id) => ({
            data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id)
              ? { id, name: 'Test Business', google_review_link: 'https://example.com/review' }
              : null,
            error: null,
          }),
        },
        customerService: {
          findById: async (id) => ({
            data: id === CUSTOMER_ID
              ? { id, business_id: BUSINESS_ID }
              : id === OTHER_CUSTOMER_ID
                ? { id, business_id: OTHER_BUSINESS_ID }
                : null,
            error: null,
          }),
        },
        messageTemplateService: {
          findById: async (id) => ({
            data: id === TEMPLATE_ID
              ? { id, business_id: BUSINESS_ID }
              : id === OTHER_TEMPLATE_ID
                ? { id, business_id: OTHER_BUSINESS_ID }
                : null,
            error: null,
          }),
        },
        authMiddleware: (request, _response, next) => {
          request.profile = { role: 'client', business_id: BUSINESS_ID };
          next();
        },
      },
      async (baseUrl) => {
        assert.equal(
          (await fetch(`${baseUrl}/appointments?business_id=${OTHER_BUSINESS_ID}`)).status,
          403
        );
        assert.equal(
          (await fetch(`${baseUrl}/appointments/${OTHER_APPOINTMENT_ID}`)).status,
          404
        );

        const wrongBusinessCreate = await fetch(`${baseUrl}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validPayload, business_id: OTHER_BUSINESS_ID }),
        });
        assert.equal(wrongBusinessCreate.status, 403);
        assert.equal(mutationCalls.create, 0);

        const wrongCustomerCreate = await fetch(`${baseUrl}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validPayload, customer_id: OTHER_CUSTOMER_ID }),
        });
        assert.equal(wrongCustomerCreate.status, 400);

        const wrongTemplateUpdate = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: OTHER_TEMPLATE_ID }),
        });
        assert.equal(wrongTemplateUpdate.status, 400);

        const wrongTemplateCreate = await fetch(`${baseUrl}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validPayload, template_id: OTHER_TEMPLATE_ID }),
        });
        assert.equal(wrongTemplateCreate.status, 400);

        const wrongCustomerUpdate = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: OTHER_CUSTOMER_ID }),
        });
        assert.equal(wrongCustomerUpdate.status, 400);

        const wrongBusinessUpdate = await fetch(`${baseUrl}/appointments/${OTHER_APPOINTMENT_ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        assert.equal(wrongBusinessUpdate.status, 404);
        assert.equal(mutationCalls.update, 0);
        assert.deepEqual(
          appointmentService.rows.find((row) => row.id === OTHER_APPOINTMENT_ID),
          otherAppointmentBefore,
        );

        const cancellation = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'cancelled' }),
        });
        assert.equal(cancellation.status, 200);

        assert.equal(
          (await fetch(`${baseUrl}/appointments/${OTHER_APPOINTMENT_ID}`, { method: 'DELETE' })).status,
          404
        );
        assert.equal(mutationCalls.remove, 0);
      }
    );
  }
);

test(
  'Appointments API records creation, rescheduling, status transitions, and deletion audit events',
  async () => {
    const events = [];
    const appointment = {
      id: APPOINTMENT_ID,
      business_id: BUSINESS_ID,
      customer_id: CUSTOMER_ID,
      template_id: TEMPLATE_ID,
      appointment_date: '2026-10-15',
      appointment_time: '09:30',
      appointment_type: 'Consultation',
      status: 'scheduled',
      reminder_enabled: true,
      reminder_minutes: 1440,
    };
    const appointmentService = {
      findById: async () => ({ data: { ...appointment }, error: null }),
      create: async (values) => {
        Object.assign(appointment, values);
        return { data: { ...appointment }, error: null };
      },
      update: async (_id, values) => {
        Object.assign(appointment, values);
        return { data: { ...appointment }, error: null };
      },
      remove: async () => ({ data: { ...appointment }, error: null }),
    };
    const activityEventService = createFakeActivityEventService(events);

    await withTestServer(
      { appointmentService, activityEventService },
      async (baseUrl) => {
        const created = await fetch(`${baseUrl}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validPayload),
        });
        assert.equal(created.status, 201);

        const rescheduled = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointment_date: '2026-10-16', appointment_time: '10:30' }),
        });
        assert.equal(rescheduled.status, 200);

        for (const status of ['completed', 'cancelled', 'no_show']) {
          const response = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
          assert.equal(response.status, 200);
        }

        const deleted = await fetch(`${baseUrl}/appointments/${APPOINTMENT_ID}`, {
          method: 'DELETE',
        });
        assert.equal(deleted.status, 204);
      },
    );

    assert.deepEqual(events.map((event) => event.event_type), [
      'appointment.created',
      'appointment.rescheduled',
      'appointment.completed',
      'appointment.cancelled',
      'appointment.no_show',
      'appointment.deleted',
    ]);
    assert.deepEqual(events[1].before, {
      appointment_date: '2026-10-15',
      appointment_time: '09:30',
    });
    assert.deepEqual(events[1].after, {
      appointment_date: '2026-10-16',
      appointment_time: '10:30',
    });
    assert.deepEqual(events[2].before, { status: 'scheduled' });
    assert.deepEqual(events[2].after, { status: 'completed' });
    assert.equal(events[5].entity_id, APPOINTMENT_ID);
    assert.equal(events[5].customer_id, CUSTOMER_ID);
  }
);

test(
  'Appointments API reports audit persistence failures explicitly',
  async () => {
    let createCalled = false;

    await withTestServer(
      {
        activityEventService: createFakeActivityEventService([], { fail: true }),
        appointmentService: {
          create: async (values) => {
            createCalled = true;
            return { data: { id: APPOINTMENT_ID, ...values }, error: null };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validPayload),
        });

        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
          error:
            'Appointment operation succeeded, but its audit event could not be recorded.',
        });
      },
    );

    assert.equal(createCalled, true);
  }
);
