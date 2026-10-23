# Work carousels inside projects — design

2026-10-23. Josh: "yes i want it back but rebuild it from scratch according to the design we have
going on now". The old carousel made a whole project into one carousel (PR #115, 2026-09-26). It was
removed on 2026-10-16 when projects began showing their works in line, with text blocks between
them (`documentation/20261016-carousel-count-design.md`, memory note `project-text-blocks-inline`).
This design brings carousels back as one item inside a project's line, not as the whole project.

## Intent

A member wants several pictures to share one spot in a project, such as a series, details of one
piece or before and after. A visitor scrolling a project passes a single work, a text block,
another work, and then one spot holding several pictures to swipe through. Each picture in it stays
a full work with its own title and caption (Josh: "it can have mutiple image captions").

## Goals

- A carousel is **a group of existing works** in one project, shown as one spot in that project's
  line.
- Every slide keeps its own title, descriptions, tags, links, Image details, In-gallery switch and
  lightbox entry, exactly as a single work does.
- The editor makes one with **Carousel** and **drag works in** (Josh's words). Every action also
  works on a phone without dragging.
- On the page it pages the same way the Portfolios card does since today (`works-paging-desktop`):
  the arrows sit beside the picture on desktop, the dots are buttons, and a phone swipes.

## Non-goals

- A carousel has no title or description of its own. The words under it are the showing slide's.
- No carousels inside carousels, and no carousel that spans two projects.
- Nothing changes on /community. The Portfolios card, Images view, Grid and search keep treating
  every slide as an ordinary work.
- The 12-work cap stays. Every slide counts toward it.

## Anti-goals (a failure even if it works)

- A data shape that makes any existing reader (Images view, Grid, lightbox, export, community card)
  have to learn about carousels in order to keep working.
- Text under the carousel jumping up and down as you page.
- A carousel that can only be built with a mouse.
- Anything that looks different from the site's current paging: the dots, the arrows beside the
  picture, the S/M/L sizes and the 70vh cap.

## Decided with Josh

1. **Group of works, not one work with several pictures.**
2. **Captions per slide.** Each slide's title and description show under the carousel and follow
   the paging.
3. **Editing view = the tray (option A of the mockups).** In Edit mode a carousel opens out into a
   dashed tray of thumbnails with a **+** slot at the end. Clicking a thumbnail selects that slide
   and shows it underneath at its page size, with its own inline title, description and fold, like
   any work row today.
4. **Editor behaviour, as played back and accepted:**
   - **Carousel** adds an empty carousel at the end of the current project.
   - Works are dragged from the project onto the tray. Thumbnails can be dragged within the tray to
     reorder, and the selected slide also has ← →.
   - Each carousel also appears in every work's project dropdown, so a phone can move a work into
     it without dragging.
   - The tray's **+** uploads new pictures straight into the carousel.
   - **Take out** on a slide puts that work back in the project's line, directly after the
     carousel.
   - The carousel's own **✕** dissolves it. Its works return to the line in slide order and no
     picture is deleted.
   - The carousel is one unit in its project: ↑ ↓ move it as a whole. It has one S/M/L size and one
     text block after it.
   - A carousel with only one work left prints as an ordinary work.
5. **Visitor side, as played back and accepted:**
   - Desktop: ‹ › arrows just outside the picture's left and right edges (the Portfolios card's
     strips), Instagram dot buttons centred under the picture, and keyboard ← → for the carousel on
     screen when nothing is focused.
   - Phone: swipe with dots and no arrows. Vertical scroll wins unless the gesture is clearly
     sideways.
   - The showing slide's title and description sit under the dots and cross-fade as it pages. The
     carousel's text block comes after them and does not move.
   - **The frame keeps the first slide's height.** Slides with another shape are centred in it,
     never cropped, so nothing below the frame moves.
   - Lightbox: clicking a slide opens the lightbox at that picture. The lightbox pages through all
     the member's works in page order, slides included. Closing it leaves the carousel on the slide
     the lightbox ended on.
   - Entrance: the existing picture zoom-in (`--pic-in-*`) and profile paint-in, applied to the
     carousel as one piece.

## Data model (builder's call, recorded here)

**One new optional field on the image record: `carouselId`** (a string of 1–64 characters, same as
`projectId`). Works in the same project that share a `carouselId` **and sit next to each other** in
the profile's `gallery` order form one carousel, and their order in `gallery` is the slide order.
Nothing else is stored: no carousel document and no change to the profile shape. That keeps the
`gallery` array at ids only, as the rules budget requires (firestore.rules:322-336).

