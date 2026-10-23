# Work carousels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can group several works of one project into a carousel that shows as one spot in the project's inline flow, edited through a tray and paged like the Portfolios card.

**Architecture:** One optional image-record field, `carouselId`. A run of consecutive works in a project that share it is a carousel. The lead slide's `size` / `textAfter` / `textAfterDe` are the carousel's. All grouping and every editor move are pure functions in two new modules (`carousels.ts`, `carouselEditor.ts`) that are unit-tested. The DOM layers (member page, editor preview, editor) only render units. The community card's scroll-snap engine is generalised to data-attribute hooks and reused.

**Tech Stack:** Astro 5, TypeScript, Firebase (Firestore rules, Functions), node:test, PhotoSwipe.

**Spec:** `documentation/20261023-work-carousels-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Work in `D:/SynoDrive/VSCN/wt-feat-work-carousels` (branch `feat/work-carousels`). Never touch `repo/`. Never `git switch` anywhere.
- `carouselId`: a string of 1–64 characters, optional, the same shape as `projectId`. An absent field means "not in a carousel".
- Page grouping: a run of **≥ 2** consecutive works with the same `carouselId` in one project is a carousel. Editor grouping: a run of **≥ 1**.
- Carousel settings: each of `size`, `textAfter` and `textAfterDe` is taken from the **first slide in the run that carries it**. Save moves them onto the first slide and clears them from the others.
- Slide sizes: the S/M/L widths from `src/lib/workSize.ts` and a height cap of 70vh, both computed from the **lead slide's** aspect ratio. Other slides are centred in that frame, never cropped.
- Type: every new text element joins its voice in `src/styles/type.css`. Component CSS sets layout and colour only.
- Every new round element joins the square-reset `:not()` list in `global.css`. `.cdot` is already in it.
- i18n: every new string goes into **both** `en` and `de` in `src/i18n/translations.ts`.
- `npm run lint` must stay at 0 warnings. Never run `npm run format`.
- Client scripts initialise on `astro:page-load` and tear down on `astro:before-swap`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A video work as a slide.** Its poster and play badge show in the carousel, and the lightbox plays it. Pinned in Task 5's browser step.
2. **A portrait slide after a landscape lead.** The frame height does not change while paging and nothing below it moves. Pinned in Task 5: measure `.mprof__text`'s top before and after paging.
3. **A carousel as the very first item on a member page.** Paint-in waits on the lead image and the lead image loads eagerly. Pinned in Task 5 (`profilePaint.test.mjs` case).
4. **Replacing a slide's picture.** The new record keeps `carouselId` (`WORK_TEXT_FIELDS`). Pinned in Task 2.
5. **Deleting the lead slide before Save.** The carousel keeps its text and size. Pinned in Task 3 (`handOffLead` test) and Task 7 (the removal path calls it).

---

### Task 1: Pure grouping module

**Files:**
- Create: `src/lib/carousels.ts`
- Test: `tests/unit/carousels.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const CAROUSEL_LEAD_FIELDS = ["size", "textAfter", "textAfterDe"] as const;
  export interface CarouselFields { carouselId?: string; size?: string; textAfter?: string; textAfterDe?: string }
  export type WorkUnit<W> = { kind: "work"; work: W } | { kind: "carousel"; carouselId: string; works: W[] };
  export function groupCarousels<W extends { carouselId?: string }>(works: readonly W[], minRun: 1 | 2): WorkUnit<W>[];
  export function carouselSettings<W extends CarouselFields>(slides: readonly W[]): Pick<CarouselFields, "size" | "textAfter" | "textAfterDe">;
  export function normaliseLeads<W extends CarouselFields>(items: readonly W[]): W[];
  ```
  The callers pass **one project's works** to `groupCarousels`. `normaliseLeads` takes the whole gallery array and groups per contiguous `carouselId` run (with `minRun` 1).

- [ ] **Step 1: Write the failing tests** in `tests/unit/carousels.test.mjs`, in the style of `tests/unit/projects.test.mjs`:
  - `groupCarousels` with minRun 2:
    - `[a, b{c1}, c{c1}, d]` → `work a, carousel c1 [b, c], work d`.
    - `[a{c1}]` → `work a`.
    - `[a{c1}, b, c{c1}]` → three works.
    - `[a{c1}, b{c1}, c{c2}, d{c2}]` → two carousels.
  - `groupCarousels` with minRun 1: `[a{c1}]` → `carousel c1 [a]`. `[a{c1}, b, c{c1}]` → carousel, work, carousel (two separate runs, both c1).
  - `carouselSettings`:
    - `[{}, {size:"s", textAfter:"T"}, {size:"m"}]` → `{size:"s", textAfter:"T"}`.
    - The result has no `textAfterDe` key at all when no slide carries one.
  - `normaliseLeads`:
    - `[x, a{c1}, b{c1, size:"s", textAfter:"T"}]` → a gets `size:"s"` and `textAfter:"T"`, b has neither key, and x is unchanged.
    - Works with no `carouselId` keep their own `size`/`textAfter`.
    - A run of one keeps its fields.
    - It never mutates its input.

- [ ] **Step 2: Run the tests to verify they fail**
  Run: `node --test tests/unit/carousels.test.mjs`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement the four exports** in `src/lib/carousels.ts`. Give the file a header comment in the house style: date, Josh's words, and a pointer to the spec. Make "the first slide carrying the field wins" an explicit loop over `CAROUSEL_LEAD_FIELDS`.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `node --test tests/unit/carousels.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit** with `feat(carousels): pure grouping and lead-field rules`.

