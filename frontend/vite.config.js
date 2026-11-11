import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const REQUIRED_TEST_VARIABLES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

function hasNonEmptyAssignment(contents, variableName) {
  return contents.split(/\r?\n/).some((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] !== variableName) return false;

    const value = match[2];
    if (!value || value.startsWith('#')) return false;

    const quotedValue = value.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
    return quotedValue ? quotedValue[2].length > 0 : true;
  });
}

function validateTestEnvironment(mode) {
  if (mode !== 'test') return;

  const testEnvPath = path.resolve(process.cwd(), '.env.test');
  if (!fs.existsSync(testEnvPath)) {
    throw new Error('frontend/.env.test is required for Vite test mode.');
  }

  const testEnvContents = fs.readFileSync(testEnvPath, 'utf8');
  for (const variableName of REQUIRED_TEST_VARIABLES) {
    if (process.env[variableName] !== undefined) {
      throw new Error(
        `${variableName} must not be inherited from the shell in Vite test mode.`,
      );
    }

    if (!hasNonEmptyAssignment(testEnvContents, variableName)) {
      throw new Error(
        `${variableName} must be non-empty in frontend/.env.test.`,
      );
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  validateTestEnvironment(mode);

  return {
    plugins: [react()],
  };
});
