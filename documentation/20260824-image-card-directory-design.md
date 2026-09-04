# Graduating the image cards to the real community page — design

Date: 2026-08-24. Status: **implemented, with one decision reversed since.** Steps 1-6
below have landed on dev.

## Amendment, 2026-08-24 — the filters are gone for now

Conflict 1 was resolved as (a) multicol, and shipped that way. The filter rows themselves
have since been taken back out: at 21 profiles the directory reads whole, and two rows of
chips above it cost more attention than they save. That is option (c), taken as a
deliberate "not yet" rather than a permanent regression — their markup, styles and wiring
are preserved on the branch `feat/community-filters` and should come back when the list
grows past browsing length.

Multicol stays regardless, and not only as a leftover of a decision that no longer
applies. It keeps DOM order equal to reading order (which the build-time lanes broke), it
keeps JS off the layout critical path, mobile was already `columns: 2` so it is proven in
this codebase, and hiding-a-cell-and-repacking remains available for when the filters
return — something the lanes could never have supported.

One trap the multicol choice carries, found while widening the vertical stagger: a
`margin-top` on a column child is not a usable offset. It collapses against the preceding
card's `margin-bottom` (so any value below `--pgap-y` disappears) and Chrome discards it
entirely on the first card of columns 2 and 3, which is exactly where the stagger is most
visible. The per-card offset is `padding-top` for that reason.

Decided: the gallery is canonical from the next release. `/community` moves to the
image-led cards plus real member profile pages, and cards upgrade from typographic to
image as members upload. Starting mostly-typographic is accepted
(see `20260824-profile-preview-mode.md` for the measurement: 21 active profiles, 0
galleries today).

## What the swap actually is

Not a component substitution. The prototype has the **visual language**; the production
grid has the **behaviour**. Both have to survive, and they conflict in three places.

`CommunityGrid.astro` carries, and none of it exists in the prototype:

- the member count in the `<h1>`, live-updating as filters change
- two filter rows (member type, openTo) driven by `data-member-type` / `data-open-to`
- a random shuffle on every page load
- empty state, no-results state, and the signed-out signup CTA

`ProtoGrid.astro` carries, and none of it exists in production: unequal lanes, per-card
width/offset tiers, scroll-linked card growth and per-lane parallax, and the
image-card / typographic-card split.

## Conflict 1 — filtering vs lanes (the real blocker)

`ProtoGrid` round-robins members into lanes **at build time**, and each card carries a
margin offset. `CommunityGrid` filters by setting `hidden` on cards, letting a plain CSS
grid reflow. Hide a card inside a lane and the lane keeps its height contribution pattern:
you get holes, and the lanes go visibly unbalanced. Filtering a build-time-distributed
masonry cannot work by hiding alone.

Three ways out:

- **(a) Desktop switches to CSS multicol — `columns: 3` with `break-inside: avoid`.**
  Filtering then works natively, because a hidden card simply leaves the flow and the
  columns repack. The per-card width and horizontal-offset variety (`--cw`, `--ax`, `--my`)
  is unaffected, and that is most of what makes the grid read as irregular. **Cost:** you
  lose *per-lane* parallax, because there is no lane box left to translate. Per-card
  parallax keyed to index is available as a substitute.
- **(b) Keep lanes, re-distribute them in JS on every filter change**, then rebuild the
  ScrollTriggers. Preserves the design exactly. **Cost:** the layout becomes
  JS-dependent, there is a visible re-flow on each filter click, and the ScrollTrigger
  teardown/rebuild path — already the most delicate code in the prototype — now runs on
  user input rather than only on navigation.
- **(c) Drop the filters.** Cheapest, and a real feature regression.

**Recommendation: (a).** The prototype's own mobile layout is already exactly this
(`columns: 2`), so it is proven in this codebase rather than speculative; it removes JS
from the layout critical path instead of adding it; and it keeps every part of the
irregularity except the one effect that can be reintroduced per-card. Parallax is worth
having, but it is not worth making the layout depend on JS and re-running the trigger
rebuild on every filter click.

