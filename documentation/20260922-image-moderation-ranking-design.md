# Image moderation and ranking

2026-09-22. Josh: *"I will need a moderation tool, that ranks images, so we can
actually display them in order. we have a lot of people that will upload
personal images, which we allow but we want to promote professional work."*

The directory accepts what members upload. It does not have to show all of it
equally. This design gives every picture a **priority score**, orders the two
/community views by it, and gives admins a stack to work through.

Ranking is not gatekeeping: nothing is refused, nothing is deleted, and a
personal snapshot stays on its owner's profile page exactly as before. What
changes is where it lands on the wall.

## What was decided

Four questions were settled before this was written, and every section below
follows from them.

| Question | Answer |
|---|---|
| Where does the score reorder things? | The two /community views — the Grid wall and the Gallery spread. Member profile pages stay in the member's own order. |
| Is completeness rated or computed? | Computed from the record, shown as a pre-filled slider, overridable by hand. |
| Is there a way to take an image off the galleries? | Yes, a hide toggle, separate from the score. No score threshold ever hides anything. |
| Where do unrated images sit? | The neutral middle. |

## The score

Four criteria, each an integer 0–5:

- **professional** — is this professional work
- **knowledge** — is the subject knowledge communication
- **aesthetics** — is it good to look at
- **completeness** — does the record carry its description, links and tags

Each criterion is averaged across the admins who rated it. Then:

```
score = round(100 × (0.35·aesthetics + 0.25·professional + 0.25·knowledge + 0.15·completeness) / 5)
```

The weights are constants in one module, not scattered literals. Changing the
editorial emphasis of the whole directory is a one-line edit.

### Completeness is computed, and stays computed

Five checks, read straight off `images/{id}`:

1. `caption` present
2. `description` present
3. `captionDe` **and** `descriptionDe` present
4. at least one entry in `tags`
5. a `link` or a `siteLink`

`computed` is simply the number of checks passed — already 0–5, the same
scale as the other three criteria.

An admin may override it. **The override is stored only if they move the
slider.** An untouched slider stores `null`, and a `null` contributes the
*current* computed value at the moment the score is calculated.

This is the whole point of computing it. A member who adds a German
description next month lifts their own score, with no admin re-rating anything.
Snapshotting the computed value at save time would freeze that and throw away
the only criterion the machine can keep honest by itself.

When averaging: an `auto` entry contributes today's computed value, an override
contributes its number. Admins who overrode are honoured; admins who did not
stay live.

### Unrated images

An image nobody has rated takes **2.5** (the neutral middle) on professional,
knowledge and aesthetics — but its **real** computed completeness.

So on the day this ships the galleries look essentially as they do now, and a
well-documented picture edges very slightly ahead of a bare one before anyone
has touched it. The spread of unrated scores is 0.15/1 of the range: enough to
break ties, not enough to reorder the page.

## Where the ratings live

A new collection, `imageModeration/{imageId}`, keyed by the same id as the
image record:

```
imageModeration/{imageId}
  ratings: {
    <adminUid>: {
      professional: 0..5,
      knowledge:    0..5,
      aesthetics:   0..5,
      completeness: 0..5 | null,   // null = follow the computed value
      at:           timestamp,
      name:         string          // denormalised, for the console's history
    }
  }
  score:     0..100                  // recomputed on every write
  scoredAt:  timestamp
  hidden:    boolean
  hiddenBy:  string | null
  hiddenAt:  timestamp | null
```

Rules: `allow read: if isAdmin(); allow write: if false;` — every write goes
through a callable, as with every other privileged act in the console. The
build reads it with admin credentials.

### Why not on `images/{id}`

Because `images/{id}` is **member-writable**. `validImage()` in
`firestore.rules` guards it with a `hasOnly` key allowlist, and a field that
is not on that list makes the *entire* member save fail — silently, with no
error surfaced anywhere (see `documentation/agent-memory/firestore-rules-hasonly-gotcha.md`).
Each new field would also need an explicit immutability clause so a member
could not rate their own picture, on a save that has already been refused once
for costing too much to evaluate (`documentation/20260903-gallery-rules-budget.md`).

A separate collection touches none of that. `validImage` is not edited at all,
and the member write path is provably unchanged — there is a regression test
for exactly that.

A map keyed by admin uid rather than a subcollection: there are a handful of
admins, not thousands, and one read plus one atomic write is cheaper and easier
to reason about than a fan-out.

The collection holds a document only for pictures someone has rated or hidden.
Everything else is unrated by absence.

## The scoring module

