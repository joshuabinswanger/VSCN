---
# Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/rebuild-dispatcher-cloud-function.md
name: rebuild-dispatcher-cloud-function
description: "CLOSED 2026-09-01 — requestRebuild deployed and proven on prod and dev, leaked token revoked, stale secret versions destroyed; do not re-open"
metadata:
  type: project
---

The GitHub workflow-dispatch token that used to ship inside the client bundle
(`PUBLIC_GITHUB_REBUILD_TOKEN`, inlined by Astro into the served JS) is dealt with.
Do not re-open the leak itself as an outstanding risk.

**Verified live 2026-09-01 (measured, not assumed):**

- `requestRebuild` (firebase-functions v2 callable, us-central1, nodejs22) is the ONLY
  function deployed on prod `vscn-39508` and dev `vscn-dev-f4b60`. Rejects
  unauthenticated callers; token comes from Secret Manager.
- Prod is bound to `GITHUB_REBUILD_TOKEN` **version 2** and carries no workflow/ref
  overrides, so it dispatches `firebase-hosting-merge.yml` on `main`.
- Dev is bound to its own project's secret version 1 and its deployed env really does
  carry `GITHUB_WORKFLOW=firebase-hosting-staging.yml` + `GITHUB_REF=dev`, so a staging
  save cannot dispatch a production deploy.
- End-to-end proven: successful `workflow_dispatch` runs on staging (10:00) and merge
  (10:31) on 2026-09-01.
- Actions secrets `PUBLIC_GITHUB_*` are gone from the repo. No literal token value is
  in git history.

**Correction — an earlier version of this note was wrong on two points:**

1. It claimed prod `GITHUB_REBUILD_TOKEN` version 1 was destroyed during the rotation.
   At the time that was false — v1 (created 2026-08-28, the mistyped PAT whose value
   passed through a chat transcript) was still enabled, and was only actually destroyed
   on 2026-09-01. Nothing is bound to v1, so it is dead
   weight rather than a live path, because that PAT is REVOKED at GitHub — Josh
   confirmed on 2026-09-01 that both it and the original leaked token are revoked.
   Destroying the version is housekeeping, not risk. Do not re-raise revocation.
2. It described `onUserCreated` as still deployed and bound to `GITHUB_PAT`. It is
   **gone** — the functions-codebase deploy removed it. No regression: it dispatched
   `deploy.yml`, a workflow deleted from the repo long ago, using an expired PAT, so it
   had been dead code. `GITHUB_PAT` is now an orphaned prod secret (v1 enabled,
   v2 destroyed) and can be deleted.

**Pushed 2026-09-01, verified level with upstream.** `e96a024` (the per-project
workflow/ref params, which the deployed dev function already runs) and `115f979` (points
the PR preview deploy at `FIREBASE_ADMIN_SERVICE_ACCOUNT`) are both on
`origin/feature/user-content-backend`. The dev function can no longer regress to
prod-dispatching on a redeploy from a pushed branch. The PR-preview fix is on the remote
but still unproven — only opening a PR exercises it.

**Housekeeping finished 2026-09-01, verified:** prod `GITHUB_REBUILD_TOKEN` version 1 is
`destroyed` (only v2, the bound one, remains enabled) and the orphaned `GITHUB_PAT` secret
is deleted — prod now holds only `FIREBASE_SERVICE_ACCOUNT`, `GITHUB_REBUILD_TOKEN` and the
App Hosting OAuth secret. Function still `Ready: True` afterwards. Both gcloud commands
needed `--quiet`; without it they prompt, and a Run-button shell with no stdin aborts them
silently while looking like it worked. Remember that for any future `gcloud secrets` step.

The dispatcher itself reached `origin/main` as the squashed `678b5fb`; this branch
carries the same work as its own `ec529dd`, which is why `main` is not its ancestor.

Related: [[rebuild-target-per-project]], [[user-content-backend-status]],
[[pr-preview-deploy-secret-fix]].
