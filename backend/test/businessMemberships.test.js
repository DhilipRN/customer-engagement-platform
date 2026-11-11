import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { createBusinessMembershipsRouter } from '../src/routes/businessMemberships.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const OTHER_BUSINESS_ID = 'f3d24e3c-3e8c-4732-8224-3e71e1b73e62';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const RECEPTIONIST_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_OWNER_MEMBERSHIP_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_PROFILE_ID = '77777777-7777-4777-8777-777777777777';

const allPermissions = {
  view_chats: true,
  view_customer_activity: true,
  send_messages: true,
  manage_customers: true,
  view_appointments: true,
  manage_appointments: true,
  view_purchases: true,
  manage_purchases: true,
  view_campaigns: true,
  manage_campaigns: true,
  view_message_templates: true,
  manage_message_templates: true,
  view_automations: true,
  manage_automations: true,
};

function createHarness({ actorId = OWNER_ID, actorRole = 'admin', actorBusinessId = null, permissionError = null, mutationError = null } = {}) {
  const members = [{
    id: OWNER_MEMBERSHIP_ID,
    business_id: BUSINESS_ID,
    user_id: OWNER_ID,
    role: 'owner',
    permissions: allPermissions,
  }];
  const profiles = new Set([OWNER_ID, RECEPTIONIST_ID, TARGET_ID, ADMIN_PROFILE_ID]);
  const events = [];
  const serviceCalls = {
    listEligibleClientUsers: 0,
    listByBusinessId: 0,
  };

  const membershipService = {
    async listByBusinessId(businessId) {
      serviceCalls.listByBusinessId += 1;
      return { data: members.filter((member) => member.business_id === businessId), error: null };
    },
    async find(id, businessId) {
      return { data: members.find((member) => member.id === id && member.business_id === businessId) ?? null, error: null };
    },
    async findProfile(userId) {
      return {
        data: profiles.has(userId)
          ? { id: userId, role: userId === ADMIN_PROFILE_ID ? 'admin' : 'client', business_id: null }
          : null,
        error: null,
      };
    },
    async listEligibleClientUsers(businessId) {
      serviceCalls.listEligibleClientUsers += 1;
      if (businessId !== BUSINESS_ID) return { data: [], error: null };
      const existingIds = new Set(members
        .filter((member) => member.business_id === businessId)
        .map((member) => member.user_id));
      return {
        data: [RECEPTIONIST_ID, TARGET_ID]
          .filter((id) => !existingIds.has(id))
          .map((id) => ({ id, email: `${id}@example.com` })),
        error: null,
      };
    },
    async create({ businessId, userId, role, permissions, audit }) {
      if (mutationError) return { data: null, error: mutationError };
      if (members.some((member) => member.business_id === businessId && member.user_id === userId)) {
        return { data: null, error: { code: '23505' } };
      }
      const member = {
        id: `66666666-6666-4666-8666-${String(members.length + 1).padStart(12, '0')}`,
        business_id: businessId,
        user_id: userId,
        role,
        permissions,
      };
      members.push(member);
      events.push(audit);
      return { data: member, error: null };
    },
    async update(id, businessId, { role, permissions, audit }) {
      if (mutationError) return { data: null, error: mutationError };
      const member = members.find((item) => item.id === id && item.business_id === businessId);
      if (!member) return { data: null, error: null };
      if (role !== undefined) member.role = role;
      if (permissions !== undefined) member.permissions = permissions;
      events.push(audit);
      return { data: member, error: null };
    },
    async countOwners(businessId) {
      return { data: members.filter((member) => member.business_id === businessId && member.role === 'owner'), error: null };
    },
    async remove(id, businessId, audit) {
      if (mutationError) return { data: null, error: mutationError };
      const index = members.findIndex((member) => member.id === id && member.business_id === businessId);
      if (index === -1) return { data: null, error: null };
      if (members[index].role === 'owner' && members.filter((member) => member.business_id === businessId && member.role === 'owner').length <= 1) {
        return { data: null, error: { code: 'OWNER_REQUIRED', message: 'A business must retain an owner.' } };
      }
      const removed = members.splice(index, 1)[0];
      events.push(audit);
      return { data: removed, error: null };
    },
  };

  const businessService = {
    async findById(id) {
      return { data: [BUSINESS_ID, OTHER_BUSINESS_ID].includes(id) ? { id, name: 'Business' } : null, error: null };
    },
  };

  const permissionService = {
    async getBusinessAuthorization(_request, businessId) {
      if (permissionError) return { data: null, error: permissionError };
      if (actorRole === 'admin') return { data: { authorized: true, source: 'admin' }, error: null };
      return {
        data: {
          authorized: actorRole === 'owner' && businessId === actorBusinessId,
          source: 'membership',
          membership: { business_id: actorBusinessId, role: actorRole },
        },
        error: null,
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.user = { id: actorId };
    request.profile = { id: actorId, role: actorRole === 'admin' ? 'admin' : 'client', business_id: actorBusinessId };
    next();
  });
  app.use('/businesses', createBusinessMembershipsRouter({
    businessService,
    membershipService,
    permissionService,
    activityEventService: {
      async create(event) {
        events.push(event);
        return { data: { id: `event-${events.length}` }, error: null };
      },
    },
  }));

  return { app, members, events, serviceCalls };
}

async function withServer(options, callback) {
  const harness = createHarness(options);
  const server = await new Promise((resolve) => {
    const listener = harness.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, harness);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function memberUrl(baseUrl, businessId = BUSINESS_ID, membershipId = '') {
  return `${baseUrl}/businesses/${businessId}/members${membershipId ? `/${membershipId}` : ''}`;
}

function candidateUrl(baseUrl, businessId = BUSINESS_ID) {
  return `${baseUrl}/businesses/${businessId}/member-candidates`;
}

test('owners receive only eligible client candidates for their business', async () => {
  await withServer({ actorRole: 'owner', actorBusinessId: BUSINESS_ID }, async (baseUrl) => {
    const response = await fetch(candidateUrl(baseUrl));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data, [{ id: RECEPTIONIST_ID, email: `${RECEPTIONIST_ID}@example.com` }, { id: TARGET_ID, email: `${TARGET_ID}@example.com` }]);
  });
});

test('candidate lookup enforces business owner authorization and rejects receptionists', async () => {
  await withServer({ actorRole: 'owner', actorBusinessId: BUSINESS_ID }, async (baseUrl) => {
    const response = await fetch(candidateUrl(baseUrl, OTHER_BUSINESS_ID));
    assert.equal(response.status, 403);
  });

  await withServer({ actorId: RECEPTIONIST_ID, actorRole: 'receptionist', actorBusinessId: BUSINESS_ID }, async (baseUrl, harness) => {
    const response = await fetch(candidateUrl(baseUrl));
    assert.equal(response.status, 403);
    assert.equal(harness.serviceCalls.listEligibleClientUsers, 0);
  });
});

test('admins can list and add business members with explicit permission rows', async () => {
  await withServer({}, async (baseUrl, harness) => {
    const candidates = await fetch(candidateUrl(baseUrl));
    assert.equal(candidates.status, 200);

    const list = await fetch(memberUrl(baseUrl));
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data.length, 1);

    const create = await fetch(memberUrl(baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: TARGET_ID, role: 'receptionist' }),
    });
    const body = await create.json();
    assert.equal(create.status, 201);
    assert.deepEqual(body.data.permissions, {
      view_chats: true,
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
    assert.equal(harness.events[0].event_type, 'business_membership.created');
    assert.equal(harness.members.length, 2);
  });
});

test('business owners can manage members but receptionists cannot', async () => {
  await withServer({ actorRole: 'owner', actorBusinessId: BUSINESS_ID }, async (baseUrl) => {
    const response = await fetch(memberUrl(baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: TARGET_ID, role: 'receptionist', permissions: { view_chats: true } }),
    });
    assert.equal(response.status, 201);
  });

  await withServer({ actorId: RECEPTIONIST_ID, actorRole: 'receptionist', actorBusinessId: BUSINESS_ID }, async (baseUrl, harness) => {
    const response = await fetch(memberUrl(baseUrl));
    assert.equal(response.status, 403);
    assert.equal(harness.serviceCalls.listByBusinessId, 0);
  });
});

