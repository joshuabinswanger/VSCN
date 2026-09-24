> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/release-walk-automation.md` memory file; keep the two in sync.

---
name: release-walk-automation
description: "PROVEN 2026-09-23: first CI walk GREEN on prod, all six steps, ~30 s. Playwright walks as a standing hidden member after every release to main; Turnstile skipped via a registered App Check debug token; CI must walk vscn-39508.web.app because Cloudflare challenges GitHub runners on vscn.ch"
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

**Cloudflare trap:** vscn.ch is Cloudflare-proxied and its bot protection answers GitHub's
datacenter IPs with a 403 "Just a moment..." page before the site is reached (first CI walk). CI
therefore passes `--origin https://vscn-39508.web.app` — same Hosting release, authorised Auth
domain. Local runs still walk vscn.ch. First GREEN: run 35828595679; member left clean (galleries
empty, image record `pendingDeletion`). Secrets all set by Josh 2026-09-23.

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
