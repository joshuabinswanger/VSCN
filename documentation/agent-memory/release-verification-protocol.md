<!-- Mirrors the ~/.claude memory file release-verification-protocol.md; kept in sync so any agent can read it from the repo. -->

---
name: release-verification-protocol
description: "MERGED TO DEV c85ae17 2026-09-22: verify-release.mjs (8 read-only probes over REST with the gcloud user token); the first fix-then-green loop on dev exposed that a functions deploy WIPES the publication invoker grant"
metadata: 
  node_type: memory
  type: project
  originSessionId: 719f6c3e-283b-4178-b7af-346ca49dc21a
  modified: 2026-09-22T17:57:06.661Z
---

Built 2026-09-22, merged to dev as `c85ae17` via PR #53 the same day: `scripts/verify-release.mjs`
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
Josh walks). Day-one findings: prod lacks `adminListActions` and runs 09-15 admin callables against
09-17 source (PR #48 shipped through hosting only); dev lacked the digest and moderation functions
until the stage-1 deploy below. Traps learned building it: `OPTIONS` preflights sit in the same
request log as the `POST`s and double the counts; the sweep horizon is 12 h (6 h cutoff + 6 h
interval), so residue younger than that is normal; a `/tmp` path in `node -e` under Git Bash
resolves to `D:\tmp`, which is how a bogus "rules drift" diff got produced and then disproved by
the script. The verification member (design §7.1) is NOT yet created; the walk has never been run.

**Stage 1, the dev round trip (2026-09-22 evening):** deploying functions to dev turned probe 2
green (30 of 30) and probe 4 RED. `firebase deploy --only functions` resets the invoker policy of
`acknowledgeSitePublication` to what the code declares, and `invoker: "private"` means nobody, so
it wiped the hand-applied `roles/run.invoker` for the hosting deployer. Prod will lose it the same
way on its next functions deploy, and the merge workflow's last step then 403s. Durable fix:
declare the deployer in code, `invoker: ["vscn-hosting-deployer@<project>.iam.gserviceaccount.com"]`
with the project taken from `GCLOUD_PROJECT` at discovery time. Re-granting is a classifier-blocked
IAM grant for me; Josh runs `gcloud run services add-iam-policy-binding`. Deploy traps met on the
way: discovery needs `FUNCTIONS_DISCOVERY_TIMEOUT=120` on this machine; non-interactive mode
refuses params that only have a code default (`SMTP_HOST`/`SMTP_USER` now sit in `functions/.env`);
a retry policy needs `--force`, which also deletes orphaned functions, so read probe 2's ORPHAN
rows first. Related: [[admin-console-ux-pass]], [[dev-deploy-is-ci-only]],
[[merge-into-dev-without-asking]], [[admin-digest-replaces-brevo]].