`src/lib/imageScore.ts` — pure, no Firebase import of any kind, in the manner
of `galleryRecords.ts`:

```ts
export interface CompletenessChecks { caption; description; german; tags; link }
export function completenessChecks(rec: GalleryRecord): CompletenessChecks
export function computedCompleteness(rec: GalleryRecord): number   // 0..5
export function imageScore(rec: GalleryRecord, mod: ModerationDoc | null): number  // 0..100
export const WEIGHTS = { aesthetics: 0.35, professional: 0.25, knowledge: 0.25, completeness: 0.15 }
```

Imported by the callable, by `scripts/export-site-data.mjs`, and by the
console. The number the console shows an admin is arithmetically the same
number that orders the site, because there is one implementation of it.

Unit-tested in `tests/unit`, with no emulator: neutral defaults, the auto/override
split, an admin who rated only some criteria, weight sensitivity.

## Callables

Three, in a new `functions/src/moderation.ts`, exported from `index.ts`, each
guarded by the existing `requireAdmin` and audited into `adminActions` like
every other privileged act.

### `adminListRatingQueue({ limit? })`

Returns live `kind: "gallery"` images **this admin has not yet rated**, newest
first, with everything the panel needs to judge one: the image record, its
owner's display name and slug, its computed completeness checks, its current
score, and how many admins have rated it so far.

The queue is per-admin because the grade is an average of admins — an image
two others have rated still needs this admin's judgement to enter the average.

Scanning `images` and `imageModeration` whole is consistent with
`adminListQueues`, which already reads every profile and every user on every
call. When that stops being affordable the answer is a stored `ratedBy` array
to query on, not a cleverer query here.

### `adminRateImage({ imageId, professional, knowledge, aesthetics, completeness })`

`completeness` is `number | null`; `null` means auto. Writes this admin's entry
into the `ratings` map, recomputes `score` from the merged map in the same
transaction, audits, and marks the site rebuild dirty.

Re-rating an image the admin already rated overwrites their own entry and
leaves every other admin's alone.

### `adminSetImageHidden({ imageId, hidden })`

Independent of the score. Writes `hidden`, `hiddenBy`, `hiddenAt`, audits with
its own action name so the log reads as a moderation act and not as a rating,
and marks the rebuild dirty.

## The console

A new **Moderation** view beside the existing member list, queues and audit
views. Its logic goes in a new `src/lib/admin/rating.ts`, following the
`queues.ts` / `memberDetail.ts` split — `AdminConsole.astro` is 660 lines and
does not need to become 900.

```
┌───────────────────────────────────────────────┬──────────────────┐
│                                               │ Anna Keller      │
│              the picture, large                │ "Neuron culture" │
│                                               │ description…     │
│                                               │ tags · link      │
│                                               │ Completeness 4/5 │
│                                               │  ✓cap ✓desc ✗de  │
├───────────────────────────────────────────────┴──────────────────┤
│ Professional work       ○──────●──   4                            │
│ Knowledge communication ○───●─────   3                            │
│ Aesthetics              ○─────●───   4        score 74            │
│ Completeness            ○──────●──   4  auto  ↺                   │
│                                                                   │
│ [ Save & next ]  [ Skip ]  [ Hide from galleries ]   17 remaining │
└───────────────────────────────────────────────────────────────────┘
```

Rules of the panel:

- **The three human sliders start unset.** An admin who does not move one has
  not rated it, and saving with an unset slider is refused rather than quietly
  storing a 3.
- **The completeness slider starts at its computed value**, marked `auto`.
  Moving it flips it to overridden; `↺` puts it back to auto.
- **The checklist is shown, not rated.** It says *why* completeness reads what
  it does, so an override is an informed disagreement rather than a guess.
- **The score updates live** as sliders move, using the same pure module the
  server will use.
- **Keyboard first:** `1`–`5` set the focused slider, `Tab` moves down, `Enter`
  saves and advances, `S` skips, `H` hides. Rating a hundred pictures is a
  sitting, not a hundred sittings.
- **Skip is not a rating.** A skipped image returns to the stack; the skip
  lives in the browser for the session only, so nothing is permanently
  invisible because an admin once passed on it.

Where an image already carries ratings, the panel shows the other admins'
numbers beneath the sliders — an average of two is worth knowing you are
joining.

## Getting the score onto the static site

The site is built from `.site-data.json`, exported before Astro starts
(`scripts/export-site-data.mjs`). The score has to travel the same road.

1. **Export.** Add `moderation: [{ imageId, score, hidden }]` to `SiteSnapshot`,
   read from `imageModeration`. Absent means unrated; the score is then computed
   at build time from the record, so unrated images still get their completeness
   nudge without a document existing for them.
