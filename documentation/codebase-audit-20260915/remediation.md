# Audit remediation — 15 September 2026

## Implemented locally

- **Builds stop on failed data reads.** Missing configuration and mismatched Firebase projects fail before publication. A failed fetch no longer produces a successful empty site.
- **Credential-free CI rendering.** Each Hosting workflow now verifies code, exports public view models, renders on a separate runner without a service-account key, and deploys the rendered artifact from another runner. The export/render path shares the same view-model logic as local builds.
- **Upload cancellation and retry capacity.** Cancellation survives queued work, image preparation, authorization, and delayed transfer setup. Navigation disposes the queue. Retry respects newly occupied gallery slots.
- **Atomic profile copies.** Private and public projections commit in one Firestore batch. Tests demonstrate rollback when either side is rejected.
- **Durable publication.** Public-profile and image triggers enqueue changes independently of the browser. A successful GitHub dispatch keeps the queue dirty. CI acknowledges the captured revision only after Hosting deployment; stale acknowledgements cannot clear newer changes. Unacknowledged runs retry after a 15-minute lease, and delayed publication logs an error after 30 minutes without a newer change. Existing admin immediate dispatches remain, backed by the server-triggered queue.
- **Purge/cancel exclusion.** A transaction moves deletion into a leased `purging` state. Cancellation rejects destructive/partial cleanup. Member writes, email sync, and uploads consult the deletion job, including after completion. Accounts are disabled before destructive stages; retry resumes the existing job. Function timeouts are below the lease duration.
- **Current-state slugs.** A slug transaction reads the latest profile rather than trusting event arrival order. Late events cannot recreate slugs for a purging/deleted account.
- **Quality gates.** `npm run verify` runs lint, Astro diagnostics, unit tests, backend compilation, and serialized rules/Functions emulator tests. Every Hosting workflow depends on verification. Frontend TypeScript excludes generated backend output. The 24 diagnostic errors are resolved.
- **Safer legacy tools.** The old public-profile migration requires a target and defaults to dry-run; it only creates missing drafts, preserving existing moderation. Legacy tag/open-to seeders require a target plus `--apply`. The shared administrative bootstrap verifies the credential project matches the requested target.
- **Documentation.** README, environment example, and obsolete architecture summaries were updated. Save feedback now distinguishes saving from queued publication.

The working tree already contained security remediation and other edits before this work began. Those edits were preserved. No branch, commit, production data mutation, cloud IAM change, or deployment was made in this turn.

## Validation

- ESLint: passed.
- Astro check: **0 errors, 0 warnings**; one unused-variable hint remains on the existing redirect-only signup page.
- Unit tests: **85 passed**.
- Functions TypeScript compilation: passed.
- Local emulator regression suite: **64 passed**, including acknowledgement, deletion, projection, and rules checks (`remediation-emulators.txt`).
- Invalid-credential build: rejected with a nonzero exit (`remediation-build-failure.txt`).
- Snapshot export: 23 members, zero aliases. Snapshot rendering with the credential environment variable cleared: **75 pages built** (`remediation-export.txt`, `remediation-build.txt`). Native image processing used cached images in this verification.
- All four workflow YAML files parse, and their verification/export/render/deploy dependencies were checked. Rendering jobs contain no service-account environment variable.

The local NVM-managed npm launcher reported an untrusted delegated script. Verification used the bundled Node runtime and the existing separate npm installation for emulator tooling; NVM configuration was not changed. The individual verification commands passed; the new GitHub Actions jobs have not yet run remotely.

## Rollout

1. Review and commit the intended working-tree changes, including pre-existing untracked backend modules and tests. The audit artifacts themselves are optional release content.
2. Deploy the deletion-aware Firestore/Storage rules and updated Functions together in the staging project, including `onImageWritten`, `onPublicProfileWritten`, and `flushMemberRebuilds`. Rules must be present before relying on the cleanup write barrier. The Hosting workflows do not deploy backend functions or rules.
3. Run the new staging workflow. Exercise an ordinary profile save, upload cancellation, rename, admin moderation, and scheduled-deletion cancellation. Confirm the queue remains pending until Hosting succeeds, then inspect `publishedRevision`/`publishedAt`.
4. Release the same backend/rules changes and Hosting pipeline to production through the repository's normal release process.

Queue documents with the older timestamp-only format acquire a revision on their next scheduler dispatch. Failed old workflows may cause one extra rebuild; pending work is preserved. Old scheduled deletion jobs without a state remain cancellable only if none of their destructive steps completed.

## Remaining improvement work

- Split the data-export identity from the deploy identity and review live IAM. Rendering is now isolated, but export and deployment still use existing configured secrets on separate runners.
- Configure a cloud alert for delayed-publication errors; logging alone is not a notification channel. Add a per-member published-state indicator if needed.
- Broader controller extraction, anonymous-page JavaScript reduction, directory-scale measurements, browser/accessibility coverage, and image-sweeper claim/recheck hardening remain follow-up work. They were recommendations beyond the concrete reliability/security defects addressed here.
- Full hosted end-to-end testing, live IAM verification, and actual rollout remain outstanding. No production account deletion was used as a test.

## Rules review

The machine-readable assessment is in `rules-assessment.json`; the existing intentional public-directory read model is preserved.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for preventing member writes and recreation during deletion by consulting server-owned deletion jobs while retaining owner checks and field validation. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
