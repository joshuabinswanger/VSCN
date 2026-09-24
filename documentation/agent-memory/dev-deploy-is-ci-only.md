> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/dev-deploy-is-ci-only.md` memory file; keep the two in sync.

---
name: dev-deploy-is-ci-only
description: "Since the 2026-09-15 security release, dev deploys ONLY through CI on a merge into dev; the local `.env.development` credential no longer works, so `npm run deploy:dev` dies at the site-data export, and the PR merge is mine to make — see merge-into-dev-without-asking"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5ca418f4-69bf-4921-b81c-5d6976b3df9a
  modified: 2026-09-17T19:00:02.226Z
---

**The local dev deploy is dead, and it dies at step one.** `npm run deploy:dev` is now
`export-site-data development && build:site --mode development && firebase deploy`. The
export authenticates with the service-account credential in `.env.development`, and that
credential was revoked by the security release (PR #36, `codex/audit-release-20260915`).
The error is `16 UNAUTHENTICATED: Request had invalid authentication credentials`, which
reads like a clock or token problem but is a revoked key. The same stale `.env.development`
sits in `repo/`, so every worktree copied from it inherits the dead credential.

**Why:** the audit moved builds onto Workload Identity. `firebase-hosting-staging.yml` runs
on every push to `dev` (restored 2026-09-07): verify → export → build → deploy, each under
its own CI identity. Nothing local holds any of them.

**How to apply (2026-09-17, PR #40):**
- "Deploy to dev" now means **merge into dev**; CI does the rest. Watch it with
  `gh run list --workflow "Deploy to Firebase Hosting Staging"`.
- `dev` is unprotected. Merge the PR myself once it is green — Josh's preference since
  2026-09-17 is [[merge-into-dev-without-asking]]. The permission layer refused the merge
  twice on the morning of 2026-09-17; that was the tool, not Josh, and PR #42 went through
  cleanly the same evening.
- A dev build cannot be run locally until `.env.development` gets a live credential.
- Verifying `/profile` changes without a login: fetch `/profile` from the dev server, adopt
  its `<style>`/`<link>` tags and the `template[data-gallery-tpl="item"]` into another page,
  wrap the clone in a `form.profile-form.is-loaded` — `.profile-form` is `display:none`
  until `is-loaded`, and the signed-out `/profile` itself navigates away to `/` before
  anything can be measured.

Related: [[deploy-dev-needs-development-mode]] (the `--mode development` half is still
true — it now lives inside `deploy:dev` and the CI job), [[rebuild-dispatcher-cloud-function]]
(the first key purge), [[concurrent-session-stash-hazard]] (why this ran in a worktree:
`repo/` held 94 files of someone else's uncommitted work).
