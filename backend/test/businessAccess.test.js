import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessAccessMiddleware } from '../src/middleware/auth.js';

const BUSINESS_ID = 'business-1';

function createResponse() {
  const response = {
    statusCode: null,
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

function createRequest({ role = 'client', businessId = BUSINESS_ID } = {}) {
  return {
    user: { id: 'user-1' },
    profile: { id: 'user-1', role, business_id: businessId },
    query: { business_id: BUSINESS_ID },
    body: {},
  };
}

function createMiddleware(result) {
  return createBusinessAccessMiddleware({
    permissionService: {
      async getBusinessAuthorization() {
        return result;
      },
    },
  });
}

test('membership-based receptionist access requires and stores matching authorization', async () => {
  const request = createRequest();
  const response = createResponse();
  let nextCalled = false;
  const middleware = createMiddleware({
    data: {
      authorized: true,
      source: 'membership',
      role: 'receptionist',
      permissions: { view_chats: true },
    },
    error: null,
  });

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, null);
  assert.equal(request.businessAuthorization.source, 'membership');
});

test('membership-based receptionist access does not fall back to profile business assignment', async () => {
  const request = createRequest({ businessId: BUSINESS_ID });
  const response = createResponse();
  let nextCalled = false;
  const middleware = createMiddleware({
    data: {
      authorized: false,
      reason: 'business_membership_required',
    },
    error: null,
  });

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: 'You do not have access to this business.',
  });
});

test('unknown roles are denied by business access middleware', async () => {
  const request = createRequest({ role: 'unknown' });
  const response = createResponse();
  let nextCalled = false;
  const middleware = createMiddleware({
    data: { authorized: false, reason: 'unsupported_role' },
    error: null,
  });

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
});

test('authorization lookup failures fail closed with a server error', async () => {
  const request = createRequest();
  const response = createResponse();
  let nextCalled = false;
  const middleware = createMiddleware({
    data: { authorized: false },
    error: { code: '42501', message: 'permission denied' },
  });

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: 'Unable to verify business access.',
  });
});

test('missing authentication context is rejected', async () => {
  const request = {
    profile: { role: 'unknown', business_id: BUSINESS_ID },
    query: { business_id: BUSINESS_ID },
    body: {},
  };
  const response = createResponse();
  let nextCalled = false;
  const middleware = createMiddleware({
    data: { authorized: true },
    error: null,
  });

  await middleware(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: 'Authentication context is required for business access.',
  });
});
