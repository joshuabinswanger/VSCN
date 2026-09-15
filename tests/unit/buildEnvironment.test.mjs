import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireBuildEnvironment } from '../../src/lib/buildEnvironment.ts';
const valid = Object.fromEntries([
  'FIREBASE_SERVICE_ACCOUNT', 'PUBLIC_FIREBASE_PROJECT_ID', 'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN', 'PUBLIC_FIREBASE_STORAGE_BUCKET', 'PUBLIC_FIREBASE_APP_ID',
  'PUBLIC_TURNSTILE_SITE_KEY',
].map(key => [key, 'configured']));
test('build rejects missing credentials and attestation before rendering', () => {
  assert.doesNotThrow(() => requireBuildEnvironment(valid));
  for (const key of Object.keys(valid)) {
    assert.throws(() => requireBuildEnvironment({ ...valid, [key]: '' }), new RegExp(key));
  }
});