## Conflict 2 — artwork-first ordering vs the random shuffle

`ProtoGrid` sorts members artwork-first, so image cards lead the page. `CommunityGrid`
shuffles randomly on every load, so nobody is permanently buried.

While galleries fill gradually these actively fight: artwork-first permanently ranks
whoever uploaded first above everyone who hasn't, and the shuffle that was protecting
fairness is gone.

**Recommendation: shuffle *within* tiers** — random order, but image cards ahead of
typographic ones. It keeps the page's strong visual opening, keeps ordering fair inside
each group, and it makes uploading visibly worth doing, which is the behaviour you want
during the fill-up phase. Revisit to a pure shuffle once most members have artwork.

## Conflict 3 — GSAP on a production page

The scroll-linked growth and parallax cost **~44 KB gzip** (27 core + 17 ScrollTrigger),
desktop-only, dynamically imported. Right now GSAP ships **zero bytes** on the live site,
because nothing imports it any more — so `/community` would be the first page to pay this,
and it is the site's most-visited page.

**Recommendation: keep it**, desktop-only and behind the reduced-motion gate as the
prototype already does. The growth-on-approach is the design, not decoration. But the cost
is real and worth stating out loud rather than discovering in a Lighthouse run.

## Smaller decisions worth taking now

**Route naming — there is a trap here.** `astro.config.mjs` filters the sitemap with
`!page.includes('/profile')`, to keep the private editor out. Real member pages at
`/profile/<id>` would be caught by that same test and **silently excluded from the
sitemap** — the exact opposite of what public profiles want. Recommend `/members/<id>`
(with `/de/members/<id>`), which sidesteps the collision instead of complicating the
filter.

**The lightbox.** `embla-carousel` and `photoswipe` are imported by `MemberCard` and
nowhere else, so dropping that card strands both dependencies. The image card's arrow
carousel replaces Embla outright. But click-artwork-to-view-full-size is a real feature
that should not vanish — recommend PhotoSwipe moves to the profile page's works, and
`embla-carousel` is removed from `package.json`.

**Graduation debts the prototype components must clear before they are production.**
`CLAUDE.md` names these explicitly as things not to let leak:

- Empty `alt` on every image. Real cards should use the gallery item's `caption`, and fall
  back to something meaningful rather than `""`.
- The member name is a `<p>`, not a heading. The directory needs a real heading level.
- Hardcoded English strings (`"Previous image"`, `"Next image"`, `"View profile: …"`) need
  i18n keys in both locales.
- DOM order diverges from visual order under lane distribution. Multicol (Conflict 1a)
  keeps DOM order intact, which resolves this as a side effect.
- Gallery images are **Firebase Storage remote URLs**, not static files. They must go
  through `getImage` from `astro:assets` at build time, the way `MemberCard` already does —
  the prototype's plain `<img src>` works only because its images are local files in
  `public/`.

## Shape of the implementation

1. `publicProfiles` doc → card/profile view model adapter, reusing the caption trim from
   `scripts/gen-proto-real-data.mjs` and the existing `ProfileViewModel`.
2. Production image card + typographic card, taking the view model, with the debts above
   cleared and `getImage` for gallery URLs.
3. Production grid: prototype's visual language, `CommunityGrid`'s behaviour, multicol
   per Conflict 1.
4. Member profile pages at `/members/<id>`, both locales, with the PhotoSwipe lightbox.
5. `/community` switches over; `MemberCard`, its preview binding (`updatePreview`) and
   `embla-carousel` are deleted together; the editor's directory-card preview switches to
   the new image card.
6. Delete the prototype: `src/pages/proto/`, `src/lib/proto-*`, `public/proto/`, and the
   sitemap/`contentWide` special cases that exist only for it.

Steps 1–2 are safe to start under any answer to the three conflicts. Step 3 depends on
Conflict 1, and step 5 is the irreversible one.
