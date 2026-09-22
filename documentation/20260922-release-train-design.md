# The weekly release train (design, 2026-09-22)

Josh, 2026-09-22: "we will switch to a release schedule … weekly tuesday. automate the rest."

Today a prod release is three deploys of which the pipeline does one. The merge into `main`
deploys hosting; `firestore.rules`, `storage.rules` and the functions go by hand, in an order that
lives in [release-verification.md](release-verification.md) and in agent memory, and the check that
would catch a forgotten step ([verify-release.mjs](../scripts/verify-release.mjs)) is run by a
person. PR #48 shipped an admin console whose new callable never reached prod; PR #58 exists because
a hand-run functions deploy revoked a hand-applied grant. This design makes a release **one merge**,
makes that merge happen **every Tuesday**, and makes the pipeline **check its own work**.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Cadence | Weekly. Monday 07:00 Zurich the release PR opens; Tuesday 07:00 Zurich it merges | A day between opening and merging is the freeze: fixes only, and a place to say stop |
| Stop mechanism | A `hold` label on the release PR | One click, visible in the PR, no repo setting to remember |
| Freeze | Convention, enforced by nothing | YAGNI. Dev is still merged into during the freeze if a fix needs it; the PR body is regenerated at merge time |
| Order inside a release | verify → rules → functions → hosting → drift check → log + tag | Rules before the frontend that writes a new field; functions before the hosting rewrite that points at one; the check last because it checks all of it |
| Where the pipeline is rehearsed | Every merge into `dev` runs the same rules + functions + hosting + check | Dev is the test bed; a Tuesday release must not be the first time the pipeline meets a new function |
| Deploy identity | A new `vscn-release-deployer` service account per project, keyless via the existing WIF pool | The hosting deployer stays hosting-only; a leaked release credential is a different blast radius and should be a different account |
| Record | The drift check's entry is committed to `release-log.md` on `main`, and the released commit is tagged `release/YYYY-MM-DD` | The log's value is its history; the tag makes rollback a redeploy of a name |

## 1. The train — `.github/workflows/release-train.yml`

Two cron firings and a manual trigger. Cron is UTC and cannot follow Zurich's clock, so the times
are 05:00 UTC, which is 07:00 in summer and 06:00 in winter. Nobody is expected to be awake for it.

**Monday, `open` job** (`schedule: "0 5 * * 1"` and `workflow_dispatch` with `job=open`):

1. Fetch `origin/main` and `origin/dev`. If `dev` is not ahead of `main`, print "nothing to
   release" and exit green.
