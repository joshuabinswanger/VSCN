# The record is the work — step 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `images/{imageId}` the only home for a work's caption, description and link, and shrink the profile's `gallery` array to an ordered list of image ids — with no visible change to the site.

**Architecture:** One pure module (`src/lib/galleryRecords.ts`) joins an id list to image records and is shared by the browser editor and the Node build. The rules validate ids in the array (cheap, eight times) and text on the record (once). The build adds one query over live gallery records; the editor adds one query over the member's own. Migration is a dry-run-first admin script.

**Tech Stack:** Astro 6 (static build, `firebase-admin` at build time), Firebase client SDK 12 in the browser, Firestore security rules with the `@firebase/rules-unit-testing` emulator harness, `node --test` (Node ≥ 22.12, TypeScript imported by native type-stripping), Cloud Functions in TypeScript (`functions/`), admin scripts in `scripts/*.mjs`.

**Spec:** `documentation/20260907-works-on-the-record-design.md` — read it first; this plan implements its "Step 1" section only.

## Global Constraints

- Worktree: `D:\SynoDrive\VSCN\wt-feat-works-on-the-record`, branch `feat/works-on-the-record`. Run everything from there. Never `cd` into `D:\SynoDrive\VSCN\repo`.
- Never use bare `git stash`; the stash is shared with other sessions.
- Gallery cap stays `8` (`MAX_GALLERY_IMAGES`); link cap stays `200` (`MAX_GALLERY_LINK`); caption cap `140`; description cap `600`. Copy these numbers, do not invent new ones.
- The array element cap is `64` characters: a `crypto.randomUUID()` is 36, an unverified slot id `{uid}-gallery` is 28 + 8.
- House comment style: comments say WHY, and record the date and Josh's words when a decision was his. Existing comments that describe the array as a "projection" carrying text must be rewritten or removed by the task that touches them; do not leave a comment describing behaviour that no longer exists.
- Do not touch `src/components/CommunityGrid.astro` — another branch is editing it.
- Do not deploy rules, functions or hosting. Do not run any script with `--write`. Those are Josh's steps.
- Commit after every task with the message given; do not push.
- Test commands: `npm run test:unit`, `npm run test:rules` (starts the emulator itself; needs Java and takes ~40 s), `npx astro check`, `npm run build -- --mode development` (needs `.env.development`, present in the worktree), `cd functions && npm run build`.

---

### Task 1: Rules — ids in the array, link on the record

**Files:**
- Modify: `firestore.rules:235-320` (`validGallery`, `validGalleryItem`), `firestore.rules:366-397` (`validImage`)
- Test: `tests/rules/firestore.test.mjs:241-330` (the three `publicProfiles:` gallery tests) and the `images:` block

**Interfaces:**
- Produces: `validGallery(list)` accepts up to 8 strings of 1–64 chars and nothing else; `validImage` accepts an optional `link` string ≤ 200.

- [ ] **Step 1: Replace the three gallery-array tests with the new shape**

Delete the tests titled "publicProfiles: the array check is the key list, the bucket and the link", "publicProfiles: all text fields ride along in the array, uncapped there" and "publicProfiles: a gallery item may say where the image appeared". In their place:

```js
test("publicProfiles: the gallery is a list of image ids, and nothing else", async () => {
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  const save = (gallery) => db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery });

  await assertSucceeds(save([]));
  await assertSucceeds(save(["img-1"]));
  await assertSucceeds(save(["img-1", "img-2", "img-3", "img-4", "img-5", "img-6", "img-7", "img-8"]));
  await assertSucceeds(save([`${OWNER}-gallery`]));
  await assertSucceeds(save([crypto.randomUUID()]));

  // A ninth is refused: the cap is the list's own size.
  await assertFails(save(["1", "2", "3", "4", "5", "6", "7", "8", "9"]));
  // THE OLD SHAPE is refused outright (2026-09-07 — the record is the work,
  // documentation/20260907-works-on-the-record-design.md). A stale tab that
  // still writes objects fails safe rather than re-growing the array.
  const url = "https://firebasestorage.googleapis.com/v0/b/vscn-dev-f4b60.firebasestorage.app/o/x.webp?alt=media";
  await assertFails(save([{ imageId: "img-1", url, caption: "", width: 10, height: 10 }]));
  await assertFails(save([""]));
  await assertFails(save(["x".repeat(65)]));
  await assertFails(save([42]));
});

test("publicProfiles: eight ids save on a FULL profile", async () => {
  // The whole reason for the shape change: validGalleryItem could not be
  // afforded eight times on a realistic profile (see
  // documentation/20260903-gallery-rules-budget.md). Eight ids must fit next
  // to every other field the editor writes.
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({
    displayName: "x".repeat(100), photoURL: "", photoImageId: "img-a", photoColor: "#123456",
    memberType: "creator", role: "x".repeat(100),
    bio: Array.from({ length: 35 }, () => "word").join(" "),
    portfolio: "x".repeat(200), socialMedia: "x".repeat(500),
    affiliation: "x".repeat(150), location: "x".repeat(100),
    languages: ["de", "en", "fr", "it"], visualNeeds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    openTo: ["a", "b", "c", "d", "e"], primaryAudiences: [], tags: ["a", "b", "c", "d", "e", "f", "g"],
    gallery: Array.from({ length: 8 }, () => crypto.randomUUID()),
    active: true,
  }));
  await assertSucceeds(db.doc(`users/${OWNER}`).set({
    ...minimalUser(OWNER),
    displayName: "x".repeat(100), role: "x".repeat(100),
    bio: Array.from({ length: 35 }, () => "word").join(" "),
    portfolio: "x".repeat(200), socialMedia: "x".repeat(500),
    affiliation: "x".repeat(150), location: "x".repeat(100),
    languages: ["de", "en", "fr", "it"], visualNeeds: ["a", "b", "c", "d", "e", "f", "g", "h"],
    openTo: ["a", "b", "c", "d", "e"], tags: ["a", "b", "c", "d", "e", "f", "g"],
    gallery: Array.from({ length: 8 }, () => crypto.randomUUID()),
    phone: "x".repeat(40), wantsToContribute: true, onboardingComplete: true,
  }));
});

test("publicProfiles: another member's image id is accepted by rules — the READER drops it", async () => {
  // Rules cannot look up eight records per save. orderedGalleryItems() in
  // src/lib/galleryRecords.ts requires ownerUid == uid, so a foreign id is
  // never rendered. Written down here so nobody "fixes" the rule.
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc(`publicProfiles/${OWNER}`).set({ displayName: "Test Member", gallery: ["someone-elses-id"] }));
});

test("images: the record carries where the image appeared", async () => {
  await seed(env, "images/img-1", imageDoc(OWNER, "img-1", { status: "live" }));
  const db = env.authenticatedContext(OWNER, verified(OWNER)).firestore();
  await assertSucceeds(db.doc("images/img-1").update({ link: "onlinelibrary.wiley.com/doi/10.1111/gcb.70195", updatedAt: new Date() }));
  await assertSucceeds(db.doc("images/img-1").update({ link: "x".repeat(200), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ link: "x".repeat(201), updatedAt: new Date() }));
  await assertFails(db.doc("images/img-1").update({ link: 42, updatedAt: new Date() }));
});
```

