
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledMessageProcessor } from '../src/services/scheduledMessageProcessor.js';

const BUSINESS_ID = 'business-1';
const CUSTOMER_ID = 'customer-1';

function createFakeActivityEventService(events = [], { fail = false } = {}) {
  return {
    async create(event) {
      if (fail) return { data: null, error: new Error('Audit unavailable') };
      events.push(event);
      return { data: { id: `event-${events.length}` }, error: null };
    },
  };
}

function dateOffset(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function customerComebackMessage(overrides = {}) {
  return {
    id: 'comeback-message-1',
    source: 'customer_comeback',
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    template_id: 'template-1',
    message_text: 'Come back soon',
    metadata: { inactivity_days: 30 },
    ...overrides,
  };
}

function customerComebackDependencies({
  customer = {
    id: CUSTOMER_ID,
    business_id: BUSINESS_ID,
    consent_given: true,
  },
  purchases = [{
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    purchase_date: dateOffset(-61),
  }],
  appointments = [],
  exclusions = [],
  template = { id: 'template-1', business_id: BUSINESS_ID, message: 'Come back soon' },
} = {}) {
  return {
    customerService: {
      async findById() {
        return { data: customer, error: null };
      },
    },
    businessService: {
      async findById(id) {
        return {
          data: id === BUSINESS_ID ? { id } : null,
          error: null,
        };
      },
    },
    purchaseService: {
      async list() {
        return { data: purchases, error: null };
      },
    },
    appointmentService: {
      async listCompletedByBusinessId() {
        return { data: appointments, error: null };
      },
    },
    messageTemplateService: {
      async findById() {
        return { data: template, error: null };
      },
    },
    exclusionService: {
      async listByBusinessId() {
        return { data: exclusions, error: null };
      },
    },
  };
}

async function processCustomerComebackMessage({
  message = customerComebackMessage(),
  dependencies = customerComebackDependencies(),
  updateValues = [],
} = {}) {
  let sendCalls = 0;
  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return { data: [message], error: null };
      },
      async update(_id, values) {
        updateValues.push(values);
        return { data: { ...message, ...values }, error: null };
      },
    },
    ...dependencies,
    simulatedSender: {
      async send() {
        sendCalls += 1;
        return { success: true, sentAt: new Date().toISOString() };
      },
    },
  });

  return {
    results: await processor.processDueMessages(),
    sendCalls,
    updateValues,
  };
}

function validCustomerService(overrides = {}) {
  return {
    async findById(id, businessId) {
      return {
        data: {
          id,
          business_id: businessId,
          consent_given: true,
          ...overrides,
        },
        error: null,
      };
    },
  };
}

test('processes due queued messages and marks them as sent', async () => {
  const updates = [];

  const messageService = {
    async listDueQueued(now) {
      assert.ok(now);
      return {
        data: [
          {
            id: 'message-1',
            business_id: BUSINESS_ID,
            customer_id: CUSTOMER_ID,
            message_text: 'Review request',
          },
        ],
        error: null,
      };
    },

    async update(id, values) {
      updates.push({ id, values });
      return { data: { id, ...values }, error: null };
    },
  };

  const simulatedSender = {
    async send(message) {
      assert.equal(message.id, 'message-1');
      return {
        success: true,
        sentAt: '2026-01-01T10:00:00.000Z',
      };
    },
  };

  const processor = createScheduledMessageProcessor({
    messageService,
    customerService: {
      async findById(id, businessId) {
        assert.equal(id, CUSTOMER_ID);
        assert.equal(businessId, BUSINESS_ID);
        return {
          data: {
            id,
            business_id: businessId,
            consent_given: true,
          },
          error: null,
        };
      },
    },
    simulatedSender,
  });

  const results = await processor.processDueMessages();

  assert.equal(results.length, 1);
  assert.equal(results[0].success, true);
  assert.equal(updates[0].values.status, 'sent');
  assert.equal(updates[0].values.sent_at, '2026-01-01T10:00:00.000Z');
});

test('returns an empty result when no messages are due', async () => {
  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return { data: [], error: null };
      },
    },
    simulatedSender: {
      async send() {
        assert.fail('Sender should not be called');
      },
    },
  });

  const results = await processor.processDueMessages();

  assert.deepEqual(results, []);
});