The carousel's own settings live on its **first slide's record (the lead)**:
- `size` → the carousel's S/M/L.
- `textAfter` / `textAfterDe` → the text block after the carousel.

The other slides store no `size` or `textAfter`, and the editor clears them when a work joins.
Whenever the lead changes (reorder, Take out, deletion of the lead), the editor moves these fields
onto the new lead before Save. A work that is taken out leaves those fields behind with the
carousel. The carousel's text stays with the carousel.

**The page is published before Save (decided after the builder check).** The `gallery` order is
written at once and every profile or image write queues a rebuild, so the public page can show a
reordered carousel whose membership and lead fields are not saved yet. That can last for good if the
member never saves. Two rules keep that window harmless:

- **Readers take the carousel's settings from the first slide in the run that carries them**, not
  strictly from the first slide. A reordered tray therefore keeps its size and text before Save.
  At Save the editor still moves them onto the actual first slide and clears them from the others.
- **Deleting the lead moves its carousel fields at once.** Removal commits without Save, so the
  removal path writes `size` / `textAfter` / `textAfterDe` onto the next slide's record (one
  `updateImageText`) before marking the old record. The carousel's text can never be lost.
- **Take out before Save shows the work still inside the carousel on the page.** That is accepted:
  it is the same window a project move has today (`projectId` is also written at Save).

**The page and the editor group differently.** On the page, a carousel is a run of **two or more
consecutive** works in one project with the same `carouselId`, and a run of one prints as a plain
work. **The editor shows any run, including a run of one, as a tray**, because every carousel
passes through one work while it is being built. A one-work carousel therefore survives Save and a
reload as a tray, and keeps its `carouselId`. Only dissolve ✕, or Take out of the last slide,
removes it. One pure function with a `minRun` parameter serves both.

**The cap applies only to the tray's + upload.** Dragging an existing work into a carousel adds no
work, so it is never refused. If the ids ever come out
non-contiguous through a merge, each run is its own carousel and nothing fails. Write the grouping
as one pure function next to `groupWorks()` in `src/lib/projects.ts`, unit-tested, and use it in
the member page, the editor preview and the editor.

An empty carousel (zero works) is local only, the same as a new empty project today. It gets a random UUID and
is stored only once a work names it. A carousel with zero works is gone after a reload, and that is
accepted.

### Touchpoints for `carouselId`

These follow the `textAfter` / `size` path (memory note `project-text-blocks-inline`):

- `firestore.rules`: the image update `affectedKeys().hasOnly` list (≈:126-148) and the
  `validImage` keys `hasOnly` (≈:425), plus the type and length check next to `projectId` (≈:468).
  Add emulator tests in `tests/rules/` for a valid id, an over-long id, a non-string, and a
  deletion.
- `functions/src/types.ts` `ImageDoc`, and `WORK_TEXT_FIELDS` in `functions/src/uploads.ts:93`, so
  that **Replace** keeps a slide in its carousel.
- `scripts/export-site-data.mjs` `imageKeys`.
- `src/lib/galleryRecords.ts` (`GalleryRecord`, `orderedGalleryItems`), `src/lib/gallery.ts`
  (`GalleryItem`, `saveGalleryRecords`), and `src/lib/images.ts` `updateImageText` (an empty value
  becomes `deleteField()`).
- `src/lib/draftMerge.ts` `workWords`/`sameWords`. This already misses `textAfter`, `size` and
  `inGallery`; add `carouselId` and close that gap in the same pass.
- `src/lib/profileView.ts` `ProfileWork`, `src/lib/memberView.ts` `works()`,
  `src/lib/profilePreview.ts` and the controller's preview mapping (≈:2021-2051).
- The rebuild fingerprint (`functions/src/rebuildQueue.ts`) hashes every image field already. No
  change is needed, but confirm that a carousel-only edit queues a rebuild.

**Release order:** the rules must reach an environment before or with the frontend that writes
`carouselId`, or the `hasOnly` trap silently rejects every Save that touches a slide. CI already
deploys rules before Hosting.

## Editor (builder's call within the decisions above)