Add `import { randomUUID } from "node:crypto";` is NOT needed — `crypto.randomUUID()` is a global in Node ≥ 19. Check that `minimalUser` is already imported at the top of the file (it is, line 4).

- [ ] **Step 2: Run the rules tests and watch the new ones fail**

Run: `npm run test:rules`
Expected: the four new tests FAIL (old-shape objects still pass `validGalleryItem`; `link` is not on `validImage`'s allowlist); every other test PASSES.

- [ ] **Step 3: Rewrite `validGallery`, delete `validGalleryItem`**

Replace everything from the comment `// Keep MAX_GALLERY_IMAGES in src/lib/gallery.ts in sync` down to the closing brace of `validGalleryItem` with:

```
// THE ARRAY IS THE ORDER, AND NOTHING ELSE (2026-09-07, Josh: "B looks
// cleaner, implement it" — documentation/20260907-works-on-the-record-design.md).
// Every word a member writes about a picture lives on images/{imageId}, where
// validImage judges it once per write. Until today this array carried a copy
// of that text and a per-item validator that ran eight times per save, which
// is how a realistic profile came to save ONE image out of eight —
// documentation/20260903-gallery-rules-budget.md. A list of short strings
// costs nothing to judge eight times.
//
// A foreign id (another member's image) passes here on purpose: rules cannot
// read eight records per save. The readers require ownerUid == uid and drop
// it — see orderedGalleryItems() in src/lib/galleryRecords.ts.
//
// Keep MAX_GALLERY_IMAGES in src/lib/gallery.ts in sync with the size cap
// (rules cannot loop over lists, hence the unrolled element checks).
function validGallery(value) {
  return value is list
    && value.size() <= 8
    && (value.size() < 1 || validGalleryId(value[0]))
    && (value.size() < 2 || validGalleryId(value[1]))
    && (value.size() < 3 || validGalleryId(value[2]))
    && (value.size() < 4 || validGalleryId(value[3]))
    && (value.size() < 5 || validGalleryId(value[4]))
    && (value.size() < 6 || validGalleryId(value[5]))
    && (value.size() < 7 || validGalleryId(value[6]))
    && (value.size() < 8 || validGalleryId(value[7]));
}

// A uuid is 36 characters; an unverified member's slot id `{uid}-gallery` is
// the uid (28) plus 8. 64 leaves room and still refuses a pasted URL.
function validGalleryId(id) {
  return id is string && id.size() > 0 && id.size() <= 64;
}
```

`validStorageUrl` was only ever called from `validGalleryItem`, so delete it too, together with the comment block directly above it (read the block first; it starts several lines above `function validStorageUrl` and explains the two bucket names). Confirm with `grep -n validStorageUrl firestore.rules` that no reference remains.

- [ ] **Step 4: Add `link` to `validImage`**

In `validImage`, add `'link'` to the `hasOnly` list after `'descriptionDe'`, and add this clause after the `descriptionDe` clause:

```
    // WHERE THE IMAGE APPEARED, moved here from the gallery array on
    // 2026-09-07. Same cap as `portfolio`, because it holds the same kind of
    // value: one URL stored without its scheme. Only LENGTH is judged;
    // whether it is linkable is the read path's question (workLink in
    // src/lib/links.ts) — a rule that rejected a typo would fail the save.
    && (!('link' in data) || (data.link is string && data.link.size() <= 200))
```

Update the "Keep in sync" comment above `validImage` to also name `src/lib/galleryRecords.ts`.

- [ ] **Step 5: Run the rules tests**

Run: `npm run test:rules`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/firestore.test.mjs
git commit -m "rules: the gallery array is a list of image ids; link lives on the record"
```

---

### Task 2: The pure join — `src/lib/galleryRecords.ts`

**Files:**
- Create: `src/lib/galleryRecords.ts`
- Test: `tests/unit/galleryRecords.test.mjs`
- Modify: `src/lib/firestore.ts:45` (`UserDoc.gallery` type)

**Interfaces:**
- Produces (used by Tasks 3, 5, 7):

```ts
export interface GalleryRecord {
  imageId: string;
  ownerUid: string;
  kind: string;
  status: string;
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  captionDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
}
export function storageUrl(bucket: string, storagePath: string): string;
export function galleryIds(items: readonly { imageId: string }[]): string[];
export function orderedGalleryItems(uid: string, stored: unknown, records: readonly GalleryRecord[], bucket: string): GalleryItem[];
```
  `GalleryItem` is the existing interface in `src/lib/gallery.ts` (imported `import type`, so no browser code is pulled into Node).

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/galleryRecords.test.mjs`:

```js
// The one join between a profile's id list and its image records, used by the
// browser editor and the Node build alike. Pure on purpose: it is the only
// place the rule "a work is on the site when its id is listed, its record is
// live and its owner matches" is written down, and both callers must agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryIds, orderedGalleryItems, storageUrl } from "../../src/lib/galleryRecords.ts";

const BUCKET = "vscn-dev-f4b60.firebasestorage.app";
const UID = "owner-uid-000001";

function record(imageId, overrides = {}) {
  return {
    imageId,
    ownerUid: UID,
    kind: "gallery",
    status: "live",
    storagePath: `users/${UID}/gallery/${imageId}.webp`,
    width: 1200,
    height: 800,
    color: "#aabbcc",
    ...overrides,
  };
}

test("storageUrl derives the tokenless download URL from the path", () => {
  assert.equal(
    storageUrl(BUCKET, `users/${UID}/gallery/a.webp`),
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/users%2F${UID}%2Fgallery%2Fa.webp?alt=media`,
  );
});

test("galleryIds is the items' ids in order", () => {
  assert.deepEqual(galleryIds([{ imageId: "b" }, { imageId: "a" }]), ["b", "a"]);
});