test('marks a message as failed when the sender reports failure', async () => {
  const updates = [];

  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return {
          data: [{
            id: 'message-2',
            business_id: BUSINESS_ID,
            customer_id: CUSTOMER_ID,
            message_text: 'Hello',
          }],
          error: null,
        };
      },

      async update(id, values) {
        updates.push({ id, values });
        return { data: { id, ...values }, error: null };
      },
    },
    customerService: validCustomerService(),
    simulatedSender: {
      async send() {
        return { success: false, error: 'Simulated send failure' };
      },
    },
  });

  const results = await processor.processDueMessages();

  assert.equal(results.length, 1);
  assert.equal(results[0].success, false);
  assert.equal(updates[0].values.status, 'failed');
});

test('throws an error when fetching due messages fails', async () => {
  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return {
          data: null,
          error: { message: 'Database unavailable' },
        };
      },
    },
    customerService: validCustomerService(),
    simulatedSender: {
      async send() {
        assert.fail('Sender should not be called');
      },
    },
  });

  await assert.rejects(
    processor.processDueMessages(),
    /Unable to fetch due queued messages: Database unavailable/
  );
});

test('does not dispatch a message when consent was revoked after queueing', async () => {
  const updates = [];
  let sendCalls = 0;

  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return {
          data: [{
            id: 'message-revoked',
            business_id: BUSINESS_ID,
            customer_id: CUSTOMER_ID,
          }],
          error: null,
        };
      },
      async update(id, values) {
        updates.push({ id, values });
        return { data: { id, ...values }, error: null };
      },
    },
    customerService: validCustomerService({ consent_given: false }),
    simulatedSender: {
      async send() {
        sendCalls += 1;
        return { success: true, sentAt: new Date().toISOString() };
      },
    },
  });

  const results = await processor.processDueMessages();

  assert.equal(sendCalls, 0);
  assert.equal(results[0].success, false);
  assert.match(results[0].error, /consent/i);
  assert.deepEqual(updates[0].values, { status: 'failed' });
});

test('false, null, and missing consent prevent dispatch', async () => {
  for (const customer of [
    { consent_given: false },
    { consent_given: null },
    {},
  ]) {
    let sendCalls = 0;
    let updateValues;

    const processor = createScheduledMessageProcessor({
      messageService: {
        async listDueQueued() {
          return {
            data: [{
              id: 'message-no-consent',
              business_id: BUSINESS_ID,
              customer_id: CUSTOMER_ID,
            }],
            error: null,
          };
        },
        async update(_id, values) {
          updateValues = values;
          return { data: { status: values.status }, error: null };
        },
      },
      customerService: {
        async findById() {
          return {
            data: {
              id: CUSTOMER_ID,
              business_id: BUSINESS_ID,
              ...customer,
            },
            error: null,
          };
        },
      },
      simulatedSender: {
        async send() {
          sendCalls += 1;
          return { success: true, sentAt: new Date().toISOString() };
        },
      },
    });

    const results = await processor.processDueMessages();

    assert.equal(sendCalls, 0);
    assert.equal(results[0].success, false);
    assert.deepEqual(updateValues, { status: 'failed' });
  }
});

test('missing or mismatched customers are failed without dispatch', async () => {
  for (const customer of [null, {
    id: CUSTOMER_ID,
    business_id: 'other-business',
    consent_given: true,
  }]) {
    let sendCalls = 0;
    let updateValues;

    const processor = createScheduledMessageProcessor({
      messageService: {
        async listDueQueued() {
          return {
            data: [{
              id: 'message-invalid-customer',
              business_id: BUSINESS_ID,
              customer_id: CUSTOMER_ID,
            }],
            error: null,
          };
        },
        async update(_id, values) {
          updateValues = values;
          return { data: { status: values.status }, error: null };
        },
      },
      customerService: {
        async findById(id, businessId) {
          assert.equal(id, CUSTOMER_ID);
          assert.equal(businessId, BUSINESS_ID);
          return { data: customer, error: null };
        },
      },
      simulatedSender: {
        async send() {
          sendCalls += 1;
          return { success: true, sentAt: new Date().toISOString() };
        },
      },
    });

    const results = await processor.processDueMessages();

    assert.equal(sendCalls, 0);
    assert.equal(results[0].success, false);
    assert.match(results[0].error, /relationship/i);
    assert.deepEqual(updateValues, { status: 'failed' });
  }
});