test('owners cannot manage a different business', async () => {
  await withServer({ actorRole: 'owner', actorBusinessId: BUSINESS_ID }, async (baseUrl, harness) => {
    const response = await fetch(memberUrl(baseUrl, OTHER_BUSINESS_ID));
    assert.equal(response.status, 403);
    assert.equal(harness.serviceCalls.listByBusinessId, 0);
  });
});

test('invalid users, roles, permissions, and duplicate memberships are rejected', async () => {
  await withServer({}, async (baseUrl) => {
    const invalidUser = await fetch(memberUrl(baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: 'not-a-uuid' }) });
    assert.equal(invalidUser.status, 400);
    const invalidRole = await fetch(memberUrl(baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: TARGET_ID, role: 'admin' }) });
    assert.equal(invalidRole.status, 400);
    const invalidPermission = await fetch(memberUrl(baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: TARGET_ID, permissions: { unknown: true } }) });
    assert.equal(invalidPermission.status, 400);
    const ineligibleUser = await fetch(memberUrl(baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: ADMIN_PROFILE_ID }) });
    assert.equal(ineligibleUser.status, 400);
    const duplicate = await fetch(memberUrl(baseUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: OWNER_ID, role: 'owner' }) });
    assert.equal(duplicate.status, 409);
  });
});

