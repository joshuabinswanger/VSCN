<!-- Verbatim copy of the final whole-branch review of `feature/firebase-entity-restructuring` (46461e9..9460a43), produced by the reviewer under `.superpowers/sdd/20260902-firebase-entity-restructuring-plan/` — which is git-ignored, so it is committed here to travel with the branch. Its C1 and I1–I6 items were fixed in the follow-up wave; see `documentation/agent-memory/firebase-entity-restructuring.md`. -->

# Final whole-branch review — `feature/firebase-entity-restructuring` (46461e9..9460a43)

Reviewer: Fable 5.1, read-only pass over the full range (31 commits) in five areas: rules + tests, functions, client, scripts, docs. `npm run lint` (8 warnings / 0 errors, the documented baseline) and `tsc --noEmit -p functions` (clean) were run read-only. `npm run test:rules` was not re-run (needs the emulator; the ledger records 32/32 at 9460a43).

## Strengths

- **The core inversion is real, not cosmetic.** `images/{imageId}` is created `uploading` *by rule* (`firestore.rules:100-105`), the storage filename must be a UUID and the document id must equal it (`validImage` derives `storagePath` from `ownerUid`/`kind`/`imageId`), so a byte in `users/{uid}/…` without a record is impossible from a browser. The tests prove the pins independently of the derived-path check (`tests/rules/firestore.test.mjs:174-185`) — that was a plan-mandated fix and it landed well.
- **Server-owned fields are handled the only way the `hasOnly` trap allows**: in the allowlist, absent-on-create, pinned-on-update via `get(..., null)` comparisons (`firestore.rules:353-365`), with a merge-write test that exercises the exact failure mode the memory note warns about (`firestore.test.mjs:200-207`).
- **Admins never gain write through rules.** Every `isAdmin()` appears only on `allow read/get/list`; the test at `firestore.test.mjs:282-288` asserts the write refusal. All six admin callables check the claim server-side (`requireAdmin`) and append to `adminActions`.
- **Deletion is atomic and resumable.** `scheduleDeletion`/`cancelDeletion` do all reads first and flip images inside the same transaction (`lifecycle.ts:214-297`); `purgeAccount` ticks each step onto the job so a crash resumes (`purge.ts`); the v1 Auth trigger backstops console deletions and is idempotent against its own purge.
- **The build stays read-only.** `membersBuild.ts` reads `slugs/` and never writes; the trigger owns the table; retired slugs become alias pages with canonical + meta refresh, and the duplicate-route collision is guarded (`[slug].astro:33-46`).
- **Migration discipline**: copy-never-move, snapshot before any write, recovery of an `imageId` from an already-migrated URL, and `--cleanup-legacy` refuses while any array item or in-bucket avatar is un-migrated. The last URL-parsing helper is fenced off in one file with a loud comment.
- **The `/admin` console renders member text through `textContent` only** (`AdminConsole.astro:53-62`), is `noindex`, out of the sitemap and `robots.txt`, and holds no data at build time.
- **Cross-task shapes agree**: `adminOps.ts` ↔ `adminApi.ts` (after `plain()`), `types.ts` ↔ `images.ts` ↔ `validImage`, `slugifyName` byte-identical in both copies, callable names in `account.ts`/`adminApi.ts` all exported from `functions/src/index.ts`, migration array items ↔ `GalleryItem`, `photoImageId` through `UserDoc` → `toPublicProfile` → both allowlists.
- `package-lock.json` churn is exactly the three declared dev dependencies (`@astrojs/check` and its volar/vscode language-service tree, `@firebase/rules-unit-testing`, `sharp`) plus `typescript` pinned to 5.9 — nothing unexpected.

## Issues

### Critical (Must Fix)

