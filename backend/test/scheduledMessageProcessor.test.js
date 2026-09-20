
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduledMessageProcessor } from '../src/services/scheduledMessageProcessor.js';

test('processes due queued messages and marks them as sent', async () => {
  const updates = [];

  const messageService = {
    async listDueQueued(now) {
      assert.ok(now);
      return {
        data: [
          { id: 'message-1', message_text: 'Review request' },
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
          data: [{ id: 'message-2', message_text: 'Hello' }],
          error: null,
        };
      },

      async update(id, values) {
        updates.push({ id, values });
        return { data: { id, ...values }, error: null };
      },
    },
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