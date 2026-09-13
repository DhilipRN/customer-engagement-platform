import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/app.js';

test('GET /health returns API status', async () => {
  const app = createApp();
  const server = app.listen();
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