**C1. A migrated member's first Save reverts their avatar URL to the (deleted) legacy object.**
`src/lib/profile.ts:31` — `let photoURL = data.photoURL ?? user.photoURL ?? "";` and `:61-66` always writes `photoURL` into both profile docs. `ProfileForm.astro`'s Save payload (`:1660-1690`) never passes `photoURL`, so without a new upload the value written is **Firebase Auth's `user.photoURL`**. The migration rewrote `users`/`publicProfiles.photoURL` to `users/{uid}/avatar/{imageId}.webp` but never touched the Auth record (`scripts/migrate-image-records.mjs:111-132` has no `adminAuth.updateUser`). Result: the member's next Save writes the legacy `avatars/…` URL back into Firestore while `photoImageId` stays pointing at the new record. On dev the legacy objects are already deleted and reads are denied → that member's avatar breaks on the site, in the editor and in the admin console, silently. Before this branch the two URLs were always identical, so the fallback was harmless; the migration is what made them diverge. Neither `check-integrity.mjs` (checks `photoImageId` existence only, `:47-49`) nor the cleanup guard (`photoImageId` set → guard skipped, `:264-276`) can see it.
Fix (both): (a) `handleProfileUpdate` must stop treating Auth as the truth — only write `photoURL` when a new avatar was uploaded or the caller passed one (`if (resizedAvatarBlob || data.photoURL !== undefined)`); (b) make the migration also `adminAuth.updateUser(uid, { photoURL: newUrl })` for members with an Auth user, and add a `check-integrity` line: `photoImageId` set ⇒ `photoURL == publicStorageUrl(images[photoImageId].storagePath)`. Then run that check on dev to find any member already damaged.

### Important (Should Fix)

**I1. Slug seeding is not idempotent and races the live trigger.**
`scripts/migrate-image-records.mjs:234-245` unconditionally `set(slugs/<derived>, { uid, current: true, createdAt }, { merge: true })`. The runbook deploys functions (and so `onPublicProfileWritten`) to prod *before* migrating, and my recommendation below is to re-run the migration during the window. Either way a member who renames between those points has a trigger-claimed row; the seed then writes a second `current: true` row for the same uid (build picks whichever `slugRows` iterates last → URL changes between builds), or overwrites a row the trigger gave another uid. Guard the seed: skip a uid that already has a `current: true` row; never write a row whose existing `uid` differs; do not rewrite `createdAt` on an existing row.

**I2. `seed-curated-galleries.mjs` still writes the retired shape.**
`scripts/seed-curated-galleries.mjs:165-180` uploads to `galleries/{uid}/…` and writes array items without `imageId`. The final `storage.rules` denies reads there, the tightened Firestore rules reject the items on the member's next save, `check-integrity` flags every item, and `--cleanup-legacy` refuses. The spec relies on this script ("Curated images on purge: deleted with the account. Re-seedable from the manifest") and the memory notes prod seeding is a planned step. Plan-level omission (not in the design's "Files this touches"). Rewrite it on the new pipeline: record → `users/{uid}/gallery/{imageId}.webp` with metadata → `live`, `origin: "curated"`, `provenance.source`, item with `imageId` — which also makes `backfill-provenance.mjs` unnecessary for future seeds.

**I3. Unreferenced `live` records are never swept or reported.**
The design's orphan claim holds for bytes-without-record, but a record+object with no profile pointing at it is now permanent: `uploadImage` flips to `live` before the array/`photoImageId` write; if that write fails (rules, closed tab) or is never made, nothing catches it. `sweepImages` (`functions/src/maintenance.ts:109-133`) only takes `pendingDeletion` and stale `uploading`; `check-integrity.mjs` only checks record→object and object→record. Two concrete producers exist in this branch: `OnboardingForm.astro:1184-1189` calls `handleProfileUpdate` without `previousPhotoImageId`, so re-uploading an avatar during onboarding leaves the first record `live` forever; and any signed-in (even unverified) account can create unlimited `images` records + 8 MB objects — `images` has no per-owner count cap, only the array does. `cleanup-orphaned-storage.mjs` used to cover exactly this and was deleted. Add to `check-integrity` and the admin Queues: `live` records older than N hours referenced by no `gallery[].imageId`/`photoImageId`; have `sweepImages` mark them `pendingDeletion` (not delete outright), and pass `previousPhotoImageId` from onboarding.

