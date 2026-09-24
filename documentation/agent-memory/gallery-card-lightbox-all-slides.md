> Mirrors the `~/.claude/projects/D--SynoDrive-VSCN/memory/gallery-card-lightbox-all-slides.md` memory file; keep the two in sync.

---
name: gallery-card-lightbox-all-slides
description: "LIVE ON DEV 99309d3 — a gallery card's lightbox now pages that member's whole carousel, because the card's slides became the PhotoSwipe items and the overlay link only says which one to start on"
metadata: 
  node_type: memory
  type: project
  originSessionId: b22d44d4-fa31-43aa-9dbf-424f585bd4f4
  modified: 2026-09-09T09:43:13.038Z
---

**Shipped to dev 2026-09-08 (`99309d3`), prod open.** In the directory's Gallery view, clicking
a card used to open exactly one picture: the card's single overlay link (`.ccard__frame-link`)
was one PhotoSwipe child, so paging went card → card, showing each member's currently-selected
slide and nothing else of theirs. Josh: "photoswipe should pick all images in the gallery in
gallery view. not only the currently showing one."

**What changed, and it is a contract change between three files:**

- `CommunityImageCard.astro` — every `.ccard__slide` now carries the full `data-pswp-*` set
  (width, height, caption, description, link, meta, profile). They used to be `data-work-*`
  and existed only for the carousel to copy onto the link.
- `CommunityGrid.astro` — the card's click is **intercepted** in the CAPTURE phase on
  `#member-grid` (`openCard`) and no longer routed through PhotoSwipe's own child selector.
  `WALL_TRIGGERS` is now the Grid wall alone; `CARD_TRIGGER` is handled by hand. The handler
  reads the frame's slides into `SlideData[]` and calls `loadAndOpen(start, items, point)`.
- `communityCarousel.ts` — listens for `vscn:carousel-show` on the carousel and scrolls to the
  slide the lightbox landed on, so **closing zooms back onto the picture that was open**, not
  the one first clicked.

**Why the items are built by hand rather than handed over as elements:** PhotoSwipe's DOM parser
(`_domElementToItemData`) only reads a slide that CONTAINS an `<a>`, and these deliberately do
not — the one link is a sibling of the Embla track, because wrapping the track would put the
anchor around the arrows and around Embla's container. Setting `element` to the slide is what
keeps both shared renderers working anyway: `lightboxText.ts` reads its words off
`data.element.dataset`, and PhotoSwipe finds the zoom-out thumbnail with
`element.querySelector("img")`.

**The starting slide is matched by URL, not by index** — `slide.dataset.workUrl` against the
link's `href`, which `syncTrigger` keeps pointing at the visible slide. That is deliberate:
it keeps the lightbox module ignorant of Embla, the same way the rest of the pair's contract
does.

**Traps if you touch this:** the interceptor must be unbound with the lightbox (`teardown()`
handles both, on `astro:before-swap` and at the top of `astro:page-load`) or a ClientRouter
navigation leaves a listener on a dead grid. The link keeps its `href` and `target="_blank"`,
so if the interceptor ever fails to bind the click degrades to opening the original — which is
also why a modified click (ctrl/cmd/shift/alt, middle button) is passed through untouched.

**Verified on dev in the browser:** a three-image card opened at "2 / 3" with the member's
credit and caption, right-arrow went to "3 / 3" and the card underneath moved with it, Escape
closed onto that slide. The Grid wall still opens as one 44-item gallery. Josh's own iPhone
pass is the part not done.

Related: [[community-click-semantics]] (click a thing and THAT thing opens — this is the same
principle applied to the card's gallery), [[barless-lightbox-geometry]] (the geometry these
slides render into), [[vscn-gallery-tech-stack]].
