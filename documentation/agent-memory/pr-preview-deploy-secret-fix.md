> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/pr-preview-deploy-secret-fix.md` — readable by any Claude instance without access to Josh's user profile.
---
name: pr-preview-deploy-secret-fix
description: "PR preview deploys were dead since 2026-05-03 (deleted secret name); fix is COMMITTED as 115f979 on feature/user-content-backend but UNPUSHED and never exercised — verifying it needs a PR whose head branch carries the commit"
metadata:
  node_type: memory
  type: project
  originSessionId: a86d4f62-948a-47e1-8675-e14c75e1cd9e
  modified: 2026-09-01T00:00:00.000Z
---

Paused 2026-09-01 mid-verification. The fix is written and committed; nothing
is pushed and the workflow has never actually run green.

## What was broken

`.github/workflows/firebase-hosting-pull-request.yml` referenced
`secrets.FIREBASE_SERVICE_ACCOUNT_VSCN_39508`, which no longer exists. Empty
value → the action failed its own input validation before contacting Google:
`Error: Input required and not supplied: firebaseServiceAccount`.

Cause: the 2026-05-03 rename onto `FIREBASE_ADMIN_SERVICE_ACCOUNT` (commits
3269f6d and 0f43156) touched ONLY the merge workflow. Previews have been dead
since that date, not since the June run that surfaced it.

A second defect in the same file: the build step never set
`FIREBASE_SERVICE_ACCOUNT`, which `src/pages/[...lang]/community.astro` reads
at build time. It catches its own throw, so previews built "successfully" with
a community page of ZERO members. Merge and staging both set it; only the PR
workflow didn't. See [[dev-vs-prod-firestore-divergence]] for why an empty
community page is easy to misread as a data problem rather than a CI one.

## What is done

Commit `115f979` on `feature/user-content-backend`, one file, +2/-1:
- deploy step → `secrets.FIREBASE_ADMIN_SERVICE_ACCOUNT`
- build env gains `FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_ADMIN_SERVICE_ACCOUNT }}`

Committed with a pathspec so it carries none of the in-progress work described
in [[user-content-backend-status]] and [[uncommitted-tree-two-features]].

Verified: YAML parses; every `secrets.*` reference across all three workflows
now resolves to a secret that exists (only `GITHUB_TOKEN` is "missing", and
Actions injects that). NOT verified: an actual deploy.

## Why FIREBASE_ADMIN_SERVICE_ACCOUNT is the right account

Not assumed — that account performs `channelId: live` deploys to vscn-39508
today (merge run 33497872300 succeeded 2026-09-01). A preview channel is a
narrower write to the same site, so no new secret is needed. It also matches
the one-Admin-SDK-secret-per-environment pattern documented in
`documentation/20260526-dev-environment-and-staging-setup.md`.

## To resume

1. Verification needs a PR — `on: pull_request` cannot be triggered any other
   way (no `workflow_dispatch`). Key fact: for `pull_request` events GitHub
   runs the workflow file FROM THE PR HEAD, so the fix does NOT need to reach
   main first. The PR containing the fix is the PR that tests it.
2. Base `main`; head must be a same-repo branch containing 115f979 (line 12's
   `if:` guard rejects forks). For an isolated test, cherry-pick 115f979 onto
   a branch off main rather than opening a PR from feature/user-content-backend,
   which would drag the backend work into review.
3. Success looks like: deploy step posts a preview URL comment, AND the build
   log no longer contains `[community] Failed to fetch members`.
4. Still open, my call left to Josh: the repo secret `FIREBASE_SERVICE_ACCOUNT`
   (2026-04-26) is referenced by NOTHING and can be deleted in the GitHub UI.
   It is a third, older generation — not the predecessor of either current
   secret. Do not confuse it with the LOCAL env var of the same name in
   `.env`, which community.astro and the scripts genuinely use.

## Trap worth remembering

If sign-in fails on a preview URL, that is not this fix regressing — preview
channel domains are not auto-added to Firebase Auth authorized domains unless
the deploying account holds Firebase Authentication Admin. Console setting,
not a workflow bug.

This session was handed an empty, unregistered worktree at
`.claude/worktrees/priceless-dijkstra-3d7fdf`; all work happened in
`D:/SynoDrive/VSCN/repo` on feature/user-content-backend.