**I4. Purges triggered outside a member request never rebuild the site.**
`purgeExpiredAccounts` (`maintenance.ts:83-101`) and `onAuthUserDeleted` (`authTriggers.ts:161-170`) do not call `dispatchRebuild`. For a member-requested deletion that is fine (hidden + rebuilt at request time), but a user deleted from the Firebase console had an *active* profile: the backstop purges every document while the static site keeps showing their card and `/members/<slug>` page until someone else's save happens to rebuild. Same if a member in grace re-ticks "visible" and saves (`setProfileActive` is still allowed during grace) and is later purged. Dispatch a rebuild when a purge ran (bind `githubRebuildToken` on the schedule and use `functions.runWith({ secrets })` on the v1 trigger).

**I5. Prod runbook gaps** (see verdict below for the full list): no second migration pass before tightening (old-client writes in the window leave `imageId`-less items → after tightening that member's *every* save fails as a bare permission error), the slug-seed race from I1, and a temp-dir deploy instruction that does not work as written.

**I6. `scripts/lib/admin-app.mjs:326` defaults to prod when `-P` is omitted** (ledger-deferred). Five new scripts run through it and the runbook runs them against prod; `--write --cleanup-legacy` without `-P` deletes prod's legacy objects. Every other safety here is fail-closed; make this one too (require `-P`). One line.

### Minor (Nice to Have)

- `firestore.rules:107-117` — the comment says only status/caption/description/updatedAt may change on `images` update, but `width`, `height` and `color` are not pinned. Self-data corruption only; pin them or fix the comment.
- `firestore.rules` — `images` create and `storage.rules` write require sign-in but not `email_verified`; combined with I3 that is the abuse surface. Consider `email_verified == true` on both (an unverified member's profile is a draft anyway).
- `storage.rules:12-18` — `customMetadata { ownerUid, imageId }` is written by the client but never checked (`request.resource.metadata`). Cheap to pin `ownerUid == uid` and `imageId == filename stem`.
- `firestore.rules:197` — `photoImageId` is a free string; a member can point it at another owner's record. `check-integrity.mjs:47-49` should verify ownership like it does for gallery items.
- `functions/src/lifecycle.ts:268` / `accounts.ts:155` — a member can cancel an **admin**-scheduled deletion (`requestedBy: "admin"`) simply by signing in, since Auth stays enabled. The spec doesn't forbid it, and "Purge now" exists — but decide it explicitly (refuse when `requestedBy !== "member"`, or disable the Auth user for admin-scheduled jobs) rather than by accident.
- `functions/src/adminOps.ts:62-66` — `db.doc(\`slugs/${q}\`)` throws synchronously for `q` of `.`/`..` (invalid ids) → the callable returns `internal` instead of falling through to name search. Wrap in a try or regex-gate the id form.
- `src/components/admin/AdminConsole.astro:128` — rebuilds the download URL inline; import `publicStorageUrl` from `images.ts` so the format has one owner.
- `tests/rules` — no test that an admin cannot write `publicProfiles/*` or `images/*` (rules do refuse; the split-of-powers invariant deserves the assertion). No test that a `users` update carrying `status` **unchanged** but with a *type* change is caught (server-written, low value).
- `tests/rules/helpers.mjs:1-3` — header still says the modular SDK is unused; line 5 imports `setLogLevel` from it (ledger minor, still true).
- `documentation/20260902-firebase-entity-restructuring-design.md:4` — `Status: approved design, not yet implemented` is stale (dev complete).
- `documentation/agent-memory/firebase-entity-restructuring.md:19` — points at `documentation/20260902-firebase-entity-restructuring-plan/task-20-report.md`, which does not exist in the repo; the report lives under `.superpowers/sdd/…`, which is git-ignored (`.superpowers/sdd/.gitignore` = `*`). Any other Claude instance following the note finds nothing. Either commit the gate output into `documentation/` or drop the reference.
- `scripts/sync-profiles-prod-to-dev.mjs` — after prod migration, copying prod `publicProfiles` to dev copies `imageId`s/`photoImageId`s that resolve to *prod* records and *prod* objects; dev's integrity check would then report every one missing. Add a header warning or make it strip/skip image fields.
- Sitemap includes alias (redirect) pages; `[slug].astro` marks them `noindex` so it is only noise (ledger-deferred, stays).

### Firestore/Storage rules audit (per `firestore-security-rules-auditor`)

```json
{
  "score": 4,
  "summary": "No unauthorized read paths, no privilege escalation, no self-assigned roles. Ownership is taken from the token and pinned; server-owned fields are absent-on-create and pinned-on-update; admins read only. Remaining items are self-data-integrity and resource-exhaustion class.",
  "findings": [
    {"check": "The Update Bypass", "severity": "minor", "issue": "images.update pins ownerUid/kind/storagePath/origin/provenance/createdAt but not width/height/color; comment claims otherwise. Owner can also move status backwards (pendingDeletion → live), racing the sweeper.", "recommendation": "Pin width/height/color on update, or update the comment; optionally forbid pendingDeletion → live for clients (cancelDeletion runs as Admin SDK and is unaffected)."},
    {"check": "Authority Source", "severity": "minor", "issue": "publicProfiles.photoImageId is client-supplied and not checked against images/{id}.ownerUid.", "recommendation": "Verify ownership in check-integrity (cheap) rather than a rules get()."},
    {"check": "Storage Abuse / Resource Exhaustion", "severity": "moderate", "issue": "Any authenticated (unverified) account may create unlimited images records and upload unlimited 8 MB objects under its own prefix; only `uploading` records are swept, a `live` record never referenced by a profile persists forever.", "recommendation": "Require email_verified for images create and storage write; sweep/report unreferenced live records (I3)."},
    {"check": "Type Safety", "severity": "minor", "issue": "users.status / deletionRequestedAt / purgeAfter have no type checks (server-written, pinned for clients, so no client can inject a wrong type).", "recommendation": "None required; note for completeness."},
    {"check": "Field-Level vs Identity-Level", "severity": "minor", "issue": "None found: every hasOnly() is paired with an isOwner/uid check.", "recommendation": "—"},
    {"check": "Business Logic vs Rules", "severity": "minor", "issue": "Admin has zero write access through rules by design; the client cannot delete users/publicProfiles/images; a profile-only (curated) identity can be deleted by admin callable but never by a member — all intended.", "recommendation": "—"}
  ]
}
```

Storage: writes are owner-only, kind ∈ {avatar, gallery}, UUID-named `.webp`, `image/webp`, 2 MB / 8 MB caps — all asserted by `storage.test.mjs`. Public read of everything under `users/` is intended (public artworks; nothing private is stored there). Legacy paths fall to the catch-all deny and the test asserts both write and `getDownloadURL` fail.

## Ledger triage

**Must fix before merge**
- parseArgs defaults to prod (Task 10) — I6.
- imageId `""` on legacy items (Task 15) — resolved operationally by the second migration pass in the runbook, not by code; record that decision.

**Must happen before the prod runbook, though not code**
- FOR JOSH: grant the admin claim on dev; the signed-in dev pass (upload / remove / avatar replace / delete → cancel / email change / `/admin`) that Tasks 4, 17, 18 and 19 all deferred — **no human or agent has exercised any signed-in flow on the new client**. Do the C1 avatar-save case specifically.

**Can stay deferred** (all others): helpers.mjs header comment; `**` glob on POSIX; boundary-value tests; status not a state machine; UUID version nibbles; `allow write` idiom; read on any `{kind}`; dispatch log lacks uid; `activeBefore` collapsing; sweep double filter; Auth-trigger retry short-circuit; unbounded collision loop; immediate-purge audit granularity; Artifact Registry policy; app-name collision (parked, still one init per process); grace note wording; cleanup avatar guard reading pub only; recovery download `exists()`; uid in RegExp; bySlug collapse; ImageStatus literals; `ensureEmailSynced` signature; alias pages in sitemap; empty directory cache; reauth-error slot; malformed email no-op; orphaned i18n keys; onboarding `createdAt`; listener per re-entry; "Cancelled." as error; unlabeled search input; uploading thumbs; warm-up catch.

## Prod runbook verdict

**Needs changes.** The ordering (functions + window rules → migrate → client → tightened rules → cleanup → final storage rules) is correct in principle, and I verified the referenced commits: `06289c3`'s `firestore.rules` accepts both gallery shapes, still allows `users.email == token.email` and owner deletes; `456daf9`'s `storage.rules` keeps legacy writes/deletes; `7726b79`'s `storage.rules` is legacy read-only; HEAD denies legacy entirely. I also checked prod's live client (`main`, 678b5fb) against the window rules: it writes `users.email` (== token, allowed), `onboardingRequests.email` (still in the 06289c3 allowlist), no `projects`/`communityGoals` writes, avatars to `avatars/{uid}-{ts}.webp` — compatible. Changes required:

1. **Fix C1 before step 3** (client deploy) — otherwise every migrated prod member with an avatar loses it on their first save, and step 5 then deletes the only public copy. Also add the `photoURL ↔ photoImageId` check to `check-integrity` so step 2's "0 problems" gate means what it says.
2. **Fix I1 before step 1** — the trigger goes live on prod at step 1; the seed at step 2 must not clobber or duplicate its rows.
3. **Add step 3½: re-run `migrate-image-records.mjs -P prod --write` and `check-integrity` after the new client is live and immediately before step 4.** Any old-client write in the window (new avatar, or a gallery once `main` gains galleries) is otherwise un-migrated when the rules tighten, and that member's saves then fail with nothing naming the field. The script is idempotent once I1 is fixed.
4. **Step 1's "check out those two files into a temp dir and deploy from there" will not work** — `firebase deploy` needs `firebase.json` + `.firebaserc` beside the rules. Say instead: `git checkout 456daf9 -- firestore.rules storage.rules && firebase deploy -P default --only firestore:rules,storage && git checkout HEAD -- firestore.rules storage.rules`. Note also that a first deploy of `onSchedule`/`onDocumentWritten` functions may ask to enable Cloud Scheduler / Eventarc on the prod project.
5. **Step 3 ships everything on `dev` to prod, not just this feature** — the branch sits on `feature/user-content-backend` on `dev` (20c8d46, the image-led directory). The memory notes prod content is gated on the member review email; the runbook should state that this merge is that release, or sequence it.
6. Steps 5–6 are fine but `--cleanup-legacy` cannot detect the C1 reversion; run the new integrity check first.
7. After step 7, run `set-admin.mjs -P prod` — the admin claim is currently granted nowhere (dev included).

## Recommendations

1. Fix C1 (client fallback + migration Auth update + integrity check), then run the new integrity check against dev and repair any already-reverted `photoURL` from its `photoImageId`.
2. Guard the slug seed (I1) and make `-P` mandatory (I6) — both one-screen changes in `scripts/`.
3. Rewrite `seed-curated-galleries.mjs` onto `images.ts`'s model (I2) before anyone seeds prod.
4. Rebuild on every purge (I4); report/sweep unreferenced `live` records (I3); pass `previousPhotoImageId` from onboarding.
5. Do the signed-in dev pass the ledger keeps deferring — nothing on this branch has been driven by a human yet.
6. Update the design doc status line and the memory's report path; amend the runbook per the verdict above and mirror it to `~/.claude`.

## Assessment

**Ready to merge?** With fixes

**Reasoning:** The architecture, rules and functions are sound and well-tested for what they cover, but `handleProfileUpdate`'s Auth-photoURL fallback turns the migration into a delayed avatar-loss bug on both projects (C1), and the slug seed is not safe to re-run alongside the live trigger (I1) — both must land before the prod runbook, and the runbook itself needs the re-migration step and the corrected deploy instruction.
