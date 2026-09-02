# Firebase Entity Restructuring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every image a first-class Firestore record linked to its owner, and give accounts a server-side lifecycle (soft delete → grace → purge, email sync, admin lookup) so nothing in Storage or Firestore can exist without a traceable owner.

**Architecture:** Flat top-level collections joined by explicit id fields. `images/{imageId}` becomes the source of truth for every image (record written *before* bytes, so a file can never exist unreferenced); `publicProfiles/{uid}.gallery` stays as a denormalised display projection so the static build remains one read per member. Lifecycle mutations (deletion, purge, email mirror, slugs, admin actions) run only in Cloud Functions; clients get read access through rules and write access only to their own content. Rollout is rules-first and additive, so an old client keeps working until the final tightening step.

**Tech Stack:** Astro 6 (static), Firebase v12 client SDK, Cloud Functions for Firebase v2 (`firebase-functions` ^6.4, Node 22, one v1 auth trigger), `firebase-admin` ^13, `@firebase/rules-unit-testing` on the Firebase emulator with Node's built-in test runner, vanilla TS in `.astro` islands.

**Spec:** `documentation/20260902-firebase-entity-restructuring-design.md` — read it first; every task below argues from it.

## Global Constraints

- **Precondition:** the working tree on `feature/user-content-backend` holds uncommitted work (MAX_EDGE 4000px, preview-renders-the-real-thing). Commit or merge it BEFORE starting. Do not interleave this plan with it — `CLAUDE.md` records the last time two features shared a dirty tree.
- **Branch:** `feature/firebase-entity-restructuring` off `dev`. One commit per task. End commit messages with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer naming the model that did the work.
- **Two Firebase projects:** prod `vscn-39508` (alias `default`), dev `vscn-dev-f4b60` (alias `dev`). Buckets are `<projectId>.firebasestorage.app`. Every deploy in this plan targets `-P dev` until Task 14 says otherwise. **Never deploy rules or functions to prod before the task that says to.**
- **CLI:** `npx -y firebase-tools@latest` (the repo has no local install; 15.28.2 verified). Emulators need Java (25 is present).
- **Tests:** the repo has no test framework and CLAUDE.md forbids adding one casually. This plan adds EXACTLY ONE thing, sanctioned by the spec §5: rules tests under `tests/rules/` using `@firebase/rules-unit-testing` + `node --test`. Nothing else (no vitest, no jest). Functions are verified by `npm --prefix functions run build` (tsc, strict) and by running them on dev; scripts by their own dry-run output and `scripts/check-integrity.mjs`.
- **Standing gates for every client task:** `npm run lint` (baseline 8 warnings / 0 errors — only errors are yours) and `npm run build` (type-checks and renders every page). Build needs `FIREBASE_SERVICE_ACCOUNT` in `.env`; an empty directory means missing credentials, not a bug.
- **The `hasOnly` trap:** rules validate with `data.keys().hasOnly(allowedKeys)` on the MERGED document. Every new field on `users` / `publicProfiles` must be in both allowlists AND in `toPublicProfile()` where public, or every profile save fails silently. Tasks 2–3 make the rules changes; Task 15 makes the client ones; they are not optional.
- **Server-owned fields** (`users.status`, `users.deletionRequestedAt`, `users.purgeAfter`, and after Task 19 `users.email`) are in the client allowlist ONLY so merged writes pass `hasOnly`; rules pin them unchanged. Functions use the Admin SDK and bypass rules.
- **i18n:** every UI string added gets BOTH `en` and `de` keys in `src/i18n/translations.ts` — a missing German string falls back to English silently. The `/admin` page is English-only and does not use `ui`.
- **Client scripts** in `.astro` files initialise on `astro:page-load`, never `DOMContentLoaded`.
- **Styling:** design tokens from `src/styles/global.css` (`--color-border`, `--color-muted`, `--color-dark`, `--color-bg`, `--radius-*`). Raw hex values are review defects. Breakpoints only via `@media (--bp-mobile)` / `@media (--bp-desktop)`.
- **Storage caps** (current `storage.rules`): avatars 2 MB, gallery 8 MB, `image/webp` only. Keep them.
- **Cloud Functions region:** default (`us-central1`), matching the deployed `requestRebuild` and the client's `getFunctions(app)`.
- **Never parse a download URL back into a storage path** in code that ships. The one permitted copy of that logic is inside `scripts/migrate-image-records.mjs`.

---

## File Structure

**Rules and tests**
- `firestore.rules` — `images`, `slugs`, `deletions`, `adminActions` collections; `isAdmin()`; server-field pinning on `users`; gallery item `imageId`.
- `storage.rules` — `users/{uid}/{kind}/{file}` path; legacy paths kept until Task 20.
- `firebase.json` — `emulators` block.
- `tests/rules/helpers.mjs` — test environment, fixture uids, seeding helper.
- `tests/rules/firestore.test.mjs`, `tests/rules/storage.test.mjs`.

**Functions** (`functions/src/`, one concern per file, `index.ts` re-exports only)
- `admin.ts` — Admin SDK singletons (`db`, `bucket`, `adminAuth`).
- `constants.ts` — `GRACE_DAYS`, `STALE_UPLOAD_HOURS`, `REAUTH_WINDOW_SECONDS`.
- `types.ts` — `ImageDoc`, `DeletionJob`, `EmailMismatch`, enums.
- `util.ts` — `requireUser`, `requireRecentLogin`, `requireAdmin`, `deleteRefs`, `plain`.
- `rebuild.ts` — `requestRebuild` (moved) + exported `dispatchRebuild()` and `githubRebuildToken`.
- `lifecycle.ts` — `scheduleDeletion`, `cancelDeletion`, `imageRefsFor`, `setImagesStatus`.
- `accounts.ts` — callables `requestAccountDeletion`, `cancelAccountDeletion`, `syncEmail`.
- `purge.ts` — `purgeAccount(uid)`, resumable.
- `emails.ts` — `listAllAuthUsers`, `findEmailMismatches`.
- `maintenance.ts` — schedules `purgeExpiredAccounts`, `sweepImages`, `reconcileEmails`.
- `authTriggers.ts` — v1 `onAuthUserDeleted`.
- `slugs.ts` — `slugifyName` (copy), `claimSlug`, trigger `onPublicProfileWritten`.
- `adminOps.ts` — admin callables + `audit()` + `memberGraph()`.

**Client**
- `src/lib/images.ts` — NEW: `uploadImage`, `markImageForDeletion`, `updateImageText`, `imageStoragePath`, types.
- `src/lib/account.ts` — NEW: typed wrappers for the member-facing callables.
- `src/lib/adminApi.ts` — NEW: typed wrappers for the admin callables + `MemberGraph` type.
- `src/lib/gallery.ts` — `GalleryItem.imageId`; `uploadGalleryImage` returns a `GalleryItem`; `deleteGalleryImages` removed; `syncGalleryText` added.
- `src/lib/storage.ts` — `uploadAvatar` via `uploadImage`; URL parsing and delete helpers removed.
- `src/lib/profile.ts` — avatar swap marks the previous record; no `email`.
- `src/lib/firestore.ts` — `photoImageId`, `status`, `purgeAfter` on `UserDoc`; `deleteUserData` removed.
- `src/lib/memberView.ts` — `resolveSlugs(members, table)`; `assignSlugs` becomes its empty-table case.
- `src/lib/membersBuild.ts` — reads `slugs/`; exports `fetchSlugAliases`.
- `src/layouts/Layout.astro` — optional `redirectTo` prop.
- `src/pages/[...lang]/members/[slug].astro` — alias pages for retired slugs.
- `src/components/ProfileForm.astro`, `src/components/OnboardingForm.astro` — new upload order, new delete flow, deletion banner, email change, email sync.
- `src/pages/admin.astro` + `src/components/admin/AdminConsole.astro` — the admin page.
- `astro.config.mjs` — sitemap excludes `/admin`.

**Scripts** (`scripts/`)
- `lib/admin-app.mjs` — NEW shared bootstrap (`parseArgs`, `initAdminApp`).
- `set-admin.mjs`, `check-integrity.mjs`, `migrate-image-records.mjs`, `backfill-provenance.mjs` — NEW.
- `cleanup-orphaned-storage.mjs` — DELETED in Task 20.
- `.gitignore` — `scripts/snapshots/`.

---

## Phase 0 — Foundations

### Task 1: Branch and the rules test harness

**Files:**
- Modify: `firebase.json`
- Modify: `package.json` (devDependency + script)
- Create: `tests/rules/helpers.mjs`
- Create: `tests/rules/firestore.test.mjs`

**Interfaces:**
- Produces: `setupEnv()`, `seed(env, path, data)`, `OWNER`, `OTHER`, `ADMIN`, `verified(uid, extra)`, `PROJECT_ID` from `tests/rules/helpers.mjs`; `npm run test:rules`. Every later rules task adds cases to the two test files.

- [ ] **Step 1: Branch**

```bash
git status --short
```
Expected: clean (see Global Constraints precondition). Then:

```bash
git checkout dev && git pull && git checkout -b feature/firebase-entity-restructuring
```

- [ ] **Step 2: Install the rules test library**

```bash
npm install --save-dev @firebase/rules-unit-testing
```

- [ ] **Step 3: Add the emulator block to `firebase.json`**

Add as a new top-level key (keep everything else):

```json
  "emulators": {
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`:

```json
    "test:rules": "npx -y firebase-tools@latest emulators:exec --only firestore,storage --project demo-vscn-rules \"node --test tests/rules/\""
```

`demo-` prefixed project ids run fully offline — the CLI never contacts a real project.

- [ ] **Step 5: Write the helper**

`tests/rules/helpers.mjs`:

```js
// Shared harness for the rules tests. Contexts use the COMPAT API
// (ctx.firestore().doc(path).set(...)), which is what rules-unit-testing hands
// back; the modular client SDK is not used here.
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

export { assertFails, assertSucceeds };

export const PROJECT_ID = "demo-vscn-rules";
export const OWNER = "owner-uid-000001";
export const OTHER = "other-uid-000002";
export const ADMIN = "admin-uid-000003";

/** Token claims for a verified member. Pass `{ admin: true }` for an admin. */
export function verified(uid, extra = {}) {
  return { email: `${uid}@example.test`, email_verified: true, ...extra };
}

export async function setupEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
}

/** Writes a document with rules disabled — for fixtures, never for assertions. */
export async function seed(env, path, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(path).set(data);
  });
}

/** A valid private profile a verified owner may write today. */
export function minimalUser(uid) {
  return {
    displayName: "Test Member",
    photoURL: "",
    role: "Illustrator",
    bio: "Draws things.",
    portfolio: "",
    socialMedia: "",
    openTo: [],
    primaryAudiences: [],
    tags: [],
    gallery: [],
    phone: "",
    email: `${uid}@example.test`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
```

- [ ] **Step 6: Write the first test — a baseline against TODAY'S rules**

`tests/rules/firestore.test.mjs`:

```js
import { test, before, after, beforeEach } from "node:test";
import {
  setupEnv, seed, assertFails, assertSucceeds,
  OWNER, OTHER, verified, minimalUser,
} from "./helpers.mjs";

let env;
before(async () => { env = await setupEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

test("users: owner can create their own private doc", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`users/${OWNER}`).set(minimalUser(OWNER)));
});

test("users: another member cannot write it", async () => {
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).set(minimalUser(OWNER)));
});

test("users: another member cannot read it", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).get());
});
```

- [ ] **Step 7: Run it**

```bash
npm run test:rules
```
Expected: emulator starts, `# pass 3`, `# fail 0`, emulator stops. If the storage emulator complains about a missing bucket, that is fine for this task (no storage test yet).

- [ ] **Step 8: Commit**

```bash
git add firebase.json package.json package-lock.json tests/rules/
git commit -m "test(rules): emulator harness for firestore.rules and storage.rules"
```

---

## Phase 1 — Rules that accept both shapes (rollout step 1)

### Task 2: `images` collection rules

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/firestore.test.mjs`

**Interfaces:**
- Produces: the `images/{imageId}` document contract every later task writes against — fields `ownerUid, kind, storagePath, width, height, color?, caption?, description?, origin, provenance?, status, createdAt, updatedAt`; client create must have `status: "uploading"`, `origin: "member"`, no `provenance`; `storagePath` must equal `users/{ownerUid}/{kind}/{imageId}.webp`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rules/firestore.test.mjs`:

```js
function imageDoc(uid, imageId, overrides = {}) {
  return {
    ownerUid: uid,
    kind: "gallery",
    storagePath: `users/${uid}/gallery/${imageId}.webp`,
    width: 1200,
    height: 800,
    color: "#aabbcc",
    origin: "member",
    status: "uploading",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("images: anyone can read", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1"));
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(db.doc("images/img-1").get());
});

test("images: owner creates a record in the uploading state", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
});

test("images: create must start as uploading", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { status: "live" })));
});

test("images: cannot create under someone else's uid", async () => {
  const db = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1")));
});

test("images: storagePath must match owner, kind and id", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { storagePath: `users/${OWNER}/gallery/other.webp` })));
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { storagePath: `users/${OTHER}/gallery/img-1.webp` })));
});

test("images: client cannot claim curated origin or provenance", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { origin: "curated" })));
  await assertFails(db.doc("images/img-1").set(
    imageDoc(OWNER, "img-1", { provenance: { credit: "me" } })));
});

test("images: owner flips uploading → live → pendingDeletion", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1"));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({ status: "live", updatedAt: new Date() }));
  await assertSucceeds(db.doc("images/img-1").update({ status: "pendingDeletion", updatedAt: new Date() }));
});

test("images: owner edits caption and description", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({
    caption: "A cell", description: "Made for a paper.", updatedAt: new Date(),
  }));
});

test("images: ownerUid, kind, storagePath, origin and createdAt are immutable", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").update({ ownerUid: OTHER }));
  await assertFails(db.doc("images/img-1").update({ kind: "avatar" }));
  await assertFails(db.doc("images/img-1").update({ storagePath: `users/${OWNER}/gallery/x.webp` }));
  await assertFails(db.doc("images/img-1").update({ origin: "curated" }));
  await assertFails(db.doc("images/img-1").update({ createdAt: new Date(0) }));
});

test("images: another member cannot update, nobody can delete", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const other = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(other.doc("images/img-1").update({ caption: "mine now" }));
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc("images/img-1").delete());
});

test("images: an unlisted key is rejected (hasOnly)", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc("images/img-1").set(imageDoc(OWNER, "img-1", { projectId: "p" })));
});
```

- [ ] **Step 2: Run — expect the new tests to fail**

```bash
npm run test:rules
```
Expected: the `images:` tests fail (the catch-all `match /{document=**}` denies everything). The read test fails too.

- [ ] **Step 3: Add the rules**

In `firestore.rules`, inside `match /databases/{database}/documents { ... }`, before the catch-all `match /{document=**}`, add:

```
    match /images/{imageId} {
      // Every image is a record here FIRST, then bytes, then `live` — so a
      // Storage object can never exist without a document pointing at it.
      // Public read: these are the public artworks; nothing private lives here.
      allow read: if true;

      // A client always creates in the `uploading` state and as its own work.
      // `curated` and `provenance` are written only by scripts (Admin SDK).
      allow create: if request.auth != null
                    && request.resource.data.ownerUid == request.auth.uid
                    && request.resource.data.status == 'uploading'
                    && request.resource.data.origin == 'member'
                    && !('provenance' in request.resource.data)
                    && validImage(request.resource.data, imageId);

      // Identity fields are pinned. The owner may move status forward, edit
      // caption/description, and bump updatedAt — nothing else.
      allow update: if request.auth != null
                    && resource.data.ownerUid == request.auth.uid
                    && request.resource.data.ownerUid == resource.data.ownerUid
                    && request.resource.data.kind == resource.data.kind
                    && request.resource.data.storagePath == resource.data.storagePath
                    && request.resource.data.origin == resource.data.origin
                    && request.resource.data.get('provenance', null) == resource.data.get('provenance', null)
                    && request.resource.data.createdAt == resource.data.createdAt
                    && validImage(request.resource.data, imageId);

      // Clients MARK (status: pendingDeletion); only the sweeper deletes.
      allow delete: if false;
    }
```

And at the bottom of the file, with the other functions:

```
// Keep in sync with ImageDoc in functions/src/types.ts and src/lib/images.ts.
// The storagePath check binds the record to exactly one object: the document
// id IS the filename, and the owner IS the folder.
function validImage(data, imageId) {
  return data.keys().hasOnly(['ownerUid', 'kind', 'storagePath', 'width', 'height', 'color',
                              'caption', 'description', 'origin', 'provenance', 'status',
                              'createdAt', 'updatedAt'])
    && data.ownerUid is string
    && (data.kind == 'avatar' || data.kind == 'gallery')
    && data.storagePath == 'users/' + data.ownerUid + '/' + data.kind + '/' + imageId + '.webp'
    && data.width is int && data.width > 0 && data.width <= 10000
    && data.height is int && data.height > 0 && data.height <= 10000
    && (!('color' in data) || (data.color is string && data.color.matches('#[0-9a-f]{6}')))
    && (!('caption' in data) || (data.caption is string && data.caption.size() <= 140))
    && (!('description' in data) || (data.description is string && data.description.size() <= 600))
    && (data.origin == 'member' || data.origin == 'curated')
    && (data.status == 'uploading' || data.status == 'live' || data.status == 'pendingDeletion')
    && data.createdAt is timestamp
    && data.updatedAt is timestamp;
}
```

- [ ] **Step 4: Run — expect green**

```bash
npm run test:rules
```
Expected: all `images:` tests pass along with the Task 1 baseline.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/firestore.test.mjs
git commit -m "feat(rules): images collection — record-first, owner-bound, path pinned to id"
```

### Task 3: Server-owned fields, new collections, admin reads, gallery `imageId`

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/firestore.test.mjs`

**Interfaces:**
- Produces: `isAdmin()`; `users` accepts `status | deletionRequestedAt | purgeAfter | photoImageId` (server fields pinned); `publicProfiles` accepts `photoImageId`; gallery items accept optional `imageId`; read-only `slugs/{slug}`; admin-read-only `deletions/{uid}`, `adminActions/{id}`; admin `list` on `onboardingRequests`.
- **Window behaviour (deliberate):** `users.email` stays client-writable and pinned to the token; `users`/`publicProfiles` stay owner-deletable. Both flip in Task 19 once the new client has shipped.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rules/firestore.test.mjs`:

```js
test("users: an owner update leaves server-owned fields alone and passes", async () => {
  await seed(env, `users/${OWNER}`, {
    ...minimalUser(OWNER), status: "active", purgeAfter: null,
  });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  // Merge write that does not mention status: the MERGED doc still carries it.
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ bio: "New bio." }, { merge: true }));
});

