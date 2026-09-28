# Dev release review — 28 September 2026

**Recommendation: conditional go for 29 September, after the release blockers below are closed.** The application has a useful security foundation and its automated suites pass. It is not ready for a frontend-only promotion. Keep tomorrow's changes focused; build the larger component system incrementally after the release.

## Scope and evidence

Reviewed `origin/dev` at **241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2**, the version served by the dev site. The shared checkout was at `2d3903d`, so the current dev source was reviewed and tested in a separate snapshot without changing the checkout. Production served `f21a60f`.

| Check | Result |
| --- | --- |
| ESLint, current dev snapshot | Passed |
| Astro diagnostics, current dev snapshot | 0 errors, 0 warnings; 1 unused-variable hint in signup |
| Unit tests | **193 passed** |
| Backend TypeScript compilation, locked dependencies | Passed |
| Local Firestore/Storage rules and backend tests | **120 passed**, 0 failed/skipped |
| Root dependency audit | 0 known advisories reported |
| Backend dependency audit | 1 high-severity dependency: Nodemailer 7.0.13 |
| Dev Hosting stamp and deployed rules | Match current dev |
| Dev expected IAM grants and declared secret existence | Passed the repository's checks |
| Current production release verification | 8/8 checks pass **against current main**, not the proposed dev release |
| Signed-in Chrome walkthrough | Profile/work records loaded; unchanged profile save succeeded; reload retained data; preview rendered; community view and tag filter worked |
| Responsive inspection | Desktop and 390×844 Chrome viewport; mobile clipping reproduced |

The browser save retained the account's existing values and hidden status. A temporary **unsaved** role edit was used to test navigation loss; it was discarded and the original value confirmed on return. Browser viewport and tag filter were restored. No release, security configuration, account deletion, email send, or application source change was performed.

**Limits:** No fresh local static-site build/export, new live upload, new video import, password reset, signup/email delivery, destructive account lifecycle, or full screen-reader/real-iOS walkthrough was completed. Emulator tests exercise backend handlers with mocks around some external services; they do not prove live SMTP, provider availability, or production upload IAM end to end. A green health check with zero upload traffic is not an upload test. This is a systematic review, not a guarantee of zero vulnerabilities.

Source links below are pinned to the reviewed commit. Test/audit evidence is in this folder.

## Tier 1 — Critical problems / release blockers

### R1. Deploy the new backend before exposing the new frontend — P1, confirmed release dependency

The current production export set has 30 functions; dev has 32. `resolveEmbed` and `restoreAutoPoster` are new. The production workflow deploys rules and Hosting, **not Functions**. Merging dev to main alone therefore exposes video-import/thumbnail controls without their production endpoints.

**Action:** Compile and deploy the complete intended backend from the release commit, verify its configuration, then deploy compatible rules and Hosting. Run the upload and video-import smoke tests on the resulting production release. Record the source SHA and rollback plan.

**Acceptance:** Both video callables exist and a verified test account can add a video, save it, reload it, replace its poster, and restore the automatic poster. Production verification must target the new release SHA.

