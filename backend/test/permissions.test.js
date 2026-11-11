import assert from 'node:assert/strict';
import test from 'node:test';
import { createPermissionService } from '../src/middleware/permissions.js';

const USER_ID = 'user-1';
const BUSINESS_ID = 'business-1';
const OTHER_BUSINESS_ID = 'business-2';
const MEMBERSHIP_ID = 'membership-1';

function request({
  role = 'client',
  businessId = BUSINESS_ID,
  userId = USER_ID,
} = {}) {
  return {
    user: { id: userId },
    profile: { id: userId, role, business_id: businessId },
  };
}

function createFakeSupabase({
  memberships = [],
  permissions = [],
  membershipError = null,
  permissionError = null,
} = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      const filters = [];
      const query = {
        select(columns) {
          calls.push(['select', table, columns]);
          return query;
        },
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        in(column, values) {
          filters.push([column, values]);
          return query;
        },
        then(resolve, reject) {
          const payload = table === 'business_memberships'
            ? { data: memberships, error: membershipError }
            : { data: permissions, error: permissionError };

          calls.push(['query', table, filters]);
          return Promise.resolve(payload).then(resolve, reject);
        },
      };

      return query;
    },
  };
}

test('admin authorization preserves the platform override without database lookup', async () => {
  const supabase = createFakeSupabase();
  const service = createPermissionService(supabase);

  const result = await service.getBusinessAuthorization(
    request({ role: 'admin', businessId: null }),
    OTHER_BUSINESS_ID
  );

  assert.equal(result.error, null);
  assert.equal(result.data.authorized, true);
  assert.equal(result.data.source, 'admin');
  assert.equal(result.data.permissions.send_messages, true);
  assert.deepEqual(supabase.calls, []);
});

test('legacy clients retain access to their assigned business without memberships', async () => {
  const service = createPermissionService(createFakeSupabase());

  const result = await service.getBusinessAuthorization(
    request(),
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, true);
  assert.equal(result.data.source, 'legacy-client');
  assert.equal(result.data.permissions.manage_customers, true);
});

test('membership discovery returns only valid businesses for the authenticated user', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [
      { business_id: BUSINESS_ID, user_id: USER_ID, role: 'receptionist' },
      { business_id: OTHER_BUSINESS_ID, user_id: USER_ID, role: 'owner' },
      { business_id: 'business-3', user_id: USER_ID, role: 'unknown' },
    ],
  }));

  const result = await service.listAuthorizedBusinessIds(request({ businessId: null }));

  assert.deepEqual(result.data, [BUSINESS_ID, OTHER_BUSINESS_ID]);
  assert.equal(result.source, 'membership');
  assert.equal(result.error, null);
});

test('membership discovery does not expose an unauthorized business', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{ business_id: BUSINESS_ID, user_id: USER_ID, role: 'receptionist' }],
  }));

  const result = await service.listAuthorizedBusinessIds(request({ businessId: OTHER_BUSINESS_ID }));

  assert.deepEqual(result.data, [BUSINESS_ID]);
  assert.equal(result.data.includes(OTHER_BUSINESS_ID), false);
});

test('membership discovery fails closed when the membership lookup fails', async () => {
  const databaseError = { code: '42P01', message: 'business_memberships does not exist' };
  const service = createPermissionService(createFakeSupabase({
    membershipError: databaseError,
  }));

  const result = await service.listAuthorizedBusinessIds(request());

  assert.equal(result.data, null);
  assert.deepEqual(result.error, databaseError);
  assert.equal(result.reason, 'membership_lookup_failed');
});

test('legacy clients are denied for another business', async () => {
  const service = createPermissionService(createFakeSupabase());

  const result = await service.getBusinessAuthorization(
    request(),
    OTHER_BUSINESS_ID
  );

  assert.equal(result.data.authorized, false);
  assert.equal(result.data.reason, 'business_access_denied');
});

test('a former member with a cleared legacy assignment is denied after last-membership deletion', async () => {
  const service = createPermissionService(createFakeSupabase());
  const formerMemberRequest = request({ businessId: null });

  const authorization = await service.getBusinessAuthorization(
    formerMemberRequest,
    BUSINESS_ID,
  );
  const discoveredBusinesses = await service.listAuthorizedBusinessIds(formerMemberRequest);

  assert.equal(authorization.data.authorized, false);
  assert.equal(authorization.data.reason, 'business_access_denied');
  assert.deepEqual(discoveredBusinesses.data, []);
  assert.equal(discoveredBusinesses.source, 'legacy-client');
});