test("users: client cannot set or change status / deletion fields", async () => {
  await seed(env, `users/${OWNER}`, { ...minimalUser(OWNER), status: "active" });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).update({ status: "pendingDeletion" }));
  await assertFails(db.doc(`users/${OWNER}`).update({ purgeAfter: new Date() }));
  await assertFails(db.doc(`users/${OWNER}`).update({ deletionRequestedAt: new Date() }));
  // And not on create either.
  const fresh = env.authenticatedContext(OTHER, verified(OTHER)).firestore();
  await assertFails(fresh.doc(`users/${OTHER}`).set({ ...minimalUser(OTHER), status: "active" }));
});

test("users/publicProfiles: photoImageId is an accepted string field", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ ...minimalUser(OWNER), photoImageId: "img-a" }));
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member", photoURL: "", photoImageId: "img-a", gallery: [],
  }));
});

test("publicProfiles: gallery items may carry imageId (both shapes accepted)", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [
      { url, caption: "", width: 10, height: 10 },
      { imageId: "img-1", url, caption: "", width: 10, height: 10, color: "#000000" },
    ],
  }));
});

test("slugs: public read, no client write", async () => {
  await seed(env, "slugs/test-member", { uid: OWNER, current: true, createdAt: new Date() });
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(anon.doc("slugs/test-member").get());
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc("slugs/mine").set({ uid: OWNER, current: true, createdAt: new Date() }));
});

test("deletions/adminActions: admin reads, nobody writes, members cannot read", async () => {
  await seed(env, `deletions/${OWNER}`, { uid: OWNER, completedAt: null });
  await seed(env, "adminActions/a1", { actorUid: ADMIN, action: "x", targetUid: OWNER });
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.doc(`deletions/${OWNER}`).get());
  await assertSucceeds(admin.collection("adminActions").get());
  await assertFails(admin.doc(`deletions/${OWNER}`).update({ completedAt: new Date() }));
  await assertFails(admin.collection("adminActions").add({ actorUid: ADMIN }));
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.doc(`deletions/${OWNER}`).get());
  await assertFails(owner.collection("adminActions").get());
});

test("admin: reads every users doc but cannot write one", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.doc(`users/${OWNER}`).get());
  await assertSucceeds(admin.collection("users").get());
  await assertFails(admin.doc(`users/${OWNER}`).update({ bio: "admin was here" }));
});

test("onboardingRequests: admin can list, member cannot", async () => {
  await seed(env, `onboardingRequests/${OWNER}`, { userId: OWNER, message: "hi", lang: "en" });
  const admin = env.authenticatedContext(ADMIN, verified(ADMIN, { admin: true })).firestore();
  await assertSucceeds(admin.collection("onboardingRequests").get());
  const owner = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(owner.collection("onboardingRequests").get());
  await assertSucceeds(owner.doc(`onboardingRequests/${OWNER}`).get());
});
```

- [ ] **Step 2: Run — expect the new tests to fail**

```bash
npm run test:rules
```

- [ ] **Step 3: Edit `firestore.rules`**

Add these helpers at the bottom with the other functions:

```
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}

function isOwner(uid) {
  return request.auth != null && request.auth.uid == uid;
}

// Lifecycle fields on users/{uid} are written ONLY by Cloud Functions. They
// sit in the client allowlist purely because hasOnly() sees the MERGED
// document — a member's ordinary save would otherwise be rejected the moment
// a function had stamped `status` on their doc. Pinned unchanged instead.
function serverFieldsAbsent(data) {
  return !('status' in data)
      && !('deletionRequestedAt' in data)
      && !('purgeAfter' in data);
}

function serverFieldsUntouched(data, existing) {
  return data.get('status', null) == existing.get('status', null)
      && data.get('deletionRequestedAt', null) == existing.get('deletionRequestedAt', null)
      && data.get('purgeAfter', null) == existing.get('purgeAfter', null);
}
```

Replace the `match /users/{uid}` block with:

```
    match /users/{uid} {
      // Private owner profile data. Contains email and phone.
      allow read: if isOwner(uid) || isAdmin();

      allow create: if isOwner(uid)
                    && validPrivateUser(request.resource.data, request.auth)
                    && serverFieldsAbsent(request.resource.data);

      allow update: if isOwner(uid)
                    && validPrivateUser(request.resource.data, request.auth)
                    && serverFieldsUntouched(request.resource.data, resource.data);

      // ROLLOUT WINDOW: the shipped client still deletes its own docs on
      // account deletion. Flips to `false` once the callable has replaced it.
      allow delete: if isOwner(uid);
    }
```

Replace the `match /onboardingRequests/{uid}` `get`/`list` lines with:

```
      allow get: if isOwner(uid) || isAdmin();
      allow list: if isAdmin();
```

Add the three new collections before the catch-all:

```
    match /slugs/{slug} {
      // uid behind a public URL segment. Owned by the onPublicProfileWritten
      // function; the build reads it, nothing in a browser writes it.
      allow read: if true;
      allow write: if false;
    }

    match /deletions/{uid} {
      // The purge job. Admin-visible for the queues screen; server-written.
      allow read: if isAdmin();
      allow write: if false;
    }

    match /adminActions/{id} {
      // Audit log of privileged mutations. Appended by callables only.
      allow read: if isAdmin();
      allow write: if false;
    }
```

Extend the allowlists and field checks:

- `validPublicProfile` allowedKeys: add `'photoImageId'`.
- `validPrivateUser` allowedKeys: add `'photoImageId', 'status', 'deletionRequestedAt', 'purgeAfter'`.
- In `validPublicFields`, add: `&& (!('photoImageId' in data) || (data.photoImageId is string && data.photoImageId.size() <= 40))`.
- In `validGalleryItem`: change `hasOnly([...])` to `item.keys().hasOnly(['imageId', 'url', 'caption', 'description', 'width', 'height', 'color'])` and add `&& (!('imageId' in item) || (item.imageId is string && item.imageId.size() <= 40))`. Leave a comment: `// imageId optional during the rollout window; required from Task 19 on.`

- [ ] **Step 4: Run — expect green**

```bash
npm run test:rules
```

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/firestore.test.mjs
git commit -m "feat(rules): lifecycle fields pinned, slugs/deletions/adminActions, admin reads"
```

### Task 4: Storage path per account, deploy rules to dev

**Files:**
- Modify: `storage.rules`
- Create: `tests/rules/storage.test.mjs`

**Interfaces:**
- Produces: writable path `users/{uid}/{avatar|gallery}/{uuid}.webp`, owner-only, WebP, 2 MB / 8 MB. Client `delete` is denied on the new path (sweeper/purge delete). Legacy `avatars/*` and `galleries/{uid}/*` rules are UNCHANGED in this task.

- [ ] **Step 1: Write the failing tests**

`tests/rules/storage.test.mjs`:

```js
import { test, before, after, beforeEach } from "node:test";
import { setupEnv, assertFails, assertSucceeds, OWNER, OTHER, verified } from "./helpers.mjs";

let env;
before(async () => { env = await setupEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearStorage(); });

const ID = "3f6c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const webp = (bytes) => new Uint8Array(bytes);

test("storage: owner uploads a gallery webp under their own prefix", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: owner uploads an avatar webp", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/avatar/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: cannot upload into someone else's prefix", async () => {
  const s = env.authenticatedContext(OTHER, verified(OTHER)).storage();
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
});

test("storage: unknown kind, non-uuid name, wrong type are rejected", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`users/${OWNER}/originals/${ID}.webp`).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/photo.webp`).put(webp(1024), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(1024), { contentType: "image/png" }));
});

test("storage: avatar capped at 2 MB, gallery at 8 MB", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`users/${OWNER}/avatar/${ID}.webp`).put(webp(2 * 1024 * 1024 + 1), { contentType: "image/webp" }));
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(8 * 1024 * 1024 + 1), { contentType: "image/webp" }));
});

test("storage: public read, owner cannot delete (sweeper does)", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertSucceeds(s.ref(`users/${OWNER}/gallery/${ID}.webp`).put(webp(64), { contentType: "image/webp" }));
  const anon = env.unauthenticatedContext().storage();
  await assertSucceeds(anon.ref(`users/${OWNER}/gallery/${ID}.webp`).getDownloadURL());
  await assertFails(s.ref(`users/${OWNER}/gallery/${ID}.webp`).delete());
});
```

- [ ] **Step 2: Run — expect the new tests to fail**

```bash
npm run test:rules
```

- [ ] **Step 3: Add the new match to `storage.rules`**

Inside `match /b/{bucket}/o { ... }`, before the catch-all:

```
    match /users/{uid}/{kind}/{filename} {
      // One prefix per account: users/{uid}/ holds every byte a member owns,
      // so a purge is a single prefix delete. The filename is the image
      // record's id (images/{imageId}), written to Firestore BEFORE the bytes.
      allow read: if true;

      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && (kind == 'avatar' || kind == 'gallery')
                   && filename.matches('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp')
                   && request.resource.contentType == 'image/webp'
                   && ((kind == 'avatar' && request.resource.size <= 2 * 1024 * 1024)
                       || (kind == 'gallery' && request.resource.size <= 8 * 1024 * 1024));

      // Members mark the record; sweepImages / purgeAccount delete the bytes.
      allow delete: if false;
    }
```

Do NOT touch the `avatars/` and `galleries/` blocks yet — the shipped client still writes there.

- [ ] **Step 4: Run — expect green**

```bash
npm run test:rules
```

- [ ] **Step 5: Deploy both rule sets to dev**

```bash
npx -y firebase-tools@latest deploy -P dev --only firestore:rules,storage
```
Expected: `Deploy complete!`. Then confirm the live dev site still saves: sign in on the dev site with an existing test account, change the bio, Save. It must succeed — that is the "old client still works" guarantee of rollout step 1.

- [ ] **Step 6: Commit**

```bash
git add storage.rules tests/rules/storage.test.mjs
git commit -m "feat(storage-rules): users/{uid}/{kind}/{imageId}.webp — one prefix per account"
```

---

## Phase 2 — Functions (rollout step 2)

Functions have no test runner. The gate for every task in this phase is `npm --prefix functions run build` (strict tsc) plus, where stated, running the deployed function against dev. `functions/tsconfig.json` is CommonJS with `moduleResolution: node` — imports are extensionless (`./admin`), unlike `src/`.

### Task 5: Scaffold — singletons, types, utilities, `rebuild.ts`

**Files:**
- Create: `functions/src/admin.ts`, `functions/src/constants.ts`, `functions/src/types.ts`, `functions/src/util.ts`, `functions/src/rebuild.ts`
- Modify: `functions/src/index.ts` (becomes re-exports only)

**Interfaces:**
- Produces: `db`, `bucket`, `adminAuth` (admin.ts); `GRACE_DAYS = 30`, `STALE_UPLOAD_HOURS = 6`, `REAUTH_WINDOW_SECONDS = 300`; types `ImageDoc`, `ImageStatus`, `DeletionJob`, `DeletionRequester`, `EmailMismatch`; `requireUser(req): string`, `requireRecentLogin(req): void`, `requireAdmin(req): string`, `deleteRefs(refs): Promise<void>`, `plain(value): unknown`; `dispatchRebuild(): Promise<boolean>` and `githubRebuildToken` from rebuild.ts. `requestRebuild`'s behaviour is unchanged.

- [ ] **Step 1: `functions/src/admin.ts`**

```ts
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

// One app for the whole codebase. Inside Cloud Functions, initializeApp() with
// no arguments picks up the project and its default bucket from the runtime.
const app = getApps()[0] ?? initializeApp();

export const db = getFirestore(app);
export const bucket = getStorage(app).bucket();
export const adminAuth = getAuth(app);
```

- [ ] **Step 2: `functions/src/constants.ts`**

```ts
/** Days between a deletion request and the purge. Spec §2. */
export const GRACE_DAYS = 30;
/** An `uploading` image record older than this has lost its tab; the sweeper takes it. */
export const STALE_UPLOAD_HOURS = 6;
/** How fresh `auth_time` must be for a destructive callable. */
export const REAUTH_WINDOW_SECONDS = 300;
```

- [ ] **Step 3: `functions/src/types.ts`**

```ts
import type { Timestamp } from "firebase-admin/firestore";

// Keep in sync with validImage() in firestore.rules and src/lib/images.ts.
export type ImageKind = "avatar" | "gallery";
export type ImageStatus = "uploading" | "live" | "pendingDeletion";
export type ImageOrigin = "member" | "curated";

export interface ImageDoc {
  ownerUid: string;
  kind: ImageKind;
  /** users/{ownerUid}/{kind}/{imageId}.webp — the URL is derived from this, never the reverse. */
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  description?: string;
  origin: ImageOrigin;
  provenance?: { source?: string; credit?: string; license?: string; note?: string };
  status: ImageStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DeletionRequester = "member" | "admin" | "auth-delete";

export interface DeletionJob {
  uid: string;
  requestedBy: DeletionRequester;
  requestedAt: Timestamp;
  purgeAfter: Timestamp;
  /** publicProfiles.active before the request, so a cancel restores the truth. */
  activeBefore: boolean;
  /** Images flipped live → pendingDeletion by this request; a cancel flips exactly these back. */
  imageIds: string[];
  steps: {
    imagesDeleted: boolean;
    filesDeleted: boolean;
    docsDeleted: boolean;
    authDeleted: boolean;
  };
  completedAt: Timestamp | null;
  lastError: string | null;
}

export interface EmailMismatch {
  uid: string;
  storedEmail: string | null;
  authEmail: string;
}
```

- [ ] **Step 4: `functions/src/util.ts`**

```ts
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { db } from "./admin";
import { REAUTH_WINDOW_SECONDS } from "./constants";

export function requireUser(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  return req.auth.uid;
}

/**
 * A server-side reauthentication check: the client must have signed in (or
 * reauthenticated) within REAUTH_WINDOW_SECONDS. `auth_time` is set by Auth
 * itself, so unlike a client-side reauth flow it cannot be skipped.
 */
export function requireRecentLogin(req: CallableRequest): void {
  const authTime = Number(req.auth?.token.auth_time ?? 0);
  if (!authTime || Date.now() / 1000 - authTime > REAUTH_WINDOW_SECONDS) {
    throw new HttpsError("failed-precondition", "recent-login-required");
  }
}

export function requireAdmin(req: CallableRequest): string {
  const uid = requireUser(req);
  if (req.auth?.token.admin !== true) throw new HttpsError("permission-denied", "Admin only.");
  return uid;
}

/** Deletes in batches of 500 (the Firestore batch limit). Missing docs are no-ops. */
export async function deleteRefs(refs: DocumentReference[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
}

/** Timestamps → ISO strings, recursively, so callable results serialise cleanly. */
export function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, plain(v)])
    );
  }
  return value;
}
```

- [ ] **Step 5: `functions/src/rebuild.ts` — move `requestRebuild`, extract the dispatch**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

// Set with: npx -y firebase-tools@latest functions:secrets:set GITHUB_REBUILD_TOKEN
// Needs workflow-dispatch rights on the site repo. Never PUBLIC_* — the token
// must stay out of the client bundle. Every function that calls
// dispatchRebuild() must list this secret in its options.
export const githubRebuildToken = defineSecret("GITHUB_REBUILD_TOKEN");

// Non-secret params, loaded from functions/.env at deploy time.
const githubOwner = defineString("GITHUB_OWNER");
const githubRepo = defineString("GITHUB_REPO");

// Which workflow this deployment rebuilds. Defaults to the production deploy so
// existing prod behaviour is unchanged; the dev project overrides both in
// functions/.env.vscn-dev-f4b60 so a staging save never dispatches a
// production deploy.
const githubWorkflow = defineString("GITHUB_WORKFLOW", {
  default: "firebase-hosting-merge.yml",
});
const githubRef = defineString("GITHUB_REF", { default: "main" });

/**
 * Dispatches the hosting workflow so the static pages get rebuilt. Best-effort
 * for internal callers: returns false and logs rather than throwing, because a
 * deletion that succeeded should not be reported as failed over a rebuild.
 */
export async function dispatchRebuild(): Promise<boolean> {
  const owner = githubOwner.value();
  const repo = githubRepo.value();
  const workflow = githubWorkflow.value();
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubRebuildToken.value()}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: githubRef.value() }),
      }
    );
    if (!res.ok) {
      logger.error(`Rebuild dispatch failed: ${res.status}`, { body: await res.text() });
      return false;
    }
    logger.info("Rebuild dispatched", { workflow });
    return true;
  } catch (err) {
    logger.error("Rebuild dispatch threw", { err: String(err) });
    return false;
  }
}

/**
 * Callable from the client via the Firebase Functions SDK after a profile
 * change; requires a signed-in user. Behaviour unchanged from before the split.
 */
export const requestRebuild = onCall({ secrets: [githubRebuildToken] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const ok = await dispatchRebuild();
  if (!ok) throw new HttpsError("internal", "Rebuild dispatch failed.");
  logger.info("Rebuild requested", { uid: request.auth.uid });
  return { ok: true };
});
```

- [ ] **Step 6: `functions/src/index.ts` becomes re-exports**

Replace the whole file with:

```ts
// The deployable surface. One line per exported function; the code lives in
// the module named for its concern.
export { requestRebuild } from "./rebuild";
```

(Later tasks append lines here.)

- [ ] **Step 7: Build**

```bash
npm --prefix functions install && npm --prefix functions run build
```
Expected: no errors; `functions/lib/index.js` exports `requestRebuild`.

- [ ] **Step 8: Commit**

```bash
git add functions/src
git commit -m "refactor(functions): one module per concern; dispatchRebuild extracted from requestRebuild"
```

### Task 6: Deletion lifecycle + member callables

**Files:**
- Create: `functions/src/lifecycle.ts`, `functions/src/accounts.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `db` (admin.ts), `GRACE_DAYS`, `DeletionJob`, `ImageStatus`, `requireUser`, `requireRecentLogin`, `dispatchRebuild`, `githubRebuildToken`.
- Produces: `scheduleDeletion(uid, requestedBy, purgeAfter): Promise<DeletionJob>`, `cancelDeletion(uid): Promise<void>`, `imageRefsFor(uid, status?): Promise<QueryDocumentSnapshot[]>`, `setImagesStatus(refs, status)`; callables `requestAccountDeletion` → `{ purgeAfter: string }`, `cancelAccountDeletion` → `{ ok: true }`, `syncEmail` → `{ email: string }`.

- [ ] **Step 1: `functions/src/lifecycle.ts`**

```ts
import { HttpsError } from "firebase-functions/v2/https";
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { db } from "./admin";
import type { DeletionJob, DeletionRequester, ImageStatus } from "./types";

