> Mirror of `~/.claude/projects/D--SynoDrive-VSCN/memory/community-gallery-layout-selector.md` — readable by any Claude instance without access to Josh's user profile.
---
name: community-gallery-layout-selector
description: "/community gallery: the two-lane Supera spread (interlocked 2026-08-28) plus a grid wall (now one tile PER WORK — project over author, image opens the lightbox, name goes to the profile) AND a typographic index ledger behind a Gallery/Grid/Index toggle; parallax is simple amp-cycled linear drift; tag cards take normal slots, always last, width-capped; strip shelved behind ?pattern=strip"
metadata: 
  node_type: memory
  type: project
  originSessionId: 49c9081d-3371-41d4-b475-691d2caeba23
  modified: 2026-09-01T00:00:00.000Z
---

State as of 2026-08-28 — supersedes the short-lived 3-way selector and the
three-beat FLOW parallax:

- **Spread is THE gallery** on `/community` ([[image-cards-need-content]]): a two-lane
  editorial zigzag (Supera / Zhenya Rynzhuk reference — Josh's capture
  `ShareX\Screenshots\2026-08\chrome_fsGA32nfPl.mp4`). Redrawn twice on 2026-08-28 and
  now INTERLOCKED: lanes columns 2–10 / 13–21 (9-col ≈ 750px at --grid-max, wobble
  8/9), rowSpans 24–28 (the spans ARE the image sizes — most artwork rides the frame
  cap `rowSpan × --cgrid-row − chrome`, and the earlier row-unit tightening had
  silently shrunk every image ~30%). After four whitespace rounds the beats overlap
  ~4–6 rows (~22-row pitch, tileRows exact at 131, no full-width empty band anywhere)
  — this REVERSED the 08-27 "vertical air / beats never interlock" rule at Josh's
  repeated ask; round 3's deeper ~9-row overlap was eased back at "a bit more white
  space". Page ~8.7k px for 16 galleries (was 11.2k before interlock). Legal because
  the lanes never share columns. A
  parallel session added a second gallery the same day: the aligned-rows GRID WALL
  (`alignedRows` pattern) behind a Gallery/Grid header toggle. SSR renders the
  spread; no-JS/mobile see it too.
