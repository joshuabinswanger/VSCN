#!/usr/bin/env node
// Dependency audit for both trees (review C4 / T2-11). Run by
// .github/workflows/dependency-audit.yml; by hand: `node scripts/audit-deps.mjs`.
//
//   root       FULL tree, dev dependencies included: firebase-admin, sharp and
//              Playwright are root devDependencies that run in CI next to the
//              build and deploy credentials, so "dev" is not "harmless" here.
//   functions  --omit=dev: what is deployed to Cloud Functions.
//
// Fails on any high or critical advisory not covered by a dated entry in
// .github/audit-allowlist.json. Reads only the lockfiles: `npm audit` needs no
// node_modules. A registry that cannot be reached fails the run too — an
// audit that did not happen is not a pass.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { advisoriesFrom, auditVerdict } from "./lib/dependency-audit.mjs";

const LEVEL = "high";
const TREES = [
  { label: "root", args: [] },
  { label: "functions", args: ["--prefix", "functions", "--omit=dev"] },
];

function audit(args) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  let out;
  try {
    out = execFileSync(npm, ["audit", "--json", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" });
  } catch (error) {
    // npm audit exits 1 whenever it finds anything; the JSON is still on stdout.
    out = error.stdout;
  }
  const report = JSON.parse(out || "{}");
  if (report.error) throw new Error(`npm audit ${args.join(" ")}: ${report.error.summary ?? JSON.stringify(report.error)}`);
  if (!report.metadata) throw new Error(`npm audit ${args.join(" ")} returned no report`);
  return report;
}

const allowlist = JSON.parse(readFileSync(new URL("../.github/audit-allowlist.json", import.meta.url), "utf8")).advisories ?? [];
const today = new Date().toISOString().slice(0, 10);
let failed = false;
const seen = [];
for (const tree of TREES) {
  const advisories = advisoriesFrom(audit(tree.args), LEVEL);
  seen.push(...advisories);
  const v = auditVerdict(advisories, allowlist, today);
  console.log(`${tree.label}: ${v.blocking.length ? "FAIL" : "PASS"} — ${advisories.length} ${LEVEL}+ advisories, ${v.allowed.length} allowlisted`);
  for (const a of v.blocking) console.log(`  BLOCKING ${a.id} ${a.severity} ${a.package}: ${a.title}${a.expired ? ` (allowlist ${a.expired}; expired or invalid)` : ""} ${a.url ?? ""}`);
  for (const a of v.allowed) console.log(`  allowed  ${a.id} ${a.package} until ${a.until}: ${a.reason}`);
  if (v.blocking.length) failed = true;
}
const unused = allowlist.filter((e) => !seen.some((a) => a.id === e.id)).map((e) => e.id);
if (unused.length) console.log(`Allowlist entries no tree needs any more (delete them): ${unused.join(", ")}`);
process.exit(failed ? 1 : 0);