- **Where "Carousel" lives.** The bar's Plus menu now holds only **New project**. Adding works is
  per project (each block's own image picker and video button). **Carousel goes with those per-
  project add controls**, so it is clear which project it lands in. This is my call, and it differs
  from the mockup, which showed it in the Plus menu.
- **The carousel block** renders inside the project's `[data-project-images]` in its place in the
  order:
  - Tool row: ↑ ↓, dissolve ✕, S/M/L and the project select. Moving a carousel to another project
    moves all its slides.
  - A muted label, "Carousel · N works".
  - The tray: thumbnails, the selected one outlined, then the **+** slot.
  - The selected slide, built with the existing `buildRow`. Its tool row loses S/M/L and its text-
    after field, because both belong to the carousel. ↑ ↓ become ← → and **Take out** is added.
    Replace, delete, In-gallery, auto-thumbnail and the fold all stay.
  - The carousel's text-after field.
- **Selecting a slide** changes only which slide is expanded. It is UI state, not stored, and the
  first slide is selected by default.
- **Moving a single work with ↑ ↓ steps over a carousel as one unit** and never enters it. Joining
  is only by drag or the dropdown.
- **Project dropdown:** a work's select lists the projects and, under them, the current project's
  carousels ("Carousel 1", "Carousel 2", in order). Picking one appends the work to that carousel.
  A slide's select also offers "Not in a carousel", which is the same as Take out.
- **Drag:** desktop pointer only, with HTML5 drag-and-drop or pointer events (builder's choice):
  - Drag a work row's picture onto a tray, and it joins at the drop position.
  - Drag a thumbnail within its tray to reorder.
  - Drag a thumbnail out onto the project line, which is the same as Take out.
  - Show a clear drop indicator.
  - On touch, the dropdown and the arrows do the same jobs.
- **Order changes** commit the way they do now: `gallery` ids persist without Save, and
  `projectId`/`carouselId`/lead fields are written at Save (`persistWorkMetadata`).
- **The cap:** the **+** slot refuses once the member is at `galleryLimit`, with the existing
  message. Drops of existing works are never refused.
- **Preview mode** shows the real visitor carousel (below), fed by `profilePreview.ts`.
- **Strings:** EN and DE for every new label, the aria names ("Slide 2 of 4 in carousel 1") and the
  tooltips.

## Member page (builder's call within the decisions above)

- **A new `MemberCarousel.astro`** sits beside `MemberWork.astro` and is rendered by
  `MemberProject.astro` for a carousel unit:
  - One frame at the carousel's S/M/L width under the 70vh cap. The cap and the height come from
    the **lead slide's aspect ratio**.
  - A track of slides. **Each slide is an `a.mprof__work-link` with the full `data-pswp-*` set**, so
    the existing flat lightbox (`children: ".mprof__work-link"`) picks the slides up in page order
    with no lightbox change.
  - Arrows beside the frame, then the dots, then every slide's caption block with only the showing
    one visible, then `.mprof__text` from the lead.
- **Engine:** generalise `src/lib/communityCarousel.ts` so the member page can use it, preferably by
  moving its hooks to data attributes, rather than writing a second engine. The community card must
  behave exactly as before. `carouselDots.ts` and the `vscn:carousel-show` / `vscn:carousel-step`
  events are reused.
- **Keyboard:** ← → with nothing focused pages the carousel nearest the middle of the viewport. On
  the member page `.page-wrap` is the scroller on desktop and the document scrolls on a phone (see
  CLAUDE.md).
- **Paint-in:** if the first work of the page is a carousel, `preparePaint`
  (`src/lib/profilePaint.ts`) treats the lead slide's image as "the picture".
  `src/lib/profileIndex.ts` lists a carousel as one entry, labelled with the lead slide's title.
- **Type:** any new text element joins its voice in `src/styles/type.css` (the captions are
  CAPTION, as on single works). Component CSS sets layout and colour only.
- **Shapes:** the dots are round and already exempt from the square reset (`.cdot`). Any other new
  round element must be added to that `:not()` list in global.css.
- **Stale comments** in `pager.ts`, `carouselDots.ts:5` and `lightboxText.ts:265` mention the
  deleted `projectCarousel.ts`. Update them.

## Verification

- `npm run verify` green: lint with no new warnings, astro check, unit tests including the new
  grouping tests, Functions tsc, and the rules emulator tests.
- `npm run build --mode development` against a fresh dev snapshot.
- Look at it in a browser:
  - The editor harness `/styleguide/editor/de` for the tray. Seed it by hand if it has no works.
  - A member page with a seeded carousel, at 375 and 1280 wide.
  - Check: the dots, the arrows beside the frame, the caption cross-fade, no jump below the frame,
    and that the lightbox opens on the clicked slide and closes back onto the slide it ended on.
- After merging to dev, do a signed-in walk on the dev host:
  1. Build a carousel by drag and by dropdown.
  2. Reorder, Take out, dissolve, and upload through +.
  3. Save, reload, and confirm the rebuilt page shows it.
- Josh checks it on his phone.

## Left to the builder

The DOM and class names, the drag mechanism, how the engine is generalised, the exact drop-indicator
look, and the animation details for the caption cross-fade (use the site's ease-out).
