#!/usr/bin/env node
// Post-release check: does the Google project match the code that just shipped?
//
//   node scripts/verify-release.mjs --project prod
//   node scripts/verify-release.mjs --project dev
//   node scripts/verify-release.mjs --project prod --since 2026-09-14T00:00:00Z --until 2026-09-22T14:00:00Z
//
// Options
//   --project prod|dev   REQUIRED. Resolved through .firebaserc; a raw id is refused.
//   --release <sha>      The released commit. Default: origin/main (prod) or origin/dev (dev).
//   --since <sha|iso>    Start of the behaviour window. Default: the previous first-parent
//                        commit on the branch, i.e. the previous release.
//   --until <iso>        End of the behaviour window. Default: now.
//   --origin <url>       Override the live origin (never point it at a PR preview: a
//                        preview's stamp is the ephemeral refs/pull/N/merge SHA).
//
// Why it exists: on 2026-09-22 a member reported that every gallery upload had
// been failing since the 2026-09-14 release, and every test had stayed green.
// The emulator does not enforce the cross-service IAM prod enforces, and the
// merge pipeline deploys `--only hosting`, so the whole backend can be out of
// step with the code and nothing notices until someone writes in. This script
// checks for DRIFT between the repository and the project. It is READ-ONLY:
// every call is a GET, a `:getIamPolicy`, an `entries:list` or a `runQuery`.
// Design: documentation/20260922-release-verification-protocol.md.
// Protocol: documentation/release-verification.md.
//
// Credentials: the gcloud CLI's own user credential (`gcloud auth login`). One
// access token is minted from it and every API is called over REST with it.
// The Rules API rejects a user token without a quota project, so every call
// carries `x-goog-user-project`; that header cost an hour on 2026-09-22.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStampVerdict, compareRules, countRequests, exitCodeFor, functionsDrift, iamDiff,
  pairingVerdict, parseFunctionExports, parseSecretNames, resolveProjectAlias, strandedVerdict,
  summariseErrors,
} from "./lib/release-checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ───────────────────────────── EXPECTED ─────────────────────────────────
// The intended state of each project: what the code needs the project to
// hold, with the consequence of each grant's absence. This table is the
// first place this infrastructure is written down anywhere — none of it
// exists in a file the Firebase CLI reads, and most of it was created by an
// interactive deploy or a one-off console click.
//
// ADDING A GRANT TO A PROJECT WITHOUT ADDING IT HERE IS HOW THE 2026-09-14
// OUTAGE HAPPENS AGAIN. Record what is intended, not merely what is present.
//
// Scopes: `project` is the project IAM policy. `serviceAccount` is the policy
// ON a service account (who may act as it). `runService` is the invoker
// policy on one Cloud Run service — a gen-2 function's private endpoint.
function grants(projectId, number) {
  const storageAgent = `serviceAccount:service-${number}@gcp-sa-firebasestorage.iam.gserviceaccount.com`;
  const runtime = `${number}-compute@developer.gserviceaccount.com`;
  const deployer = `serviceAccount:vscn-hosting-deployer@${projectId}.iam.gserviceaccount.com`;
  const reader = `serviceAccount:vscn-build-reader@${projectId}.iam.gserviceaccount.com`;
  return [
    { scope: "project", member: storageAgent, role: "roles/firebaserules.firestoreServiceAgent",
      why: "lets storage.rules call firestore.get(); without it every rule evaluation errors, every error denies, and members see 'sign-in expired' on every upload" },
    { scope: "serviceAccount", resource: runtime, member: `serviceAccount:${runtime}`, role: "roles/iam.serviceAccountTokenCreator",
      why: "the functions runtime signs App Check tokens with its own identity (functions/src/appCheck.ts); roles/editor does not include signBlob, so without this login stalls at the Turnstile step" },
    { scope: "runService", resource: "acknowledgesitepublication", member: deployer, role: "roles/run.invoker",
      why: "the merge workflow's last step POSTs the published revision to acknowledgeSitePublication; without it every release ends red in Actions. Declared in functions/src/publication.ts since 2026-09-22, so a functions deploy applies it — if this row is red, the project was last deployed from a commit that still said invoker: \"private\", and that deploy revoked it" },
    { scope: "project", member: deployer, role: "roles/run.invoker", forbidden: true,
      why: "the deployer may invoke that one function and nothing else; a project-wide invoker grant would let a leaked deploy credential call every callable" },
    { scope: "project", member: deployer, role: "roles/firebasehosting.admin",
      why: "the merge workflow deploys Hosting as this account" },
    { scope: "project", member: deployer, role: "roles/firebaserules.admin",
      why: "since 2026-09-22 the merge and staging workflows deploy firestore.rules and storage.rules before Hosting; without it the release stops at the rules step, and before it existed every ruleset change was a hand deploy someone had to remember" },
    { scope: "project", member: reader, role: "roles/datastore.viewer",
      why: "the export job reads Firestore to build the static site; without it the build renders zero members and still says Complete" },
  ];
}

