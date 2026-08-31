<!-- Mirrors ~/.claude/projects/D--SynoDrive-VSCN/memory/member-profile-pages-live.md — readable by any Claude instance without user-profile access. -->
---
name: member-profile-pages-live
description: "Production member profile pages exist at /members/<slug>, indexed, both locales, PhotoSwipe on works; slugs derive from displayName so a rename changes the URL; /members itself is the card index since 2026-08-28"
metadata: 
  node_type: memory
  type: project
  originSessionId: 850f72f6-4f13-40e9-bbc7-26ed272c9d47
  modified: 2026-08-28T07:32:10.231Z
---

Built 2026-08-24 on `feature/user-content-backend`, committed the same day (`9878a48`). This is the graduated
version of the prototype profile page â€” real route, real data, indexed.

`src/pages/[...lang]/members/[id].astro`: one page per member per locale
(`/members/<id>`, `/de/members/<id>`), fed at build time by `fetchMemberViews()` in
`src/lib/membersBuild.ts` â†’ `toMemberView()` in `src/lib/memberView.ts`. 84 pages built
then, 42 of them member pages, all in the sitemap â€” **the total is 62 since the prototype
was deleted** ([[release-b-shipped-to-dev]]); the 42 member pages are unchanged.

**`/members/` and not `/profile/<id>` on purpose.** `astro.config.mjs` filters the sitemap
with `!page.includes("/profile")` to hide the private editor; member pages under that prefix
would be caught by the same test and silently dropped. Verified: 42 member URLs in
`sitemap-0.xml`, zero `/proto`, zero editor `/profile`.

**Slugs, per Josh's ruling 2026-08-24.** `slugifyName()` + `assignSlugs()` in
`memberView.ts`: German transliteration applied **before** diacritic stripping (so
"RÃ¶ttele" â†’ `roettele`, not `rottele`), collisions get `-2`, `-3`, and a nameless profile
falls back to its uid. All 21 generated slugs match the prototype's hand-written map
exactly, which is a strong correctness signal. Assignment runs in **uid order**, not display
order, so which of two same-named members keeps the unsuffixed slug is stable between
builds. A member actually named "Jasmin 2" lands on `jasmin-2-2` rather than stealing the
suffix â€” verified.

The slug is **derived every build, never stored**, which is what makes it follow a rename â€”
Josh asked for that explicitly. Accepted cost: renaming changes the URL and the old one
404s, with no redirect, because nothing records the previous slug.

Graduation debts cleared here, all of which `CLAUDE.md` names as things not to let leak out
of the prototype: real heading outline (`h1` name, `h2` section keys â€” verified), alt text
from the gallery caption with a translated fallback, i18n in both locales, and `getImage`
with `widths: [600, 1000, 1600]` for Firebase Storage URLs. `stripStorageToken()` moved into
`toMemberView()` so every consumer gets render-ready URLs from one place rather than each
page remembering.

PhotoSwipe moved here from `MemberCard` per Josh's call â€” the card's arrow carousel replaces
Embla, but click-to-view-full-size survives on the profile page. `embla-carousel` becomes a
dead dependency when MemberCard goes.

**Verification update (same day):** with dev seeded, the works section renders on
dev member pages and PhotoSwipe was exercised against a real gallery â€” opens with
images, closes. The pages now also carry per-member OG images and the mname-/mimg-
transition names matching the directory cards (the cardâ†’page morph).
Original caveat, still true for PROD builds: no prod member has a gallery yet. It was tested against a **synthetic** gallery with
a real image via a dynamic import â€” opens, loads, closes cleanly (the close is animated;
a 400 ms assertion is too short and reads as a false failure). Two things that test cannot
measure, because JS-created nodes carry no `data-astro-cid-*` and so match no scoped rule:
the `cursor: zoom-in` on a real work link, and the scoped layout of a real figure.
First real upload is the thing to look at.

`community.astro` deliberately still does its own admin fetch rather than using
`fetchMemberViews()` â€” `CommunityGrid`/`MemberCard` read raw fields the view model does not
project, and both are being deleted, so converting them would be churn on a dying path.

Sequencing, and the grid decisions that were still open here (multicol / shuffle-within-tiers
/ keep GSAP â€” all since decided): [[release-b-shipped-to-dev]].

**Update 2026-08-28 â€” `/members` is now a page, and MemberCard is back.** Josh asked for
"a page for the index (the community cards we have on the live site now)":
`src/pages/[...lang]/members/index.astro` renders every member as the live site's compact
card, revived from `main` as `src/components/MemberCard.astro` â€” adapted to `MemberView`
(so it shares the same producer as everything else), preview mode removed
(ProfileViewPreview owns that now), `--bp-desktop-wide` (a dead alias) replaced with
`--bp-desktop`, hex colours kept verbatim for pixel-faithfulness to live. Alphabetical
(Firestore order), no client shuffle â€” an index, not a mood board. So "MemberCard goes and
embla dies with it" above is half-superseded: MemberCard is alive again, but still without
Embla â€” the note about `embla-carousel` being a dead dependency still holds. The same day
added the Gallery/Grid view selector on /community â€” that story lives in
[[community-gallery-layout-selector]].
