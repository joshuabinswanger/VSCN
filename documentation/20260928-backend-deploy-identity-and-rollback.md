# Backend deploy identity and rollback — 28 September 2026

Since `codex/release-readiness-20260928` the Hosting workflows deploy Functions before they export, render and publish. This note covers what that job needs, when it runs, and how to back out a release.

## When the backend job deploys

| Event | What the `backend` job does |
| --- | --- |
| `push` (a merged PR: a release on `main`, an integration on `dev`) | Deploys Functions, always. |
| `workflow_dispatch` (member-triggered rebuilds from `flushMemberRebuilds`, several an hour) | Runs `scripts/backend-current.mjs`: when every export already carries this commit's source digest, it skips the deploy. Otherwise, e.g. after a release whose backend deploy failed, it deploys. If it can't read the deployed state, it deploys. |

Production is **fail-closed**: without `PROD_FUNCTIONS_WIF_PROVIDER` and `PROD_FUNCTIONS_SERVICE_ACCOUNT` the run stops and nothing publishes. Staging is **soft** while `DEV_FUNCTIONS_*` are unset (decided 2026-09-28). The job warns, Hosting proceeds, dev Functions are deployed by hand from the merged tree, and `node scripts/verify-release.mjs --project dev` reports drift.

## The deploy identity

A dedicated service account per project, `vscn-functions-deployer@<project>.iam.gserviceaccount.com`, created 2026-09-28 in both. It is impersonated through the Hosting deployer's existing Workload Identity provider (`vscn-hosting-deploy/github-main` on prod, `vscn-hosting-deploy/github-dev` on dev), whose attribute condition already admits only this repository and only that environment's branch. `workflow_dispatch` runs on that ref too, so the same condition covers them. The provider is shared; the account is not. Do not reuse or widen `vscn-build-reader` or `vscn-hosting-deployer`.

The repository variables point at them: `PROD_FUNCTIONS_WIF_PROVIDER` / `PROD_FUNCTIONS_SERVICE_ACCOUNT` and `DEV_FUNCTIONS_WIF_PROVIDER` / `DEV_FUNCTIONS_SERVICE_ACCOUNT`.

What `firebase deploy --only functions` does on this codebase, and so what the identity must be allowed to do. **Proven 2026-09-28:** dev's first deploy under the identity (run 36481093216, `d82f9b6`) updated all 34 functions with exactly this list. `verify-release` probe 4 checks every grant below, and flags a project-wide `serviceAccountUser` or `secretmanager.admin` on this account as forbidden.

- Create and update gen-2 and gen-1 functions, and set their IAM policies. The callables are public invokers, and `acknowledgeSitePublication` declares its invoker (memory note `publication-invoker-is-declared`), so a role without `setIamPolicy` ends in a deploy that fails half-way. That means Cloud Functions Admin, plus Cloud Run Admin for the gen-2 services.
- Act as the two runtime service accounts: `<number>-compute@developer.gserviceaccount.com` for the gen-2 functions and `<project>@appspot.gserviceaccount.com` for the two gen-1 Auth triggers. Service Account User, granted on those two accounts only, never project-wide.
- Scheduler jobs for the `onSchedule` functions (Cloud Scheduler Admin), and Eventarc triggers for the Firestore-triggered ones (Eventarc Admin).
- Secret bindings: the CLI checks each declared secret's versions and grants the runtime account access. Granted as Secret Manager Viewer on the project plus Secret Manager Admin on the four declared secrets only (`TURNSTILE_SECRET_KEY`, `INFOMANIAK_SMTP_PASSWORD`, `ADMIN_NOTIFY_TO`, `GITHUB_REBUILD_TOKEN`), so it cannot touch `FIREBASE_SERVICE_ACCOUNT` or any other secret.
- Read the project and its enabled APIs: Firebase Viewer and Service Usage Consumer.
- Artifact Registry: the CLI inspects the `gcf-artifacts` repository's cleanup policy.

The same grants are recorded in the `EXPECTED` table in `scripts/verify-release.mjs`. A grant added here and not there is invisible to the release check.

## Rollback

**The backend rolls forward; Hosting rolls back.**

- **Frontend problem:** roll Hosting back to the previous release in the Firebase console (Hosting → release history → Rollback). The new backend serves the previous frontend unchanged. Every callable already required a signed-in member; the new ones also require App Check, and the previous frontend already sends App Check tokens on every page with a site key. The four callables the previous frontend doesn't know (`resolveEmbed`, `restoreAutoPoster`, `adminRetryNotice`, `getPublicationStatus`) simply go unused. No rules changed in this release.
- **Backend problem:** fix forward with a new push. **A revert PR does not roll the backend back by itself.** The reverted source lacks those four functions, and `firebase deploy --non-interactive` refuses to delete functions without `--force`, so the revert's backend job stops before Hosting. Delete them by hand first (`firebase functions:delete <name> --project <project>`), after reading what the revert removes.
- A failed backend job can leave a **mixed backend**: some functions new, some old. Hosting doesn't deploy in that state. `verify-release` lists every function whose digest disagrees. Rerun the job, or fix forward.
