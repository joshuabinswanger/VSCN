---
# Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/rebuild-dispatcher-cloud-function.md
name: rebuild-dispatcher-cloud-function
description: "GitHub rebuild token moved out of the client bundle into a requestRebuild Cloud Function; old token is BURNED and must be revoked, function not yet deployed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2fd991b3-8890-4c90-94a0-3e66aa4659cc
  modified: 2026-08-28T12:01:49.125Z
---

The GitHub workflow-dispatch token used to ship inside the client bundle
(`PUBLIC_GITHUB_REBUILD_TOKEN`, inlined by Astro — extractable by any visitor of the
prod site). On 2026-08-28 it was replaced with a server-side dispatcher:

- `functions/src/index.ts` — `requestRebuild` callable (firebase-functions v2, default
  region us-central1). Rejects unauthenticated callers, holds the token as Secret
  Manager secret `GITHUB_REBUILD_TOKEN`, dispatches `firebase-hosting-merge.yml` on
  `main`. Owner/repo are non-secret params in the committed `functions/.env`.
- Client `triggerRebuild()` in `src/lib/profile.ts` now calls it via `httpsCallable`
  using the new `functions` export in `src/lib/firebase.ts`. Still never throws.
- Root `.env` vars renamed `PUBLIC_GITHUB_*` → `GITHUB_*` (token value kept only as a
  reference for the secrets:set step). `.env.example` and the merge workflow updated.

**Why:** any visitor could extract a token with workflow-dispatch rights on the site repo.

**How to apply — manual steps still open (per project: prod `vscn-39508` = `-P default`,
dev `vscn-dev-f4b60` = `-P dev`):**

1. **Revoke the old token first** — it was public in the prod bundle, rotating is not
   optional. Mint a fine-grained replacement scoped to the VSCN repo, Actions read/write.
2. `npx -y firebase-tools@latest functions:secrets:set GITHUB_REBUILD_TOKEN -P default` (and `-P dev`).
3. `npx -y firebase-tools@latest deploy --only functions -P default` (and `-P dev`).
   First functions deploy needs the Blaze plan and enables Cloud Build/Artifact Registry.
4. Delete the now-unused `PUBLIC_GITHUB_*` GitHub Actions secrets.

Until step 3 lands, profile saves still work but the rebuild dispatch silently no-ops
(same staleness as before the change, not worse). Related: [[user-content-backend-status]],
[[uncommitted-tree-two-features]].

**Update 2026-08-28 (evening):** the dispatcher was lifted onto `feat/scientist-signup`
as `678b5fb` (functions/, firebase.json codebase, workflow secrets removed, profile.ts
callable rewrite, `!functions/.env` gitignore exception). Step 2 is DONE for prod: the
replacement fine-grained PAT is Secret Manager secret `GITHUB_REBUILD_TOKEN` version 1
on `vscn-39508`. Still open: push `678b5fb`, `deploy --only functions -P default`
(classifier-blocked for Claude; first deploy needs Blaze), the `-P dev` pair of both
steps, deleting the `PUBLIC_GITHUB_*` Actions secrets, and revoking the old token +
the first mistyped PAT from the 2026-08-28 chat.