const EXPECTED = {
  "vscn-39508": {
    alias: "prod", number: "365553954084", branch: "main", origin: "https://vscn.ch",
    bucket: "vscn-39508.firebasestorage.app", region: "us-central1",
    runtimeServiceAccount: "365553954084-compute@developer.gserviceaccount.com",
    grants: grants("vscn-39508", "365553954084"),
  },
  "vscn-dev-f4b60": {
    alias: "dev", number: "640269226461", branch: "dev", origin: "https://vscn-dev-f4b60.web.app",
    bucket: "vscn-dev-f4b60.firebasestorage.app", region: "us-central1",
    runtimeServiceAccount: "640269226461-compute@developer.gserviceaccount.com",
    grants: grants("vscn-dev-f4b60", "640269226461"),
  },
};

// Four groups, eight probes. Each runs even after an earlier one fails — on
// 2026-09-22 there were two failures, and a script that stops at the first
// would have hidden the second.
const PROBES = [
  ["SHIPPED", "build stamp", probeBuildStamp],
  ["PARITY", "functions deployed", probeFunctions],
  ["PARITY", "rules parity", probeRules],
  ["FOUNDATIONS", "IAM grants", probeIam],
  ["FOUNDATIONS", "secrets bound", probeSecrets],
  ["BEHAVIOUR", "upload pairing", probePairing],
  ["BEHAVIOUR", "function errors", probeErrors],
  ["BEHAVIOUR", "stranded state", probeStranded],
];

