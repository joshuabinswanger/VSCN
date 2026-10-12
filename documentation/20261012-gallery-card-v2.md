# Gallery card v2 — the words beside the picture

2026-10-12. Josh's sketch ("GALLERY CARD V2"): the carousel on the left, a
text column on the right, open; under the column a foot row with the pager
"‹ 1 / 3 ›" at the picture's bottom-right corner and a filled **PROFILE →**
button at the far right; a line down the card's right edge with a chevron
at mid-height that folds the column away. It replaces the first card (name
above the picture, role under it, bio/links/tags behind a chevron) — Josh:
"i want to replace the old gallery card with the new one … i dont need both
at the same time ever".

Decisions taken in the conversation:

- **"Fold everything."** The chevron is a collapse control. Folded, the
  column AND the foot go; the card is the picture and the rail, widened to
  the slot (the first card's width formula, plus the rail). The name folds
  with the column — a folded card is nameless on purpose.
- The **profile button is filled**, not outlined.
- The pager sits at the **picture's bottom-right corner**, past its edge —
  which is the foot row's left end, on the frame's bottom line.
- The sketch's "DESIGN" label is nothing.

## Anatomy

```
.ccard (grid, position:relative, padding-right: rail)
├─ .ccard__body        col 1, rows 1–2   the frame, untouched from v1
├─ details.pdisc--column  col 2, row 1   MemberDetailPanel, column mode, open
│   ├─ summary.pdisc__toggle            THE RAIL: absolute, right edge of .ccard
│   └─ .pdisc__body
│       ├─ [lead] .ccard__head           h2 name (link) + role, slotted by the card
│       ├─ bio, links, tag chips         the panel's own
│       └─ [footer]                      unused here
└─ .ccard__foot        col 2, row 2      "‹ 1 / 3 ›" + PROFILE →
```

- **The column is `MemberDetailPanel` in a new `mode="column"`.** Same
  component the ledger rows use; same `<details>`; same chips (every chip a
  filter link). Column mode renders it `open`, drops the body's blurred
  ground and padding (sixteen always-on backdrop-filters would be a
  compositing bill for nothing — the column is the card, not a panel over
  neighbours), turns off the `::details-content` height tween (the column
  leaves sideways; a height tween under that only shows the text crumpling),
  and draws the summary as the rail.
- **The rail is positioned against the card, not the panel.** `.pdisc` stays
  `position: static`, so the absolutely positioned summary's containing block
  is `.ccard` (`position: relative`, `padding-right: --ccard-rail`), and the
  rail spans the card's full height — frame, column and foot — whatever the
  panel's own height is. `<details>` is never given a `display` other than
  block (Firefox support for flex/grid on it is not something to lean on).
- **Grid, not flex.** Frame column `--ccard-frame-w = min(cap × aspect,
  58%)`; the words take the rest. `grid-template-rows: minmax(0,1fr) auto`
  with the frame spanning both rows puts the foot on the picture's bottom
  edge when the words are shorter than the picture, and lets it follow the
  words down when they are longer (the card is out of flow in the spread, so
  growing costs the slot nothing).
- **Folded** is `.ccard:has(> .pdisc:not([open]))`: columns `1fr 0`, the
  foot `display: none`, the width formula `min(100%, cap × aspect + rail)`.
- **`--ccard-chrome` is 0** now: nothing stands above or below the frame.
  The frame cap is the slot's full height.
- **Mobile** stacks: picture, column, foot. The rail becomes a 2rem square
  at the column's top-right on the name's line (down to fold, up to unfold),
  positioned against the panel itself there. The pager's chevrons are hidden
  on phones by the pre-existing `.pager-chev` rule (no paging chrome on
  touch); the count stays.
- **The editor's preview carries the column** (CommunityCardPreview).
  MemberDetailPanel gets a `shell` prop that renders its markup empty with
  `data-ccpv` hooks and `<template>`s for link, value and tag items —
  rendered by the panel so its scoped rules reach it; a hand-written twin in
  the preview component would carry a different scope attribute and none of
  them. `renderCardPreview()` binds bio, links and tags with the
  profile-page preview's rules, and completes the toggle's aria-label from
  `data-ccpv-expand` once there is a name. Preview tags are `<span>`s, the
  button a `<span>`: nothing in an unsaved form may navigate.
- **Type.** `.ccard__profile` moved from the LINK voice to HEADING (caps,
  tracked) for the filled button. The mobile block's closed/open name and
  role sizes (`fs-105` closed, `fs-160` open) went: there is no closed
  caption any more, so the name speaks NAME at every width.
- **The directory controller no longer folds disclosures on a view switch.**
  That reset existed so a panel opened in the spread was not still open on
  the way back; the only disclosures in the grid are now the columns, open
  by default, and folding them would return the visitor to a spread of
  nameless pictures.
- New string `community.card.profile` ("Profile" / "Profil"); the arrow is
  markup, `aria-hidden`. `community.card.viewProfile*` stay for the ledger.

## Two traps met while building it

- **A column flex box inherits the grid's `align-items: start`.** On mobile
  the card switches from grid to `flex-direction: column`; `start` on the
  cross axis shrinks each item to its in-flow content, and the frame's
  wrapper has none (the track is absolutely positioned), so the picture
  rendered 0 × 0. The mobile block restates `align-items: stretch`.
- **The dev project's export credential fails locally** (`16 UNAUTHENTICATED`
  from Firestore for `.env.development`'s service account; the prod one in
  `.env` works). The local look was taken on the prod snapshot with
  `astro dev --mode production`. Not touched here; the dev key wants
  checking in the console.

## Open

- **Slot widths.** The spread deals 8–9 of 24 columns, ~600px at 1440; the
  picture gets 58% of that (~340px) and the words ~230px. The sketch's
  proportions, at a smaller scale than the first card's full-slot picture.
  If the card wants more room, the spread pattern is what to redraw (the
  Affinity workflow), not the card.
- The ledger's "View profile" is still the underlined line; whether it
  should become the same filled button is not decided.
