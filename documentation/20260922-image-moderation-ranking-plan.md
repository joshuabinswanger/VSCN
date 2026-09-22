# Image moderation and ranking — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give every gallery image a 0–100 priority score from admin ratings plus a
computed completeness reading, and order the two /community views by it.

**Architecture:** Ratings live in a new admin-only `imageModeration/{imageId}`
collection written exclusively by callables — never on `images/{id}`, which is
member-writable behind a `hasOnly` allowlist. One pure scoring module is mirrored
byte-for-byte into `functions/src/` because the functions tsconfig has
`rootDir: "src"` and cannot reach `../src/lib`. The score reaches the static site
through `.site-data.json` and is consumed only in the /community components, so
member profile pages keep the member's own order.

**Tech Stack:** Astro 7, Firebase (Firestore, Functions v2, Auth), TypeScript,
`node --test` for unit tests, Firebase emulator for rules and callable tests.

**Spec:** `documentation/20260922-image-moderation-ranking-design.md` — read it first.

## Global Constraints

- Branch: `feat/image-moderation-ranking`, worktree `wt-feat-image-moderation-ranking`. Cut from `origin/dev`.
- **`validImage()` in `firestore.rules` must not be modified.** A rules test proves a member can still save an image record.
- Criterion scale is integer **0–5**. Score is integer **0–100**.
- Weights, verbatim: `professional 0.35, knowledge 0.25, aesthetics 0.25, completeness 0.15`.
- Neutral value for an unrated human criterion: **2.5**.
- `completeness: null` in a stored rating means *auto* — resolve it to the current computed value at score time. Never snapshot it.
- Every privileged write is audited into `adminActions` and marks `rebuildQueue/site` dirty.
- Members are never shown a score. `imageModeration` is admin-read, nobody-write.
- Run `npm run verify` before the final commit of each task that touches `src/` or `functions/`.
- Commit messages follow the repo's style: lowercase `type(scope): sentence`, and end with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/imageScore.ts` | **Canonical** pure scoring + completeness. No Firebase import. |
| `functions/src/imageScore.ts` | Byte-identical mirror, because functions cannot import `../src`. |
| `functions/src/moderation.ts` | The three callables. |
| `functions/src/index.ts` | Export them. |
| `functions/src/adminOps.ts` | One word: `audit` becomes exported. |
| `firestore.rules` | The `imageModeration` block. Nothing else. |
| `scripts/export-site-data.mjs` | Read `imageModeration`, emit `moderation[]` into the snapshot. |
| `src/lib/membersBuild.ts` | Carry `moderation[]` through `SiteSnapshot` onto the records. |
| `src/lib/memberView.ts` | `score` and `hidden` on each `ProfileWork`. |
| `src/pages/[...lang]/community.astro` | Drop hidden works, including from JSON-LD. |
| `src/components/CommunityGrid.astro` | Order the wall's tiles, the carousels and the member deal. |
| `src/lib/adminApi.ts` | Three client wrappers + their types. |
| `src/lib/admin/rating.ts` | The Moderation panel's logic. |
| `src/components/admin/AdminConsole.astro` | The Moderation view's markup and styles. |

**Dependency waves** — tasks inside a wave are independent and may run in parallel:

- Wave A: Task 1, Task 2
- Wave B: Task 3, Task 4 (both need Task 1)
- Wave C: Task 5 (needs 4), Task 6 (needs 1 and 3)
- Wave D: Task 7 (verify, PR, merge to dev)

---

## Task 1: The scoring module

**Files:**
- Create: `src/lib/imageScore.ts`
- Create: `functions/src/imageScore.ts` (byte-identical to the above)
- Test: `tests/unit/imageScore.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: everything below. Tasks 3, 4 and 6 import these exact names.

```ts
export interface ScorableRecord {
  caption?: string; captionDe?: string;
  description?: string; descriptionDe?: string;
  tags?: string[]; link?: string; siteLink?: string;
}
export interface CompletenessChecks {
  caption: boolean; description: boolean; german: boolean; tags: boolean; link: boolean;
}
export interface AdminRating {
  professional: number; knowledge: number; aesthetics: number; completeness: number | null;
}
export interface ModerationRecord {
  ratings?: Record<string, AdminRating>; hidden?: boolean;
}
export const WEIGHTS: { professional: number; knowledge: number; aesthetics: number; completeness: number };
export const SCALE_MAX: number;   // 5
export const NEUTRAL: number;     // 2.5
export function completenessChecks(rec: ScorableRecord): CompletenessChecks;
export function computedCompleteness(rec: ScorableRecord): number;          // 0..5
export function imageScore(rec: ScorableRecord, mod?: ModerationRecord | null): number;  // 0..100
export function isHidden(mod?: ModerationRecord | null): boolean;
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/imageScore.test.mjs`:

```js
// The one arithmetic the console shows an admin and the build orders the site
// by. It exists twice on disk — see the identity test at the bottom, which is
// what stops the two copies drifting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  completenessChecks, computedCompleteness, imageScore, isHidden, WEIGHTS,
} from "../../src/lib/imageScore.ts";

const BARE = {};
const FULL = {
  caption: "a", captionDe: "a", description: "b", descriptionDe: "b",
  tags: ["neuron"], link: "example.com/x",
};

test("the weights are the ones the design fixed", () => {
  assert.deepEqual(WEIGHTS, {
    professional: 0.35, knowledge: 0.25, aesthetics: 0.25, completeness: 0.15,
  });
});

