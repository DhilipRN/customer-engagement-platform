import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
const PREVIOUS_BUSINESS_ID = '07373922-f6e5-4a5d-b855-4f14d762fce5';
const CLIENT_ID = 'client-1';
const ADMIN_ID = 'admin-1';

function createSupabaseClient({
  profiles = [],
  profileListError = null,
  users = [],
  usersError = null,
  businesses = [],
  businessError = null,
  targetProfiles = {},
  targetProfileError = null,
  memberships = [],
  membershipsError = null,
  rpcResult,
  rpcError = null,
  rpcCalls = [],
} = {}) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({
          data: { users },
          error: usersError,
        }),
      },
    },

    async rpc(functionName, parameters) {
      rpcCalls.push({ functionName, parameters });
      return {
        data: rpcResult ?? {
          id: CLIENT_ID,
          role: 'client',
          business_id: parameters.p_business_id,
          created_at: '2026-10-04T00:00:00.000Z',
          updated_at: '2026-10-04T00:00:00.000Z',
        },
        error: rpcError,
      };
    },

    from(table) {
      if (table === 'businesses') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: businesses.length > 0 ? businesses[0] : null,
                    error: businessError,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === 'business_memberships') {
        return {
          select() {
            return Promise.resolve({ data: memberships, error: membershipsError });
          },
        };
      }

      assert.equal(table, 'profiles');

      return {
        select(columns) {
          if (columns === 'id, role, business_id, created_at') {
            return {
              order: async () => ({
                data: profiles,
                error: profileListError,
              }),
              eq(_column, id) {
                return {
                  single: async () => ({
                    data: targetProfiles[id] ?? null,
                    error: targetProfileError,
                  }),
                };
              },
            };
          }

          return {
            eq(_column, id) {
              return {
                single: async () => ({
                  data: targetProfiles[id] ?? null,
                  error: targetProfileError,
                }),
              };
            },
          };
        },

      };
    },
  };
}

function createAuthMiddleware(role) {
  return (request, response, next) => {
    request.profile = { role };
    request.user = { id: ADMIN_ID };
    bypassAuth(request, response, next);
  };
}

async function withTestServer({ role = 'admin', supabaseClient }, callback) {
  const app = createApp({
    supabaseClient,
    authMiddleware: createAuthMiddleware(role),
  });
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

const clientProfile = {
  id: CLIENT_ID,
  role: 'client',
  business_id: null,
};

test('user profile API lists profiles for an admin', async () => {
  const supabaseClient = createSupabaseClient({
    profiles: [
      {
        ...clientProfile,
        created_at: '2026-10-04T00:00:00.000Z',
      },
    ],
    memberships: [{ user_id: CLIENT_ID, business_id: null, role: 'owner' }],
    users: [{ id: CLIENT_ID, email: 'client@example.com' }],
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, [
      {
        ...clientProfile,
        created_at: '2026-10-04T00:00:00.000Z',
        email: 'client@example.com',
        membership_role: 'owner',
      },
    ]);
  });
});

test('user profile API denies profile listing to clients', async () => {
  await withTestServer(
    {
      role: 'client',
      supabaseClient: createSupabaseClient(),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/user-profiles`);

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: 'Admin access required.',
      });
    },
  );
});

test('an admin can assign an existing business to an existing client profile', async () => {
  const rpcCalls = [];
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcCalls,
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/user-profiles/${CLIENT_ID}/business`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID }),
      },
    );

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.id, CLIENT_ID);
    assert.equal(body.data.role, 'client');
    assert.equal(body.data.business_id, BUSINESS_ID);
  });

  assert.deepEqual(rpcCalls, [{
    functionName: 'assign_client_profile_business',
    parameters: {
      p_profile_id: CLIENT_ID,
      p_business_id: BUSINESS_ID,
      p_expected_business_id: null,
      p_actor_user_id: ADMIN_ID,
      p_membership_role: 'receptionist',
    },
  }]);
});

