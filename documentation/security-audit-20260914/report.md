# Security audit — 14 September 2026

**Verdict: the checked-out project has exploitable access-control and abuse weaknesses, plus an urgent image-processing dependency risk. There is no evidence from this audit that it has already been compromised.** Live deployment equivalence and cloud account configuration were not verified.

Scope: source code, Firebase rules and callable functions, build workflows, both dependency lockfiles, current tracked-file and local build-output secret-pattern scans, local emulator reproductions, and a few non-mutating public HTTP checks. Production accounts, uploads, builds and data were not modified. Existing uncommitted changes were included in the review; the backend lockfile was already modified before this audit.

## 1. Urgent: user-uploaded images reach a vulnerable native processor during privileged builds

**Severity: critical potential impact; vulnerable dependency and input path confirmed, code execution not attempted.**

The root lockfile installs Astro 6.3.5 and its nested Sharp 0.34.5. The separately installed root Sharp 0.35.4 does not replace Astro's copy. Astro's image service imports its nested Sharp and passes downloaded bytes to it. `src/components/community/CommunityWorkCard.astro:53`, `CommunityImageCard.astro:31`, and the member page call `getImage` on member artwork during the build.

`storage.rules:29` accepts an owner's upload based on filename, declared `contentType`, and size. It does not verify the byte format. A verified member can bypass browser conversion, upload other bytes labeled `image/webp`, publish an image record and gallery reference, and request a rebuild. A harmless local AVIF sample was recognized by the nested processor as HEIF/AV1; its reported versions were Sharp 0.34.5 and libheif 1.20.2. The emulator also accepted arbitrary non-image bytes with WebP metadata.

