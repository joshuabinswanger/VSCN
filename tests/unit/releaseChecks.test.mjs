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
  backendVerdict,
  iamDiff,
  countRequests,
  pairingVerdict,
  summariseErrors,
  strandedVerdict,
  buildStampVerdict,
  exitCodeFor,
  verdictLabel,
  resolveProjectAlias,
  parseSecretConsumers,
  secretBindingVerdict,
} from "../../scripts/lib/release-checks.mjs";
import { readdirSync, readFileSync } from "node:fs";

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

test("iamDiff: a secret-scoped grant is read from that secret's own policy, not the project's", () => {
  const expected = [
    { scope: "secret", resource: "A", member: "serviceAccount:fn@x", role: "roles/secretmanager.admin", why: "bind A" },
    { scope: "secret", resource: "B", member: "serviceAccount:fn@x", role: "roles/secretmanager.admin", why: "bind B" },
  ];
  const policies = {
    project: { bindings: [{ role: "roles/secretmanager.admin", members: ["serviceAccount:fn@x"] }] },
    secret: { A: { bindings: [{ role: "roles/secretmanager.admin", members: ["serviceAccount:fn@x"] }] }, B: {} },
  };
  const diff = iamDiff(expected, policies);
  assert.deepEqual(diff.present.map((g) => g.resource), ["A"]);
  assert.deepEqual(diff.missing.map((g) => g.resource), ["B"]);
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
  assert.equal(pairingVerdict({ authorize: 0, complete: 0 }).status, "WARN");
  assert.equal(pairingVerdict({ authorize: 6, complete: 1 }).status, "PASS");
});

