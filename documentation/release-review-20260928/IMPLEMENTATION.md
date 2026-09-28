# Release readiness implementation — 28 September 2026

Branch: `codex/release-readiness-20260928`, based on `origin/dev` at `241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2`.

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