/** Every image record owned by `uid`, optionally only those in one status. */
export async function imageRefsFor(uid: string, status?: ImageStatus): Promise<QueryDocumentSnapshot[]> {
  // Single-field query + in-memory filter: a composite (ownerUid, status)
  // index would need firestore.indexes.json for a collection that is dozens
  // of documents per member.
  const snap = await db.collection("images").where("ownerUid", "==", uid).get();
  return snap.docs.filter((d) => !status || d.data().status === status);
}

export async function setImagesStatus(refs: DocumentReference[], status: ImageStatus): Promise<void> {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) {
      batch.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
}

/**
 * Soft delete. Hides the member (publicProfiles.active = false — the one flag
 * the directory already filters on), marks the private doc, parks every live
 * image, and opens a deletions/{uid} job. Deletes NO bytes: the grace period
 * exists so a cancel can restore everything from the job record.
 */
export async function scheduleDeletion(
  uid: string,
  requestedBy: DeletionRequester,
  purgeAfter: Timestamp
): Promise<DeletionJob> {
  const liveImages = await imageRefsFor(uid, "live");
  const imageIds = liveImages.map((d) => d.id);

  const job = await db.runTransaction(async (tx) => {
    const [user, pub, existing] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
      tx.get(db.doc(`deletions/${uid}`)),
    ]);
    if (existing.exists && existing.data()?.completedAt == null) {
      throw new HttpsError("already-exists", "Deletion already scheduled.");
    }
    const job: DeletionJob = {
      uid,
      requestedBy,
      requestedAt: Timestamp.now(),
      purgeAfter,
      activeBefore: pub.exists && pub.data()?.active !== false,
      imageIds,
      steps: { imagesDeleted: false, filesDeleted: false, docsDeleted: false, authDeleted: false },
      completedAt: null,
      lastError: null,
    };
    tx.set(db.doc(`deletions/${uid}`), job);
    if (pub.exists) tx.update(pub.ref, { active: false });
    // Only an existing doc is marked — a profile-only identity (curated seed
    // with no account) must not acquire a users doc through being deleted.
    if (user.exists) {
      tx.update(user.ref, {
        status: "pendingDeletion",
        deletionRequestedAt: job.requestedAt,
        purgeAfter,
      });
    }
    return job;
  });

  await setImagesStatus(liveImages.map((d) => d.ref), "pendingDeletion");
  return job;
}

/** Reverses scheduleDeletion from the job record. Throws if nothing is pending. */
export async function cancelDeletion(uid: string): Promise<void> {
  const job = await db.runTransaction(async (tx) => {
    const [jobSnap, user, pub] = await Promise.all([
      tx.get(db.doc(`deletions/${uid}`)),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`publicProfiles/${uid}`)),
    ]);
    if (!jobSnap.exists || jobSnap.data()?.completedAt != null) {
      throw new HttpsError("not-found", "No pending deletion.");
    }
    const job = jobSnap.data() as DeletionJob;
    if (pub.exists) tx.update(pub.ref, { active: job.activeBefore });
    if (user.exists) {
      tx.update(user.ref, {
        status: "active",
        deletionRequestedAt: FieldValue.delete(),
        purgeAfter: FieldValue.delete(),
      });
    }
    tx.delete(jobSnap.ref);
    return job;
  });

  await setImagesStatus(job.imageIds.map((id) => db.doc(`images/${id}`)), "live");
}
```

- [ ] **Step 2: `functions/src/accounts.ts`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { GRACE_DAYS } from "./constants";
import { cancelDeletion, scheduleDeletion } from "./lifecycle";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";
import { requireRecentLogin, requireUser } from "./util";

/**
 * Member-facing soft delete. The client reauthenticates first; auth_time is
 * how the server knows it did. Nothing is destroyed here — see lifecycle.ts.
 */
export const requestAccountDeletion = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const uid = requireUser(req);
  requireRecentLogin(req);
  const purgeAfter = Timestamp.fromMillis(Date.now() + GRACE_DAYS * 86_400_000);
  await scheduleDeletion(uid, "member", purgeAfter);
  await dispatchRebuild();
  logger.info("Account deletion scheduled", { uid, purgeAfter: purgeAfter.toDate().toISOString() });
  return { purgeAfter: purgeAfter.toDate().toISOString() };
});

export const cancelAccountDeletion = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const uid = requireUser(req);
  await cancelDeletion(uid);
  await dispatchRebuild();
  logger.info("Account deletion cancelled", { uid });
  return { ok: true };
});

/**
 * Writes the email mirror on users/{uid} from the ID token — the one source
 * that cannot be forged by the caller. The client calls this after sign-up
 * and whenever it notices user.email differs from the stored copy;
 * reconcileEmails sweeps up anything it missed.
 */
export const syncEmail = onCall(async (req) => {
  const uid = requireUser(req);
  const email = req.auth?.token.email;
  if (!email) throw new HttpsError("failed-precondition", "Token carries no email.");
  await db.doc(`users/${uid}`).set({ email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { email };
});
```

- [ ] **Step 3: Export**

Append to `functions/src/index.ts`:

```ts
export { requestAccountDeletion, cancelAccountDeletion, syncEmail } from "./accounts";
```

- [ ] **Step 4: Build**

```bash
npm --prefix functions run build
```

- [ ] **Step 5: Commit**

```bash
git add functions/src
git commit -m "feat(functions): soft-delete lifecycle — requestAccountDeletion, cancelAccountDeletion, syncEmail"
```

### Task 7: Purge, schedules, and the Auth-deletion backstop

**Files:**
- Create: `functions/src/purge.ts`, `functions/src/emails.ts`, `functions/src/maintenance.ts`, `functions/src/authTriggers.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `db`, `bucket`, `adminAuth`, `imageRefsFor`, `scheduleDeletion`, `deleteRefs`, `DeletionJob`, `EmailMismatch`, `STALE_UPLOAD_HOURS`.
- Produces: `purgeAccount(uid): Promise<void>`; `listAllAuthUsers(): Promise<UserRecord[]>`; `findEmailMismatches(): Promise<EmailMismatch[]>`; schedules `purgeExpiredAccounts`, `sweepImages`, `reconcileEmails`; trigger `onAuthUserDeleted`.

- [ ] **Step 1: `functions/src/purge.ts`**

```ts
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, bucket, db } from "./admin";
import { imageRefsFor } from "./lifecycle";
import type { DeletionJob } from "./types";
import { deleteRefs } from "./util";

type Step = keyof DeletionJob["steps"];

/**
 * The hard delete. Every step is idempotent and recorded on the job as it
 * completes, so a crash mid-way resumes on the next run instead of starting
 * over — and so the job record afterwards is proof of what happened.
 * The job doc itself survives (completedAt set); that is the tracked part of
 * "hard delete, tracked".
 */
export async function purgeAccount(uid: string): Promise<void> {
  const jobRef = db.doc(`deletions/${uid}`);
  const snap = await jobRef.get();
  if (!snap.exists) throw new Error(`No deletion job for ${uid}`);
  const job = snap.data() as DeletionJob;
  if (job.completedAt) return;

  const done = { ...job.steps };
  const tick = async (step: Step) => {
    done[step] = true;
    await jobRef.update({ [`steps.${step}`]: true });
  };

  try {
    if (!done.imagesDeleted) {
      const images = await imageRefsFor(uid);
      for (const d of images) {
        await bucket.file(d.data().storagePath as string).delete({ ignoreNotFound: true });
      }
      await deleteRefs(images.map((d) => d.ref));
      await tick("imagesDeleted");
    }
    if (!done.filesDeleted) {
      // Belt to the records' braces: anything under the prefix the records
      // did not know about (a legacy object, an interrupted upload).
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
      await tick("filesDeleted");
    }
    if (!done.docsDeleted) {
      const slugs = await db.collection("slugs").where("uid", "==", uid).get();
      await deleteRefs([
        ...slugs.docs.map((d) => d.ref),
        db.doc(`publicProfiles/${uid}`),
        db.doc(`users/${uid}`),
        db.doc(`onboardingRequests/${uid}`),
      ]);
      await tick("docsDeleted");
    }
    if (!done.authDeleted) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (err) {
        if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
      }
      await tick("authDeleted");
    }
    await jobRef.update({ completedAt: FieldValue.serverTimestamp(), lastError: null });
    logger.info("Account purged", { uid });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await jobRef.update({ lastError: message });
    throw err;
  }
}
```

- [ ] **Step 2: `functions/src/emails.ts`**

```ts
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, db } from "./admin";
import type { EmailMismatch } from "./types";

export async function listAllAuthUsers(): Promise<UserRecord[]> {
  const out: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/**
 * Every users/{uid}.email that disagrees with Auth. Auth is the source of
 * truth; the Firestore copy is a mirror for scripts and the admin page.
 */
export async function findEmailMismatches(): Promise<EmailMismatch[]> {
  const users = await listAllAuthUsers();
  const mismatches: EmailMismatch[] = [];
  for (let i = 0; i < users.length; i += 100) {
    const chunk = users.slice(i, i + 100);
    const docs = await db.getAll(...chunk.map((u) => db.doc(`users/${u.uid}`)));
    docs.forEach((doc, j) => {
      const authEmail = chunk[j].email;
      if (!doc.exists || !authEmail) return;
      const stored = (doc.data()?.email as string | undefined) ?? null;
      if (stored !== authEmail) mismatches.push({ uid: chunk[j].uid, storedEmail: stored, authEmail });
    });
  }
  return mismatches;
}
```

- [ ] **Step 3: `functions/src/maintenance.ts`**

```ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { bucket, db } from "./admin";
import { STALE_UPLOAD_HOURS } from "./constants";
import { findEmailMismatches } from "./emails";
import { purgeAccount } from "./purge";
import type { DeletionJob } from "./types";

const ZURICH = "Europe/Zurich";

/** Open jobs whose grace period has ended. One failure does not stop the rest. */
export const purgeExpiredAccounts = onSchedule(
  { schedule: "every day 03:00", timeZone: ZURICH },
  async () => {
    const open = await db.collection("deletions").where("completedAt", "==", null).get();
    const now = Timestamp.now().toMillis();
    let purged = 0;
    for (const d of open.docs) {
      const job = d.data() as DeletionJob;
      if (job.purgeAfter.toMillis() > now) continue;
      try {
        await purgeAccount(job.uid);
        purged += 1;
      } catch (err) {
        logger.error("Purge failed", { uid: job.uid, err: String(err) });
      }
    }
    logger.info("purgeExpiredAccounts", { open: open.size, purged });
  }
);

/**
 * Deletes bytes+record for images members have marked, and for uploads whose
 * record never reached `live`. Images of an account in its grace period are
 * skipped: they are pendingDeletion so the profile hides them, but a cancel
 * needs them back. purgeAccount takes those when the grace period ends.
 */
export const sweepImages = onSchedule(
  { schedule: "every 6 hours", timeZone: ZURICH },
  async () => {
    const open = await db.collection("deletions").where("completedAt", "==", null).get();
    const inGrace = new Set(open.docs.map((d) => d.id));
    const cutoff = Date.now() - STALE_UPLOAD_HOURS * 3_600_000;

    const [pending, uploading] = await Promise.all([
      db.collection("images").where("status", "==", "pendingDeletion").get(),
      db.collection("images").where("status", "==", "uploading").get(),
    ]);
    const targets = [
      ...pending.docs.filter((d) => !inGrace.has(d.data().ownerUid as string)),
      ...uploading.docs.filter((d) => (d.data().createdAt as Timestamp).toMillis() < cutoff),
    ];
    for (const d of targets) {
      await bucket.file(d.data().storagePath as string).delete({ ignoreNotFound: true });
      await d.ref.delete();
    }
    logger.info("sweepImages", {
      swept: targets.length,
      skippedInGrace: pending.size - pending.docs.filter((d) => !inGrace.has(d.data().ownerUid as string)).length,
    });
  }
);

/** Auth is the truth; every mirror that disagrees is rewritten. */
export const reconcileEmails = onSchedule(
  { schedule: "every day 04:00", timeZone: ZURICH },
  async () => {
    const mismatches = await findEmailMismatches();
    for (const m of mismatches) {
      await db.doc(`users/${m.uid}`).update({ email: m.authEmail });
    }
    logger.info("reconcileEmails", { fixed: mismatches.length, uids: mismatches.map((m) => m.uid) });
  }
);
```

- [ ] **Step 4: `functions/src/authTriggers.ts`**

```ts
import * as functionsV1 from "firebase-functions/v1";
import { logger } from "firebase-functions/v2";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { scheduleDeletion } from "./lifecycle";
import { purgeAccount } from "./purge";

/**
 * Backstop for a user deleted straight from the Firebase console (or by any
 * path other than purgeAccount): open an immediate, no-grace job and run it.
 * Auth triggers are still v1-only; v1 and v2 coexist in one codebase.
 *
 * When purgeAccount itself deletes the Auth user this fires too — the job
 * already exists then (open or completed), so it returns without touching it.
 */
export const onAuthUserDeleted = functionsV1.auth.user().onDelete(async (user) => {
  const existing = await db.doc(`deletions/${user.uid}`).get();
  if (existing.exists) {
    logger.info("Auth user deleted; job already present", { uid: user.uid });
    return;
  }
  await scheduleDeletion(user.uid, "auth-delete", Timestamp.now());
  await purgeAccount(user.uid);
  logger.info("Auth user deleted out-of-band; data purged", { uid: user.uid });
});
```

- [ ] **Step 5: Export**

Append to `functions/src/index.ts`:

```ts
export { purgeExpiredAccounts, sweepImages, reconcileEmails } from "./maintenance";
export { onAuthUserDeleted } from "./authTriggers";
```

- [ ] **Step 6: Build**

```bash
npm --prefix functions run build
```

- [ ] **Step 7: Commit**

```bash
git add functions/src
git commit -m "feat(functions): resumable purge, nightly schedules, Auth-deletion backstop"
```

### Task 8: Slug ownership trigger

**Files:**
- Create: `functions/src/slugs.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `db`.
- Produces: `slugifyName(name): string` (copy of `src/lib/memberView.ts`), `claimSlug(uid, displayName): Promise<string>`, trigger `onPublicProfileWritten`. Document shape `slugs/{slug} = { uid, current: boolean, createdAt }`.

- [ ] **Step 1: `functions/src/slugs.ts`**

```ts
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

// COPY of slugifyName() in src/lib/memberView.ts — functions is a separate TS
// project (CommonJS) and cannot import from src/. Change both or neither.
const TRANSLITERATE: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", Ä: "ae", Ö: "oe", Ü: "ue", ß: "ss",
  å: "a", æ: "ae", ø: "oe", œ: "oe", Å: "a", Æ: "ae", Ø: "oe", Œ: "oe",
};
const SLUG_MAX = 60;

export function slugifyName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/[äöüÄÖÜßåæøœÅÆØŒ]/g, (ch) => TRANSLITERATE[ch] ?? ch)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/**
 * Claims a slug for `uid`: the base if free (or already this uid's, current
 * or retired), else `-2`, `-3`, …; retires this uid's other current slug so
 * the old URL can alias to the new one. Serialised in a transaction because
 * two renames landing together must not both take the same suffix.
 */
export async function claimSlug(uid: string, displayName: string): Promise<string> {
  const base = slugifyName(displayName) || uid.toLowerCase();
  return db.runTransaction(async (tx) => {
    const mine = await tx.get(db.collection("slugs").where("uid", "==", uid));
    let candidate = base;
    let n = 1;
    // All reads happen before any write, as the Admin SDK transaction requires.
    for (;;) {
      const snap = await tx.get(db.doc(`slugs/${candidate}`));
      if (!snap.exists || snap.data()?.uid === uid) break;
      n += 1;
      candidate = `${base}-${n}`;
    }
    for (const d of mine.docs) {
      if (d.id !== candidate && d.data().current === true) tx.update(d.ref, { current: false });
    }
    tx.set(
      db.doc(`slugs/${candidate}`),
      { uid, current: true, createdAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return candidate;
  });
}

/**
 * Owns slugs/. Fires on every publicProfiles write; acts only when the
 * display name changed (or the doc is new). Deletion is purgeAccount's job.
 */
export const onPublicProfileWritten = onDocumentWritten("publicProfiles/{uid}", async (event) => {
  const after = event.data?.after;
  const before = event.data?.before;
  if (!after?.exists) return;
  const name = String(after.data()?.displayName ?? "");
  const previous = before?.exists ? String(before.data()?.displayName ?? "") : undefined;
  if (previous === name) return;
  const slug = await claimSlug(event.params.uid, name);
  logger.info("Slug claimed", { uid: event.params.uid, slug });
});
```

- [ ] **Step 2: Export**

Append to `functions/src/index.ts`:

```ts
export { onPublicProfileWritten } from "./slugs";
```

- [ ] **Step 3: Build and commit**

```bash
npm --prefix functions run build
git add functions/src
git commit -m "feat(functions): slugs/ owned by onPublicProfileWritten"
```

### Task 9: Admin callables and the audit log

**Files:**
- Create: `functions/src/adminOps.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces (all require the `admin` claim):
  - `adminLookupMember({ query })` → `{ graph: MemberGraph | null, matches: { uid, displayName, active }[] }`
  - `adminListQueues()` → `{ pendingDeletions: DeletionJob[], staleUploads: (ImageDoc & { imageId })[], emailMismatches: EmailMismatch[] }`
  - `adminPurgeAccount({ uid, immediate? })` → `{ ok, purgeAfter }`
  - `adminRestoreAccount({ uid })` → `{ ok }`
  - `adminSetMemberEmail({ uid, email })` → `{ ok }`
  - `adminSetProfileActive({ uid, active })` → `{ ok }`
  - `MemberGraph` = `{ uid, auth, user, publicProfile, images, onboardingRequest, deletion, slugs }` with all Timestamps as ISO strings (via `plain`).
  - Every mutation appends `adminActions/{autoId} = { actorUid, action, targetUid, at, ...detail }`.

- [ ] **Step 1: `functions/src/adminOps.ts`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, db } from "./admin";
import { GRACE_DAYS, STALE_UPLOAD_HOURS } from "./constants";
import { findEmailMismatches } from "./emails";
import { cancelDeletion, scheduleDeletion } from "./lifecycle";
import { purgeAccount } from "./purge";
import { dispatchRebuild, githubRebuildToken } from "./rebuild";
import { plain, requireAdmin } from "./util";

async function audit(
  actorUid: string,
  action: string,
  targetUid: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await db.collection("adminActions").add({
    actorUid,
    action,
    targetUid,
    at: FieldValue.serverTimestamp(),
    ...detail,
  });
}

function requireUidArg(data: unknown): string {
  const uid = String((data as { uid?: unknown })?.uid ?? "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "uid is required");
  return uid;
}

function authSummary(u: UserRecord) {
  return {
    uid: u.uid,
    email: u.email ?? null,
    emailVerified: u.emailVerified,
    disabled: u.disabled,
    createdAt: u.metadata.creationTime,
    lastSignInAt: u.metadata.lastSignInTime ?? null,
    admin: u.customClaims?.admin === true,
  };
}

/**
 * email → Auth; slug → slugs/; imageId → images/; else treat as a uid if any
 * doc or Auth user answers to it. Returns null when nothing does.
 */
async function resolveUid(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  if (q.includes("@")) {
    try {
      return (await adminAuth.getUserByEmail(q)).uid;
    } catch {
      return null;
    }
  }
  const [slug, image, pub, user] = await Promise.all([
    db.doc(`slugs/${q}`).get(),
    db.doc(`images/${q}`).get(),
    db.doc(`publicProfiles/${q}`).get(),
    db.doc(`users/${q}`).get(),
  ]);
  if (slug.exists) return slug.data()?.uid as string;
  if (image.exists) return image.data()?.ownerUid as string;
  if (pub.exists || user.exists) return q;
  try {
    return (await adminAuth.getUser(q)).uid;
  } catch {
    return null;
  }
}

/** Prefix match on displayName — the only substring search Firestore offers. */
async function nameMatches(fragment: string) {
  const snap = await db
    .collection("publicProfiles")
    .orderBy("displayName")
    .startAt(fragment)
    .endAt(`${fragment}\uf8ff`)
    .limit(20)
    .get();
  return snap.docs.map((d) => ({
    uid: d.id,
    displayName: String(d.data().displayName ?? ""),
    active: d.data().active !== false,
  }));
}

/** Everything attached to one identity, in one response. */
export async function memberGraph(uid: string) {
  const [authUser, user, pub, images, onboarding, deletion, slugs] = await Promise.all([
    adminAuth.getUser(uid).catch(() => null),
    db.doc(`users/${uid}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
    db.collection("images").where("ownerUid", "==", uid).get(),
    db.doc(`onboardingRequests/${uid}`).get(),
    db.doc(`deletions/${uid}`).get(),
    db.collection("slugs").where("uid", "==", uid).get(),
  ]);
  return plain({
    uid,
    auth: authUser ? authSummary(authUser) : null,
    user: user.exists ? user.data() : null,
    publicProfile: pub.exists ? pub.data() : null,
    images: images.docs.map((d) => ({ imageId: d.id, ...d.data() })),
    onboardingRequest: onboarding.exists ? onboarding.data() : null,
    deletion: deletion.exists ? deletion.data() : null,
    slugs: slugs.docs.map((d) => ({ slug: d.id, current: d.data().current === true })),
  });
}