---

### Task 2: `carouselId` through rules, records, export and view models

**Files:**
- Modify: `firestore.rules`:
  - the image update `affectedKeys().hasOnly` list (≈126-148)
  - the `validImage` keys `hasOnly` (≈425) and a type/size check beside `projectId` (≈468)
- Test: `tests/rules/firestore.test.mjs`, next to the textAfter cases (≈895)
- Modify: `functions/src/types.ts` (`ImageDoc`) and `functions/src/uploads.ts` (`WORK_TEXT_FIELDS`, ≈93)
- Modify: `scripts/export-site-data.mjs` (`imageKeys`, ≈29)
- Modify: `src/lib/galleryRecords.ts` (`GalleryRecord`, `orderedGalleryItems`), `src/lib/gallery.ts` (`GalleryItem`, `saveGalleryRecords`), `src/lib/images.ts` (`updateImageText`: an empty value becomes `deleteField()`)
- Modify: `src/lib/draftMerge.ts` (`workWords` / `sameWords`). Add `carouselId`, and also the missing `textAfter`, `textAfterDe`, `size` and `inGallery`.
- Modify: `src/lib/profileView.ts` (`ProfileWork.carouselId?: string`) and `src/lib/memberView.ts` (`works()` passes `carouselId` through, trimmed, dropping it when empty)
- Test: `tests/unit/galleryRecords.test.mjs`, `tests/unit/draftMerge.test.mjs`, `tests/unit/memberView.test.mjs`, and the existing Functions test for replacement inheritance if there is one. If there isn't, add a case to the closest `tests/functions/*.test.cjs` that covers `inheritedFields`.

**Interfaces:**
- Produces: `carouselId?: string` on `GalleryRecord`, `GalleryItem`, `ProfileWork` and `ImageDoc`. `updateImageText(id, fields)` accepts `carouselId`.

- [ ] **Step 1: Write the failing rules tests:**
  - An owner update `{ carouselId: "c-1", updatedAt }` succeeds.
  - `"x".repeat(64)` succeeds and `"x".repeat(65)` fails.
  - `""` fails.
  - `["a"]` fails.
  - `deleteField()` succeeds.
  - Creating a record with `carouselId` passes `validImage`.
- [ ] **Step 2: Write the failing unit tests:**
  - `orderedGalleryItems` carries `carouselId` from the record.
  - `memberView` `works()` exposes `carouselId` and drops a blank one.
  - `draftMerge` treats two works that differ only in `carouselId`, `size`, `textAfter` or `inGallery` as different.
  - The Functions replacement test: the new record inherits `carouselId`.
- [ ] **Step 3: Run them and see them fail.**
  Run: `npm run test:unit` and `npm run test:rules`
  Expected: the new cases FAIL.
- [ ] **Step 4: Implement the touchpoints listed under Files.**
- [ ] **Step 5: Run the tests to see them pass.**
  Run: `npm run test:unit`, `npm run test:rules` and `npm --prefix functions run build`
  Expected: PASS, and tsc clean.
- [ ] **Step 6: Commit** with `feat(carousels): carouselId on the image record, end to end`.

---

### Task 3: Editor operations (pure)

**Files:**
- Create: `src/lib/carouselEditor.ts`
- Test: `tests/unit/carouselEditor.test.mjs`

