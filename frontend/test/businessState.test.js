import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBusinessMutation,
  getBusinessAuditWarning,
} from '../src/businessState.js';

const existing = { id: 'existing', name: 'Existing' };
const created = { id: 'created', name: 'Created' };

test('business state adds successful create responses with audit warnings', () => {
  const businesses = applyBusinessMutation([existing], 'create', created);

  assert.deepEqual(businesses, [created, existing]);
  assert.equal(
    getBusinessAuditWarning({ data: created, warning: 'Audit event could not be recorded.' }),
    'Audit event could not be recorded.',
  );
});

test('business state applies successful updates without treating warnings as failures', () => {
  const updated = applyBusinessMutation(
    [existing],
    'update',
    { id: existing.id, name: 'Updated' },
  );

  assert.deepEqual(updated, [{ id: 'existing', name: 'Updated' }]);
  assert.equal(getBusinessAuditWarning({ data: updated[0] }), '');
});

test('business state removes successful deletes and preserves normal responses without warnings', () => {
  assert.deepEqual(applyBusinessMutation([existing, created], 'delete', existing), [created]);
  assert.equal(getBusinessAuditWarning({ data: { id: existing.id } }), '');
});
