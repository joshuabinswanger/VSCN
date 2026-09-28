import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backendDigest } from '../../scripts/lib/backend-digest.mjs';
test('backend identity ignores comments but covers transitive helpers and dependencies', () => {
  const base = { 'functions/src/index.ts': 'export { foo } from "./foo";', 'functions/src/foo.ts': 'export const foo = 1;', 'functions/package-lock.json': '{"version":1}' };
  assert.equal(backendDigest(base), backendDigest({ ...base, 'functions/src/foo.ts': '// new comment\nexport const foo = 1;' }));
  assert.notEqual(backendDigest(base), backendDigest({ ...base, 'functions/src/foo.ts': 'export const foo = 2;' }));
  assert.notEqual(backendDigest(base), backendDigest({ ...base, 'functions/package-lock.json': '{"version":2}' }));
  assert.equal(backendDigest(base), backendDigest({ ...base, 'functions/src/releaseStamp.ts': 'ignored stamp' }));
  assert.notEqual(backendDigest({ ...base, 'functions/.env': 'GITHUB_REF=dev' }), backendDigest({ ...base, 'functions/.env': 'GITHUB_REF=main' }));
});
