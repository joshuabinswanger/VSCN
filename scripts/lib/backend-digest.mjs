import { createHash } from 'node:crypto';
import ts from 'typescript';

/** All backend modules and locked dependencies, excluding comments and the generated stamp. */
export function backendDigest(files) {
  const entries = Object.entries(files).filter(([name]) => !name.endsWith('/releaseStamp.ts')).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const normalized = entries.map(([name, text]) => [name, name.endsWith('.ts')
    ? ts.transpileModule(text, { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    : name.endsWith('.json') ? JSON.stringify(JSON.parse(text))
      : text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).sort().join('\n')]);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 40);
}
