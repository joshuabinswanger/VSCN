> Mirror of the `~/.claude` memory file `barless-lightbox-geometry.md` — readable without access to Josh's user profile.

---
name: barless-lightbox-geometry
description: "The lightbox's words hang off the picture's rect from JS, so paddingFn and the placement function break together; the reserve is SYMMETRIC (picture, not picture-plus-words group, sits on the window's centre) and was then bumped ~20% to shrink the picture a bit"
metadata: 
  node_type: memory
  type: project
  originSessionId: 518ce24d-1209-4699-96da-58481bea6b94
  modified: 2026-09-08T15:15:00.000Z
---

Since 2026-09-04 the lightbox has no caption band. The artist, caption,
description and link are absolutely positioned from `pan` / `currZoomLevel` off
the picture's rendered rectangle by `attachPlacement()` in
`src/lib/lightboxText.ts`, and `lightboxPadding()` in the same file reserves the
space they land in — UNDER the picture for every shape since 2026-09-06 (Josh:
"put the text always below the images"); from 09-04 to 09-06 a portrait picture
got a right-hand column instead.

THE RESERVE IS SYMMETRIC SINCE 2026-09-08, and the reason is the whole trap in
this function: PhotoSwipe fits the image inside the viewport MINUS the padding
and then CENTRES it in what is left, so the pair's SUM sizes the picture and
their DIFFERENCE places it. With 56 over and 192 under, half of that 136px
difference lifted the picture 68px above the middle of the window — measured at
1440x900: picture top 56, bottom 708, centre 382 against a window centre of 450.
What looked centred was the GROUP, picture and words together (56px of paper
above, 63px below). Josh: "the image only should define the centering of the
content." So top and bottom became the SAME number — `RESERVE_LANDSCAPE`,
`RESERVE_PORTRAIT`, `RESERVE_MOBILE` — currently 150 / 188 / 116 after the
2026-09-08 size trim below.

EACH WAS HALF THE OLD SUM — 124+124 was 56+192, 156+156 was 56+256, 97+97
was 44+150 — which is the point: the picture came out at exactly the size it
did before centring and only moved. THEN BUMPED ~20% on 2026-09-08 (second
pass), Josh: "make the image a bit smaller" — 124→150, 156→188, 97→116, same
number top and bottom throughout, same 56/44 floor. Measured at 1440x900 on a
landscape: picture 720×600 (was 782×652), centred exactly on the window's
midline both times. What pays for a bigger reserve is the room under it: a
landscape's words now get ~120px of usable height (was ~94, was ~162 before
centring), so a caption with a description of any length still hits the
scroll-and-fade in lightbox.css more often than the pre-centring layout did.
The lever either direction is the same: raise or lower BOTH numbers together,
which trades picture size for room under it (or the reverse).

THE TOP ROW HAS NO BAND (2026-09-06, Josh: "lose the top bar in lightbox"). The
controls all survive — close word, zoom, counter, preloader — but on the bare
paper, gathered in ONE cluster at the top right (the preloader's
`margin-right: auto` from PhotoSwipe's sheet is zeroed, which is what used to
hold the counter at the left). The artist line lives above the picture's
top-left corner, so the left must stay empty. `top` used to BE that row's
height, 56 desktop / 44 phone; since the symmetric reserve it merely CLEARS it,
and 56/44 is a FLOOR nothing in `lightboxPadding` may fall below or a wide
picture runs under the close word. And `--pswp-placeholder-bg` is `transparent`
(Josh: "lose the grey frame"): PhotoSwipe painted a `--color-border` div at the
incoming picture's box until it decoded, which read as a grey frame on every
page.

**Why:** a band made the words belong to the window rather than the artwork, and
beside a portrait image it ran a paragraph across the bottom of the screen with
empty paper either side of the picture it described. Josh: "lose the bars".

**How to apply:** the two halves are one contract and will break together
silently. The placement function owns `left`/`top`/`width`/`max-height` as
inline styles — no CSS rule may set those four. Mobile is knowingly
under-reserved and scrolls. A PhotoSwipe upgrade that renames `pan` or
`currZoomLevel` breaks the layout rather than degrading it. The shape split
survives the symmetry change for the same reason it existed: an upright picture
is height-bound, comes out narrow (a 2:3 image in a 900px window is ~390px
wide), and wraps the same words taller — roughly 85,000 ÷ measure px for a
worst-case block.

MEASURE IT, DON'T EYEBALL IT. The browser pane freezes PhotoSwipe's opening
transition at frame zero, so `.pswp__img` reads at the THUMBNAIL's rect for as
long as you wait; dispatching a `resize` on the window settles it to the real
geometry in one step. See [[browser-pane-frozen-timeline]].

Both galleries share one renderer — `registerLightboxText()`, called from
CommunityGrid.astro and members/[slug].astro, which each carried a ~90-line copy
before. Related: [[image-descriptions-long-and-short]] (the short field this
work removed), [[community-click-semantics]] (the credit is still the route to
the person).
