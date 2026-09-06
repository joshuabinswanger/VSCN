<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/barless-lightbox-geometry.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: barless-lightbox-geometry
description: "The lightbox's words are positioned from JS off the picture's rect, so paddingFn and the placement function are one contract that breaks together"
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
space they land in — bottom for a landscape image, a right-hand column for a
portrait one, decided per slide because `paddingFn` receives the item's data.

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
