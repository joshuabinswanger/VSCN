# Backend deploy identity and rollback — 28 September 2026

Since `codex/release-readiness-20260928` the Hosting workflows deploy Functions before they export, render and publish. This note covers what that job needs, when it runs, and how to back out a release.

## When the backend job deploys

| Event | What the `backend` job does |
| --- | --- |
| `push` (a merged PR: a release on `main`, an integration on `dev`) | Deploys Functions, always. |
| `workflow_dispatch` (member-triggered rebuilds from `flushMemberRebuilds`, several an hour) | Runs `scripts/backend-current.mjs`: when every export already carries this commit's source digest, it skips the deploy. Otherwise, e.g. after a release whose backend deploy failed, it deploys. If it can't read the deployed state, it deploys. |

Production is **fail-closed**: without `PROD_FUNCTIONS_WIF_PROVIDER` and `PROD_FUNCTIONS_SERVICE_ACCOUNT` the run stops and nothing publishes. Staging is **soft** while `DEV_FUNCTIONS_*` are unset (decided 2026-09-28). The job warns, Hosting proceeds, dev Functions are deployed by hand from the merged tree, and `node scripts/verify-release.mjs --project dev` reports drift.

## The deploy identity

A dedicated service account per project (for example `vscn-functions-deployer@<project>.iam.gserviceaccount.com`), impersonated through a Workload Identity provider whose attribute condition admits only this repository, and only its `main` ref for prod or its `dev` ref for dev. `workflow_dispatch` runs on that ref too, so the same condition covers them. Do not reuse or widen `vscn-build-reader` or `vscn-hosting-deployer`.

What `firebase deploy --only functions` does on this codebase, and so what the identity must be allowed to do. **This is a starting list, not a proven one: the first dev deploy under the identity is the proof, and `verify-release` does not yet check these grants.**

- Create and update gen-2 and gen-1 functions, and set their IAM policies. The callables are public invokers, and `acknowledgeSitePublication` declares its invoker (memory note `publication-invoker-is-declared`), so a role without `setIamPolicy` ends in a deploy that fails half-way. That means Cloud Functions Admin, plus Cloud Run Admin for the gen-2 services.
- Act as the runtime service account (`<number>-compute@developer.gserviceaccount.com`): Service Account User, granted on that account only.
- Scheduler jobs for the `onSchedule` functions (Cloud Scheduler Admin), and Eventarc triggers for the Firestore-triggered ones (Eventarc Admin).
- Secret bindings: the CLI checks each declared secret's versions and grants the runtime account access. That requires Secret Manager Admin, or Viewer plus `setIamPolicy` on those four secrets.
- Read the project and its enabled APIs: Firebase Viewer and Service Usage Consumer.
- Artifact Registry: the CLI inspects the `gcf-artifacts` repository's cleanup policy.

After the first run, add the granted roles to the `EXPECTED` table in `scripts/verify-release.mjs`, so drift in them is caught like the existing grants.

## Rollback

**The backend rolls forward; Hosting rolls back.**

- **Frontend problem:** roll Hosting back to the previous release in the Firebase console (Hosting → release history → Rollback). The new backend serves the previous frontend unchanged. Every callable already required a signed-in member; the new ones also require App Check, and the previous frontend already sends App Check tokens on every page with a site key. The four callables the previous frontend doesn't know (`resolveEmbed`, `restoreAutoPoster`, `adminRetryNotice`, `getPublicationStatus`) simply go unused. No rules changed in this release.
- **Backend problem:** fix forward with a new push. **A revert PR does not roll the backend back by itself.** The reverted source lacks those four functions, and `firebase deploy --non-interactive` refuses to delete functions without `--force`, so the revert's backend job stops before Hosting. Delete them by hand first (`firebase functions:delete <name> --project <project>`), after reading what the revert removes.
- A failed backend job can leave a **mixed backend**: some functions new, some old. Hosting doesn't deploy in that state. `verify-release` lists every function whose digest disagrees. Rerun the job, or fix forward.
