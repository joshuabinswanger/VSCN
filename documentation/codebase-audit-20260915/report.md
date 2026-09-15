# Codebase audit — 15 September 2026

## Assessment

The Astro/Firebase architecture remains suitable for this directory. The most valuable improvements are reliable publishing, correct asynchronous state handling, and enforced quality checks. A framework rewrite would not address the defects identified here.

This audit reviews the current working tree at base commit `6c1fccf`, including substantial pre-existing uncommitted changes. It covers frontend modules and components, backend functions, database/storage rules, tests, scripts, build configuration, deployment workflows, and architectural documentation. Review depth was greatest at security boundaries and asynchronous data flows; this is not a claim that every line or browser interaction was exhaustively tested. Application source was not changed. Only audit artifacts were added; local build/test outputs were regenerated.

The September 14 security report is historical. Its remediation was considered, and resolved findings are not presented here as current vulnerabilities. No production writes or deployments were performed. The connected build reads configured Firebase data and remote images.

## Verification

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run test:unit` | 79/79 pass |
| `npm --prefix functions run build` | Pass |
| `npx --no-install astro check` | **24 errors**, 23 hints across 160 checked files |
| Connected `npm run build` | Pass, 75 pages |
| Build with network access denied | **Reports success**, 29 pages, after member fetch failure |
| Combined rules/functions tests, default file concurrency | Fail; shared emulator data is cleared across files |
| Same emulator tests with `--test-concurrency=1` | **56/56 pass** |
| Root and Functions `npm audit --json` | Both report zero known vulnerabilities |
| Local cancellation reproduction | **Confirmed: upload and completion callback occur after cancel** |

The Functions tests correctly refused an initial invocation outside the demo emulator. They subsequently passed in the isolated emulator run. Dependency results describe the registry audit at review time, not a guarantee against unknown vulnerabilities.

Evidence is saved beside this report: `astro-check.txt`, `build.txt`, `build-connected.txt`, `emulator-tests.txt`, `emulator-tests-serial.txt`, and both npm audit JSON files. The cancellation reproduction executes the actual queue module with mocked image processing and upload functions; it makes no network calls.

## Prioritized findings

### 1. High — database failure can deploy an empty directory

**Evidence:** `src/lib/membersBuild.ts:87` catches every fetch failure and returns empty members and aliases. `.github/workflows/firebase-hosting-merge.yml:22` deploys following a successful build exit.

**Reproduced:** network-denied database access logged `UNAVAILABLE`/`EACCES`, but the build exited successfully with 29 pages. A connected build produced 75. Thus a transient database failure or invalid credential can remove individual member pages from the next release.

**Improve:** fail production/preview builds when data cannot be fetched. Permit empty fixture data only through an explicit local-development option. Validate required environment variables before building. Distinguish a legitimately empty collection from a failed query; record member/page counts in deployment checks.

**Acceptance:** deny database access during a release build and assert a nonzero exit with deployment skipped.

### 2. High — cancelling image preparation still uploads the image

**Evidence:** `src/lib/galleryQueue.ts:289` marks the task abandoned, then calls `discard()` when no transfer cancel handler exists. `remove()` at line 173 deletes that abandonment flag at line 179. The pending preparation then resumes and sees no cancellation marker.

**Reproduced:** cancelling a task in `preparing` removes its UI row, but subsequently invokes both the upload and `onUploaded` callback. Run `node documentation/codebase-audit-20260915/reproduce-gallery-cancel.cjs` to repeat. This historical reproduction asserts the defective behavior; invert its expectations when converting it into a regression test.

**Improve:** retain cancellation state until the runner exits, or give each task an abort signal. Separate removing the visible row from final task cleanup. Add queue disposal on page navigation. Also recheck capacity in `retry()`; failed tasks release their slots, so a later retry can exceed the available capacity after other uploads fill it.

**Acceptance:** cancel during queued, preparing, authorization, and transfer stages; no cancelled task commits an image or calls the completion callback.

### 3. High — deployments bypass diagnostics and regression tests

**Evidence:** all three `.github/workflows/firebase-hosting-*.yml` workflows only run `npm ci && npm run build` before Hosting deployment. `package.json` has no type-check or complete verification command. The current Astro diagnostic run reports 24 errors, including custom-element type conflicts, missing model fields, nullable DOM references, language typing, and member-page diagnostics.

Some member-page diagnostics may be checker/template compatibility issues; they should be classified individually, not called 24 proven runtime failures. They still make the check unusable as a gate. Astro explicitly separates type checking from building: [Astro TypeScript documentation](https://docs.astro.build/en/guides/typescript/).

**Improve:** resolve the diagnostics, scope frontend TypeScript away from generated `functions/lib`, and add a required verification job: frontend lint, Astro check, unit tests, Functions compilation, and serial emulator tests. Keep backend/rules deployment sequencing explicit because current workflows deploy Hosting only. Use `npm ci` instead of `npm install` in the Functions predeploy hook for reproducibility.

**Acceptance:** a deliberate type error or failing rules test prevents deployment.

### 4. Medium — profile copies can diverge after a partial save

**Evidence:** `src/lib/firestore.ts:207` updates `users` and `publicProfiles` with `Promise.all`. These are independent writes, not an atomic operation. If the public projection is rejected while the private write succeeds, the form reports failure but private data has changed; the inverse leaves published data ahead of the editor.

**Improve:** construct both payloads first and commit them in one Firestore write batch, retaining explicit public-field projection. Treat Auth display-name/avatar mirroring as a separate reconciled operation. If multiple editors are expected, add revision checks for stale saves. [Firestore atomic writes](https://firebase.google.com/docs/firestore/manage-data/transactions) document the relevant primitive.

**Acceptance:** force either write to fail and verify neither document changes. This finding is source-confirmed; partial failure was not injected into production.

### 5. Medium — publishing is not durable from save through deployment

**Evidence:** `src/lib/profile.ts:102` catches rebuild request failures and only logs them. Immediate gallery persistence at `src/components/ProfileForm.astro:2459` does not queue a rebuild. `functions/src/rebuildQueue.ts:54` clears dirty state after GitHub accepts dispatch, before a build/deployment succeeds. Admin moderation and deletion use best-effort direct dispatches.

**Impact:** a saved change can remain absent from the public site indefinitely after a lost client request or failed workflow; immediate gallery changes depend on a later explicit Save or unrelated rebuild. Failed moderation rebuilds can leave content visible on the static site.

**Improve:** enqueue from committed server-side profile/image changes, including gallery operations. Track content revision through dispatch and successful Hosting deployment; retry unacknowledged revisions and alert on excessive queue age. Show saved/pending/published states in the editor.

**Acceptance:** close the browser immediately after a committed change, fail one workflow run, and verify eventual publication without another member save.

### 6. Medium — deletion cancellation can race destructive cleanup

**Evidence:** `functions/src/purge.ts:19` reads a job once and then deletes files/documents in stages. `functions/src/lifecycle.ts:100` allows cancellation of any job without `completedAt`; line 115 deletes the job. It does not exclude a purge already underway or partially completed.

**Impact:** a cancellation during or after partial purge can report restoration even though bytes are gone, remove the retry record, or make the running purge fail when recording its next step. This is a source-confirmed race scenario, not a reproduced production incident.

**Improve:** transactionally claim a `purging` state with a lease before destructive work, reject cancellation after that transition, and preserve the job until cleanup completes. Prevent new member writes/uploads while purging so a writer cannot recreate data after an earlier stage has been marked complete.

**Acceptance:** pause cleanup between stages and attempt cancellation and upload; verify deterministic rejection and resumable cleanup.

### 7. Medium — test files interfere with one another

**Evidence:** `tests/rules/helpers.mjs:20` fixes a common demo project. Both rules files clear Firestore between tests; `tests/functions/security.test.cjs` also clears that database. Storage authorization depends on permit documents in it. Default parallel test-file execution produced permission failures; serialization passed all 56 tests.

**Improve:** provide a documented complete emulator test script with `--test-concurrency=1`, or isolate each file in a distinct emulator project. Include Functions tests after compilation; the existing `test:rules` script omits them.

**Acceptance:** repeatedly run the complete suite through one command without fixture races. The failed concurrent run does not establish a production permission defect.

### 8. Medium — slug updates trust event arrival order

**Evidence:** `functions/src/slugs.ts:89` claims a slug using the name in the event snapshot. The claim transaction serializes collisions but never checks whether that name is still the current public profile name. Two rapid renames processed in reverse order can leave the older name current.

Firebase documents that Firestore event ordering is not guaranteed: [Firestore trigger limitations](https://firebase.google.com/docs/functions/firestore-events). This is a source-confirmed exposure to that delivery behavior; it was not reproduced against deployed triggers.

**Improve:** read the current profile in the same transaction used to claim a slug, or track a monotonic revision and ignore stale events. Preserve retired aliases.

**Acceptance:** replay rename events out of order and twice; the final current slug must match the latest stored name.

### 9. Medium — privileged builds and legacy scripts need stronger boundaries

**Evidence:** production and PR workflows provide the same service-account secret to the build and Hosting deployment. `CommunityWorkCard.astro:53` processes member images during that build. The decoder dependency is now patched and both dependency audits are clean; this is a remaining isolation concern, not a renewed claim of the prior vulnerability.

Separately, `scripts/migrate-public-profiles.mjs:8` loads `.env` and immediately writes public projections without an explicit project or dry-run flag. For missing public documents it does not establish verified/draft visibility, unlike current member publishing code. Newer scripts already demonstrate safer patterns in `scripts/lib/admin-app.mjs`.

**Improve:** give build-time data access a separate least-privilege identity, isolate image processing, and restrict deployment credentials to deployment. Move legacy mutation scripts to explicit project selection, project-ID validation, dry-run defaults, and current projection/visibility rules. Remove obsolete executable migrations from normal operational instructions.

**Acceptance:** build credentials cannot deploy or write member data; a legacy migration cannot mutate a default project by being run without arguments. Live IAM permissions were not inspected.

## Architecture, performance, and maintenance improvements

- **Extract large controllers incrementally.** `ProfileForm.astro` has 3,363 lines, `CommunityGrid.astro` 3,074, and `OnboardingForm.astro` 2,291. Separate gallery queue/persistence, profile-save orchestration, onboarding transitions, and directory filtering/motion into modules with explicit initialization/disposal. Start with the cancellation and persistence defects so extraction has behavioral tests.
- **Unify data contracts.** Private/public profile projection, Firestore allowlists, image lifecycle states, and duplicated slug logic span several modules and two TypeScript projects. Document the authoritative schema and add contract/parity tests. Preserve the explicit public-field allowlist; do not replace it with an unrestricted object spread.
- **Measure anonymous-page JavaScript.** The built Firebase chunk is approximately 394 KB uncompressed. `Navbar.astro:173` imports the shared module, which initializes Auth, Firestore, Storage, Functions, and App Check. Split auth/bootstrap from editing services and measure cold-load transfer and execution before/after. Preserve attestation warm-up needed for institutional access. Raw file size is not a measured network-transfer or Core Web Vitals result.
- **Plan for directory growth.** Build-time reads scan profiles, slug aliases, and live gallery records; public member reads also fetch whole collections. Keep this simple at current scale, but record counts/build durations and introduce a publication snapshot or bounded queries when growth justifies it. Avoid multiplying all-member reads inside new components.
- **Harden cleanup.** `sweepImages` operates from earlier query snapshots and one per-item failure aborts its loop. Add per-item error isolation, cleanup metrics, and a claim/recheck mechanism so an image revived after selection cannot be deleted from a stale snapshot. Reconcile unreferenced live records. Server upload limits currently cap objects/authorizations, not arbitrary Firestore image-record creation.
- **Add a small browser smoke suite.** Cover signup → verification → profile save, cancel/retry uploads, gallery reorder persistence, moderation removal, keyboard directory/lightbox navigation, and Astro navigation away/back. Source contains reduced-motion and ARIA handling, but no full accessibility or cross-browser audit was performed here. Include real iOS testing for the documented WebKit/layout constraints.
- **Update operational documentation.** README still identifies Astro v6; installed dependency is v7. CLAUDE.md says there is no source test framework and that build type-checks, contrary to the current tests and observed behavior. Its account-deletion summary also retains the old grace-period behavior. Replace obsolete summaries with links to current architecture decisions and a verified release checklist.

## Suggested implementation order

1. **First:** fail builds on data errors, fix cancellation, and make profile projection writes atomic. Add focused failure-path regression tests.
2. **Next:** clear diagnostics and add the required CI verification command, including serialized emulator tests.
3. **Then:** make publication durable, add purge/cancel state transitions, and reject stale slug events.
4. **After reliability is stable:** isolate credentials and legacy scripts; extract the large controllers; measure and reduce anonymous-page JavaScript; expand browser coverage.

Keep the current stack and existing protections: explicit private/public separation, admin-only moderation, expiring upload permits, JSON-LD escaping, shared bilingual routes, and emulator rules coverage. These are useful foundations.

## Limits

No live IAM, cloud-console enforcement settings, historical secret scan, incident investigation, penetration test, screen-reader session, or measured browser performance run was completed. Security conclusions concern reviewed source and local tests; the audit does not certify the deployed service or the entire dependency supply chain. The findings above explicitly distinguish reproductions from source-derived failure scenarios.