export const adminLookupMember = onCall(async (req) => {
  requireAdmin(req);
  const query = String((req.data as { query?: unknown })?.query ?? "").trim();
  if (!query) throw new HttpsError("invalid-argument", "query is required");
  const uid = await resolveUid(query);
  if (uid) return { graph: await memberGraph(uid), matches: [] };
  return { graph: null, matches: await nameMatches(query) };
});

export const adminListQueues = onCall(async (req) => {
  requireAdmin(req);
  const cutoff = Date.now() - STALE_UPLOAD_HOURS * 3_600_000;
  const [open, uploading, emailMismatches] = await Promise.all([
    db.collection("deletions").where("completedAt", "==", null).get(),
    db.collection("images").where("status", "==", "uploading").get(),
    findEmailMismatches(),
  ]);
  return plain({
    pendingDeletions: open.docs.map((d) => d.data()),
    staleUploads: uploading.docs
      .filter((d) => (d.data().createdAt as Timestamp).toMillis() < cutoff)
      .map((d) => ({ imageId: d.id, ...d.data() })),
    emailMismatches,
  });
});

export const adminPurgeAccount = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const immediate = (req.data as { immediate?: unknown })?.immediate === true;
  const purgeAfter = immediate
    ? Timestamp.now()
    : Timestamp.fromMillis(Date.now() + GRACE_DAYS * 86_400_000);
  const existing = await db.doc(`deletions/${uid}`).get();
  if (!existing.exists || existing.data()?.completedAt != null) {
    await scheduleDeletion(uid, "admin", purgeAfter);
  }
  if (immediate) await purgeAccount(uid);
  await audit(actor, immediate ? "purgeAccount" : "scheduleDeletion", uid, {
    purgeAfter: purgeAfter.toDate().toISOString(),
  });
  await dispatchRebuild();
  return { ok: true, purgeAfter: purgeAfter.toDate().toISOString() };
});

export const adminRestoreAccount = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  await cancelDeletion(uid);
  await audit(actor, "restoreAccount", uid);
  await dispatchRebuild();
  return { ok: true };
});

/**
 * Fixes an address on request. Verification status is left as it was — this
 * is the admin correcting a typo for a member they have spoken to, not a
 * member changing their own address (that path is verifyBeforeUpdateEmail in
 * the client, which Auth verifies itself).
 */
export const adminSetMemberEmail = onCall(async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const email = String((req.data as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) throw new HttpsError("invalid-argument", "email is required");
  const before = await adminAuth.getUser(uid);
  await adminAuth.updateUser(uid, { email });
  const userRef = db.doc(`users/${uid}`);
  if ((await userRef.get()).exists) await userRef.update({ email });
  await audit(actor, "setMemberEmail", uid, { before: before.email ?? null, after: email });
  return { ok: true };
});

