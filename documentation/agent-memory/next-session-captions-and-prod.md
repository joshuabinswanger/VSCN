<!-- Mirror of ~/.claude/projects/D--SynoDrive-VSCN/memory/next-session-captions-and-prod.md — kept in the repo so any
     Claude instance can read it without access to the user profile. Edit both copies. -->

---
name: next-session-captions-and-prod
description: "Captions RESOLVED 2026-09-06: placeholder-marked, mixed-language per work, seeded and live on dev. Prod is the remaining open item and is still a separate, big session."
metadata: 
  node_type: memory
  type: project
  originSessionId: 27db63c3-6df6-4f30-acb9-2466a42f260a
  modified: 2026-09-06T16:03:26.132Z
---

## Captions on dev: DONE, live, and reversible

Josh chose **placeholder-marked** (option 1 of the fork this note used to hold),
with the language picked **per work** rather than per member. Seeded on
`vscn-dev-f4b60`, hosting rebuilt and deployed, verified on the live site:
**47/47 images carry a caption**, where `data-pswp-caption` previously appeared
zero times. All three surfaces show it — the directory card, the member page
under the image, and the barless lightbox (credit → caption → description).

`scripts/seed-image-descriptions.mjs` was extended rather than replaced, so it
keeps the refusal on `-P prod`, the three write targets and the undo:

```
node scripts/seed-image-descriptions.mjs -P dev --write --clear
```

That is a **complete** undo again, which it briefly would not have been — see
the retired field below.

### The language split is a MAP, and two of its entries are inert

A caption is ONE non-localised string shown in both locales, so the point of
mixing languages is to make that visible: a German title now appears on the
English pages and the other way round. `ENGLISH_TITLED` in the script is an
explicit set of 10 curated paths (everything else defaults to German, Latin
binomials included) — flip one line to move one work.

Live split is **39 German / 8 English, not 10**, and that is correct: two
English entries name `joshua-binswanger/01-xylopedia-ct-oak.webp` and
`03-phenological-shift.webp`, and **Joshua's curated images were never seeded at
all**. `seed-curated-galleries.mjs` skips a member who already has gallery
items, and his three are his own uploads (`origin: "member"`, one of them on the
unverified `{uid}-gallery` slot id). That is also why dev holds 47 images and
the manifest holds 48 — plus Stefan Scherrer having 2 of his 3.

### The only route from a gallery item back to the artwork is provenance

The gallery array carries a `randomUUID()` and a storage URL and **no
filename** — nothing in it says which curated file an item is. The curation path
survives only as `provenance.source` on the `images/{imageId}` record. Any
future per-work decision (language, ordering, titles) has to read the record;
`langFor()` does, at one read per image, in dry runs too.

### `descriptionShort` is retired in the script too

It is no longer WRITTEN but still RECOGNISED and REMOVED, in both modes, and
FILL now clears it as it goes. Keeping the old `SHORT` strings was load-bearing:
44 images were holding one, and a build that stopped recognising the string
would have stranded it in the database with no way to take it out. The array and
the records are now clean of it (0 occurrences in both). This matches
`src/lib/images.ts:184`, where the client already `deleteField()`s it on save.

### Consequence to remember: dev's ALT TEXT is placeholder now

The caption doubles as alt text and as the directory card's accessible name, so
88 images on `/community` went from an empty `alt` to a placeholder one.
**Dev is not the place to judge screen-reader output while this text is
seeded.** Nothing warns about this; the field just does two jobs.

## Prod is a separate session, and a big one

Unchanged. Prod is still on `main` (`4f3febd`) and still serves the two-field
editor; `dev` is ~20 commits past it. Landing the description fix on prod means
landing all of it — account deletion becoming immediate
([[account-deletion-is-immediate]]) among others — and dev's PLACEHOLDER text
must not travel. Read [[prod-release-order]] before sequencing anything.

## Uncommitted in the tree (Josh commits these himself)

MINE, all on dev and verified live on 2026-09-06 evening:
- `scripts/seed-image-descriptions.mjs` — the caption seeding above.
- `src/components/community/CommunityWorkCard.astro` + two hunks of
  `src/components/CommunityGrid.astro` — the grid tile prints a credit, not a
  title; `--cwork-chrome` and its twin in the wall block moved 3.3rem → 1.2rem
  TOGETHER.
- `src/lib/lightboxText.ts`, `src/styles/lightbox.css`, the `paddingFn` comment in
  `CommunityGrid.astro` and `members/[slug].astro` — words always UNDER the picture
  (portrait reserve 256), the top row has no band (controls clustered top right,
  `top` 56/44), placeholder transparent. See [[barless-lightbox-geometry]].
- `src/styles/communityCard.css` — `clip-path: inset(0 1px)` on `.ccard__frame`
  kills the carousel's subpixel bleed of the next image at the frame edge.
- `documentation/agent-memory/` mirrors, including [[concurrent-session-stash-hazard]].

NOT MINE — another session's work-in-progress in the same tree, and LIVE on dev
because my deploy carried it: `src/lib/communityLayout.ts` (`DEFAULT_VIEW =
"index"`, `TAG_CHIP_VIEW`), `src/lib/links.ts`, and most of `CommunityGrid.astro`'s
diff. The bare `/community` now opens on the LEDGER; the gallery is
`?pattern=spread`. Read [[concurrent-session-stash-hazard]] before building.

Dev was deployed from a `-dirty` tree on purpose — the build stamp says
`a8d9128-dirty`.

## Two traps this session hit again, both already written up

- `npx firebase` cannot start on this machine; `npm run deploy:dev` is
  build-only and dies on its second half. Deploy via the real binary — see
  [[deploy-dev-needs-development-mode]], whose card-count guard is itself
  slightly wrong now.
- A conflict-free merge is not a building merge — the functions `tsc` is a
  separate gate the Astro build does not cover. See
  [[conflict-free-merge-semantic-break]].
