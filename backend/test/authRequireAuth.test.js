import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseModuleMock;

process.env.SUPABASE_URL = 'https://auth-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'auth-test-placeholder';

const state = {
  authResult: {
    data: { user: { id: 'user-1', email: 'user@example.com' } },
    error: null,
  },
  profileResult: {
    data: { id: 'user-1', role: 'client', business_id: 'business-1' },
    error: null,
  },
  authError: null,
  profileError: null,
  calls: [],
};

function resetState() {
  state.authResult = {
    data: { user: { id: 'user-1', email: 'user@example.com' } },
    error: null,
  };
  state.profileResult = {
    data: { id: 'user-1', role: 'client', business_id: 'business-1' },
    error: null,
  };
  state.authError = null;
  state.profileError = null;
  state.calls = [];
}

const fakeSupabaseClient = {
  auth: {
    async getUser(token) {
      state.calls.push(['getUser', token]);
      if (state.authError) throw state.authError;
      return state.authResult;
    },
  },

  from(table) {
    assert.equal(table, 'profiles');
    const query = {
      select(columns) {
        state.calls.push(['select', columns]);
        return query;
      },
      eq(column, value) {
        state.calls.push(['eq', column, value]);
        return query;
      },
      async single() {
        state.calls.push(['single']);
        if (state.profileError) throw state.profileError;
        return state.profileResult;
      },
    };

    return query;
  },
};

after(() => {
  supabaseModuleMock?.restore();

  if (originalSupabaseUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
});

supabaseModuleMock = mock.module('@supabase/supabase-js', {
  exports: {
    createClient() {
      return fakeSupabaseClient;
    },
  },
});

const { requireAuth } = await import('../src/middleware/auth.js');

function createResponse() {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };

  return response;
}

function createRequest(authorization) {
  return {
    headers: authorization === undefined ? {} : { authorization },
  };
}

async function invoke(authorization) {
  const request = createRequest(authorization);
  const response = createResponse();
  let nextCalled = false;

  await requireAuth(request, response, () => {
    nextCalled = true;
  });

  return { request, response, nextCalled };
}

beforeEach(() => {
  resetState();
});

test('rejects a request without an authorization header', { concurrency: false }, async () => {
  const { response, nextCalled } = await invoke();

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
  assert.equal(nextCalled, false);
  assert.deepEqual(state.calls, []);
});

test('rejects an empty bearer token', { concurrency: false }, async () => {
  const { response, nextCalled } = await invoke('Bearer ');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
  assert.equal(nextCalled, false);
  assert.deepEqual(state.calls, []);
});

test('rejects an unsupported authorization scheme', { concurrency: false }, async () => {
  const { response, nextCalled } = await invoke('Basic credentials');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
  assert.equal(nextCalled, false);
  assert.deepEqual(state.calls, []);
});

test('rejects a Supabase authentication error', { concurrency: false }, async () => {
  state.authResult = {
    data: null,
    error: { message: 'invalid token' },
  };

  const { response, nextCalled } = await invoke('Bearer invalid-token');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Invalid or expired authentication token.' });
  assert.equal(nextCalled, false);
  assert.deepEqual(state.calls, [['getUser', 'invalid-token']]);
});

test('rejects when Supabase returns no user', { concurrency: false }, async () => {
  state.authResult = {
    data: { user: null },
    error: null,
  };

  const { response, nextCalled } = await invoke('Bearer no-user-token');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Invalid or expired authentication token.' });
  assert.equal(nextCalled, false);
  assert.deepEqual(state.calls, [['getUser', 'no-user-token']]);
});

test('authenticates a valid user and attaches the selected profile fields', { concurrency: false }, async () => {
  const expectedUser = { id: 'user-7', email: 'user7@example.com', user_metadata: { name: 'User Seven' } };
  const expectedProfile = { id: 'user-7', role: 'client', business_id: 'business-7' };
  state.authResult = { data: { user: expectedUser }, error: null };
  state.profileResult = { data: expectedProfile, error: null };

  const { request, response, nextCalled } = await invoke('Bearer valid-token');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, null);
  assert.equal(nextCalled, true);
  assert.deepEqual(request.user, expectedUser);
  assert.deepEqual(request.profile, expectedProfile);
  assert.deepEqual(state.calls, [
    ['getUser', 'valid-token'],
    ['select', 'id, role, business_id'],
    ['eq', 'id', 'user-7'],
    ['single'],
  ]);
});

test('rejects a valid Auth user whose profile does not exist', { concurrency: false }, async () => {
  state.profileResult = {
    data: null,
    error: { code: 'PGRST116', message: 'No profile found' },
  };

  const { request, response, nextCalled } = await invoke('Bearer valid-without-profile');

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'User profile not found.' });
  assert.equal(nextCalled, false);
  assert.equal(request.user, undefined);
  assert.equal(request.profile, undefined);
  assert.deepEqual(state.calls, [
    ['getUser', 'valid-without-profile'],
    ['select', 'id, role, business_id'],
    ['eq', 'id', 'user-1'],
    ['single'],
  ]);
});

test('rejects a profile query error as a missing profile', { concurrency: false }, async () => {
  state.profileResult = {
    data: null,
    error: { code: '42501', message: 'profile lookup failed' },
  };

  const { response, nextCalled } = await invoke('Bearer profile-error-token');

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'User profile not found.' });
  assert.equal(nextCalled, false);
});

test('returns a generic authentication error when Auth throws', { concurrency: false }, async () => {
  state.authError = new Error('Auth service unavailable');

  const { response, nextCalled } = await invoke('Bearer auth-exception-token');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Unable to authenticate request.' });
  assert.equal(nextCalled, false);
});

test('returns a generic authentication error when the profile lookup throws', { concurrency: false }, async () => {
  state.profileError = new Error('Profile service unavailable');

  const { response, nextCalled } = await invoke('Bearer profile-exception-token');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Unable to authenticate request.' });
  assert.equal(nextCalled, false);
});

test('does not execute a protected downstream handler after authentication fails', { concurrency: false }, async () => {
  let protectedHandlerCalled = false;
  const request = createRequest();
  const response = createResponse();

  await requireAuth(request, response, () => {
    protectedHandlerCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
  assert.equal(protectedHandlerCalled, false);
});