test("completeness counts the five checks off the record", () => {
  assert.equal(computedCompleteness(BARE), 0);
  assert.equal(computedCompleteness(FULL), 5);
  assert.deepEqual(completenessChecks(BARE), {
    caption: false, description: false, german: false, tags: false, link: false,
  });
});

test("a German caption alone is not the German check — it needs both", () => {
  assert.equal(computedCompleteness({ captionDe: "a" }), 0);
  assert.equal(computedCompleteness({ captionDe: "a", descriptionDe: "b" }), 1);
});

test("siteLink satisfies the link check on its own", () => {
  assert.equal(computedCompleteness({ siteLink: "example.com/x" }), 1);
});

test("blank strings are not content", () => {
  assert.equal(computedCompleteness({ caption: "   ", description: "" }), 0);
});

test("an unrated image sits in the middle, nudged only by its completeness", () => {
  assert.equal(imageScore(BARE, null), 43);   // 100 * (0.85*2.5 + 0.15*0) / 5
  assert.equal(imageScore(FULL, null), 58);   // 100 * (0.85*2.5 + 0.15*5) / 5
  assert.equal(imageScore(FULL, { ratings: {} }), 58);
});

test("one admin's ratings are the score", () => {
  const rated = { ratings: { a1: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null } } };
  assert.equal(imageScore(FULL, rated), 100);
  assert.equal(imageScore(BARE, rated), 85);  // auto completeness 0 → 0.85*5
});

test("a null completeness follows the record, an override does not", () => {
  const auto = { ratings: { a1: { professional: 0, knowledge: 0, aesthetics: 0, completeness: null } } };
  const over = { ratings: { a1: { professional: 0, knowledge: 0, aesthetics: 0, completeness: 0 } } };
  assert.equal(imageScore(FULL, auto), 15);   // 0.15 * 5 / 5 * 100
  assert.equal(imageScore(FULL, over), 0);
});

test("admins are averaged, and an auto rater still tracks the record", () => {
  const two = {
    ratings: {
      a1: { professional: 5, knowledge: 5, aesthetics: 5, completeness: null },
      a2: { professional: 0, knowledge: 0, aesthetics: 0, completeness: null },
    },
  };
  assert.equal(imageScore(FULL, two), 58);    // means 2.5/2.5/2.5, completeness 5
});

test("out-of-range input is clamped rather than trusted", () => {
  // 99 -> 5, -4 -> 0, 5 stays, 12 -> 5. Weighted: 1.75 + 0 + 1.25 + 0.75 = 3.75.
  // Both bounds on purpose: clamping that only caps the top is half a guard.
  const wild = { ratings: { a1: { professional: 99, knowledge: -4, aesthetics: 5, completeness: 12 } } };
  assert.equal(imageScore(FULL, wild), 75);
});

test("hidden is a separate question from the score", () => {
  assert.equal(isHidden(null), false);
  assert.equal(isHidden({ hidden: false }), false);
  assert.equal(isHidden({ hidden: true }), true);
});

