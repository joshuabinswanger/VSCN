# Release verification protocol — design

**Date:** 2026-09-22
**Status:** implemented 2026-09-22 — `scripts/verify-release.mjs`, `documentation/release-verification.md`,
`documentation/release-log.md`; acceptance test (§8) passed the same day
**Implements:** a repeatable check that a prod release actually works, run by Josh and Claude together after every release.

> **Where the implementation departs from this design, and why** (2026-09-22)
>
> - **Credentials (§4.2, §10).** The script uses the gcloud CLI's own user credential
>   (`gcloud auth login`), mints one access token from it and calls every Google API over REST.
>   No ADC, no `firebase-admin`: ADC was not set up on the machine, the dev service-account key is
>   revoked, and shelling out to `gcloud` with quoted log filters is fragile on Windows. Every call
>   still carries `x-goog-user-project`.
> - **Window flags (§4.1).** `--since` also accepts an ISO time, and `--until` bounds the window,
>   so the behaviour probes can be pointed at a past incident. §8's reconstruction needs it.
> - **Probe 6 counts.** Only `POST` request-log entries count; the browser's CORS preflight
>   `OPTIONS` lands in the same log and would double the numbers. The "23 authorize" in §6 was
>   31 successful POSTs over the full window.
> - **Probe 8 thresholds.** `sweepImages` runs every 6 h with a 6 h stale cutoff, so residue
>   younger than 12 h is normal after failed uploads. Residue past that horizon fails (the sweep
>   is not clearing it); a pile younger than it warns (uploads failing, corroborating probe 6).
>   The §4.3 one-hour threshold would have gone red after any busy afternoon.
> - **Expectations table (§4.3).** Five grants plus one *forbidden* grant: the deployer must hold
>   `roles/run.invoker` on `acknowledgeSitePublication` and must NOT hold it project-wide. The
>   deployer's `roles/firebasehosting.admin` was added as the fifth. The runtime-account check
>   covers gen-2 functions only; the two gen-1 Auth triggers run as the App Engine default.
> - **Probe 4 acceptance (§8).** The grant had been applied by hand before the script existed, so
>   it was tested with a bogus expected role: red, then removed.

## 1. Why this exists

On 2026-09-22 a member wrote in to say that every gallery upload on vscn.ch failed with
"Your sign-in expired. Sign in again, then try once more." Uploads had been dead since the
2026-09-14 release. Eight days, two members, dozens of abandoned attempts, and the first signal
was an email.

Nothing in the pipeline could have caught it:

- `npm run verify` was green. The rules tests pass in the emulator **because the emulator does
  not enforce the IAM that production enforces**. `storage.rules` calls `firestore.get()`, which
  on a real project requires the Storage service agent to hold
  `roles/firebaserules.firestoreServiceAgent`. That grant was missing. Every rule evaluation
  errored, every error denied, and the client reported the denial as an expired session.
- The grant exists in no file in this repository. It is created by the Firebase CLI only during
  an *interactive* rules deploy. No test, no checklist and no code could observe its absence.
- The merge pipeline in `.github/workflows/firebase-hosting-merge.yml` deploys `--only hosting`.
  Functions, `firestore.rules`, `storage.rules`, function secrets and every IAM grant are
  deployed out of band, by hand. A fully green release can ship against a backend that does not
  match the code that was just released.

The protocol closes that gap. Its governing idea: **most of what breaks a VSCN release is drift
between what the repository says and what the Google project actually has.** Drift is
machine-checkable. Writing the expected state into a file is itself most of the fix, because it
turns invisible infrastructure into something that can be diffed.

## 2. Cadence

| Event | What runs |
| --- | --- |
| Merge to `main` (prod release) | Full protocol: machine check, then the human walk |
| Merge to `dev` | Machine check only, against `vscn-dev-f4b60`, run by Claude without being asked |

The dev run is not ceremony. Rules and functions land on dev first, so dev is where drift should
be caught, at no cost. A red dev check is a finding to fix before the same release reaches prod.

## 3. Artifacts