test('failed consent messages are not dispatched again', async () => {
  let messageStatus = 'queued';
  let sendCalls = 0;
  let updateCalls = 0;

  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return {
          data: messageStatus === 'queued'
            ? [{
                id: 'message-terminal',
                business_id: BUSINESS_ID,
                customer_id: CUSTOMER_ID,
              }]
            : [],
          error: null,
        };
      },
      async update(_id, values) {
        updateCalls += 1;
        messageStatus = values.status;
        return { data: { status: messageStatus }, error: null };
      },
    },
    customerService: validCustomerService({ consent_given: false }),
    simulatedSender: {
      async send() {
        sendCalls += 1;
        return { success: true, sentAt: new Date().toISOString() };
      },
    },
  });

  await processor.processDueMessages();
  const secondResults = await processor.processDueMessages();

  assert.equal(sendCalls, 0);
  assert.equal(updateCalls, 1);
  assert.deepEqual(secondResults, []);
});

test('Customer Comeback validation exceptions fail terminally without dispatch', async () => {
  const exceptionCases = [
    ['customer', (dependencies) => {
      dependencies.customerService.findById = async () => {
        throw new Error('Customer database unavailable');
      };
    }],
    ['exclusion', (dependencies) => {
      dependencies.exclusionService.listByBusinessId = async () => {
        throw new Error('Exclusion database unavailable');
      };
    }],
    ['activity', (dependencies) => {
      dependencies.purchaseService.list = async () => {
        throw new Error('Purchase database unavailable');
      };
    }],
    ['template', (dependencies) => {
      dependencies.messageTemplateService.findById = async () => {
        throw new Error('Template database unavailable');
      };
    }],
  ];

  for (const [label, configureException] of exceptionCases) {
    let status = 'queued';
    let updateCalls = 0;
    let sendCalls = 0;
    const dependencies = customerComebackDependencies();
    configureException(dependencies);

    const processor = createScheduledMessageProcessor({
      messageService: {
        async listDueQueued() {
          return {
            data: status === 'queued' ? [customerComebackMessage()] : [],
            error: null,
          };
        },
        async update(_id, values) {
          updateCalls += 1;
          status = values.status;
          return { data: { status }, error: null };
        },
      },
      ...dependencies,
      simulatedSender: {
        async send() {
          sendCalls += 1;
          return { success: true, sentAt: new Date().toISOString() };
        },
      },
    });

    const firstResults = await processor.processDueMessages();
    const secondResults = await processor.processDueMessages();

    assert.equal(sendCalls, 0, `${label} validation must not dispatch`);
    assert.equal(updateCalls, 1, `${label} validation must fail once`);
    assert.deepEqual(firstResults[0].message, { status: 'failed' });
    assert.equal(
      firstResults[0].error,
      'Customer Comeback validation could not be completed safely.'
    );
    assert.deepEqual(secondResults, [], `${label} failure must be terminal`);
  }
});

