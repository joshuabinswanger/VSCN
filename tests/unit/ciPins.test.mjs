// CI runs third-party code with the deploy identities (review T2-30): the
// Functions deployer holds cloudfunctions.admin, run.admin and four secrets'
// admin. What runs there is therefore pinned, and bumped by a reviewed PR
// (Dependabot's, for the actions), never picked up from a moving tag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const workflows = readdirSync(".github/workflows").filter((f) => /\.ya?ml$/.test(f))
  .map((f) => [`.github/workflows/${f}`, readFileSync(`.github/workflows/${f}`, "utf8")]);
const pkg = readFileSync("package.json", "utf8");

test("every third-party action is pinned to a full commit SHA with its version beside it", () => {
  const loose = [];
  for (const [path, text] of workflows) {
    for (const [, ref, comment] of text.matchAll(/uses:\s*([^\s#]+)[ \t]*(#[^\r\n]*)?/g)) {
      if (ref.startsWith("./")) continue;
      if (!/@[0-9a-f]{40}$/.test(ref) || !/#\s*v\d/.test(comment ?? "")) loose.push(`${path}: ${ref} ${comment ?? ""}`.trim());
    }
  }
  assert.deepEqual(loose, []);
});

test("firebase-tools is one exact version everywhere it runs, never @latest", () => {
  const sources = [...workflows, ["package.json", pkg]];
  const versions = new Set();
  for (const [path, text] of sources) {
    for (const [, version] of text.matchAll(/firebase-tools@([^\s"'\\]+)/g)) {
      assert.match(version, /^\d+\.\d+\.\d+$/, `${path} runs firebase-tools@${version}`);
      versions.add(version);
    }
  }
  assert.equal(versions.size, 1, `firebase-tools versions differ: ${[...versions].join(", ")}`);
});

test("the test globs are quoted, so sh cannot shrink the suite", () => {
  // Unquoted, POSIX sh expands `**` as `*`: once any test sits in a subfolder,
  // `tests/unit/**/*.test.mjs` matches ONLY that folder and CI runs one file, green.
  const scripts = JSON.parse(pkg).scripts;
  assert.match(scripts["test:unit"], /"tests\/unit\/\*\*\/\*\.test\.mjs"/);
  assert.match(scripts["test:rules"], /\\?"tests\/rules\/\*\*\/\*\.test\.mjs\\?"/);
  assert.doesNotMatch(scripts["test:rules"], /[^"\\]tests\/rules\/\*\*/);
});
