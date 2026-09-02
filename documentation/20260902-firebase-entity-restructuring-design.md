# Firebase entity restructuring: linked identities, images as records, account lifecycle

Date: 2026-09-02
Status: implemented on dev 2026-09; prod pending (see agent-memory/firebase-entity-restructuring.md)

## Context

Everything in VSCN's backend is keyed by `uid`, but almost nothing is *linked*. The
consequences are concrete:

- **Images have no identity.** A gallery image exists only as a download-URL string
  inside the `gallery` array on `users/{uid}` and `publicProfiles/{uid}`
  (`uploadGalleryImage` in `src/lib/gallery.ts`). There is no image id, no owner
  field, no record — so images cannot be queried, counted, or attributed. Deleting
  one works by parsing the download URL back into a storage path
  (`deleteStorageFile` in `src/lib/storage.ts`).
- **Deletion is client-side and best-effort.** `performDelete()` in
  `src/components/ProfileForm.astro` deletes two documents, the *current* avatar, and
  whichever gallery URLs the page happens to hold in memory, then calls
  `user.delete()`. Every superseded avatar is orphaned by design; the onboarding
  request survives the account (`allow delete: if false`); a tab closed mid-sequence
  leaves a half-deleted user with no record that anything was attempted.
  `scripts/cleanup-orphaned-storage.mjs` exists to sweep up after this.
- **Email is stored three times** — the Auth token, `users/{uid}.email`, and
  `onboardingRequests/{uid}.email` — with no code path that updates them together,
  and no email-change UI in the site at all.
- **Public identity is derived, never stored.** Slugs come from `displayName` at build
  time (`resolveSlugs` in `src/lib/memberView.ts`), so a rename silently moves a
  member's URL and no lookup can resolve the old one.
- **Content exists without accounts.** `scripts/seed-curated-galleries.mjs` attaches
  artwork to `publicProfiles` documents that sometimes have no `users` document, so an
  owner uid can point at an identity that is not a full account.

There is no admin concept anywhere: no custom claims, no privileged rules path. Every
privileged operation today is a local `scripts/*.mjs` run with a service account.

The project is on Blaze with a deployed functions codebase (`requestRebuild`), so
server-side lifecycle work costs nothing architecturally new.

## Goals

Four operations become first-class:

1. **Purge an account** — one server-side call removing every document, every Storage
   object, and the Auth user, resumable if it fails halfway.
2. **Change an email** — Auth and every mirror move together and cannot disagree.
3. **Look up a member** — find the identity behind an email, uid, slug, or image, and
   see everything attached to it.
4. **Query images directly** — all images by owner, stale uploads, curated vs
   member-uploaded, provenance per image.

## Non-goals

Server-side image processing (still rejected — see
`20260823-user-content-backend-design.md`), any change to the static-build delivery
model, the phase-2 requests board, and organization accounts with multiple members.
The `users` → `publicProfiles` master/projection relationship stays exactly as it is;
this design adds to it rather than replacing it.

## Decisions taken

| Decision | Choice |
|---|---|
| Migration freedom | Break the shape and migrate once. The old shape stops being supported. |
| Delete semantics | Soft delete first: hide immediately, 30-day grace, scheduled purge, restorable. |
| Admin surface | Real admin custom claim, admin-only callables, and a gated `/admin` page. |
| Entity structure | Flat top-level collections joined by explicit id fields (Approach A below). |
| Auth user during grace | Stays **enabled**, so the member can sign in and cancel. |
| Curated images on purge | Deleted with the account. Re-seedable from the manifest. |
| Collection names | `users` and `publicProfiles` keep their names. Renaming is churn. |

### Approach considered and rejected: owner-scoped subcollections

`users/{uid}/images/{imageId}` makes ownership the path itself and gives
`recursiveDelete` for free. Rejected because **the privacy boundary in this codebase is
collection-level** — `users` is private, `publicProfiles` is public, and Firestore rules
cannot consult a parent document. Publicly readable image records nested under a private
account document forces a split anyway, and every cross-member admin query becomes a
`collectionGroup` query that *still* needs `ownerUid` duplicated on the document to
filter by. That pays the redundancy cost of the flat model without gaining its query
simplicity, for a purge win that is small when the purge is a Cloud Function.

### Approach considered and rejected: link index only

Add `imageId` to each existing array item plus `assets/{imageId} → {ownerUid, path}` as
a lookup index. A fifth of the work, and it fixes deletion. Rejected because the array
stays the source of truth, so image queries are only ever as good as an index that
every code path must remember to maintain — and image queries are a stated goal.

## 1. Data model