test("the id list decides the order; the record decides everything else", () => {
  const items = orderedGalleryItems(UID, ["b", "a"], [record("a", { caption: "A" }), record("b", { caption: "B", link: "x.org/1" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["b", "a"]);
  assert.equal(items[0].caption, "B");
  assert.equal(items[0].link, "x.org/1");
  assert.equal(items[0].url, storageUrl(BUCKET, `users/${UID}/gallery/b.webp`));
  assert.equal(items[0].width, 1200);
  assert.equal(items[0].color, "#aabbcc");
  assert.equal(items[1].link, undefined);
});

test("an id with no live record is dropped, not rendered broken", () => {
  const items = orderedGalleryItems(UID, ["gone", "a", "dead"], [record("a"), record("dead", { status: "pendingDeletion" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["a"]);
});

test("another member's record is dropped even when listed", () => {
  const items = orderedGalleryItems(UID, ["theirs"], [record("theirs", { ownerUid: "other-uid-000002" })], BUCKET);
  assert.deepEqual(items, []);
});

test("avatars and duplicates never become works", () => {
  const items = orderedGalleryItems(UID, ["a", "a", "av"], [record("a"), record("av", { kind: "avatar" })], BUCKET);
  assert.deepEqual(items.map((i) => i.imageId), ["a"]);
});

test("a record with no live text yields a blank caption and absent optionals", () => {
  const [item] = orderedGalleryItems(UID, ["a"], [record("a")], BUCKET);
  assert.equal(item.caption, "");
  assert.equal("captionDe" in item, false);
  assert.equal("description" in item, false);
  assert.equal("link" in item, false);
});

test("MIGRATION WINDOW: an old-shape element is read by its imageId, and its words fill a record that has none", () => {
  const old = { imageId: "a", url: "https://x/y", caption: "From the array", description: "Long", link: "arr.org", width: 1, height: 1 };
  const [item] = orderedGalleryItems(UID, [old], [record("a", { description: "On the record" })], BUCKET);
  assert.equal(item.imageId, "a");
  assert.equal(item.caption, "From the array");
  assert.equal(item.description, "On the record"); // the record wins when it has a value
  assert.equal(item.link, "arr.org");
  assert.equal(item.width, 1200); // geometry is always the record's
});

test("garbage in the list is ignored", () => {
  assert.deepEqual(orderedGalleryItems(UID, [null, 42, {}, ""], [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, "not a list", [record("a")], BUCKET), []);
  assert.deepEqual(orderedGalleryItems(UID, undefined, [record("a")], BUCKET), []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit`
Expected: FAIL — cannot find module `../../src/lib/galleryRecords.ts`.

- [ ] **Step 3: Write the module**

Create `src/lib/galleryRecords.ts`:

```ts
// THE JOIN BETWEEN A PROFILE'S ID LIST AND ITS IMAGE RECORDS.
//
// Since 2026-09-07 (Josh: "B looks cleaner, implement it" —
// documentation/20260907-works-on-the-record-design.md) the profile's
// `gallery` array is a list of image ids in display order and NOTHING else.
// Every word about a picture, its geometry and its colour live on
// images/{imageId}. This module turns the two into the GalleryItem shape the
// editor edits and the build renders from.
//
// PURE, AND KEPT THAT WAY. No firebase import, browser or admin: the build
// (firebase-admin, Node) and the editor (client SDK, browser) both call this,
// and the rule "a work is on the site when its id is listed, its record is
// live and its owner matches" must be written down exactly once. It is also
// what makes the rule unit-testable without an emulator.
import type { GalleryItem } from "./gallery.ts";

/** An images/{imageId} document with its id attached. Mirrors ImageDoc in functions/src/types.ts. */
export interface GalleryRecord {
  imageId: string;
  ownerUid: string;
  kind: string;
  status: string;
  storagePath: string;
  width: number;
  height: number;
  color?: string;
  caption?: string;
  captionDe?: string;
  description?: string;
  descriptionDe?: string;
  link?: string;
}

/**
 * The public download URL of a stored object — tokenless, which is what the
 * built pages have always rendered (see stripStorageToken in memberView.ts).
 * Objects under users/ are publicly readable, so no token is needed.
 */
export function storageUrl(bucket: string, storagePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(storagePath)}?alt=media`;
}

/** What every array write sends: the ids, in the order the member arranged them. */
export function galleryIds(items: readonly { imageId: string }[]): string[] {
  return items.map((item) => item.imageId).filter(Boolean);
}

/**
 * One stored element of the list. A string since 2026-09-07; an object with an
 * `imageId` before. THE OBJECT FORM IS TOLERATED FOR THE MIGRATION WINDOW ONLY:
 * a member who opens the new editor before scripts/migrate-gallery-to-ids.mjs
 * has run must keep their words, so the element's texts and link fill in
 * where the record has none, and the next array write stores ids. Remove the
 * object branch once both environments pass scripts/check-integrity.mjs.
 */
interface LegacyElement {
  imageId?: unknown;
  caption?: unknown;
  captionDe?: unknown;
  description?: unknown;
  descriptionDe?: unknown;
  link?: unknown;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function orderedGalleryItems(
  uid: string,
  stored: unknown,
  records: readonly GalleryRecord[],
  bucket: string,
): GalleryItem[] {
  if (!Array.isArray(stored)) return [];
  const byId = new Map<string, GalleryRecord>();
  for (const rec of records) {
    if (rec.ownerUid === uid && rec.kind === "gallery" && rec.status === "live") byId.set(rec.imageId, rec);
  }
  const seen = new Set<string>();
  const items: GalleryItem[] = [];
  for (const element of stored) {
    const legacy: LegacyElement | null =
      element && typeof element === "object" ? (element as LegacyElement) : null;
    const imageId = typeof element === "string" ? element : str(legacy?.imageId);
    if (!imageId || seen.has(imageId)) continue;
    const rec = byId.get(imageId);
    if (!rec || !(rec.width > 0) || !(rec.height > 0)) continue;
    seen.add(imageId);
    const item: GalleryItem = {
      imageId,
      url: storageUrl(bucket, rec.storagePath),
      caption: str(rec.caption) ?? str(legacy?.caption) ?? "",
      width: rec.width,
      height: rec.height,
    };
    if (rec.color) item.color = rec.color;
    const captionDe = str(rec.captionDe) ?? str(legacy?.captionDe);
    const description = str(rec.description) ?? str(legacy?.description);
    const descriptionDe = str(rec.descriptionDe) ?? str(legacy?.descriptionDe);
    const link = str(rec.link) ?? str(legacy?.link);
    if (captionDe) item.captionDe = captionDe;
    if (description) item.description = description;
    if (descriptionDe) item.descriptionDe = descriptionDe;
    if (link) item.link = link;
    items.push(item);
  }
  return items;
}
```

- [ ] **Step 4: Change the stored type**

In `src/lib/firestore.ts`, `UserDoc`:

```ts
  /**
   * Image ids in display order — and nothing else, since 2026-09-07. The
   * records behind them (images/{imageId}) hold every word and every pixel
   * dimension; see src/lib/galleryRecords.ts. Was GalleryItem[] before.
   */
  gallery: string[];
```

Remove the now-unused `import type { GalleryItem } from "./gallery.ts";` at the top of `firestore.ts` if nothing else in the file uses it (`grep -n GalleryItem src/lib/firestore.ts`).

- [ ] **Step 5: Run the unit tests**

Run: `npm run test:unit`
Expected: ALL PASS (the new file and the existing two).

Run: `npx astro check`
Expected: type errors in `ProfileForm.astro`, `OnboardingForm.astro`, `memberView.ts` and `gallery.ts` where `GalleryItem[]` is still written into `gallery`. That is the compiler listing Tasks 3–5 for you. No OTHER errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/galleryRecords.ts tests/unit/galleryRecords.test.mjs src/lib/firestore.ts
git commit -m "feat(gallery): one pure join from an id list and image records to gallery items"
```

---

### Task 3: Client persistence — load from records, save records hard

**Files:**
- Modify: `src/lib/images.ts:165-190` (`updateImageText`)
- Modify: `src/lib/gallery.ts:170-205` (`sanitizeGalleryItems` → `loadGallery`), `src/lib/gallery.ts:395-420` (`syncGalleryText` → `saveGalleryRecords`)

**Interfaces:**
- Consumes: `orderedGalleryItems`, `galleryIds`, `GalleryRecord` from Task 2.
- Produces (used by Task 4):

```ts
// src/lib/images.ts
export async function updateImageText(imageId: string, text: { caption: string; captionDe?: string; description?: string; descriptionDe?: string; link?: string }): Promise<void>;
// src/lib/gallery.ts
export async function loadGallery(uid: string, stored: unknown): Promise<GalleryItem[]>;
export interface GalleryRecordFailure { imageId: string; index: number; error: unknown }
export async function saveGalleryRecords(items: readonly GalleryItem[]): Promise<GalleryRecordFailure[]>;
export { galleryIds } from "./galleryRecords.ts";
```

- [ ] **Step 1: `updateImageText` carries the link**

In `src/lib/images.ts`, change the signature and body:

```ts
/**
 * Everything a member types about a picture: captions, descriptions and, since
 * 2026-09-07, the link — the record is the ONLY place any of it lives.
 */
export async function updateImageText(
  imageId: string,
  text: { caption: string; captionDe?: string; description?: string; descriptionDe?: string; link?: string },
): Promise<void> {
  await updateDoc(doc(db, "images", imageId), {
    caption: text.caption,
    // deleteField() rather than "": the rulesets allow the key to be absent,
    // and an empty string would make every consumer test for emptiness
    // instead of for presence.
    captionDe: text.captionDe ? text.captionDe : deleteField(),
    description: text.description ? text.description : deleteField(),
    descriptionDe: text.descriptionDe ? text.descriptionDe : deleteField(),
    link: text.link ? text.link : deleteField(),
    // (keep the existing descriptionShort sweep and its comment verbatim)
    descriptionShort: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
```

Replace the one-line doc comment above it ("Captions and descriptions live on the record; the gallery array is a projection.") with the block above.

- [ ] **Step 2: Replace `sanitizeGalleryItems` with `loadGallery`**

In `src/lib/gallery.ts`, delete `sanitizeGalleryItems` and its comment block (the `projectId` story) and write in its place:

```ts
/**
 * The member's gallery as the editor edits it: the profile's id list joined to
 * the member's own live records (2026-09-07 — the record is the work,
 * documentation/20260907-works-on-the-record-design.md). One query, then the
 * pure join in galleryRecords.ts. An id whose record is gone is dropped here
 * and leaves Firestore on the next array write.
 *
 * Replaces sanitizeGalleryItems(), which stripped withdrawn keys out of a
 * stored array of objects — there are no objects in the array to strip now.
 */
export async function loadGallery(uid: string, stored: unknown): Promise<GalleryItem[]> {
  const snap = await getDocs(
    query(
      collection(db, "images"),
      where("ownerUid", "==", uid),
      where("kind", "==", "gallery"),
      where("status", "==", "live"),
    ),
  );
  const records: GalleryRecord[] = snap.docs.map((d) => ({
    imageId: d.id,
    ...(d.data() as Omit<GalleryRecord, "imageId">),
  }));
  return orderedGalleryItems(uid, stored, records, storageBucket()).slice(0, MAX_GALLERY_IMAGES);
}
```

Add at the top of `gallery.ts`:

```ts
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, storage } from "./firebase.ts";
import { orderedGalleryItems, type GalleryRecord } from "./galleryRecords.ts";
export { galleryIds } from "./galleryRecords.ts";

/** The bucket the client SDK is configured for — the same one publicStorageUrl() in images.ts reads. */
function storageBucket(): string {
  return storage.app.options.storageBucket ?? "";
}
```

Check `src/lib/firebase.ts` exports `db` and `storage` (images.ts imports both from it, so it does).

- [ ] **Step 3: Replace `syncGalleryText` with `saveGalleryRecords`**

Delete `syncGalleryText` and its comment block. In its place:

```ts
export interface GalleryRecordFailure {
  imageId: string;
  /** Position in the gallery, 0-based — the editor says "image 2", not an id. */
  index: number;
  error: unknown;
}

/**
 * Writes every image's words onto its record and REPORTS what failed.
 *
 * Until 2026-09-07 this was syncGalleryText(): best-effort, a console.warn per
 * failure, because the array carried the same text and the page rendered from
 * the array. The array carries nothing now, so a refused record write is the
 * member's caption GONE — and Save must say so rather than print "Changes
 * saved". allSettled, not all: one bad record (swept between load and Save,
 * or not this caller's) must not stop the other seven from landing.
 */
export async function saveGalleryRecords(items: readonly GalleryItem[]): Promise<GalleryRecordFailure[]> {
  const results = await Promise.allSettled(
    items.map((item) =>
      updateImageText(item.imageId, {
        caption: item.caption,
        captionDe: item.captionDe,
        description: item.description,
        descriptionDe: item.descriptionDe,
        link: item.link,
      }),
    ),
  );
  const failures: GalleryRecordFailure[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push({ imageId: items[index].imageId, index, error: result.reason });
    }
  });
  return failures;
}
```

Also rewrite the doc comment on `GalleryItem.imageId` (line ~101) to: `/** The images/{imageId} record this item edits. Since 2026-09-07 the stored array holds only these ids; every other field here is read FROM the record — see galleryRecords.ts. */` and on `GalleryItem.link` drop the sentence about being dropped by the read path in `works()` — say instead "Lives on the record since 2026-09-07; capped by validImage at 200."

- [ ] **Step 4: Type-check**

Run: `npx astro check`
Expected: errors only in `ProfileForm.astro`, `OnboardingForm.astro` (they still import `sanitizeGalleryItems`/`syncGalleryText` and write `GalleryItem[]` into `gallery`) and `memberView.ts`. Nothing in `src/lib/gallery.ts` or `src/lib/images.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gallery.ts src/lib/images.ts
git commit -m "feat(gallery): load items from the records, save the records and report what failed"
```

---

### Task 4: The editor and the onboarding wizard write ids

**Files:**
- Modify: `src/components/ProfileForm.astro:1670-1680` (imports), `:2325-2345` (`persistGallery`), `:2770-2780` (load), `:2740-2850` (Save)
- Modify: `src/components/OnboardingForm.astro:815-825` (imports), `:1300-1306` (`persistGallery`), `:1624-1632` (restore)
- Modify: `src/i18n/translations.ts` (two new keys, both locales)
- Test: `tests/unit/authCopy.test.mjs` style — add `tests/unit/galleryCopy.test.mjs`

**Interfaces:**
- Consumes: `loadGallery`, `saveGalleryRecords`, `galleryIds`, `GalleryRecordFailure` from Task 3.

- [ ] **Step 1: Failing test for the new strings**

Create `tests/unit/galleryCopy.test.mjs`:

```js
// The Save error that names a picture whose words did not land. Both locales,
// and the {n} placeholder the editor substitutes — a missing placeholder would
// print "image ." to a member.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ui } from "../../src/i18n/translations.ts";

for (const lang of ["en", "de"]) {
  test(`${lang}: profile.gallery.saveFailed names the image`, () => {
    const s = ui[lang]["profile.gallery.saveFailed"];
    assert.equal(typeof s, "string");
    assert.ok(s.includes("{n}"), `${lang} string must carry {n}`);
  });
}
```

Run: `npm run test:unit` — expected FAIL on both locales (key undefined).

- [ ] **Step 2: Add the strings**

In `src/i18n/translations.ts`, next to `"profile.gallery.error"` in each locale:

```ts
    // en
    "profile.gallery.saveFailed": "The text for image {n} could not be saved. Nothing was saved — please try again.",
    // de
    "profile.gallery.saveFailed": "Der Text zu Bild {n} konnte nicht gespeichert werden. Es wurde nichts gespeichert – bitte erneut versuchen.",
```

Run: `npm run test:unit` — expected PASS.

- [ ] **Step 3: ProfileForm imports**

Replace `syncGalleryText,` and `sanitizeGalleryItems,` in the `../lib/gallery.ts` import (lines ~1676-1677) with `saveGalleryRecords,`, `loadGallery,`, `galleryIds,`.

- [ ] **Step 4: ProfileForm load**

Replace the block at ~2773-2778 (the `sanitizeGalleryItems` comment and call) with:

```ts
      // The id list joined to this member's own live records — one query, then
      // the pure join in galleryRecords.ts. Since 2026-09-07 the stored array
      // is ids only; the words come from the records. (Until today this was
      // sanitizeGalleryItems(), stripping withdrawn keys out of stored objects;
      // there are no objects in the array to strip now.)
      gallery = await loadGallery(user.uid, data.gallery);
```

- [ ] **Step 5: ProfileForm array writes**

In `persistGallery` (~line 2337) change `gallery,` to `gallery: galleryIds(gallery),`. Rewrite its doc comment's last paragraph ("Typed text (captions, descriptions) is NOT pushed by itself…") to:

```
     * Only the ids go: since 2026-09-07 the array is the order and nothing
     * else. Typed text belongs to Save, which writes it onto the records.
```

- [ ] **Step 6: ProfileForm Save**

In the Save handler, the `gallery,` line inside the `handleProfileUpdate` payload (~line 2828, under the comment "The gallery persists on its own…") becomes `gallery: galleryIds(gallery),` and its comment becomes:

```ts
            // The ids, in order. The words typed for each image are written
            // onto the records ABOVE, before this call — see saveGalleryRecords.
```

Immediately BEFORE the `await handleProfileUpdate(` call (find its opening — the payload starts with `displayName:`), insert:

```ts
        // THE RECORDS FIRST, AND HARD (2026-09-07). Until today this ran after
        // the profile write as best-effort — a failed record write was a
        // console.warn under a green "Changes saved", tolerable only because
        // the array carried the same text. The array carries nothing now: a
        // refused record write is a caption gone. So it runs first, and a
        // failure is THE Save error, naming the image by its position.
        const recordFailures = await saveGalleryRecords(gallery);
        if (recordFailures.length > 0) {
          recordFailures.forEach((f) => console.warn(`[gallery] record ${f.imageId} not saved:`, f.error));
          throw new Error(
            recordFailures
              .map((f) => s["profile.gallery.saveFailed"].replace("{n}", String(f.index + 1)))
              .join(" "),
          );
        }
```

Delete the two lines after `handleProfileUpdate` that read:

```ts
        // The array carries the text for the static build; the records carry
        // it for everything else. Best-effort by design — see syncGalleryText.
        await syncGalleryText(gallery);
```

The existing `catch (err: unknown)` already shows `err.message` in `saveError`, so the thrown message reaches the member unchanged.

- [ ] **Step 7: OnboardingForm**

Add `galleryIds,` to its `../lib/gallery.ts` import. In its `persistGallery` (~line 1304) change `{ gallery, updatedAt: new Date() }` to `{ gallery: galleryIds(gallery), updatedAt: new Date() }`.

For the restore at ~1628, the wizard has the uploaded items in memory during the session and only needs them back after a language switch. Replace:

```ts
        gallery = Array.isArray(data.gallery)
          ? data.gallery.filter(Boolean).slice(0, MAX_GALLERY_IMAGES)
          : [];
```

with:

```ts
        // Ids only in the stored array since 2026-09-07 — the thumbnails come
        // from the records, one query, same join the editor uses.
        gallery = await loadGallery(user.uid, data.gallery);
```

and add `loadGallery,` to the import. Check the enclosing function is `async` (it awaits `getUser` a few lines above, so it is).

- [ ] **Step 8: Type-check and build**

Run: `npx astro check`
Expected: errors ONLY in `src/lib/memberView.ts` (Task 5). If `ProfileForm.astro` or `OnboardingForm.astro` still error, fix them here.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProfileForm.astro src/components/OnboardingForm.astro src/i18n/translations.ts tests/unit/galleryCopy.test.mjs
git commit -m "feat(profile): the editor writes image ids and saves the records first, loudly"
```

---

### Task 5: The build joins records to members

**Files:**
- Modify: `src/lib/memberView.ts:1-12` (imports), `:158-181` (`works`), `:184-204` (`toMemberViewBase`)
- Modify: `src/lib/membersBuild.ts:25-60` (`fetchDirectory`)
- Test: `tests/unit/memberView.test.mjs` (new)

**Interfaces:**
- Consumes: `orderedGalleryItems`, `GalleryRecord` from Task 2.
- Produces:

```ts
export function toMemberViewBase(uid: string, doc: PublicProfileDoc, records: readonly GalleryRecord[] = [], bucket = ""): MemberViewBase;
```
  (defaulted so `scripts/migrate-image-records.mjs`, a historical one-time script that imports it, still type-checks; it yields no works, which is fine for what it does.)

- [ ] **Step 1: Failing unit test**

Create `tests/unit/memberView.test.mjs`:

```js
// The build's producer of a member's works, fed by records rather than by an
// array of objects since 2026-09-07. What matters here is the mapping onto
// ProfileWork: url derived from the record, texts raw (both locales), link
// filtered for linkability by workLink().
import { test } from "node:test";
import assert from "node:assert/strict";
import { toMemberViewBase } from "../../src/lib/memberView.ts";

const UID = "owner-uid-000001";
const BUCKET = "vscn-dev-f4b60.firebasestorage.app";
const rec = (imageId, extra = {}) => ({
  imageId, ownerUid: UID, kind: "gallery", status: "live",
  storagePath: `users/${UID}/gallery/${imageId}.webp`, width: 1200, height: 800, ...extra,
});

test("works come from the records, in the list's order", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["b", "a"] }, [
    rec("a", { caption: "A", description: "Long A", descriptionDe: "Lang A", link: "nature.com/x" }),
    rec("b", { color: "#112233" }),
  ], BUCKET);
  assert.equal(m.works.length, 2);
  assert.equal(m.works[0].url, `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/users%2F${UID}%2Fgallery%2Fb.webp?alt=media`);
  assert.equal(m.works[0].color, "#112233");
  assert.equal(m.works[1].caption, "A");
  assert.equal(m.works[1].descriptionDe, "Lang A");
  assert.equal(m.works[1].link, "https://nature.com/x");
});

test("a member with ids but no live records has no artwork", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada", gallery: ["a"] }, [], BUCKET);
  assert.deepEqual(m.works, []);
});

test("records without a bucket or list still type-check as no works", () => {
  const m = toMemberViewBase(UID, { displayName: "Ada" });
  assert.deepEqual(m.works, []);
});
```

Run: `npm run test:unit` — expected FAIL (`works` still reads `doc.gallery` objects; `toMemberViewBase` takes two arguments).

- [ ] **Step 2: Rewrite `works` and `toMemberViewBase`**

In `src/lib/memberView.ts` add the import `import { orderedGalleryItems, type GalleryRecord } from "./galleryRecords.ts";` and replace `works()`:

```ts
/**
 * The member's works, from their image RECORDS (2026-09-07 — the record is the
 * work, documentation/20260907-works-on-the-record-design.md). The stored
 * array is the order; orderedGalleryItems() joins it to the records, requires
 * the owner to match and the record to be live, and derives the URL from the
 * storage path — tokenless, as stripStorageToken() always made it. This
 * function only maps that onto ProfileWork.
 */
function works(uid: string, doc: PublicProfileDoc, records: readonly GalleryRecord[], bucket: string): ProfileWork[] {
  return orderedGalleryItems(uid, doc.gallery, records, bucket).map((g) => ({
    url: g.url,
    width: g.width,
    height: g.height,
    caption: g.caption,
    // Raw, unresolved — workCaption() / workDescription() in links.ts pick a
    // locale once each page's lang is known; this base is built once and
    // shared by the English and German pages.
    captionDe: g.captionDe,
    color: g.color,
    description: g.description,
    descriptionDe: g.descriptionDe,
    link: workLink(g.link),
  }));
}
```

Change the signature `export function toMemberViewBase(uid: string, doc: PublicProfileDoc): MemberViewBase` to `export function toMemberViewBase(uid: string, doc: PublicProfileDoc, records: readonly GalleryRecord[] = [], bucket = ""): MemberViewBase` and its `works: works(doc),` to `works: works(uid, doc, records, bucket),`.

Rewrite the comment above `works()` that starts "Gallery items that are safe to lay out" — it is replaced by the block above. Keep `stripStorageToken` (avatars still use it).

- [ ] **Step 3: The build fetches the records**

In `src/lib/membersBuild.ts`:

Add `import type { GalleryRecord } from "./galleryRecords.ts";`.

Replace the `Promise.all` and the `members` construction:

```ts
    const serviceAccount = JSON.parse(serviceAccountJson) as { project_id: string };
    const app =
      getApps().length === 0
        ? initializeApp({ credential: cert(serviceAccount) })
        : getApps()[0];
    const db = getFirestore(app);
    // The default bucket's name, the same derivation scripts/lib/admin-app.mjs
    // uses. Work URLs are derived from records' storagePath against it.
    const bucket = `${serviceAccount.project_id}.firebasestorage.app`;

    // THE RECORDS, since 2026-09-07 (documentation/20260907-works-on-the-record-
    // design.md): the profile's gallery is a list of ids, and every word about
    // a work lives on images/{imageId}. One query for the whole site, grouped by
    // owner below. Two equality filters ride Firestore's single-field index
    // merge — no composite index to deploy. Inside this try on purpose: a
    // failure here is a failure to build the directory, not a site quietly
    // rendered without artwork.
    const [profiles, slugRows, imageRows] = await Promise.all([
      db.collection("publicProfiles").orderBy("displayName").get(),
      db.collection("slugs").get(),
      db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    ]);
    const recordsByOwner = new Map<string, GalleryRecord[]>();
    for (const d of imageRows.docs) {
      const rec = { imageId: d.id, ...(d.data() as Omit<GalleryRecord, "imageId">) };
      const list = recordsByOwner.get(rec.ownerUid) ?? [];
      list.push(rec);
      recordsByOwner.set(rec.ownerUid, list);
    }
```

(keep the existing slugs loop) and change the `map` to:

```ts
        .map((d) => toMemberViewBase(d.id, d.data() as PublicProfileDoc, recordsByOwner.get(d.id) ?? [], bucket)),
```

Note `cert(JSON.parse(serviceAccountJson))` becomes `cert(serviceAccount)`; the shape `cert` wants is the same object.

- [ ] **Step 4: Tests, types, build**

Run: `npm run test:unit` — expected ALL PASS.
Run: `npx astro check` — expected NO errors.
Run: `npm run build -- --mode development` — expected a successful build. Then confirm the community page has works: `grep -c 'data-slot="work"' dist/community/index.html` must be > 0 (dev has sixteen seeded galleries whose arrays are still old-shape objects; the tolerant join handles them — if the count is 0, the join or the query is wrong, not the data).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memberView.ts src/lib/membersBuild.ts tests/unit/memberView.test.mjs
git commit -m "feat(build): members' works come from their image records, ordered by the id list"
```

---

### Task 6: Cloud Functions read ids

**Files:**
- Modify: `functions/src/types.ts:8-26` (`ImageDoc`)
- Modify: `functions/src/util.ts` (new helper), `functions/src/adminOps.ts:160-172`, `:252`, `:296-303`, `:426-428`

**Interfaces:**
- Produces: `galleryImageIds(data: Record<string, unknown> | undefined): string[]` in `functions/src/util.ts`.

- [ ] **Step 1: The helper**

Append to `functions/src/util.ts`:

```ts
/**
 * The image ids a profile's gallery lists. Strings since 2026-09-07 (the record
 * is the work — documentation/20260907-works-on-the-record-design.md); objects
 * with an imageId before. Both shapes are read until every environment has run
 * scripts/migrate-gallery-to-ids.mjs — then the object branch goes.
 */
export function galleryImageIds(data: Record<string, unknown> | undefined): string[] {
  const gallery = Array.isArray(data?.gallery) ? data.gallery : [];
  const ids: string[] = [];
  for (const element of gallery) {
    const id =
      typeof element === "string"
        ? element
        : (element as { imageId?: unknown } | null)?.imageId;
    if (typeof id === "string" && id) ids.push(id);
  }
  return ids;
}
```

Check how `util.ts` is imported in `adminOps.ts` (`grep -n "from \"./util" functions/src/adminOps.ts`) and add `galleryImageIds` to that import.

- [ ] **Step 2: Use it in `adminOps.ts`**

`memberGraph` (~line 166-171): replace the `for (const item of Array.isArray(data.gallery) ? data.gallery : [])` loop with `for (const id of galleryImageIds(data)) referenced.add(id);`.

`listMembers` row (~line 252, 266): `const gallery = Array.isArray(pub?.gallery) ? pub.gallery : [];` becomes `const galleryCount = galleryImageIds(pub).length;` and `galleryCount: gallery.length,` becomes `galleryCount,`.

Orphan report (~line 298-302): replace the inner `const gallery = …; for (const item of gallery) {…}` with `for (const id of galleryImageIds(data)) referenced.add(id);`.

`adminDeleteImage` (~line 426-428): replace

```ts
    const gallery = Array.isArray(data.gallery) ? data.gallery : [];
    const kept = gallery.filter((item) => (item as { imageId?: unknown } | null)?.imageId !== imageId);
    if (kept.length !== gallery.length) update.gallery = kept;
```

with

```ts
    // Written back as ids whatever shape was stored: the Admin SDK is not
    // bound by validGallery, and ids are the shape every reader wants.
    const ids = galleryImageIds(data);
    const kept = ids.filter((id) => id !== imageId);
    if (kept.length !== ids.length) update.gallery = kept;
```

- [ ] **Step 3: `ImageDoc.link`**

In `functions/src/types.ts` add after `descriptionShort?: string;`:

```ts
  /** Where the image appeared, scheme-less (2026-09-07: moved here from the gallery array). ≤ 200. */
  link?: string;
```

Update the "Keep in sync" comment above `ImageDoc` to also name `src/lib/galleryRecords.ts`.

- [ ] **Step 4: Compile**

Run: `cd functions && npm run build && cd ..`
Expected: `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/src/util.ts functions/src/adminOps.ts functions/src/types.ts
git commit -m "functions: admin ops read the gallery as a list of image ids"
```

---

### Task 7: Scripts — integrity, seeders, and the migration

**Files:**
- Create: `scripts/migrate-gallery-to-ids.mjs`
- Modify: `scripts/check-integrity.mjs:47-113`, `:160-165`
- Modify: `scripts/seed-curated-galleries.mjs:134-175`
- Modify: `scripts/seed-image-descriptions.mjs:262-335`

All scripts take `-P dev|prod` (mandatory) and default to a dry run. You may run dry runs against dev from the worktree (`.env.development` is present). Never pass `--write`.

- [ ] **Step 1: The migration script**

Create `scripts/migrate-gallery-to-ids.mjs`:

```js
// ONE-TIME: the gallery array becomes a list of image ids (2026-09-07, Josh:
// "B looks cleaner, implement it" — documentation/20260907-works-on-the-record-
// design.md). Every word an array item carried moves onto its record; the
// record then holds everything and the array holds only the order.
//
//   node scripts/migrate-gallery-to-ids.mjs -P dev            # dry run
//   node scripts/migrate-gallery-to-ids.mjs -P dev --write
//
// Idempotent: string elements are left alone, so a partial run re-runs.
// Snapshots users + publicProfiles to scripts/snapshots/ before writing.
//
// WHEN THE ARRAY AND THE RECORD DISAGREE, THE ARRAY WINS. It is what the site
// displayed until today; the record sync was best-effort (see the old
// syncGalleryText in git history) and a failed record write left the array as
// the only true copy. `link` never lived on the record at all.
//
// An element whose record is missing or not live is DROPPED from the list and
// reported: the reader would drop it anyway, and an id nothing can render is
// not worth carrying. Nothing is deleted from images/.
import fs from "node:fs";
import { resolve } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { initAdminApp, parseArgs, ROOT } from "./lib/admin-app.mjs";

const { project, flags } = parseArgs();
const write = flags.has("--write");
const { db, projectId, close } = initAdminApp(project);

const TEXT_FIELDS = ["caption", "captionDe", "description", "descriptionDe", "link"];

function snapshot(name, docs) {
  const dir = resolve(ROOT, "scripts/snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${projectId}-${name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d.data()])), null, 2));
  console.log(`snapshot ${file}`);
}

/** The record patch an old-shape element implies: array text over record text, blanks removed. */
function recordPatch(item, rec) {
  const patch = {};
  for (const field of TEXT_FIELDS) {
    const onItem = typeof item[field] === "string" ? item[field].trim() : "";
    const onRecord = typeof rec[field] === "string" ? rec[field].trim() : "";
    if (onItem && onItem !== onRecord) patch[field] = onItem;
  }
  if ("descriptionShort" in rec) patch.descriptionShort = FieldValue.delete();
  return patch;
}

async function migrateCollection(name, images) {
  const snap = await db.collection(name).get();
  snapshot(name, snap.docs);
  let docsChanged = 0;
  for (const doc of snap.docs) {
    const gallery = doc.data().gallery;
    if (!Array.isArray(gallery) || gallery.every((e) => typeof e === "string")) continue;
    const ids = [];
    const patches = new Map();
    for (const element of gallery) {
      const imageId = typeof element === "string" ? element : element?.imageId;
      if (typeof imageId !== "string" || !imageId) {
        console.log(`  ! ${name}/${doc.id}: element without imageId dropped: ${JSON.stringify(element).slice(0, 80)}`);
        continue;
      }
      const rec = images.get(imageId);
      if (!rec) { console.log(`  ! ${name}/${doc.id}: images/${imageId} missing — dropped from the list`); continue; }
      if (rec.ownerUid !== doc.id) { console.log(`  ! ${name}/${doc.id}: images/${imageId} belongs to ${rec.ownerUid} — dropped`); continue; }
      if (rec.status !== "live") { console.log(`  ! ${name}/${doc.id}: images/${imageId} is ${rec.status} — dropped`); continue; }
      if (ids.includes(imageId)) continue;
      ids.push(imageId);
      if (typeof element === "object") {
        const patch = recordPatch(element, rec);
        if (Object.keys(patch).length) patches.set(imageId, patch);
      }
    }
    docsChanged++;
    console.log(`${write ? "MIGRATE" : "would  "}  ${name}/${doc.id}  ${gallery.length} item(s) → ${ids.length} id(s), ${patches.size} record(s) patched`);
    for (const [imageId, patch] of patches) {
      console.log(`           images/${imageId} ← ${Object.keys(patch).join(", ")}`);
    }
    if (!write) continue;
    // Records first: if this dies between the two writes the words are safe on
    // the record and the array still renders through the tolerant reader.
    for (const [imageId, patch] of patches) {
      await db.doc(`images/${imageId}`).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      // The same record can be listed by both collections; patch it once.
      images.set(imageId, { ...images.get(imageId), ...patch });
    }
    await doc.ref.update({ gallery: ids, updatedAt: FieldValue.serverTimestamp() });
  }
  return docsChanged;
}

try {
  console.log(`Gallery → ids — ${projectId}${write ? "" : " (dry run)"}\n`);
  const imageDocs = await db.collection("images").get();
  const images = new Map(imageDocs.docs.map((d) => [d.id, d.data()]));
  const pubs = await migrateCollection("publicProfiles", images);
  const users = await migrateCollection("users", images);
  console.log(`\n${pubs} publicProfiles and ${users} users doc(s) ${write ? "migrated" : "to migrate"}.`);
  if (!write) console.log("Nothing written. Re-run with --write.");
} finally {
  await close();
}
```

Run the dry run: `node scripts/migrate-gallery-to-ids.mjs -P dev`
Expected: it lists the sixteen seeded members (and any of Josh's) as "would" lines, every patch names `caption`/`description` fields, no `!` lines except genuine orphans. Paste the output into the task report.

- [ ] **Step 2: `check-integrity.mjs` speaks ids**

Replace the first two check sections ("Gallery arrays ↔ image records" and "Gallery arrays — users ↔ publicProfiles") — everything from `console.log("Gallery arrays ↔ image records");` to the end of the `pubGallery.forEach` block — with:

```js
  // THE ARRAY IS A LIST OF IDS since 2026-09-07 (documentation/20260907-works-
  // on-the-record-design.md). There is no text on it to compare any more; what
  // can go wrong is an id pointing nowhere, at someone else's record, or at a
  // record that is not live — and an element that is still an object, which
  // means scripts/migrate-gallery-to-ids.mjs has not run here.
  console.log("Gallery ids ↔ image records");
  const idsOf = (data) =>
    (Array.isArray(data.gallery) ? data.gallery : []).map((e) => (typeof e === "string" ? e : e?.imageId));
  for (const doc of pubs.docs) {
    const data = doc.data();
    if (!userIds.has(doc.id)) note(`publicProfiles/${doc.id} has no users doc (profile-only identity)`);
    if (inGrace.has(doc.id)) note(`publicProfiles/${doc.id} is in a deletion grace period`);
    const gallery = Array.isArray(data.gallery) ? data.gallery : [];
    gallery.forEach((element, i) => {
      if (typeof element !== "string") {
        problem(`publicProfiles/${doc.id}.gallery[${i}] is not an id — not migrated (run migrate-gallery-to-ids.mjs)`);
      }
      const id = typeof element === "string" ? element : element?.imageId;
      if (!id) return problem(`publicProfiles/${doc.id}.gallery[${i}] has no imageId`);
      const rec = imageById.get(id);
      if (!rec) return problem(`publicProfiles/${doc.id}.gallery[${i}] → images/${id} missing`);
      if (rec.ownerUid !== doc.id) problem(`images/${id} owned by ${rec.ownerUid}, listed on ${doc.id}`);
      if (rec.kind !== "gallery") problem(`images/${id} is an ${rec.kind}, listed as a work on ${doc.id}`);
      if (rec.status !== "live" && !inGrace.has(doc.id)) {
        problem(`images/${id} is ${rec.status} but listed on publicProfiles/${doc.id}`);
      }
    });
  }

  // THE PRIVATE COPY HAS TO MATCH THE PUBLIC ONE: a Save republishes
  // publicProfiles FROM users (toPublicProfile), so anything written to the
  // public list alone is reverted the next time the member touches anything.
  console.log("Gallery ids — users ↔ publicProfiles");
  const usersById = new Map(users.docs.map((d) => [d.id, d.data()]));
  for (const doc of pubs.docs) {
    const priv = usersById.get(doc.id);
    if (!priv) continue; // profile-only identity; already noted above
    const pubIds = idsOf(doc.data());
    const privIds = idsOf(priv);
    if (pubIds.join("\n") !== privIds.join("\n")) {
      problem(`${doc.id} gallery differs: users [${privIds.join(", ")}], publicProfiles [${pubIds.join(", ")}]`);
    }
  }
```

In the "Unreferenced live records" section replace

```js
      for (const item of Array.isArray(data.gallery) ? data.gallery : []) {
        if (item?.imageId) referenced.add(item.imageId);
      }
```

with `for (const id of idsOf(data)) if (id) referenced.add(id);`.

Update the header comment's "Checks:" sentence: "every gallery id → a live gallery record owned by that profile; the private and public id lists equal;" replacing the text-agreement sentence.

Run: `node scripts/check-integrity.mjs -P dev`
Expected: every seeded member reports "not an id — not migrated" problems (the data is still old-shape), and nothing else new. Exit code 1 is expected until Josh runs the migration.

- [ ] **Step 3: `seed-curated-galleries.mjs` writes ids**

In the loop (~line 168-175) replace

```js
      gallery.push({
        imageId,
        url: publicStorageUrl(storagePath),
        caption: "",
        width: img.width,
        height: img.height,
        color,
      });
```

with

```js
      // Ids only (2026-09-07): geometry, colour and text live on the record
      // written above. See documentation/20260907-works-on-the-record-design.md.
      gallery.push(imageId);
```

Update the header comment's line 13 ("The gallery is written to BOTH…") to say the id LIST is written to both. If `publicStorageUrl` is now unused in this script (`grep -n publicStorageUrl scripts/seed-curated-galleries.mjs`), delete the helper. Also update the skip check at ~line 126 if it inspects item fields (it checks `existing.length`, which still works).

- [ ] **Step 4: `seed-image-descriptions.mjs` writes records only**

Replace the per-member loop body from `let touched = 0;` through the `if (doWrite) { … }` block with:

```js
    let touched = 0;
    const patches = []; // [imageId, fields]
    for (let i = 0; i < gallery.length; i++) {
      const imageId = typeof gallery[i] === "string" ? gallery[i] : gallery[i]?.imageId;
      if (!imageId) continue;
      // The RECORD is the only copy since 2026-09-07 (the array is ids) — so
      // the seed reads it, judges ownership of the text on it, and writes it.
      const snap = await db.doc(`images/${imageId}`).get();
      const rec = snap.exists ? snap.data() : null;
      if (!rec || !isOurs(rec)) {
        skippedImages++;
        continue;
      }
      const wanted = doClear ? { caption: "", description: "" } : textFor(imageId, i, await langFor(imageId));
      const key = (o) => `${o.caption ?? ""}|${o.description ?? ""}|${o.descriptionShort ?? ""}`;
      const next = { caption: wanted.caption || undefined, description: wanted.description || undefined };
      if (key(next) !== key(rec)) {
        touched++;
        patches.push([imageId, {
          // DELETED when empty: absent is what a seeded record looks like.
          caption: next.caption ?? FieldValue.delete(),
          description: next.description ?? FieldValue.delete(),
          descriptionShort: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }]);
      }
    }

    if (touched === 0) {
      console.log(`skip     ${name} — nothing to change`);
      continue;
    }

    if (doWrite) {
      for (const [imageId, fields] of patches) {
        await db.doc(`images/${imageId}`).set(fields, { merge: true });
      }
    }
```

Read `isOurs` (line ~245) first: it inspects `caption`/`description` strings on whatever object it is handed, so passing the record works; if it reads a field the record does not have, adapt it and say so in the commit. Update the header comment at ~line 60 ("It writes to the SAME THREE PLACES…") to say it writes the record only. Run the dry run: `node scripts/seed-image-descriptions.mjs -P dev` — expected "skip … nothing to change" or "would" lines, no crash.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-gallery-to-ids.mjs scripts/check-integrity.mjs scripts/seed-curated-galleries.mjs scripts/seed-image-descriptions.mjs
git commit -m "scripts: migrate the gallery array to ids; integrity and seeders follow"
```

---

### Task 8: Close the loop — docs and full verification

**Files:**
- Modify: `documentation/20260903-gallery-rules-budget.md` (append a closing note)
- Modify: `firestore.rules` comment above `validImage` if Task 1 left any mention of "projection"
- Modify: `src/lib/gallery.ts`, `src/lib/images.ts`, `src/components/ProfileForm.astro` — a final grep for stale comments

- [ ] **Step 1: Stale-comment sweep**

Run: `grep -rn "projection\|syncGalleryText\|sanitizeGalleryItems\|validGalleryItem\|validStorageUrl\|carries the text\|carries the same text" src functions/src firestore.rules storage.rules scripts --include=*.ts --include=*.astro --include=*.mjs --include=*.rules`
Expected: every hit is either in git history references inside a comment that explains the change, or in `scripts/migrate-image-records.mjs` (historical, leave it). Any hit describing the array as carrying text TODAY gets rewritten.

- [ ] **Step 2: Close the budget note**

Append to `documentation/20260903-gallery-rules-budget.md`:

```markdown
## Closed — 2026-09-07

The "real fix" above shipped as `feat/works-on-the-record`: the array is a list of image
ids and `validGallery` checks eight short strings; every word lives on `images/{imageId}`
and is judged once by `validImage`. Design and release order in
`documentation/20260907-works-on-the-record-design.md`.
```

- [ ] **Step 3: Everything green**

Run, in order, and paste each result into the task report:

```bash
npm run test:unit
npm run test:rules
npx astro check
npm run build -- --mode development
cd functions && npm run build && cd ..
grep -c 'data-slot="work"' dist/community/index.html
grep -c 'data-slot="work"' dist/de/community/index.html
```

Expected: all pass; both grep counts > 0 and equal to each other.

- [ ] **Step 4: Commit**

```bash
git add documentation/20260903-gallery-rules-budget.md
git commit -m "docs: the gallery rules budget note is closed by the id-list array"
```

(add any files the sweep in Step 1 changed to the same commit.)

---

## What is deliberately NOT in this plan

- Deploying rules, functions or hosting; running any script with `--write` — Josh does these, in the order the spec's "Release order" gives.
- Removing the old-shape tolerance in `orderedGalleryItems` and `galleryImageIds` — a follow-up commit after both environments pass `check-integrity.mjs`.
- Step 2 of the spec (image tags) — its own plan, after `fix/community-tag-dropdown-artwork-counts` has merged.
- Browser verification of the editor round trip — needs a signed-in dev member; Josh does this after the dev rules deploy, per the spec's Verification section.
