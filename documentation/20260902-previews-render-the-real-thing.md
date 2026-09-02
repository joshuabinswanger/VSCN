# The previews render the real thing (2026-09-02)

Seven changes from one round of Josh's feedback. Two of them are architectural
and are the reason this note exists; the rest are recorded so the numbers are
not re-derived later.

## 1. The editor's previews stopped being lookalikes

The profile editor showed two previews. Both had drifted from what they claimed
to show, in the same way and for the same reason: each carried a design of its
own that tracked the real rendering **by hand**.

The profile-page preview was fixed on 2026-09-01 by moving the page's rules
into `src/styles/profile.css` and having both the page and the preview import
it — one stylesheet, two consumers. That worked, and this round applies the
same mechanism to the directory card, plus finishes the first job:

> "preview atilll wrong. make the preview be exactly the profile page
> seperated only by horizontal bars"

The page was correct by then; what was still wrong was everything **around**
it. It sat inside a white sheet with a hairline border and `clamp(1.25rem, 5vw,
3rem)` of padding, under a micro-label reading "VISITOR VIEW" and a sentence
explaining what a preview is, and with the page's own `padding-block: 3rem
10rem` zeroed by a `--preview` modifier to compensate for the sheet's padding.
A page inside a bordered box is a screenshot of a page. All of it is gone; what
is left is an `<hr>` above and an `<hr>` below, and the page's own measure and
placement in between. The two "YOUR PROFILE PAGE" / "IN THE DIRECTORY"
headings went with it — four translation keys are now unused and were removed
from both locales.

**Consequence to know:** the preview now shows the page's real 10rem of bottom
padding. That is deliberate, and it is what "exactly the profile page" means.
If it ever reads as a hole, the fix is on the page, not in the preview.

## 2. The card preview got the card's carousel

> "carousel shouls be the same elemnt in preview as well"

The directory card pages a member's whole gallery. The preview's `.ccpv__*`
shell held **one** image in a frame of its own, so a member with six uploads was
shown a card that could never show the second — the one thing the card actually
*does* was the one thing the preview could not.

Fixed with the `profile.css` mechanism, twice over:

- **`src/styles/communityCard.css`** — the `.ccard__*` rules, out of
  `CommunityImageCard.astro`'s scoped `<style>` and imported by both that card
  and `CommunityCardPreview.astro`.
- **`src/lib/communityCarousel.ts`** — the Embla wiring, out of that card's
  `<script>`, imported by the card and by `renderCardPreview()`.

`CommunityImageCard.astro` went from 958 lines to 359 and is now markup plus
two rules.

### Three things in there that are not obvious

**Two rules had to stay scoped in the card.** `.ccard__caption-row .pdisc` and
`.ccard__caption-row .pdisc__toggle` reach into `MemberDetailPanel`'s classes.
In a plain stylesheet they lose Astro's scope attribute and land at (0,2,0) —
a **tie** with that component's own `.pdisc__toggle` rule, leaving the winner to
source order between two stylesheets. Scoped, they are (0,3,0)-plus-attribute
and win outright. (See the specificity note in CLAUDE.md.) The preview renders
no disclosure, so it needs neither.

**`destroyCarousel()` clears `data-ready` unconditionally, before anything
else.** `initCarousels()` sets that guard *before* deciding whether a frame is
worth an Embla instance — a gallery of one gets the flag and no instance. Had
the guard only been cleared when there was something to release, the preview's
frame would have been permanently marked ready after the member's **first**
image and would never have paged once they added a second. This was a real bug
during the change, caught by adding a second image in the harness.

**The track is rebuilt only when the gallery's signature changes.**
`renderCardPreview()` runs on every keystroke in the form. Rebuilding the
slides each time would destroy the Embla instance, throw the member back to
image 1 and re-decode every picture while they typed. The signature is the
URLs, dimensions, captions and descriptions, so a caption edit still lands.

**Still a mirror:** the no-artwork (typographic) face is unchanged — it is
still `.ccpv__tframe` tracking `CommunityTextCard` by hand. It has no carousel
to get wrong, so it was left; extracting that component's rules the same way is
the obvious next step.

## 3. Uploads: 4K, and the ceiling that moves with it

> "raise file size limit (images get optimized anyways, cap max res at 4k)"

- `MAX_EDGE` in `gallery.ts`: 2000 → **4000**.
- `MAX_RAW_BYTES` (raw upload, before the re-encode): 25 MB → **50 MB**.
- `MAX_AVATAR_BYTES`: 10 MB → **25 MB**. Both messages are now derived from
  the constants rather than typed as literals, which is how the old ones
  outlived a previous change.

**`storage.rules` had to move with it, and this is the trap.** The gallery rule
capped an upload at **2 MB**, sized for a 2000px WebP. Four times the pixels is
roughly four times the bytes, so most real artwork at 4000px would have been
rejected *there* — and a Storage rule rejection surfaces as an opaque
permission error that says nothing about size, the same class of silent failure
as the `hasOnly` trap in `firestore.rules`. Raised to **8 MB**.

**So the client change is inert until `storage.rules` is deployed.** Deploying
the site alone gives members a 4K encoder and a 2 MB door.

There is still a decode limit (50 MB) rather than no limit, for the reason
every image note in this repo gives: decoded-image memory is what crash-loops
iOS Safari.

## 4. Cropping is gone

> "drop cropping"

`openImageEditor()` is rotate-only. The drag-a-rectangle crop was the one thing
in the pipeline that could throw away picture, irreversibly — only the cropped
result is uploaded — and it contradicted every surface on the site, all of which
frame artwork at its true aspect and narrow tall work rather than cutting it.
Rotation stays because it *fixes* an image rather than editing it. The canvas
lost its `cursor: crosshair` and `touch-action: none` with the gesture.

## 5. The mobile header seam

> "gap betweeen info community login and filters should be 0px so i dont see
> images scroll behind it"

Measured first: on desktop the bar already docks 6px into the nav, and on
mobile `top` was the nav's height **exactly** — the two boxes shared an edge to
the subpixel. A shared fractional edge rounds to a one-device-pixel hairline
that neither box paints, on every fractional-DPR screen, and artwork scrolling
under the header shows through it as a moving line. Josh confirmed he was
seeing it on his phone.

An overlap cannot round to a gap; a shared edge can. The mobile dock is now
2px into the nav (`top: calc(0.9 * var(--font-size-base) + 10px)` with a
matching `margin-top: -2px`, because `top` governs only the docked position).

**2px is the whole budget:** the mobile nav pads its bottom by 7px and its
active underline sits at `bottom: 4px` in a 1.5px band, so anything past 2px
starts painting over the indicator that says which page you are on. If
Navbar's padding or that offset changes, both this and the desktop figure
change with it.

## 6. The grid wall's label sits on its picture

> "grid gap of name to inage less"

`.cwork__caption` padding-top 0.4rem → 0.15rem, and the mobile author line's
own 0.15rem → 0. It was two gaps for one job, at paragraph spacing, under a
label that belongs to the picture above it.

`--cwork-chrome` deliberately did **not** come down by the same 0.25rem: it is
the height the wall reserves for the block, the figure is stated twice (here
and in CommunityGrid's `--cgrid-row`), and over-reserving costs a little air
while under-reserving costs the drawing.

## 7. The index row is the person, and the way out is in the dropdown

> "tags index right after name should disappear" / "index view profile in the
> dropdown content"

The ledger row printed the member's first three tags as a second, right-ranged
column. Gone: three truncated fragments of a member's own vocabulary said less
than the name already does, and repeated a list the dropdown prints in full a
few pixels below. Nothing was lost — the tag **filter** reads `data-tags` on
the row, never the printed field.

"View profile" moved from the summary line into `MemberDetailPanel`'s `footer`
slot, which is where the image cards already put it. Every disclosure on the
site now ends the same way.

**The one exception, and it is load-bearing:** a member with neither a profile
picture nor anything to disclose renders the *static* line, not a disclosure —
no panel, so no footer. Their link stays on the line, or they become the one
member in the ledger with no route to their page. `CommunityGrid` mirrors
`MemberDetailPanel`'s own `show` test to decide; if that test changes, this
changes with it.

With the field and the link both gone from the line, the row is two items —
name-and-role, and the chevron — so the summary is a **flex row** rather than a
four-track grid. Not cosmetic: the static row still has three items, and on a
fixed track list that row would need per-row placement while every disclosure
row paid a 1.5rem gap for an empty track it could not collapse.
