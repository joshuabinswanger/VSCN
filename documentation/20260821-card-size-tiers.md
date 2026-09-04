# Card size tiers on `/proto/community`

Card width on the prototype grid used to come from an arbitrary cycling
table (`VARIANTS` in `ProtoGrid.astro`) — purely decorative irregularity,
unrelated to what a member's profile actually held. Changed it so width is
now driven by how filled-in the profile is.

## The rule (`getCardTier` in `src/lib/proto-data.ts`)

- **large** — has curated artwork (`images.length > 0`). Unchanged from
  before: this is still the only signal that decides `ProtoMemberCard` vs
  `ProtoTextCard`.
- **medium** — no image, but at least one link (`portfolio` or
  `socialMedia`) **and** two or more tags.
- **small** — everything else (bare name/role/description, or only one of
  link/tags).

`ProtoGrid.astro` picks each cell's `(cw, ax, my)` from a tier-keyed variant
table (`TIER_VARIANTS`) instead of one shared list, so the composition
variety (asymmetric offsets, vertical stagger) is preserved within a size
class instead of being flattened. `data-tier` is stamped on `.pgrid__cell`
for inspection; nothing currently reads it besides devtools.

Desktop only, matching the existing convention that "irregularity off on
mobile" — the mobile masonry stays a uniform 2-up regardless of tier.

## Finding: `medium` is currently unreachable with real data

Checked against all 21 active members: the 5 without artwork are Anna
Bürgisser (7 tags, no link), Esther Schönenberger (3 tags, no link),
Gabriela G. and Karin S. (each has a link, zero tags), and Tara (neither).
Nobody currently has **both** a link and 2+ tags, so every text-only member
renders at `small` today. The tier and its CSS exist and are exercised by
type-checking, not by the live page — `medium` will only appear once a
member's profile has both. Left as specified (AND, not OR) rather than
guessed at; flag to Josh if the intent was for either condition alone to
qualify.

## Bug caught during verification

Shrinking `small` cards down to ~130px (mobile-viewport-sized, but on
desktop) overflowed `.ptcard__frame` by a few px on Tara's card — the
`role`-mode fallback text (`.ptcard__bigrole`, 1.6rem) had no
`overflow-wrap`, unlike the tags-mode `.ptcard__tagline`. Added the same
`overflow-wrap: anywhere` there. Verified via computed `scrollWidth` vs
`clientWidth` on the frame at 1280px viewport (all five `small` cards, 0px
overflow) and confirmed no `.page-wrap` horizontal scroll at 1280 or 375.

## Not done

No screenshot-based visual review — only computed-size and overflow checks
via JS in the running dev server. Whether the size gap between tiers *reads*
right (the `large` and `small` ranges overlap slightly, since width is a
fraction of each lane and lanes differ in base width) is a call for Josh to
make by eye, same as the still-open tag-rail decision.