test('a client cannot assign a business to a user profile', async () => {
  const rpcCalls = [];
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcCalls,
  });

  await withTestServer({ role: 'client', supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID }),
    });

    assert.equal(response.status, 403);
  });

  assert.deepEqual(rpcCalls, []);
});

test('business assignment passes the current business as the conflict expectation', async () => {
  const rpcCalls = [];
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: {
      [CLIENT_ID]: { ...clientProfile, business_id: PREVIOUS_BUSINESS_ID },
    },
    rpcCalls,
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID }),
    });

    assert.equal(response.status, 200);
  });

  assert.equal(rpcCalls[0].parameters.p_expected_business_id, PREVIOUS_BUSINESS_ID);
  assert.equal(rpcCalls[0].parameters.p_membership_role, 'receptionist');
});

test('business assignment passes owner role to the atomic RPC', async () => {
  const rpcCalls = [];
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcCalls,
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, membership_role: 'owner' }),
    });

    assert.equal(response.status, 200);
  });

  assert.equal(rpcCalls[0].parameters.p_membership_role, 'owner');
});

test('business assignment rejects invalid membership roles before the RPC', async () => {
  const rpcCalls = [];
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcCalls,
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, membership_role: 'admin' }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'membership_role must be either receptionist or owner.',
    });
  });

  assert.deepEqual(rpcCalls, []);
});

test('business assignment requires business_id', async () => {
  await withTestServer(
    { supabaseClient: createSupabaseClient() },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/user-profiles/${CLIENT_ID}/business`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'business_id is required.',
      });
    },
  );
});

test('business assignment reports a conflict from the atomic assignment RPC', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: {
      [CLIENT_ID]: { ...clientProfile, business_id: PREVIOUS_BUSINESS_ID },
    },
    rpcError: { code: 'P0004' },
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error: 'Business assignment changed. Please refresh and try again.',
    });
  });
});

test('business assignment rejects a nonexistent business', async () => {
  await withTestServer(
    { supabaseClient: createSupabaseClient() },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/user-profiles/${CLIENT_ID}/business`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: BUSINESS_ID }),
        },
      );

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'Business not found.',
      });
    },
  );
});

test('business assignment rejects a nonexistent target profile', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/user-profiles/missing-profile/business`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID }),
      },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'User profile not found.',
    });
  });
});

test('business assignment rejects an admin profile', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: {
      [ADMIN_ID]: { id: ADMIN_ID, role: 'admin', business_id: null },
    },
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/user-profiles/${ADMIN_ID}/business`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID }),
      },
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'Only client users can be assigned to a business.',
    });
  });
});

test('profile lookup errors return the profile-not-found response', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfileError: new Error('profile lookup failed'),
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/user-profiles/${CLIENT_ID}/business`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID }),
      },
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'User profile not found.',
    });
  });
});

test('profile update errors return a server error response', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcError: new Error('profile update failed'),
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/user-profiles/${CLIENT_ID}/business`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: BUSINESS_ID }),
      },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to assign business.',
    });
  });
});

test('business assignment reports atomic RPC failures as a server error', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcError: new Error('audit insert failed'),
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID }),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to assign business.',
    });
  });
});

test('business assignment reports last-owner protection as an actionable conflict', async () => {
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
    rpcError: { code: 'P0001', message: 'A business must retain an owner.' },
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles/${CLIENT_ID}/business`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: BUSINESS_ID, membership_role: 'receptionist' }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      error:
        'Cannot change this membership because the business must retain at least one owner. Assign another owner first.',
    });
  });
});

test('profile list database errors return a server error response', async () => {
  const supabaseClient = createSupabaseClient({
    profileListError: new Error('profile list failed'),
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to fetch user profiles.',
    });
  });
});

test('auth user listing failures return a server error response', async () => {
  const supabaseClient = createSupabaseClient({
    usersError: new Error('user listing failed'),
  });

  await withTestServer({ supabaseClient }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/user-profiles`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Unable to fetch user emails.',
    });
  });
});
