<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/barless-lightbox-geometry.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: barless-lightbox-geometry
description: "The lightbox's words are positioned from JS off the picture's rect, so paddingFn and the placement function are one contract that breaks together; since 09-06 the words are always UNDER the picture and the top row has no band\"
metadata: 
  node_type: memory
  type: project
  originSessionId: 518ce24d-1209-4699-96da-58481bea6b94
  modified: 2026-09-04T08:41:40.010Z
---

Since 2026-09-04 the lightbox has no caption band. The artist, caption,
description and link are absolutely positioned from `pan` / `currZoomLevel` off
the picture's rendered rectangle by `attachPlacement()` in
`src/lib/lightboxText.ts`, and `lightboxPadding()` in the same file reserves the
space they land in — UNDER the picture for every shape since 2026-09-06 (Josh: "put the text
always below the images"); from 09-04 to 09-06 a portrait picture got a
right-hand column instead. `paddingFn` still receives the item's data and now
uses it only to size the reserve: 192px under a landscape, 256px under a
portrait, because an upright picture is height-bound, comes out narrow, and
wraps its words taller (~85,000 ÷ measure px for the worst-case block).

THE TOP ROW HAS NO BAND EITHER (2026-09-06, Josh: "lose the top bar in
lightbox"). The controls all survive — close word, zoom, counter, preloader —
but on the bare paper, gathered in ONE cluster at the top right (the
preloader's `margin-right: auto` from PhotoSwipe's sheet is zeroed, which is
what used to hold the counter at the left). The artist line lives above the
picture's top-left corner inside that same height, so the left must stay
empty. `top` in `lightboxPadding` clears the row: 56 desktop / 44 phone, down
from 92 / 72. And `--pswp-placeholder-bg` is `transparent` (Josh: "lose the
grey frame"): PhotoSwipe painted a `--color-border` div at the incoming
picture's box until it decoded, which read as a grey frame on every page.

**Why:** a band made the words belong to the window rather than the artwork, and
beside a portrait image it ran a paragraph across the bottom of the screen with
empty paper either side of the picture it described. Josh: "lose the bars".

**How to apply:** the two halves are one contract and will break together
silently. The placement function owns `left`/`top`/`width`/`max-height` as
inline styles — no CSS rule may set those four. The reserve's binding case is
the NARROWEST landscape (a near-square image, ~630px measure, ~150px of text),
not the widest, because one number serves both; that is why it is 192 and not
176, and four pixels of shortfall showed up in the browser as a faded last
line, never in review. Mobile is knowingly under-reserved and scrolls. A
PhotoSwipe upgrade that renames `pan` or `currZoomLevel` breaks the layout
rather than degrading it.

Both galleries share one renderer now — `registerLightboxText()`, called from
CommunityGrid.astro and members/[slug].astro, which each carried a ~90-line copy
before. Related: [[image-descriptions-long-and-short]] (the short field this
work removed), [[community-click-semantics]] (the credit is still the route to
the person), [[browser-pane-frozen-timeline]] (why the hover work here had to be
verified by reading computed geometry, not by screenshotting a transition).
