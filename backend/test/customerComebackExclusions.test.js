import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomerComebackExclusionService } from '../src/services/customerComebackExclusions.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const CUSTOMER_ID = 'e693ff85-1344-4764-9d10-e2d4cbbeedc7';
const USER_ID = '2c7d7c1e-fb32-4a57-9f84-6e57b3f1f6d1';

function createQuery(result, calls) {
  const query = {
    select(columns) {
      calls.push(['select', columns]);
      return query;
    },
    eq(column, value) {
      calls.push(['eq', column, value]);
      return query;
    },
    order(column, options) {
      calls.push(['order', column, options]);
      return query;
    },
    insert(values) {
      calls.push(['insert', values]);
      return query;
    },
    delete() {
      calls.push(['delete']);
      return query;
    },
    single() {
      return Promise.resolve(result);
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return query;
}

function createFakeSupabase(result) {
  const calls = [];

  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return createQuery(result, calls);
    },
  };
}

test('Customer Comeback exclusions list is scoped to the exact business', async () => {
  const supabase = createFakeSupabase({
    data: [{ business_id: BUSINESS_ID, customer_id: CUSTOMER_ID }],
    error: null,
  });
  const service = createCustomerComebackExclusionService(supabase);

  const result = await service.listByBusinessId(BUSINESS_ID);

  assert.deepEqual(result.data[0], {
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
  });
  assert.deepEqual(supabase.calls, [
    ['from', 'customer_comeback_exclusions'],
    ['select', '*'],
    ['eq', 'business_id', BUSINESS_ID],
    ['order', 'created_at', { ascending: false }],
  ]);
});

test('Customer Comeback exclusions create forwards exact IDs and creator', async () => {
  const row = {
    business_id: BUSINESS_ID,
    customer_id: CUSTOMER_ID,
    created_by: USER_ID,
  };
  const supabase = createFakeSupabase({ data: row, error: null });
  const service = createCustomerComebackExclusionService(supabase);

  const result = await service.create(BUSINESS_ID, CUSTOMER_ID, USER_ID);

  assert.deepEqual(result.data, row);
  assert.deepEqual(supabase.calls, [
    ['from', 'customer_comeback_exclusions'],
    ['insert', row],
    ['select', '*'],
  ]);
});

test('Customer Comeback exclusions preserve duplicate and missing-record results', async () => {
  const duplicateError = { code: '23505', message: 'duplicate key' };
  const duplicateSupabase = createFakeSupabase({ data: null, error: duplicateError });
  const duplicateService = createCustomerComebackExclusionService(duplicateSupabase);

  assert.deepEqual(
    await duplicateService.create(BUSINESS_ID, CUSTOMER_ID),
    { data: null, error: duplicateError },
  );

  const missingSupabase = createFakeSupabase({ data: null, error: null });
  const missingService = createCustomerComebackExclusionService(missingSupabase);

  assert.deepEqual(
    await missingService.remove(BUSINESS_ID, CUSTOMER_ID),
    { data: null, error: null },
  );
  assert.deepEqual(missingSupabase.calls, [
    ['from', 'customer_comeback_exclusions'],
    ['delete'],
    ['eq', 'business_id', BUSINESS_ID],
    ['eq', 'customer_id', CUSTOMER_ID],
    ['select', 'business_id, customer_id'],
  ]);
});
