import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** All backend modules and locked dependencies, excluding comments and the generated stamp. */
export function backendDigest(files) {
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/releaseStamp.ts')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  // CRLF → LF first: a Windows checkout (autocrlf) and `git show` must hash
  // alike, and a line terminator inside a template literal is LF at runtime
  // either way. A no-op on the LF files CI checks out.
  const normalized = entries.map(([name, raw]) => { const text = raw.replace(/\r\n/g, '\n'); return [name, name.endsWith('.ts')
    ? ts.transpileModule(text, { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    : name.endsWith('.json') ? JSON.stringify(JSON.parse(text))
      : text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).sort().join('\n')]; });
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 40);
}

/** Tracked backend inputs outside functions/src. */
export const BACKEND_FILES = ['functions/package.json', 'functions/package-lock.json', 'functions/tsconfig.json', 'functions/.env', 'functions/.env.vscn-39508', 'functions/.env.vscn-dev-f4b60'];

export const BACKEND_SOURCE_DIR = 'functions/src';

/**
 * THE backend file set, and the only definition of it: the stamp (on disk,
 * scripts/stamp-backend.mjs) and the checkers (in git, backendDigestAt) both
 * select through this, so a file one side hashes and the other does not
 * cannot exist. Under functions/src it takes what tsc can carry into lib/ —
 * `.ts`, and `.json` for the day resolveJsonModule is switched on — and
 * leaves out anything else a disk may hold (desktop.ini, a sync client's
 * marker, an editor's swap file), which would otherwise make every hand
 * stamp disagree with git. tests/unit/backendDigest.test.mjs pins the parity.
 */
export function isBackendPath(path) {
  if (BACKEND_FILES.includes(path)) return true;
  return path.startsWith(`${BACKEND_SOURCE_DIR}/`) && /\.(ts|json)$/.test(path);
}

/** The digest of the backend as it sits on disk under `root`: what a deploy from there ships. */
export function backendDigestOnDisk(root = '.') {
  const files = {};
  const scan = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) scan(path);
      else if (isBackendPath(path)) files[path] = readFileSync(join(root, path), 'utf8');
    }
  };
  scan(BACKEND_SOURCE_DIR);
  // Read unconditionally: a missing lockfile or .env is a broken tree, and
  // the stamp should say so rather than hash around it.
  for (const path of BACKEND_FILES) files[path] = readFileSync(join(root, path), 'utf8');
  return backendDigest(files);
}

/** The digest of the backend exactly as committed at `rev`, read through `git(...args)`. */
export function backendDigestAt(git, rev) {
  const paths = git('ls-tree', '-r', '--name-only', rev, '--', BACKEND_SOURCE_DIR, ...BACKEND_FILES).split('\n').filter(Boolean).filter(isBackendPath);
  return backendDigest(Object.fromEntries(paths.map((path) => [path, git('show', `${rev}:${path}`)])));
}
