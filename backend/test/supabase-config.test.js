import assert from 'node:assert/strict';
import test from 'node:test';
import { getSupabaseConfig } from '../src/config/env.js';

function withEnvironment(values, callback) {
  const originalValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  Object.assign(process.env, values);

  try {
    callback();
  } finally {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('Supabase configuration requires server-only environment variables', () => {
  withEnvironment(
    {
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    () => {
      assert.throws(getSupabaseConfig, /SUPABASE_URL must be set/);
    },
  );
});

test('Supabase configuration returns valid server settings', () => {
  withEnvironment(
    {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
    },
    () => {
      assert.deepEqual(getSupabaseConfig(), {
        url: 'https://example.supabase.co',
        serviceRoleKey: 'server-only-test-key',
      });
    },
  );
});
