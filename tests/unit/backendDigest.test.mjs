import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BACKEND_FILES, backendDigest, backendDigestAt, isBackendPath } from '../../scripts/lib/backend-digest.mjs';

test('backend identity ignores comments but covers transitive helpers and dependencies', () => {
  const base = { 'functions/src/index.ts': 'export { foo } from "./foo";', 'functions/src/foo.ts': 'export const foo = 1;', 'functions/package-lock.json': '{"version":1}' };
  assert.equal(backendDigest(base), backendDigest({ ...base, 'functions/src/foo.ts': '// new comment\nexport const foo = 1;' }));
  assert.notEqual(backendDigest(base), backendDigest({ ...base, 'functions/src/foo.ts': 'export const foo = 2;' }));
  assert.notEqual(backendDigest(base), backendDigest({ ...base, 'functions/package-lock.json': '{"version":2}' }));
  assert.equal(backendDigest(base), backendDigest({ ...base, 'functions/src/releaseStamp.ts': 'ignored stamp' }));
  assert.notEqual(backendDigest({ ...base, 'functions/.env': 'GITHUB_REF=dev' }), backendDigest({ ...base, 'functions/.env': 'GITHUB_REF=main' }));
});

test('a Windows checkout and git hash a multi-line template alike', () => {
  const lf = { 'functions/src/x.ts': 'export const a = `one\ntwo`;\n' };
  assert.equal(backendDigest(lf), backendDigest({ 'functions/src/x.ts': 'export const a = `one\r\ntwo`;\r\n' }));
});

test('the locked inputs outside functions/src are part of the file set', () => {
  // Emptying BACKEND_FILES would hash code without its dependencies; both
  // sides would still agree, which is why parity alone cannot catch it.
  for (const path of ['functions/package.json', 'functions/package-lock.json', 'functions/tsconfig.json', 'functions/.env']) {
    assert.ok(BACKEND_FILES.includes(path), `${path} must be hashed`);
  }
  assert.equal(isBackendPath('functions/src/data.json'), true);
  assert.equal(isBackendPath('functions/src/nested/helper.ts'), true);
  assert.equal(isBackendPath('functions/src/desktop.ini'), false);
  assert.equal(isBackendPath('functions/lib/index.js'), false);
});

// THE PARITY PROPERTY (review T2-10): the digest the deploy stamps and the
// digest the checkers expect must come from the same files, or a committed
// file one side skips turns every member-rebuild dispatch into a production
// Functions deploy and verify-release into a permanent ARTIFACT MISMATCH.
// This runs the REAL stamp script against a throwaway repository and compares
// its output with backendDigestAt(HEAD), the checkers' side.
test('stamp-backend.mjs stamps exactly the digest the checkers read back from git', (t) => {
  const repo = resolve('.');
  const root = mkdtempSync(join(tmpdir(), 'vscn-stamp-'));
  const link = join(root, 'node_modules');
  t.after(() => {
    // Drop the link to the real node_modules FIRST, so the recursive delete
    // below can never walk into it.
    try { unlinkSync(link); } catch { try { rmdirSync(link); } catch { /* never created */ } }
    rmSync(root, { recursive: true, force: true });
  });
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  cpSync(join(repo, 'scripts/stamp-backend.mjs'), join(root, 'scripts/stamp-backend.mjs'));
  cpSync(join(repo, 'scripts/lib/backend-digest.mjs'), join(root, 'scripts/lib/backend-digest.mjs'));
  symlinkSync(join(repo, 'node_modules'), link, 'junction');
  const write = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  write('functions/src/index.ts', 'export { a } from "./a";\n');
  write('functions/src/a.ts', 'export const a = 1;\n');
  write('functions/src/nested/b.ts', 'export const b = 2;\n');
  write('functions/src/data.json', '{"limit": 3}\n');
  write('functions/src/releaseStamp.ts', "export const backendLabels = { source_digest: 'none' };\n");
  write('functions/package.json', '{"name":"fixture"}\n');
  write('functions/package-lock.json', '{"lockfileVersion":3}\n');
  write('functions/tsconfig.json', '{"compilerOptions":{}}\n');
  write('functions/.env', 'A=1\n');
  write('functions/.env.vscn-39508', 'B=2\n');
  write('functions/.env.vscn-dev-f4b60', 'B=3\n');
  write('.gitignore', 'node_modules\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-m', 'fixture');
  const stamp = () => {
    execFileSync(process.execPath, [join(root, 'scripts/stamp-backend.mjs')], { cwd: root, encoding: 'utf8' });
    return readFileSync(join(root, 'functions/src/releaseStamp.ts'), 'utf8').match(/source_digest: '([0-9a-f]+)'/)[1];
  };
  let stamped = stamp();
  assert.equal(stamped, backendDigestAt(git, 'HEAD'));

  // And both sides MOVE with every kind of input, so agreement is not two
  // halves ignoring the same thing.
  for (const [path, text] of [['functions/src/data.json', '{"limit": 4}\n'], ['functions/package-lock.json', '{"lockfileVersion":2}\n'], ['functions/src/nested/b.ts', 'export const b = 3;\n']]) {
    write(path, text);
    git('-c', 'user.name=t', '-c', 'user.email=t@example.test', 'commit', '-q', '-am', path);
    const next = stamp();
    assert.notEqual(next, stamped, `${path} must change the stamp`);
    assert.equal(next, backendDigestAt(git, 'HEAD'), `${path}: stamp and checker disagree`);
    stamped = next;
  }
});