2. **Member view.** `MemberView.works[]` carries `score` and `hidden`.
3. **Consumption — in `community.astro` only.** Not in `orderedGalleryItems`,
   which the member profile page shares. That one function stays exactly as it
   is, which is what keeps profile pages in the member's order.

In `community.astro`:

- **hidden** works are dropped from both views, and from the page's JSON-LD.
- the **Grid wall**'s `workCells` sort by score descending.
- each **card's carousel** leads with the member's highest-scoring image.
- the **Gallery spread** deals members ordered by their best image's score.

### The shuffle is banded, not replaced

Found during implementation, and it nearly made the whole feature decorative:
`applyLayout` in `CommunityGrid.astro` re-deals both galleries with a seeded
Fisher-Yates on every page load. A server-side sort by score therefore reached
crawlers, no-JS visitors and the JSON-LD — and nobody else. Every human visitor
saw a random wall.

The shuffle is deliberate and predates this work: it exists so the wall feels
alive and so no member permanently owns the top-left corner. Deleting it to
make room for the score would have traded one good property for another.

**Both deals are therefore banded.** Images with the same score form a band,
bands are ordered by score descending, and membership is shuffled inside each
band. Across bands the better work is reliably higher; inside a band nobody has
a fixed position and the deal is as fresh as it ever was. The member deal is
banded the same way, on each member's best score.

The band key is the exact score. No bucket width — with an integer 0-100 score
the equal-score group is the natural band, and a width would be a second tuning
constant nobody asked for.

On the day this ships every score is between 48 and 58 (completeness alone), so
there are only a handful of bands and the wall looks essentially as it does
today. The ordering becomes visible as ratings arrive, which is the correct
order of events.

### The consequence, stated plainly

A member's card on /community will show their pictures in a different order
than their own profile page does. That is the direct cost of "rank the
galleries, not the profiles", and it is accepted deliberately: /community is an
edited surface, /members/&lt;slug&gt; is the member's own.

## Rebuilds

`rebuildQueue/site` already debounces: `rebuildQueue.ts` sets a dirty flag and
a scheduled sweep dispatches one build. Rating forty pictures in a sitting must
produce **one** rebuild, not forty.

The catch: `rebuildFingerprint` hashes the profile and its image documents. The
moderation document is outside both, so a rating would change nothing it looks
at and the sweep would never fire. **The rating and hide callables therefore
mark `rebuildQueue/site` dirty themselves**, rather than relying on the
fingerprint to notice.

## Testing

**`tests/unit`** (no emulator) — the scoring module: neutral defaults for an
unrated image, completeness auto vs override, an admin who rated three of four,
averaging across admins, weight sensitivity, and the checklist against records
missing each field in turn.

**`tests/rules`** — `imageModeration` is admin-read and nobody-write, including
an admin's own client SDK. Plus the regression that matters most: **a member can
still save their own image record**, proving `validImage` was not disturbed.

**`tests/functions`** (emulator) — the three callables: non-admin refused;
rating writes only the caller's map entry; re-rating overwrites only their own;
score recomputed from the merged map; hide is independent of score; both mark
the rebuild queue dirty; every call lands in `adminActions`.

## Out of scope

- No score threshold ever hides an image. Only the explicit toggle does.
- No reordering of member profile pages.
- No member-visible score. Members are never shown their rating, and the
  moderation collection is admin-read, so it does not leak through the rules.
- No bulk rating, no auto-classification. If a model ever scores these, it
  writes into the same `ratings` map as another rater and this design does not
  change.

## Files

| File | Change |
|---|---|
| `src/lib/imageScore.ts` | new — pure scoring and completeness |
| `functions/src/moderation.ts` | new — the three callables |
| `functions/src/index.ts` | export them |
| `src/lib/adminApi.ts` | three client wrappers and their types |
| `src/lib/admin/rating.ts` | new — the panel's logic |
| `src/components/admin/AdminConsole.astro` | the Moderation view and its markup |
| `firestore.rules` | the `imageModeration` block — `validImage` untouched |
| `scripts/export-site-data.mjs` | read `imageModeration` into the snapshot |
| `src/lib/membersBuild.ts` | carry moderation through `SiteSnapshot` |
| `src/lib/memberView.ts` | `score` and `hidden` on each work |
| `src/pages/[...lang]/community.astro` | filter hidden, order by score |
| `src/components/CommunityGrid.astro` | sort `workCells` and the member deal |
| `tests/unit/`, `tests/rules/`, `tests/functions/` | as above |