test("pairingVerdict: a window with no completed upload is NOT TESTED, not a pass", () => {
  for (const traffic of [{ authorize: 0, complete: 0 }, { authorize: 2, complete: 0 }, { authorize: 1, complete: 0 }]) {
    const v = pairingVerdict(traffic);
    assert.deepEqual({ status: v.status, untested: v.untested }, { status: "WARN", untested: true }, JSON.stringify(traffic));
    assert.match(v.reason, /^NOT TESTED/);
  }
  assert.equal(pairingVerdict({ authorize: 1, complete: 1 }).untested, undefined);
  assert.equal(pairingVerdict({ authorize: 32, complete: 0 }).untested, undefined);
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

test("verdictLabel: GREEN only when every probe that passed was exercised; NOT TESTED keeps exit 0", () => {
  assert.equal(verdictLabel([{ name: "a", status: "PASS" }, { name: "b", status: "WARN" }]), "GREEN");
  const quiet = [{ name: "build stamp", status: "PASS" }, { name: "upload pairing", status: "WARN", untested: true }];
  assert.equal(verdictLabel(quiet), "GREEN, NOT TESTED: upload pairing");
  assert.equal(exitCodeFor(quiet), 0);
  assert.equal(verdictLabel([...quiet, { name: "rules parity", status: "FAIL" }]), "RED");
});

test("resolveProjectAlias: only the two aliases; a raw project id is refused", () => {
  const rc = { projects: { default: "vscn-39508", dev: "vscn-dev-f4b60" } };
  assert.equal(resolveProjectAlias("prod", rc), "vscn-39508");
  assert.equal(resolveProjectAlias("dev", rc), "vscn-dev-f4b60");
  assert.throws(() => resolveProjectAlias("vscn-39508", rc), /prod or dev/);
  assert.throws(() => resolveProjectAlias(undefined, rc), /prod or dev/);
});

test("backendVerdict: current only when every export carries the expected digest; orphans never force a deploy", () => {
  const exports = [{ name: "a" }, { name: "b" }];
  const stamped = (name, d) => ({ name, labels: { source_digest: d } });
  assert.deepEqual(backendVerdict(exports, [stamped("a", "x"), stamped("b", "x")], "x"), { current: true, mismatched: [], orphans: [] });
  const v = backendVerdict(exports, [stamped("a", "old"), { name: "z", labels: {} }], "x");
  assert.equal(v.current, false);
  assert.deepEqual(v.mismatched, ["a: old", "b: not deployed"]);
  assert.deepEqual(v.orphans, ["z"]);
  assert.deepEqual(backendVerdict(exports, [{ name: "a" }, stamped("b", "x"), stamped("z", "x")], "x"),
    { current: false, mismatched: ["a: unstamped"], orphans: ["z"] });
});

test("backendVerdict: a function the last deploy left FAILED is not current, whatever its label says", () => {
  const exports = [{ name: "a" }, { name: "b" }];
  const fn = (name, state) => ({ name, state, labels: { source_digest: "x" } });
  assert.deepEqual(backendVerdict(exports, [fn("a", "FAILED"), fn("b", "ACTIVE")], "x"), { current: false, mismatched: ["a: FAILED"], orphans: [] });
  assert.equal(backendVerdict(exports, [fn("a", "DEPLOYING"), fn("b", "ACTIVE")], "x").current, false);
  assert.equal(backendVerdict(exports, [fn("a", "ACTIVE"), fn("b", undefined)], "x").current, true);
});

test("iamDiff: a CONDITIONAL forbidden grant is still a forbidden grant", () => {
  // Reproduces review T2-10: an expiring roles/iam.serviceAccountUser on the
  // Functions deployer used to read as absent.
  const expected = [{ scope: "project", member: "serviceAccount:fn@x", role: "roles/iam.serviceAccountUser", forbidden: true, why: "" }];
  const conditional = { project: { bindings: [{ role: "roles/iam.serviceAccountUser", members: ["serviceAccount:fn@x"], condition: { title: "expires 2027", expression: "request.time < timestamp('2027-01-01T00:00:00Z')" } }] } };
  const diff = iamDiff(expected, conditional);
  assert.equal(diff.forbidden.length, 1);
  assert.equal(diff.forbidden[0].condition, "expires 2027");
  assert.equal(iamDiff(expected, { project: { bindings: [{ role: "roles/iam.serviceAccountUser", members: ["serviceAccount:fn@x"] }] } }).forbidden[0].condition, undefined);
  assert.equal(iamDiff(expected, { project: { bindings: [] } }).forbidden.length, 0);
});

test("secretBindingVerdict: a binding older than the newest enabled version is STALE; a disabled one is DISABLED", () => {
  const versions = ["projects/1/secrets/S/versions/1", "projects/1/secrets/S/versions/3"];
  assert.equal(secretBindingVerdict("3", versions).status, "CURRENT");
  assert.deepEqual(secretBindingVerdict("1", versions), { status: "STALE", newest: 3 });
  assert.equal(secretBindingVerdict("2", versions).status, "DISABLED");
  assert.equal(secretBindingVerdict("latest", versions).status, "CURRENT");
  assert.equal(secretBindingVerdict("1", []).status, "DISABLED");
});

test("parseSecretConsumers: every declaration shape the backend uses, handles resolved across modules", () => {
  const sources = {
    "functions/src/rebuild.ts": 'export const githubRebuildToken = defineSecret("GITHUB_REBUILD_TOKEN");',
    "functions/src/mail.ts": 'export const smtpPassword = defineSecret("SMTP"); export const notifyTo = defineSecret("NOTIFY_TO");',
    "functions/src/a.ts": `import { githubRebuildToken } from "./rebuild";
export const callable = onCall({ enforceAppCheck: true, secrets: [githubRebuildToken] }, async (req) => { const secrets = [1]; return { secrets: [] }; });
export const plain = onCall({ enforceAppCheck: true }, async () => ({ secrets: ["NOT_A_BINDING"] }));
export const digest = onSchedule(
  { schedule: "every 10 minutes", secrets: [smtpPassword, notifyTo] },
  async () => {},
);
export const v1 = functionsV1.runWith({ secrets: ["LITERAL"] }).auth.user().onDelete(async () => null);
const internal = onCall({ secrets: [githubRebuildToken] }, async () => {});`,
  };
  assert.deepEqual(parseSecretConsumers(sources), {
    callable: ["GITHUB_REBUILD_TOKEN"],
    digest: ["NOTIFY_TO", "SMTP"],
    v1: ["LITERAL"],
  });
  assert.throws(() => parseSecretConsumers({ "functions/src/x.ts": "export const f = onCall({ secrets: [unknownHandle] }, async () => {});" }), /cannot resolve/);
});

test("parseSecretConsumers over the real backend finds every binding the old hand-kept map listed", () => {
  // The map verify-release carried until 2026-09-30. If the parser stops
  // seeing a declaration shape, probe 5 would silently check fewer bindings;
  // this is the floor. A NEW binding in the source needs no edit here.
  const src = Object.fromEntries(readdirSync("functions/src").filter((f) => f.endsWith(".ts")).map((f) => [`functions/src/${f}`, readFileSync(`functions/src/${f}`, "utf8")]));
  const derived = parseSecretConsumers(src);
  const handKept = {
    sendAdminDigest: ["ADMIN_NOTIFY_TO", "INFOMANIAK_SMTP_PASSWORD"],
    mintAppCheckToken: ["TURNSTILE_SECRET_KEY"],
    ...Object.fromEntries(["onAuthUserDeleted", "requestAccountDeletion", "cancelAccountDeletion", "adminPurgeAccount", "adminRestoreAccount", "adminDeleteImage", "adminSetProfileActive", "purgeExpiredAccounts", "flushMemberRebuilds"].map((name) => [name, ["GITHUB_REBUILD_TOKEN"]])),
  };
  for (const [name, secrets] of Object.entries(handKept)) {
    for (const secret of secrets) assert.ok(derived[name]?.includes(secret), `${name} should bind ${secret}`);
  }
});
