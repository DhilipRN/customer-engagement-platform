import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBusinessMembershipService,
  defaultPermissions,
} from '../src/services/businessMemberships.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444';
const AUDIT = {
  actor_user_id: USER_ID,
  event_type: 'business_membership.updated',
  before: { user_id: USER_ID, role: 'owner' },
  after: { user_id: USER_ID, role: 'receptionist' },
};

test('membership role defaults preserve the existing owner and receptionist permissions', () => {
  const ownerPermissions = defaultPermissions('owner');
  const receptionistPermissions = defaultPermissions('receptionist');

  assert.equal(Object.values(ownerPermissions).every(Boolean), true);
  assert.equal(receptionistPermissions.view_chats, true);
  assert.equal(
    Object.entries(receptionistPermissions)
      .filter(([permission]) => permission !== 'view_chats')
      .every(([, allowed]) => allowed === false),
    true,
  );
});

function createRpcClient(handler) {
  const calls = [];
  return {
    calls,
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return handler(name, parameters);
    },
    from() {
      throw new Error('Unexpected direct table access; membership mutations must use RPCs.');
    },
  };
}

test('membership creation delegates to one atomic RPC with explicit permissions', async () => {
  const client = createRpcClient((name, parameters) => ({
    data: {
      id: MEMBERSHIP_ID,
      business_id: parameters.p_business_id,
      user_id: parameters.p_user_id,
      role: parameters.p_role,
      permissions: parameters.p_permissions,
    },
    error: null,
  }));
  const service = createBusinessMembershipService(client);
  const permissions = {
    view_chats: true,
    view_customer_activity: false,
    send_messages: false,
    manage_customers: false,
  };

  const result = await service.create({
    businessId: BUSINESS_ID,
    userId: USER_ID,
    role: 'receptionist',
    permissions,
    audit: { ...AUDIT, event_type: 'business_membership.created', before: null },
  });

  assert.equal(result.error, null);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'create_business_membership');
  assert.deepEqual(client.calls[0].parameters, {
    p_business_id: BUSINESS_ID,
    p_user_id: USER_ID,
    p_role: 'receptionist',
    p_permissions: permissions,
    p_actor_user_id: USER_ID,
    p_audit_before: null,
    p_audit_after: AUDIT.after,
  });
});

test('duplicate concurrent creation is surfaced from the database uniqueness result', async () => {
  let created = false;
  const client = createRpcClient(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (created) return { data: null, error: { code: '23505', message: 'duplicate membership' } };
    created = true;
    return { data: { id: MEMBERSHIP_ID }, error: null };
  });
  const service = createBusinessMembershipService(client);
  const input = {
    businessId: BUSINESS_ID,
    userId: USER_ID,
    role: 'receptionist',
    permissions: {},
    audit: { ...AUDIT, event_type: 'business_membership.created', before: null },
  };

  const results = await Promise.all([service.create(input), service.create(input)]);

  assert.equal(results.filter((result) => !result.error).length, 1);
  assert.equal(results.filter((result) => result.error?.code === '23505').length, 1);
  assert.equal(client.calls.length, 2);
});

test('audit insert failure is returned without a compensating direct delete', async () => {
  const client = createRpcClient(() => ({
    data: null,
    error: { code: '23514', message: 'permission constraint failed' },
  }));
  const service = createBusinessMembershipService(client);

  const result = await service.create({
    businessId: BUSINESS_ID,
    userId: USER_ID,
    role: 'owner',
    permissions: {},
    audit: { ...AUDIT, event_type: 'business_membership.created', before: null },
  });

  assert.equal(result.data, null);
  assert.equal(result.error.code, '23514');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'create_business_membership');
});

test('owner transition conflicts are propagated from transactional RPCs', async () => {
  const conflict = { code: 'P0001', message: 'A business must retain an owner.' };
  const client = createRpcClient((name) => ({
    data: null,
    error: name === 'update_business_membership' || name === 'delete_business_membership' ? conflict : null,
  }));
  const service = createBusinessMembershipService(client);

  const update = await service.update(MEMBERSHIP_ID, BUSINESS_ID, { role: 'receptionist', audit: AUDIT });
  const remove = await service.remove(MEMBERSHIP_ID, BUSINESS_ID, AUDIT);

  assert.equal(update.error, conflict);
  assert.equal(remove.error, conflict);
  assert.deepEqual(client.calls.map((call) => call.name), [
    'update_business_membership',
    'delete_business_membership',
  ]);
});

test('audited update uses permissions returned by the transaction without a follow-up table read', async () => {
  const permissions = {
    view_chats: true,
    view_customer_activity: false,
    send_messages: false,
    manage_customers: false,
  };
  const client = createRpcClient((name) => name === 'update_business_membership'
    ? { data: { id: MEMBERSHIP_ID, permissions }, error: null }
    : { data: null, error: null });
  const service = createBusinessMembershipService(client);

  const result = await service.update(MEMBERSHIP_ID, BUSINESS_ID, {
    role: 'receptionist',
    permissions,
    audit: AUDIT,
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data.permissions, permissions);
  assert.deepEqual(client.calls.map((call) => call.name), ['update_business_membership']);
});
