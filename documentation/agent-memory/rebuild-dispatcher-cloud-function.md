---
# Mirror of ~/.claude/projects/D--SynoDrive-VSCN-repo/memory/rebuild-dispatcher-cloud-function.md
name: rebuild-dispatcher-cloud-function
description: "requestRebuild Cloud Function is deployed to prod and dev; the leaked PUBLIC_GITHUB_REBUILD_TOKEN is fully revoked and purged — this work is CLOSED as of 2026-09-01"
metadata:
  type: project
---

The GitHub workflow-dispatch token that used to ship inside the client bundle
(`PUBLIC_GITHUB_REBUILD_TOKEN`, inlined by Astro into the served JS) is dealt with.
Closed 2026-09-01. Do not re-open this as an outstanding risk.

**Final state:**

- `requestRebuild` (firebase-functions v2 callable, us-central1) is DEPLOYED on prod
  `vscn-39508` and dev `vscn-dev-f4b60`. Rejects unauthenticated callers; holds the
  token as Secret Manager secret `GITHUB_REBUILD_TOKEN`.
- Prod is bound to secret **version 2** — a fine-grained PAT named `vscn-rebuild-prod`
  (Actions: Read and write, VSCN only, expires 2026-11-30). Version 1 was destroyed
  during the rotation.
- Dev uses its own secret in its own project, PAT `vscn-rebuild-dev`, same scope and
  expiry. The user declined to rotate it despite its value passing through a chat
  transcript; it is dev-only and self-expires. Do not nag about this.
- The leaked PAT (named "Rebuild Community Page") is REVOKED on GitHub.
- Actions secrets `PUBLIC_GITHUB_REBUILD_TOKEN`, `PUBLIC_GITHUB_OWNER`,
  `PUBLIC_GITHUB_REPO` and the unreferenced `FIREBASE_TOKEN` are deleted.
- No literal token value was ever committed — `git log -S` over all history finds only
  the variable name, and a PAT-prefix scan of every diff returns zero hits. No history
  rewrite was needed or done.

**Verified working**, 2026-09-01 10:31:42: a prod profile save logged
`{"message":"Rebuild dispatched","uid":"…"}` with a matching successful
`Deploy to Firebase Hosting on merge` run in the same second.

**Still open (spun off as separate tasks):** the expired PAT "VSCN - firebase function"
= Secret Manager `GITHUB_PAT` version 2, still bound to the deployed `onUserCreated`,
whose source exists in no branch — recoverable from `git show ce0d973:functions/src/index.ts`.
Also `firebase-hosting-pull-request.yml` line 33 references the nonexistent secret
`FIREBASE_SERVICE_ACCOUNT_VSCN_39508`, so PR previews have failed since June 2026.

Related: [[rebuild-target-per-project]], [[user-content-backend-status]].