- **The parallax is now SIMPLE (2026-08-28 rework, replacing the three-beat FLOW
  timeline)**: one linear tween per cell, `y: +amp → −amp` over the cell's OWN viewport
  crossing, `ease:none`, `scrub:0.5`. Depth comes from amplitude, not choreography:
  `AMPS = [70, 130, 100]` cycled in row order — a cycle of 3 over 2 alternating lanes,
  so depth never lines up with a lane. Tag cards run it at full amplitude (0.3× only
  in the shelved strip's ladder). Josh approved
  ("great") and then asked twice for less vertical white space (`--cgrid-row` 2rem →
  1.5rem, the single advertised knob; comments genericized to row counts so they stop
  going stale) and more fade (scale tween's entry opacity 0.5 → 0.2).
  Lessons kept from the FLOW era, each cost a round: page-long trigger dilutes any
  amplitude to invisibility; `scrub:true` ticks with every wheel step ("the images are
  kinda vibrating" — keep 0.5 and finish the scale tween by "top 60%"); lane-keyed
  treatment read as columns misbehaving, not depth.
- **THE INDEX SECTION IS GONE** (late 2026-08-28, after the parallel session restyled
  the text cards into framed "tag cards"): members without artwork now get THE SAME
  TREATMENT as everyone — ordinary slots in whichever gallery is active, full
  parallax amplitude — but always LAST (shuffled artwork leads, tag cards close in
  completeness order; `data-rank` is the contract). Their card is width-capped at
  28rem (a full-lane all-text rectangle read as a slab) and centres in its slot like
  a narrowed portrait. **TAG-CARD ANATOMY FIXED 2026-08-28 (late)**: the frame's
  fallback chain is tags → member-type label → **rule**. The ROLE was the old last
  rung and is gone from it — a job title rendered in the keyword voice (uppercase,
  letter-spaced) and, worse, sat inside the frame for the 3 tagless members while
  everyone else's role sat in the caption: two places, two voices, decided by
  whether a member filled in tags. Role now always prints in the caption
  (`.ctcard__role`); a frame with nothing to hold becomes `.ctcard__frame--rule`
  (hairline, no box, no whole-frame link — a 1px click target is a trap). Mirrored
  in `profilePreview.ts` + `.ccpv__tframe--rule` or the editor preview would drift
  from the live card, which that file forbids. The three affected members
  (Karin S., Gabriela G., Tara) are simply missing tags — adding tags to their
  profiles is the data-side half of the fix. TEXT_TILE survives only as the shelved strip mode's ladder,
  the one place the 0.3× parallax fraction still applies. The midline ladder, the
  fixed-column L/R flow, and the span-4/5 iterations that preceded it all lived and
  died within this same day — check git before resurrecting any of them.
- **Stagger is scrapped** (table deleted). The Affinity doc's first artboard still shows it
  — historical; redraw before visual tuning ([[community-grid-affinity-workflow]]).
- **INDEX is the third view (2026-08-28, later session)**: the header toggle is now
  Gallery/Grid/Index. Index is a server-rendered typographic ledger (`.cindex` in
  CommunityGrid.astro — NAME · ROLE · FIELD, alphabetical, 72rem measure). The
  ordinal and the member-type badge were both cut at Josh's ask ("index doesnt need
  number but scientific field"): the FIELD column is the member's own tags, capped
  at `INDEX_FIELD_TAGS = 3` and joined with " · " — capped by whole tags because CSS
  ellipsis cut them mid-word, full set in the `title` and on the member's page. The
  badge was dead weight anyway (empty for every typeless profile = all of them).
  Mobile drops the role and stacks name over field. The ledger swaps in for the
  whole grid (`#member-grid` gets `hidden`;
  `.cgrid[hidden]{display:none}` needed because display:grid beats the UA hint,
  same story as the strip). NOT a deal — no slots, no motion; `build()` skips when
  the grid is hidden and the layout-changed event rebuilds GSAP on the way back.
  `?pattern=index` syncs like the others. Rows link via `memberHref()`; labels via
  `memberBadgeLabel()`. Mobile: toggle still hidden, but ?pattern=index works
  (ordinal + role columns collapse). Verified in-browser: toggle, URL sync, reload,
  motion rebuild, 21 rows.
- **THE STICKY BAR (2026-08-28, three review rounds in one session)**: every control
  on `/community` lives on ONE sticky line — `.community-bar` in CommunityGrid.astro.
  Design journey — every cut at Josh's explicit ask, in ONE day: pill chips died
  ("ui is not nice"), count died, openTo died, search-only band ("sits awkwardly")
  → mockup A brought count+openTo back on one sticky bar → then the free search
  field died ("remove search bar"), openTo died AGAIN ("remove offering
  services and Looking for services") and the count died AGAIN ("remove memers").
  FINAL contents, one 0.85rem baseline, laid out as a 3-track grid
  (`1fr auto 1fr`): TAGS DROPDOWN centred on the shell midline (its panel hangs
  from `left:50%` + translateX(-50%)) · Gallery/Grid/Index toggle at the right
  edge (still desktop-only). Bar padding is tight (`0.15rem` top) so it reads as
  one header with the nav rather than a separate strip. Tags is the ONLY filter; its
  panel's narrowing field is the only search. Anatomy: outer strip spans the wide
  main, paints `--color-bg` (masks artwork scrolling under); inner
  `.community-bar__in` mirrors the ticker's box (max-width `--shell-max` + 15px
  inline padding, border-bottom 1px `--color-dark`) so its edges align with the
  title. The bar STARTS at its docked position (no margin above — resting and
  stuck are the same place) and docks UNDER the nav, which was ALREADY sticky
  (Navbar.astro top:0 z:10; the ticker lives OUTSIDE `.page-wrap`, not
  position:fixed) — bar `top: calc(var(--font-size-base) + 20px)` IS the nav's
  height (one line, line-height 1, 10px paddings); change them together. Big page
  title is gone: h1 "Community" is `.sr-title` (clip-pattern hidden). TAGS
  DROPDOWN (`.tag-filter`): typographic "Tags ▾" trigger (`filter-word--set`
  underline when active, label becomes the tag); floating panel = type-to-narrow
  field + all 29 distinct tags with member counts (case-insensitive identity,
  first spelling displayed, `data-tags` pipe-encoded on cells+rows);
  single-select, re-pick or "All tags" clears; `?tag=` composes with `?pattern`
  and restores on load (module state reset each astro:page-load);
  outside-click/Escape close via document listeners installed at MODULE scope
  (inside astro:page-load they'd stack per navigation — handlers query live DOM,
  never close over it). Filtering re-deals survivors into leading slots (never
  hide-in-place — drawn slots would stand empty); `reshuffle:false` on narrowing
  keeps `artworkOrder` so survivors hold position. openTo + member-TYPE machinery
  live ONLY on `feat/community-filters` (all 21 seeded profiles typeless; openTo
  data: 6 offering / 1 seeking / 7 networking + typo'd customs).
- **Strip is shelved, not deleted**: no UI reaches it, but `?pattern=strip` still rebuilds
  the page into the horizontal hover-grow scroller. The old 3-way selector died 08-27;
  the NEW Gallery/Grid toggle (2026-08-28, parallel session) is a different, live control
  that re-deals and fires `community:layout-changed` so the motion layer rebuilds.

- **THE WALL IS NO LONGER DRAWN (2026-08-31, fourth "less white space" round)**: the grid
  view stopped being a slot table and became a MEASUREMENT. `GRID_TILE` is deleted;
  `layOutWall(count, cols)` generates the placement, the brick survives as N / N−1
  alternating rows (odd `rowStart` flush, even offset half a pitch via `left`, which
  neither eats a fixed track nor fights GSAP's transform), and the card is a FIXED 200px
  at every width. The three knobs live in CSS on `.cgrid[data-pattern="grid"]`
  (`--wall-card` 200, `--wall-gap` 40, `--wall-edge` 100, literal px so JS can parse
  them) and the script reads them back with getComputedStyle — one source of the drawing.
  Counts measured: 4 at 1280, 5 at 1440, 7 at 1920, 9 at 2560, 13 at 3440. The wall also
  BREAKS OUT of the page measure: `body.wall-bleed` (set per view by applyLayout) lifts
  `body.content-wide main`'s `min(94vw, 2030px)` cap, so `--grid-max` binds the spread
  only. A resize can now change the drawing, so the behaviour script re-deals when the
  count actually moves and fires `community:layout-changed`. Rows are real grid rows here,
  so the vertical air is a `row-gap` (0.75 × gutter) instead of a reserve inside each
  cell, and the wall's parallax is damped to 0.35 via `flowScale` (130px of travel is most
  of a 200px card). NOTE: the two `<script>` blocks in CommunityGrid.astro are SEPARATE
  ES modules — the motion layer cannot call `applyLayout`; cross-script work goes through
  `community:layout-changed`. Getting that wrong fails silently (esbuild treats the
  unknown identifier as a global, the ReferenceError lands inside a setTimeout).

- **THE WALL IS A WALL OF WORKS, NOT OF MEMBERS (2026-09-01, Josh's ask: "only single
  images with the Project Name and Author underneath")**: the grid view no longer shares
  cells with the spread. `CommunityGrid.astro` renders TWO sets of `.cgrid__cell` —
  `data-slot="image"` (one member card per member, the spread's) and `data-slot="work"`
  (one tile per artwork, the wall's) — and `applyLayout` hides whichever set the view is
  not built from (`artKind`). Consequences that matter: THE CAROUSEL IS GONE FROM THE
  GRID entirely (a carousel exists to fit a gallery into one slot; the wall gives every
  image its own slot), the wall is ~3x taller (48 tiles for the 16 seeded galleries,
  where it was 16 cards), and `artworkOrder` had to become a Record keyed by `artKind`
  or every switch would empty the standing order. Hidden cells are `display:none`, so
  the wall's images are NOT fetched until the wall is asked for — which is also the iOS
  memory defence, together with `widths:[400,800]` and `sizes` capped at the 200px track
  (no 1400 variant exists to be selected). The motion layer now filters
  `.cgrid__cell[hidden]` out of both jobs.
  New component `src/components/community/CommunityWorkCard.astro` (`.cwork`): frame
  first, then project title (0.95rem/700/black) over author (0.75rem/500/`--color-muted`)
  — four levers at once because at a 200px measure one is a nuance, not a hierarchy.
  `--cwork-chrome: 3.4rem` vs the member card's 5.4rem, so the wall overrides
  `--cgrid-row` again on `[data-slot="work"]`. `.cwork` had to be added to every
  `:global(.cgrid__cell > .ccard)` rule (the out-of-flow/back-in-flow pair) and to the
  GSAP scale selector.
  **THE DATA IS THE OPEN PROBLEM: 0 of 48 seeded works has a project or a caption**, so
  the wall today shows author names only (`.cwork__author--lead` — black, a shade bigger,
  never bold, so a name can't be mistaken for a title). The title line is OMITTED rather
  than filled with "Untitled" 48 times. It turns on by itself once members tag gallery
  images to projects in the profile editor; the curated seed deliberately left captions
  empty ([[member-curation-stage1]]).

- **THE TILE HAS TWO DESTINATIONS (2026-09-01, same session)**: on the wall, pressing the
  ARTWORK opens the PhotoSwipe lightbox and only the AUTHOR'S NAME goes to the profile.
  `.cwork__link`'s href is the ORIGINAL upload (with `data-pswp-width/height/caption/meta`)
  and it WRAPS the image — not an inset overlay — because PhotoSwipe finds the thumbnail
  to zoom out of with `element.querySelector('img')` and an overlay sibling leaves it
  nothing to animate from. A THIRD `<script>` in CommunityGrid.astro owns the lightbox,
  with the member page's chrome verbatim (`pswp--vscn`, bgOpacity 1, the same paddingFn,
  CLOSE as a word, the caption element registered on `uiRegister`) — one lightbox on the
  site, it must not look like two. `gallery: "#member-grid"`, `children:
  ".cgrid__cell:not([hidden]) .cwork__link"`. NOTHING RE-INITIALISES IT ON A DEAL and
  nothing needs to: the listener binds to `#member-grid`, which survives every deal
  (cells are moved inside it, never replaced), and PhotoSwipe re-resolves `children` at
  CLICK time (`getClickedIndex` → `getElementsFromOption`, verified in 5.4.4). The
  `:not([hidden])` is load-bearing — without it a tag-filtered wall showing 15 tiles
  would page through all 48. Verified: 10/48 → next → 11 → 12 → prev → 11; tag `3d` gives
  2/15; the caption band shows the tile's own author; the SPREAD's `.ccard__frame-link` is
  untouched and still navigates (children misses it, `getClickedIndex` returns −1, default
  allowed).
  **THE HOVER (Josh, same breath)**: `.cwork__img` scales to 1.045 over 500ms
  cubic-bezier(0.22,0.61,0.36,1) on `:hover`/`:focus-within` of the frame, which is
  overflow:hidden — the picture fills its own rectangle and the wall's flat row edges
  never move. ON THE IMAGE, NEVER ON `.cwork` OR THE CELL: GSAP owns the transform on
  both of those and would overwrite it silently, desktop-only. Name link is undecorated
  at rest, underlined on hover/focus (48 underlined names would out-shout the pictures);
  the image link takes `cursor: zoom-in`.

**Why:** Josh compared all three and chose the spread as the direction; the others were
noise for the member review.

**How to apply:**
- Tables + layout math live in `src/lib/communityLayout.ts`, shared by frontmatter and
  client script; validation at module load still fails `astro build` on a bad table.
- The hover growth / transitions read as broken in the hidden Browser pane
  ([[browser-pane-frozen-timeline]]); GSAP scrub also freezes there (rAF paused) — verify
  motion by checking inline transforms exist, not by watching them move.