test('a remaining membership preserves membership access and suppresses legacy fallback', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{
      id: MEMBERSHIP_ID,
      business_id: OTHER_BUSINESS_ID,
      user_id: USER_ID,
      role: 'receptionist',
    }],
  }));
  const assignedToAnotherBusiness = request({ businessId: BUSINESS_ID });

  const legacyBusiness = await service.getBusinessAuthorization(
    assignedToAnotherBusiness,
    BUSINESS_ID,
  );
  const remainingMembershipBusiness = await service.getBusinessAuthorization(
    assignedToAnotherBusiness,
    OTHER_BUSINESS_ID,
  );

  assert.equal(legacyBusiness.data.authorized, false);
  assert.equal(legacyBusiness.data.reason, 'business_membership_required');
  assert.equal(remainingMembershipBusiness.data.authorized, true);
  assert.equal(remainingMembershipBusiness.data.source, 'membership');
});

test('membership users receive only the supported configured permissions', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{
      id: MEMBERSHIP_ID,
      business_id: BUSINESS_ID,
      user_id: USER_ID,
      role: 'receptionist',
    }],
    permissions: [
      { permission: 'view_chats', allowed: true },
      { permission: 'send_messages', allowed: true },
      { permission: 'unsupported_permission', allowed: true },
    ],
  }));

  const result = await service.getBusinessAuthorization(
    request(),
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, true);
  assert.equal(result.data.source, 'membership');
  assert.equal(result.data.role, 'receptionist');
  assert.equal(result.data.permissions.view_chats, true);
  assert.equal(result.data.permissions.send_messages, true);
  assert.equal(result.data.permissions.view_customer_activity, false);
  assert.equal(result.data.permissions.manage_customers, false);
  assert.equal(result.data.permissions.unsupported_permission, undefined);
});

test('membership users are denied for a business without a matching membership', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{
      id: MEMBERSHIP_ID,
      business_id: BUSINESS_ID,
      user_id: USER_ID,
      role: 'receptionist',
    }],
  }));

  const result = await service.getBusinessAuthorization(
    request(),
    OTHER_BUSINESS_ID
  );

  assert.equal(result.data.authorized, false);
  assert.equal(result.data.reason, 'business_membership_required');
});

test('receptionist business isolation rejects a forged business id while preserving admin access', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{
      id: MEMBERSHIP_ID,
      business_id: BUSINESS_ID,
      user_id: USER_ID,
      role: 'receptionist',
    }],
    permissions: [{ permission: 'view_chats', allowed: true }],
  }));

  const receptionistOwnBusiness = await service.getBusinessAuthorization(
    request(),
    BUSINESS_ID,
  );
  const receptionistForgedBusiness = await service.getBusinessAuthorization(
    request(),
    OTHER_BUSINESS_ID,
  );
  const adminOtherBusiness = await service.getBusinessAuthorization(
    request({ role: 'admin', businessId: null }),
    OTHER_BUSINESS_ID,
  );

  assert.equal(receptionistOwnBusiness.data.authorized, true);
  assert.equal(receptionistOwnBusiness.data.permissions.view_chats, true);
  assert.equal(receptionistOwnBusiness.data.permissions.manage_customers, false);
  assert.equal(receptionistForgedBusiness.data.authorized, false);
  assert.equal(adminOtherBusiness.data.authorized, true);
});

test('missing permissions default to denied for membership users', async () => {
  const service = createPermissionService(createFakeSupabase({
    memberships: [{
      id: MEMBERSHIP_ID,
      business_id: BUSINESS_ID,
      user_id: USER_ID,
      role: 'receptionist',
    }],
  }));

  const result = await service.getBusinessAuthorization(
    request(),
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, true);
  assert.deepEqual(result.data.permissions, {
    view_chats: false,
    view_customer_activity: false,
    send_messages: false,
    manage_customers: false,
    view_appointments: false,
    manage_appointments: false,
    view_purchases: false,
    manage_purchases: false,
    view_campaigns: false,
    manage_campaigns: false,
    view_message_templates: false,
    manage_message_templates: false,
    view_automations: false,
    manage_automations: false,
  });
});

test('unknown roles are denied without database lookup', async () => {
  const supabase = createFakeSupabase();
  const service = createPermissionService(supabase);

  const result = await service.getBusinessAuthorization(
    request({ role: 'unknown' }),
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, false);
  assert.equal(result.data.reason, 'unsupported_role');
  assert.deepEqual(supabase.calls, []);
});

test('missing authentication context is denied', async () => {
  const service = createPermissionService(createFakeSupabase());

  const result = await service.getBusinessAuthorization(
    { profile: { id: USER_ID, role: 'admin' } },
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, false);
  assert.equal(result.data.reason, 'authorization_context_missing');
});

test('membership lookup errors deny access explicitly', async () => {
  const databaseError = { code: '42501', message: 'permission denied' };
  const service = createPermissionService(createFakeSupabase({
    membershipError: databaseError,
  }));

  const result = await service.getBusinessAuthorization(
    request(),
    BUSINESS_ID
  );

  assert.equal(result.data.authorized, false);
  assert.equal(result.data.reason, 'membership_lookup_failed');
  assert.deepEqual(result.error, databaseError);
});
