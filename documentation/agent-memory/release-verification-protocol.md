<!-- Mirrors the ~/.claude memory file release-verification-protocol.md; kept in sync so any agent can read it from the repo. -->

---
name: release-verification-protocol
description: "BUILT 2026-09-22: verify-release.mjs (8 read-only probes over REST with the gcloud user token) went red against the reconstructed outage and found live drift on both projects; run it after every merge"
metadata: 
  node_type: memory
  type: project
  originSessionId: 719f6c3e-283b-4178-b7af-346ca49dc21a
  modified: 2026-09-22T14:54:02.045Z
---

Built 2026-09-22 on `chore/release-verification` (PR into dev the same day): `scripts/verify-release.mjs`
plus the pure half in `scripts/lib/release-checks.mjs` (unit-tested), the protocol in
`documentation/release-verification.md`, the history in `documentation/release-log.md`. Design:
`documentation/20260922-release-verification-protocol.md`, whose status block lists where the build
departed from it. Run: `npm run verify:release -- --project prod|dev`. It needs only `gcloud auth login`.

**Why:** Michael's uploads were dead for eight days and every test stayed green — the emulator does
not enforce the cross-service IAM prod does, and the merge pipeline deploys `--only hosting`. The
check is for DRIFT between the repo and the Google project. It passed its acceptance test: pointed
at the 2026-09-14 → 2026-09-22T14:00Z window it fails on upload pairing (31 authorise, 0 complete),
and a bogus expected IAM role turns probe 4 red.

**How to apply:** run it without asking after every merge to dev (machine half) and to main (then
Josh walks). What it found on day one, both still open unless the log says otherwise: prod lacks
`adminListActions` and runs 09-15 admin callables against 09-17 source (PR #48 shipped through
hosting only); dev lacks the digest and moderation functions. Traps learned building it:
`OPTIONS` preflights sit in the same request log as the `POST`s and double the counts; the sweep's
horizon is 12 h (6 h cutoff + 6 h interval), so residue younger than that is normal; a `/tmp` path
in `node -e` under Git Bash resolves to `D:\tmp`, which is how a bogus "rules drift" diff got
produced and then disproved by the script. The verification member (§7.1) is NOT yet created; the
walk has never been run. Related: [[admin-console-ux-pass]], [[dev-deploy-is-ci-only]],
[[merge-into-dev-without-asking]], [[admin-digest-replaces-brevo]].