**Interfaces:**
- Consumes: `groupCarousels`, `CAROUSEL_LEAD_FIELDS` and `normaliseLeads` (Task 1).
- Produces. Every function works on the **gallery array** `T extends { projectId?: string; carouselId?: string; size?: string; textAfter?: string; textAfterDe?: string }` and returns a new array, or `null` when nothing would change. An index is a gallery index. Grouping is per project with minRun 1.
  ```ts
  export function moveWork<T>(gallery: readonly T[], index: number, delta: -1 | 1): T[] | null;
  export function moveCarousel<T>(gallery: readonly T[], carouselId: string, delta: -1 | 1): T[] | null;
  export function joinCarousel<T>(gallery: readonly T[], index: number, target: { carouselId: string; projectId: string }, position?: number): T[];
  export function takeOut<T>(gallery: readonly T[], index: number): T[];
  export function dissolve<T>(gallery: readonly T[], carouselId: string): T[];
  export function moveCarouselToProject<T>(gallery: readonly T[], carouselId: string, projectId: string): T[];
  export function handOffLead<T>(gallery: readonly T[], index: number): { gallery: T[]; heir?: number };
  export function projectCarouselIds<T>(gallery: readonly T[], projectId: string, local: readonly { carouselId: string; projectId: string }[]): string[];
  ```
  What each one does:
  - **`moveWork`:** a work outside a carousel steps over the whole neighbouring unit (a carousel moves as one). A slide swaps only with its sibling slide (this is the ← → in the tray). It returns null at a project's edge or a carousel's edge.
  - **`joinCarousel`:** gives the work the carousel's id and project, and moves it into the run at `position` (default: the end).
    - If the carousel has no slides yet and the work is already in that project, it keeps its place.
    - Otherwise, with no slides, it moves to the end of that project.
    - When the work arrives from another carousel, it first leaves that one.
  - **`takeOut`:** clears the work's `carouselId` and places it directly after the last remaining slide of its run.
  - **`dissolve`:** clears the id from every slide and keeps their order.
  - **`moveCarouselToProject`:** sets the target project's id on every slide and moves the run, kept together, to the end of that project.
  - **`handOffLead`:** when `index` is the run's first slide and a second slide exists, copies the lead fields (via `carouselSettings`) onto the second slide. `heir` is that slide's gallery index, so the caller can write it to the record at once. Otherwise it returns the gallery unchanged and no heir.
  - **`projectCarouselIds`:** the carousel ids of that project in display order, with the local empty carousels of that project appended. It drives "Carousel 1", "Carousel 2" labels.

- [ ] **Step 1: Write the failing tests.** One `test()` per function, plus:
  - `moveWork` stepping a lone work over a 3-slide carousel in one press, both directions.
  - `moveWork` on the first slide with delta -1 → null.
  - `joinCarousel` at position 0 makes the work the lead, and `normaliseLeads` afterwards moves the old lead's fields onto it.
  - `takeOut` of the middle slide lands after the last slide.
  - `handOffLead` on a run of one → no heir.
  - `handOffLead` on the lead with `textAfterDe` only → the heir gets `textAfterDe` only.
  - None of the functions mutates its input.