export const adminSetProfileActive = onCall({ secrets: [githubRebuildToken] }, async (req) => {
  const actor = requireAdmin(req);
  const uid = requireUidArg(req.data);
  const active = (req.data as { active?: unknown })?.active === true;
  const ref = db.doc(`publicProfiles/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No public profile.");
  await ref.update({ active });
  await audit(actor, "setProfileActive", uid, { before: snap.data()?.active !== false, after: active });
  await dispatchRebuild();
  return { ok: true };
});
```

- [ ] **Step 2: Export**

Append to `functions/src/index.ts`:

```ts
export {
  adminLookupMember,
  adminListQueues,
  adminPurgeAccount,
  adminRestoreAccount,
  adminSetMemberEmail,
  adminSetProfileActive,
} from "./adminOps";
```

- [ ] **Step 3: Build and commit**

```bash
npm --prefix functions run build
git add functions/src
git commit -m "feat(functions): admin callables — lookup graph, queues, purge/restore, email, visibility; audit log"
```

### Task 10: Shared script bootstrap, `set-admin.mjs`, deploy functions to dev

**Files:**
- Create: `scripts/lib/admin-app.mjs`, `scripts/set-admin.mjs`

**Interfaces:**
- Produces: `parseArgs(argv?) → { project: "dev"|"prod", flags: Set<string>, positional: string[] }`; `initAdminApp(project) → { app, db, bucket, adminAuth, projectId, bucketName, close() }`. Every new script in Phase 3 uses these two.

- [ ] **Step 1: `scripts/lib/admin-app.mjs`**

```js
// Shared bootstrap for the admin scripts. `-P dev|prod` picks the env file
// (.env.development / .env) exactly as cleanup-orphaned-storage.mjs did; the
// older scripts each carry their own copy of this and are left alone.
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const match = content.match(/^FIREBASE_SERVICE_ACCOUNT=(.*)$/m);
  if (!match) return null;
  let val = match[1].trim();
  if (val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1);
  } else if (val.startsWith('"') && val.endsWith('"')) {
    val = JSON.parse(val);
  }
  const obj = JSON.parse(val);
  if (obj.private_key) obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  return obj;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  let project = "prod";
  const pIdx = argv.findIndex((a) => a === "-P" || a === "--project");
  if (pIdx !== -1) project = argv[pIdx + 1] ?? "";
  if (project !== "prod" && project !== "dev") {
    console.error(`Unknown project "${project}" — use -P prod or -P dev.`);
    process.exit(1);
  }
  const positional = argv.filter(
    (a, i) => !a.startsWith("-") && argv[i - 1] !== "-P" && argv[i - 1] !== "--project"
  );
  return { project, flags, positional };
}

export function initAdminApp(project) {
  const envFile = project === "dev" ? ".env.development" : ".env";
  const credential = parseEnvFile(resolve(ROOT, envFile));
  if (!credential) throw new Error(`Missing or invalid FIREBASE_SERVICE_ACCOUNT in ${envFile}`);
  const bucketName = `${credential.project_id}.firebasestorage.app`;
  const app = initializeApp(
    { credential: cert(credential), storageBucket: bucketName },
    `vscn-${project}-${Date.now()}`
  );
  return {
    app,
    db: getFirestore(app),
    bucket: getStorage(app).bucket(),
    adminAuth: getAuth(app),
    projectId: credential.project_id,
    bucketName,
    close: () => deleteApp(app),
  };
}
```

- [ ] **Step 2: `scripts/set-admin.mjs`**

```js
// Grants (or with --revoke, removes) the `admin` custom claim.
//
//   node scripts/set-admin.mjs -P dev someone@example.com
//   node scripts/set-admin.mjs -P dev someone@example.com --revoke
//
// This is the ONLY way the claim is set — no callable grants it. Claims ride
// on the ID token, so the member must sign out and back in (or the client must
// call getIdToken(true)) before rules or callables see it.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project, flags, positional } = parseArgs();
const email = positional[0];
if (!email) {
  console.error("Usage: node scripts/set-admin.mjs -P dev|prod <email> [--revoke]");
  process.exit(1);
}

const { adminAuth, projectId, close } = initAdminApp(project);
try {
  const user = await adminAuth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (flags.has("--revoke")) delete claims.admin;
  else claims.admin = true;
  await adminAuth.setCustomUserClaims(user.uid, claims);
  console.log(
    `${projectId}: ${email} (${user.uid}) admin=${claims.admin === true}. ` +
      "Sign out and back in for the token to pick it up."
  );
} finally {
  await close();
}
```

- [ ] **Step 3: Deploy the functions to dev**

```bash
npx -y firebase-tools@latest deploy -P dev --only functions
```
Expected: the CLI may ask to enable Cloud Scheduler / Eventarc APIs — answer yes. If the Firestore trigger fails with an Eventarc permission error on the first attempt, wait two minutes and re-run the same command (the service account propagation is slow the first time). Final output lists all 13 functions.

- [ ] **Step 4: Confirm the deploy and grant yourself admin on dev**

```bash
npx -y firebase-tools@latest functions:list -P dev
```
Expected: 15 rows — `requestRebuild` plus the 14 new ones: `requestAccountDeletion`, `cancelAccountDeletion`, `syncEmail`, `purgeExpiredAccounts`, `sweepImages`, `reconcileEmails`, `onAuthUserDeleted` (v1), `onPublicProfileWritten`, `adminLookupMember`, `adminListQueues`, `adminPurgeAccount`, `adminRestoreAccount`, `adminSetMemberEmail`, `adminSetProfileActive`.

```bash
node scripts/set-admin.mjs -P dev joshua.binswanger@augmedi.com
```
Expected: `vscn-dev-f4b60: joshua.binswanger@augmedi.com (<uid>) admin=true.`

Then exercise the slug trigger, which needs no client: in the Firebase console for dev, edit any `publicProfiles/{uid}.displayName` (append ` X`), wait ten seconds, and confirm a `slugs/<new-slug>` doc appeared with `{ uid, current: true }`. Revert the name; confirm the original slug doc is `current: true` again and the ` X` one is `current: false`. The callables are exercised end-to-end by the admin page in Task 18.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/admin-app.mjs scripts/set-admin.mjs
git commit -m "feat(scripts): shared admin bootstrap; set-admin grants the claim"
```

---

## Phase 3 — Migration (rollout steps 3–4)

Scripts run with `node --experimental-strip-types` so they can import `assignSlugs`/`slugifyName` straight from `src/lib/memberView.ts` — the same function that produces today's URLs, which is the spec's guarantee that no live URL moves. (On Node 24 the flag is on by default and harmless; the repo's engine floor is 22.12, where it is required.) `memberView.ts` imports only types from its neighbours, so nothing from the client SDK is pulled in.

### Task 11: `scripts/check-integrity.mjs`

**Files:**
- Create: `scripts/check-integrity.mjs`

**Interfaces:**
- Consumes: `parseArgs`, `initAdminApp`.
- Produces: a command that exits 1 on any hard mismatch. Used as the migration gate (Task 14) and afterwards on demand.

- [ ] **Step 1: Write the script**

```js
// Proves the links hold. Exit code 1 on any `!` line.
//
//   node scripts/check-integrity.mjs -P dev
//
// Checks: every gallery item → a live image record owned by that profile;
// every record → an object at its storagePath; every object under users/ → a
// record; every users/{uid}.email → the Auth user's email. Members inside a
// deletion grace period are skipped for the status check (their images are
// pendingDeletion on purpose) and reported as notes.
import { initAdminApp, parseArgs } from "./lib/admin-app.mjs";

const { project } = parseArgs();
const { db, bucket, adminAuth, projectId, close } = initAdminApp(project);

const problems = [];
const notes = [];
const problem = (msg) => { problems.push(msg); console.log(`  ! ${msg}`); };
const note = (msg) => { notes.push(msg); console.log(`  ~ ${msg}`); };

try {
  console.log(`Integrity check — ${projectId}\n`);
  const [users, pubs, images, openJobs] = await Promise.all([
    db.collection("users").get(),
    db.collection("publicProfiles").get(),
    db.collection("images").get(),
    db.collection("deletions").where("completedAt", "==", null).get(),
  ]);
  const imageById = new Map(images.docs.map((d) => [d.id, d.data()]));
  const userIds = new Set(users.docs.map((d) => d.id));
  const inGrace = new Set(openJobs.docs.map((d) => d.id));

  console.log("Gallery arrays ↔ image records");
  for (const doc of pubs.docs) {
    const data = doc.data();
    if (!userIds.has(doc.id)) note(`publicProfiles/${doc.id} has no users doc (profile-only identity)`);
    if (inGrace.has(doc.id)) note(`publicProfiles/${doc.id} is in a deletion grace period`);
    const gallery = Array.isArray(data.gallery) ? data.gallery : [];
    gallery.forEach((item, i) => {
      if (!item?.imageId) return problem(`publicProfiles/${doc.id}.gallery[${i}] has no imageId`);
      const rec = imageById.get(item.imageId);
      if (!rec) return problem(`publicProfiles/${doc.id}.gallery[${i}] → images/${item.imageId} missing`);
      if (rec.ownerUid !== doc.id) problem(`images/${item.imageId} owned by ${rec.ownerUid}, listed on ${doc.id}`);
      if (rec.status !== "live" && !inGrace.has(doc.id)) {
        problem(`images/${item.imageId} is ${rec.status} but listed on publicProfiles/${doc.id}`);
      }
    });
    if (data.photoImageId && !imageById.has(data.photoImageId)) {
      problem(`publicProfiles/${doc.id}.photoImageId → images/${data.photoImageId} missing`);
    }
  }

  console.log("Image records ↔ objects");
  const [files] = await bucket.getFiles({ prefix: "users/" });
  const objectNames = new Set(files.map((f) => f.name).filter((n) => !n.endsWith("/")));
  for (const [id, rec] of imageById) {
    const expected = `users/${rec.ownerUid}/${rec.kind}/${id}.webp`;
    if (rec.storagePath !== expected) problem(`images/${id}.storagePath is ${rec.storagePath}, expected ${expected}`);
    if (!objectNames.has(rec.storagePath)) problem(`images/${id} → object ${rec.storagePath} missing`);
  }
  const recordPaths = new Set([...imageById.values()].map((r) => r.storagePath));
  for (const name of objectNames) {
    if (!recordPaths.has(name)) problem(`object ${name} has no image record`);
  }

  console.log("Email mirrors ↔ Auth");
  const authByUid = new Map();
  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const u of page.users) authByUid.set(u.uid, u);
    pageToken = page.pageToken;
  } while (pageToken);
  for (const doc of users.docs) {
    const u = authByUid.get(doc.id);
    if (!u) { problem(`users/${doc.id} has no Auth user`); continue; }
    if (u.email && doc.data().email !== u.email) {
      problem(`users/${doc.id}.email "${doc.data().email}" ≠ Auth "${u.email}"`);
    }
  }

  console.log(`\n${problems.length} problem(s), ${notes.length} note(s).`);
  if (problems.length) process.exitCode = 1;
} finally {
  await close();
}
```

- [ ] **Step 2: Run it against dev BEFORE migrating**

```bash
node scripts/check-integrity.mjs -P dev
```
Expected: exit 1, with one `has no imageId` problem per existing gallery item (dev has the 16 seeded galleries) — that is the correct pre-migration picture, and it proves the checker sees what the migration must fix.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-integrity.mjs
git commit -m "feat(scripts): check-integrity proves arrays, records, objects and emails agree"
```

### Task 12: `scripts/migrate-image-records.mjs`

**Files:**
- Create: `scripts/migrate-image-records.mjs`
- Modify: `.gitignore` (add `scripts/snapshots/`)
- Modify: `package.json` (add `sharp` to devDependencies — it is present today only as a transitive dependency of Astro, and the seeder already relies on it)

**Interfaces:**
- Consumes: `parseArgs`, `initAdminApp`, `assignSlugs`, `toMemberViewBase`.
- Produces: for every gallery item and avatar, an `images/{imageId}` record, a copied object at `users/{uid}/{kind}/{imageId}.webp`, and a rewritten array item `{ imageId, url, ... }` / `photoURL` + `photoImageId`; `users.status = "active"`; `onboardingRequests.email` removed; `slugs/` seeded for active members. Flags: `--write` (default dry run), `--cleanup-legacy` (Task 20).

- [ ] **Step 1: Dependencies and ignore**

```bash
npm install --save-dev sharp
```
Append to `.gitignore`:

```
# pre-migration dumps written by scripts/migrate-image-records.mjs
scripts/snapshots/
```

- [ ] **Step 2: Write the script**

```js
// ONE-TIME migration to image records. Idempotent: items that already carry
// an imageId are left alone, so a partial run can be re-run.
//
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev            # dry run
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write
//   node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write --cleanup-legacy
//
// COPIES, never moves: legacy objects under avatars/ and galleries/ stay until
// --cleanup-legacy, which refuses to run while any array item lacks an imageId.
// Dumps users + publicProfiles to scripts/snapshots/ before writing anything.
//
// THIS FILE IS THE LAST PLACE A DOWNLOAD URL IS PARSED BACK INTO A PATH. The
// helper below exists so the migration can find legacy objects; it is not to
// be copied anywhere that ships.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";
import { assignSlugs, toMemberViewBase } from "../src/lib/memberView.ts";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const cleanupLegacy = flags.has("--cleanup-legacy");
const { db, bucket, projectId, bucketName, close } = initAdminApp(project);

const CACHE = "public, max-age=31536000, immutable";
const LEGACY_PREFIXES = ["avatars/", "galleries/"];

function storagePathFromUrl(fileURL) {
  if (!fileURL) return null;
  try {
    const url = new URL(fileURL);
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/\/o\/(.+)$/);
      if (match) return decodeURIComponent(match[1]);
    } else if (url.hostname === "storage.googleapis.com") {
      return url.pathname.split("/").slice(2).join("/");
    }
  } catch {
    // not a URL — nothing to resolve
  }
  return null;
}

function publicStorageUrl(storagePath) {
  // Mirrors publicStorageUrl() in src/lib/storage.ts.
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

function snapshot(users, pubs) {
  const dir = resolve(ROOT, "scripts/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${projectId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const dump = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  fs.writeFileSync(
    file,
    JSON.stringify(
      { users: dump(users), publicProfiles: dump(pubs) },
      (_k, v) => (v instanceof Timestamp ? v.toDate().toISOString() : v),
      2
    )
  );
  return file;
}

function record(uid, kind, storagePath, { width, height, color, caption, description, origin }) {
  return {
    ownerUid: uid,
    kind,
    storagePath,
    width,
    height,
    ...(color ? { color } : {}),
    ...(caption ? { caption } : {}),
    ...(description ? { description } : {}),
    origin,
    status: "live",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Gallery objects are already WebP (client and seeder both wrote WebP): copy. */
async function migrateGalleryItem(uid, item, origin) {
  const legacyPath = storagePathFromUrl(item.url);
  if (!legacyPath) return { error: `unparseable url ${item.url}` };
  const src = bucket.file(legacyPath);
  const [exists] = await src.exists();
  if (!exists) return { error: `object missing: ${legacyPath}` };
  const imageId = randomUUID();
  const storagePath = `users/${uid}/gallery/${imageId}.webp`;
  if (write) {
    await src.copy(bucket.file(storagePath), {
      metadata: { contentType: "image/webp", cacheControl: CACHE, metadata: { ownerUid: uid, imageId } },
    });
    await db.doc(`images/${imageId}`).set(record(uid, "gallery", storagePath, { ...item, origin }));
  }
  return { imageId, url: publicStorageUrl(storagePath), legacyPath };
}

/** Avatars may be legacy JPEG/PNG at {uid}.{ext}: decode, re-encode to WebP, measure. */
async function migrateAvatar(uid, photoURL, origin) {
  const legacyPath = storagePathFromUrl(photoURL);
  if (!legacyPath) return { error: `unparseable photoURL ${photoURL}` };
  const src = bucket.file(legacyPath);
  const [exists] = await src.exists();
  if (!exists) return { error: `avatar object missing: ${legacyPath}` };
  const [buf] = await src.download();
  const webp = await sharp(buf).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(webp).metadata();
  const imageId = randomUUID();
  const storagePath = `users/${uid}/avatar/${imageId}.webp`;
  if (write) {
    await bucket.file(storagePath).save(webp, {
      contentType: "image/webp",
      metadata: { cacheControl: CACHE, metadata: { ownerUid: uid, imageId } },
    });
    await db.doc(`images/${imageId}`).set(
      record(uid, "avatar", storagePath, { width: meta.width, height: meta.height, origin })
    );
  }
  return { imageId, url: publicStorageUrl(storagePath), legacyPath };
}

async function migrate() {
  const [users, pubs] = await Promise.all([db.collection("users").get(), db.collection("publicProfiles").get()]);
  console.log(`snapshot → ${snapshot(users, pubs)}\n`);
  const userById = new Map(users.docs.map((d) => [d.id, d]));
  let migrated = 0;
  let failed = 0;

  for (const pub of pubs.docs) {
    const uid = pub.id;
    const pubData = pub.data();
    const userDoc = userById.get(uid);
    const userData = userDoc?.data() ?? {};
    // A profile with no account is curated seed material by definition.
    const origin = userDoc ? "member" : "curated";

    // publicProfiles is the projection, but the seeder wrote both and a
    // profile-only identity has only this doc — so the pub array is the list.
    const gallery = Array.isArray(pubData.gallery) ? pubData.gallery : [];
    const newGallery = [];
    for (const item of gallery) {
      if (item.imageId) { newGallery.push(item); continue; }
      const r = await migrateGalleryItem(uid, item, origin);
      if (r.error) { failed += 1; console.log(`  ! ${uid} gallery: ${r.error}`); newGallery.push(item); continue; }
      migrated += 1;
      newGallery.push({ ...item, imageId: r.imageId, url: r.url });
    }

    let avatar = null;
    const photoURL = pubData.photoURL || userData.photoURL || "";
    if (photoURL && !pubData.photoImageId) {
      const r = await migrateAvatar(uid, photoURL, origin);
      if (r.error) { failed += 1; console.log(`  ! ${uid} avatar: ${r.error}`); }
      else { migrated += 1; avatar = r; }
    }

    const pubUpdate = { gallery: newGallery, ...(avatar ? { photoURL: avatar.url, photoImageId: avatar.imageId } : {}) };
    const userUpdate = { ...pubUpdate, status: "active" };
    if (write) {
      await pub.ref.update(pubUpdate);
      if (userDoc) await userDoc.ref.update(userUpdate);
    }
    console.log(
      `  ${write ? "migrated" : "would migrate"} ${uid} (${pubData.displayName ?? "?"}, ${origin}): ` +
        `${newGallery.length} gallery item(s), avatar ${avatar ? "yes" : "no"}`
    );
  }

  // users docs with no publicProfiles doc still need status.
  for (const userDoc of users.docs) {
    if (pubs.docs.some((p) => p.id === userDoc.id)) continue;
    if (write) await userDoc.ref.update({ status: "active" });
    console.log(`  ${write ? "marked" : "would mark"} users/${userDoc.id} active (no public profile)`);
  }

  // onboardingRequests.email is a duplicate of users.email; the uid links them.
  const reqs = await db.collection("onboardingRequests").get();
  for (const d of reqs.docs) {
    if (!("email" in d.data())) continue;
    if (write) await d.ref.update({ email: FieldValue.delete() });
    console.log(`  ${write ? "stripped" : "would strip"} onboardingRequests/${d.id}.email`);
  }

  // Seed slugs/ from the SAME function the build uses today, over the same
  // set (active members only), so no URL a visitor holds changes. Inactive
  // members get a row from onPublicProfileWritten on their next save; until
  // then the build falls back to deriving one (resolveSlugs, Task 16).
  const members = assignSlugs(
    pubs.docs.filter((d) => d.data().active !== false).map((d) => toMemberViewBase(d.id, d.data()))
  );
  for (const m of members) {
    if (write) {
      await db.doc(`slugs/${m.slug}`).set(
        { uid: m.id, current: true, createdAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    console.log(`  slug ${m.slug} → ${m.id}`);
  }

  console.log(`\n${write ? "Migrated" : "Would migrate"} ${migrated} image(s), ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

async function cleanupLegacyObjects() {
  const pubs = await db.collection("publicProfiles").get();
  const unmigrated = pubs.docs.flatMap((d) =>
    (Array.isArray(d.data().gallery) ? d.data().gallery : []).filter((g) => !g.imageId).map(() => d.id)
  );
  if (unmigrated.length) {
    console.error(`Refusing: ${unmigrated.length} gallery item(s) still lack an imageId (${[...new Set(unmigrated)].join(", ")}).`);
    process.exit(1);
  }
  for (const prefix of LEGACY_PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    console.log(`${prefix}: ${files.length} object(s)`);
    for (const f of files) {
      if (write) await f.delete({ ignoreNotFound: true });
      console.log(`  ${write ? "deleted" : "would delete"} ${f.name}`);
    }
  }
}

try {
  console.log(`Project: ${projectId} (bucket ${bucketName})`);
  console.log(`Mode: ${write ? "WRITE" : "dry run (pass --write to act)"}\n`);
  if (cleanupLegacy) await cleanupLegacyObjects();
  else await migrate();
} finally {
  await close();
}
```

- [ ] **Step 3: Dry-run against dev**

```bash
node --experimental-strip-types scripts/migrate-image-records.mjs -P dev
```
Expected: a snapshot path, one `would migrate` line per profile (16 with galleries), `slug … →` lines whose slugs match the live dev URLs under `/members/`, `0 failed`, no writes. If the `.ts` import fails on your Node, the error names `memberView.ts` — check `node --version` ≥ 22.12 and that the flag is present.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-image-records.mjs .gitignore package.json package-lock.json
git commit -m "feat(scripts): migrate-image-records — copy-never-move, records, arrays, status, slugs"
```

### Task 13: `scripts/backfill-provenance.mjs`

**Files:**
- Create: `scripts/backfill-provenance.mjs`

**Interfaces:**
- Consumes: `parseArgs`, `initAdminApp`, `slugifyName`, `scripts/assets/curated-galleries/manifest.json`.
- Produces: `images/{imageId}.origin = "curated"` and `provenance.source = "curated-galleries/img/<slug>/<file>"` for every seeded image, matched by slug and array position.

- [ ] **Step 1: Write the script**

```js
// Marks the seeded curated galleries after migrate-image-records has run.
//
//   node --experimental-strip-types scripts/backfill-provenance.mjs -P dev [--write]
//
// The manifest carries only src/width/height — no credits — so what can be
// recorded is origin and the source file. Matching is by slug
// (slugifyName(displayName), the seeder's own convention) and by array
// position: the seeder pushed images in manifest order and skipped members
// who already had a gallery, so lengths must agree or the member is skipped.
import fs from "node:fs";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";
import { slugifyName } from "../src/lib/memberView.ts";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const { db, projectId, close } = initAdminApp(project);

const manifest = JSON.parse(
  fs.readFileSync(resolve(ROOT, "scripts/assets/curated-galleries/manifest.json"), "utf-8")
);

try {
  console.log(`Project: ${projectId} — ${write ? "WRITE" : "dry run"}\n`);
  const pubs = await db.collection("publicProfiles").get();
  const bySlug = new Map(pubs.docs.map((d) => [slugifyName(d.data().displayName ?? ""), d]));
  let marked = 0;

  for (const [slug, entries] of Object.entries(manifest)) {
    const pub = bySlug.get(slug);
    if (!pub) { console.log(`  ! ${slug}: no profile with that name`); continue; }
    const gallery = Array.isArray(pub.data().gallery) ? pub.data().gallery : [];
    if (gallery.length !== entries.length) {
      console.log(`  ~ ${slug}: gallery has ${gallery.length} item(s), manifest ${entries.length} — skipped`);
      continue;
    }
    for (const [i, entry] of entries.entries()) {
      const item = gallery[i];
      if (!item?.imageId) { console.log(`  ! ${slug}[${i}]: no imageId — run the migration first`); continue; }
      const source = entry.src.replace("/proto/img/real/", "curated-galleries/img/");
      if (write) {
        await db.doc(`images/${item.imageId}`).update({
          origin: "curated",
          "provenance.source": source,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      marked += 1;
      console.log(`  ${write ? "marked" : "would mark"} images/${item.imageId} ← ${source}`);
    }
  }
  console.log(`\n${marked} image(s) ${write ? "marked" : "to mark"} curated.`);
} finally {
  await close();
}
```

- [ ] **Step 2: Commit** (it is run in Task 14)

```bash
git add scripts/backfill-provenance.mjs
git commit -m "feat(scripts): backfill-provenance marks the seeded galleries curated"
```

### Task 14: Migrate dev, verify, rebuild; then prod

This task is operational. Every step has an expected output; stop at the first one that does not match.

- [ ] **Step 1: Migrate dev**

```bash
node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write
node --experimental-strip-types scripts/backfill-provenance.mjs -P dev --write
node scripts/check-integrity.mjs -P dev
```
Expected: migration `0 failed`; backfill marks every seeded image; integrity `0 problem(s)` (notes about profile-only identities are fine).

- [ ] **Step 2: Rebuild dev and look**

```bash
npm run deploy:dev
```
(`deploy:dev` builds in development mode — a plain `npm run build` deploys an artwork-less dev site, per `documentation/agent-memory/deploy-dev-needs-development-mode.md`.) Then open the dev `/community` and two member pages. Every image and avatar must render; URLs in the page source must point at `users/<uid>/...`. The still-shipped OLD client on dev must still save a profile — do one save.

- [ ] **Step 3: Migrate prod**

Prod has profiles and (as of the spec date) no galleries, so this exercises avatars and slugs, not the gallery path — dev was the gallery test. First deploy rules and functions to prod, then migrate:

```bash
npx -y firebase-tools@latest deploy -P default --only firestore:rules,storage,functions
node --experimental-strip-types scripts/migrate-image-records.mjs -P prod
```
(The Firebase CLI alias for prod is `default`; the scripts' flag is `-P prod`. They are different tools with different vocabularies.) Read the dry run in full. Then:

```bash
node --experimental-strip-types scripts/migrate-image-records.mjs -P prod --write
node scripts/check-integrity.mjs -P prod
```
Expected: `0 failed`, `0 problem(s)`.

- [ ] **Step 4: Rebuild prod**

Trigger the `firebase-hosting-merge.yml` workflow from GitHub Actions (workflow_dispatch) — no code change is needed for this rebuild. Confirm avatars render on prod `/community` and the member URLs are unchanged.

- [ ] **Step 5: Record**

Append to `documentation/20260902-firebase-entity-restructuring-plan.md` under this task a dated line: which snapshot files were written, and the integrity output for both projects. Commit that.

```bash
git add documentation/20260902-firebase-entity-restructuring-plan.md
git commit -m "docs(plan): migration run record for dev and prod"
```

---

## Phase 4 — Client (rollout step 5)

Gates for every task here: `npm run lint` (errors only), `npm run build`, and a browser check against dev. Ship to dev with `npm run deploy:dev`.

### Task 15: `src/lib/images.ts` and the library rewrites

**Files:**
- Create: `src/lib/images.ts`, `src/lib/account.ts`
- Modify: `src/lib/gallery.ts`, `src/lib/storage.ts`, `src/lib/profile.ts`, `src/lib/firestore.ts`

**Interfaces:**
- Produces:
  - `images.ts`: `uploadImage(uid, kind, blob, dims, onProgress?) → Promise<UploadedImage>` where `UploadedImage = { imageId, url, storagePath }`; `markImageForDeletion(imageId)`; `updateImageText(imageId, { caption, description? })`; `blobDimensions(blob) → Promise<{ width, height }>`; `imageStoragePath(uid, kind, imageId)`; `publicStorageUrl(storagePath)` (moved here from storage.ts, re-exported there).
  - `gallery.ts`: `GalleryItem.imageId: string`; `uploadGalleryImage(uid, image: CompressedImage, onProgress?) → Promise<GalleryItem>`; `syncGalleryText(gallery)`. `deleteGalleryImages` is gone.
  - `storage.ts`: `uploadAvatar(uid, blob, color, onProgress?) → Promise<UploadedImage>`. `deleteStorageFile`, `deleteAvatar`, `stripStorageToken` are gone (memberView has its own `stripStorageToken`).
  - `profile.ts`: `ProfileUpdateOptions` gains `previousPhotoImageId?: string` and loses `email`; `handleProfileUpdate` returns `{ photoURL, photoImageId? }`.
  - `firestore.ts`: `UserDoc` gains `photoImageId?`, `status?`, `deletionRequestedAt?`, `purgeAfter?`; `PublicProfileDoc` omits the lifecycle fields; `OnboardingRequestDoc` loses `email`; `deleteUserData` is gone.
  - `account.ts`: `requestAccountDeletion() → Promise<{ purgeAfter: string }>`, `cancelAccountDeletion()`, `syncEmail() → Promise<string>`, `ensureEmailSynced(user, storedEmail)`.

- [ ] **Step 1: `src/lib/images.ts`**

```ts
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase.ts";

// Keep in sync with validImage() in firestore.rules and functions/src/types.ts.
export type ImageKind = "avatar" | "gallery";
export type ImageStatus = "uploading" | "live" | "pendingDeletion";

export interface ImageDimensions {
  width: number;
  height: number;
  /** Dominant colour (#rrggbb), the placeholder shown while the image loads. */
  color?: string;
}

export interface UploadedImage {
  imageId: string;
  url: string;
  storagePath: string;
}

export function publicStorageUrl(storagePath: string): string {
  const bucket = storage.app.options.storageBucket ?? "";
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** The record id IS the filename and the owner IS the folder — rules check exactly this. */
export function imageStoragePath(uid: string, kind: ImageKind, imageId: string): string {
  return `users/${uid}/${kind}/${imageId}.webp`;
}

export async function blobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dims = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dims;
}

/**
 * Record first, bytes second, `live` third.
 *
 * The order is the whole design: a Storage object can never exist without an
 * images/ document pointing at it, so a tab closed mid-upload leaves a record
 * in `uploading` that sweepImages finds by query — not an unreferenced file
 * that only a bucket crawl could. firestore.rules requires the create to be
 * `uploading`, so this order is enforced, not merely followed.
 */
export async function uploadImage(
  uid: string,
  kind: ImageKind,
  blob: Blob,
  dims: ImageDimensions,
  onProgress: (pct: number) => void = () => {},
): Promise<UploadedImage> {
  const imageId = crypto.randomUUID();
  const storagePath = imageStoragePath(uid, kind, imageId);
  const recordRef = doc(db, "images", imageId);

  await setDoc(recordRef, {
    ownerUid: uid,
    kind,
    storagePath,
    width: dims.width,
    height: dims.height,
    ...(dims.color ? { color: dims.color } : {}),
    origin: "member",
    status: "uploading",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, storagePath), blob, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
      // The object knows its owner even when found outside its path.
      customMetadata: { ownerUid: uid, imageId },
    });
    task.on(
      "state_changed",
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => resolve(),
    );
  });

  await updateDoc(recordRef, { status: "live", updatedAt: serverTimestamp() });
  return { imageId, url: publicStorageUrl(storagePath), storagePath };
}

/** Members mark; sweepImages deletes bytes and record together. */
export async function markImageForDeletion(imageId: string): Promise<void> {
  if (!imageId) return;
  await updateDoc(doc(db, "images", imageId), {
    status: "pendingDeletion",
    updatedAt: serverTimestamp(),
  });
}

/** Captions and descriptions live on the record; the gallery array is a projection. */
export async function updateImageText(
  imageId: string,
  text: { caption: string; description?: string },
): Promise<void> {
  await updateDoc(doc(db, "images", imageId), {
    caption: text.caption,
    description: text.description ? text.description : deleteField(),
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 2: `src/lib/account.ts`**

```ts
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { functions } from "./firebase.ts";

export async function requestAccountDeletion(): Promise<{ purgeAfter: string }> {
  const fn = httpsCallable<void, { purgeAfter: string }>(functions, "requestAccountDeletion");
  return (await fn()).data;
}

export async function cancelAccountDeletion(): Promise<void> {
  await httpsCallable(functions, "cancelAccountDeletion")();
}

export async function syncEmail(): Promise<string> {
  const fn = httpsCallable<void, { email: string }>(functions, "syncEmail");
  return (await fn()).data.email;
}

/**
 * users/{uid}.email is a server-written mirror of Auth. Call after sign-up
 * and whenever the token's address differs from the stored one — which is
 * what happens after verifyBeforeUpdateEmail completes on the next sign-in.
 * Best-effort: reconcileEmails sweeps nightly for anything missed here.
 */
export async function ensureEmailSynced(user: User, storedEmail: string | undefined): Promise<void> {
  if (!user.email || user.email === storedEmail) return;
  try {
    await syncEmail();
  } catch (err) {
    console.warn("[account] email sync skipped:", err);
  }
}
```

- [ ] **Step 3: `src/lib/storage.ts` — replace the whole file**

```ts
import { blobDimensions, publicStorageUrl, uploadImage, type UploadedImage } from "./images.ts";

// Kept as an export here because older importers reach it through this module.
export { publicStorageUrl };

/**
 * Avatars go through the same record-first pipeline as gallery images
 * (images.ts). The previous avatar's record is marked by the caller once
 * Firestore holds the new photoURL — see handleProfileUpdate.
 */
export async function uploadAvatar(
  uid: string,
  blob: Blob,
  color: string | undefined,
  onProgress: (pct: number) => void = () => {},
): Promise<UploadedImage> {
  const dims = await blobDimensions(blob);
  return uploadImage(uid, "avatar", blob, { ...dims, color }, onProgress);
}
```

- [ ] **Step 4: `src/lib/gallery.ts`**

Replace the imports at the top with:

```ts
import { uploadImage, updateImageText } from "./images.ts";
import { decodeImage, toWebpBlob, dominantColor, rejectionMessage } from "./image.ts";
```

Add to `GalleryItem` as its first field:

```ts
  /** The images/{imageId} record this item projects. The record is the truth; this array is display order. */
  imageId: string;
```

In `sanitizeGalleryItems`, inside the `.map`, make the constructed item:

```ts
      const item: GalleryItem = {
        imageId: String(raw.imageId ?? ""),
        url: String(raw.url ?? ""),
        caption: typeof raw.caption === "string" ? raw.caption : "",
        width: Number(raw.width ?? 0),
        height: Number(raw.height ?? 0),
      };
```

and update its doc comment's first paragraph to read: `Drops keys no longer in GalleryItem from a stored array, and normalises the ones that are.`

Replace `uploadGalleryImage` and `deleteGalleryImages` with:

```ts
/** Uploads through the record-first pipeline and returns the array item to append. */
export async function uploadGalleryImage(
  uid: string,
  image: CompressedImage,
  onProgress: (pct: number) => void = () => {},
): Promise<GalleryItem> {
  const { imageId, url } = await uploadImage(
    uid,
    "gallery",
    image.blob,
    { width: image.width, height: image.height, color: image.color },
    onProgress,
  );
  return { imageId, url, caption: "", width: image.width, height: image.height, color: image.color };
}

/**
 * Pushes typed text onto the records. Called from Save, alongside the array
 * write — the array carries the same text for the static build, but the
 * record is what an admin or a future feature reads.
 */
export async function syncGalleryText(gallery: GalleryItem[]): Promise<void> {
  await Promise.all(
    gallery
      .filter((item) => item.imageId)
      .map((item) => updateImageText(item.imageId, { caption: item.caption, description: item.description })),
  );
}
```

- [ ] **Step 5: `src/lib/firestore.ts`**

In `UserDoc`, after `photoColor`:

```ts
  /** The images/{imageId} record behind photoURL. Absent on profiles with no avatar. */
  photoImageId?: string;
```

and after `onboardingComplete`:

```ts
  /**
   * Server-written lifecycle. "pendingDeletion" means a deletion request is in
   * its grace period; purgeAfter is when purgeExpiredAccounts will act. Clients
   * read these and never write them — firestore.rules pins them.
   */
  status?: "active" | "pendingDeletion";
  deletionRequestedAt?: Date;
  purgeAfter?: Date;
```

Change `PublicProfileDoc`:

```ts
export type PublicProfileDoc = Omit<
  UserDoc,
  "phone" | "email" | "status" | "deletionRequestedAt" | "purgeAfter"
> & { active?: boolean };
```

In `OnboardingRequestDoc` delete the `email?: string;` line. In `upsertOnboardingRequest`, change the parameter type to `Omit<OnboardingRequestDoc, "userId" | "createdAt" | "updatedAt">` (unchanged) and delete the line `if (data.email) payload.email = data.email;`.

In `toPublicProfile`, after the `photoColor` line:

```ts
  if (data.photoImageId !== undefined) out.photoImageId = data.photoImageId;
```

Delete `deleteUserData` entirely (and `deleteDoc` from the firebase/firestore import if nothing else uses it).

- [ ] **Step 6: `src/lib/profile.ts`**

Replace imports and the options type:

```ts
import { updateProfile, type User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";
import { uploadAvatar } from "./storage.ts";
import { markImageForDeletion } from "./images.ts";
import { updateUserProfile } from "./firestore.ts";
import { validateBio, validateSocialMedia } from "./validation.ts";
import type { UserDoc } from "./firestore.ts";

// `email` is excluded on purpose: users/{uid}.email is a server-written mirror
// of Auth (syncEmail) and firestore.rules rejects a client write to it.
export interface ProfileUpdateOptions extends Omit<Partial<UserDoc>, "email"> {
  resizedAvatarBlob?: Blob | null;
  /** The record behind the avatar being replaced; marked pendingDeletion once the save has landed. */
  previousPhotoImageId?: string;
}
```

Replace the body of `handleProfileUpdate` from `const { resizedAvatarBlob, ...data } = options;` down to `return { photoURL };` with:

```ts
  const { resizedAvatarBlob, previousPhotoImageId, ...data } = options;
  let photoURL = data.photoURL ?? user.photoURL ?? "";
  let photoImageId = data.photoImageId;

  // 1. Validation (Bio, social links)
  if (data.bio !== undefined) {
    const bioResult = validateBio(data.bio);
    if (!bioResult.ok) {
      throw new Error(bioResult.error);
    }
  }
  // The social rows are joined into one stored field, so the length that
  // matters is the joined one — and firestore.rules caps it. Checked here so
  // an over-long list fails with a sentence rather than a permission error.
  if (data.socialMedia !== undefined) {
    const socialResult = validateSocialMedia(data.socialMedia);
    if (!socialResult.ok) {
      throw new Error(socialResult.error);
    }
  }

  // 2. Avatar upload — record first, bytes second (images.ts).
  if (resizedAvatarBlob) {
    const uploaded = await uploadAvatar(user.uid, resizedAvatarBlob, data.photoColor, onProgress);
    photoURL = uploaded.url;
    photoImageId = uploaded.imageId;
    await updateProfile(user, { photoURL });
    await user.getIdToken(true);
  }

  // 3. Firestore sync
  const profileData: Partial<UserDoc> = {
    ...data,
    photoURL,
    ...(photoImageId ? { photoImageId } : {}),
    updatedAt: new Date(),
  };

  if (data.displayName && data.displayName !== user.displayName) {
    await updateProfile(user, { displayName: data.displayName });
  }

  await updateUserProfile(user.uid, profileData);

  // The replaced avatar's record is marked only after Firestore holds the new
  // one: the source of truth moves first, then the old bytes become sweepable.
  if (resizedAvatarBlob && previousPhotoImageId && previousPhotoImageId !== photoImageId) {
    await markImageForDeletion(previousPhotoImageId).catch(() => {});
  }

  return { photoURL, photoImageId };
```

and change the return type to `Promise<{ photoURL: string; photoImageId?: string }>`. `triggerRebuild` stays as it is.

- [ ] **Step 7: Build**

```bash
npm run build
```
Expected: FAILS in `ProfileForm.astro` and `OnboardingForm.astro` — they still import `deleteGalleryImages`, `deleteAvatar`, `deleteUserData` and pass `email`. That is Task 17's job; the libraries themselves must type-check, which you confirm by reading the error list: every error must be in those two components, none in `src/lib/`.

- [ ] **Step 8: Commit**

```bash
git add src/lib
git commit -m "feat(lib): images.ts — record-first uploads; gallery/avatar/profile rewired; account callables"
```

### Task 16: The build reads `slugs/`; retired slugs alias

**Files:**
- Modify: `src/lib/memberView.ts`, `src/lib/membersBuild.ts`, `src/layouts/Layout.astro`, `src/pages/[...lang]/members/[slug].astro`

**Interfaces:**
- Produces: `resolveSlugs(members, table: Map<uid, slug>) → MemberView[]` (memberView); `fetchSlugAliases() → Promise<{ slug: string; uid: string }[]>` (membersBuild); `Layout` prop `redirectTo?: string`; `/members/<retired-slug>` renders the member page with a canonical + meta refresh to the current slug.

- [ ] **Step 1: `memberView.ts` — `resolveSlugs`**

Replace the `assignSlugs` function and its doc comment with:

```ts
/**
 * One slug per member. The `table` is slugs/ from Firestore (uid → current
 * slug), owned by the onPublicProfileWritten function; a member with a row
 * gets exactly that slug. A member with no row yet (inactive at migration,
 * never saved since) falls back to the derived form, deduplicated against
 * everything already taken. Fallback runs in uid order so it is stable
 * between builds.
 */
export function resolveSlugs(members: MemberViewBase[], table: Map<string, string>): MemberView[] {
  const used = new Set(table.values());
  const resolved = new Map<string, string>();
  const inUidOrder = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const member of inUidOrder) {
    const stored = table.get(member.id);
    if (stored) {
      resolved.set(member.id, stored);
      continue;
    }
    const base = slugifyName(member.displayName) || member.id.toLowerCase();
    let candidate = base;
    let n = 1;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    used.add(candidate);
    resolved.set(member.id, candidate);
  }

  return members.map((member) => ({ ...member, slug: resolved.get(member.id) as string }));
}

/**
 * The no-table case: every slug derived. This is what the migration used to
 * SEED slugs/, so that the stored table started out identical to the URLs
 * the site had been serving — nobody's link moved.
 */
export function assignSlugs(members: MemberViewBase[]): MemberView[] {
  return resolveSlugs(members, new Map());
}
```

Update the `MemberView.slug` doc comment to: `/** URL segment. From slugs/ when a row exists, else derived. See resolveSlugs(). */`

- [ ] **Step 2: `membersBuild.ts`**

Replace the import line for memberView and the `fetchMemberViews` function with:

```ts
import { resolveSlugs, toMemberViewBase, type MemberView } from "./memberView.ts";

interface Directory {
  members: MemberView[];
  /** Retired slugs still pointing at an active member: `/members/<slug>` aliases to their current page. */
  aliases: { slug: string; uid: string }[];
}

// Several pages call into this during one build; one fetch serves them all.
let directoryPromise: Promise<Directory> | null = null;

async function fetchDirectory(): Promise<Directory> {
  try {
    const serviceAccountJson = import.meta.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) throw new Error("FIREBASE_SERVICE_ACCOUNT env var not set");

    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
        : getApps()[0];
    const db = getFirestore(app);

    const [profiles, slugRows] = await Promise.all([
      db.collection("publicProfiles").orderBy("displayName").get(),
      db.collection("slugs").get(),
    ]);

    // The build READS slugs/ and never writes it: this code runs in CI with a
    // service account, and a build that wrote back would have every PR
    // preview mutating live data. onPublicProfileWritten owns the table.
    const current = new Map<string, string>();
    const retired: { slug: string; uid: string }[] = [];
    for (const row of slugRows.docs) {
      const { uid, current: isCurrent } = row.data() as { uid: string; current?: boolean };
      if (isCurrent) current.set(uid, row.id);
      else retired.push({ slug: row.id, uid });
    }

    const members = resolveSlugs(
      profiles.docs
        .filter((d) => d.data().active !== false)
        .map((d) => toMemberViewBase(d.id, d.data() as PublicProfileDoc)),
      current,
    );
    const activeUids = new Set(members.map((m) => m.id));
    return { members, aliases: retired.filter((a) => activeUids.has(a.uid)) };
  } catch (err) {
    console.error("[members] Failed to fetch members:", err);
    return { members: [], aliases: [] };
  }
}

/**
 * Every active member, ordered by display name, as render-ready view models.
 *
 * Returns an EMPTY ARRAY when credentials are missing or the read fails, and
 * logs. That is deliberate and matches what the community page has always done,
 * but know the consequence: **"no members" and "no credentials" look
 * identical**. It bites hardest in a fresh worktree, because `.env*` is
 * gitignored and does not come along. If the directory renders empty, check for
 * FIREBASE_SERVICE_ACCOUNT before hunting for a data bug.
 */
export async function fetchMemberViews(): Promise<MemberView[]> {
  directoryPromise ??= fetchDirectory();
  return (await directoryPromise).members;
}

export async function fetchSlugAliases(): Promise<{ slug: string; uid: string }[]> {
  directoryPromise ??= fetchDirectory();
  return (await directoryPromise).aliases;
}
```

- [ ] **Step 3: `Layout.astro` — `redirectTo`**

Add to `Props`:

```ts
  /**
   * Alias pages: canonical points here and a meta refresh sends the visitor
   * on. Static hosting has no 301, so this is the honest equivalent.
   */
  redirectTo?: string;
```

Add `redirectTo,` to the destructuring, change `canonicalUrl` to:

```ts
const canonicalUrl = new URL(redirectTo ?? Astro.url.pathname, Astro.site).href;
```

and in `<head>`, after the robots line:

```astro
    {redirectTo && <meta http-equiv="refresh" content={`0;url=${redirectTo}`} />}
```

- [ ] **Step 4: `[slug].astro` — alias paths**

Replace the import of `fetchMemberViews` with `import { fetchMemberViews, fetchSlugAliases } from "../../../lib/membersBuild.ts";` and add `memberHref` to the `links.ts` import. Replace `getStaticPaths` and the `Props`/destructuring with:

```ts
// One page per member per locale: `/members/<slug>` and `/de/members/<slug>`.
// The slug comes from slugs/ (owned by the onPublicProfileWritten function),
// so a rename claims a new one and RETIRES the old — and the old still
// resolves: a retired slug renders the same page with its canonical pointing
// at the current URL and a meta refresh, which is what static hosting has
// instead of a 301.
//
// Deliberately NOT under /profile: astro.config.mjs filters the sitemap with
// `!page.includes("/profile")` to keep the private editor out of it, and member
// pages under that prefix would be caught by the same test and silently
// dropped — the opposite of what a public profile wants.
export async function getStaticPaths() {
  const [members, aliases] = await Promise.all([fetchMemberViews(), fetchSlugAliases()]);
  const byUid = new Map(members.map((m) => [m.id, m]));
  const langs = [undefined, "de"] as const;
  return [
    ...members.flatMap((member) =>
      langs.map((lang) => ({ params: { lang, slug: member.slug }, props: { member } })),
    ),
    ...aliases.flatMap(({ slug, uid }) => {
      const member = byUid.get(uid);
      if (!member || member.slug === slug) return [];
      return langs.map((lang) => ({
        params: { lang, slug },
        props: { member, aliasOf: memberHref(lang ?? "en", member.slug) },
      }));
    }),
  ];
}

interface Props {
  member: MemberView;
  /** Set on alias pages: the current URL of this member. */
  aliasOf?: string;
}

const { member, aliasOf } = Astro.props;
```

and pass the two new props to `<Layout ...>`:

```astro
  noindex={Boolean(aliasOf)}
  redirectTo={aliasOf}
```

- [ ] **Step 5: Build** (still expected to fail only in the two forms — confirm no new errors from these four files)

```bash
npm run build 2>&1 | grep -v "ProfileForm\|OnboardingForm" | grep -i error
```
Expected: no lines.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memberView.ts src/lib/membersBuild.ts src/layouts/Layout.astro "src/pages/[...lang]/members/[slug].astro"
git commit -m "feat(build): slugs come from slugs/; retired slugs alias to the current page"
```

### Task 17: Forms — upload order, deletion flow, email change, email sync

**Files:**
- Modify: `src/components/ProfileForm.astro`, `src/components/OnboardingForm.astro`, `src/i18n/translations.ts`

**Interfaces:**
- Consumes: everything from Task 15.
- Produces: a shipping client that never writes `email`, never deletes from Storage, never deletes its own docs; deletion is `requestAccountDeletion` behind a mandatory password prompt; a banner with "Keep my account" while pending; an email-change form behind the same prompt.

- [ ] **Step 1: i18n keys**

Add to `ui.en` next to the existing `profile.delete.*` keys:

```ts
    "profile.delete.text":
      "Your account, profile and images will be scheduled for deletion. You have 30 days to change your mind — sign in and choose “Keep my account”.",
    "profile.delete.confirm": "Schedule deletion",
    "profile.delete.scheduled": "Your account is scheduled for deletion on {date}. Sign in any time before then to keep it.",
    "profile.delete.banner": "This account is scheduled for deletion on {date}.",
    "profile.delete.keep": "Keep my account",
    "profile.delete.keeping": "Restoring…",
    "profile.delete.error": "Deletion could not be scheduled. Please try again.",
    "profile.email.title": "Change email address",
    "profile.email.new": "New email address",
    "profile.email.submit": "Send confirmation link",
    "profile.email.sending": "Sending…",
    "profile.email.sent": "We sent a confirmation link to {email}. Your address changes once you click it.",
    "profile.email.error": "The address could not be changed. Check it and your password, then try again.",
```

(Replace the existing `profile.delete.text` and `profile.delete.confirm` values.) And in `ui.de`:

```ts
    "profile.delete.text":
      "Dein Konto, Profil und deine Bilder werden zur Löschung vorgemerkt. Du hast 30 Tage Zeit, es dir anders zu überlegen — melde dich an und wähle «Konto behalten».",
    "profile.delete.confirm": "Löschung vormerken",
    "profile.delete.scheduled": "Dein Konto wird am {date} gelöscht. Melde dich bis dahin jederzeit an, um es zu behalten.",
    "profile.delete.banner": "Dieses Konto wird am {date} gelöscht.",
    "profile.delete.keep": "Konto behalten",
    "profile.delete.keeping": "Wird wiederhergestellt…",
    "profile.delete.error": "Die Löschung konnte nicht vorgemerkt werden. Bitte erneut versuchen.",
    "profile.email.title": "E-Mail-Adresse ändern",
    "profile.email.new": "Neue E-Mail-Adresse",
    "profile.email.submit": "Bestätigungslink senden",
    "profile.email.sending": "Wird gesendet…",
    "profile.email.sent": "Wir haben einen Bestätigungslink an {email} geschickt. Die Adresse ändert sich, sobald du ihn anklickst.",
    "profile.email.error": "Die Adresse konnte nicht geändert werden. Prüfe sie und dein Passwort und versuche es erneut.",
```

Remove `"profile.delete.deleting"` from both locales (no longer used).

- [ ] **Step 2: ProfileForm markup — banner, email form, deletion views**

As the first child of `<form id="profile-form" class="profile-form" data-lang={lang}>`, before the `.section-tab` buttons, add (the buttons are `type="button"` because they sit inside the form):

```astro
  <div id="deletion-banner" class="deletion-banner" style="display:none;" role="status">
    <p id="deletion-banner-text"></p>
    <button type="button" id="btn-keep-account" class="btn-solid">{t("profile.delete.keep")}</button>
  </div>
```

In the Account section, before the `<div id="delete-idle">` block's parent, add the email form:

```astro
    <div class="account-block">
      <h3 class="label">{t("profile.email.title")}</h3>
      <label class="label" for="email-new">{t("profile.email.new")}</label>
      <input id="email-new" type="email" class="input" autocomplete="email" />
      <label class="label" for="email-password">{t("profile.reauth.text")}</label>
      <input id="email-password" type="password" class="input" autocomplete="current-password" />
      <p id="email-msg" class="msg-ok" style="display:none;"></p>
      <p id="email-error" class="msg-err" style="display:none;"></p>
      <button type="button" id="btn-email-change" class="btn-solid">{t("profile.email.submit")}</button>
    </div>
```

Replace the three deletion `<div>`s (`delete-idle`, `delete-confirm`, `delete-reauth`) with:

```astro
      <div id="delete-idle">
        <button type="button" id="btn-delete-start" class="btn-danger-link"
          >{t("profile.delete.idle")}</button
        >
      </div>

      <div id="delete-reauth" style="display:none;">
        <p class="danger-text">{t("profile.delete.text")}</p>
        <p class="danger-text">{t("profile.reauth.text")}</p>
        <input
          id="reauth-password"
          type="password"
          class="input"
          placeholder="••••••••"
          autocomplete="current-password"
        />
        <p id="reauth-error" class="msg-err" style="display:none;"></p>
        <div class="danger-actions">
          <button type="button" id="btn-reauth-cancel" class="btn-link"
            >{t("profile.reauth.cancel")}</button
          >
          <button type="button" id="btn-reauth-confirm" class="btn-danger"
            >{t("profile.delete.confirm")}</button
          >
        </div>
      </div>

      <div id="delete-scheduled" style="display:none;">
        <p id="delete-scheduled-text" class="danger-text"></p>
      </div>
```

Add to the component's scoped `<style>`:

```css
  .deletion-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    border: 1px solid var(--color-dark);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
  }
  .account-block {
    display: grid;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }
```

- [ ] **Step 3: ProfileForm script — imports**

In the `<script>` imports: delete the line `import { deleteAvatar } from "../lib/storage.ts";` (it was that module's only import here), remove `deleteUserData` from the `../lib/firestore.ts` import list, remove `deleteGalleryImages` from the `../lib/gallery.ts` list and add `syncGalleryText`. Add `verifyBeforeUpdateEmail` to the `firebase/auth` import (next to `reauthenticateWithCredential`, `EmailAuthProvider`). Add:

```ts
  import { markImageForDeletion } from "../lib/images.ts";
  import { cancelAccountDeletion, ensureEmailSynced, requestAccountDeletion } from "../lib/account.ts";
```

- [ ] **Step 4: ProfileForm script — gallery**

In `removeGalleryImage`, replace `if (removed) await deleteGalleryImages([removed.url]);` with `if (removed) await markImageForDeletion(removed.imageId);`.

In the `galleryInput` change handler, replace:

```ts
          const { blob, width, height, color } = await compressGalleryImage(edited ?? file);
          const url = await uploadGalleryImage(user.uid, blob, (pct) => {
            setGalleryStatus(`${s["profile.upload.uploading"]} ${pct}%`);
          });
          gallery.push({ url, caption: "", width, height, color });
```

with:

```ts
          const compressed = await compressGalleryImage(edited ?? file);
          const item = await uploadGalleryImage(user.uid, compressed, (pct) => {
            setGalleryStatus(`${s["profile.upload.uploading"]} ${pct}%`);
          });
          gallery.push(item);
```

- [ ] **Step 5: ProfileForm script — load, save, banner**

Next to `let resizedAvatarBlob: Blob | null = null;` add `let currentPhotoImageId = "";` and a date formatter:

```ts
    const fmtDate = (iso: string) =>
      new Date(iso).toLocaleDateString(lang === "de" ? "de-CH" : "en-GB", {
        day: "numeric", month: "long", year: "numeric",
      });
```

In the load handler, after `const data = await getUser(user.uid);` (the line that fetches the profile), add:

```ts
      currentPhotoImageId = data.photoImageId ?? "";
      await ensureEmailSynced(user, data.email);
      if (data.status === "pendingDeletion" && data.purgeAfter) {
        // getUser() hands back raw Firestore data, so at runtime this is a
        // Timestamp even though UserDoc types it as Date.
        const purgeAfter = data.purgeAfter as unknown as { toDate(): Date };
        showDeletionBanner(purgeAfter.toDate().toISOString());
      }
```

In the Save handler's `handleProfileUpdate(user, { ... })` options: delete the `email: user.email!,` line and add `previousPhotoImageId: currentPhotoImageId,`. Capture the result and sync text — change `await handleProfileUpdate(` to `const saved = await handleProfileUpdate(` and after the call add:

```ts
        if (saved.photoImageId) currentPhotoImageId = saved.photoImageId;
        await syncGalleryText(gallery);
```

- [ ] **Step 6: ProfileForm script — deletion and email**

Replace everything from the `// ── Delete account` comment to the end of the `astro:page-load` handler body with:

```ts
    // ── Delete account ──────────────────────────────────────────────
    // Soft delete through requestAccountDeletion: the function hides the
    // member and opens a 30-day job; nothing is destroyed here. The password
    // prompt is not optional — the callable checks auth_time server-side.
    const deleteIdle = document.getElementById("delete-idle")!;
    const deleteReauth = document.getElementById("delete-reauth")!;
    const deleteScheduled = document.getElementById("delete-scheduled")!;
    const deleteScheduledText = document.getElementById("delete-scheduled-text")!;
    const reauthInput = document.getElementById("reauth-password") as HTMLInputElement;
    const reauthError = document.getElementById("reauth-error")!;
    const banner = document.getElementById("deletion-banner")!;
    const bannerText = document.getElementById("deletion-banner-text")!;
    const keepBtn = document.getElementById("btn-keep-account") as HTMLButtonElement;

    function showDeleteView(view: "idle" | "reauth" | "scheduled") {
      deleteIdle.style.display = view === "idle" ? "block" : "none";
      deleteReauth.style.display = view === "reauth" ? "block" : "none";
      deleteScheduled.style.display = view === "scheduled" ? "block" : "none";
    }

    function showDeletionBanner(purgeAfterIso: string) {
      bannerText.textContent = s["profile.delete.banner"].replace("{date}", fmtDate(purgeAfterIso));
      banner.style.display = "flex";
      deleteScheduledText.textContent = s["profile.delete.scheduled"].replace("{date}", fmtDate(purgeAfterIso));
      showDeleteView("scheduled");
    }

    async function reauthenticate(password: string) {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("not signed in");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      return user;
    }

    document.getElementById("btn-delete-start")!.addEventListener("click", () => showDeleteView("reauth"));
    document.getElementById("btn-reauth-cancel")!.addEventListener("click", () => {
      reauthInput.value = "";
      reauthError.style.display = "none";
      showDeleteView("idle");
    });

    document.getElementById("btn-reauth-confirm")!.addEventListener("click", async () => {
      const btn = document.getElementById("btn-reauth-confirm") as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = s["profile.reauth.confirming"];
      reauthError.style.display = "none";
      try {
        await reauthenticate(reauthInput.value);
      } catch {
        reauthError.textContent = s["profile.reauth.error"];
        reauthError.style.display = "block";
        btn.disabled = false;
        btn.textContent = s["profile.delete.confirm"];
        return;
      }
      try {
        const { purgeAfter } = await requestAccountDeletion();
        reauthInput.value = "";
        showDeletionBanner(purgeAfter);
      } catch {
        reauthError.textContent = s["profile.delete.error"];
        reauthError.style.display = "block";
      } finally {
        btn.disabled = false;
        btn.textContent = s["profile.delete.confirm"];
      }
    });

    keepBtn.addEventListener("click", async () => {
      keepBtn.disabled = true;
      keepBtn.textContent = s["profile.delete.keeping"];
      try {
        await cancelAccountDeletion();
        window.location.reload();
      } catch {
        keepBtn.disabled = false;
        keepBtn.textContent = s["profile.delete.keep"];
      }
    });

    // ── Change email ────────────────────────────────────────────────
    // Auth does the safe part: the link goes to the NEW address and the swap
    // happens only when it is clicked. The Firestore mirror follows on the
    // next load through ensureEmailSynced.
    const emailNew = document.getElementById("email-new") as HTMLInputElement;
    const emailPassword = document.getElementById("email-password") as HTMLInputElement;
    const emailMsg = document.getElementById("email-msg")!;
    const emailError = document.getElementById("email-error")!;
    const emailBtn = document.getElementById("btn-email-change") as HTMLButtonElement;

    emailBtn.addEventListener("click", async () => {
      const next = emailNew.value.trim();
      emailMsg.style.display = "none";
      emailError.style.display = "none";
      if (!next.includes("@")) return;
      emailBtn.disabled = true;
      emailBtn.textContent = s["profile.email.sending"];
      try {
        const user = await reauthenticate(emailPassword.value);
        await verifyBeforeUpdateEmail(user, next);
        emailMsg.textContent = s["profile.email.sent"].replace("{email}", next);
        emailMsg.style.display = "block";
        emailNew.value = "";
        emailPassword.value = "";
      } catch {
        emailError.textContent = s["profile.email.error"];
        emailError.style.display = "block";
      } finally {
        emailBtn.disabled = false;
        emailBtn.textContent = s["profile.email.submit"];
      }
    });
```

`showDeletionBanner` is referenced from the load handler (Step 5); both live inside the same `astro:page-load` callback, and function declarations hoist, so the order within it does not matter.

- [ ] **Step 7: OnboardingForm**

- Import list: remove `deleteGalleryImages`, add `import { markImageForDeletion } from "../lib/images.ts";` and `import { syncEmail } from "../lib/account.ts";`.
- In `removeGalleryImage`: `if (removed) await deleteGalleryImages([removed.url]);` → `if (removed) await markImageForDeletion(removed.imageId);`.
- In the upload loop replace the `compressGalleryImage` … `gallery.push(...)` lines with:

```ts
            const compressed = await compressGalleryImage(file);
            const item = await uploadGalleryImage(user.uid, compressed, (pct) => {
              setGalleryStatus(`${s["profile.upload.uploading"]} ${pct}%`);
            });
            // One image failing is one image failing: the loop keeps going and
            // everything already uploaded stays.
            gallery.push(item);
```

- In the step-0 `handleProfileUpdate(user, { ... })` call delete `email: user.email!,`.
- In the `upsertOnboardingRequest(user.uid, { ... })` call delete `email: user.email ?? undefined,`.
- Replace `await createUser(user.uid, { email: user.email! }).catch(() => {});` with `await syncEmail().catch(() => {});` and remove `createUser` from the import if now unused.

- [ ] **Step 8: Lint, build, deploy to dev, verify**

```bash
npm run lint && npm run build && npm run deploy:dev
```
On dev, with a throwaway verified account:
1. Upload a gallery image. In the Firebase console, `images/` must show a new record with `status: live` and the gallery array item must carry its `imageId`; Storage must show `users/<uid>/gallery/<id>.webp`.
2. Remove it. The record flips to `pendingDeletion`; the object stays (the sweeper takes it within 6 h).
3. Change the avatar. A new `avatar` record appears; the previous one is `pendingDeletion`; `users/<uid>.photoImageId` matches the new record.
4. Account tab → Delete account → wrong password → error; right password → the banner appears with a date 30 days out, and `publicProfiles/<uid>.active` is `false`. Reload: banner persists. Click Keep my account → banner gone, `active` restored.
5. Change email to a second address you control; the link arrives at the new address; after clicking it and signing in again, `users/<uid>.email` matches.

Then `node scripts/check-integrity.mjs -P dev` → `0 problem(s)`.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProfileForm.astro src/components/OnboardingForm.astro src/i18n/translations.ts
git commit -m "feat(profile): record-first uploads, soft-delete with grace, email change; client never writes email"
```

### Task 18: The `/admin` page

**Files:**
- Create: `src/lib/adminApi.ts`, `src/pages/admin.astro`, `src/components/admin/AdminConsole.astro`
- Modify: `astro.config.mjs` (sitemap filter)

**Interfaces:**
- Consumes: the six admin callables (Task 9) with the payloads listed there.
- Produces: `/admin` — gate → search → member detail with actions → queues. English only.

- [ ] **Step 1: `src/lib/adminApi.ts`**

```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.ts";

// Shapes mirror functions/src/adminOps.ts; Timestamps arrive as ISO strings.
export interface AuthSummary {
  uid: string; email: string | null; emailVerified: boolean; disabled: boolean;
  createdAt: string; lastSignInAt: string | null; admin: boolean;
}
export interface AdminImage {
  imageId: string; ownerUid: string; kind: "avatar" | "gallery"; storagePath: string;
  width: number; height: number; color?: string; caption?: string; description?: string;
  origin: "member" | "curated"; status: "uploading" | "live" | "pendingDeletion"; createdAt: string;
}
export interface DeletionJobView {
  uid: string; requestedBy: string; requestedAt: string; purgeAfter: string; activeBefore: boolean;
  imageIds: string[];
  steps: { imagesDeleted: boolean; filesDeleted: boolean; docsDeleted: boolean; authDeleted: boolean };
  completedAt: string | null; lastError: string | null;
}
export interface MemberGraph {
  uid: string;
  auth: AuthSummary | null;
  user: Record<string, unknown> | null;
  publicProfile: Record<string, unknown> | null;
  images: AdminImage[];
  onboardingRequest: Record<string, unknown> | null;
  deletion: DeletionJobView | null;
  slugs: { slug: string; current: boolean }[];
}
export interface LookupResult {
  graph: MemberGraph | null;
  matches: { uid: string; displayName: string; active: boolean }[];
}
export interface Queues {
  pendingDeletions: DeletionJobView[];
  staleUploads: AdminImage[];
  emailMismatches: { uid: string; storedEmail: string | null; authEmail: string }[];
}

const call = <Req, Res>(name: string) => async (data: Req): Promise<Res> =>
  (await httpsCallable<Req, Res>(functions, name)(data)).data;

export const lookupMember = call<{ query: string }, LookupResult>("adminLookupMember");
export const listQueues = call<void, Queues>("adminListQueues");
export const purgeAccount = call<{ uid: string; immediate?: boolean }, { ok: true; purgeAfter: string }>("adminPurgeAccount");
export const restoreAccount = call<{ uid: string }, { ok: true }>("adminRestoreAccount");
export const setMemberEmail = call<{ uid: string; email: string }, { ok: true }>("adminSetMemberEmail");
export const setProfileActive = call<{ uid: string; active: boolean }, { ok: true }>("adminSetProfileActive");
```

- [ ] **Step 2: `src/pages/admin.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import AdminConsole from "../components/admin/AdminConsole.astro";

// A tool, not content: no locale prefix, English only, noindex, out of the
// sitemap (astro.config.mjs). Statically built but data-free — everything on
// it comes from admin callables at runtime, behind the `admin` custom claim.
---

<Layout title="Admin — VSCN" noindex wide>
  <AdminConsole />
</Layout>
```

- [ ] **Step 3: `astro.config.mjs`**

In the sitemap `filter`, add `&& !page.includes('/admin')`.

- [ ] **Step 4: `src/components/admin/AdminConsole.astro`**

```astro
<section class="admin" id="admin">
  <p id="admin-gate" class="admin__gate">Checking access…</p>

  <div id="admin-app" hidden>
    <form id="admin-search" class="admin__search" autocomplete="off">
      <input id="admin-query" class="input" type="search" placeholder="email · uid · slug · imageId · name" />
      <button type="submit" class="btn-solid">Look up</button>
      <button type="button" id="admin-queues-btn" class="btn-ghost">Queues</button>
    </form>
    <p id="admin-status" class="admin__status" role="status"></p>
    <div id="admin-results"></div>
    <div id="admin-detail"></div>
    <div id="admin-queues"></div>
  </div>
</section>

<style>
  .admin { display: grid; gap: 1.25rem; }
  .admin__gate { color: var(--color-muted); }
  .admin__search { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .admin__search .input { flex: 1 1 20rem; }
  .admin__status { min-height: 1.25rem; color: var(--color-muted); }
  .admin :global(.card) {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 1rem;
    display: grid;
    gap: 0.5rem;
  }
  .admin :global(h2) { font-size: 1.1rem; margin: 0; }
  .admin :global(h3) { font-size: 0.9rem; margin: 0.5rem 0 0; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .admin :global(dl) { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0; }
  .admin :global(dt) { color: var(--color-muted); }
  .admin :global(dd) { margin: 0; overflow-wrap: anywhere; }
  .admin :global(.actions) { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .admin :global(.thumbs) { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
  .admin :global(.thumb img) { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-xs); background: var(--color-border); }
  .admin :global(.thumb small) { display: block; color: var(--color-muted); overflow-wrap: anywhere; }
  .admin :global(.tag) { display: inline-block; padding: 0 0.4rem; border: 1px solid var(--color-border); border-radius: var(--radius-xs); font-size: 0.8rem; }
  .admin :global(.tag--warn) { border-color: var(--color-dark); }
  .admin :global(.row) { display: flex; justify-content: space-between; gap: 1rem; padding: 0.35rem 0; border-bottom: 1px solid var(--color-border); }
  .admin :global(.row button) { white-space: nowrap; }
</style>

<script>
  import { onAuthStateChanged } from "firebase/auth";
  import { auth } from "../../lib/firebase.ts";
  import {
    listQueues, lookupMember, purgeAccount, restoreAccount, setMemberEmail, setProfileActive,
    type AdminImage, type MemberGraph, type Queues,
  } from "../../lib/adminApi.ts";

  // Tiny DOM builder so member-entered strings go through textContent, never innerHTML.
  type Child = Node | string | null | undefined | false;
  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, attrs: Record<string, string> = {}, ...children: Child[]
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const c of children) if (c) node.append(typeof c === "string" ? document.createTextNode(c) : c);
    return node;
  }
  const dl = (rows: [string, unknown][]) =>
    el("dl", {}, ...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v == null || v === "" ? "—" : String(v))]));
  const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-GB") : "—");

  document.addEventListener("astro:page-load", () => {
    const gate = document.getElementById("admin-gate");
    const app = document.getElementById("admin-app") as HTMLElement | null;
    if (!gate || !app) return; // not on /admin

    const status = document.getElementById("admin-status")!;
    const results = document.getElementById("admin-results")!;
    const detail = document.getElementById("admin-detail")!;
    const queues = document.getElementById("admin-queues")!;
    const query = document.getElementById("admin-query") as HTMLInputElement;

    const say = (msg: string) => { status.textContent = msg; };
    const busy = async <T,>(label: string, work: () => Promise<T>): Promise<T | undefined> => {
      say(label);
      try { const out = await work(); say(""); return out; }
      catch (err) { say(err instanceof Error ? err.message : String(err)); return undefined; }
    };

    onAuthStateChanged(auth, async (user) => {
      const claims = user ? (await user.getIdTokenResult()).claims : {};
      if (claims.admin !== true) {
        gate.textContent = user ? "This account is not an admin." : "Sign in with an admin account.";
        app.hidden = true;
        return;
      }
      gate.hidden = true;
      app.hidden = false;
    });

    async function show(uid: string) {
      const res = await busy("Loading…", () => lookupMember({ query: uid }));
      if (res?.graph) renderGraph(res.graph);
    }

    document.getElementById("admin-search")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      results.replaceChildren();
      detail.replaceChildren();
      queues.replaceChildren();
      const q = query.value.trim();
      if (!q) return;
      const res = await busy("Searching…", () => lookupMember({ query: q }));
      if (!res) return;
      if (res.graph) return renderGraph(res.graph);
      if (res.matches.length === 0) return say("Nothing matches.");
      results.replaceChildren(
        el("div", { class: "card" }, el("h2", {}, `${res.matches.length} name match(es)`),
          ...res.matches.map((m) => {
            const btn = el("button", { type: "button", class: "btn-link" }, m.uid);
            btn.addEventListener("click", () => show(m.uid));
            return el("div", { class: "row" }, el("span", {}, `${m.displayName}${m.active ? "" : " (hidden)"}`), btn);
          })),
      );
    });

    function thumb(img: AdminImage) {
      const url = `https://firebasestorage.googleapis.com/v0/b/${auth.app.options.storageBucket}/o/${encodeURIComponent(img.storagePath)}?alt=media`;
      return el("figure", { class: "thumb" },
        el("img", { src: url, alt: img.caption ?? "", loading: "lazy" }),
        el("small", {}, `${img.kind} · ${img.status}${img.origin === "curated" ? " · curated" : ""}`),
        el("small", {}, img.imageId),
      );
    }

    function renderGraph(g: MemberGraph) {
      results.replaceChildren();
      queues.replaceChildren();
      const pub = g.publicProfile ?? {};
      const usr = g.user ?? {};
      const active = pub.active !== false && g.publicProfile !== null;
      const pending = g.deletion && !g.deletion.completedAt;

      const action = (label: string, cls: string, run: () => Promise<unknown>, confirmText?: string) => {
        const b = el("button", { type: "button", class: cls }, label);
        b.addEventListener("click", async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          const ok = await busy(`${label}…`, run);
          if (ok !== undefined) await show(g.uid);
        });
        return b;
      };

      const actions = el("div", { class: "actions" },
        g.publicProfile && action(active ? "Hide profile" : "Show profile", "btn-ghost",
          () => setProfileActive({ uid: g.uid, active: !active })),
        g.auth && action("Set email", "btn-ghost", async () => {
          const email = window.prompt("New email address for this member:", g.auth?.email ?? "");
          if (!email) throw new Error("Cancelled.");
          return setMemberEmail({ uid: g.uid, email });
        }),
        !pending && action("Schedule deletion (30 days)", "btn-ghost",
          () => purgeAccount({ uid: g.uid }), `Schedule deletion of ${g.uid}? The member can still cancel for 30 days.`),
        pending && action("Restore", "btn-solid", () => restoreAccount({ uid: g.uid })),
        action("Purge now", "btn-ghost", () => purgeAccount({ uid: g.uid, immediate: true }),
          `PERMANENTLY delete ${g.uid} — every document, file and the Auth user. Type OK to continue.`),
      );

      detail.replaceChildren(
        el("div", { class: "card" },
          el("h2", {}, String(pub.displayName ?? usr.displayName ?? g.uid)),
          el("div", {},
            el("span", { class: `tag${active ? "" : " tag--warn"}` }, active ? "public" : "hidden"),
            " ",
            pending ? el("span", { class: "tag tag--warn" }, `deletion ${fmt(g.deletion!.purgeAfter)}`) : null,
          ),
          el("h3", {}, "Identity"),
          dl([
            ["uid", g.uid],
            ["auth email", g.auth?.email], ["verified", g.auth ? String(g.auth.emailVerified) : "no Auth user"],
            ["mirror email", usr.email], ["phone", usr.phone],
            ["created", fmt(g.auth?.createdAt)], ["last sign-in", fmt(g.auth?.lastSignInAt)],
            ["status", usr.status ?? (g.user ? "active" : "profile only")],
            ["slugs", g.slugs.map((s) => `${s.slug}${s.current ? "" : " (retired)"}`).join(", ")],
          ]),
          el("h3", {}, "Actions"), actions,
          el("h3", {}, `Images (${g.images.length})`),
          el("div", { class: "thumbs" }, ...g.images.map(thumb)),
          g.onboardingRequest && el("h3", {}, "Onboarding request"),
          g.onboardingRequest && el("p", {}, String(g.onboardingRequest.message ?? "")),
          g.deletion && el("h3", {}, "Deletion job"),
          g.deletion && dl([
            ["requested", `${fmt(g.deletion.requestedAt)} by ${g.deletion.requestedBy}`],
            ["purge after", fmt(g.deletion.purgeAfter)],
            ["steps", Object.entries(g.deletion.steps).filter(([, v]) => v).map(([k]) => k).join(", ") || "none yet"],
            ["completed", fmt(g.deletion.completedAt)], ["last error", g.deletion.lastError],
          ]),
        ),
      );
    }

    document.getElementById("admin-queues-btn")!.addEventListener("click", async () => {
      results.replaceChildren();
      detail.replaceChildren();
      const q = await busy("Loading queues…", () => listQueues());
      if (q) renderQueues(q);
    });

    function renderQueues(q: Queues) {
      const link = (uid: string) => { const b = el("button", { type: "button", class: "btn-link" }, uid); b.addEventListener("click", () => show(uid)); return b; };
      queues.replaceChildren(
        el("div", { class: "card" },
          el("h2", {}, `Pending deletions (${q.pendingDeletions.length})`),
          ...q.pendingDeletions.map((j) => el("div", { class: "row" },
            el("span", {}, `purge after ${fmt(j.purgeAfter)} · by ${j.requestedBy}${j.lastError ? ` · ERROR ${j.lastError}` : ""}`), link(j.uid))),
          el("h2", {}, `Stale uploads (${q.staleUploads.length})`),
          ...q.staleUploads.map((i) => el("div", { class: "row" },
            el("span", {}, `${i.imageId} · ${fmt(i.createdAt)}`), link(i.ownerUid))),
          el("h2", {}, `Email mismatches (${q.emailMismatches.length})`),
          ...q.emailMismatches.map((m) => el("div", { class: "row" },
            el("span", {}, `mirror ${m.storedEmail ?? "—"} ≠ auth ${m.authEmail}`), link(m.uid))),
        ),
      );
    }
  });
