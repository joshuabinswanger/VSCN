# Release log

One entry per verification run: date, released commit, project, machine verdict, walk, action.
`npm run verify:release -- --project prod|dev` prints the entry; whoever ran it pastes it here and
fills in the action. Newest first. How to read a verdict: [release-verification.md](release-verification.md).

Green entries are one line. The value is the history: slow drift shows up here as a pattern
rather than as a member's email.

## 2026-09-22 · d7e89c2 · dev · CI deploys the security rules now, and it took three tries to get there
Machine: GREEN — all eight probes, exit 0. Both rulesets were released at 19:58:12 by the staging workflow
         itself, the first automated rules deploy this project has had; probe 4 now covers seven grants.
Walk:    n/a (dev)
Action:  none. The release PR carries the same automation to main, so merging it deploys prod rules by itself.

         The three tries are the record worth keeping, and every one of them happened on dev rather than
         during a release:
         1. 403 on firebasestorage.defaultBucket.get — roles/firebaserules.admin does not cover resolving
            the bucket a storage ruleset release is named after. Granted roles/firebasestorage.viewer,
            read-only on purpose: the admin role can create and delete the default bucket.
         2. 404 from the same endpoint, which the CLI reports as Firebase Storage not being set up, on a
            project that plainly has it. As owner the endpoint returns a healthy bucket, so the resource is
            simply hidden from the deploy credential — a third permission to guess at, with no guarantee.
         3. Stopped asking instead. firebase.json lists storage as an array with a target and .firebaserc
            names the bucket per project, because prepare.js only resolves a default when the config is not
            an array. No lookup, no permission, and the bucket is a written fact rather than an API call.

## 2026-09-22 · 490b23b · dev · the fix proven: a functions deploy no longer revokes the acknowledger
Machine: targeted check, not a full run — redeployed `acknowledgeSitePublication` alone from dev's tip and read the
         invoker policy either side. The Hosting deployer's binding was present before and after, where the same
         deploy at 17:35 had erased it. The release for 490b23b then acknowledged normally.
Walk:    n/a (dev)
Action:  closed on dev. PR #60 carries the same one-file fix to main and is green; merging it is a prod release
         and is the gate on prod's functions deploy, because deploying prod functions from a commit that still
         says `invoker: "private"` would revoke prod's grant the same way

## 2026-09-22 · a472532 · dev · stage 1 closed
Machine: GREEN — all eight probes pass, exit 0. The first fully green run the protocol has produced.
Walk:    n/a (dev)
Action:  none

## 2026-09-22 · 265fd52 · dev · stage 1 of testing the protocol: fix the red, watch it go green
Machine: RED — functions deployed: GREEN, 30 of 30 after `firebase deploy --only functions -P dev` (the fix for the
         entries below); IAM grants: `roles/run.invoker` for the hosting deployer on `acknowledgeSitePublication`
         MISSING — the functions deploy reset the service's invoker policy to the code's `invoker: "private"`, wiping
         the hand-applied grant; build stamp: transient, dev moved to 265fd52 while the deploy ran
         Deploy needed three things the docs did not say: `FUNCTIONS_DISCOVERY_TIMEOUT=120`, dotenv values for
         `SMTP_HOST`/`SMTP_USER` (params with only a code default are refused non-interactively), and `--force`
         for `onImageWentLive`'s retry policy
Walk:    n/a (dev)
Action:  Josh re-grants the invoker on dev (classifier-blocked for Claude); durable fix is to declare the
         deployer in `functions/src/publication.ts` so the deploy applies the binding itself — prod loses the
         grant the same way on its next functions deploy

## 2026-09-22 · c85ae17 · dev
Machine: RED — functions deployed: unchanged from 51da312 below (three not deployed, ten stale); everything else green,
         including build stamp once the queued deploy landed — the first watched run was cancelled by the workflow's
         concurrency group, not failed
Walk:    n/a (dev)
Action:  pending — same functions deploy as below

## 2026-09-22 · 51da312 · dev
Machine: RED — functions deployed: `onImageWentLive`, `sendAdminDigest`, `adminListActions` not deployed;
         `onAuthUserCreated`/`onAuthUserDeleted` and the eight admin callables deployed 2026-09-15, source changed 2026-09-22
Walk:    n/a (dev)
Action:  pending — deploy functions to vscn-dev-f4b60 (`INFOMANIAK_SMTP_PASSWORD` is already bound), re-verify

## 2026-09-22 · 1e033a7 · prod
Machine: RED — functions deployed: `adminListActions` not deployed; the eight admin callables deployed 2026-09-15,
         source changed 2026-09-17 (PR #48 shipped the admin console UX pass through hosting only)
         WARN upload pairing: authorize 28 ok of 28 / complete 1 ok of 1 since 49d9be8 (2026-09-17) — the window
         spans the upload outage; the one completion is the first upload after the IAM grant, 14:08Z
         WARN stranded state: 19 expired permits and 19 `uploading` records from the 2026-09-22 morning retries,
         none past the 12 h sweep horizon — sweepImages ran 09:26Z with nothing old enough to clear
Walk:    not run (blocked on machine check)
Action:  pending, and deliberately held — the functions deploy that fixes this must wait for PR #60 to land on
         main, or it will revoke prod's release-acknowledgement grant on its way past (see the 490b23b entry)

## 2026-09-22 · 1e033a7 · prod · acceptance test against the 2026-09-14 → 2026-09-22T14:00Z window
Machine: RED — upload pairing: authorize 31 ok of 33 / complete 0 ok of 0 — the eight-day outage, reconstructed from the logs
         IAM grants: `roles/firebaserules.firestoreServiceAgent` had already been applied by hand earlier on
         2026-09-22, so probe 4 was tested with a bogus expected role instead: red, then the role removed
Walk:    n/a (acceptance test)
Action:  protocol accepted — it goes red against the known-broken state; first run of the protocol