2. If a PR from `dev` into `main` is already open, reuse it; otherwise open one titled
   `Release YYYY-MM-DD` (the coming Tuesday's date).
3. Set its body from the first-parent history `main..dev`: one line per merged PR, taken from
   the PR title via `gh pr view N --json title`, plus any direct commits by subject. Prefix a
   standing paragraph: what a release does (rules, functions, hosting, check), that the train
   merges it Tuesday 07:00 unless the PR carries `hold`, and how to hotfix.

**Tuesday, `merge` job** (`schedule: "0 5 * * 2"` and `workflow_dispatch` with `job=merge`):

1. Find the open `dev → main` PR. None: exit green with a note.
2. `hold` label present: comment "held, not merged" once (idempotent marker comment, same
   technique as the preview-URL comment in
   [firebase-hosting-pull-request.yml](../.github/workflows/firebase-hosting-pull-request.yml))
   and exit green.
3. Regenerate the body (dev may have moved during the freeze).
4. `gh pr checks --watch --fail-fast` on the PR. Red: comment with the failing check and exit
   **red** — a Tuesday with nothing shipped must be a red run, not a quiet one.
5. `gh pr merge --merge` with the Actions token.
6. `gh workflow run firebase-hosting-merge.yml --ref main`. This is not optional: a push made
   with `GITHUB_TOKEN` never triggers a `push` workflow, so without the dispatch the merge would
   land and nothing would deploy. `requestRebuild` already dispatches the staging workflow the same
   way, and the WIF provider `github-main` accepts `refs/heads/main` from a dispatch as it does
   from a push.

Permissions: `contents: write`, `pull-requests: write`, `actions: write`, nothing else.
Concurrency group `release-train`, no cancellation.

**Hotfix** is the path that exists today and is unchanged: merge the fix into `dev`, open the
`dev → main` PR by hand, merge it by hand. A human merge triggers the deploy through `push`. The
next Monday's `open` finds nothing to release, or only what came after.

## 2. The prod deploy becomes the whole release — `firebase-hosting-merge.yml`

Current jobs: `verify → export → render → deploy`. New shape:

```
verify ─→ rules ─→ functions ─→ export ─→ render ─→ deploy ─→ release-check
```

`export` and `render` are unchanged. `deploy` is unchanged (hosting, then the publication
acknowledgement). The three new jobs:

**`rules`** — `npx -y firebase-tools@latest deploy --only firestore:rules,storage --project
vscn-39508 --non-interactive` as `vscn-release-deployer`. Runs first because a client that writes a
new field before its rule exists is refused, and because a stale ruleset over new functions is the
outage of 2026-09-14.

**`functions`** — `FUNCTIONS_DISCOVERY_TIMEOUT=120 npx -y firebase-tools@latest deploy --only
functions --project vscn-39508 --non-interactive --force`. `--force` is required for the retry
policy on `onImageWentLive`, and it also **deletes deployed functions the source no longer
exports**. That is the intended behaviour of a release: the code is the manifest. The deploy reads
`functions/.env` and `functions/.env.vscn-39508` for params; every `defineString` must have a
value there (a code default is refused non-interactively, learned 2026-09-22). The invoker of
`acknowledgeSitePublication` is declared in code since PR #58, so this deploy applies that binding
rather than revoking it.

**`release-check`** — after `deploy`, with `fetch-depth: 0` so the script can read the previous
release:

```
npm run verify:release -- --project prod --release ${{ github.sha }}
```

Auth: the deployer's OAuth access token from `google-github-actions/auth` (`token_format:
access_token`), handed to the script through `CLOUDSDK_AUTH_ACCESS_TOKEN`, which the preinstalled
`gcloud` honours, so `accessToken()` in the script does not change. A `RED` verdict fails the job
and therefore the run — the release happened, the run says it is not right, and the Actions email
is the incident report. On `GREEN` the job:

1. Appends the printed entry to `documentation/release-log.md` with `Walk: pending` and commits it
   to `main` as `docs(release): YYYY-MM-DD · <sha> · prod` (Actions bot author, `[skip ci]` is
   unnecessary because a `GITHUB_TOKEN` push does not retrigger).
2. Tags the **released** commit (`github.sha`, not the log commit) `release/YYYY-MM-DD`; if that
   tag exists, `release/YYYY-MM-DD.2` and so on.
3. Pushes commit and tag in one `git push origin HEAD:main refs/tags/release/…`.

The job needs `contents: write`; the other jobs keep `contents: read`.

**A log commit is not a release.** The script resolves "the released commit" as the tip of
`origin/<branch>`. After this change the tip of `main` is usually the log commit, whose
`build-commit` is not what the site serves. A new pure `skipLogCommits(history)` in
[release-checks.mjs](../scripts/lib/release-checks.mjs), called where `verify-release.mjs` resolves
`origin/<branch>` today (line 345), walks back over first-parent commits that
touch only `documentation/release-log.md` before picking the release. Unit-tested. In CI the
`--release` flag makes this moot; it matters for Josh's hand runs.

## 3. The staging deploy rehearses the same pipeline — `firebase-hosting-staging.yml`

The identical `rules`, `functions` and `release-check` jobs, pointed at `vscn-dev-f4b60`, provider
`github-dev`, `--project dev`. Differences: the check commits nothing and tags nothing on `dev`
(dev's log entries stay a human act, as now — a merge every hour would bury the prod history), and
the job's `RED` still fails the run, which is the finding the protocol asks for. Cost: a functions
deploy on every dev merge, roughly five minutes, inside the existing `staging-deploy` concurrency
group.

The PR preview workflow does not change. Previews deploy nothing but a hosting channel and must
never touch a project's rules or functions.

## 4. Identity and grants — what only Josh can do

Each project gets a service account `vscn-release-deployer@<project>.iam.gserviceaccount.com`,
bound to the existing pool exactly as the hosting deployer is:

```
roles/iam.workloadIdentityUser  on the SA, for
  principalSet://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/vscn-hosting-deploy/attribute.repository_id/1207092943
```

The workflows then name it with the existing providers (`github-main` for prod, `github-dev` for
dev), whose `assertion.ref` conditions already pin each to its branch.

Project roles on the account — the intended set, one line per reason:

| Role | Why |
| --- | --- |
| `roles/cloudfunctions.admin` | create, update and delete gen-2 functions |
| `roles/run.admin` | gen-2 functions are Cloud Run services; setting the declared invoker policy needs it |
| `roles/iam.serviceAccountUser` on `<number>-compute@developer.gserviceaccount.com` | the deploy attaches the runtime identity to each function |
| `roles/cloudscheduler.admin` | `onSchedule` functions (`sendAdminDigest`, maintenance, rebuild queue) |
| `roles/eventarc.admin` | Firestore and Auth v2 triggers are Eventarc triggers |
| `roles/secretmanager.admin` | binding a secret grants the runtime `secretAccessor` on it; a viewer cannot |
| `roles/firebaserules.admin` | publish Firestore and Storage rulesets |
| `roles/firebasestorage.admin` | attach the Storage ruleset to the bucket |
| `roles/storage.objectAdmin` on `gcf-v2-sources-<number>-us-central1` | upload the function source archive |
| `roles/cloudbuild.builds.editor`, `roles/artifactregistry.reader` | the function image is built by Cloud Build |
| `roles/serviceusage.serviceUsageConsumer`, `roles/firebase.viewer` | what `firebase deploy` reads about the project before doing anything |
| `roles/viewer` | the drift check's read side: IAM policy, function list, log entries, secret versions |

This is the best-known list, not a proven one. Firebase's own CI guidance hands the account
`roles/firebase.admin`, which is broader than all of the above; if the first supervised run 403s on
something not listed, the fix is to add the missing role, and only if that becomes a chase do we
fall back to `firebase.admin`. Whatever the final set, it is recorded in the `EXPECTED` table of
[verify-release.mjs](../scripts/verify-release.mjs) with a `why`, per the protocol's rule that a
grant nowhere written down is how the 2026-09-14 outage happens again.

`scripts/release-iam.ps1` carries every command above for both projects, in PowerShell, with
`--condition=None` where the policy already holds conditional bindings. Josh runs it; these grants
are classifier-blocked for Claude.

**Prerequisite, DONE 2026-09-22:** `sendAdminDigest` declares `INFOMANIAK_SMTP_PASSWORD`, and a
functions deploy refuses a missing secret. Josh copied it from dev into prod (version 1, enabled) by
piping `secrets versions access` into `secrets create`, so the value never appeared on screen. The
runtime gets `secretAccessor` on it at the first functions deploy.

## 5. Failure handling

| Failure | What happens | What a human does |
| --- | --- | --- |
| Monday: verify red on the PR | The PR opens anyway; its checks are red | Fix on dev before Tuesday, or add `hold` |
| Tuesday: checks red | Not merged; the run is red and comments on the PR | Fix, then rerun `merge` by dispatch or wait a week |
| Rules deploy fails | Nothing else deploys; prod unchanged | Read the run; rules are validated by `test:rules` in verify, so this is IAM or the API |
| Functions deploy fails | Rules are already live on prod, hosting is not | The window the protocol already warns about, now minutes not days; rerun the workflow by dispatch once fixed — rules redeploy is idempotent |
| Hosting deploy fails | Rules and functions live, old site served | Same: dispatch again |
| Release check RED | Everything deployed; run red; no log commit, no tag | Read the probe. Roll back with `firebase hosting:rollback` / redeploy the previous `release/` tag, or fix forward |
| Log push rejected (main moved) | Tag and log lost, release itself fine | Rare; the job retries once after `git pull --rebase`, then fails visibly |

Rollback of functions is a redeploy from the previous tag: `git checkout release/<prev>` and
dispatch is not possible on a non-branch ref under the WIF condition, so rollback is a revert PR
into `main` merged by hand. That is acceptable for a site of this size and is stated here so nobody
looks for a button.

## 6. Testing

- `skipLogCommits` walk-back: unit tests in `tests/unit/release-checks.test.mjs` — tip is a log
  commit, tip is two log commits, tip is a real release, tip is a log commit whose parent is also
  docs but touches another file (not skipped).
- Body generation: a pure function `releaseNotes(history)` in `scripts/lib/release-train.mjs`,
  unit-tested on a fixture of merge and non-merge subjects.
- Workflow syntax: `actionlint` locally before the PR.
- The first supervised run on **dev**: merge this PR into dev and watch the staging workflow do
  rules → functions → hosting → check. That run is the acceptance test for the IAM list on dev.
- The first supervised run on **prod**: the coming Tuesday's train, watched live, with the
  moderation release riding on it (the largest release in weeks, which is the point of watching).
- Dry run of the train: `workflow_dispatch` with `job=open` on a Monday after this merges, to see
  the PR and its body before the schedule ever fires.

## 7. Out of scope

The human walk stays human (`Walk: pending` in the committed entry, Josh fills it in). Branch
protection on `main` and "allow auto-merge" are not needed by this design and are not turned on.
The verification member of the protocol's §7.1 is still not created. Cron in Zurich time is not
solved; an hour's drift in winter changes nothing.

## Status

Design approved in chat 2026-09-22 ("looks good"). Not yet built.