Sources: [function exports](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/functions/src/index.ts#L6), [production workflow](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/.github/workflows/firebase-hosting-merge.yml).

### R2. Video lookup failures bypass the intended request allowance — P1, code-confirmed abuse gap

`resolveEmbed` calls `reserveWork()` before downloading, but discards the returned counter-write callback. It increments the allowance only after oEmbed and thumbnail processing succeed. Repeated syntactically valid URLs for missing/private/unavailable videos can therefore trigger external requests without consuming the hourly allowance. Concurrent successful requests can also perform expensive work before the later transaction rejects them.

The callables additionally do not set `enforceAppCheck` or validate `req.app`. Authentication and ownership still apply; this is **not** anonymous access to another member's account. It is an availability/cost exposure to an authenticated account. `maxInstances` constrains simultaneous instances, not cumulative abuse.

**Action:** Atomically consume an attempt allowance before external I/O, including failed attempts; keep a separate stored-work cap and add a per-user in-flight limit. Enforce App Check on member callables after validating legitimate clients. Keep authentication, ownership and quotas even with App Check.

**Acceptance:** Repeated failed lookups stop at the configured allowance; concurrent requests cannot all enter provider work; missing/invalid App Check is rejected; ordinary verified imports still work.

Sources: [preflight and later reservation](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/functions/src/embeds.ts#L222), [allowance implementation](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/functions/src/uploads.ts#L53), [Firebase enforcement documentation](https://firebase.google.com/docs/app-check/cloud-functions).

## Tier 2 — Code improvements

### C1. Protect unsaved work and make saving use one consistent snapshot — P1, navigation loss reproduced

In Chrome, changing Role without saving, navigating to Community, and returning to Profile silently restored the old value. There was no warning or recoverable draft. This is especially costly in the long work/project editor.

Saving also reads state at different times: projects are captured first, then image records, then profile inputs after awaits. `setSaving()` disables only the save button. The rest of the editor can keep changing, so a save can represent multiple moments and report success while later edits remain unsaved.

**Action:** Add dirty state, a navigation guard covering Astro transitions and page exit, and local draft recovery. Validate and freeze a complete save snapshot before writes; either lock conflicting interactions or retain a new dirty revision when editing continues. Distinguish saved content from changes made during the save. Batch related Firestore writes where practical; model uploads as separate operations.

Sources: [save sequence](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/components/ProfileForm.astro#L5148), [saving state](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/components/ProfileForm.astro#L3097).

### C2. Split the editor and directory into bounded modules — P2

`ProfileForm.astro` is 5,532 lines, `CommunityGrid.astro` 3,150, and `OnboardingForm.astro` 2,368. The editor combines markup, styling, authentication, loading, uploads, projects, sorting, previews, persistence and account actions. This makes visual changes unusually likely to affect behavior.

**Action:** Extract ProfileDetails, WorkEditor, ProjectEditor, AccountSettings and ProfilePreview. Put draft state, validation and persistence into separate modules. Move component CSS next to its component and retain only genuine primitives in shared styles. Use one lifecycle/disposal owner for auth subscriptions, document listeners, timers, object URLs and carousels; for example, the profile's visibility listener currently has no matching removal on navigation.

Retain the good existing pure modules (`projects`, `galleryRecords`, `memberView`) and common page/preview CSS. A framework rewrite is unnecessary.

### C3. Make notification failure recoverable — P2, historical operational failure confirmed

Dev logs from September 22 through review time contained **51 admin-digest send failures and 4 dropped-event error entries**, plus 2 historical Auth-trigger deployment errors. The September 28 window contained no function errors; this does not establish that email delivery recovered, because there may have been no due mail.

The digest deletes events after 12 failed attempts. Once dropped, fixing SMTP cannot replay them. The image trigger also derives its event key from the current time, so a retried delivery can enqueue duplicates.

**Action:** Move exhausted events to a failed-notification collection with retry controls and an operator alert. Key image events by stable event identity. Validate SMTP delivery through an explicitly authorized smoke test before declaring it healthy. Do not equate secret existence with valid credentials.

Source: [digest retry/deletion](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/functions/src/adminDigest.ts#L195).

### C4. Upgrade Nodemailer with a focused regression test — P2, advisory confirmed; exploit not demonstrated

The backend lockfile installs **Nodemailer 7.0.13**. npm reports a high-severity affected dependency with several advisories. The reviewed `sendToOperator()` constructs a fixed SMTP message with configured sender/recipient and plain text. It does not pass member-controlled `raw`, transport configuration, attachments or address lists. I did not establish a reachable exploit through this wrapper.

**Action:** Upgrade to an audited compatible patched release, align its types, and test TLS connection, sender, recipient and failure handling. Do not run an unreviewed `audit fix --force`. Add dependency auditing to release verification.

Sources: [mail wrapper](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/functions/src/mail.ts#L25), [raw-message advisory](https://github.com/advisories/GHSA-p6gq-j5cr-w38f), [address-parser advisory](https://github.com/advisories/GHSA-2x7j-588g-ccc2). Full audit output accompanies this report.

### C5. Strengthen what the release checker actually proves — P2

The current checker is useful, but its labels overstate some checks:

- Function freshness compares deployment timestamps with edits to the directly exported module. A comment edit produces false drift; an imported dependency change can escape detection.
- Dev's two stale flags (`onImageWentLive`, `sendAdminDigest`) are explained by the September 26 **comment-only** change in their shared module. They are not proof of runtime breakage.
- The “secrets bound” probe checks that declared secrets have enabled versions, not that every consuming deployment binds and can access the intended versions.
- Zero upload traffic is classified PASS. That is “no evidence of failure,” not successful execution.

**Action:** Record a backend artifact/source digest covering transitive inputs and lockfiles. Verify deployed secret bindings and configuration. Report unexercised behavior as NOT TESTED. Add pre-promotion dev tests for video work, project saves, replacement, maximum gallery size and publication acknowledgment; retain production smoke tests after deployment.

Source: [release probes](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/scripts/verify-release.mjs#L170).

### C6. Explicitly separate “hidden from directory” from private content — P2, policy/design decision

`publicProfiles` and `images` allow public reads regardless of active/hidden status, and promoted Storage objects are publicly readable. The directory filters them, but hiding a profile does not revoke direct data or media access. Private user documents remain owner/admin protected; the current hidden-banner wording correctly says “directory.”

**Action:** Document this invariant and never promise private drafts with this data model. If hidden/unverified work is meant to be confidential, introduce owner-only draft records and media plus a server-generated public projection. Apply access changes to bytes as well as documents, and account for already cached media.

Source: [read rules](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/firestore.rules#L39), [Storage rules](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/storage.rules).

### C7. Make publication status observable — P2

The save message says publication is queued, but `triggerRebuild()` catches errors and returns no result. Server-side rebuild triggers provide a useful fallback, yet the UI cannot distinguish saved, awaiting publication, published, or failed publication.

**Action:** Display the saved revision and its publication state. Preserve “Saved” when publishing fails, show an actionable retry/status message, and expose queue age to operators. Keep the existing acknowledgment-after-deploy design.

Source: [rebuild request](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/lib/profile.ts#L113).

## Tier 3 — Design improvements

### D1. Fix the mobile Work layout before release — P1, reproduced

At **390×844**, the profile form measured **330px client width / 352px scroll width** with `overflow-x: clip`. The Work view clipped the right side of the tab/project area; Preview's label and project actions were visibly cut. The Profile tab fit better, so test every editor state rather than only the first screen.

**Action:** Give grid tracks `minmax(0, 1fr)`, ensure child sections can shrink, and let project toolbars wrap or move secondary actions into an accessible menu. Use either fitting or intentionally scrollable tabs. Do not hide overflow to conceal an oversized editor. Verify English/German, long project names, and 320/375/390/768px widths.

Source: [form layout](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/components/ProfileForm.astro#L1307).

### D2. Give secondary text and disabled controls different treatments — P2

An enabled mobile Work tab computed to **12px, #888**. The shared muted colour on paper (#fcfbfa) gives approximately **3.43:1** contrast; placeholder #bbb on white gives **1.92:1**. Enabled tabs, hints and descriptive text should remain readable instead of resembling disabled controls. The ordinary-text WCAG threshold is 4.5:1, with specified exceptions. [W3C guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)

**Action:** Introduce `text-primary`, `text-secondary`, `text-disabled`, `border-default`, `border-strong`, and status tokens. Raise contrast for usable controls and informative text. Review the intentional 8px mobile tags: keep the quiet aesthetic, but choose a readable semantic size and sufficient hit area. WCAG does not impose a universal minimum font size; this is a usability recommendation.

### D3. Make interaction semantics part of the reusable component — P2

The profile sections are pressed buttons in a group, not a tabs/tabpanel pattern. Save/error messages are plain paragraphs without a live status/error announcement. OpenTo chips change a CSS class without exposing selected state. Pager chevrons are unnamed, removed from tab order and placed under `aria-hidden`; the card does support arrow keys on its image link, so keyboard paging exists, but the visible controls themselves are not discoverable to assistive technology.

**Action:** Put keyboard behavior, names, selected/expanded state, focus restoration and announcements inside Tabs, ToggleChip, IconButton, Disclosure, Feedback and CarouselControls. Do not rely on every feature author remembering them. Add a user-visible pause control for automatic carousels; reduced-motion handling is already a useful foundation.

Sources: [OpenTo selection](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/components/OpenToSelector.astro#L158), [pager](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/lib/pager.ts#L14), [card markup](https://github.com/joshuabinswanger/VSCN/blob/241c3d8693bcf481f5ef2e93ba6d0caa3f5889b2/src/components/community/CommunityImageCard.astro#L154).

### D4. Finish the design system at the component level — P2, recommended overhaul

The new `type.css` and shared member/preview styles are real progress. However, type is partly assigned through long lists of feature selectors; forms and admin remain outside that system. Numeric legacy font tokens, hard-coded colours, and separate editor button families make global restyling fragile.

Keep the monochrome editorial identity, Archivo typography, artwork-led pages and deliberate whitespace. Build the following small system around them:

| Layer | Reusable parts | Contract |
| --- | --- | --- |
| Foundations | Semantic colour, 6–8 text roles, spacing, radius, border, motion, z-index, container widths | One place to change the visual language; no feature selectors in tokens |
| Primitives | Text, Button, IconButton, Link, Field, Input, Textarea, Select, Checkbox/Radio, ToggleChip | Explicit variants/sizes/states, accessible names, errors and focus |
| Patterns | Tabs, Disclosure, Dialog, Banner, Feedback, EmptyState, UploadField, LocaleField, ActionBar, CarouselControls | Shared interaction and layout behavior |
| Domain components | MemberIdentity, MemberCard, WorkCard, ProjectBlock, WorkEditor, ProfileEditor, PublicationStatus | Compose primitives; own domain rules, not a new visual vocabulary |
| Page shells | Editorial/public shell, editor shell, admin shell | Different information density using the same components |

**Button contract:** primary, secondary, text and danger variants; small/default sizes; loading/disabled states; a standard icon-only hit area. A small drawn icon should not require a tiny clickable target.

**Field contract:** one label, optional help, input, error and locale switch; shared spacing and `aria-describedby`. Replace inconsistent popover/help placement with this contract.

**Styling contract:** use explicit semantic classes or component props, with layers for tokens/base/components/utilities. Keep layout in components. Use semantic typography roles such as body, caption, label and title rather than adding another nearly identical numeric size.

**Styleguide contract:** turn `/styleguide` into the component specification. Show every variant and loading/empty/error/disabled state, EN/DE, long text and mobile. Add focused visual/interaction regression tests for the actual reusable contracts.

### D5. Simplify the editing and browsing journeys — P3

The work editor gives every image a dense repeated toolbar, while some useful context disappears on mobile. Keep the work title visible beside its thumbnail, prioritize one edit action, retain accessible reorder controls, and collect rare operations under a clearly named menu. Surface validation beside the affected project/work rather than only at the bottom of the form.

Keep Gallery/Grid/Index as deliberate views, but explain that Index includes people without artwork. Today filtering means member tags in Gallery/Index and work tags in Grid; make that scope visible or align the semantics so changing view does not feel like changing the query. The transparent sticky header is an intentional design choice, but needs contrast testing over dark and complex artwork.

## Security strengths worth preserving

- Default-deny Firestore and Storage rules, protected private user data, owner checks and admin-only mutation paths.
- Server-owned identity/moderation fields and deletion tombstones.
- Quarantined uploads, server promotion, size/dimension checks, and bounded stored-work allocation.
- Allowlisted video/thumbnail hosts, bounded downloads and rejected thumbnail redirects.
- Text-safe rendering patterns and JSON-LD escaping; no confirmed member-content XSS found in the reviewed paths.
- Public data export separated from rendering credentials; security rules deployed before Hosting; publication acknowledged only after deployment.

The small CSP currently protects framing/base/object behavior, but does not restrict script sources. A tested report-only script policy followed by enforcement is additional hardening, not evidence that XSS is currently exploitable.

## Tomorrow's release gate

1. Freeze the release SHA. Close R1 and R2; fix mobile clipping and add protection for unsaved work.
2. Re-run lint, Astro diagnostics, both test suites and a fresh production-mode build/export on that exact SHA. Review the Nodemailer upgrade or document its temporary risk disposition.
3. Exercise dev live flows: fresh image upload, maximum gallery save, project edit, video import, poster replacement/restore, hide/show and publication completion. Test real mobile Safari as well as Chrome. Use a designated disposable account for deletion tests.
4. Deploy compatible Functions/configuration, then rules, then Hosting. Run production verification against the new SHA and the release smoke walk. Explicitly include the new video/project flows, which the existing six-step walk does not fully cover.
5. Verify notification delivery with an authorized test, monitor upload errors and queue age, and retain the previous Hosting artifact plus a backend/rules-compatible rollback plan.

**After release:** migrate primitives and form patterns first, then WorkEditor/ProfileEditor, then directory/admin. Restyle through those components. Avoid combining a broad visual rewrite with tomorrow's backend promotion.