```
users/{uid}              private master profile + contact
                         + status, deletionRequestedAt, purgeAfter   ← server-written only
publicProfiles/{uid}     public projection, incl. ordered gallery array (imageId + display data)
images/{imageId}         SOURCE OF TRUTH for every image
slugs/{slug}             → uid, current: bool
deletions/{uid}          the purge job and its progress               (server-only)
adminActions/{autoId}    audit log of every privileged mutation       (server-only)
onboardingRequests/{uid} unchanged shape, minus `email`

Storage:  users/{uid}/avatar/{imageId}.webp
          users/{uid}/gallery/{imageId}.webp
          + custom metadata { ownerUid, imageId } on every object
```

One prefix, `users/{uid}/`, holds every byte an account owns. Custom metadata makes each
object self-describing even when found outside its path.

### `images/{imageId}`

Public read. Document id is a client-generated `crypto.randomUUID()`.

| Field | Type | Notes |
|---|---|---|
| `ownerUid` | string | Immutable after create. May point at a profile with no `users` doc. |
| `kind` | `avatar` \| `gallery` | |
| `storagePath` | string | `users/{uid}/{kind}/{imageId}.webp`. URLs are derived from this. |
| `width`, `height` | int | |
| `color` | string | `#rrggbb` dominant colour. |
| `caption` | string | ≤ 140. Alt text and card accessible name. |
| `description` | string | ≤ 600. Profile page only. |
| `origin` | `member` \| `curated` | |
| `provenance` | map | `source`, `credit`, `license`, `note`. Curated only. |
| `status` | `uploading` \| `live` \| `pendingDeletion` | |
| `createdAt`, `updatedAt` | timestamp | |

**Ordering is not on the record.** It lives in the profile's gallery array, so
reordering a gallery stays a single-document write.

### The ordering inversion that ends orphans

Today bytes are uploaded and *then* a URL string is appended to an array, so a dead tab
leaves a file nothing references — which is why orphan cleanup has to list the entire
bucket and diff it. The order inverts:

1. Write `images/{imageId}` with `status: "uploading"` and its intended `storagePath`.
2. Upload the bytes to exactly that path.
3. Flip to `status: "live"`, then add the item to the profile's gallery array.

A file can no longer exist without a record pointing at it. Orphan detection becomes
`where('status','==','uploading').where('createdAt','<', cutoff)` — a query, not a crawl.
Removal is the same shape in reverse: mark `pendingDeletion`, drop the array item, and a
sweeper deletes bytes and record together. Nothing is ever best-effort-deleted from a
browser again.

### Deliberate denormalization

`publicProfiles/{uid}.gallery` keeps an ordered array of display data — `imageId`, `url`,
`width`, `height`, `color`, `caption`, `description` — so the public directory and the
static build stay **one document read per member** with no build-time fan-out.
`description` is in that list deliberately: `toMemberViewBase` in `src/lib/memberView.ts`
reads it off the array item, so omitting it would either lose every long caption on the
profile pages or force a second read per member at build time. `images/{imageId}` is
authoritative; the array is a projection, exactly the relationship `publicProfiles`
already has to `users`. Cost: two writes per image change, and `check-integrity.mjs`
(§5) to prove the projection matches the records.

### Soft delete reuses existing machinery

Requesting deletion sets `publicProfiles/{uid}.active = false`. The directory and
`membersBuild.ts` already filter on `active !== false`, so the member leaves the public
site with **no new build logic**, while `users/{uid}.status` and `deletions/{uid}` drive
the purge.

## 2. Lifecycle functions

`functions/src/index.ts` is currently one file holding `requestRebuild`. It becomes
`accounts.ts`, `images.ts`, `adminOps.ts`, `maintenance.ts`, `rebuild.ts`, with
`index.ts` as the re-export surface.

### `requestAccountDeletion` (callable, member-facing)

Gate: signed in **and** `request.auth.token.auth_time` within the last 5 minutes. This is
a genuine server-side reauthentication check; today reauthentication happens only in the
browser and the deletion itself is unguarded. The client still reauthenticates first, it
now proves it to the server.

One batch:

- `publicProfiles/{uid}.active = false`
- `users/{uid}`: `status = "pendingDeletion"`, `deletionRequestedAt`, `purgeAfter = now + 30d`
- every `images` document for that owner → `status = "pendingDeletion"`
- `deletions/{uid}` created, recording `activeBefore` so a cancel restores the true prior value

Then a rebuild dispatch. **No bytes are deleted.**

### `cancelAccountDeletion` (callable)

Reverses precisely that from the job document, restores `activeBefore`, deletes the job,
dispatches a rebuild. Permitted only while `status == "pendingDeletion"`.