The published [Astro advisory](https://github.com/advisories/GHSA-26w7-cxv4-gfx2) describes potential remote code execution when untrusted AVIF input reaches this processor; Astro 7.2.8 contains its fix. See also the [Sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). The impact here is principally the CI/build machine, not a continuously running Astro server: this site uses static Firebase Hosting. The production and preview build steps receive `FIREBASE_SERVICE_ACCOUNT`, and the same credential is used for deployment (`.github/workflows/firebase-hosting-merge.yml:19`, `:28`, `:32`). Its precise IAM permissions were not inspected. Successful build-process exploitation could expose that credential and alter build output.

**Fix first:** upgrade Astro and confirm the processor it actually resolves is patched, using the advisories and a fresh audit. Until then, suspend untrusted image optimization or upload-driven builds. Validate/re-encode uploads in an isolated, patched service before promoting them to publishable image records. Separate image processing, read-only data export, and deployment credentials; give the build the least privilege it requires. A filename or client-side conversion is not a security boundary.

## 2. High: an account can store unbounded uploads outside the gallery limit

`storage.rules:29` permits any UUID filename for verified members. The eight-item limit in `firestore.rules:250` limits a profile array, not stored objects. Storage never checks for a corresponding image record. `functions/src/maintenance.ts` sweeps known records, so objects uploaded without records escape that cleanup.

**Reproduction:** the local emulator accepted nine distinct gallery objects for one verified account with zero documents in `images`. The general rule permits additional UUID objects. Each gallery object may be up to 8 MiB. This creates storage, transfer and processing-cost abuse; per-file bounds do not cap aggregate use.

**Fix:** allocate a bounded number of upload slots server-side and enforce total count/bytes, rate limits, ownership and record existence. Reconcile bucket objects against authorized records. Comments saying Storage cannot consult Firestore are outdated: Firebase documents [`firestore.get()` and `firestore.exists()` in Storage rules](https://firebase.google.com/docs/reference/security/storage). Those checks alone still do not provide an atomic aggregate quota.

## 3. High: ordinary accounts can repeatedly dispatch production builds

`functions/src/rebuild.ts:62` checks only `request.auth` before invoking GitHub workflow dispatch. It does not require a verified email, a changed profile, a cooldown, a global debounce or an App Check token. The production workflow has no concurrency group. Repeated calls can consume Actions capacity and delay legitimate publishing, subject to platform rate limits.

**Evidence:** source-confirmed; no production workflow was triggered during this audit.

**Fix:** drive rebuilds from validated changes through a server-side queue, deduplicate globally, and impose per-user and global rate limits. Add workflow concurrency as an additional control. These are the primary remediation and do not depend on adding an institutional-network-sensitive challenge. All callable definitions reviewed omit `enforceAppCheck`; any future enforcement change must preserve legitimate institutional access. [Firebase documents explicit callable enforcement](https://firebase.google.com/docs/app-check/cloud-functions). App Check does not cure an authorized user's unlimited dispatch permissions.

**Institutional access clarification:** the September 7 implementation notes (`documentation/20260907-turnstile-app-check-provider.md`) record replacing Google reCAPTCHA with Cloudflare Turnstile while retaining App Check enforcement on Auth and Firestore. Google reCAPTCHA was blocked on the reported institute network. `src/lib/firebase.ts` still initializes the Turnstile custom provider when a site key is configured. This establishes the recorded decision and current source behavior, not the current console enforcement settings, which were not inspected. Re-enabling Google reCAPTCHA is not recommended by this audit.

## 4. Medium: any verified member can alter shared tags

`firestore.rules:6` permits every verified account to create and update every tag. `validTag` at line 394 does not enforce a field allowlist or pin `createdBy`; `group` has no length bound.

**Reproduction:** a second member overwrote another member's tag label, set `active:false`, changed `createdBy`, and added a 10,000-character extra field. This can corrupt or hide shared directory taxonomy and inflate public records.

**Fix:** allow bounded member submissions where needed, bind creation attribution to `request.auth.uid`, and restrict changes to shared labels, activation and grouping to trusted moderators. Pin creation metadata and enforce keys, types and lengths on both create and update.

## 5. Medium: members can reverse an administrator's moderation hide

`firestore.rules:29` makes all public profile documents readable, including `active:false` drafts. Image records are public regardless of status, and uploaded objects have public reads. Filtering inactive profiles from the UI/build does not make underlying data private.

**Reproduction:** an unauthenticated emulator context read an inactive profile. This tests rules only: bare live Firestore requests returned 403, so anonymous production access without App Check was not demonstrated. A legitimate attested client still receives the permissions the rules grant.

**Confirmed product intent:** the administrator needs to hide members from the website when their profile does not meet standards or contains incorrect information. Confidentiality of the underlying public-profile data is not the stated requirement; public readability alone is therefore not the moderation defect.

`adminSetProfileActive` (`functions/src/adminOps.ts:459`) writes the same `active` field that owners can update. The emulator confirmed a verified owner can restore `active:true` after an admin-style hide. This bypasses the intended moderation control.

**Fix:** make moderation state admin-controlled and independent of member visibility preferences. A moderated profile must remain excluded from directory listings, member pages and other website content derived from that profile, even after the member edits or republishes it. Only an administrator may restore it. Trigger a rebuild when moderation changes and account for already generated pages and caches. Moving public-profile data and images into private storage is a separate requirement only if confidentiality is desired.

## 6. Medium: dependency remediation is overdue

The npm registry audit returned these package-entry counts, not independently exploitable vulnerabilities:

| Lockfile | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Root | 2 | 13 | 9 | 3 | 27 |
| Functions | 0 | 0 | 12 | 0 | 12 |

Complete machine-readable evidence is in `npm-root.json` and `npm-functions.json`. The critical root entries are Astro and websocket-driver. Astro's relevant input path is discussed above; the websocket-driver entry does not establish that this application exposes a vulnerable WebSocket server. Likewise, Vite development-server and other tooling advisories must not be presented as direct vulnerabilities in static Firebase Hosting. Backend entries include qs, Express/body-parser and Firebase Admin transitive dependencies. Update deliberately and check compatibility rather than applying a forced major upgrade blindly. Rebuild and redeploy affected components after validation; changing a lockfile alone does not patch production.

## 7. Low: missing browser security headers

Live `https://vscn.ch` and `https://vscn-39508.web.app` returned HTTP 200 with HSTS. Neither checked response included Content-Security-Policy, X-Frame-Options, X-Content-Type-Options or an explicit Referrer-Policy. `firebase.json` configures caching but no such security policy.

**Fix:** add `X-Content-Type-Options: nosniff`, an explicit referrer policy, and CSP including `frame-ancestors` where embedding is unnecessary. Develop and test a CSP compatible with Firebase, Turnstile and the site's inline scripts/styles; consider report-only rollout before enforcement. This is defense in depth, not evidence of an existing XSS exploit. Policies must also cover the directly reachable Firebase hostname.

## Controls that held and remaining uncertainty

- Private user reads are owner/admin restricted. Local checks reject anonymous and other-member access; the live unauthenticated users-list request returned 403.
- Privileged callables use the signed `admin` claim. Editable profile `role` text does not confer admin access. Account deletion requires recent authentication.
- JSON-LD escapes HTML-sensitive characters; reviewed member DOM rendering uses text content, and portfolio normalization rejects non-HTTP schemes. No working XSS was established.
- `/.env` and `/.git/config` returned 404 on the live custom domain. A pattern scan of 498 tracked files and 112 existing local output files found no private-key/GitHub-token matches. Local ignored environment files contain real credentials, but their contents were not displayed or copied into the report. This was not an exhaustive secret or Git-history scan.
- No production data changes, credential rotation, dependency updates, fixes or deployments were performed. Audit artifacts and a local emulator config were added.
- Exact deployed functions/rules, service-account IAM, App Check enforcement/debug tokens, auth provider settings, Cloudflare controls, production dependency versions and access logs remain unverified. Nothing here proves absence of past compromise. Review CI and cloud logs, especially recent upload-triggered builds, when addressing the image-processing finding.

To repeat the isolated rule checks from the project root:

```powershell
npx -y firebase-tools@latest emulators:exec --config firebase.security-audit.json --only firestore,storage --project demo-vscn-rules "node documentation/security-audit-20260914/reproduce.mjs"
```

Passing reproduction cases demonstrate current weaknesses; they are not security regression tests asserting the desired fixed behavior. The harness refuses to run without local emulator variables and the demo project, and clears its synthetic data on exit.
