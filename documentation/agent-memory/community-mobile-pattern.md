> Mirror of the `~/.claude/projects/D--SynoDrive-VSCN/memory/community-mobile-pattern.md` memory file, kept in the repo so any Claude instance can read it without access to the user profile. Keep both copies in sync.

---
name: community-mobile-pattern
description: "Mobile /community per Josh's spec: Gallery = 1-col fade-in + 5s auto-advance, Grid = plain 2-col, arrows never on mobile; iOS OOM crash fixed via deferred gallery images — live on dev 2026-08-28"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01dfff92-b36f-4df0-b936-2ce35fe2e9a9
  modified: 2026-08-29T08:10:30.992Z
---

Mobile `/community` was **completely broken** before 2026-08-28: the desktop "card out of
flow" rule (`.cgrid__cell > .ccard { position: absolute }`) had no mobile counter-rule, so
every cell was 0-height and all 21 cards piled on top of each other. Cards returning to flow
on mobile (`position: static` in the `--bp-mobile` block) is the load-bearing fix.

The mobile design is **Josh's explicit spec** (2026-08-28), which replaced my first attempt
(a five-beat full-bleed/staggered-pairs pattern — built, shipped, then superseded same day;
don't resurrect it):

- **Gallery view (spread)** = single column of full-width cards, fading in on scroll
  (`animation-timeline: view()`, `@supports`- and reduced-motion-gated, scoped
  `.cgrid:not([data-pattern="grid"])`), carousels **auto-advance every 5s** — mobile gallery
  only, per-tick re-checked (breakpoint, pattern, document.hidden), IntersectionObserver
  starts/stops per card, timers torn down on astro:before-swap, manual swipe restarts the 5s.
- **Grid view** = continuous 2-lane masonry flow (multicol, one tight 1.1rem gap both axes) — Josh's ref: cosmos.so. No animation.
- **Carousel arrows NEVER show on mobile** — Josh's decided trade ("chance is people will
  miss it but I am fine with that"); swipe remains as the hidden affordance.
- All three toggle buttons (Gallery/Grid/Index) show on mobile; mobile layouts key off
  `data-pattern` (absent = server default = gallery, so no-JS gets the fading column).
- **Index rows are disclosures now** (mobile AND desktop, 2026-08-28): each ledger row keeps its profile link, plus the same MemberDetailPanel <details> the cards use, toggle at the row's right edge; the panel leads with the member's PROFILE PICTURE (photoURL via stripStorageToken, the MemberCard treatment — not artwork) via a new lead slot + orceShow prop on MemberDetailPanel. Mobile index rows show the role (title) again, stacked; .cindex__role:empty guards phantom gaps. Panel layout per Josh (2026-08-29): picture LEFT, bio+links RIGHT, tags across the bottom, body capped at 44rem (not the wide shell) — grid gated by :has(> .cindex__avatar) so avatar-less rows keep the flex column and no phantom first-column indent.
- Tag search input 16px on mobile (below that iOS zooms on focus); bar buttons get
  padding/negative-margin tap targets.

**iOS Safari OOM crash ("a problem repeatedly occurred") on first device test**: every
carousel renders ALL gallery images stacked (opacity 0 still decodes) and 100vw `sizes`
picked 1400w at 3x DPR. Fix in `CommunityImageCard.astro`: only the active image gets `src`
at build; siblings wait as `data-src`, hydrated on the carousel's first
pointerenter/touchstart and one-at-a-time by `show()`; `sizes` deliberately under-set to
`55vw` mobile so phones never select 1400w. Auto-advance only runs on-screen for exactly
this reason. If a crash returns, next bisect step is the `view()` animation.

Deployed to dev (https://vscn-dev-f4b60.web.app) via `npm run deploy:dev`, uncommitted on
`feature/user-content-backend` — see [[uncommitted-tree-two-features]]. Two Windows traps
hit this session: `astro build` can fail on a transient `ssrMoveAssets` rename EPERM
(SynoDrive locking fresh `dist/` files — delete `dist`, rerun), and **never round-trip a
UTF-8 source file through PS5.1 `Get-Content`/`Set-Content`** (ANSI misdecode corrupted
every em-dash/glyph in CommunityGrid.astro; reversed via UTF8→1252→UTF8 re-encode).

Related: [[community-gallery-layout-selector]], [[community-grid-affinity-workflow]],
[[browser-pane-frozen-timeline]].

**2026-09-03: the mobile gallery has a FOCUS.** Josh: "highlight only one carousel at a
time in gallery mode … the most prominent card (in the middle of the screen) is fully
opaque the others are a bit faded" (reference: xk.studio/work). Two halves that must
agree on what "prominent" means, and both mean *centred in the scrollport*:
- **Opacity is pure CSS** — `@keyframes cgrid-cell-focus` on an `animation-timeline:
  view()` over `cover 0%..100%`, dimming to 0.35 at both ends with a 38%–62% plateau so a
  card the reader has stopped on does not visibly fade. It replaces the old enter-fade,
  which could only ever ramp in. 0.35 not 0.30: the reference is white-on-black, this
  page is dark-on-off-white, and the same figure washes a photograph out.
- **Auto-advance is JS** — `focusedCarousel()` in `communityCarousel.ts` picks the frame
  whose centre is NEAREST the `.page-wrap` centre (not the window — that is a ticker's
  height out, and it is also the box `view()` measures against). It scans every
  `[data-carousel]`, not just the ones with an Embla instance, or a single-image card
  holding the middle would let a faded neighbour be the one that moves.

Note you cannot see either of these in the Browser pane — see
[[browser-pane-frozen-timeline]]. `getAnimations()` reports the ViewTimeline attached
with `progress: null`, and CSS transitions read as pinned at their start value even when
`:hover` matches. Verify the wiring, not the picture.

**2026-09-04: the fade-in stayed, the fade-out moved to the bar.** Josh, first: "the fade
in the gallery view should only start to happen once the top of the image touches the filter
bar" — then, correcting a version that had dropped the arrival ramp with it: "until they
reach the middle they should be faded out. i liked the fade in so far it should have just
changed the fade out". The shape now is: dim on the way in, full strength around the middle
of the screen, HELD for the whole time the card is below the filter bar, given up only as it
slides under the bar.

**It takes two animations, because the two ramps want different clocks.**
- IN — `cgrid-cell-in`, plain `view()`, `cover 0% cover 35%`, fill `backwards`. Unchanged
  from the version Josh liked. It can only ever be a FIT: `cover` is linear in scroll
  distance (card height + scrollport), not in the screen position of an edge, so 35% means
  "top edge near the middle" only for this page's real card sizes.
- OUT — `cgrid-cell-out`, `view(block var(--cgrid-fade-inset) 0px)`, `exit`, fill `both`.
  The inset shrinks the timeline's scrollport from the top by the bar's height, which makes
  `exit` mean "leaving UNDER THE BAR". Exact for every card height, nothing fitted.
  `--cgrid-fade-inset` is measured once per page-load (and on a ResizeObserver of the bar)
  as `parseFloat(getComputedStyle(bar).top) + bar.offsetHeight` — 40.8px on a 375x812
  phone — because `top` is the DOCKED offset whether or not the bar is docked yet.

**The fill modes are the handover and they are load-bearing.** Both animate `opacity`, so
the later one in the list wins wherever it contributes. `cgrid-cell-in` is listed SECOND
with `backwards`: it fills the before phase, drives the arrival, then stops contributing at
the end of its range, and `cgrid-cell-out` (first, `both`) is left holding opacity 1 until
the bar. Give the in-ramp `both` instead and every card pins at 1 forever and the fade-out
never shows. The ranges cannot overlap here — in ends ~400px of scroll, out starts ~771px
(scrollport less bar) — but a card taller than the scrollport would close that gap.

**Accepted consequence:** more than one card is fully opaque, because every card between the
middle and the bar is. `focusedCarousel()` in `communityCarousel.ts` still moves the ONE
nearest the scrollport centre and is now the STRICTER of the two, which is the safe
direction — a faded card can never be the moving one.

**Correction to [[browser-pane-frozen-timeline]] for THIS mechanism:** a real
`computer{action:"scroll"}` gesture DOES drive scroll-driven animations in the pane and
commits the values — I read 0.35 below the fold, ~0.5 arriving, 1.00 mid-column, 0.99
falling at the bar, 0.35 above it. What does not work is setting `scrollTop`/`scrollTo`
from `javascript_tool`: the scroll position moves, layout updates, and the animation's
`currentTime` stays at whatever the last real gesture left it.
