// Every callable enforces App Check (review T2-18). The emulator suites call
// `.run()`, which skips the SDK's token checks, so stripping
// `enforceAppCheck: true` from every callable leaves them all green; this is
// the only guard that reads the flag. Source-level on purpose: it is the
// deploy option that matters, and it is written in the source.
//
// An opt-out must be deliberate: write `enforceAppCheck: false` and add the
// export to ALLOWED_WITHOUT_APP_CHECK with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

const ALLOWED_WITHOUT_APP_CHECK = new Map([
  // none today
]);

function callables() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".ts")) {
        const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2022, true);
        const visit = (node) => {
          // onCall(...) and any namespaced form (https.onCall, functionsV1.https.onCall).
          const callee = ts.isCallExpression(node) ? node.expression : null;
          const name = callee && (ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "");
          if (name === "onCall") {
            let owner = node.parent;
            while (owner && !ts.isVariableDeclaration(owner)) owner = owner.parent;
            const options = node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0]) ? node.arguments[0] : null;
            const flag = options?.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(file) === "enforceAppCheck");
            found.push({
              path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
              name: owner && ts.isIdentifier(owner.name) ? owner.name.text : "(anonymous)",
              enforce: flag ? flag.initializer.getText(file) : null,
            });
          }
          ts.forEachChild(node, visit);
        };
        visit(file);
      }
    }
  };
  walk("functions/src");
  return found;
}

test("every onCall in functions/src sets enforceAppCheck: true", () => {
  const all = callables();
  // A floor, so a parser that finds nothing cannot pass: 22 callables on 2026-09-30.
  assert.ok(all.length >= 20, `found only ${all.length} callables; has the parser stopped seeing them?`);
  const offenders = all.filter((c) => c.enforce !== "true" && !ALLOWED_WITHOUT_APP_CHECK.has(c.name));
  assert.deepEqual(offenders.map((c) => `${c.path}:${c.line} ${c.name} (enforceAppCheck: ${c.enforce ?? "absent"})`), []);
});
