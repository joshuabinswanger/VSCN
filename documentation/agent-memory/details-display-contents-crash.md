<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/details-display-contents-crash.md — kept in the repo so any Claude instance can read it without the user profile. -->

---
name: details-display-contents-crash
description: "/community was unopenable on iPhone (not slow — unopenable): display:contents on <details> + a styled ::details-content crashes iOS WebKit. Bisected to one declaration 2026-08-31; fixed by giving .pdisc a real box."
metadata:
  type: project
---

`display: contents` on a `<details>` element, combined with styling its
`::details-content` pseudo (`grid-column` + `content-visibility` + a
`block-size` transition), makes the page **impossible to open** in iOS WebKit —
Chrome-on-iOS reported only "can't open this site". Desktop Chrome is fine,
which is why it survived every desktop review.

**THE TRIGGER IS ONE DECLARATION**: `overflow: hidden` on `::details-content`
when the <details> is `display: contents`. Isolated 2026-08-31 in a 927-byte
standalone page with ONE <details>, no JS, no images, no other CSS. On the same
pseudo, `content-visibility: hidden`, `block-size: 0` and `grid-column: 1 / -1`
are each harmless ALONE -- only overflow kills it. Not load-dependent: one
element is enough.

FULL TRUTH TABLE (standalone <900B pages, one <details>, on Josh's iPhone):
  display:contents + pseudo overflow:hidden  -> DEAD
  display:contents + pseudo overflow:auto    -> DEAD
  display:contents + pseudo overflow:clip    -> fine  (clip is not a scroll container)
  display:contents + pseudo content-visibility:hidden -> fine
  display:contents + pseudo block-size:0     -> fine
  display:contents + pseudo grid-column      -> fine
  display:contents + overflow on a child DIV -> fine  (pseudo-specific)
  display:contents, parent row NOT a grid    -> DEAD  (grid is irrelevant)
  <details> HAS a box + full pseudo styling  -> fine  (the box is everything)
Mechanism: hidden and auto make the box a SCROLL CONTAINER, clip does not.

DEVICE: iPhone 15 / iOS 26.6. Confirmed in BOTH Safari and Chrome for iOS
(2026-08-31) -- so this is not a Chrome-shell quirk, it is the WebKit
engine on current iOS. Durable repro lives in the repo at
documentation/webkit-details-repro/ -- unpublished on purpose, four unlinked
test pages had no business shipping to prod. To retest on a device:
`cp -r documentation/webkit-details-repro public/t && npm run deploy:dev`,
then https://vscn-dev-f4b60.web.app/t/ , then delete public/t again.

WebKit appears to build a scrollable area for a pseudo whose originating
element generates no box.

CONSEQUENCE FOR US: the 320ms animation is BACK (2026-08-31), using
`overflow: clip` inside `@supports selector(::details-content)`, with .pdisc
keeping its real box. Verified settled-open: row 24->210px desktop,
20->183px mobile, panel flush to the row width.

**Why:** the pseudo-element belongs to an element that has no box. It was used
deliberately: `.pdisc` was `display:contents` so `::details-content` — not
`.pdisc__body` — became the caption grid's item and could take
`grid-column: 1 / -1`, letting the open panel span the full card width. The
old code comments defend that design; they were right about the layout and
wrong about the cost.

**CONFIRMED FIXED ON DEVICE** 2026-08-31 (Josh, iPhone): /community/ opens
normally after the fix below. The construct, not the weight, was the whole story.

**How to apply:**
- Never put `display: contents` on `<details>`, and never style
  `::details-content`, in this codebase. The fix (2026-08-31) gives `.pdisc` a
  real box, lifts the summary toggle out with `position: absolute; right: 0`,
  and reserves the toggle's width on the ROLE / LINK — **not on the row**: row
  padding insets the open panel, which is the exact regression the pseudo
  existed to prevent.
- Three sites carried it: `CommunityImageCard`, `CommunityTextCard`,
  `CommunityGrid`'s `.cindex__line`. `.cgrid__strip{display:contents}` and
  `ProfileForm`'s are NOT `<details>` and are fine.
- **The 320ms animation is fine to keep** -- it was never the problem, and
  `/community/?anim=1` was confirmed opening on the iPhone on 2026-08-31
  with the animation live. Use
  `overflow: clip` on the pseudo, inside `@supports selector(::details-content)`,
  and never `hidden`/`auto`.

**What the bisect cost, and what did NOT cause it** — seven wrong theories, all
disproved on the device, so don't revisit them: image decode memory (the page
survives all 61 images with CSS off), the network / DNS / `web.app` blocking,
the `body::before` grain overlay, 24 simultaneous `backdrop-filter` panels,
`animation-timeline: view()`, all animation/transition/`will-change`, and total
page weight. Method that worked: serve stripped copies of the REAL served HTML
from `dist/t/`, then rebuild CSS from zero upward in whole-rule slices — the
break was "rules 1..149 opens, 1..150 dies".

Traps hit while doing it: iOS Chrome does **not** map iOS "Reduce Motion" to
`prefers-reduced-motion`, so that test proves nothing; Firebase serves HTML
`Cache-Control: max-age=3600`, so phone re-tests can answer from disk cache
(bust it); and cumulative CSS prefixes are NOT valid pages — an intermediate
slice can die from a layout that never ships.

Related: [[community-mobile-pattern]], [[community-gallery-layout-selector]],
[[browser-pane-frozen-timeline]], [[deploy-dev-needs-development-mode]].

UPSTREAM (checked 2026-08-31): this is WebKit bug 320447
https://bugs.webkit.org/show_bug.cgi?id=320447 -- reported 2026-07-28,
RESOLVED FIXED 2026-08-05, landed as commit 318661@main.
Real cause, from the WebKit engineers' own diagnosis: null-deref in
RenderElement::getUncachedPseudoStyle(), reached from
RenderLayerScrollableArea::updateScrollCornerStyle() -- a scrollable area wants
a SCROLL-CORNER pseudo, resolving that needs a render element, and
display:contents means there is none. That is exactly why `clip` is safe: it
establishes no scrollable area, so that code path is never entered.
DO NOT file a bug; it is a duplicate. DO keep the workaround: the fix is in
trunk only and had NOT shipped as of iOS 26.6. Retest by re-deploying
documentation/webkit-details-repro/ (see DEVICE above) after a new iOS lands.
If wk-hidden renders, the fix has arrived. Drop the workaround
only once 318661@main is in shipping Safari and users have updated.