test('Customer Comeback messages are not dispatched after an exclusion is added', async () => {
  const result = await processCustomerComebackMessage({
    dependencies: customerComebackDependencies({
      exclusions: [{ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
    }),
  });

  assert.equal(result.sendCalls, 0);
  assert.equal(result.results[0].success, false);
  assert.match(result.results[0].error, /excluded/i);
  assert.deepEqual(result.updateValues, [{ status: 'failed' }]);
});

test('Customer Comeback messages are not dispatched after consent is revoked', async () => {
  const result = await processCustomerComebackMessage({
    dependencies: customerComebackDependencies({
      customer: {
        id: CUSTOMER_ID,
        business_id: BUSINESS_ID,
        consent_given: false,
      },
    }),
  });

  assert.equal(result.sendCalls, 0);
  assert.match(result.results[0].error, /consent/i);
  assert.deepEqual(result.updateValues, [{ status: 'failed' }]);
});

test('Customer Comeback messages are not dispatched after the customer becomes active', async () => {
  const result = await processCustomerComebackMessage({
    dependencies: customerComebackDependencies({
      appointments: [{
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        appointment_date: dateOffset(-1),
        status: 'completed',
      }],
    }),
  });

  assert.equal(result.sendCalls, 0);
  assert.match(result.results[0].error, /no longer eligible/i);
  assert.deepEqual(result.updateValues, [{ status: 'failed' }]);
});

test('Customer Comeback messages are not dispatched for a cross-business customer', async () => {
  const result = await processCustomerComebackMessage({
    dependencies: customerComebackDependencies({
      customer: {
        id: CUSTOMER_ID,
        business_id: 'other-business',
        consent_given: true,
      },
    }),
  });

  assert.equal(result.sendCalls, 0);
  assert.match(result.results[0].error, /relationship/i);
  assert.deepEqual(result.updateValues, [{ status: 'failed' }]);
});

test('Rejected Customer Comeback messages are terminal and not processed again', async () => {
  let status = 'queued';
  let sendCalls = 0;
  let updateCalls = 0;
  const dependencies = customerComebackDependencies({
    exclusions: [{ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
  });
  const processor = createScheduledMessageProcessor({
    messageService: {
      async listDueQueued() {
        return {
          data: status === 'queued' ? [customerComebackMessage()] : [],
          error: null,
        };
      },
      async update(_id, values) {
        updateCalls += 1;
        status = values.status;
        return { data: { status }, error: null };
      },
    },
    ...dependencies,
    simulatedSender: {
      async send() {
        sendCalls += 1;
        return { success: true, sentAt: new Date().toISOString() };
      },
    },
  });

  await processor.processDueMessages();
  const secondResults = await processor.processDueMessages();

  assert.equal(sendCalls, 0);
  assert.equal(updateCalls, 1);
  assert.deepEqual(secondResults, []);
});

test('message dispatch transitions record system audit events once', async () => {
  const events = [];
  let status = 'queued';
  let sendCalls = 0;
  const processor = createScheduledMessageProcessor({
    activityEventService: createFakeActivityEventService(events),
    messageService: {
      async listDueQueued() {
        return {
          data: status === 'queued'
            ? [{ id: 'message-audit', business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }]
            : [],
          error: null,
        };
      },
      async update(_id, values) {
        status = values.status;
        return { data: { id: 'message-audit', ...values }, error: null };
      },
    },
    customerService: validCustomerService(),
    simulatedSender: {
      async send() {
        sendCalls += 1;
        return { success: true, sentAt: '2026-10-15T10:00:00.000Z' };
      },
    },
  });

  const first = await processor.processDueMessages();
  const second = await processor.processDueMessages();

  assert.equal(first[0].success, true);
  assert.deepEqual(second, []);
  assert.equal(sendCalls, 1);
  assert.deepEqual(events.map((event) => event.event_type), ['message.sent']);
  assert.equal(events[0].actor_type, 'system');
  assert.equal(events[0].actor_user_id, null);
  assert.equal(events[0].scope_type, 'business');
  assert.equal(events[0].business_id, BUSINESS_ID);
  assert.deepEqual(events[0].before, { status: 'queued' });
  assert.deepEqual(events[0].after, {
    status: 'sent',
    sent_at: '2026-10-15T10:00:00.000Z',
  });
});

test('sender failures record an audit-only failed transition', async () => {
  const events = [];
  const processor = createScheduledMessageProcessor({
    activityEventService: createFakeActivityEventService(events),
    messageService: {
      async listDueQueued() {
        return {
          data: [{ id: 'message-failed-audit', business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
          error: null,
        };
      },
      async update(_id, values) {
        return { data: { id: 'message-failed-audit', ...values }, error: null };
      },
    },
    customerService: validCustomerService(),
    simulatedSender: {
      async send() {
        return { success: false, error: 'Simulated send failure' };
      },
    },
  });

  const result = await processor.processDueMessages();

  assert.equal(result[0].success, false);
  assert.deepEqual(events.map((event) => event.event_type), ['message.failed']);
  assert.deepEqual(events[0].after, { status: 'failed' });
});

test('Customer Comeback rejection records a specific audit outcome', async () => {
  const events = [];
  const processor = createScheduledMessageProcessor({
    activityEventService: createFakeActivityEventService(events),
    messageService: {
      async listDueQueued() {
        return { data: [customerComebackMessage()], error: null };
      },
      async update(_id, values) {
        return { data: values, error: null };
      },
    },
    ...customerComebackDependencies({
      exclusions: [{ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
    }),
    simulatedSender: {
      async send() {
        assert.fail('Rejected Customer Comeback messages must not dispatch');
      },
    },
  });

  await processor.processDueMessages();
  assert.deepEqual(events.map((event) => event.event_type), [
    'message.customer_comeback_rejected',
  ]);
  assert.equal(events[0].metadata.source, 'customer_comeback');
});

test('audit persistence failure is reported without claiming dispatch success', async () => {
  const processor = createScheduledMessageProcessor({
    activityEventService: createFakeActivityEventService([], { fail: true }),
    messageService: {
      async listDueQueued() {
        return {
          data: [{ id: 'message-audit-failure', business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
          error: null,
        };
      },
      async update(_id, values) {
        return { data: { id: 'message-audit-failure', ...values }, error: null };
      },
    },
    customerService: validCustomerService(),
    simulatedSender: {
      async send() {
        return { success: true, sentAt: '2026-10-15T10:00:00.000Z' };
      },
    },
  });

  const result = await processor.processDueMessages();

  assert.equal(result[0].success, false);
  assert.match(result[0].error, /audit event could not be recorded/i);
});
