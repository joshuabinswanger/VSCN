// The decisions behind scripts/verify-release.mjs, with no I/O in them.
//
// Every function here takes data the runner has already fetched — a policy,
// a list of log entries, two rules files — and returns a verdict or a diff.
// Keeping them pure is what lets tests/unit/releaseChecks.test.mjs prove the
// one property the protocol cannot do without: that the verdicts go RED for
// the state prod was in between 2026-09-14 and 2026-09-22. The fetching lives
// in the runner and is only ever exercised against a real project.

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
 * Deployed functions against the export list at the released commit.
 * `deployed` carries short names and ISO update times; `lastCommit` maps a
 * module path to the ISO time of the last commit that touched it.
 */
export function functionsDrift(exports, deployed, lastCommit) {
  const byName = new Map(deployed.map((f) => [f.name, f.updateTime]));
  const drift = { missing: [], stale: [], current: [], extra: [] };
  for (const { name, module } of exports) {
    const updateTime = byName.get(name);
    if (!updateTime) { drift.missing.push(name); continue; }
    const source = lastCommit[module];
    if (source && Date.parse(updateTime) < Date.parse(source)) {
      drift.stale.push({ name, deployed: updateTime, source });
    } else {
      drift.current.push(name);
    }
  }
  const exported = new Set(exports.map((e) => e.name));
  drift.extra = deployed.map((f) => f.name).filter((name) => !exported.has(name));
  return drift;
}

/**
 * Each expected grant is looked up in the policy its scope names:
 * `project` → policies.project, `serviceAccount` / `runService` →
 * policies[scope][resource]. Conditional bindings never satisfy an
 * expectation; the grants this project depends on are unconditional.
 */
export function iamDiff(expected, policies) {
  const diff = { present: [], missing: [], forbidden: [] };
  for (const grant of expected) {
    const policy = grant.scope === "project" ? policies.project : policies[grant.scope]?.[grant.resource];
    const held = (policy?.bindings ?? []).some(
      (b) => b.role === grant.role && !b.condition && (b.members ?? []).includes(grant.member)
    );
    if (grant.forbidden) {
      if (held) diff.forbidden.push(grant);
    } else if (held) {
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

/** authorizeImageUpload must pair with completeImageUpload. Ratio with a floor, not equality. */
export function pairingVerdict({ authorize, complete }) {
  if (authorize >= 3 && complete === 0) {
    return { status: "FAIL", reason: "nothing is getting through: uploads are authorised and never completed" };
  }
  if (authorize >= 10 && complete < authorize * 0.5) {
    return { status: "WARN", reason: "fewer than half of authorised uploads complete" };
  }
  return { status: "PASS", reason: authorize === 0 ? "no upload traffic in the window" : "uploads complete" };
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

/** Only the aliases. A raw project id is refused so the id can never drift from the expectations table. */
export function resolveProjectAlias(alias, firebaserc) {
  if (alias === "prod") return firebaserc.projects.default;
  if (alias === "dev") return firebaserc.projects.dev;
  throw new Error(`--project takes prod or dev, never a raw project id (got ${alias ?? "nothing"})`);
}
