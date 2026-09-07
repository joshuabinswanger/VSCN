# The record is the work — design

**2026-09-07.** Design spec, approved in conversation with Josh before implementation.
Two steps, two releases. Step 1 restructures the gallery so that the `images/{imageId}`
record holds everything a member says about a picture and the profile's `gallery` array holds
only the order. Step 2 adds per-image tags on that record and lets the community wall filter
by them.

This is the endpoint `documentation/20260903-gallery-rules-budget.md` named as "the real
fix". It is being done now because prod holds zero galleries and dev holds sixteen curated
ones, so the migration is cheap today and stops being cheap with the first real upload.

## Why

- **The bug that started it.** The community tag dropdown offers every member's tags, but
  both galleries show artwork only, so a tag whose members have no images empties the view.
  The bounded fix (dropdown counts per view) is in its own worktree,
  `fix/community-tag-dropdown-artwork-counts`. The deeper answer — a work is not its maker,
  so the wall should filter by what the *picture* is about — needs tags on images.
- **Where image tags can live.** Not in the profile's gallery array: the array is validated
  up to eight times per save and already blew the rules evaluation budget once. On the
  record, then. But a record-only field beside an array that still carries captions and
  links gives every work two homes with different failure modes. So: make the record the
  only home.

Decisions taken (Josh, 2026-09-07): spread and Index filter by **member** tags; the Grid
(wall) filters by **image tags only**; image tags come from the **same curated `tags`
registry** as profile tags; **two releases**, restructure first.

## Step 1 — the restructure

### Data model

```jsonc
// publicProfiles/{uid}  and  users/{uid}
{ "gallery": ["a1b2c3", "d4e5f6"] }          // image ids, in display order, ≤ 8

// images/{imageId}
{
  "ownerUid": "{uid}", "kind": "gallery",
  "storagePath": "users/{uid}/gallery/a1b2c3.webp",   // the URL is derived from this
  "width": 2400, "height": 1600, "color": "#6b4f2a",
  "caption": "…", "captionDe": "…", "description": "…", "descriptionDe": "…",
  "link": "nature.com/articles/…",                     // NEW on the record, ≤ 200
  "origin": "member", "status": "live",
  "createdAt": …, "updatedAt": …
}
```

Gone from the array: `url`, `width`, `height`, `color`, `caption`, `captionDe`,
`description`, `descriptionDe`, `descriptionShort`, `link`. The array is a list of strings.
A work is on the site when its id is in the owner's list **and** its record is `live`
**and** `ownerUid` matches the profile. A foreign id in a list is ignored, not rendered.

`users/{uid}` keeps its copy of the list, as today, so the public/private split is untouched.

### Rules (`firestore.rules`)

- `validGallery(value)`: `value is list && value.size() <= 8`, and each element
  `is string && size() <= 64`, written out per index like today (rules cannot loop). No
  `validGalleryItem` any more; `validStorageUrl` on the array goes with it, since no URL is
  stored there. The per-element check is one clause, so the eight-fold cost is trivial.
- `validImage`: `link` joins the allowlist with `string && size() <= 200`, once per record
  write. `descriptionShort` stays on the allowlist (records written during its one-day life)
  and is swept by `updateImageText` as today.
- Update rule unchanged: the owner may edit text, link and status.
- Deployed to **both** environments; see release order.
- Tests in `tests/rules/firestore.test.mjs`: an eight-id array saves on a full profile;
  a ninth is refused; an old-shape object element is refused; `link` on the record saves at
  200 and is refused at 201; the other-member's-id case is *accepted by rules* and
  documented as filtered by the reader.

### Client library (`src/lib/gallery.ts`, `src/lib/images.ts`)

- `GalleryItem` stays the **editor's in-memory model** — `imageId`, `url`, `width`,
  `height`, `color`, texts, `link`. Nothing in the editor's rendering, the upload queue, or
  the Preview tab's view model changes shape. Only persistence changes.
