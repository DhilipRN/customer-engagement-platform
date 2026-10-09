import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { bypassAuth } from './authTestHelper.js';

const BUSINESS_ID = '96a26c1b-eae8-4cf2-bfe1-beba2827461d';
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
  updateResult,
  updateError = null,
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

        update(values) {
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: updateResult ?? {
                        id: CLIENT_ID,
                        role: 'client',
                        business_id: values.business_id,
                        created_at: '2026-10-04T00:00:00.000Z',
                        updated_at: values.updated_at,
                      },
                      error: updateError,
                    }),
                  };
                },
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
  const supabaseClient = createSupabaseClient({
    businesses: [{ id: BUSINESS_ID }],
    targetProfiles: { [CLIENT_ID]: clientProfile },
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
    updateError: new Error('profile update failed'),
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
