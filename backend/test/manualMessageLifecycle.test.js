import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createMessagesRouter } from '../src/routes/messages.js';
import { createScheduledMessageProcessor } from '../src/services/scheduledMessageProcessor.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const OTHER_BUSINESS_ID = 'a4a39f8e-73f6-4d86-a99b-9bd5f47a38f6';
const OTHER_CUSTOMER_ID = 'f13c2c44-72c8-4df7-a4b3-8205918a2c2e';

function createHarness({ consent = true, simulatedSender, createDelay = 0 } = {}) {
  const rows = [];
  const events = [];
  let nextId = 1;

  const messageService = {
    async create(values) {
      if (createDelay) {
        await new Promise((resolve) => setTimeout(resolve, createDelay));
      }
      if (rows.some((item) => item.business_id === values.business_id && item.idempotency_key === values.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } };
      }
      const message = {
        id: `00000000-0000-4000-8000-00000000000${nextId++}`,
        ...values,
      };
      rows.push(message);
      return { data: message, error: null };
    },
    async findByIdempotencyKey(businessId, idempotencyKey) {
      return {
        data: rows.find((message) =>
          message.business_id === businessId &&
          message.idempotency_key === idempotencyKey
        ) ?? null,
        error: null,
      };
    },
    async listDueQueued(now) {
      return {
        data: rows.filter((message) =>
          message.status === 'queued' &&
          message.scheduled_at &&
          message.scheduled_at <= now
        ),
        error: null,
      };
    },
    async update(id, values) {
      const message = rows.find((item) => item.id === id);
      if (!message) return { data: null, error: null };
      Object.assign(message, values);
      return { data: message, error: null };
    },
  };

  const customerService = {
    async findById(id, businessId) {
      return {
        data: id === CUSTOMER_ID || id === OTHER_CUSTOMER_ID
          ? { id, business_id: id === CUSTOMER_ID ? BUSINESS_ID : OTHER_BUSINESS_ID, consent_given: consent }
          : null,
        error: null,
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: request.get('x-test-user') ?? 'admin-1' };
    request.profile = { id: request.user.id, role: 'admin', business_id: null };
    next();
  });
  app.use('/messages', createMessagesRouter({
    businessAccessMiddleware: (_request, _response, next) => next(),
    businessService: {
      async findById(id) {
        return { data: id === BUSINESS_ID || id === OTHER_BUSINESS_ID ? { id } : null, error: null };
      },
    },
    customerService,
    messageService,
  }));

  return {
    app,
    rows,
    events,
    messageService,
    customerService,
    processor: createScheduledMessageProcessor({
      messageService,
      customerService,
      activityEventService: {
        async create(event) {
          events.push(event);
          return { data: { id: `event-${events.length}` }, error: null };
        },
      },
      simulatedSender: simulatedSender ?? {
        async send(message) {
          return {
            success: true,
            sentAt: '2026-10-15T10:00:00.000Z',
            messageId: message.id,
          };
        },
      },
    }),
  };
}

async function postMessage(server, body, userId = 'admin-1') {
  return fetch(
    `http://127.0.0.1:${server.address().port}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': userId },
      body: JSON.stringify({
        business_id: BUSINESS_ID,
        customer_id: CUSTOMER_ID,
        message_text: 'Hello from Chats',
        ...body,
      }),
    },
  );
}

async function withHarness(options, callback) {
  const harness = createHarness(options);
  const server = await new Promise((resolve) => {
    const listener = harness.app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    await callback(harness, server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('manual message creation queues immediately and reaches the simulated sender', async () => {
  await withHarness({}, async ({ rows, events, processor }, server) => {
    const response = await postMessage(server, {
      status: 'sent',
      sent_at: '2026-10-01T10:00:00.000Z',
      scheduled_at: '2099-01-01T00:00:00.000Z',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.status, 'queued');
    assert.equal(body.data.sent_at, undefined);
    assert.ok(new Date(body.data.scheduled_at).valueOf() <= Date.now());

    const results = await processor.processDueMessages();

    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
    assert.equal(rows[0].status, 'sent');
    assert.equal(rows[0].sent_at, '2026-10-15T10:00:00.000Z');
    assert.deepEqual(events.map((event) => event.event_type), ['message.sent']);
    assert.deepEqual(events[0].before, { status: 'queued' });
    assert.deepEqual(events[0].after.status, 'sent');
  });
});

test('manually queued messages record simulated delivery failures', async () => {
  await withHarness({
    simulatedSender: {
      async send() {
        return { success: false, error: 'Simulated send failure' };
      },
    },
  }, async ({ rows, events, processor }, server) => {
    const response = await postMessage(server);
    assert.equal(response.status, 201);

    const results = await processor.processDueMessages();

    assert.equal(results[0].success, false);
    assert.equal(rows[0].status, 'failed');
    assert.deepEqual(events.map((event) => event.event_type), ['message.failed']);
  });
});

test('manual message creation still rejects customers without consent', async () => {
  await withHarness({ consent: false }, async ({ rows }, server) => {
    const response = await postMessage(server);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: 'Customer has not provided consent to receive messages.',
    });
    assert.deepEqual(rows, []);
  });
});

test('retries with the same key return the existing queued message without duplication', async () => {
  await withHarness({}, async ({ rows, events, processor }, server) => {
    const idempotencyKey = '11111111-1111-4111-8111-111111111111';
    const first = await postMessage(server, { idempotency_key: idempotencyKey });
    const firstBody = await first.json();
    const retry = await postMessage(server, { idempotency_key: idempotencyKey });
    const retryBody = await retry.json();

    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retryBody.data.id, firstBody.data.id);
    assert.equal(rows.length, 1);

    await processor.processDueMessages();
    assert.deepEqual(events.map((event) => event.event_type), ['message.sent']);
  });
});

test('reusing a key with a different payload is rejected', async () => {
  await withHarness({}, async ({ rows }, server) => {
    const idempotencyKey = '22222222-2222-4222-8222-222222222222';
    assert.equal((await postMessage(server, {
      idempotency_key: idempotencyKey,
      message_text: 'First payload',
    })).status, 201);

    const conflict = await postMessage(server, {
      idempotency_key: idempotencyKey,
      message_text: 'Different payload',
    });

    assert.equal(conflict.status, 409);
    assert.match((await conflict.json()).error, /different message payload/);
    assert.equal(rows.length, 1);
  });
});

test('concurrent retries converge on one queued message', async () => {
  await withHarness({ createDelay: 10 }, async ({ rows }, server) => {
    const idempotencyKey = '33333333-3333-4333-8333-333333333333';
    const responses = await Promise.all([
      postMessage(server, { idempotency_key: idempotencyKey }),
      postMessage(server, { idempotency_key: idempotencyKey }),
    ]);

    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    assert.equal(rows.length, 1);
  });
});

test('idempotency keys are isolated by authenticated user and business', async () => {
  await withHarness({}, async ({ rows }, server) => {
    const idempotencyKey = '44444444-4444-4444-8444-444444444444';
    assert.equal((await postMessage(server, { idempotency_key: idempotencyKey }, 'user-a')).status, 201);
    assert.equal((await postMessage(server, { idempotency_key: idempotencyKey }, 'user-b')).status, 201);
    assert.equal((await postMessage(server, {
      idempotency_key: idempotencyKey,
      business_id: OTHER_BUSINESS_ID,
      customer_id: OTHER_CUSTOMER_ID,
    }, 'user-a')).status, 201);
    assert.equal(rows.length, 3);
  });
});