- New `loadGallery(uid, ids: unknown): Promise<GalleryItem[]>`: queries
  `images where ownerUid == uid && kind == 'gallery' && status == 'live'`, maps records to
  items (`url = publicStorageUrl(storagePath)`), orders by the id list, drops ids with no
  live record. Replaces `sanitizeGalleryItems` as the load path. Tolerates an old-shape
  element by taking its `imageId`, and takes `link` and the four texts from that element
  when the record lacks them — so a member who **saves** before the migration script has
  run carries their words forward instead of losing them. Only a Save does that: the words
  reach memory on load, and an array write on its own (`persistGalleryNow` — upload, remove,
  reorder) sends ids and no text. This tolerance is removed after both environments are
  migrated.
- `galleryIds(items)` → `string[]` is what every array write sends.
- `updateImageText` gains `link` (deleteField when blank). It is no longer best-effort:
  `syncGalleryText` becomes `saveGalleryRecords(items)` which runs `Promise.allSettled`, and
  **returns the failures** (imageId + reason) instead of warning and swallowing.
- `uploadGalleryImage` unchanged in contract; the returned item still has a URL for the
  editor, derived rather than read back.

### Editor (`src/components/ProfileForm.astro`)

- Load: `loadGallery(uid, data.gallery)` on both the private doc read and any reload.
- `persistGalleryNow` (upload landed, remove, move): writes `galleryIds(gallery)` to both
  docs, as it writes the array today.