// ───────────────────────────── plumbing ─────────────────────────────────
function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function accessToken() {
  // Through the shell: on Windows gcloud is a .cmd wrapper, which Node refuses to spawn directly.
  return execSync("gcloud auth print-access-token", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** One REST call. Read-only by construction: the only POSTs are policy reads, log lists and queries. */
async function api(ctx, url, { method = "GET", body } = {}) {
  const headers = { authorization: `Bearer ${ctx.token}`, "x-goog-user-project": ctx.projectId };
  if (body) headers["content-type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function logEntries(ctx, filter, cap = 5000) {
  const entries = [];
  let pageToken;
  do {
    const page = await api(ctx, "https://logging.googleapis.com/v2/entries:list", {
      method: "POST",
      body: { resourceNames: [`projects/${ctx.projectId}`], filter, pageSize: 1000, orderBy: "timestamp desc", pageToken },
    });
    entries.push(...(page?.entries ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken && entries.length < cap);
  return entries;
}

async function listFunctions(ctx) {
  if (!ctx.functions) {
    const res = await api(ctx, `https://cloudfunctions.googleapis.com/v2/projects/${ctx.projectId}/locations/-/functions?pageSize=500`);
    ctx.functions = (res?.functions ?? []).map((f) => ({
      name: f.name.split("/").pop(), updateTime: f.updateTime, environment: f.environment,
      serviceAccount: f.serviceConfig?.serviceAccountEmail,
    }));
  }
  return ctx.functions;
}

const windowFilter = (ctx) => `timestamp>="${ctx.since}" AND timestamp<"${ctx.until}"`;
const shortIso = (iso) => (iso ? iso.replace(/\.\d+Z$/, "Z") : "?");

// ───────────────────────────── probes ───────────────────────────────────
async function probeBuildStamp(ctx) {
  const url = `${ctx.origin}/?verify=${Date.now()}`;
  const res = await fetch(url, { headers: { "cache-control": "no-cache", pragma: "no-cache" } });
  if (!res.ok) return { status: "FAIL", detail: `${ctx.origin} answered ${res.status}` };
  const v = buildStampVerdict(await res.text(), ctx.release);
  const built = v.buildTime ? `, built ${shortIso(v.buildTime)}` : "";
  return v.status === "PASS"
    ? { status: "PASS", detail: `live ${v.live} = released ${ctx.releaseShort}${built}` }
    : { status: "FAIL", detail: `expected ${ctx.releaseShort}, live serves ${v.live ?? "no build-commit stamp"}${built}` };
}

async function probeFunctions(ctx) {
  const exports = parseFunctionExports(git("show", `${ctx.release}:functions/src/index.ts`));
  const lastCommit = {};
  for (const module of new Set(exports.map((e) => e.module))) {
    lastCommit[module] = git("log", "-1", "--format=%cI", ctx.release, "--", module);
  }
  const drift = functionsDrift(exports, await listFunctions(ctx), lastCommit);
  const lines = [];
  for (const name of drift.missing) lines.push(`NOT DEPLOYED  ${name} (exported at ${ctx.releaseShort})`);
  for (const s of drift.stale) lines.push(`STALE         ${s.name} deployed ${shortIso(s.deployed)}, source changed ${s.source}`);
  for (const name of drift.extra) lines.push(`ORPHAN        ${name} is deployed but ${ctx.releaseShort} does not export it`);
  const status = drift.missing.length || drift.stale.length ? "FAIL" : drift.extra.length ? "WARN" : "PASS";
  const summary = `${drift.current.length} of ${exports.length} exports deployed after their last source change`;
  return { status, detail: lines.length ? [summary, ...lines] : summary };
}

async function probeRules(ctx) {
  const releases = (await api(ctx, `https://firebaserules.googleapis.com/v1/projects/${ctx.projectId}/releases`))?.releases ?? [];
  const targets = [
    ["firestore", "firestore.rules", `projects/${ctx.projectId}/releases/cloud.firestore`],
    ["storage", "storage.rules", `projects/${ctx.projectId}/releases/firebase.storage/${ctx.bucket}`],
  ];
  const lines = [];
  let failed = false;
  for (const [label, file, releaseName] of targets) {
    const release = releases.find((r) => r.name === releaseName);
    if (!release) { failed = true; lines.push(`${label}: no live release named ${releaseName}`); continue; }
    const ruleset = await api(ctx, `https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
    const live = ruleset?.source?.files?.[0]?.content ?? "";
    const cmp = compareRules(live, git("show", `${ctx.release}:${file}`));
    if (cmp.equal) {
      lines.push(`${label}: live ruleset (released ${shortIso(release.updateTime)}) = ${file}@${ctx.releaseShort}`);
    } else {
      failed = true;
      lines.push(`${label}: live ruleset (released ${shortIso(release.updateTime)}) ≠ ${file}@${ctx.releaseShort}, first difference at line ${cmp.line}`);
      lines.push(`    live: ${cmp.live.trim() || "(end of file)"}`);
      lines.push(`    repo: ${cmp.repo.trim() || "(end of file)"}`);
    }
  }
  return { status: failed ? "FAIL" : "PASS", detail: lines };
}

async function probeIam(ctx) {
  const policies = { project: null, serviceAccount: {}, runService: {} };
  policies.project = await api(ctx, `https://cloudresourcemanager.googleapis.com/v1/projects/${ctx.projectId}:getIamPolicy`, {
    method: "POST", body: { options: { requestedPolicyVersion: 3 } },
  });
  for (const grant of ctx.exp.grants) {
    if (grant.scope === "serviceAccount" && !policies.serviceAccount[grant.resource]) {
      policies.serviceAccount[grant.resource] = await api(ctx,
        `https://iam.googleapis.com/v1/projects/${ctx.projectId}/serviceAccounts/${grant.resource}:getIamPolicy`, { method: "POST" });
    }
    if (grant.scope === "runService" && !policies.runService[grant.resource]) {
      policies.runService[grant.resource] = await api(ctx,
        `https://run.googleapis.com/v2/projects/${ctx.projectId}/locations/${ctx.exp.region}/services/${grant.resource}:getIamPolicy`);
    }
  }
  const diff = iamDiff(ctx.exp.grants, policies);
  const lines = [];
  const where = (g) => (g.scope === "project" ? "project" : `${g.scope} ${g.resource}`);
  for (const g of diff.missing) lines.push(`MISSING    ${g.role} for ${g.member} on ${where(g)}`, `           → ${g.why}`);
  for (const g of diff.forbidden) lines.push(`FORBIDDEN  ${g.role} for ${g.member} on ${where(g)}`, `           → ${g.why}`);
  // The TokenCreator expectation is only about the right account if the
  // functions actually run as it. Gen 2 only: the two gen-1 Auth triggers run
  // as the App Engine default account by design and mint nothing.
  const others = (await listFunctions(ctx)).filter((f) => f.environment === "GEN_2" && f.serviceAccount && f.serviceAccount !== ctx.exp.runtimeServiceAccount);
  if (others.length) lines.push(`RUNTIME    ${others.length} gen-2 function(s) run as ${[...new Set(others.map((f) => f.serviceAccount))].join(", ")}, not ${ctx.exp.runtimeServiceAccount}`);
  const status = diff.missing.length || diff.forbidden.length ? "FAIL" : others.length ? "WARN" : "PASS";
  const forbiddenCount = ctx.exp.grants.filter((g) => g.forbidden).length;
  const summary = `${diff.present.length} of ${diff.present.length + diff.missing.length} expected grants held; ${forbiddenCount - diff.forbidden.length} of ${forbiddenCount} forbidden grants absent`;
  return { status, detail: lines.length ? [summary, ...lines] : summary };
}

async function probeSecrets(ctx) {
  const sources = git("grep", "-h", "-o", "-E", 'defineSecret\\("[A-Z0-9_]+"\\)', ctx.release, "--", "functions/src").split("\n");
  const names = parseSecretNames(sources);
  const lines = [];
  for (const name of names) {
    const res = await api(ctx, `https://secretmanager.googleapis.com/v1/projects/${ctx.projectId}/secrets/${name}/versions?filter=state:ENABLED`);
    if (res === null) lines.push(`MISSING   ${name} — declared in functions/src at ${ctx.releaseShort}, no such secret on ${ctx.projectId}`);
    else if (!(res.versions ?? []).length) lines.push(`DISABLED  ${name} exists but has no enabled version`);
  }
  return { status: lines.length ? "FAIL" : "PASS", detail: lines.length ? lines : `${names.length} declared secrets each hold an enabled version: ${names.join(", ")}` };
}

async function requestCounts(ctx, service) {
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND logName="projects/${ctx.projectId}/logs/run.googleapis.com%2Frequests" AND httpRequest.requestMethod="POST" AND ${windowFilter(ctx)}`;
  return countRequests(await logEntries(ctx, filter));
}

async function probePairing(ctx) {
  const [authorize, complete] = await Promise.all([requestCounts(ctx, "authorizeimageupload"), requestCounts(ctx, "completeimageupload")]);
  const v = pairingVerdict({ authorize: authorize.ok, complete: complete.ok });
  const traffic = `authorize ${authorize.ok} ok of ${authorize.total} / complete ${complete.ok} ok of ${complete.total}, ${ctx.windowLabel}`;
  return { status: v.status, detail: `${traffic} — ${v.reason}` };
}

async function probeErrors(ctx) {
  const filter = `severity>=ERROR AND (resource.type="cloud_run_revision" OR resource.type="cloud_function") AND ${windowFilter(ctx)}`;
  const summary = summariseErrors(await logEntries(ctx, filter));
  if (!summary.count) return { status: "PASS", detail: `no function errors ${ctx.windowLabel}` };
  const lines = [`${summary.count} error entries ${ctx.windowLabel}`];
  for (const t of summary.top) lines.push(`${String(t.n).padStart(4)} × ${t.message} [${t.services.join(", ") || "?"}]`);
  return { status: "WARN", detail: lines };
}

async function runQuery(ctx, structuredQuery) {
  const rows = await api(ctx, `https://firestore.googleapis.com/v1/projects/${ctx.projectId}/databases/(default)/documents:runQuery`, {
    method: "POST", body: { structuredQuery },
  });
  return (rows ?? []).filter((r) => r.document).map((r) => r.document);
}

async function probeStranded(ctx) {
  const now = Date.now();
  // sweepImages (functions/src/maintenance.ts) runs every 6 h and removes
  // upload residue older than STALE_UPLOAD_HOURS. Residue younger than
  // cutoff + one interval is therefore NORMAL after failed uploads; only
  // residue past that horizon says the sweep is not doing its job. On
  // 2026-09-22 prod held 23 permits and 23 records from that morning's
  // retries, all inside the horizon: uploads failing, sweep healthy.
  const staleHours = Number(git("show", `${ctx.release}:functions/src/constants.ts`).match(/STALE_UPLOAD_HOURS\s*=\s*(\d+)/)?.[1] ?? 6);
  const sweepIntervalHours = 6;
  const horizon = now - (staleHours + sweepIntervalHours) * 3_600_000;
  const hourAgo = now - 3_600_000;
  const permits = (await runQuery(ctx, {
    from: [{ collectionId: "uploadPermits" }], select: { fields: [{ fieldPath: "expiresAt" }] }, limit: 500,
    where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN", value: { timestampValue: new Date(now).toISOString() } } },
  })).map((d) => Date.parse(d.fields?.expiresAt?.timestampValue ?? "") - 30 * 60_000); // permit age = issue time
  // status == uploading, then the age filter in memory: an equality plus a
  // range on another field would need a composite index nobody has created.
  const uploading = (await runQuery(ctx, {
    from: [{ collectionId: "images" }], select: { fields: [{ fieldPath: "updatedAt" }] }, limit: 500,
    where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "uploading" } } },
  })).map((d) => Date.parse(d.fields?.updatedAt?.timestampValue ?? new Date(now).toISOString()));
  const pending = [];
  let pageToken;
  do {
    const page = await api(ctx, `https://storage.googleapis.com/storage/v1/b/${ctx.bucket}/o?prefix=pending/&maxResults=1000&fields=items(name,timeCreated),nextPageToken${pageToken ? `&pageToken=${pageToken}` : ""}`);
    pending.push(...(page?.items ?? []).map((o) => Date.parse(o.timeCreated)));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  const age = (times) => ({ recent: times.filter((t) => t < hourAgo && t >= horizon).length, overdue: times.filter((t) => t < horizon).length });
  const [p, u, o] = [age(permits), age(uploading), age(pending)];
  const v = strandedVerdict({ recent: p.recent + u.recent + o.recent, overdue: p.overdue + u.overdue + o.overdue });
  const show = (label, a) => `${label} ${a.recent}${a.overdue ? ` (+${a.overdue} overdue)` : ""}`;
  const detail = `${show("expired permits", p)}, ${show("images uploading", u)}, ${show("pending/ objects", o)} older than 1 h; overdue = past the ${staleHours + sweepIntervalHours} h sweep horizon — ${v.reason}`;
  return { status: v.status, detail };
}

// ───────────────────────────── main ─────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { args.help = true; continue; }
    if (a.startsWith("--")) { args[a.slice(2)] = argv[i + 1]; i++; }
  }
  return args;
}

