# Security remediation — 14 September 2026

The original report and reproduction script are historical audit evidence, not a statement of the remediated rules. This document tracks the follow-up implementation.

## Production release

Completed: Firestore rules, all Functions (including the new rebuild scheduler and upload authorizer), Hosting and Storage rules were deployed to `vscn-39508`. [PR 25](https://github.com/joshuabinswanger/VSCN/pull/25) contains the initial fixes; [PR 26](https://github.com/joshuabinswanger/VSCN/pull/26) repairs npm 12/Linux clean installs; [PR 27](https://github.com/joshuabinswanger/VSCN/pull/27) adds upload quotas. Final production Hosting run [34849187369](https://github.com/joshuabinswanger/VSCN/actions/runs/34849187369) succeeded at commit `6e55f8d3bcc65d453914bc8f5e28e0339b47c362`.

Live verification: production homepage responds 200; the custom domain and direct Firebase hostname serve the security headers; the upload callable rejects unauthenticated requests with 401. One historical admin hide was migrated. Its English and German pages both return 404, and rerunning the migration in read-only mode reports zero eligible records.

## Implemented

- Astro 7.3.2 resolves Sharp 0.35.4 / libheif 1.23.2. Firebase Admin is 14.4.0 and Functions SDK 7.3.2. Compatible transitive patches and a scoped `gaxios -> uuid ^11.1.1` override remove the remaining advisory (gaxios uses UUID v4, supported by the CommonJS-compatible UUID 11 release). Both dependency audits report zero known vulnerabilities. The npm 12 lockfile resolver was needed to preserve Linux optional runtime dependencies for CI.
- `moderationHidden` is administrator-controlled. Profile edits and member publishing cannot clear it. Static member pages, aliases, community artwork and browser directory reads exclude it. A migration uses historical admin audit actions, not guesses from `active:false`; one recorded admin hide was migrated in production.
- Member rebuild requests compare published content, ignore bookkeeping timestamps and combine changes into a five-minute scheduled queue. Concurrent requests share one pending build. Failed dispatches and changes during dispatch remain queued. Production Hosting deployments serialize. Admin actions retain immediate rebuild dispatches.
- Members may create bounded tags attributed to themselves; only admins may edit shared tags, and creation attribution is immutable.
- Hosting sets nosniff, same-origin framing, an explicit referrer policy, and CSP restrictions for framing, base URLs and plugin objects. These headers were verified on both production hostnames. This is a limited CSP, not a complete script-source policy.
- Uploads require server-only expiring permits. A transaction serializes reservations per member, caps existing plus reserved objects at 20, and limits authorizations to 40 per hour. Existing untracked files count toward the cap. The visible gallery remains limited to eight works. Cleanup releases permits; account purging removes permit state. Production inventory before enabling the cap: 25 files across 14 accounts, maximum 8 per account, none above the new limit.

## Verification

79 unit tests passed. The expanded emulator suite passed all 56 tests, including moderation callables, upload races, authorization limits, expired/missing permits, shared-tag permissions, and rebuild retries. Functions compilation, targeted frontend ESLint and the production Astro build passed. The site build produced 75 pages before moderation migration. The broader Astro diagnostic check still contains errors in untouched files; see the saved diagnostic report.

App Check/Turnstile configuration was preserved to retain institutional access. New protections do not require another challenge provider.

## Remaining limitations

Zero npm advisories is not a guarantee against unknown vulnerabilities. Builds still process user images with a Firebase service-account credential available; separate isolated processing and least-privilege build/deploy credentials remain defense-in-depth work. Storage rules check metadata and authorization, not actual image bytes. The known vulnerable decoder has been patched.

Upload permits cap stored objects and authorization requests, but do not impose a global bandwidth budget or prevent repeated overwrites during a permit's 30-minute lifetime. Public downloads remain public. Historical untracked files were counted, not deleted. Firestore image-record creation still needs separate aggregate abuse controls if stronger database-cost limits are required.

Moderation removes content from subsequent website builds; it does not revoke previously downloaded copies or third-party caches. No incident investigation, full IAM review, or credential rotation was performed.