- Save: records first, then profile. A failed record write is a **Save error**, named per
  image ("Could not save the text for image 2"), using the existing gallery error line and
  the `GalleryUploadError` mapping style. Saved is not reported while any record failed.
  Text typed for an image whose record is gone (swept, or not this member's) is dropped
  with the same message; the id leaves the list on the next array write.
- Preview tab: unchanged. It renders from the in-memory items.

### Build (`src/lib/membersBuild.ts`, `src/lib/memberView.ts`)

- `fetchDirectory` adds one query, `images where kind == 'gallery' && status == 'live'`,
  alongside profiles and slugs, and groups records by `ownerUid`. Two equality filters use
  Firestore's single-field index merge; no composite index is needed.
- `works(doc, records)` becomes a pure function: order by the id list, join by id, require
  `ownerUid == uid`, derive the URL from `storagePath` with the same tokenless form
  `stripStorageToken` produces today, so `getImage` fetches exactly the URLs it fetches now.
  Unit-tested in `tests/unit/`.
- `toMemberViewBase(uid, doc, records)`; callers pass the owner's records. `ProfileWork`
  keeps its shape and gains nothing in step 1.
- Failure: if the images query throws, the build fails loudly — the same as a profiles
  failure today, not a silent artwork-less site. (The existing `catch` that returns `[]`
  is kept for the whole directory; the images read sits inside the same `try`.)

### Functions (`functions/src/`)

- `types.ts`: `ImageDoc.link?: string`.
- `adminOps.ts`: the three places that read `item.imageId` out of a gallery array read the
  string directly (tolerating an object during the migration window). `removeImage` filters
  the list by id. `galleryCount` is `gallery.length`, unchanged.
- `lifecycle.ts`, `maintenance.ts`, `purge.ts`: unchanged — they already act on records by
  `ownerUid`.

### Scripts (`scripts/`)

- **New `migrate-gallery-to-ids.mjs`.** Dry-run by default, `--write` to apply, one
  environment at a time via the existing service-account convention. Per profile
  (`publicProfiles` and `users`): for each array element that is an object, ensure the
  record exists and is `live`; copy `link` onto the record; where the array's text and the
  record's text **differ, the array wins** — it is what the site displayed, and the record
  sync was best-effort. Then rewrite both arrays to ids, in order. Elements already strings
  are left alone, so the script is idempotent. It prints every change and every id it drops
  for lack of a live record.
- `seed-curated-galleries.mjs`: writes ids; the record already carries everything else.
- `check-integrity.mjs`: every id → a live record owned by that profile; both docs' lists
  equal; no text comparison left to make. The unreferenced-live check reads ids.
- `sync-prod-to-dev.mjs` / `sync-profiles-prod-to-dev.mjs`: copy the list as-is; no change
  expected, verified by reading them.

### Release order (each environment, dev first as rehearsal)

1. Deploy **rules, client and functions together** from the merged branch. Readers (build,
   editor load, admin ops) understand both shapes; writers write ids. From here a stale tab
   that saves the old shape is refused with `permission-denied` — fail-safe; a reload fixes
   it. There is **no self-migration on an array write**: `loadGallery` carries an
   array-only element's words into the tab's MEMORY, but `persistGalleryNow` (upload,
   remove, reorder) writes ids only — only a **Save** writes those words onto the records.
2. Run `migrate-gallery-to-ids.mjs --write` for everyone who has not — **immediately after
   the deploy, before anyone opens `/profile`**. An array write before a Save in that window
   stores the id list while the array-only words are still waiting unsaved in the member's
   tab, so the array copy the migration reads its words from is already gone. Run
   `check-integrity.mjs`.
3. Rebuild the site. Verify the community wall, a member page, the editor round trip
   (upload, caption, link, reorder, remove, Save) and the Preview tab.
4. Prod: same three steps. Prod has no galleries, so step 2 is a no-op that still gets run.
5. Once both environments pass `check-integrity.mjs`, remove the old-shape tolerance from
   the readers in a follow-up commit.

The rules deploy replaces the deployed ruleset wholesale — deploy from the merged branch,
not a stale one (see the `storage.rules` memory).

## Step 2 — image tags

### Data model and rules

- `images/{imageId}.tags?: string[]`, ≤ 5 labels, each ≤ 50 characters (the registry's
  own cap). One clause in `validImage`. Stored as typed, matched case-insensitively like
  member tags.
- `functions/src/types.ts` mirrors it. No function logic changes.

### Editor

- One `<tag-selector>` per gallery row, `maxTags=5`, inside the row's fields below the
  link. Same element, same registry, same free-typing behaviour as the profile's selector
  (a new label is added to the registry through `getOrCreateTag`, exactly as on profiles).
- Tags save with the row's text through `saveGalleryRecords`.

### Build and community page

- `ProfileWork.tags: string[]`, from the record, in `works()`.
- `CommunityGrid.astro`: wall tiles carry `data-tags` of the **work**; spread cards and
  Index rows keep the member's. The dropdown gets a third count — works carrying the tag —
  shown in Grid view, extending the two-count mechanism from the dropdown fix. Options with
  zero count in the active view are hidden, as that fix does.
- `?tag=` deep links into `pattern=grid` match on image tags; the member-page tag chips
  still go to the spread (`TAG_CHIP_VIEW`), which filters by member tags, so they keep
  working unchanged.
- No display of image tags on tiles, lightbox or member page in this step.

### Dependency

Step 2 edits the dropdown code that `fix/community-tag-dropdown-artwork-counts` is
changing. Merge that fix first, then build step 2 on it.

## Out of scope

- Moving `images/{imageId}` under the member (a subcollection). The flat collection is
  what the sweeper, lifecycle and admin queries are built on; nothing here needs to move it.
- Tag display on works, tag-based ordering, and any change to the Index or spread filters.
- A grace window where rules accept both array shapes. Fail-safe refusal is the cheaper
  and more honest behaviour for a window measured in minutes.

## Verification

- `npm run test:rules` and `npm run test:unit` green, with the new cases above.
- `npm run build` in development mode against dev data renders the same community wall
  and member pages as before step 1 (spot-check three members, one curated, in both
  locales).
- Editor round trip on dev as a signed-in member, including a forced record failure
  (rules denial via a too-long link) that must surface as a Save error, not "Saved".
- `check-integrity.mjs` clean on dev after migration, and on prod after its migration.
- The editor round trip on dev — upload, caption, link, reorder, remove, Save, and a forced
  201-character link that must surface as a Save error rather than "Saved" — is a
  **post-merge gate**: it needs the dev rules deploy first, so it cannot be run from an
  unmerged worktree.
