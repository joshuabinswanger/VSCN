// The decision behind scripts/audit-deps.mjs, with no I/O in it.
//
// `npm audit --json` (report version 2) lists vulnerable PACKAGES; the
// advisories themselves sit in each package's `via`, as objects, while a
// string in `via` only names the dependency the problem came through. The
// unit of a finding is therefore the advisory (its GHSA id), deduplicated
// across the packages it reaches.

const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/** Advisories at or above `level` in one `npm audit --json` report. */
export function advisoriesFrom(report, level = "high") {
  const floor = RANK[level];
  const found = new Map();
  for (const vuln of Object.values(report?.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || (RANK[via.severity] ?? 0) < floor) continue;
      const id = String(via.url ?? "").match(/GHSA-[\w-]+/)?.[0] ?? `npm-${via.source}`;
      if (!found.has(id)) found.set(id, { id, package: via.name, severity: via.severity, title: via.title, url: via.url });
    }
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Split advisories into blocking and allowed. An allowlist entry is
 * `{ id, package, reason, until: "YYYY-MM-DD" }`: it suppresses that advisory
 * up to and including `until`, and never after — an exception is a dated
 * decision, not a permanent mute. An entry without a valid `until` or a
 * reason allows nothing. `today` is an ISO date.
 */
export function auditVerdict(advisories, allowlist, today) {
  const blocking = [];
  const allowed = [];
  for (const advisory of advisories) {
    const entry = allowlist.find((e) => e.id === advisory.id);
    const valid = entry && typeof entry.reason === "string" && entry.reason.trim() && /^\d{4}-\d{2}-\d{2}$/.test(entry.until ?? "");
    if (valid && today <= entry.until) allowed.push({ ...advisory, until: entry.until, reason: entry.reason });
    else blocking.push({ ...advisory, ...(entry ? { expired: valid ? entry.until : "invalid allowlist entry" } : {}) });
  }
  return { blocking, allowed };
}
