# Release log

One entry per verification run: date, released commit, project, machine verdict, walk, action.
`npm run verify:release -- --project prod|dev` prints the entry; whoever ran it pastes it here and
fills in the action. Newest first. How to read a verdict: [release-verification.md](release-verification.md).

Green entries are one line. The value is the history: slow drift shows up here as a pattern
rather than as a member's email.

## 2026-09-23 · f21a60f · prod · the digest delivers
Machine: not re-run; sendAdminDigest alone redeployed by Josh at 07:39Z, now bound to
         INFOMANIAK_SMTP_PASSWORD@3 (written from the DPAPI credential file, no trailing newline).
Walk:    n/a (functions only)
Action:  none. 07:45:07Z "Admin digest sent", the first delivery on prod, carrying a member's 07:28
         upload. The new version alone had changed nothing: the 07:35 tick still ran on @1 and failed,
         because Functions pin the secret version at deploy. Dev binds @2 since 07:28Z and waits for a
         real event to prove it.

## 2026-09-23 · c07fc9a · dev · the release walk merged
Machine: GREEN after a fix, one warning. First run RED on functions deployed: the four functions the walk
         PR changed (flushMemberRebuilds, onImageWritten, onImageWentLive, sendAdminDigest) were stale.
         Deployed those four to dev by name; re-run 30 of 30 current.
         WARN function errors: 12 × "Admin digest not sent", every one "535 5.7.0 Invalid login or
         password" from Infomaniak. The operator digest has NEVER delivered on either project: prod shows
         the same refusal on every tick since its first event at 2026-09-22T22:05Z, dev since 20:03Z.
         INFOMANIAK_SMTP_PASSWORD holds one enabled version on each, so probe 5 passes; the value is wrong.
Walk:    n/a (dev)
Action:  Josh replaces INFOMANIAK_SMTP_PASSWORD on both projects with the password that logs in as
         info@vscn.ch (Claude does not handle it). Probe 7 is the only thing that saw this.

## 2026-09-23 · f21a60f · prod · the first walk, by Playwright
Machine: not re-run; the f21a60f entry below stands
Walk:    GREEN — all six steps on vscn-39508.web.app as the verification member, CI run 35828595679
         from branch chore/release-walk; about 30 s end to end. The member was left clean: both
         galleries empty, the one image record pendingDeletion for the sweep, its caption proving the
         save reached it. The first attempt walked vscn.ch and got a 403 from Cloudflare's bot
         challenge before the site was reached, which is why CI walks the Hosting origin.
Action:  none. The walk half of the protocol has now run once on prod, where before it never had.

## 2026-09-22 · f21a60f · prod · the release
Machine: GREEN, exit 0. Six passing, two warnings, both of them the upload outage still inside the lookback:
         upload pairing 24 authorised / 1 completed since the 2026-09-18 release, and 23 expired permits with
         23 uploading records left from the morning retries. Neither is new; the pairing clears when the next
         release moves the window, the residue when sweepImages next passes its six-hour cutoff.
         Both rulesets were published at 20:10 by the merge workflow itself — prod rules deployed by CI for
         the first time, ahead of Hosting, and the acknowledgement step closed the release normally.
         Prod functions were deployed by hand beforehand (30 of 30 current) and the run.invoker grant on
         acknowledgeSitePublication SURVIVED that deploy, where the same deploy erased it on dev this
         afternoon — the publication fix doing its job on prod.
Walk:    pending — the verification member does not exist yet
Action:  none outstanding on the machine half. PR #60 closed as superseded: this release carried the same fix.
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
