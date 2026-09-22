<!-- Mirrors the ~/.claude memory file release-verification-protocol.md; kept in sync so any agent can read it from the repo. -->

---
name: release-verification-protocol
description: "SHIPPED TO PROD 2026-09-22 f21a60f and GREEN there; eight read-only probes over REST with the gcloud user token, run after every merge to dev and main. The walk is Playwright's since 2026-09-23 (see release-walk-automation); its first CI run waits on two secrets"
metadata: 
  node_type: memory
  type: project
  originSessionId: 719f6c3e-283b-4178-b7af-346ca49dc21a
  modified: 2026-09-22T20:11:39.193Z
---

Built and shipped 2026-09-22: `scripts/verify-release.mjs` plus the pure half in
`scripts/lib/release-checks.mjs` (unit-tested), the protocol in
`documentation/release-verification.md`, the history in `documentation/release-log.md`. Design:
`documentation/20260922-release-verification-protocol.md`, whose status block lists where the build
departed from it. Run: `npm run verify:release -- --project prod|dev`; it needs only
`gcloud auth login`. Prod went GREEN on release `f21a60f`.

**Why:** Michael's uploads were dead for eight days and every test stayed green — the emulator does
not enforce the cross-service IAM prod does, and the release pipeline was `--only hosting`. The
check is for DRIFT between the repo and the Google project. Acceptance: pointed at the
2026-09-14 → 2026-09-22T14:00Z window it fails on upload pairing (31 authorise, 0 complete), and a
bogus expected IAM role turns probe 4 red.

**How to apply:** run it without asking after every merge to dev and to main. Everything it found
on 2026-09-22 has been fixed and shipped: the undeployed and stale functions on both projects, the
publication invoker (see [[publication-invoker-is-declared]]), the Brevo-era sender address, and
rules that nothing deployed automatically (see [[ci-deploys-security-rules]]). Two warnings on prod
are expected to persist briefly and are NOT faults: upload pairing counts the outage until the next
release moves the window, and the stranded residue clears when `sweepImages` next passes its
six-hour cutoff.

**The walk is automated** (2026-09-23, [[release-walk-automation]]): the verification member exists
(created by Josh, hidden by Claude) and Playwright walks the six steps from CI after every release
to main. Its first real run is pending Josh's two GitHub secrets. A known gap in the check itself: probe 2 compares a function's deploy time against its MODULE's last
commit, so a change to `functions/.env` (a deploy-time param, baked at deploy) leaves every
function looking current when it is not. Traps from building it: `OPTIONS` preflights share the
request log with the `POST`s and double the counts; the sweep horizon is 12 h (6 h cutoff + 6 h
interval); a `/tmp` path in `node -e` under Git Bash resolves to `D:\tmp`. Deploying functions here
needs `FUNCTIONS_DISCOVERY_TIMEOUT=120`, a value in `functions/.env` for every param (a code
default is not enough non-interactively), and `--force` for any retry policy — which also deletes
orphans, so read probe 2's ORPHAN rows first. Related: [[merge-gate-must-read-exit-code]],
[[merge-into-dev-without-asking]], [[dev-deploy-is-ci-only]].