- [ ] **Step 2: Run to see them fail.**
  Run: `node --test tests/unit/carouselEditor.test.mjs`
  Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/carouselEditor.ts`, with a header comment matching `projectEditor.ts`'s ("every decision is a pure function; the controller holds only DOM glue").
- [ ] **Step 4: Run to see them pass.**
  Run: `node --test tests/unit/carouselEditor.test.mjs tests/unit/projectEditor.test.mjs`
  Expected: PASS.
- [ ] **Step 5: Commit** with `feat(carousels): editor moves as pure functions`.

---

### Task 4: Generalise the carousel engine to data hooks

**Files:**
- Modify: `src/lib/communityCarousel.ts`: the selectors `.ccard__track`, `.ccard__slide`, `.ccard__img` and `.ccard__dots`, and `closest(".ccard")`.
- Modify: `src/components/community/CommunityImageCard.astro` and the card renderer in `src/lib/profilePreview.ts`. Add the hook attributes beside the existing classes, and keep the classes for CSS.
- Modify: the comments in `src/lib/carouselDots.ts:5`, `src/lib/pager.ts` (header) and `src/lib/lightboxText.ts:265` that still mention `projectCarousel.ts`.

**Interfaces:**
- Produces this DOM contract, which Tasks 5 and 6 render:
  - `[data-carousel]` on the frame, unchanged.
  - `[data-carousel-track]` on the scroller.
  - `[data-carousel-slide]` on each slide.
  - `[data-carousel-img]` on each slide's lazy image.
  - `[data-carousel-dots]` on the dot row, holding `.cdot` buttons.
  - `[data-carousel-scope]` on the ancestor that holds the frame and the dots (the dots are looked up through `closest("[data-carousel-scope]") ?? carousel`).
  - `[data-carousel-prev]`, `[data-carousel-next]` and `[data-carousel-live]`, unchanged.
  - The events `vscn:carousel-show` and `vscn:carousel-step`, unchanged.
  - `initCarousels(root)` is unchanged.

- [ ] **Step 1: Swap the selectors** in the engine and add the attributes to both renderers. Behaviour must be identical.
- [ ] **Step 2: Run the gates.**
  Run: `npm run lint && npm run check && npm run test:unit`
  Expected: PASS, with 0 lint warnings.
- [ ] **Step 3: Check the community card in a browser.** Run `astro dev` in the worktree; see the project's notes on snapshots and modes (`local-dev-service-account-key-dead`: use a fresh PROD export with `--mode production`). On /community, at 1280 and at 375 (Playwright):
  - the Portfolios card pages by arrow, dot, ← → and swipe;
  - the lightbox opens on the clicked slide, and closing it returns to the slide it ended on.
  Report anything that differs from before.
- [ ] **Step 4: Commit** with `refactor(carousel): engine reads data hooks, not card classes`.

---

### Task 5: The carousel on the member page

**Files:**
- Create: `src/components/MemberCarousel.astro`
- Modify: `src/components/MemberProject.astro`: map `groupCarousels(works, 2)` units to `MemberWork` or `MemberCarousel`.
- Modify: `src/styles/profile.css` (carousel layout), `src/styles/type.css` (any new text element joins CAPTION / META), and `src/styles/global.css` (only if a new round element appears).
- Modify: `src/lib/lightbox.ts`. On the member page's lightbox `change`/`close`, if the slide element sits inside `[data-carousel]`, dispatch `vscn:carousel-show` on it the way `bindCardOpener` does (≈314). Keep the flat `children: ".mprof__work-link"` set.
- Create: `src/lib/carouselKeys.ts`, with a pure `nearestToMiddle(rects: readonly { top: number; bottom: number }[], viewportTop: number, viewportBottom: number): number` (−1 when none overlaps) and the `astro:page-load` binding: ← → with no modifier, not typing, nothing focused inside a carousel → `vscn:carousel-step` to the nearest carousel. Scroller: `.page-wrap` on desktop, the document on a phone (CLAUDE.md "Layout and scrolling").
- Modify: `src/lib/profilePaint.ts` `preparePaint`, so a carousel first in the works treats the lead slide's `.mprof__img` as the picture. Modify `src/lib/profileIndex.ts`, so a carousel is one entry, labelled with the lead slide's title.
- Modify: `src/pages/[...lang]/members/[slug].astro`, only if a unit needs data it does not yet get (each work already has `rendered`, `slide`, `textAfter` and `size`).
- Test: `tests/unit/carouselKeys.test.mjs` (`nearestToMiddle`) and `tests/unit/profilePaint.test.mjs` (a new case: the first works child is a carousel → the lead image is the picture).

**Interfaces:**
- Consumes: `groupCarousels` and `carouselSettings` (Task 1), the DOM contract (Task 4), `workSizeWidth` (`workSize.ts`), `carouselDots.ts`, `pager.ts`.
- Produces the `MemberCarousel` markup that Task 6 mirrors:
  - `figure.mprof__work.mprof__carousel` with `--work-ar` = the lead's aspect ratio and `--size-w` from the carousel's size, plus `data-carousel-scope`.
  - Inside it, `[data-carousel]`, which holds:
    - `[data-carousel-track]`;
    - one `a.mprof__work-link[data-carousel-slide]` per slide, with the full `data-pswp-*` set that `MemberWork` uses (embed attributes included) and an `img.mprof__img[data-carousel-img]` (the lead eager when it is the page's first work, the rest `data-src`);
    - `[data-carousel-prev]` and `[data-carousel-next]` strips outside the frame's edges;
    - `[data-carousel-live]`.
  - Then `[data-carousel-dots]`.
  - Then one `.mprof__caption` per slide (`data-slide-caption="i"`), with only the showing one visible and a cross-fade on the site ease-out.
  - Then `.mprof__text` from `carouselSettings(...).textAfter*`.
  - Desktop arrows: the Portfolios card's strip (memory `works-paging-desktop`: a 2.5rem strip, `--prev { right: 100% }`, `--next { left: 100% }`, opacity .35 → .55 on frame hover → 1 on its own hover). Phone: no arrows.

- [ ] **Step 1: Write the failing tests:**
  - `nearestToMiddle`: picks the rect that overlaps the middle; on a tie, the earlier one; −1 when nothing is visible.
  - `profilePaint`: the lead image is chosen for a carousel first.
- [ ] **Step 2: Run them and see them fail.**
  Run: `node --test tests/unit/carouselKeys.test.mjs tests/unit/profilePaint.test.mjs`
- [ ] **Step 3: Implement** the component, the CSS, the lightbox sync, the keys module, paint-in and the index.
- [ ] **Step 4: Run to see them pass, then run the gates.**
  Run: `npm run lint && npm run check && npm run test:unit`
  Expected: PASS.
- [ ] **Step 5: Check it in a browser.** Give a seeded member a carousel in the local snapshot. Edit `.site-data.json` by hand: set the same `carouselId` on three consecutive works of one project, ideally one landscape lead, one portrait slide and one video, and re-stamp `generatedAt`. At 1280 and at 375, check:
  - arrows beside the frame on desktop only;
  - dots that page;
  - ← → paging the visible carousel;
  - captions that follow the slide;
  - `.mprof__text`'s top identical before and after paging to the portrait slide (Review Focus 2);
  - the video slide playing in the lightbox (Review Focus 1);
  - the lightbox opening on the clicked slide, and closing back onto the slide it ended on;
  - with the carousel first on the page, paint-in still running (Review Focus 3).
  Save screenshots under `D:/SynoDrive/VSCN/.playwright-mcp`.
- [ ] **Step 6: Commit** with `feat(carousels): member page carousel`.

---

### Task 6: Editor preview mirrors the page

**Files:**
- Modify: `src/lib/profilePreview.ts` (the works renderer near `groupWorks`, ≈335). Within each project section, render the `groupCarousels(works, 2)` units. A carousel uses the same markup as Task 5, built from the preview's templates. Call `initCarousels` after `show(works)` and skip a zero-width box (the trap in memory `project-work-carousels`: measuring a hidden box).
- Modify: `src/components/profile/ProfileViewPreview.astro` (or wherever the preview's `<template>`s live), adding a `data-ppv-tpl="carousel"` template.
- Modify: the controller's preview mapping (`profileEditorController.ts` ≈2021-2051), which passes `carouselId`.

**Interfaces:**
- Consumes: Task 1, the Task 4 contract and the Task 5 markup.

- [ ] **Step 1: Implement it.**
- [ ] **Step 2: Run the gates.**
  Run: `npm run lint && npm run check && npm run test:unit`
  Expected: PASS.
- [ ] **Step 3: Check it in a browser.** On `/styleguide/editor/de`, seed the harness gallery by hand with three works that share a `carouselId`, then switch to Preview. The carousel pages there and matches the member page.
- [ ] **Step 4: Commit** with `feat(carousels): editor preview renders carousels`.

---

### Task 7: The editor tray

**Files:**
- Modify: `src/components/profile/WorkEditor.astro`. Add a `<template data-gallery-tpl="carousel">` containing:
  - a tool row with ↑ ↓, dissolve ✕, an S/M/L `.seg` and a project select;
  - a label "Carousel · N works";
  - `.gallery-tray`, holding thumbnail buttons and the **+** slot (a file input label);
  - `[data-carousel-slide-row]`, where the selected slide's row goes;
  - the carousel's text-after textareas (EN/DE by the stage's `data-lang`).
- Modify: `src/components/profile/ProjectEditor.astro`. Add the **Carousel** control beside the project's own image/video add controls.
- Modify: `src/lib/profileEditorController.ts`:
  - `renderGallery`/`buildBlock`: within a project block, render `groupCarousels(projectItems, 1)` units. A run unit becomes the carousel template, with the selected slide built by the existing `buildRow` in **slide mode**. In slide mode:
    - the size segment and text-after are hidden;
    - ↑ ↓ act as ← → and call `moveWork`;
    - a **Take out** button calls `takeOut`.
  - Empty local carousels `{ carouselId, projectId }[]` render at the end of their project. They are created with `crypto.randomUUID()` and dropped once they have no slides and are not selected.
  - Selection state is a `Map<carouselId, imageId>`, UI only. The first slide is the default.
  - Single-work ↑ ↓ use `moveWork`, the carousel's ↑ ↓ use `moveCarousel`, and the carousel's project select uses `moveCarouselToProject`. Persist the order as reorders do today (`persistGalleryNow`).
  - The work project select gets an `<optgroup>` listing `projectCarouselIds(...)` as "Carousel 1…" → `joinCarousel`. On a slide it also offers "Not in a carousel" → `takeOut`.
  - Drag (desktop pointer only):
    - a work row's picture dropped on a tray → `joinCarousel` at the drop position;
    - a thumbnail dragged within its tray → `joinCarousel` with the new position;
    - a thumbnail dragged out onto the project line → `takeOut`;
    - show a visible drop indicator.
  - The tray's **+** → `addGalleryFiles(files, { projectId, carouselId })`, which must carry `carouselId` onto the uploaded item. It is disabled at `galleryLimit` with the existing message. Drops of existing works are never capped.
  - Dissolve ✕ → `dissolve`. No confirmation is needed, since nothing is deleted.
  - Removal: before a slide's removal persists, call `handOffLead` and, when there is an heir, `updateImageText(heirId, leadFields)` at once (Review Focus 5).
  - Save: run `normaliseLeads(gallery)` before `persistWorkMetadata`, so `saveGalleryRecords` writes the moved lead fields and the cleared ones.
- Modify: `src/styles/profile-editor.css` for the tray, the thumbnails, the selection outline, the drop indicator and the dashed + slot. These are square surfaces. The `.seg` and pills stay as they are.
- Modify: `src/i18n/translations.ts`, en and de, for:
  - "Carousel" / "Karussell";
  - "Carousel · {n} works" / "Karussell · {n} Arbeiten";
  - "Carousel {n}" / "Karussell {n}";
  - "Take out" / "Herausnehmen";
  - "Not in a carousel" / "In keinem Karussell";
  - "Dissolve carousel" / "Karussell auflösen";
  - "Add pictures to this carousel" / "Bilder zu diesem Karussell hinzufügen";
  - "Slide {i} of {n} in carousel {k}" / "Bild {i} von {n} in Karussell {k}".

**Interfaces:**
- Consumes: all of Task 3, Task 1's `groupCarousels` / `normaliseLeads`, and Task 2's `carouselId` on `GalleryItem` and `updateImageText`.

- [ ] **Step 1: Implement the template, the controller wiring, the CSS and the strings.**
- [ ] **Step 2: Run the gates.**
  Run: `npm run lint && npm run check && npm run test:unit`
  Expected: PASS, with 0 lint warnings.
- [ ] **Step 3: Check it in a browser.** Use the `/styleguide/editor/de` harness, seeded by hand (the controller may need the route-abort trick from memory `works-tab-edit-mode`). At 1280:
  - add a carousel;
  - drag two works in;
  - reorder the thumbnails;
  - select a slide and edit its title;
  - Take out;
  - dissolve.
  At 375, join through the dropdown. Report whatever the harness cannot drive (Save and upload need a session), so it is walked on the dev host after the merge.
- [ ] **Step 4: Commit** with `feat(carousels): editor tray`.

---

### Task 8: Gates, build, merge to dev

- [ ] **Step 1:** Run `npm run verify` (it needs Java for the emulators). Expected: everything green.
- [ ] **Step 2:** Run `npx astro build --mode development` against a fresh dev snapshot. If the dev key is dead (memory `local-dev-service-account-key-dead`), build `--mode production` against a fresh prod export instead, and say so.
- [ ] **Step 3:** Merge into `dev` the way the project's memory notes describe: no PR, a detached worktree at `origin/dev`, `merge --no-ff`, gates re-run on the merge tree, and a push of `HEAD:refs/heads/dev`. Watch the staging deploy, and read its exit code.
- [ ] **Step 4:** Do a signed-in walk on the dev host:
  1. Build a carousel by drag and by dropdown.
  2. Upload through +.
  3. Reorder, Take out and dissolve.
  4. Delete the lead.
  5. Save, then confirm the rebuilt member page shows the carousel.