function resolveSince(value, release) {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return { iso: new Date(value).toISOString(), label: `since ${value}` };
  const sha = value ?? git("rev-list", "--first-parent", "-2", release).split("\n")[1];
  if (!sha) throw new Error("cannot resolve the previous release; pass --since <sha|iso>");
  const iso = new Date(git("log", "-1", "--format=%cI", sha)).toISOString();
  return { iso, label: `since ${git("rev-parse", "--short", sha)} (${shortIso(iso)})` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return 0; }
  const firebaserc = JSON.parse(readFileSync(resolve(ROOT, ".firebaserc"), "utf8"));
  const projectId = resolveProjectAlias(args.project, firebaserc);
  const exp = EXPECTED[projectId];
  if (!exp) throw new Error(`${projectId} has no entry in EXPECTED`);

  let fetchNote = "";
  try { git("fetch", "origin", exp.branch, "--quiet"); } catch (err) { fetchNote = ` (fetch failed: ${err.message.split("\n")[0]}; using the local origin/${exp.branch})`; }
  const release = git("rev-parse", "--verify", `${args.release ?? `origin/${exp.branch}`}^{commit}`);
  const releaseShort = git("rev-parse", "--short=7", release);
  const since = resolveSince(args.since, release);
  const until = args.until ? new Date(args.until).toISOString() : new Date().toISOString();
  const ctx = {
    projectId, exp, release, releaseShort, bucket: exp.bucket, origin: args.origin ?? exp.origin,
    since: since.iso, until, windowLabel: `${since.label} → ${args.until ? shortIso(until) : "now"}`, token: accessToken(),
  };

  console.log(`Release verification · ${projectId} (${exp.alias}) · release ${releaseShort} on ${exp.branch}${fetchNote}`);
  console.log(`Window ${ctx.windowLabel} · origin ${ctx.origin}\n`);

  const rows = [];
  for (const [group, name, probe] of PROBES) {
    const n = rows.length + 1;
    let row;
    try {
      row = await probe(ctx);
    } catch (err) {
      row = { status: "SKIP", detail: `could not run: ${err.message.split("\n")[0]}` };
    }
    rows.push({ n, group, name, ...row });
    const detail = Array.isArray(row.detail) ? row.detail : [row.detail];
    console.log(`${row.status.padEnd(5)} ${n} ${name.padEnd(20)} ${detail[0]}`);
    for (const line of detail.slice(1)) console.log(`${" ".repeat(28)}${line}`);
  }

  const code = exitCodeFor(rows);
  const bad = rows.filter((r) => r.status === "FAIL" || r.status === "SKIP");
  const warn = rows.filter((r) => r.status === "WARN");
  console.log(`\n${code ? "RED" : "GREEN"} — ${bad.length} failing, ${warn.length} warning, ${rows.length - bad.length - warn.length} passing\n`);
  console.log("Release-log entry (documentation/release-log.md):\n");
  const first = (r) => (Array.isArray(r.detail) ? r.detail[0] : r.detail);
  console.log(`## ${new Date().toISOString().slice(0, 10)} · ${releaseShort} · ${exp.alias}`);
  console.log(`Machine: ${code ? "RED" : "GREEN"}${bad.length ? " — " + bad.map((r) => `${r.name}: ${first(r)}`).join("; ") : ""}`);
  for (const r of warn) console.log(`         WARN ${r.name}: ${first(r)}`);
  console.log(`Walk:    ${exp.alias === "prod" ? (code ? "not run (blocked on machine check)" : "pending") : "n/a (dev)"}`);
  console.log("Action:  ");
  return code;
}

main().then((code) => process.exit(code), (err) => { console.error(`verify-release: ${err.message}`); process.exit(1); });