| Path | What it is |
| --- | --- |
| `scripts/verify-release.mjs` | The machine check. Node, run locally, reads only. |
| `documentation/release-verification.md` | The protocol itself: the walk steps and how to read a verdict. Short. Points at the script. |
| `documentation/release-log.md` | One entry per release: date, SHA, verdict, findings. The drift history. |

This design document is the spec for all three.

## 4. The machine check

### 4.1 Interface

```
node scripts/verify-release.mjs --project prod --since <sha>
node scripts/verify-release.mjs --project dev
```

- `--project` takes `prod` or `dev` and resolves through `.firebaserc` to `vscn-39508` /
  `vscn-dev-f4b60`. Never accept a raw project id; the two project numbers are baked into the
  expectations table and must not drift apart from the id.
- `--since` is the previously released commit. Default it to the second-newest commit on the
  branch's deploy history; if that cannot be resolved, require the flag rather than guessing.
- Output is one row per probe: `PASS` / `FAIL` / `WARN` / `SKIP`, the probe name, and one line of
  detail. A failing row always prints what was expected and what was found.
- Exit code 0 when every probe passes, 1 when any probe fails. `SKIP` (a probe that could not
  run — missing credentials, say) also exits 1: a check that did not run is not a pass. `WARN`
  does not change the exit code, but it must appear in the log entry; a warning nobody records
  is the same as no warning at all.
- Read-only. The script must never write to Firestore, Storage, IAM or Hosting. This is a hard
  constraint; it runs against production.

### 4.2 Credentials

Application Default Credentials, with a quota project set. The Firebase Rules REST API rejects
ADC without one — it returns 403 "requires a quota project" — so every call to
`firebaserules.googleapis.com` must carry the header `x-goog-user-project: <project id>`. This
cost an hour on 2026-09-22; it is written down here so it costs nobody an hour again.

```powershell
gcloud auth application-default login
```

### 4.3 The probes

Four groups, eight probes.

#### Group SHIPPED

**1. Build stamp.** Fetch the live origin (prod: vscn.ch) and read the `build-commit` meta tag,
emitted by `src/layouts/Layout.astro:220` from `src/lib/buildInfo.ts`. It must equal the released
commit.

Catches a deploy that silently did not land, and the browser-cache trap documented at length in
`firebase.json` — a page could be served from cache for an hour after a deploy. Request with a
cache-busting query string so the probe reads the origin rather than an intermediary copy.

*Not reusable for PR previews as written: a preview's stamp is the ephemeral
`refs/pull/N/merge` SHA, not the head commit. The probe only ever runs against main and dev, so
this does not bite — but do not point it at a preview without accounting for it.*

#### Group PARITY

**2. Functions deployed.** Parse the export list from `functions/src/index.ts` — one export per
line, by deliberate convention. For each name, assert a deployed function exists on the project,
and that its last deploy time is **newer than the last commit touching its source file**.

Catches the most common failure mode in this project: the release pipeline is `--only hosting`,
so a new callable never rides along with the code that calls it. This has happened at least twice
(the admin console release; the signup ping). The timestamp half is what makes it more than an
existence check — an old deploy of a function whose source has changed is exactly as broken as a
missing one.

```
gcloud functions list --project <id> --format=json
```

**3. Rules parity.** For Firestore and for Storage, fetch the live release and its ruleset source
from the Rules API, and compare against `firestore.rules` / `storage.rules` at the released SHA.
Compare normalised source text, not a timestamp — a ruleset can be re-deployed unchanged.

```
GET https://firebaserules.googleapis.com/v1/projects/<id>/releases
GET https://firebaserules.googleapis.com/v1/projects/<id>/rulesets/<ruleset id>
    (both with header x-goog-user-project: <id>)
```

Catches rules never deployed for a release that changed them, and the inverse — deploying an old
branch's rules over newer ones, which has silently reverted the Storage size cap before.

#### Group FOUNDATIONS

**4. IAM grants.** A table of expected bindings, asserted against the live policy. This is the
probe that would have caught the outage, and the table is the durable artifact — the first time
this project's invisible infrastructure is written down anywhere.

Seed it with the four known load-bearing grants:

| Member | Role | Why |
| --- | --- | --- |
| `service-<PROJECT_NUMBER>@gcp-sa-firebasestorage.iam.gserviceaccount.com` | `roles/firebaserules.firestoreServiceAgent` | Lets `storage.rules` call `firestore.get()`. Without it every gallery upload is denied. |
| the App Check signer service account | `roles/iam.serviceAccountTokenCreator` **on itself** | Turnstile → App Check minting in `functions/src/appCheck.ts`. |
| `vscn-hosting-deployer@vscn-39508.iam.gserviceaccount.com` | `roles/run.invoker` on `acknowledgeSitePublication` only | The publication acknowledgement at the end of the merge workflow. |
| `vscn-build-reader@vscn-39508.iam.gserviceaccount.com` | Firestore read | The `export` job reads prod data to build the site. |

Store the table as a top-level `EXPECTED` constant in the script, keyed by project, carrying the
project number and a one-line reason per grant. The reason is not decoration: whoever sees a red
row needs to know what breaks, and "grant missing" without a consequence invites someone to grant
it blindly — or to delete it.

Adding a grant to a project without adding it here is how this outage happens again. Put that
sentence in a comment above the table.

```
gcloud projects get-iam-policy <id> --format=json
```

Note for whoever applies a grant by hand: if the policy already holds conditional bindings,
`gcloud` will stop and demand a condition. These grants are unconditional — pass
`--condition=None`.

**5. Secrets bound.** Collect every `defineSecret("NAME")` in `functions/src` — currently
`ADMIN_NOTIFY_TO`, `BREVO_API_KEY`, `GITHUB_REBUILD_TOKEN`, `TURNSTILE_SECRET_KEY` — and assert
each has an enabled version in Secret Manager on that project. Derive the list from source, so a
newly declared secret cannot be forgotten.

Do **not** read secret values. Existence and state only. `gcloud secrets` needs `--quiet` in this
environment or it can sit waiting on a prompt.

#### Group BEHAVIOUR

Parity proves the release landed. Behaviour proves it works. These probes read logs and data;
they are the ones that notice a backend that is deployed, current, and still broken.

**6. Upload pairing — the canary.** Over the window since the previous release, count invocations
of `authorizeImageUpload` and of `completeImageUpload` in Cloud Logging.

These two must pair. `authorizeImageUpload` writes an `images/{id}` record and an upload permit,
the browser then PUTs to Storage, and `completeImageUpload` finishes the job. A member who
abandons an upload leaves a legitimate gap, so the test is a ratio with a floor, not equality:

- **FAIL** when `authorize >= 3` and `complete == 0`. Nothing is getting through.
- **WARN** when `authorize >= 10` and `complete < authorize * 0.5`. Something is failing for some
  members, or in some browsers.
- **PASS** otherwise, including when both are zero — a quiet week is not a fault.

Report both counts on the row either way, so a human can see the traffic behind the verdict.

On 2026-09-22 prod showed dozens of `authorizeimageupload` and **zero** `completeimageupload`
since 2026-09-14. This probe would have gone red on day one.

**7. Function errors.** Scan Cloud Logging for severity `ERROR` from any deployed function since
the previous release. Report the count and the three most frequent messages. Any error is a
`WARN` and a line in the log entry; this probe does not fail a release on its own, because one
transient error is not a broken release — but it must never be silent.

**8. Stranded state.** Three counts that should all sit near zero:

- `uploadPermits` documents whose `expiresAt` is in the past (the 30-minute permit window in
  `functions/src/uploads.ts`)
- `images` documents still at `status: "uploading"` and older than an hour
- objects under `pending/` in the bucket older than an hour

Each is the residue of an upload that started and never finished, so together they corroborate
probe 6 from the data side rather than the log side. `sweepImages` clears these on a schedule, so
a standing non-trivial count means either uploads are failing or the sweep is not running.

## 5. The human walk

Three minutes, after the machine check is green. No probe can tell you the site feels right.

Performed as the dedicated hidden prod member (§7). Steps:

1. Sign in at vscn.ch as the verification member.
2. Upload one gallery image. It must complete without an error banner.
3. Give it a caption and save the profile. The save must confirm.
4. Open the Preview tab. The image must render there.
5. Delete the image, and confirm it disappears.
6. Sign out. Load the home page and one member page anonymously; both must render.

Steps 2 and 3 are the point: they are exactly what a member does, and between them they exercise
the callables, the Storage rules, the cross-service IAM, the Firestore rules and the profile
write path. Step 6 catches a broken static build.

If any step fails, stop and report it as a release incident. Do not attempt a fix inside the walk
— the walk's job is detection, and a half-fixed state makes diagnosis harder.

## 6. Verdict and log

Every run appends one entry to `documentation/release-log.md`:

```
## 2026-09-22 · 1e033a7 · prod
Machine: RED — IAM firebaserules.firestoreServiceAgent missing (storage service agent);
         upload pairing 23 authorize / 0 complete since 2026-09-14
Walk:    not run (blocked on machine check)
Action:  grant applied, re-verified green 2026-09-22
```

Green entries are one line. The value is the history: the log is where slow drift becomes visible
as a pattern rather than as a surprise.

A red machine check is a release incident, not a to-do item. It gets fixed, or the release gets
rolled back, before the walk.

## 7. One-time setup

Before the first run:

1. **The verification member.** Create a real Auth account on `vscn-39508` with its own address,
   complete its profile, then set `moderationHidden: true` on the public profile document. The
   export at `scripts/export-site-data.mjs:35` drops any profile carrying that flag, so the
   account exercises every write path and never reaches the public directory. Josh holds the
   password; Claude neither needs it nor asks for it.
2. **The expectations table.** Populate `EXPECTED` by reading each project's current live policy
   and recording what is *intended*, not merely what is present. A grant nobody can justify is a
   finding, not a baseline.
3. **ADC** on Josh's machine, per §4.2.

## 8. Acceptance test

The protocol is only worth having if it fails when the site is broken. There is a live failing
case to test it against: prod on 2026-09-22, before the `firebaserules.firestoreServiceAgent`
grant is applied.

**If the grant has not yet been applied:** run the script against prod first. It must go red on
probe 4 (missing grant) and red on probe 6 (23 authorize, 0 complete). Then apply the grant and
run again; both must go green.

**If the grant has already been applied:** reconstruct the same evidence by pointing probe 6 at
the 2026-09-14 → 2026-09-22 window, which must still report the zero-complete gap from the logs.
Probe 4 cannot be retested without removing a production grant — do not do that. Test it instead
against a deliberately wrong expectation: add a bogus expected role, confirm the probe goes red,
remove it.

If the script comes back green against known-broken prod, the protocol is decoration and this
design is wrong. Rewrite it rather than shipping it.

## 9. Out of scope

Deliberately excluded, because they do not change per release and checking them badly would make
a green verdict misleading:

- Auth templates and the action URL, which are console-only and immovable by any other route
- DNS and the Infomaniak mailbox
- The Turnstile dashboard
- **Firestore indexes.** There is no `firestore.indexes.json` in this repository; indexes are
  created in the console. That makes them exactly the kind of invisible state this protocol
  exists to catch, and they are currently unobservable. Bringing indexes into the repo is a
  worthwhile follow-up; until then their absence from the check is a known gap, not an oversight.

These get a separate annex, reviewed occasionally rather than per release.

## 10. Implementation notes

- Node, ESM, no new dependencies. Shell out to `gcloud` for IAM, functions, secrets and logging;
  use `fetch` for the Rules API and the build stamp. `firebase-admin` is already a dependency and
  is the simplest route to the Firestore reads in probe 8.
- Probes run independently, and every probe reports even after an earlier one fails. A script
  that stops at the first failure hides the second one — and on 2026-09-22 there were two.
- Each probe is its own function with a shared signature, returning a result row. The script
  should be readable end to end in one sitting; if it grows past roughly 400 lines, the probe
  bodies want their own module.
- Keep the expectations table and the probe list adjacent at the top of the file, so the thing
  most likely to need editing is the thing you see first.
