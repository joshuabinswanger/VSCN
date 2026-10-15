# Portfolio pages — one member per screen

2026-10-15. Josh: "I want to create a new portfolio page. I want the card to be
full frame kinda and on scroll the next card comes in. Also we can then layout
all the text already." Decisions taken in the conversation, in order:

- **One card per member** (not one per work of a single member).
- **It replaces the Portfolios view** of `/community` outright, the way card
  v2 replaced v1 — never both. The view drop-up, the tag filter and the sort
  stay.
- **The picture is a horizontal scroll-snap carousel** of the member's works:
  swipe sideways between works, scroll down to the next member.
- **Layout A**: picture left, words column right, "with the styling we have
  atm" — card v2's column, nothing folded.
- **Motion**: "smooth transition animation with a flourish" — entry 2 (the
  picture leads, the words follow) with exit 1 (the leaving card shrinks and
  dims). Picked from four live scrollers in the brainstorm companion.

## The modern way, and why

No scroll library and no scroll hijack. Three native pieces, each with a
precedent in this repo:

- **CSS scroll-snap** pages the members: `scroll-snap-type: y mandatory` on
  `.page-wrap` (the real scroll container — Layout.astro, "Layout and
  scrolling"), each member a full-height section with `scroll-snap-align:
  start`. Wheel, trackpad, touch, keyboard and PageDown all page natively.
  `MemberProject.astro` already snaps its carousel this way.
- **Scroll-driven animations** (`animation-timeline: view()`) draw the
  flourish. `CommunityGrid.astro` already runs its wall fade on one, and
  `SiteFooter.astro` records the fallback: a browser without `view()` gets
  the plain snap, which is the complete, un-animated experience and the
  no-JS one.
- **Native x-axis snap** for the works row, in place of Embla for this card.
  The chevrons scroll it; the count follows the scroll position.

Rejected: GSAP ScrollTrigger pin + snap (ships already, animates everywhere,
but it hijacks the scroll, fights iOS momentum and the Browser pane cannot
verify it), and a nested scroller inside the view (isolated, but it breaks
the one-scroller rule, scroll restoration and the footer reveal).

## The frame

A card's frame is the viewport minus the chrome that floats over it: the
header row at the top (`--header-h`, 56px desktop / 48px phone, no fill) and
the community bar at the bottom (a fixed island, `.community-bar`). So:

- `.page-wrap[data-snap="y"]` gets `scroll-snap-type: y mandatory` and
  `scroll-padding-top: var(--header-h)`, so a snapped card's top edge lands
  under the header, not behind it. The attribute is set by
  `communityDirectoryController.ts` when the view is applied and removed on
  `astro:before-swap` and when another view is chosen; the Images and People
  views scroll exactly as today.
- The card section is `min-height: calc(var(--shell-h) - var(--header-h))`
  with bottom padding that clears the bar (its height plus its offset, as a
  custom property the bar already positions by). On desktop a card is exactly
  that tall; on a phone it may grow when the bio runs long, and the snap
  stays `mandatory` — Chromium and WebKit let the reader scroll freely inside
  a snap area taller than the scrollport.
- `.page-wrap`'s own bottom padding and the footer remain. The last card is
  followed by the footer as on any page; the snap's `proximity` is not
  needed, the footer simply sits after the last snap stop.

## The card (layout A)

Desktop, a two-column grid filling the frame:

```
.cpage (section, snap stop, min-height = frame)
└─ .cpcard (grid: minmax(0,1fr) var(--ccard-air) var(--cpcard-side-w); height 100%)
   ├─ .cpcard__pic      col 1   the works row + the pager at its bottom corner
   │   ├─ .cpcard__row  (overflow-x:auto; scroll-snap-type:x mandatory; display:grid; grid-auto-flow:column; grid-auto-columns:100%)
   │   │   └─ a.cpcard__slide × n   (one per work; the lightbox trigger, data-pswp-* as today)
   │   └─ .cpcard__pager            "‹ 1 / 3 ›" — src/lib/pager.ts, same as card, carousel and lightbox
   └─ .cpcard__words    col 3   name + role, bio, links, tags, PROFILE → (last line)
```

- The words are card v2's column, open and static: no `<details>`, no
  `<summary>`, no fold, no rail, no chevron. Name and role at the top; bio;
  links; tags as chips (the ones that route to Portfolios, see
  `links.ts`); the filled **PROFILE →** as the last line. Voices unchanged
  (`type.css`): the card name `--fs-100`, the card bio `--fs-95` on desktop.
- The column is `--cpcard-side-w: 20rem` as today; the air between picture
  and words is card v2's `--ccard-air`. The picture fills the frame's height
  and whatever width is left, each slide `object-fit: contain` on the paper
  (no crop — the work's own aspect decides), so a tall work stands centred
  with air beside it and a wide one spans the column.
- **Phone**: one column, picture over words. The picture is a fixed share of
  the screen (60% of the frame), the words below it; the card grows if the
  words need more. The pager stays at the picture's bottom corner; the count
  is the swipe's feedback.
- The pager's chevrons `scrollBy` one slide (`behavior: "smooth"`). The count
  updates from an `IntersectionObserver` on the slides (threshold 0.6, root
  the row) rather than `scrollend`, which Safari delivered late. Without JS
  the row still swipes; the chevrons do nothing, harmlessly, as the bar's
  controls do.
- **The lightbox and click semantics are unchanged**: a slide opens
  PhotoSwipe paging the whole card's slides (`lightbox.ts`,
  "gallery-card-lightbox-all-slides"); the name, the picture's caption line
  and PROFILE go to the member's page; a tag chip filters Portfolios.
- **Images load lazily**: the first card's first slide eager with
  `fetchpriority="high"`, everything else `loading="lazy"`. No
  `content-visibility` — it contains size, and a card whose size is the
  frame has nothing to gain from it while a wrong intrinsic size would move
  the snap stops.

## The flourish

All CSS, all on view timelines, inside `@supports (animation-timeline:
view())` and off under `prefers-reduced-motion: reduce`:

| element | timeline | range | from → to |
|---|---|---|---|
| `.cpcard__pic` | `view()` | `entry 0%` → `entry 100%` | `translateX(-6%) scale(.97)`, opacity .3 → none, 1 |
| `.cpcard__words` | `view()` | `entry 35%` → `entry 110%` | `translateY(22px)`, opacity 0 → none, 1 |
| `.cpcard` | `view()` | `exit 0%` → `exit 100%` | none, 1 → `scale(.96)`, opacity .35 |

The section (the snap stop) is never transformed, so the snap geometry stays
exactly what layout says. The amounts are the brainstorm demo's and are
tunable; the character is fixed: the picture arrives first, the words settle
a beat later (the same stagger card v2's fold used), the card leaving shrinks
and dims.

`view()` resolves against `.page-wrap` as the nearest scrollport, which is
why the attribute goes on `.page-wrap` and not on a wrapper. On a phone the
card can be taller than the frame; the entry range then runs over a longer
scroll, which is fine — the words still finish arriving while the top of
the card is on screen.

## What it replaces

The Portfolios view today is the **spread**: Affinity-drawn slot patterns,
lanes, GSAP parallax, and card v2 with its fold. Replacing it makes these
dead for `/community`:

| gone | still needed by |
|---|---|
| `GALLERY_PATTERNS.spread`, `layOutSlots`, `laneOf`, the strip (`STRIP_*`, `layOutStripIndex`, `.cgrid__strip`) in `communityLayout.ts` | — (the Images wall uses `layOutWall`, which stays) |
| the spread half of `communityMotionController.ts` (the parallax `AMPS`, the lane dealing) | the wall's fade-in stays; GSAP stays imported for it |
| `cardFold.ts` and the `pdisc--column` fold in `communityCard.css` (rail, chevron, bar, `--ccard-role-w`) | **the editor's card preview** — see below |
| `communityCarousel.ts` (Embla) for the community card | the editor preview and the lightbox's carousel refresh — keep until the preview follows |
| "arrive on their cover", the phone's scroll turn, the mobile fade-out under the bar | — |

Delete in the same change what nothing else imports; leave what the editor
preview still renders, with a note, rather than half-removing it. The view
keys: `ViewName` gains `"pages"` and loses `"spread"` and `"strip"`;
`DEFAULT_VIEW` and `TAG_CHIP_VIEW` become `"pages"`; `?pattern=spread` in
old links is read as `pages` (the absent-parameter trap in
"community-default-view-index" still holds: a link to the default view
carries no parameter).

**The editor's card preview** (`CommunityCardPreview.astro`,
`renderCardPreview()` in `profilePreview.ts`) renders the real community
card so a member sees what the directory will show. It must render the NEW
card: the same component in a `shell` mode, at the preview's width, static
words, the works row swipeable. Card v2's fold and Embla then have no
importer left and go too. If that proves to be a second feature in size, the
preview ships with the old card for one release and the removal waits — but
the directory never shows both.

## What does not change

- `/community` and `/de/community`, the SEO JSON-LD, the build-time snapshot
  (`fetchMemberViews`), `localizeMember`, `workCaption` / `workDescription`.
- The bar: tags drop-up, view drop-up, sort (`?sort=` since `8173855`), the
  Images and People views and their layouts.
- Filtering: a tag hides the cards that do not carry it (`hidden` on the
  section), the stack re-snaps from the top (`scrollTo({top: 0, behavior:
  "instant"})` — `.page-wrap` has `scroll-behavior: smooth`, so a plain
  `scrollTop =` would not land).
- Back navigation: views stay real `navigate()` entries.
- Strings: none new. The pager, PROFILE, the alt fallback and the lightbox
  strings exist.

## Testing and verification

- Unit (`tests/unit/`): the pager count from a scroll position; the view-key
  mapping (`spread` → `pages`, absent → default); the snap attribute set and
  cleared by the controller.
- `npm run verify` and `npm run build` in the worktree (needs
  `.site-data.json` copied from a sibling, `generatedAt` bumped).
- Built CSS checked for the `animation-timeline` longhands surviving the
  minifier ("minifier-folds-animation-timeline": use longhands, verify the
  built file).
- Playwright walk on the dev host at desktop and iPhone widths with real
  wheel and touch gestures: snap lands under the header, the words arrive
  after the picture, the pager counts, a tag filter re-snaps to the top, the
  lightbox pages the card's slides, the footer is reachable after the last
  card. The Browser pane freezes `view()` timelines and is not evidence for
  motion.
- Merge straight to dev; Josh checks on his phone.

## As built (2026-10-15, branch `feat/portfolio-pages`)

What differs from the design above, and why:

- **The slides are the links.** The card's click overlay (`.ccard__frame-link`)
  is gone: an overlay above a native scroller eats the scroller's touch pan, so
  each slide is an `<a>` to its original upload and the lightbox's `CARD_TRIGGER`
  reads `.ccard__slide`. The showing slide is the one tab stop (the engine moves
  the `tabindex`); the lightbox finds its start slide by the trigger's own
  `data-work-url`.
- **One engine for the card and the editor preview.** `communityCarousel.ts`
  keeps its exports and markup contract but is native x-snap now; Embla is
  uninstalled. The count follows the track's `scroll` event (rAF-throttled),
  not `scrollend` and not an IntersectionObserver — the position is all it
  needs. The spread's prime/turn/back-to-cover behaviour is gone with the
  spread.
- **The phone snaps the document.** On a phone `html` is the scroller (global.css
  gives it its overflow back so Safari can retract its toolbar), so the snap
  rule stands on `html:has(.page-wrap[data-snap="y"])` there as well as on
  `.page-wrap` for the desktop. The attribute stays the one switch.
- **No colour fills behind the pictures.** `object-fit: contain` letterboxes,
  and the dominant-colour placeholder filled the letterbox; the frame and the
  slides sit on paper. (The wall's tiles keep theirs.)
- **Longhands only for the flourish.** The minifier folded a following
  `animation-timeline` into the `animation` shorthand, which no browser accepts;
  `animation-name` / `-timing-function` / `-fill-mode` / `-timeline` / `-range`
  survive (checked in the built CSS).
- **The pages' cell rule must not outrank `[hidden]`:** the wall's tiles are
  `hidden` siblings in the same grid; the cell rule is written
  `:not([hidden])`.
- **The editor preview** renders the new card in a 30rem frame of its own
  (`--cpage-h` on `.ccard--preview`, words column 16rem). Card v2's fold,
  column mode and `cardFold.ts` are deleted; `MemberDetailPanel` gained
  `mode="plain"`.
- **Removed:** the slot tables, lanes, strip, the spread's GSAP parallax, the
  mobile cell fades, the `?grid` debug outline, and the motion controller now
  bails unless the wall is on screen.
- **Left for a later pass:** the base `.cgrid` 24-column declarations and the
  out-of-flow `.cgrid__cell > .cwork` rule that the wall still sits on; the pages
  block overrides what it needs. Not touched because the Images view was not in
  scope and its rules interleave with them.
- **Not walked yet:** Safari/iPhone, and the flourish on a real wheel (the
  Browser pane freezes view timelines). The dev-host Playwright walk follows
  the merge.