test('owners cannot remove or demote the last owner', async () => {
  await withServer({}, async (baseUrl, harness) => {
    const remove = await fetch(memberUrl(baseUrl, BUSINESS_ID, OWNER_MEMBERSHIP_ID), { method: 'DELETE' });
    assert.equal(remove.status, 409);

    harness.members.push({ id: SECOND_OWNER_MEMBERSHIP_ID, business_id: BUSINESS_ID, user_id: TARGET_ID, role: 'owner', permissions: allPermissions });
    const demote = await fetch(memberUrl(baseUrl, BUSINESS_ID, OWNER_MEMBERSHIP_ID), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'receptionist' }) });
    assert.equal(demote.status, 200);
    assert.equal(harness.events.filter((event) => event.event_type === 'business_membership.updated').length, 1);
    const removeSecond = await fetch(memberUrl(baseUrl, BUSINESS_ID, SECOND_OWNER_MEMBERSHIP_ID), { method: 'DELETE' });
    assert.equal(removeSecond.status, 409);
  });
});

test('successful membership updates and deletes each produce one audit event', async () => {
  await withServer({}, async (baseUrl, harness) => {
    const create = await fetch(memberUrl(baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: TARGET_ID, role: 'receptionist' }),
    });
    assert.equal(create.status, 201);
    const created = harness.members.find((member) => member.user_id === TARGET_ID);

    const update = await fetch(memberUrl(baseUrl, BUSINESS_ID, created.id), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'owner' }),
    });
    assert.equal(update.status, 200);

    const remove = await fetch(memberUrl(baseUrl, BUSINESS_ID, created.id), { method: 'DELETE' });
    assert.equal(remove.status, 204);
    assert.equal(harness.events.filter((event) => event.event_type === 'business_membership.created').length, 1);
    assert.equal(harness.events.filter((event) => event.event_type === 'business_membership.updated').length, 1);
    assert.equal(harness.events.filter((event) => event.event_type === 'business_membership.deleted').length, 1);
  });
});

test('authorization lookup failures fail closed', async () => {
  await withServer({ actorRole: 'owner', actorBusinessId: BUSINESS_ID, permissionError: new Error('membership lookup failed') }, async (baseUrl) => {
    const response = await fetch(memberUrl(baseUrl));
    assert.equal(response.status, 500);
  });
});

test('RPC owner revalidation failures return forbidden without recording a mutation', async () => {
  await withServer({
    actorRole: 'owner',
    actorBusinessId: BUSINESS_ID,
    mutationError: { code: 'P0003', message: 'A business owner or admin is required.' },
  }, async (baseUrl, harness) => {
    const response = await fetch(memberUrl(baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: TARGET_ID, role: 'receptionist' }),
    });
    assert.equal(response.status, 403);
    assert.equal(harness.members.some((member) => member.user_id === TARGET_ID), false);
    assert.equal(harness.events.length, 0);
  });
});
