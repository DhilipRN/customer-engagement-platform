import assert from 'node:assert/strict';
import test from 'node:test';
import { recordSystemMessageEvent } from '../src/services/messageActivityEvents.js';

const message = {
  id: 'message-1',
  business_id: 'business-1',
  customer_id: 'customer-1',
};

test('system message audit events are business-scoped and audit-only', async () => {
  let received;
  const result = await recordSystemMessageEvent(
    {
      async create(event) {
        received = event;
        return { data: { id: 'event-1' }, error: null };
      },
    },
    message,
    'message.queued',
    { after: { status: 'queued' }, metadata: { source: 'campaign' } },
  );

  assert.equal(result.error, null);
  assert.deepEqual(received, {
    scope_type: 'business',
    business_id: 'business-1',
    actor_user_id: null,
    actor_type: 'system',
    event_type: 'message.queued',
    entity_type: 'message',
    entity_id: 'message-1',
    customer_id: 'customer-1',
    is_reconstructed: false,
    visibility: 'audit_only',
    after: { status: 'queued' },
    metadata: { source: 'campaign' },
  });
});

test('system message audit failures are returned explicitly', async () => {
  const result = await recordSystemMessageEvent(
    {
      async create() {
        return { data: null, error: new Error('Audit unavailable') };
      },
    },
    message,
    'message.failed',
  );

  assert.equal(result.data, null);
  assert.equal(result.error.message, 'Audit unavailable');
});
