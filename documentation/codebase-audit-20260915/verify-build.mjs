// Local verification only: no database writes/deployments. Requires configured .env.
import { loadEnvFile } from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

loadEnvFile('.env');
const evidence = 'documentation/codebase-audit-20260915/';
const run = (args, env, log) => {
  const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 120000 });
  writeFileSync(evidence + log, (result.stdout ?? '') + (result.stderr ?? ''));
  return result;
};
const failure = run(['node_modules/astro/bin/astro.mjs', 'build'], {
  ...process.env, FIREBASE_SERVICE_ACCOUNT: 'invalid-json', MEMBER_DIRECTORY_SNAPSHOT: '',
}, 'remediation-build-failure.txt');
assert.notEqual(failure.status, 0, 'Invalid credentials must stop deployment');
assert.match((failure.stdout ?? '') + (failure.stderr ?? ''), /refusing to build an incomplete directory/);
const temporary = mkdtempSync(join(tmpdir(), 'vscn-audit-'));
try {
  const snapshot = join(temporary, 'directory.json');
  const exported = run(['scripts/export-directory.mjs'], {
    ...process.env, MEMBER_DIRECTORY_SNAPSHOT: snapshot,
  }, 'remediation-export.txt');
  assert.equal(exported.status, 0, exported.stderr);
  const rendered = run(['node_modules/astro/bin/astro.mjs', 'build'], {
    ...process.env, MEMBER_DIRECTORY_SNAPSHOT: snapshot, FIREBASE_SERVICE_ACCOUNT: '',
  }, 'remediation-build.txt');
  assert.equal(rendered.status, 0, rendered.stderr);
  console.log('Verified: failed data blocks builds; exported snapshot renders without credential environment variable.');
} finally {
  // mkdtemp creates this dedicated child of the system temp directory.
  const snapshot = join(temporary, 'directory.json');
  if (existsSync(snapshot)) unlinkSync(snapshot);
  rmdirSync(temporary);
}
