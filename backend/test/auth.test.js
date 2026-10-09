import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  requireAdmin,
  requireBusinessAccess,
} from '../src/middleware/auth.js';

test('requireAdmin allows an admin user', () => {
  let nextCalled = false;

  const request = {
    profile: {
      role: 'admin',
    },
  };

  const response = {
    status() {
      throw new Error('Admin should not receive 403');
    },
  };

  requireAdmin(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('requireAdmin rejects a client user', () => {
  let nextCalled = false;
  let statusCode = null;
  let responseBody = null;

  const request = {
    profile: {
      role: 'client',
    },
  };

  const response = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          responseBody = body;
        },
      };
    },
  };

  requireAdmin(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, {
    error: 'Admin access required.',
  });
});

test('requireBusinessAccess allows an admin user', () => {
  let nextCalled = false;

  const request = {
    profile: {
      role: 'admin',
      business_id: null,
    },
    query: {
      business_id: 'business-2',
    },
    body: {
      business_id: 'business-3',
    },
  };

  const response = {
    status() {
      throw new Error('Admin should not receive 403');
    },
  };

  requireBusinessAccess(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('requireBusinessAccess rejects a client accessing another business', () => {
  let nextCalled = false;
  let statusCode = null;
  let responseBody = null;

  const request = {
    profile: {
      role: 'client',
      business_id: 'business-1',
    },
    query: {
      business_id: 'business-2',
    },
    body: {},
  };

  const response = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          responseBody = body;
        },
      };
    },
  };

  requireBusinessAccess(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, {
    error: 'You do not have access to this business.',
  });
});

test('requireBusinessAccess rejects a client without a business assignment', () => {
  let nextCalled = false;
  let statusCode = null;
  let responseBody = null;

  const request = {
    profile: {
      role: 'client',
      business_id: null,
    },
    query: {},
    body: {},
  };

  const response = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          responseBody = body;
        },
      };
    },
  };

  requireBusinessAccess(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, {
    error: 'A business assignment is required for client access.',
  });
});

test('requireBusinessAccess rejects conflicting query and body business IDs', () => {
  let nextCalled = false;
  let statusCode = null;
  let responseBody = null;

  const request = {
    profile: {
      role: 'client',
      business_id: 'business-1',
    },
    query: {
      business_id: 'business-1',
    },
    body: {
      business_id: 'business-2',
    },
  };

  const response = {
    status(code) {
      statusCode = code;
      return {
        json(body) {
          responseBody = body;
        },
      };
    },
  };

  requireBusinessAccess(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, {
    error: 'Conflicting business identifiers are not allowed.',
  });
});

test('requireBusinessAccess allows matching query and body business IDs', () => {
  let nextCalled = false;

  const request = {
    profile: {
      role: 'client',
      business_id: 'business-1',
    },
    query: {
      business_id: 'business-1',
    },
    body: {
      business_id: 'business-1',
    },
  };

  const response = {
    status() {
      throw new Error('Matching business IDs should be allowed');
    },
  };

  requireBusinessAccess(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test('all business-owned create routes reject conflicting business IDs', async () => {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.profile = { role: 'client', business_id: 'business-1' };
    next();
  });

  const createRoutes = [
    '/customers',
    '/purchases',
    '/message-templates',
    '/campaigns',
    '/messages',
    '/review-automations',
    '/review-automations/selected-requests',
    '/appointments',
  ];

  for (const route of createRoutes) {
    app.post(route, requireBusinessAccess, (request, response) => {
      response.json({ business_id: request.body.business_id });
    });
  }

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const requestOptions = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ business_id: 'business-2' }),
    };

    const conflictingResponses = await Promise.all(
      createRoutes.map((route) =>
        fetch(`${baseUrl}${route}?business_id=business-1`, requestOptions),
      ),
    );
    assert.deepEqual(
      conflictingResponses.map((response) => response.status),
      createRoutes.map(() => 403),
    );

    const matchingResponses = await Promise.all(
      createRoutes.map((route) =>
        fetch(`${baseUrl}${route}?business_id=business-1`, {
          ...requestOptions,
          body: JSON.stringify({ business_id: 'business-1' }),
        }),
      ),
    );
    assert.deepEqual(
      matchingResponses.map((response) => response.status),
      createRoutes.map(() => 200),
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