</script>
```

- [ ] **Step 5: Lint, build, deploy, verify**

```bash
npm run lint && npm run build && npm run deploy:dev
```
On dev `/admin`: signed out → "Sign in with an admin account."; signed in as a non-admin → "This account is not an admin."; signed in as the admin from Task 10 (after a fresh sign-in so the claim is on the token) → the search form. Then: look up your throwaway account by email → detail renders with images; **Hide profile** → tag flips to `hidden` and `publicProfiles.active` is false in the console; **Show profile** → back. **Schedule deletion** → tag shows the date; **Queues** lists it; **Restore** → gone. Look up by slug and by an imageId — both resolve to the same member. **Purge now** on the throwaway account → confirm, then `check-integrity` reports `0 problem(s)` and the Auth user is gone.

- [ ] **Step 6: Commit**

```bash
git add src/lib/adminApi.ts src/pages/admin.astro src/components/admin/AdminConsole.astro astro.config.mjs
git commit -m "feat(admin): /admin — lookup graph, actions, queues, behind the admin claim"
```

---

## Phase 5 — Tighten and clean up (rollout steps 6–7)

**Sequencing that matters:** Task 19 removes what the OLD client needs. Run it against a project only after that project is serving the NEW client — dev after `npm run deploy:dev` from Task 18; prod after the feature branch has merged to `main` and the merge workflow has deployed it.

### Task 19: Rules tightening

**Files:**
- Modify: `firestore.rules`, `storage.rules`
- Test: `tests/rules/firestore.test.mjs`, `tests/rules/storage.test.mjs`, `tests/rules/helpers.mjs`

**Interfaces:**
- Produces: gallery items require a non-empty `imageId`; clients cannot write `users.email` (absent on create, unchanged on update); owners cannot delete `users/*` or `publicProfiles/*`; legacy Storage paths are read-only.

- [ ] **Step 1: Update the tests first**

In `tests/rules/helpers.mjs`, remove the `email:` line from `minimalUser` (a client no longer sends it).

In `tests/rules/firestore.test.mjs`, replace the test `publicProfiles: gallery items may carry imageId (both shapes accepted)` with:

```js
test("publicProfiles: every gallery item must carry an imageId", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [{ imageId: "img-1", url, caption: "", width: 10, height: 10 }],
  }));
  await assertFails(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [{ url, caption: "", width: 10, height: 10 }],
  }));
  await assertFails(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "Test Member",
    gallery: [{ imageId: "", url, caption: "", width: 10, height: 10 }],
  }));
});

test("users: email is server-written — absent on create, unchanged on update", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).set({ ...minimalUser(OWNER), email: `${OWNER}@example.test` }));
  await seed(env, `users/${OWNER}`, { ...minimalUser(OWNER), email: "stored@example.test" });
  await assertSucceeds(db.doc(`users/${OWNER}`).set({ bio: "still fine" }, { merge: true }));
  await assertFails(db.doc(`users/${OWNER}`).update({ email: "other@example.test" }));
});

test("users/publicProfiles: owners cannot delete their own docs (purge does)", async () => {
  await seed(env, `users/${OWNER}`, minimalUser(OWNER));
  await seed(env, `publicProfiles/${OWNER}`, { displayName: "Test Member" });
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertFails(db.doc(`users/${OWNER}`).delete());
  await assertFails(db.doc(`publicProfiles/${OWNER}`).delete());
});
```

In `tests/rules/storage.test.mjs` add:

```js
test("storage: legacy paths are read-only", async () => {
  const s = env.authenticatedContext(OWNER, verified(OWNER)).storage();
  await assertFails(s.ref(`galleries/${OWNER}/123-abc.webp`).put(webp(64), { contentType: "image/webp" }));
  await assertFails(s.ref(`avatars/${OWNER}-123.webp`).put(webp(64), { contentType: "image/webp" }));
});
```

Run `npm run test:rules` — the new tests fail.

- [ ] **Step 2: `firestore.rules`**

- `validGalleryItem`: replace the optional check with `&& item.imageId is string && item.imageId.size() > 0 && item.imageId.size() <= 40` and delete the "optional during the rollout window" comment.
- `validPrivateUser`: delete the line `&& (!('email' in data) || data.email == auth.token.email)`. Its `auth` parameter is now unused — remove it from the signature and from the `users` match calls.
- `serverFieldsAbsent`: add `&& !('email' in data)`. `serverFieldsUntouched`: add `&& data.get('email', null) == existing.get('email', null)`. Update the comment above them to name `email` as the mirror syncEmail writes.
- `users` and `publicProfiles`: `allow delete: if false;` with the comment `// purgeAccount (Admin SDK) is the only path that removes an account.` Delete the ROLLOUT WINDOW comment.
- `validOnboardingRequest`: remove `'email'` from `allowedKeys` and delete the line `&& (!('email' in data) || data.email == auth.token.email)`. The migration stripped the stored copies (Task 12) and the client stopped sending it (Task 17); the uid is the link to `users`.

- [ ] **Step 3: `storage.rules`**

In the `avatars/{filename}` and `galleries/{uid}/{filename}` blocks, delete the `allow write` and `allow delete` rules and their comments, leaving `allow read: if true;` with the comment `// Legacy layout, read-only until --cleanup-legacy has run (Task 20).`

- [ ] **Step 4: Run, deploy to dev, verify**

```bash
npm run test:rules
npx -y firebase-tools@latest deploy -P dev --only firestore:rules,storage
```
On dev: save a profile, upload and remove an image — all must still work with the new client. Then `git commit`:

```bash
git add firestore.rules storage.rules tests/rules/
git commit -m "feat(rules): tighten — imageId required, email server-only, no client deletes, legacy paths read-only"
```

- [ ] **Step 5: Prod — ONLY after the new client is live on prod**

```bash
npx -y firebase-tools@latest deploy -P default --only firestore:rules,storage
```
Then on prod: one profile save with a real account, and `node scripts/check-integrity.mjs -P prod`.

### Task 20: Legacy cleanup, docs, memory

**Files:**
- Modify: `storage.rules` (remove legacy matches)
- Delete: `scripts/cleanup-orphaned-storage.mjs`
- Modify: `CLAUDE.md`, `documentation/20260823-user-content-backend-design.md`
- Modify: `documentation/agent-memory/firebase-entity-restructuring.md` and its `~/.claude` twin

- [ ] **Step 1: Delete the legacy objects**

Only after the rebuilt sites (Task 14 Step 2 and Step 4) have been confirmed serving `users/…` URLs:

```bash
node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --cleanup-legacy
node --experimental-strip-types scripts/migrate-image-records.mjs -P dev --write --cleanup-legacy
node --experimental-strip-types scripts/migrate-image-records.mjs -P prod --cleanup-legacy
node --experimental-strip-types scripts/migrate-image-records.mjs -P prod --write --cleanup-legacy
```
Read each dry run before its `--write`. The script refuses if any array item still lacks an `imageId`.

- [ ] **Step 2: Remove the legacy Storage matches**

Delete the `match /avatars/{filename}` and `match /galleries/{uid}/{filename}` blocks from `storage.rules` entirely (the catch-all denies them). Update the legacy test in `storage.test.mjs` to also assert `getDownloadURL()` on a legacy path fails. Run `npm run test:rules`, then deploy to dev and prod:

```bash
npx -y firebase-tools@latest deploy -P dev --only storage
npx -y firebase-tools@latest deploy -P default --only storage
```

- [ ] **Step 3: Delete the superseded script**

```bash
git rm scripts/cleanup-orphaned-storage.mjs
```
`sweepImages` replaced it: orphans are now a query, not a crawl.

- [ ] **Step 4: `CLAUDE.md`**

- Commands: add `npm run test:rules   # firestore.rules + storage.rules against the emulator (needs Java)`.
- Replace the sentence `There is **no test framework** in this repo, and none should be added casually.` with: `There is **no test framework** for src/ and none should be added casually. The ONE exception is `tests/rules/` — rules tests on the emulator via `@firebase/rules-unit-testing` + `node --test`, because a rules mistake fails silently (see the hasOnly trap below) and nothing else catches it.`
- In "Two-collection profile model", append a paragraph:

```markdown
**Images are records.** `images/{imageId}` is the source of truth for every avatar and gallery image (`ownerUid`, `kind`, `storagePath`, status). The `gallery` array on both profile docs is a display projection carrying each item's `imageId`; `photoImageId` points at the avatar's record. Uploads go record → bytes → `live` (`src/lib/images.ts`), which is what makes a Storage object without a record impossible; removal MARKS the record (`pendingDeletion`) and the `sweepImages` function deletes bytes and record together. Storage layout is `users/{uid}/{avatar|gallery}/{imageId}.webp` — one prefix per account. Never parse a download URL back into a path; derive URLs from `storagePath`.

**Lifecycle is server-side.** `users.status`, `purgeAfter`, `deletionRequestedAt` and `email` are written only by Cloud Functions (`functions/src/`); rules keep them in the client allowlist purely so merged writes pass `hasOnly`, and pin them unchanged. Account deletion is `requestAccountDeletion` (30-day grace, `active: false` hides the member immediately, `purgeExpiredAccounts` finishes it). Slugs live in `slugs/`, owned by `onPublicProfileWritten`; the build reads them and must never write them. The `admin` custom claim (`scripts/set-admin.mjs`) gates `/admin` and the `admin*` callables; admins read through rules and write only through callables, logged to `adminActions`. Design: `documentation/20260902-firebase-entity-restructuring-design.md`.
```

- [ ] **Step 5: Mark the older design superseded**

At the top of `documentation/20260823-user-content-backend-design.md`, under the `Status:` line, add: `Superseded in part (2026-09): §1 storage layout and the URL-based deletion model are replaced by documentation/20260902-firebase-entity-restructuring-design.md. §2–§3 (formats, pipeline) still stand.`

- [ ] **Step 6: Memory**

Edit both `documentation/agent-memory/firebase-entity-restructuring.md` and `~/.claude/projects/D--SynoDrive-VSCN/memory/firebase-entity-restructuring.md`: change the first line's `**no code written yet**` to `**SHIPPED <date>**`, and its `description:` frontmatter (user copy only) to `SHIPPED 2026-09: images are records, soft-delete lifecycle live, /admin behind the admin claim; the five decisions the code won't show you`. Update the one-line hook in `~/.claude/projects/D--SynoDrive-VSCN/memory/MEMORY.md` to match.

- [ ] **Step 7: Final gates and commit**

```bash
npm run lint && npm run build && npm run test:rules
node scripts/check-integrity.mjs -P dev && node scripts/check-integrity.mjs -P prod
git add -A
git commit -m "chore: legacy storage layout retired; docs and memory record the new model"
```

Then open the PR from `feature/firebase-entity-restructuring` into `dev` (and on to `main` per the repo's branch flow). The PR body should link the design and this plan.
