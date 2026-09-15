import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Execute a real TS module with explicit I/O replacements; no source regex mocks. */
export function loadTs(path, imports, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const bindings = {
    exports,
    require(name) {
      if (!(name in imports)) throw new Error(`Missing test import ${name}`);
      return imports[name];
    }, ...globals,
  };
  // Keep native object prototypes so real Firebase validators can consume writes.
  vm.compileFunction(output, Object.keys(bindings), { filename: path })(...Object.values(bindings));
  return exports;
}
