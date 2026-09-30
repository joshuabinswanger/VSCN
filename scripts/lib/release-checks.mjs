// The decisions behind scripts/verify-release.mjs, with no I/O in them.
//
// Every function here takes data the runner has already fetched — a policy,
// a list of log entries, two rules files — and returns a verdict or a diff.
// Keeping them pure is what lets tests/unit/releaseChecks.test.mjs prove the
// one property the protocol cannot do without: that the verdicts go RED for
// the state prod was in between 2026-09-14 and 2026-09-22. The fetching lives
// in the runner and is only ever exercised against a real project.
import ts from "typescript";

/** `export { a, b } from "./mod";` → one entry per name, module as a repo path. */
export function parseFunctionExports(indexSource) {
  const out = [];
  const re = /export\s*\{([^}]*)\}\s*from\s*["']\.\/([\w-]+)["']/g;
  for (const match of indexSource.matchAll(re)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop();
      if (name) out.push({ name, module: `functions/src/${match[2]}.ts` });
    }
  }
  return out;
}

/** Every `defineSecret("NAME")` across the given sources, unique and sorted. */
export function parseSecretNames(sources) {
  const names = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/defineSecret\(\s*["']([A-Z0-9_]+)["']\s*\)/g)) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Which exported function binds which secret, read from the source the way
 * the Firebase CLI reads it: the `secrets: [...]` option of each exported
 * trigger — `onCall({ secrets })`, `onSchedule({ secrets })`,
 * `onRequest({ secrets })`, a v1 `.runWith({ secrets })` — with each element
 * a `defineSecret` handle (resolved across modules by its identifier) or a
 * literal name. `sources` maps a path to its text. Handler bodies are not
 * walked: an object literal inside a function body is not a deploy option.
 * Replaces the hand-kept map verify-release carried until 2026-09-30, which
 * nothing tied to the source (review T2-10).
 */
export function parseSecretConsumers(sources) {
  const files = Object.entries(sources).map(([path, text]) => ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true));
  const handles = new Map();
  const visitHandles = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "defineSecret"
      && node.initializer.arguments[0] && ts.isStringLiteral(node.initializer.arguments[0])) {
      handles.set(node.name.text, node.initializer.arguments[0].text);
    }
    ts.forEachChild(node, visitHandles);
  };
  files.forEach(visitHandles);
  const consumers = {};
  for (const file of files) {
    for (const statement of file.statements) {
      if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const found = new Set();
        const visit = (node) => {
          if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
          if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "secrets"
            && ts.isArrayLiteralExpression(node.initializer)) {
            for (const el of node.initializer.elements) {
              if (ts.isStringLiteral(el)) found.add(el.text);
              else if (ts.isIdentifier(el) && handles.has(el.text)) found.add(handles.get(el.text));
              else throw new Error(`${file.fileName}: ${decl.name.text} binds a secret this parser cannot resolve: ${el.getText(file)}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(decl.initializer);
        if (found.size) consumers[decl.name.text] = [...found].sort();
      }
    }
  }
  return consumers;
}

/**
 * One function's binding of one secret against that secret's versions.
 * Functions pin the version they were deployed with, so a new version does
 * nothing until the function is REDEPLOYED (2026-09-23: sendAdminDigest ran
 * on INFOMANIAK_SMTP_PASSWORD@1 for a day after @3 held the right value).
 * DISABLED (FAIL): the bound version is not enabled — the function cannot
 * start. STALE (WARN): enabled, but a newer enabled version exists, so the
 * function runs on a value someone meant to replace. "latest" is current.
 */
export function secretBindingVerdict(boundVersion, enabledVersions) {
  const ids = enabledVersions.map((v) => Number(String(v).split("/").pop())).filter(Number.isInteger);
  const newest = ids.length ? Math.max(...ids) : null;
  if (boundVersion === "latest") return newest === null ? { status: "DISABLED", newest } : { status: "CURRENT", newest };
  const bound = Number(boundVersion);
  if (!ids.includes(bound)) return { status: "DISABLED", newest };
  return bound < newest ? { status: "STALE", newest } : { status: "CURRENT", newest };
}

/** Line endings, trailing whitespace and trailing blank lines are not drift. */
export function normaliseRules(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function compareRules(liveText, repoText) {
  const live = normaliseRules(liveText).split("\n");
  const repo = normaliseRules(repoText).split("\n");
  const n = Math.max(live.length, repo.length);
  for (let i = 0; i < n; i++) {
    if (live[i] !== repo[i]) return { equal: false, line: i + 1, live: live[i] ?? "", repo: repo[i] ?? "" };
  }
  return { equal: true };
}

/**
 * Is the deployed backend exactly the one this source builds? Every export
 * must be deployed AND carry the source digest the build stamps into its
 * labels (scripts/stamp-backend.mjs). Anything else — missing, unstamped,
 * another digest — means the Hosting workflow must deploy Functions before
 * it may publish. Deployed functions the source no longer exports are
 * reported but do not force a deploy: firebase deploy would refuse to delete
 * them non-interactively anyway, which is a job for a human.
 *
 * A function whose `state` is present and not ACTIVE is not current either,
 * whatever its label says: a deploy that fails half-way can leave the new
 * digest on a FAILED function. An absent state is not held against it (the
 * fixtures and any API shape without the field), since a false "not current"
 * here redeploys production on every member-rebuild dispatch.
 */
export function backendVerdict(exports, deployed, expectedDigest) {
  const byName = new Map(deployed.map((f) => [f.name, f]));
  const mismatched = [];
  for (const { name } of exports) {
    const fn = byName.get(name);
    if (!fn) mismatched.push(`${name}: not deployed`);
    else if (fn.labels?.source_digest !== expectedDigest) {
      mismatched.push(`${name}: ${fn.labels?.source_digest ?? "unstamped"}`);
    } else if (fn.state && fn.state !== "ACTIVE") {
      mismatched.push(`${name}: ${fn.state}`);
    }
  }
  const exported = new Set(exports.map((e) => e.name));
  const orphans = deployed.map((f) => f.name).filter((name) => !exported.has(name));
  return { current: mismatched.length === 0, mismatched, orphans };
}

/**
 * Each expected grant is looked up in the policy its scope names:
 * `project` → policies.project, `serviceAccount` / `runService` / `secret` →
 * policies[scope][resource]. Conditional bindings never satisfy an
 * expectation; the grants this project depends on are unconditional.
 * They DO count against a forbidden grant: a condition (an expiry, a
 * resource-name match) narrows a grant, it does not remove it, and a
 * condition-blind check is the only one that cannot be talked out of a
 * finding. Each forbidden finding carries the condition it was held under.
 */
export function iamDiff(expected, policies) {
  const diff = { present: [], missing: [], forbidden: [] };
  for (const grant of expected) {
    const policy = grant.scope === "project" ? policies.project : policies[grant.scope]?.[grant.resource];
    const matching = (policy?.bindings ?? []).filter((b) => b.role === grant.role && (b.members ?? []).includes(grant.member));
    if (grant.forbidden) {
      const binding = matching.find((b) => !b.condition) ?? matching[0];
      if (binding) diff.forbidden.push(binding.condition ? { ...grant, condition: binding.condition.title ?? binding.condition.expression ?? "conditional" } : grant);
      continue;
    }
    const held = matching.some((b) => !b.condition);
    if (held) {
      diff.present.push(grant);
    } else {
      diff.missing.push(grant);
    }
  }
  return diff;
}

/** Request-log entries → invocations. Preflight OPTIONS are not invocations. */
export function countRequests(entries) {
  let total = 0;
  let ok = 0;
  for (const e of entries) {
    const r = e.httpRequest;
    if (!r || r.requestMethod !== "POST") continue;
    total++;
    if (r.status >= 200 && r.status < 300) ok++;
  }
  return { total, ok };
}

/**
 * authorizeImageUpload must pair with completeImageUpload. Ratio with a floor,
 * not equality. `untested` marks a window with no completed upload at all:
 * nothing in it proves uploads work, so the run's verdict says NOT TESTED
 * rather than a bare GREEN (verdictLabel), without failing the run.
 */
export function pairingVerdict({ authorize, complete }) {
  if (authorize === 0 && complete === 0) return { status: "WARN", untested: true, reason: "NOT TESTED: no upload traffic in the window" };
  if (authorize >= 3 && complete === 0) {
    return { status: "FAIL", reason: "nothing is getting through: uploads are authorised and never completed" };
  }
  if (authorize >= 10 && complete < authorize * 0.5) {
    return { status: "WARN", reason: "fewer than half of authorised uploads complete" };
  }
  if (complete === 0) {
    // One or two authorised and none completed: too few to call an outage
    // (a member who picks a file and closes the tab looks the same), and too
    // few to call it working.
    return { status: "WARN", untested: true, reason: `NOT TESTED: ${authorize} authorised, none completed — too few to tell an outage from abandoned uploads` };
  }
  return { status: "PASS", reason: "uploads complete" };
}

function errorMessage(entry) {
  if (typeof entry.textPayload === "string") return entry.textPayload;
  if (typeof entry.jsonPayload?.message === "string") return entry.jsonPayload.message;
  if (typeof entry.protoPayload?.status?.message === "string") return entry.protoPayload.status.message;
  if (entry.httpRequest) return `HTTP ${entry.httpRequest.status}`;
  return JSON.stringify(entry.jsonPayload ?? "").slice(0, 120);
}

/** Count plus the three most frequent messages, each with the services it came from. */
export function summariseErrors(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const message = errorMessage(entry).trim().slice(0, 200);
    const group = groups.get(message) ?? { message, n: 0, services: new Set() };
    group.n++;
    const service = entry.resource?.labels?.service_name ?? entry.resource?.labels?.function_name;
    if (service) group.services.add(service);
    groups.set(message, group);
  }
  const top = [...groups.values()]
    .sort((a, b) => b.n - a.n || a.message.localeCompare(b.message))
    .slice(0, 3)
    .map((g) => ({ message: g.message, n: g.n, services: [...g.services].sort() }));
  return { count: entries.length, top };
}

/**
 * Residue of uploads that started and never finished, in two ages.
 * `recent` is older than an hour but younger than the sweep horizon: the
 * sweep has not reached it yet, so it says nothing about the sweep — but a
 * pile of it says uploads are failing, which corroborates the pairing probe
 * from the data side. `overdue` is past the horizon (sweepImages' stale
 * cutoff plus one run interval): the sweep should have removed it, and any
 * of it means the sweep is not doing its job.
 */
export function strandedVerdict({ recent, overdue }) {
  if (overdue > 0) return { status: "FAIL", reason: "the sweep is not clearing residue it should have removed" };
  if (recent > 5) return { status: "WARN", reason: "uploads are failing faster than they complete; the sweep has not reached them yet" };
  return { status: "PASS", reason: recent ? "a little residue, within the sweep's reach" : "nothing stranded" };
}

/** The `build-commit` meta tag must equal the released commit's 7-character SHA. */
export function buildStampVerdict(html, releaseSha) {
  const live = html.match(/<meta\s+name="build-commit"\s+content="([^"]*)"/)?.[1];
  const buildTime = html.match(/<meta\s+name="build-time"\s+content="([^"]*)"/)?.[1];
  return { status: live === releaseSha.slice(0, 7) ? "PASS" : "FAIL", live, buildTime };
}

/** SKIP exits 1 like FAIL: a probe that did not run is not a pass. WARN does not. */
export function exitCodeFor(rows) {
  return rows.some((r) => r.status === "FAIL" || r.status === "SKIP") ? 1 : 0;
}

/**
 * The verdict WORD, which is what lands in the release log. RED is exitCodeFor's
 * RED. A green run with an `untested` row says so in the word itself —
 * "GREEN, NOT TESTED: upload pairing" — because a bare GREEN over a window in
 * which nothing was uploaded claims more than the run saw (review C5). The
 * exit code stays 0 on purpose: no workflow reads it, and a quiet window is
 * the NORMAL case on dev and on a small prod, so failing it would teach
 * everyone to ignore a red run.
 */
export function verdictLabel(rows) {
  if (exitCodeFor(rows)) return "RED";
  const untested = rows.filter((r) => r.untested).map((r) => r.name);
  return untested.length ? `GREEN, NOT TESTED: ${untested.join(", ")}` : "GREEN";
}

/** Only the aliases. A raw project id is refused so the id can never drift from the expectations table. */
export function resolveProjectAlias(alias, firebaserc) {
  if (alias === "prod") return firebaserc.projects.default;
  if (alias === "dev") return firebaserc.projects.dev;
  throw new Error(`--project takes prod or dev, never a raw project id (got ${alias ?? "nothing"})`);
}