test("the two copies of the module are identical, or the site and the console disagree", () => {
  assert.equal(
    readFileSync(new URL("../../src/lib/imageScore.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../functions/src/imageScore.ts", import.meta.url), "utf8"),
  );
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test tests/unit/imageScore.test.mjs
```

Expected: FAIL — cannot resolve `../../src/lib/imageScore.ts`.

- [ ] **Step 3: Write the module**

Create `src/lib/imageScore.ts`:

```ts
// THE PRIORITY SCORE. One arithmetic, used in three places: the rating
// callable, the build's snapshot export, and the console panel that shows an
// admin the number before they commit to it. They must agree exactly, or the
// console lies about what it is about to do.
//
// THIS FILE EXISTS TWICE, BYTE FOR BYTE:
//   src/lib/imageScore.ts        — site, build scripts, admin console
//   functions/src/imageScore.ts  — the callables
// Not an oversight. functions/tsconfig.json sets rootDir "src" and the deploy
// uploads only functions/, so a Cloud Function cannot import ../src/lib. The
// repo already mirrors rules this way (validImage lives in three files). What
// is new is that tests/unit/imageScore.test.mjs compares the two files and
// fails if they differ, so the copy cannot rot quietly. EDIT BOTH.
//
// Pure: no Firebase import of any kind, browser or admin, exactly as
// galleryRecords.ts is pure. That is what makes it testable without an
// emulator and safe to import from a build script.
//
// See documentation/20260922-image-moderation-ranking-design.md.

/** The fields of an images/{id} record the completeness reading looks at. */
export interface ScorableRecord {
  caption?: string;
  captionDe?: string;
  description?: string;
  descriptionDe?: string;
  tags?: string[];
  link?: string;
  siteLink?: string;
}

/** Shown in the console beside the slider, so an override is a disagreement and not a guess. */
export interface CompletenessChecks {
  caption: boolean;
  description: boolean;
  /** BOTH German fields. Half a translation is not a translated record. */
  german: boolean;
  tags: boolean;
  /** Either link — where it appeared, or the member's own page for it. */
  link: boolean;
}

/** One admin's judgement. `completeness: null` means "follow the record". */
export interface AdminRating {
  professional: number;
  knowledge: number;
  aesthetics: number;
  completeness: number | null;
}

/** The imageModeration/{imageId} document, as far as scoring cares. */
export interface ModerationRecord {
  ratings?: Record<string, AdminRating>;
  hidden?: boolean;
}

export const WEIGHTS = {
  professional: 0.35,
  knowledge: 0.25,
  aesthetics: 0.25,
  completeness: 0.15,
};

export const SCALE_MAX = 5;

/** What an unrated human criterion contributes: the middle of the scale. */
export const NEUTRAL = 2.5;

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function completenessChecks(rec: ScorableRecord): CompletenessChecks {
  return {
    caption: filled(rec.caption),
    description: filled(rec.description),
    german: filled(rec.captionDe) && filled(rec.descriptionDe),
    tags: Array.isArray(rec.tags) && rec.tags.length > 0,
    link: filled(rec.link) || filled(rec.siteLink),
  };
}

/** Checks passed — already on the 0–5 scale the other three criteria use. */
export function computedCompleteness(rec: ScorableRecord): number {
  return Object.values(completenessChecks(rec)).filter(Boolean).length;
}

function clamp(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(SCALE_MAX, Math.max(0, n));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 0–100. An image nobody has rated takes NEUTRAL on the three human criteria
 * but its REAL completeness, so a documented picture edges ahead of a bare one
 * before anyone has looked at it — a 15-point spread around the middle, enough
 * to break ties and not enough to reorder a page.
 */
export function imageScore(rec: ScorableRecord, mod?: ModerationRecord | null): number {
  const auto = computedCompleteness(rec);
  const raters = Object.values(mod?.ratings ?? {});
  const parts = raters.length
    ? {
        professional: mean(raters.map((r) => clamp(r.professional))),
        knowledge: mean(raters.map((r) => clamp(r.knowledge))),
        aesthetics: mean(raters.map((r) => clamp(r.aesthetics))),
        // An `auto` rater contributes TODAY's reading, not the one that was
        // true when they rated. That is the whole reason completeness is
        // computed: a member who adds a German description next month lifts
        // their own score with nobody re-rating anything.
        completeness: mean(raters.map((r) => (r.completeness === null || r.completeness === undefined ? auto : clamp(r.completeness)))),
      }
    : {
        professional: NEUTRAL,
        knowledge: NEUTRAL,
        aesthetics: NEUTRAL,
        completeness: auto,
      };
  const weighted =
    WEIGHTS.professional * parts.professional +
    WEIGHTS.knowledge * parts.knowledge +
    WEIGHTS.aesthetics * parts.aesthetics +
    WEIGHTS.completeness * parts.completeness;
  return Math.round((100 * weighted) / SCALE_MAX);
}

/** Hidden is a moderation act, never a consequence of a low score. */
export function isHidden(mod?: ModerationRecord | null): boolean {
  return mod?.hidden === true;
}
```

- [ ] **Step 4: Mirror it into functions**

```bash
cp src/lib/imageScore.ts functions/src/imageScore.ts
```

The identity test in Step 1 is what enforces this from here on.

- [ ] **Step 5: Run the tests**

```bash
node --test tests/unit/imageScore.test.mjs
```

Expected: PASS, all twelve. If the arithmetic assertions fail, the formula is
wrong — do not edit the expected numbers, they are derived in the spec.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run check
git add src/lib/imageScore.ts functions/src/imageScore.ts tests/unit/imageScore.test.mjs
git commit -m "feat(moderation): the priority score, and one arithmetic for it"
```

---

## Task 2: Firestore rules for `imageModeration`

**Files:**
- Modify: `firestore.rules` — add one `match` block beside the existing `match /images/{imageId}` block (around line 116). **Do not touch `validImage()`.**
- Test: `tests/rules/firestore.test.mjs` — append.

**Interfaces:**
- Consumes: the existing `isAdmin()` helper in `firestore.rules`.
- Produces: the `imageModeration` collection contract relied on by Tasks 3 and 4.

- [ ] **Step 1: Write the failing tests**

Read `tests/rules/helpers.mjs` first for how the suite builds admin, member and
signed-out contexts, and follow its existing idiom exactly. Append to
`tests/rules/firestore.test.mjs`:

```js
test("an admin can read a moderation record, and nobody else can", async () => {
  await assertSucceeds(getDoc(doc(adminDb, "imageModeration/img1")));
  await assertFails(getDoc(doc(memberDb, "imageModeration/img1")));
  await assertFails(getDoc(doc(anonDb, "imageModeration/img1")));
});

test("nobody writes a moderation record from a client — not even an admin", async () => {
  await assertFails(setDoc(doc(adminDb, "imageModeration/img1"), { score: 100 }));
  await assertFails(setDoc(doc(memberDb, "imageModeration/img1"), { score: 100 }));
});

test("a member can still save their own image record — validImage was not disturbed", async () => {
  await assertSucceeds(updateDoc(doc(memberDb, "images/member-gallery-1"), {
    caption: "a new line", updatedAt: serverTimestamp(),
  }));
});
```

The third test is the one that matters most: it is the regression guard for the
`hasOnly` trap the design exists to avoid. If the suite has no
`images/member-gallery-1` fixture, seed one the way the neighbouring image
tests seed theirs.

- [ ] **Step 2: Run them and watch the first two fail**

```bash
npm run test:rules
```

Expected: the two `imageModeration` tests FAIL (default deny gives a failed
read, so the *read* test fails; the write tests may pass vacuously). The third
must already PASS — if it does not, stop: something else is broken.

- [ ] **Step 3: Add the rules block**

In `firestore.rules`, immediately after the closing brace of `match /images/{imageId}`:

```
    match /imageModeration/{imageId} {
      // WHAT THE DIRECTORY THINKS OF A PICTURE — admin ratings and the
      // priority they average into. See
      // documentation/20260922-image-moderation-ranking-design.md.
      //
      // Read by admins so the console can show a record it is about to add
      // to. Written by NOBODY: every rating goes through adminRateImage, so a
      // member can never touch their own ranking and an admin cannot write a
      // score the scoring module did not produce.
      //
      // DELIBERATELY NOT A FIELD ON images/{imageId}. That document is
      // member-writable and validImage() guards it with a hasOnly allowlist:
      // a key that is not on the list fails the member's ENTIRE save, with no
      // error surfaced anywhere. Keeping ratings in their own collection means
      // validImage is not edited at all, which the test above proves.
      allow read: if isAdmin();
      allow write: if false;
    }
```

- [ ] **Step 4: Run the tests again**

```bash
npm run test:rules
```

Expected: PASS, all three.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/firestore.test.mjs
git commit -m "feat(moderation): imageModeration is admin-read and callable-written"
```

---

## Task 3: The callables

**Files:**
- Create: `functions/src/moderation.ts`
- Modify: `functions/src/index.ts` — export the three
- Modify: `functions/src/adminOps.ts` — `async function audit` → `export async function audit`
- Test: `tests/functions/moderation.test.cjs`

**Interfaces:**
- Consumes: `imageScore`, `computedCompleteness`, `completenessChecks`, `AdminRating` from `./imageScore` (Task 1); `requireAdmin`, `plain` from `./util`; `audit` from `./adminOps`.
- Produces: three callables, whose request and response shapes Task 6 mirrors in `src/lib/adminApi.ts`:

```ts
adminListRatingQueue({ limit?: number }) => {
  items: RatingQueueItem[];   // this admin has NOT rated these
  remaining: number;          // total unrated-by-me, before `limit`
}
interface RatingQueueItem {
  imageId: string; ownerUid: string; ownerName: string; ownerSlug: string;
  storagePath: string; width: number; height: number; color?: string;
  caption?: string; captionDe?: string; description?: string; descriptionDe?: string;
  tags: string[]; link?: string; siteLink?: string; createdAt: string;
  checks: CompletenessChecks; computedCompleteness: number;
  score: number; raterCount: number; hidden: boolean;
}
adminRateImage({ imageId, professional, knowledge, aesthetics, completeness })
  => { ok: true; score: number }
adminSetImageHidden({ imageId, hidden }) => { ok: true }
```

- [ ] **Step 1: Write the failing tests**

Read `tests/functions/security.test.cjs` first and follow its harness exactly —
it is the only existing callable test file and it already knows how to call a
function under the emulator with an admin and a non-admin token. Append a new
file `tests/functions/moderation.test.cjs` covering:

```js
// Behaviours, each its own test:
//  1. a non-admin calling any of the three gets permission-denied
//  2. adminRateImage rejects a non-integer, a value above 5, a value below 0,
//     and a missing imageId with invalid-argument
//  3. adminRateImage accepts completeness: null and stores null, not a number
//  4. after one admin rates, imageModeration/{id}.ratings has exactly that one
//     uid and .score equals imageScore(record, doc)
//  5. a SECOND admin rating the same image leaves the first admin's entry
//     untouched and averages both
//  6. the same admin rating twice overwrites only their own entry
//  7. adminRateImage on a missing image throws not-found
//  8. adminSetImageHidden sets hidden/hiddenBy/hiddenAt and does NOT change score
//  9. every one of the three writes lands in adminActions with the actor uid
// 10. rating and hiding both bump rebuildQueue/site (dirtyAt advances,
//     revision changes)
// 11. adminListRatingQueue omits images this admin has already rated,
//     omits images no visible profile references, and reports `remaining`
```

Write each as a real `test(...)` with real assertions — the list above is the
coverage contract, not a substitute for the code.

- [ ] **Step 2: Run and watch it fail**

```bash
npm run test:rules
```

Expected: FAIL — the three functions do not exist.

- [ ] **Step 3: Export `audit` from adminOps**

In `functions/src/adminOps.ts`, change exactly one line:

```ts
export async function audit(
```

Leave every call site alone. Add above it:

```ts
// Exported since 2026-09-22 so moderation.ts logs through the same row shape
// rather than growing a second audit writer.
```

- [ ] **Step 4: Write `functions/src/moderation.ts`**

```ts
// RANKING AND HIDING. The console's three privileged verbs.
//
// Ratings are per-admin and averaged (see imageScore.ts); a call writes ONLY
// the caller's entry in the map, so two admins rating the same picture is the
// normal case and not a conflict. Every write also marks the site rebuild
// dirty BY HAND — rebuildQueue.ts fingerprints the profile and its image
// documents, and the moderation record is deliberately outside both, so
// nothing else would notice a rating and the score would never reach the
// static site.
//
// See documentation/20260922-image-moderation-ranking-design.md.
import { randomUUID } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "./admin";
import { audit } from "./adminOps";
import {
  completenessChecks, computedCompleteness, imageScore,
  type AdminRating, type ModerationRecord, type ScorableRecord,
} from "./imageScore";
import { galleryImageIds, plain, requireAdmin } from "./util";

/** The queue is a page of work, not a dump of the collection. */
const QUEUE_LIMIT = 50;

function requireImageId(data: unknown): string {
  const id = String((data as { imageId?: unknown })?.imageId ?? "").trim();
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "imageId is required");
  return id;
}

/** 0–5 integers only. A slider cannot produce anything else; a caller can. */
function criterion(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) {
    throw new HttpsError("invalid-argument", `${name} must be an integer 0-5`);
  }
  return value;
}

/** null is not missing — it is the stored instruction "follow the record". */
function optionalCriterion(value: unknown, name: string): number | null {
  if (value === null || value === undefined) return null;
  return criterion(value, name);
}

/**
 * The rebuild sweep dispatches when this document is dirty. Marked here
 * because rebuildFingerprint() cannot see a collection it does not read.
 */
async function markSiteDirty(): Promise<void> {
  await db.doc("rebuildQueue/site").set(
    { dirtyAt: Timestamp.now(), revision: randomUUID() },
    { merge: true },
  );
}

export const adminRateImage = onCall(async (req) => {
  const actor = requireAdmin(req);
  const imageId = requireImageId(req.data);
  const rating: AdminRating = {
    professional: criterion((req.data as Record<string, unknown>).professional, "professional"),
    knowledge: criterion((req.data as Record<string, unknown>).knowledge, "knowledge"),
    aesthetics: criterion((req.data as Record<string, unknown>).aesthetics, "aesthetics"),
    completeness: optionalCriterion((req.data as Record<string, unknown>).completeness, "completeness"),
  };

  const actorName = (await db.doc(`publicProfiles/${actor}`).get()).data()?.displayName ?? "";

  const score = await db.runTransaction(async (tx) => {
    const imageRef = db.doc(`images/${imageId}`);
    const modRef = db.doc(`imageModeration/${imageId}`);
    const [image, mod] = await Promise.all([tx.get(imageRef), tx.get(modRef)]);
    if (!image.exists) throw new HttpsError("not-found", "No such image.");
    const record = image.data() as ScorableRecord;
    const existing = (mod.data() ?? {}) as ModerationRecord;
    // Only the caller's own entry moves. Everyone else's stands.
    const ratings = { ...(existing.ratings ?? {}), [actor]: rating };
    const next = imageScore(record, { ...existing, ratings });
    tx.set(
      modRef,
      {
        ratings: {
          ...ratings,
          [actor]: { ...rating, at: Timestamp.now(), name: actorName },
        },
        score: next,
        scoredAt: Timestamp.now(),
      },
      { merge: true },
    );
    return next;
  });

  await audit(actor, "rateImage", String((await db.doc(`images/${imageId}`).get()).data()?.ownerUid ?? ""), {
    imageId, ...rating, score,
  });
  await markSiteDirty();
  return { ok: true as const, score };
});

export const adminSetImageHidden = onCall(async (req) => {
  const actor = requireAdmin(req);
  const imageId = requireImageId(req.data);
  const hidden = (req.data as { hidden?: unknown }).hidden === true;

  const image = await db.doc(`images/${imageId}`).get();
  if (!image.exists) throw new HttpsError("not-found", "No such image.");

  await db.doc(`imageModeration/${imageId}`).set(
    {
      hidden,
      hiddenBy: hidden ? actor : null,
      hiddenAt: hidden ? Timestamp.now() : null,
    },
    { merge: true },
  );
  // A separate action name from rateImage: the log should read as a
  // moderation act, not as a number changing.
  await audit(actor, hidden ? "hideImage" : "unhideImage", String(image.data()?.ownerUid ?? ""), { imageId });
  await markSiteDirty();
  return { ok: true as const };
});

export const adminListRatingQueue = onCall(async (req) => {
  const actor = requireAdmin(req);
  const limit = Math.min(200, Math.max(1, Number((req.data as { limit?: unknown })?.limit) || QUEUE_LIMIT));

  const [images, mods, profiles, slugs] = await Promise.all([
    db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    db.collection("imageModeration").get(),
    db.collection("publicProfiles").get(),
    db.collection("slugs").where("current", "==", true).get(),
  ]);

  const modById = new Map(mods.docs.map((d) => [d.id, d.data() as ModerationRecord]));
  const slugByUid = new Map(slugs.docs.map((d) => [String(d.data().uid ?? ""), d.id]));
  // Only pictures a visible profile actually points at. An unreferenced live
  // record is an orphan, and adminListQueues already has a queue for those —
  // rating one would be work spent on something no visitor can see.
  const nameByUid = new Map<string, string>();
  const referenced = new Set<string>();
  for (const doc of profiles.docs) {
    const data = doc.data();
    if (data.active === false || data.moderationHidden === true) continue;
    nameByUid.set(doc.id, String(data.displayName ?? ""));
    for (const id of galleryImageIds(data)) referenced.add(id);
  }

  const unrated = images.docs
    .filter((d) => referenced.has(d.id) && nameByUid.has(String(d.data().ownerUid ?? "")))
    .filter((d) => !(modById.get(d.id)?.ratings ?? {})[actor])
    .sort((a, b) => String(b.data().createdAt?.toMillis?.() ?? 0).localeCompare(String(a.data().createdAt?.toMillis?.() ?? 0)));

  const items = unrated.slice(0, limit).map((d) => {
    const data = d.data();
    const rec = data as ScorableRecord;
    const mod = modById.get(d.id) ?? null;
    const ownerUid = String(data.ownerUid ?? "");
    return {
      imageId: d.id,
      ownerUid,
      ownerName: nameByUid.get(ownerUid) ?? "",
      ownerSlug: slugByUid.get(ownerUid) ?? "",
      storagePath: data.storagePath,
      width: data.width,
      height: data.height,
      color: data.color,
      caption: data.caption,
      captionDe: data.captionDe,
      description: data.description,
      descriptionDe: data.descriptionDe,
      tags: Array.isArray(data.tags) ? data.tags : [],
      link: data.link,
      siteLink: data.siteLink,
      createdAt: data.createdAt,
      checks: completenessChecks(rec),
      computedCompleteness: computedCompleteness(rec),
      score: imageScore(rec, mod),
      raterCount: Object.keys(mod?.ratings ?? {}).length,
      hidden: mod?.hidden === true,
    };
  });

  return plain({ items, remaining: unrated.length });
});
```

Note the `sort` above compares millisecond numbers through `localeCompare`,
which is wrong for numbers — **fix it while implementing** to a numeric
comparison on `createdAt?.toMillis?.() ?? 0`, descending. It is called out here
so the reviewer checks it rather than trusting the block.

- [ ] **Step 5: Export them**

In `functions/src/index.ts`, beside the existing `adminOps` export block:

```ts
export { adminListRatingQueue, adminRateImage, adminSetImageHidden } from "./moderation";
```

- [ ] **Step 6: Build and test**

```bash
npm --prefix functions run build && npm run test:rules
```

Expected: the functions `tsc` passes (this is the only thing that catches a
semantic break across the two packages) and every moderation test passes.

- [ ] **Step 7: Commit**

```bash
git add functions/src/moderation.ts functions/src/index.ts functions/src/adminOps.ts tests/functions/moderation.test.cjs
git commit -m "feat(moderation): rate, hide, and a per-admin queue of the unrated"
```

---

## Task 4: The score reaches the build

**Files:**
- Modify: `scripts/export-site-data.mjs`
- Modify: `src/lib/membersBuild.ts`
- Modify: `src/lib/galleryRecords.ts` — two optional fields on `GalleryRecord` only
- Modify: `src/lib/memberView.ts` — `score` and `hidden` on `ProfileWork`
- Test: `tests/unit/memberView.test.mjs` — append

**Interfaces:**
- Consumes: `imageScore`, `isHidden` from `src/lib/imageScore.ts` (Task 1).
- Produces: `SiteSnapshot.moderation: { imageId: string; score: number; hidden: boolean }[]`, and on every `ProfileWork`: `score: number`, `hidden: boolean`. Task 5 consumes both.

**Do NOT modify `orderedGalleryItems()` or the `GalleryItem` interface.** The
profile editor and the member page share them, and the spec's whole boundary is
that profile pages keep the member's order.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/memberView.test.mjs`:

```js
test("a work carries its priority and whether moderation hid it", () => {
  const records = [
    { imageId: "i1", ownerUid: "u1", kind: "gallery", status: "live",
      storagePath: "users/u1/gallery/i1.webp", width: 10, height: 10,
      caption: "a", score: 91, hidden: false },
    { imageId: "i2", ownerUid: "u1", kind: "gallery", status: "live",
      storagePath: "users/u1/gallery/i2.webp", width: 10, height: 10,
      caption: "b", score: 12, hidden: true },
  ];
  const view = toMemberViewBase("u1", { displayName: "U", gallery: ["i1", "i2"] }, records, "b");
  assert.deepEqual(view.works.map((w) => [w.score, w.hidden]), [[91, false], [12, true]]);
});

test("a record with no moderation row still scores, so nothing sorts as zero", () => {
  const records = [
    { imageId: "i1", ownerUid: "u1", kind: "gallery", status: "live",
      storagePath: "users/u1/gallery/i1.webp", width: 10, height: 10 },
  ];
  const view = toMemberViewBase("u1", { displayName: "U", gallery: ["i1"] }, records, "b");
  assert.equal(view.works[0].score, 43);
  assert.equal(view.works[0].hidden, false);
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
node --test tests/unit/memberView.test.mjs
```

Expected: FAIL — `score` is `undefined`.

- [ ] **Step 3: Widen `GalleryRecord`**

In `src/lib/galleryRecords.ts`, add to the `GalleryRecord` interface only:

```ts
  /**
   * The priority the build sorted /community by, attached to the record by
   * membersBuild from the snapshot's moderation table. Absent everywhere
   * except the build — the editor's records do not carry it, which is why it
   * is optional and why orderedGalleryItems() ignores it entirely.
   */
  score?: number;
  /** Moderation took this off /community. It stays on the member's own page. */
  hidden?: boolean;
```

- [ ] **Step 4: Carry them through `memberView.works()`**

In `src/lib/memberView.ts`, add `score: number` and `hidden: boolean` to the
`ProfileWork` interface, and in `works()`:

```ts
function works(uid: string, doc: PublicProfileDoc, records: readonly GalleryRecord[], bucket: string): ProfileWork[] {
  // The record, not the item: orderedGalleryItems() deliberately knows nothing
  // about moderation, so the two fields are read back off the record here.
  const byId = new Map(records.map((rec) => [rec.imageId, rec]));
  return orderedGalleryItems(uid, doc.gallery, records, bucket).map((g) => ({
    // ...every existing field, unchanged...
    // A record that reached here without a precomputed score gets its
    // completeness reading rather than a zero, which would sink it to the
    // bottom of the wall for a reason nobody chose.
    score: byId.get(g.imageId)?.score ?? imageScore(byId.get(g.imageId) ?? {}),
    hidden: byId.get(g.imageId)?.hidden === true,
  }));
}
```

Import `imageScore` from `./imageScore.ts` for that fallback. No new constant.

- [ ] **Step 5: Export the moderation table**

In `scripts/export-site-data.mjs`:

```js
import { imageScore, isHidden } from "../src/lib/imageScore.ts";
```

Add `imageModeration` to the parallel read:

```js
  const [profiles, slugs, images, moderation] = await Promise.all([
    db.collection("publicProfiles").orderBy("displayName").get(),
    db.collection("slugs").get(),
    db.collection("images").where("kind", "==", "gallery").where("status", "==", "live").get(),
    db.collection("imageModeration").get(),
  ]);
```

and, after `snapshot.images` is built, emit a row for EVERY exported image —
not only the rated ones, so the build never has to decide what a missing row
means:

```js
  // ADMIN UIDS DO NOT TRAVEL. The snapshot carries the conclusion (a number
  // and a flag), never the ratings map that produced it: this file is written
  // to disk in CI and read by the build, and who rated what is nobody's
  // business outside the console.
  const modById = new Map(moderation.docs.map((doc) => [doc.id, doc.data()]));
  snapshot.moderation = snapshot.images.map((image) => ({
    imageId: image.imageId,
    score: imageScore(image, modById.get(image.imageId) ?? null),
    hidden: isHidden(modById.get(image.imageId) ?? null),
  }));
```

- [ ] **Step 6: Attach them in `membersBuild.ts`**

Add `moderation` to the `SiteSnapshot` interface and to the validator's shape
check (`!Array.isArray(snapshot.moderation)` fails the build — a snapshot
without it is from an older exporter and must not deploy silently). Then, where
`recordsByOwner` is built:

```js
  const modByImage = new Map(snapshot.moderation.map((row) => [row.imageId, row]));
  for (const rec of snapshot.images) {
    const mod = modByImage.get(rec.imageId);
    const list = recordsByOwner.get(rec.ownerUid) ?? [];
    list.push({ ...rec, score: mod?.score, hidden: mod?.hidden === true });
    recordsByOwner.set(rec.ownerUid, list);
  }
```

- [ ] **Step 7: Run the tests**

```bash
node --test tests/unit/memberView.test.mjs tests/unit/galleryRecords.test.mjs
npm run check
```

Expected: PASS. `galleryRecords` must still pass untouched — if it does not,
`orderedGalleryItems` was modified and it should not have been.

- [ ] **Step 8: Commit**

```bash
git add scripts/export-site-data.mjs src/lib/membersBuild.ts src/lib/galleryRecords.ts src/lib/memberView.ts tests/unit/memberView.test.mjs
git commit -m "feat(moderation): the priority travels with the snapshot"
```

---

## Task 5: /community orders by the score

**Files:**
- Modify: `src/pages/[...lang]/community.astro`
- Modify: `src/components/CommunityGrid.astro`

**Interfaces:**
- Consumes: `ProfileWork.score` and `ProfileWork.hidden` (Task 4).
- Produces: nothing other tasks consume.

**Read `documentation/20260922-image-moderation-ranking-design.md` §"Getting the
score onto the static site" before starting.** The member profile page
(`src/pages/[...lang]/members/`) must not be touched.

- [ ] **Step 1: Drop hidden works, in `community.astro`**

In the `members` mapping, before the locale resolution:

```ts
const members = (await fetchMemberViews()).map((m) => ({
  ...m,
  // Moderation hid these from the edited surfaces. They are still on the
  // member's own page, and still in their account — this is the /community
  // wall's guest list, not a deletion. Filtered HERE rather than in
  // fetchMemberViews() so the member page keeps showing them.
  works: m.works
    .filter((w) => !w.hidden)
    .map((w) => ({ ...w, caption: workCaption(w, currentLang), description: workDescription(w, currentLang) })),
}));
```

Because `jsonLd` is built from this same `members` array, hidden works leave
the structured data with it — verify that, do not assume it.

- [ ] **Step 2: Order the wall, the carousels and the deal, in `CommunityGrid.astro`**

Three edits, each with a comment saying which surface it governs:

```ts
// THE WALL IS EDITED, THE PROFILE IS NOT. Every picture on /community is
// ordered by the priority admins gave it (documentation/20260922-image-
// moderation-ranking-design.md); /members/<slug> keeps the order the member
// arranged. The same pictures therefore appear in two different orders on two
// different pages, which is deliberate: one surface is ours, the other theirs.
const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
```

1. Each card's carousel leads with the member's best — sort `member.works` where
   the members array is prepared, before `imageMembers` is derived.
2. The wall's tiles: `workCells` gets `.sort((a, b) => byScore(a.work, b.work))`
   **after** the `flatMap`, not inside it.
3. The spread's member deal: order `imageMembers` by each member's best work,
   `Math.max(...m.works.map(w => w.score))`, descending, before the slot deal.

**The slot deal has invariants that a reorder can break.** `communityLayout.ts`
validates the pattern at module load and the deal "pairs member i with slot i
and relies on emission order being row order". Reordering the *members* is
allowed; reordering the *slots* is not. If the module-load validator throws,
you have sorted the wrong array.

- [ ] **Step 3: Build and look at it**

```bash
npm run build
```

Expected: the build completes and reports a non-zero member count. A build that
succeeds with zero members means the worktree has no credentials — stop and say
so rather than continuing.

Then start the dev server on a free port and confirm in the browser pane that
/community still renders both views and the Gallery/Grid toggle still switches
them. `preview_start` resolves names against `repo/`, not this worktree, so run
`npx astro dev --port 4323` via Bash and open the URL directly.

- [ ] **Step 4: Commit**

```bash
git add "src/pages/[...lang]/community.astro" src/components/CommunityGrid.astro
git commit -m "feat(moderation): the wall and the spread lead with the best work"
```

---

## Task 6: The Moderation view in the admin console

**Files:**
- Modify: `src/lib/adminApi.ts`
- Create: `src/lib/admin/rating.ts`
- Modify: `src/components/admin/AdminConsole.astro`
- Modify: `src/pages/proto/admin-preview.astro`

**`/proto/admin-preview.astro` is not optional.** `/admin` needs the `admin`
custom claim, so that page is the only way the console's views can be looked at
— and its synthetic records are typed as the real callable shapes **with no
casts**, deliberately, so `npm run check` fails when a callable's shape drifts
away from what the console renders. A Moderation view with no synthetic
`RatingQueueItem[]` there either breaks the typecheck or silently loses that
guard. Add a fixture of three or four items covering: a bare record (0/5
completeness), a full record (5/5), one already rated by another admin
(`raterCount: 1`), and one already hidden.

**Interfaces:**
- Consumes: the three callables (Task 3); `completenessChecks`, `computedCompleteness`, `imageScore` from `src/lib/imageScore.ts` (Task 1); `publicStorageUrl` from `src/lib/images.ts`.
- Produces: nothing other tasks consume.

**Read `src/lib/admin/queues.ts` and `src/lib/admin/memberDetail.ts` first** and
follow their idiom — how they render into the console's panels, how they report
errors, how they use `src/lib/admin/dom.ts`. `AdminConsole.astro` is already 660
lines; the panel's logic belongs in `rating.ts`, not in the component.

- [ ] **Step 1: Add the client wrappers**

In `src/lib/adminApi.ts`, mirroring the existing `call<Req, Res>` pattern and
the shapes in Task 3's Interfaces block:

```ts
export interface RatingQueueItem { /* exactly Task 3's shape */ }
export const listRatingQueue = call<{ limit?: number }, { items: RatingQueueItem[]; remaining: number }>("adminListRatingQueue");
export const rateImage = call<
  { imageId: string; professional: number; knowledge: number; aesthetics: number; completeness: number | null },
  { ok: true; score: number }
>("adminRateImage");
export const setImageHidden = call<{ imageId: string; hidden: boolean }, { ok: true }>("adminSetImageHidden");
```

- [ ] **Step 2: Build the panel in `src/lib/admin/rating.ts`**

The contract, which the review will check against:

- The stack renders **one** item at a time: the picture large, its metadata to
  the right, four sliders below. `remaining` is shown.
- The three human sliders start **unset**. `Save & next` is disabled until all
  three have been moved. Never store a value the admin did not choose.
- The completeness slider starts at `item.computedCompleteness`, marked `auto`.
  Moving it flips it to overridden and reveals a revert control; reverting
  sends `completeness: null`.
- The completeness checklist is rendered from `item.checks` as five labelled
  ticks and crosses — it explains the number, it is not an input.
- The live score is recomputed in the browser from `imageScore()` — the same
  module the callable uses — as sliders move, so the number shown is the number
  that will be stored.
- `Save & next` calls `rateImage`, then advances to the next item without
  refetching the whole queue.
- `Skip` advances without writing. Skips live in memory for the session only.
- `Hide from galleries` calls `setImageHidden` and advances. It is styled as a
  destructive-ish action, distinct from the sliders.
- Keyboard: `1`–`5` set the focused slider, `Tab` moves between them, `Enter`
  saves and advances, `s` skips, `h` hides. Guard every one of these against
  firing while focus is in a text input — `AdminConsole.astro` already has that
  `typing` check around line 491; reuse its shape.
- Where `item.raterCount > 0`, show that other admins have rated and what the
  current score is, so an admin knows they are joining an average.
- Errors surface in the panel the way `queues.ts` surfaces them. A failed save
  must not advance the stack.

- [ ] **Step 3: Add the view to `AdminConsole.astro`**

A `Moderation` entry beside the existing views, its markup, and its styles
scoped the way the file's other panels are. Follow the existing focus and
history handling — the console already moves focus to the panel heading and
writes a history entry per view.

- [ ] **Step 4: Verify in a browser**

```bash
npx astro dev --port 4323
```

Sign in as an admin, open `/admin`, and walk the stack: rate one, skip one,
hide one. Confirm the score the panel showed equals the score the record holds
afterwards. Screenshot the panel.

- [ ] **Step 5: Commit**

```bash
npm run lint && npm run check
git add src/lib/adminApi.ts src/lib/admin/rating.ts src/components/admin/AdminConsole.astro
git commit -m "feat(admin): a stack of unrated pictures and four sliders"
```

---

## Task 7: Verify and land on dev

- [ ] **Step 1: Full verification**

```bash
npm run verify
```

Expected: lint, `astro check`, unit tests and the emulator suite all pass. This
is the gate — nothing below runs until it is green.

- [ ] **Step 2: Push and open a PR**

```bash
git push -u origin feat/image-moderation-ranking
gh pr create --base dev --title "Image moderation and ranking" --body "<summary + link to both docs>"
```

- [ ] **Step 3: Wait for CI, then merge into dev**

Dev is deployed by merging into it — the local `deploy:dev` credential is
revoked (`documentation/agent-memory/dev-deploy-is-ci-only.md`). Merge the PR
once CI is green.

`dev` cannot be checked out twice and `repo/` cannot be switched, so if the
merge must happen locally, do it in a throwaway **detached** worktree at
`origin/dev` and push `HEAD:refs/heads/dev`
(`documentation/agent-memory/merging-into-dev-without-switching.md`).

- [ ] **Step 4: Confirm the deploy**

Watch the dev deploy action to completion. Then load dev's /community and
confirm it renders, and dev's /admin and confirm the Moderation view loads a
stack. **A rules deploy is required** for the `imageModeration` block — confirm
the release pipeline carried it, and if the pipeline is hosting-only
(`documentation/agent-memory/admin-console-ux-pass.md` says the release pipeline
deploys HOSTING ONLY), deploy rules and functions explicitly.

- [ ] **Step 5: Write the memory note**

Write `~/.claude/projects/D--SynoDrive-VSCN/memory/image-moderation-ranking.md`,
add its line to `MEMORY.md`, and mirror it into
`documentation/agent-memory/image-moderation-ranking.md` per the user's
standing rule. Leave it uncommitted for the user unless they ask otherwise.
