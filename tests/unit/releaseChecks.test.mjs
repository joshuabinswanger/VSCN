// The release verification protocol's PURE half. Everything here is a
// decision the script makes about data it has already fetched; the fetching
// itself (git, the Google REST APIs) lives in scripts/verify-release.mjs and
// is exercised only by running it against a real project.
//
// The property that matters most is in the pairing tests: the verdict MUST go
// red for prod's 2026-09-14 → 2026-09-22 state (dozens of authorize, zero
// complete). A protocol that stays green against a known-broken site is
// decoration, and the design says to rewrite it rather than ship it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFunctionExports,
  parseSecretNames,
  normaliseRules,
  compareRules,
  functionsDrift,
  iamDiff,
  countRequests,
  pairingVerdict,
  summariseErrors,
  strandedVerdict,
  buildStampVerdict,
  exitCodeFor,
  resolveProjectAlias,
} from "../../scripts/lib/release-checks.mjs";

test("parseFunctionExports: one export per line, multi-line braces, module per name", () => {
  const source = `// comment
export { requestRebuild } from "./rebuild";
export { flushMemberRebuilds, onImageWritten } from "./rebuildQueue";
export {
  adminDeleteImage,
  adminLookupMember,
} from "./adminOps";

export { acknowledgeSitePublication } from "./publication";
`;
  assert.deepEqual(parseFunctionExports(source), [
    { name: "requestRebuild", module: "functions/src/rebuild.ts" },
    { name: "flushMemberRebuilds", module: "functions/src/rebuildQueue.ts" },
    { name: "onImageWritten", module: "functions/src/rebuildQueue.ts" },
    { name: "adminDeleteImage", module: "functions/src/adminOps.ts" },
    { name: "adminLookupMember", module: "functions/src/adminOps.ts" },
    { name: "acknowledgeSitePublication", module: "functions/src/publication.ts" },
  ]);
});

test("parseSecretNames: derived from source, unique, sorted", () => {
  const sources = [
    'export const a = defineSecret("TURNSTILE_SECRET_KEY");',
    'const b = defineSecret("BREVO_API_KEY"); const c = defineSecret("ADMIN_NOTIFY_TO");',
    'defineSecret("BREVO_API_KEY")',
  ];
  assert.deepEqual(parseSecretNames(sources), ["ADMIN_NOTIFY_TO", "BREVO_API_KEY", "TURNSTILE_SECRET_KEY"]);
});

test("normaliseRules: CRLF, trailing whitespace and trailing blank lines do not count as drift", () => {
  const a = "rules_version = '2';\r\nservice cloud.firestore {  \r\n}\r\n\r\n";
  const b = "rules_version = '2';\nservice cloud.firestore {\n}\n";
  assert.equal(normaliseRules(a), normaliseRules(b));
  assert.deepEqual(compareRules(a, b), { equal: true });
});

test("compareRules: a real difference names the first differing line", () => {
  const live = "line one\nline two\nline three\n";
  const repo = "line one\nline TWO\nline three\n";
  assert.deepEqual(compareRules(live, repo), { equal: false, line: 2, live: "line two", repo: "line TWO" });
});

test("functionsDrift: missing, stale and extra deployments are all reported", () => {
  const exports = [
    { name: "authorizeImageUpload", module: "functions/src/uploads.ts" },
    { name: "onAuthUserCreated", module: "functions/src/authTriggers.ts" },
    { name: "adminRateImage", module: "functions/src/adminOps.ts" },
  ];
  const deployed = [
    { name: "authorizeImageUpload", updateTime: "2026-09-15T15:26:41Z" },
    { name: "onAuthUserCreated", updateTime: "2026-09-15T15:26:23Z" },
    { name: "legacyThing", updateTime: "2026-08-01T00:00:00Z" },
  ];
  const lastCommit = {
    "functions/src/uploads.ts": "2026-09-12T10:00:00+02:00",
    "functions/src/authTriggers.ts": "2026-09-22T13:16:30+02:00",
    "functions/src/adminOps.ts": "2026-09-22T12:00:00+02:00",
  };
  const drift = functionsDrift(exports, deployed, lastCommit);
  assert.deepEqual(drift.missing, ["adminRateImage"]);
  assert.deepEqual(drift.stale, [
    { name: "onAuthUserCreated", deployed: "2026-09-15T15:26:23Z", source: "2026-09-22T13:16:30+02:00" },
  ]);
  assert.deepEqual(drift.extra, ["legacyThing"]);
  assert.deepEqual(drift.current, ["authorizeImageUpload"]);
});

test("iamDiff: a grant is checked in the policy its scope names, and a forbidden grant is a finding too", () => {
  const expected = [
    { scope: "project", member: "serviceAccount:storage@x", role: "roles/firebaserules.firestoreServiceAgent", why: "storage.rules firestore.get()" },
    { scope: "serviceAccount", resource: "compute@x", member: "serviceAccount:compute@x", role: "roles/iam.serviceAccountTokenCreator", why: "App Check signBlob" },
    { scope: "runService", resource: "acknowledgesitepublication", member: "serviceAccount:deployer@x", role: "roles/run.invoker", why: "publication ack" },
    { scope: "project", member: "serviceAccount:deployer@x", role: "roles/run.invoker", forbidden: true, why: "invoker is per-service, never project-wide" },
    { scope: "project", member: "serviceAccount:reader@x", role: "roles/datastore.viewer", why: "export reads prod" },
  ];
  const policies = {
    project: { bindings: [
      { role: "roles/firebaserules.firestoreServiceAgent", members: ["serviceAccount:storage@x"] },
      { role: "roles/run.invoker", members: ["serviceAccount:deployer@x"] },
    ] },
    serviceAccount: { "compute@x": { bindings: [{ role: "roles/iam.serviceAccountTokenCreator", members: ["serviceAccount:compute@x"] }] } },
    runService: { acknowledgesitepublication: { bindings: [] } },
  };
  const diff = iamDiff(expected, policies);
  assert.deepEqual(diff.missing.map((g) => g.role), ["roles/run.invoker", "roles/datastore.viewer"]);
  assert.deepEqual(diff.present.map((g) => g.role), ["roles/firebaserules.firestoreServiceAgent", "roles/iam.serviceAccountTokenCreator"]);
  assert.deepEqual(diff.forbidden.map((g) => g.role), ["roles/run.invoker"]);
});