The Auth user stays enabled through the grace period — disabling it would lock the member
out of the one place they can change their mind. Accepted consequence: the address stays
claimed for 30 days, so re-registration with it fails until the purge or a cancel.

### `purgeExpiredAccounts` (scheduled, daily)

`deletions` where `purgeAfter <= now` and `completedAt == null`. Per account, ticking each
step into the job document as it completes, so a crash resumes rather than restarts:

1. `images.where('ownerUid','==',uid)` → delete objects, then documents, batched ≤ 500.
2. `bucket.deleteFiles({ prefix: 'users/{uid}/' })` — the belt to the records' braces.
3. Delete `publicProfiles/{uid}`, `users/{uid}`, `onboardingRequests/{uid}`, and every
   `slugs/*` for this uid.
4. Delete the Auth user.
5. Stamp `completedAt`. The job record survives as proof the purge ran.

A failure writes `lastError` and leaves `completedAt` unset; the next run retries.

### `onAuthUserDeleted` (v1 `auth.user().onDelete`)

Coexists with v2 functions in the same codebase. If a user is deleted straight from the
Firebase console, this enqueues an immediate no-grace purge. Without it, console
deletions silently leak every document and file the account owned.

### Email

`verifyBeforeUpdateEmail` does the safe part in Auth — the link goes to the *new* address
and the swap happens only when it is clicked — so no function changes Auth's copy. The
mirror is what needs discipline, and Firebase has no email-change trigger:

- Rules forbid clients writing `email` at all.
- `syncEmail` (callable) writes the mirror from `request.auth.token.email`, which is
  authoritative by construction.
- `reconcileEmails` (scheduled) sweeps every mirror against Auth so drift cannot survive
  a night.
- `onboardingRequests.email` is dropped entirely; the uid already links to `users`.

New client work: an email-change UI in the profile editor's account section. None exists
today.

### `onPublicProfileWritten` (Firestore trigger, `publicProfiles/{uid}`)

Owns the `slugs/` table. On a `displayName` change it slugifies the new name, claims
`slugs/{base}` if free or already this uid's, otherwise walks `-2`, `-3`, … , writes
`{ uid, current: true }`, and flips this uid's previous rows to `current: false` so old
URLs can 301 instead of 404.

The table must be maintained server-side, not at build time: `membersBuild.ts` runs in CI
with a service account, so a build that wrote slugs back would mean **every PR preview
build mutating live data**. With the trigger owning the table, `fetchMemberViews` *reads*
`slugs/` instead of deriving, falling back to `assignSlugs` only for a member with no row
yet. One authority, and the build goes back to being read-only.

Note the resulting behavioural difference: the trigger claims suffixes first-come, while
`assignSlugs` dedups deterministically across the whole set. Once the table is the
authority that divergence is harmless — but it means slug suffixes are now history-dependent
rather than recomputable, which is precisely why the migration seeds the table from the
current `assignSlugs` output (§4).

### Image removal and sweeping

Client marks `status: "pendingDeletion"` and drops the array item. `sweepImages`
(scheduled) deletes bytes-then-record for those, plus any `uploading` record older than a
few hours. `scripts/cleanup-orphaned-storage.mjs` becomes dead code and is deleted.

## 3. Admin claim and `/admin`

`admin: true` custom claim, bootstrapped by `scripts/set-admin.mjs` via
`setCustomUserClaims`. **No callable can grant it** — a privilege you can request over the
wire is not a boundary. Claims land only on token refresh, so granting admin requires a
sign-out/in or `getIdToken(true)`.

**Split of powers:** admins get **read** through rules — all of `users/*`, `images/*`,
`deletions/*`, `adminActions/*`, and `list` on `onboardingRequests` (today `list: if
false`) — and **no write access through rules, ever, even as admin.** Every privileged
mutation goes through a callable, leaving the page free to query live data while keeping
exactly one auditable path for state changes.

### Callables (admin claim required)

- `adminLookupMember({ query })` — accepts an email, uid, slug, imageId, or name fragment
  and returns the whole graph for that identity in one response: the Auth record (email,
  verified, disabled, created, last sign-in), the `users` document, the `publicProfiles`
  document and its `active` state, every image with id and storage path, the onboarding
  request, the deletion job, and every slug that has ever pointed at them.
- `adminPurgeAccount({ uid, immediate })` — soft-delete now, or skip the grace period.
- `adminRestoreAccount({ uid })`
- `adminSetMemberEmail({ uid, email })` — updates Auth and the mirror together.
- `adminSetProfileActive({ uid, active })` — hide or show without deleting.

Every mutation appends to `adminActions/{autoId}`: actor, action, target, timestamp,
before/after summary.

### The page

