# Backend deploy identity and rollback — 28 September 2026

Since `codex/release-readiness-20260928` the Hosting workflows deploy Functions before they export, render and publish. This note covers what that job needs, when it runs, and how to back out a release.

*Status as of 2026-09-29:* the identities described here exist and have deployed (dev run 36481093216, prod run 36491067157), and the **Rollback** section below was rewritten because its first version was unsound: a console Hosting rollback does not hold. Read that section before relying on it.

## When the backend job deploys

| Event | What the `backend` job does |
| --- | --- |
| `push` (a merged PR: a release on `main`, an integration on `dev`) | Deploys Functions, always. |
| `workflow_dispatch` (member-triggered rebuilds from `flushMemberRebuilds`: at most one a minute since #150, and only when a visible member's change is queued; on prod that was nine dispatches between 2026-09-23 13:05Z and 2026-09-29 09:03Z) | Runs `scripts/backend-current.mjs`: when every export already carries this commit's source digest, it skips the deploy. Otherwise, e.g. after a release whose backend deploy failed, it deploys. If it can't read the deployed state, it deploys. |

Production is **fail-closed**: without `PROD_FUNCTIONS_WIF_PROVIDER` and `PROD_FUNCTIONS_SERVICE_ACCOUNT` the run stops and nothing publishes. Staging was **soft** while `DEV_FUNCTIONS_*` were unset (decided 2026-09-28). Both dev variables have been set since 2026-09-28 20:29Z, so staging now deploys dev Functions from CI like production does (first run under the identity: 36481093216; also 36548031669 and 36551493037). The soft branch in `firebase-hosting-staging.yml` (warn, let Hosting proceed, deploy by hand, let `node scripts/verify-release.mjs --project dev` report drift) is dormant code that only matters again if those variables are removed. Production has been fail-closed since the `PROD_FUNCTIONS_*` variables were set (2026-09-28 20:58Z).

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

**The backend rolls forward. Hosting can be rolled back in the console, but only while nothing republishes, and by default something does within a minute.**

### Why the console rollback does not hold

Rolling Hosting back in the Firebase console (Hosting, release history, Rollback) moves the live site to an older release. It does not change `main`. The production workflow, `firebase-hosting-merge.yml`, builds and deploys **the tip of `main`**, and it runs on two triggers:

- a push to `main` (a release), and
- a `workflow_dispatch` from `flushMemberRebuilds`, which runs every minute and dispatches the workflow on `ref: main` whenever `rebuildQueue/site` is dirty and no earlier dispatch is still leased (`functions/src/rebuildQueue.ts`, `functions/src/rebuild.ts`). The queue goes dirty when a **visible** member saves anything that changes what the site would show: profile, an image, a project. Hidden or inactive members queue nothing, which is why the release walk does not.

So after a console rollback, the next visible member save publishes `main`'s tip over the rolled-back release, within about a minute, with no warning. How often that happens depends on the members: nine dispatches on prod in the six days to 2026-09-29 09:03Z, but there is no floor, and one save is all it takes. A run dispatched before you rolled back can also land after it (a dispatch holds a 15-minute lease), so look for one first.

**There is no pause switch in the repository.** No variable, gate or workflow input stops the dispatch (searched `.github/workflows`, `functions/src/rebuild*.ts` and `scripts`). The safe, durable path is a revert PR into `main`, which makes the tip itself the rolled-back code. If the console rollback is used to buy time first, hold the dispatches by hand, before rolling back:

1. Look for a run in flight and let it finish or cancel it: `gh run list --repo joshuabinswanger/VSCN --workflow firebase-hosting-merge.yml --status in_progress`, then `gh run cancel <id>` if needed.
2. Pause the scheduled flush. Its Cloud Scheduler job exists on prod as `firebase-schedule-flushMemberRebuilds-us-central1` (region `us-central1`, checked 2026-09-29, state ENABLED):
   `gcloud scheduler jobs pause firebase-schedule-flushMemberRebuilds-us-central1 --project vscn-39508 --location us-central1`
   and later `gcloud scheduler jobs resume` with the same arguments. Members' saves still write and still queue; nothing publishes until the job resumes, so the site falls behind their work for as long as it is paused.
3. Roll Hosting back in the console.

Not rehearsed. The job name and the pause and resume subcommands were checked against the live project and `gcloud scheduler jobs pause --help`, but the pause itself has not been run, and whether a later Functions deploy (any push to `main` deploys them) leaves a paused job paused is not known. Look at `gcloud scheduler jobs list --project vscn-39508 --location us-central1` after any push. A push to `main` also redeploys Hosting from the tip, which ends the rollback whatever the job is doing. An alternative is `gh workflow disable firebase-hosting-merge.yml` (and `gh workflow enable` afterwards), which also stops release pushes; how GitHub answers a dispatch to a disabled workflow is untested, and `flushMemberRebuilds` treats any refusal as a failed dispatch and retries it every minute. Rehearse either on dev (`vscn-dev-f4b60`, workflow `firebase-hosting-staging.yml`) before an incident needs it.

### Rules

Security rules are not part of a Hosting rollback. The deploy job publishes `firestore.rules` and `storage.rules` from the tip on **every** run, ahead of Hosting. So the console cannot roll them back (the next run republishes the tip's), and reverting them means a PR into `main` that restores the files.

Rules did change in the 80f5850 release: `git diff f21a60f 80f5850 -- firestore.rules` is +153/-11 (f21a60f, on 2026-09-22, was the first production release whose rules CI deployed). The changes read as widening: new allowed fields (`roleDe`, `bioDe`, embeds), a `projects` collection, the gallery cap 8 to 12, and new image-tag and project limits. An older frontend writes only what the older allowlists accepted, so it should still work against them; that is a reading of the diff, not a test, and one removed line (`onboardingComplete is bool`) was not traced to a tightening or a move. The first version of this note said "No rules changed in this release", which was true only against the review baseline `241c3d8`.

### Functions

The backend rolls forward: fix forward with a new push. **A revert PR does not roll the backend back by itself, and it can halt publishing.** The reverted source lacks the functions the release added (`resolveEmbed`, `restoreAutoPoster`, `adminRetryNotice`, `getPublicationStatus`), and `firebase deploy --only functions --non-interactive` refuses to delete functions without `--force`. The push's backend job therefore fails, the export, render and deploy jobs behind it are skipped, and every later member-triggered dispatch fails at the same step, because `scripts/backend-current.mjs` finds the deployed digest different from the source's and tries the same deploy. Until the functions are deleted by hand (`firebase functions:delete <name> --project <project>`, after reading what the revert removes) or a fix rolls forward, nothing publishes, member saves included.

The previous frontend works against the newer backend: every callable already required a signed-in member, the new ones also require App Check, and the previous frontend already sent App Check tokens on every page with a site key. The four callables the previous frontend doesn't know simply go unused.

A failed backend job can also leave a **mixed backend**: some functions new, some old. Hosting doesn't deploy in that state. `verify-release` lists every function whose digest disagrees. Rerun the job, or fix forward.
