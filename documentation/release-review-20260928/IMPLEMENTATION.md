# Release readiness implementation — 28 September 2026

Branch: `codex/release-readiness-20260928`, based on `origin/dev` at `241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2`.

## Status as of 2026-09-29

This file is a record of what the branch `codex/release-readiness-20260928` did at commit `1c50fe7` (with `eada5c5` for the verification logs). It is **frozen as history and no longer describes the current code**. The sections below are left as written; where they now mislead, this section says what is true instead. It was checked against `origin/dev` at `10953cc`, and production runs `d5b3ae0` (released 2026-09-29).

| Statement below | What is true now |
| --- | --- |
| Section 1, **Release blocker**: the repository has none of the backend identity variables, the workflows intentionally fail, and no backend has been deployed to dev or production. | Cleared. All four repository variables (`DEV_FUNCTIONS_WIF_PROVIDER`, `DEV_FUNCTIONS_SERVICE_ACCOUNT`, `PROD_FUNCTIONS_WIF_PROVIDER`, `PROD_FUNCTIONS_SERVICE_ACCOUNT`) were set on 2026-09-28 (dev 20:29Z, prod 20:58Z). CI deployed all 34 functions to dev (run 36481093216) and to production (run 36491067157, the `80f5850` release, then 36550042245 and 36579909413). Production stays fail-closed without its variables. See [20260928-backend-deploy-identity-and-rollback.md](../20260928-backend-deploy-identity-and-rollback.md) and [release-log.md](../release-log.md). |
| Section 2: navigation guards cover Astro transitions; saving locks editing and recovery controls; partial project writes remaining known is new. | The first version of the guard called `preventDefault` in `astro:before-preparation`, which does not cancel an Astro navigation, so "Stay" navigated anyway; it was replaced by a capture-phase click guard (`96ba8f7`, PR #140). Back and Forward are persist-only (the draft is saved, nothing is asked; `editorDraft.ts`, the comment above the `astro:before-preparation` listener). `setSaving()` sets `aria-busy` on the form and `inert` on every section, the recovery banner and the tabs. `writtenProjectIds` already existed in the baseline `241c3d8`. |
| Section 2: `ProfileForm.astro` composes five components, including `ProjectEditor`. | It imports four (`ProfileDetails`, `WorkEditor`, `AccountSettings`, `ProfilePreview`). `ProjectEditor` is imported by `WorkEditor.astro`. |
| Section 2: auth subscriptions and visibility listeners are released on navigation; loading generations are invalidated. | True for the profile editor's lifecycle owner only. The community directory (`communityDirectoryController.ts`), `InfoPage.astro` and `AdminConsole.astro` still call `onAuthStateChanged` without keeping the unsubscribe. |
| Section 2: purge removes new per-account leases and failed notices. | It removes `failedAdminEvents` for the account (`functions/src/purge.ts`), but not a still-pending `adminEvents/signup-{uid}` notice, which can carry the member's email. |
| Section 3: shared `Button`, `Input`, `Field` and `Feedback` primitives. | `Button` is imported by `ProfileForm.astro` and `Input` by `ProfileDetails.astro`. `Field` and `Feedback` have no production consumer, only `/styleguide`. |
| Section 3: collapsed image titles remain visible on mobile; secondary image actions are grouped in a disclosure. | Reversed. A folded image row shows only its "Image details" fold on both breakpoints (phone in PR #141, desktop in PR #143). The "Image actions" fold was deleted (`2030d48`, PR #141); move up, move down, replace and delete are four always-visible toolbar buttons. |
| Section 3: 11px tags replace 8px tag text; pager controls have accessible names and keyboard focus. | Tags went back to `--fs-tag` 0.72rem on desktop and 8px on a phone (`type.css`); the 11px trial was reverted in PR #141. Pager chevrons are named buttons, but on the directory card and the project carousel they are `tabindex="-1"` (`src/lib/pager.ts`), and on a phone they are `display: none` on those two (`global.css`, "NO CHEVRONS ON A PHONE'S PICTURES", the phone-chevron decision in PR #141). Only the lightbox pair is a tab stop. |
| Section 3: carousel autoplay is opt-in with a visible play/pause control. | Removed altogether, with its button (`5809a3a`, PR #140). `communityCarousel.ts` says "NO TIMER ANY MORE": a card moves only when someone moves it (swipe, arrows, chevrons, keys, the lightbox). |
| Verification: 194 unit and 125 emulator tests passed. | True of `eada5c5`. The tip runs 204 unit and 127 emulator tests (CI run 36579909413, `d5b3ae0`). The 125 excludes the release-manifest test listed on the next line. |
| Verification: the existing image filter rejected 12 unavailable images. | No log in this folder records it. `build-results.txt` is a development-mode build without the filter's output. |
| Verification: the 768px chevron overflow "still needs browser rechecking". | Rechecked. The margin fix works. The residual 4px at 768px and above is `.gallery-drop`'s `-4px` margins (`profile-editor.css`), which the container's `overflow-clip-margin` contains. |
| Verification: browser automation stalled on a native unsaved-change dialog. | That dialog came from the first guard's `before-preparation` `preventDefault`, replaced in `96ba8f7`. The independent review's headless-Chromium harness, with the real router, then ran the recovery round trip green (22 of 22 checks). |
| Required before production, step 5: the walk opens the image-actions disclosure before removal. | The disclosure no longer exists. `scripts/walk-release.mjs` clicks `[data-gallery-remove]` directly (PR #144, `26111f0`). |

Steps 1, 2 and 5 of "Required before production" have happened (variables, dev release, production release and walk; the first production walk was red at Save because of a walk-script race, fixed by PR #147, and green on re-run). Step 3 (the signed-in, hidden-member checks on dev and then production) was done by hand on 2026-09-28; the automated walk still does not cover video import, poster restore, project save or image replace. Step 4 (SMTP delivery) is not recorded in this repository.

Not recorded anywhere under `documentation/` until now: the folder's baseline. `REVIEW.md` cites 193 unit tests, 120 emulator tests and a high Nodemailer advisory at `241c3d8`; those baseline logs were never committed. The logs that are tracked here are post-implementation results and carry no commit SHA; CI run 36491067157 (`80f5850`: 204 unit, 127 emulator) is the stronger evidence.

## 1. Critical problems

- Backend deployment now precedes export and Hosting in both release workflows. Failures stop publication. A separate backend identity is required; the existing Hosting identity is not given broader access.
- Every function carries an artifact digest covering backend modules, locked dependencies, compiler configuration and tracked runtime parameters. The release checker compares this digest for every exported function. Comment-only changes no longer count as runtime drift; changes in shared helpers do.
- Callable endpoints enforce App Check in addition to their existing authentication, ownership and administrative checks. The attestation-mint endpoint continues to validate Turnstile itself.
- Video imports and automatic-poster restoration acquire a per-member lease and consume their hourly allowance before network or image processing. Failed work is charged; concurrent work is refused; expired leases recover after interrupted invocations.

**Release blocker:** the repository currently has none of the backend identity variables listed below. These workflows intentionally fail until configured. Backend code has not been deployed to dev or production by this implementation.

## 2. Code improvements

- Added per-account, per-tab recovery for profile text and work metadata with a 24-hour expiry. Passwords, account settings, phone numbers and file bytes are excluded. Recovery copy states this limitation. Navigation guards cover Astro transitions and full page unloads.
- Saving locks editing and recovery controls. Saves refuse while uploads, poster restoration, avatar processing or gallery writes are in flight. Bio/social validation runs before persistence. Successful partial project writes remain known so retries do not attempt invalid duplicate creates.
- `ProfileForm.astro` now composes `ProfileDetails`, `WorkEditor`, `ProjectEditor`, `AccountSettings` and `ProfilePreview`. Shared styling lives in `profile-editor.css`; persistence, recovery, publication feedback and controller code have separate owners. Community directory, motion and lightbox controllers and onboarding controller have been extracted from their templates. Existing pure project/member/rendering modules remain shared.
- Auth subscriptions and document visibility listeners are released on navigation. Draft timers are disposed. Loading generations are invalidated when leaving the editor.
- Failed notification events are retained after twelve attempts. The admin queue exposes an authorized, audited Retry action. Stable event receipts suppress duplicate image notifications, including redelivery after a successful send. Account purge removes new per-account leases and failed notices.
- Nodemailer upgraded to 10.0.12. The transport adapter is tested for required TLS, plain text and cleanup on failure. No live mail was sent.
- Release checks inspect actual secret bindings and bound version state. Zero upload traffic is reported as NOT TESTED instead of successful backend operation.
- Publication generations distinguish saved, queued, published, delayed and unconfirmed states. Acknowledging an older build preserves newer queued work. The editor offers another check/request when publication is unconfirmed.
- Directory visibility copy explicitly says that public profile fields/media remain directly accessible. Directory hiding is not a confidential-draft feature.

## 3. Design improvements

- Shared `Button`, `Input`, `Field` and `Feedback` primitives, a reusable modal confirmation and roving keyboard tabs complement the existing bilingual field, selectors, disclosure and upload components.
- Work editor tracks can shrink, action groups wrap, project names can wrap, and collapsed image titles remain visible on mobile. Secondary image actions are grouped in a disclosure.
- Higher contrast secondary/placeholder/status colors and 11px tags replace the reported low-contrast colors and 8px tag text. Pager controls have accessible names and keyboard focus; open-to chips expose their pressed state.
- Carousel autoplay is opt-in with a visible play/pause control and respects reduced motion. The icon size remains independent of its interaction area.
- Gallery tag-filter help explains member tags versus work/project tags. The transparent header and established page measures are preserved.
- `/styleguide` now shows control states. `/styleguide/editor/en` and `/styleguide/editor/de` render the actual editor components with sample long content and no account writes.

## Verification

Recorded automated results are in this directory:

- 194 unit tests passed.
- 125 Firestore/Storage/backend emulator tests passed, including concurrency/allowance, retained mail/retry authorization, admin queue serialization, event deduplication, mail transport and publication-generation regressions.
- An additional deployment-manifest test passed: all 34 exports, including first-generation Auth triggers, declare the same artifact digest.
- Backend TypeScript compilation passed.
- ESLint: no errors or warnings.
- Astro diagnostics: no errors or warnings; one pre-existing redirect-analysis hint in `signup.astro`.
- Development build: 76 pages built successfully from a fresh development export. The existing image filter rejected 12 unavailable images from the source data; those were not introduced or deleted by this change.
- Backend npm audit: zero reported vulnerabilities.
- Chrome sample-editor checks: no form overflow at 320, 375 or 390px; keyboard tab selection worked. The 768px check exposed a 4px chevron overflow and received a margin fix afterward. That final margin fix still needs browser rechecking.

Browser automation stalled on a native unsaved-change confirmation while testing recovery. The transition guard now uses a reusable HTML dialog, but the original blocking Chrome dialog needs dismissing before the complete recovery round trip and final desktop/English layout checks can be repeated. The production editor's authenticated save/upload/video flows must also be exercised on deployed dev. Emulator calls exercise handler behavior; they do not prove production App Check/IAM/SMTP configuration.

## Required before production

1. Configure `DEV_FUNCTIONS_WIF_PROVIDER`, `DEV_FUNCTIONS_SERVICE_ACCOUNT`, `PROD_FUNCTIONS_WIF_PROVIDER`, and `PROD_FUNCTIONS_SERVICE_ACCOUNT` as GitHub repository variables. Bind each identity to this repository and its corresponding branch. Use dedicated backend deployers, with function deployment permissions and service-account impersonation limited to the runtime identities required by Firebase. Do not broaden the build-reader or Hosting-deployer identities.
2. Run the dev release workflow from the reviewed commit; verify all 34 exported functions have the expected digest, rules match, secret bindings are enabled, and Hosting publishes the same commit.
3. With the hidden test member, verify actual App Check calls, upload/replace, project save, a public video import, automatic-thumbnail restoration, draft recovery, and publication feedback. Check English and German at 320/375/390/768px.
4. Verify SMTP authentication/delivery using an explicitly authorized recipient. A zero-error log window with no traffic is not evidence of delivery.
5. Release the verified commit to production and run parity plus the production release walk. The existing walk now opens the image-actions disclosure before removal.

This implementation does not certify that the application has no security defects. It closes the identified gaps and records the checks performed; live environment verification remains a release requirement.