`/admin`, no locale prefix, English only — a tool, not content. Statically built but
data-free: it checks `getIdTokenResult()` on load, renders an unauthorized state without
the claim, and pulls everything from callables at runtime. The static-build model is
untouched.

1. **Search** — one input, resolving any supported identifier.
2. **Member detail** — the linked bundle, with the action controls on it.
3. **Queues** — pending deletions and their purge dates, stale `uploading` records, and
   email mirrors that disagree with Auth. This is where integrity is seen rather than
   trusted.

## 4. Migration and rollout

`scripts/migrate-image-records.mjs`, following the conventions in
`cleanup-orphaned-storage.mjs`: dry run by default, `-P dev|prod`, `--write` to commit.

**It copies, never moves.** Legacy objects stay in place until a separate
`--cleanup-legacy` pass, run only after a verified rebuild. It dumps `users` and
`publicProfiles` to a local JSON snapshot before touching anything, so a bad run is
revertible from disk.

Per member: each gallery URL is resolved to a storage path — **the last place
URL-parsing exists; it lives only in this script and dies with it** — gets a fresh
`imageId`, the object is copied to `users/{uid}/gallery/{imageId}.webp` with metadata and
cache headers, an `images/{imageId}` record is written, and the array item is rewritten
with its `imageId` and new URL. Same for `photoURL` →
`users/{uid}/avatar/{imageId}.webp`. Then `status: "active"` on the `users` document, and
`onboardingRequests.email` stripped.

`origin: "curated"` is inferred from a **missing `users` document** — the ownerless-profile
case the seeder creates. Credits and sources are not recoverable from filenames, so
provenance backfill is a separate `backfill-provenance.mjs` joining the curated manifest
by slug.

The migration **seeds `slugs/`** by running the existing `assignSlugs` output once, so no
member's current URL changes. After that the trigger in §2 owns the table. Seeding it
from the same function that produces today's URLs is what guarantees the restructuring is
invisible to anyone holding a link.

### Rollout order

1. Deploy rules accepting **both** shapes (array items with or without `imageId`), so the
   migration's writes are legal and the live site never breaks.
2. Deploy functions. The schedules idle until there is data to act on.
3. Migrate dev → verify → rebuild dev → inspect.
4. Migrate prod → verify → rebuild prod.
5. Ship client changes: upload ordering, delete flow, email-change UI, admin page.
6. Tighten rules to the new shape only.
7. `--cleanup-legacy` drops the old objects; delete `cleanup-orphaned-storage.mjs`.

Until step 6 an old client still works. That is the rollback.

Note for step 4: prod currently has profiles and no galleries, dev has the 16 seeded
galleries, so dev exercises the image path and prod mostly exercises avatars. Do not read
a clean prod run as proof the gallery path works.

## 5. Verification

There is no test framework in this repo, and this design does not propose one wholesale.
Two things earn their weight.

**Rules tests** via `@firebase/rules-unit-testing` on the emulator, run with Node's
built-in test runner. The reason is specific: an unlisted field makes `hasOnly` reject an
entire write with no error surfaced anywhere
(`documentation/agent-memory/firestore-rules-hasonly-gotcha.md`), and this design adds
three collections and a dozen fields to that trap. Minimum assertions:

- an owner can create and update their own `images` document
- an owner cannot create one with someone else's `ownerUid`
- `ownerUid` cannot be changed on update
- a client cannot write `status`, `purgeAfter`, `deletionRequestedAt`, or `email`
- an admin can read `users/*` and `deletions/*` and cannot write them
- a non-admin cannot read either
- both gallery-array shapes validate during the step 1–6 window, and only the new one
  after

**`scripts/check-integrity.mjs`** — the migration's verify pass promoted to a standalone
command: every array item has a record, every record's object exists, every object under
`users/` has a record, every mirror matches Auth. It is the migration gate, the queues
screen's data source, and the diagnostic to reach for when something smells.

**Manual verification on dev with a throwaway account:** request deletion → confirm the
member leaves the rebuilt directory → cancel → confirm they return → force an immediate
purge → run the integrity checker.

## Files this touches

| Area | Files |
|---|---|
| Rules | `firestore.rules`, `storage.rules` |
| Functions | `functions/src/{index,accounts,images,adminOps,maintenance,rebuild}.ts` |
| Client libs | `src/lib/{gallery,storage,firestore,memberView,membersBuild}.ts` |
| Client UI | `src/components/ProfileForm.astro`, new `src/pages/admin.astro` + island |
| Scripts | new `migrate-image-records.mjs`, `check-integrity.mjs`, `set-admin.mjs`, `backfill-provenance.mjs`; deleted `cleanup-orphaned-storage.mjs` |
| Config | `firebase.json` (emulator config), `package.json` (rules-test script) |
