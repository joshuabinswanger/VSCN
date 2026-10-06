# Release log

One entry per verification run: date, released commit, project, machine verdict, walk, action.
`npm run verify:release -- --project prod|dev` prints the entry; whoever ran it pastes it here and
fills in the action. Newest first. How to read a verdict: [release-verification.md](release-verification.md).

Green entries are one line. The value is the history: slow drift shows up here as a pattern
rather than as a member's email.

Nothing appends to this file by itself. Entries dated 2026-09-28 and 2026-09-29 were written
afterwards, on 2026-09-29, from the CI run records (`gh run view <id>`); what a run record cannot
show, chiefly a by-hand `verify:release` result, is marked "operator-reported" or "not confirmed".

## 2026-10-06 · 137ccfb · prod · audit fixes, Functions on TypeScript 7, Actions majors
Machine: GREEN, 8 of 8, `verify:release --project prod` run by Claude at 08:10Z: live build 137ccfb,
         34 of 34 functions current, firestore and storage rules = 137ccfb, IAM 7/7, 4 secrets
         bound, uploads 3 of 3 paired since 7d8ce41, no function errors, nothing stranded.
Walk:    GREEN, all six steps on vscn-39508.web.app, site built from 137ccfb; run 37432784385
         (PR #178 merged 07:56Z, walk job 08:02:40-08:03:53Z). First production run on the #166
         Actions majors (checkout 7, setup-node 7, upload 7, download 8); the scrub step and the
         artifact upload stayed skipped on a green walk, so no walk-artifacts exist.
Action:  none. Contents: no member-facing change. #174 and #179 clear the high and critical
         advisories published 2026-10-05/06 against unchanged lockfiles (devalue,
         http-cache-semantics, @fastify/busboy, @grpc/grpc-js, source-map-js, proxy-addr; braces
         went with #170; the firebase-pinned grpc 1.9 copy is allowlisted until 2026-12-01);
         #165 Functions on TypeScript 7 (backend job updated all 34); #166 Actions majors;
         #164 #167 #168 #169 #170 #175 #176 dependency groups and plugin majors; #173 Dependabot
         holds root TypeScript at 5; #172 the 7d8ce41 entry. #179 was cut mid-release: the audit
         on #178 went red on the two 2026-10-06 advisories, and the fix merged to dev before the
         release did. The staging run for d1e7298 needed three attempts through a GitHub Actions
         outage on 2026-10-05 (runners never acquired); nothing deployed until attempt 3.

## 2026-09-30 · 7d8ce41 · prod · review fixes #152-#161, the walk stops leaking the debug token
Machine: not run. CI has no `verify:release` step; the release job itself deployed the backend
         (all 34 functions updated), rules and Hosting, and https://vscn.ch serves build 7d8ce41.
Walk:    GREEN, all six steps on vscn-39508.web.app for 7d8ce41, site built from 7d8ce41; run
         36707487000 (PR #162 merged 11:16Z, walk job 11:22:54-11:23:56Z). First live run of the
         rotated debug token and of the #157 Remove confirmation, which the walk now accepts. The
         scrub step and the artifact upload stay skipped on a green walk, so no walk-artifacts exist.
Action:  none. Contents: #152 walk redaction + artifact scrub; #153 mint endpoint bounds; #154 docs;
         #155 leave guard; #156 lifecycle; #157 save path; #158 notifications and publication; #159
         a11y; #160 release tooling and dependency audit; #161 brace-expansion 2.1.7. The leak #152
         closes: run 36491067157 (the 80f5850 release, walk red at save) uploaded the page console
         with the prod walk token. That artifact is deleted and the token was rotated on 2026-09-29
         (secret 20:39Z, new registration "release walk (CI) 2026-09-29" 20:41Z, old registration
         deleted; confirmed from the prod web app debug-token list, which returns names only). The
         stale "astro-desktop-dev" registration was deleted on 2026-09-30. Signed-in editor paths
         (Remove confirm, EN/DE switch with unsaved edits, pre-save validation, Save) walked on dev
         ae1b72a before release; not yet walked signed-in on prod.

## 2026-09-29 · d5b3ae0 · prod · member rebuilds every minute
Machine: not confirmed. CI has no `verify:release` run for this release; the operator reported the release
         check GREEN. Read from Cloud Scheduler on 2026-09-29: `flushMemberRebuilds` is ENABLED, "every 1 minutes".
Walk:    GREEN, all six steps on vscn-39508.web.app for d5b3ae0, site built from d5b3ae0; run 36579909413
         (push 14:04Z, PR #151, walk job 1 m 14 s).
Action:  none. Contents: PR #150 (the flush runs every minute instead of every five). Backend job deployed
         (source digest fba3dfc…, all 34 functions updated); rules and Hosting deployed. No member rebuild
         has run on prod since this release or the previous one, so the one-minute flush and the
         verify-skip are proven on dev only; the next real member save on prod is the proof.

## 2026-09-29 · d4ba84b · prod · member rebuilds skip verify
Machine: not confirmed. No `verify:release` run in CI; operator-reported GREEN.
Walk:    GREEN, all six steps on vscn-39508.web.app for d4ba84b, site built from d4ba84b; run 36550042245
         (push 09:34Z, PR #149, walk job 1 m 7 s).
Action:  none. Contents: PR #147 (the walk waits for the upload to commit before saving) and PR #148 (a
         member-triggered rebuild skips `verify` when the commit already passed it). The backend job found
         the source digest unchanged from 80f5850 and skipped every function ("Skipping the deploy of
         unchanged functions"); rules and Hosting deployed as usual.

## 2026-09-28 · 80f5850 · prod · the release-readiness release, walk red then green
Machine: operator-reported GREEN from `verify:release --project prod`, the only WARN the 2026-09-22/23
         digest errors still inside the window. Not reproduced here and not stored anywhere: CI runs no
         `verify:release`. Verified from the run instead: run 36491067157 (push 22:13Z, PR #146) passed
         verify, backend, export, render and deploy. The backend job was the first prod Functions deploy
         under `vscn-functions-deployer`: 34 functions, 4 created (`resolveEmbed`, `restoreAutoPoster`,
         `adminRetryNotice`, `getPublicationStatus`) and 30 updated. The deploy job published new security
         rules ahead of Hosting; `firestore.rules` differs from f21a60f by +153/-11, so unlike the
         2026-09-22 release this one did change rules, and a Hosting-only rollback would not undo them.
Walk:    RED at step 3 (save), CI walk job of run 36491067157: "Please wait for uploads to finish before
         saving." The walk saved while its upload was still committing, which the editor refuses. A walk
         script bug, not a product defect. Re-run as a manual dispatch of
         `release-walk.yml` from branch `fix/walk-save-waits` (the fix, PR #147): run 36492418109, 22:26Z,
         GREEN, all six steps on vscn-39508.web.app (the site was built from 80f5850; the walk script from
         2241152, and its Walk line says so).
Action:  #147 reached main with d4ba84b. One consequence found later: the red step's page console, which
         holds the App Check debug token, was uploaded as an artifact of run 36491067157. See the
         "Awaiting release" entry at the top.

## 2026-09-28 · 80f5850 · prod · signed-in walk by hand, 23:18-23:40Z
Machine: n/a
Walk:    GREEN, operator-reported, no artefact in the repo. Josh signed in as the verification member in a
         browser (its profile stays `moderationHidden`; restored to empty afterwards; no function errors
         in the window). Beyond the six scripted steps it covered: video import (YouTube watch, youtu.be,
         Shorts, Vimeo), the refusals (playlist, embed, other sites, SVG, GIF), automatic-thumbnail
         restore, replace-image keeping the words, draft restore after a reload, the 12-item cap, a
         project with bilingual role and bio, the Preview tab and the lightbox counter, the German editor
         at 320/375/390/768, and the community views and a member page.
Action:  three minor findings, unfixed: HEIC gets the generic type message on Windows Chrome (the browser
         reports an empty type; detect by extension); at the 12-item cap the video field disables with no
         "gallery full" note and keeps a stale refusal message; the cap text says "images" though videos
         count. The automated walk still does not cover video import, poster restore, project save or
         image replace; only this by-hand walk did.

## 2026-09-28 · d82f9b6 · dev · the first Functions deploy under the new identity
Machine: operator-reported GREEN from `verify:release --project dev`, upload pairing untested (no traffic
         in the window). Not stored.
Walk:    n/a (dev)
Action:  none. Run 36481093216 (staging workflow, push 20:42Z, PR #144): the backend job updated all 34
         functions under `vscn-functions-deployer@vscn-dev-f4b60` with no missing permission, the first
         run of the identity. Later dev pushes (36548031669 for 15ca9fb, 36551493037 for c812702) also
         deployed green; they have no entries of their own.

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
