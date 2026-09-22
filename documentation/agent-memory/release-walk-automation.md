<!-- Mirrors the ~/.claude memory file release-walk-automation.md; kept in sync so any agent can read it from the repo. -->

---
name: release-walk-automation
description: "BUILT 2026-09-23 on branch chore/release-walk (PR to dev): Playwright walks the protocol's six steps on prod as a standing hidden member after every release; Turnstile bypassed with an App Check debug token; first CI walk waits on two GitHub secrets Josh must set"
metadata:
  node_type: memory
  type: project
  originSessionId: f87376d8-2519-4bc1-93cd-3aa33faee948
  modified: 2026-09-22T22:17:46.789Z
---

`scripts/walk-release.mjs` (browser) + `scripts/lib/release-walk.mjs` (pure, unit-tested) walk
the six steps of `documentation/release-verification.md` on prod as the verification member
`joshua.binswanger+vscn-walk@gmail.com` (uid `7eIGBkwVZdM2onwLmpyuQOSNkM03`, wizard done and
verified by Josh 2026-09-22, `moderationHidden: true` set by Claude over Firestore REST 22:07Z).
`release-walk.yml` is a reusable workflow; the merge workflow calls it after the acknowledgement
step **on `push` events only**. Design: `documentation/20260923-release-walk-automation.md`.

**Why:** the human walk had never been run on any environment — a step that depends on a person
does not happen. Prod's Turnstile is a real key and defeats a headless browser by design, so the
runner injects `self.FIREBASE_APPCHECK_DEBUG_TOKEN` via `addInitScript`; the SDK then exchanges
the debug token instead of calling the CustomProvider (`isDebugMode()` branch), enforcement
untouched. PROVEN 2026-09-22 22:15Z: a wrong-password probe against prod got "Invalid email or
password" from identitytoolkit, not an App Check refusal, and the SDK logged the injected token.
The token is registered on the prod web app as "release walk (CI)" and sits in
`C:\Users\Josh\.vscn\walk-appcheck-debug-token.txt`; GitHub secret writes are classifier-blocked
for Claude, so Josh pushes it into `WALK_APPCHECK_DEBUG_TOKEN` himself.

**How to apply:** the `push`-only gate is load-bearing — a walk dirties `rebuildQueue/site` and
`flushMemberRebuilds` dispatches the merge workflow as `workflow_dispatch`; a walk on that run
would loop the site every five minutes for ever. Two functions changes make the walk silent
(`onImageWentLive` skips hidden owners; `queueMemberRebuild` fingerprints inactive/hidden profiles
as absent, mirroring the export) and reach prod only with the next functions deploy. Per-run
plus-address accounts were rejected: they need Gmail access in CI, mail Josh a digest per run and
leave a publishable window. Known gap: the Turnstile mint function is not exercised. Not
configured: a dev walk (needs its own member). Related: [[release-verification-protocol]],
[[password-handling-boundary]] (the member's password never passed through Claude),
[[turnstile-app-check-provider]], [[merge-gate-must-read-exit-code]].
