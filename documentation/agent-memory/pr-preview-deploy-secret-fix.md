> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/pr-preview-deploy-secret-fix.md` memory file; keep the two in sync.

---
name: pr-preview-deploy-secret-fix
description: "CLOSED 2026-09-07: PR previews proven working by PR #2 (run 34098880706) — preview URL posted, members present in the build; a preview's build-commit stamp is the ephemeral refs/pull/N/merge SHA and resolves to nothing in the repo"
metadata:
  node_type: memory
  type: project
  originSessionId: a86d4f62-948a-47e1-8675-e14c75e1cd9e
  modified: 2026-09-07T08:09:05.571Z
---

**CLOSED 2026-09-07.** Previews were dead from 2026-05-03 to 2026-09-07. The fix
(`115f979`, in `main` since the 09-06 release) is now *proven*, not just written:
draft PR joshuabinswanger/VSCN#2, run `34098880706`, `build_and_preview` green in
41s.

Both halves verified on the same run:

- deploy step posted a preview channel URL comment
  (`vscn-39508--pr2-ci-prove-pr-preview-…web.app`, 7-day expiry)
- **no** `[community] Failed to fetch members` in the build log, and the served
  page carries 24 member links with `/members/<slug>/` pages built for both
  locales — so the build step's `FIREBASE_SERVICE_ACCOUNT` is reaching
  `community.astro`. That was the silent half: previews used to build a
  member-less community page and still report success.

## What was broken (kept — the shape recurs)

`.github/workflows/firebase-hosting-pull-request.yml` referenced
`secrets.FIREBASE_SERVICE_ACCOUNT_VSCN_39508`, deleted in the 2026-05-03 rename
onto `FIREBASE_ADMIN_SERVICE_ACCOUNT` (`3269f6d`, `0f43156`) which touched ONLY
the merge workflow. Empty value → the action failed its own input validation
before contacting Google: `Error: Input required and not supplied:
firebaseServiceAccount`. Three workflows, one rename, one file forgotten.

## New trap: a preview's build stamp resolves to nothing

`/community` on the preview stamped `build-commit 2df7b92` — which is not a
commit in this repository. For `pull_request` events GitHub checks out
`refs/pull/N/merge`, an ephemeral merge of the head into the base, so
`src/lib/buildInfo.ts` records that SHA. The CLAUDE.md "which snapshot am I
looking at" technique therefore identifies a *preview* build only by its
timestamp; `git ls-remote origin 'refs/pull/N/*'` is what maps the stamp back to
a real head commit. Same event property is why the fix did not need to reach
main first: the workflow file runs from the PR head.

## Still open, Josh's call

The repo secret `FIREBASE_SERVICE_ACCOUNT` (2026-04-26) is referenced by nothing
and can be deleted in the GitHub UI — a third, older generation, not the
predecessor of either current secret. Do not confuse it with the LOCAL env var
of the same name in `.env`, which `community.astro` and the scripts genuinely
use.

## Trap that still stands

If sign-in fails on a preview URL, that is not this fix regressing — preview
channel domains are not auto-added to Firebase Auth authorized domains unless
the deploying account holds Firebase Authentication Admin. Console setting, not
a workflow bug. Untested on PR #2; nobody signed in.

PR #2's payload is unrelated to the fix: a `vscn-preview` launch config salvaged
from `claude/design-notes-20260904`'s `81024a5` before that branch was deleted
([[stale-branches-superseded]]). It exists because `on: pull_request` has no
`workflow_dispatch` — a PR is the only trigger there is.
