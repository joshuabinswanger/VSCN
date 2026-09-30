import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { advisoriesFrom, auditVerdict } from "../../scripts/lib/dependency-audit.mjs";

// The shape `npm audit --json` gave on 2026-09-30 for nodemailer@7.0.13, the
// version review C4 found in functions/: advisory objects in `via`, and a
// transitive package whose `via` only names the dependency.
const report = {
  auditReportVersion: 2,
  vulnerabilities: {
    nodemailer: {
      name: "nodemailer", severity: "high",
      via: [
        { source: 1115470, name: "nodemailer", title: "SMTP command injection", url: "https://github.com/advisories/GHSA-c7w3-x93f-qmm8", severity: "low" },
        { source: 1, name: "nodemailer", title: "Header injection", url: "https://github.com/advisories/GHSA-2x7j-588g-ccc2", severity: "high" },
        { source: 2, name: "nodemailer", title: "Address parser DoS", url: "https://github.com/advisories/GHSA-p6gq-j5cr-w38f", severity: "high" },
      ],
    },
    "mail-wrapper": { name: "mail-wrapper", severity: "high", via: ["nodemailer"] },
  },
  metadata: { vulnerabilities: { high: 2 } },
};

test("advisoriesFrom: one finding per advisory at or above the level, not per package", () => {
  assert.deepEqual(advisoriesFrom(report, "high").map((a) => a.id), ["GHSA-2x7j-588g-ccc2", "GHSA-p6gq-j5cr-w38f"]);
  assert.equal(advisoriesFrom(report, "low").length, 3);
  assert.deepEqual(advisoriesFrom({ vulnerabilities: {} }), []);
});

test("auditVerdict: an allowlist entry is a dated decision and stops working after its date", () => {
  const advisories = advisoriesFrom(report, "high");
  const entry = { id: "GHSA-2x7j-588g-ccc2", package: "nodemailer", reason: "headers are never member input", until: "2026-10-31" };
  let v = auditVerdict(advisories, [entry], "2026-10-31");
  assert.deepEqual(v.blocking.map((a) => a.id), ["GHSA-p6gq-j5cr-w38f"]);
  assert.deepEqual(v.allowed.map((a) => a.id), ["GHSA-2x7j-588g-ccc2"]);
  v = auditVerdict(advisories, [entry], "2026-11-01");
  assert.equal(v.blocking.length, 2);
  assert.equal(v.blocking.find((a) => a.id === entry.id).expired, "2026-10-31");
  // No date or no reason: allows nothing.
  for (const bad of [{ ...entry, until: undefined }, { ...entry, until: "soon" }, { ...entry, reason: " " }]) {
    assert.equal(auditVerdict(advisories, [bad], "2026-10-01").blocking.length, 2);
  }
});

test("the committed allowlist parses and every entry is dated and reasoned", () => {
  const { advisories } = JSON.parse(readFileSync(".github/audit-allowlist.json", "utf8"));
  assert.ok(Array.isArray(advisories));
  for (const e of advisories) {
    assert.match(e.id, /^GHSA-/);
    assert.match(e.until, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.reason?.trim(), `${e.id} needs a reason`);
  }
});