test("iamDiff: a conditional binding does not satisfy an unconditional expectation", () => {
  const expected = [{ scope: "project", member: "serviceAccount:a@x", role: "roles/x", why: "" }];
  const policies = { project: { bindings: [{ role: "roles/x", members: ["serviceAccount:a@x"], condition: { expression: "true" } }] } };
  assert.equal(iamDiff(expected, policies).missing.length, 1);
});

test("countRequests: preflights are not invocations and a 401 is not a success", () => {
  const entries = [
    { httpRequest: { requestMethod: "OPTIONS", status: 204 } },
    { httpRequest: { requestMethod: "POST", status: 200 } },
    { httpRequest: { requestMethod: "POST", status: 401 } },
    { httpRequest: { requestMethod: "POST", status: 200 } },
    { jsonPayload: { message: "not a request entry" } },
  ];
  assert.deepEqual(countRequests(entries), { total: 3, ok: 2 });
});

test("pairingVerdict: prod's 2026-09-14 → 2026-09-22 state is RED", () => {
  assert.equal(pairingVerdict({ authorize: 32, complete: 0 }).status, "FAIL");
  assert.equal(pairingVerdict({ authorize: 3, complete: 0 }).status, "FAIL");
});

test("pairingVerdict: partial failure warns, quiet weeks and abandoned uploads pass", () => {
  assert.equal(pairingVerdict({ authorize: 10, complete: 4 }).status, "WARN");
  assert.equal(pairingVerdict({ authorize: 10, complete: 5 }).status, "PASS");
  assert.equal(pairingVerdict({ authorize: 2, complete: 0 }).status, "PASS");
  assert.equal(pairingVerdict({ authorize: 0, complete: 0 }).status, "PASS");
  assert.equal(pairingVerdict({ authorize: 6, complete: 1 }).status, "PASS");
});

test("summariseErrors: counts entries and ranks the three most frequent messages", () => {
  const entries = [
    { textPayload: "boom", resource: { labels: { service_name: "a" } } },
    { jsonPayload: { message: "boom" }, resource: { labels: { service_name: "a" } } },
    { protoPayload: { status: { message: "denied" } }, resource: { labels: { service_name: "b" } } },
    { httpRequest: { status: 500 }, resource: { labels: { service_name: "c" } } },
    { textPayload: "boom", resource: { labels: { service_name: "a" } } },
    { textPayload: "other", resource: { labels: { service_name: "d" } } },
  ];
  const summary = summariseErrors(entries);
  assert.equal(summary.count, 6);
  assert.equal(summary.top.length, 3);
  assert.deepEqual(summary.top[0], { message: "boom", n: 3, services: ["a"] });
  assert.equal(summariseErrors([]).count, 0);
});

test("strandedVerdict: residue the sweep should have removed fails; a pile it has not reached yet warns", () => {
  assert.equal(strandedVerdict({ recent: 0, overdue: 0 }).status, "PASS");
  assert.equal(strandedVerdict({ recent: 3, overdue: 0 }).status, "PASS");
  // Prod at 15:00Z on 2026-09-22: 23 permits + 23 records from that morning's
  // retries, none older than the sweep horizon. Uploads failing, sweep fine.
  assert.equal(strandedVerdict({ recent: 46, overdue: 0 }).status, "WARN");
  assert.equal(strandedVerdict({ recent: 0, overdue: 1 }).status, "FAIL");
});

test("buildStampVerdict: the live stamp must equal the released commit's short SHA", () => {
  const html = '<head><meta name="build-commit" content="1e033a7" /><meta name="build-time" content="2026-09-22T14:23:37.862Z" /></head>';
  assert.deepEqual(buildStampVerdict(html, "1e033a7f00d"), { status: "PASS", live: "1e033a7", buildTime: "2026-09-22T14:23:37.862Z" });
  assert.equal(buildStampVerdict(html, "df97e2d").status, "FAIL");
  assert.equal(buildStampVerdict("<html>no stamp</html>", "1e033a7").status, "FAIL");
  assert.equal(buildStampVerdict('<meta name="build-commit" content="1e033a7-dirty">', "1e033a7").status, "FAIL");
});

test("exitCodeFor: a probe that did not run is not a pass; a warning is", () => {
  assert.equal(exitCodeFor([{ status: "PASS" }, { status: "WARN" }]), 0);
  assert.equal(exitCodeFor([{ status: "PASS" }, { status: "SKIP" }]), 1);
  assert.equal(exitCodeFor([{ status: "FAIL" }]), 1);
});

test("resolveProjectAlias: only the two aliases; a raw project id is refused", () => {
  const rc = { projects: { default: "vscn-39508", dev: "vscn-dev-f4b60" } };
  assert.equal(resolveProjectAlias("prod", rc), "vscn-39508");
  assert.equal(resolveProjectAlias("dev", rc), "vscn-dev-f4b60");
  assert.throws(() => resolveProjectAlias("vscn-39508", rc), /prod or dev/);
  assert.throws(() => resolveProjectAlias(undefined, rc), /prod or dev/);
});
