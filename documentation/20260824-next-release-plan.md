# Next release — what is done, what is left, and in what order

Date: 2026-08-24. Status: **plan, revised same day for the dev-review-by-email launch.** Written against the tree at
`feature/user-content-backend` @ `f20d1ce` + uncommitted WIP.

## Where things actually stand

**Production is four weeks behind the work.** `main` and `origin/main` both sit at
`10a7eba` (the CSS intro rework). `dev` is **26 commits ahead of main**, and
`feature/user-content-backend` is **5 commits ahead of dev**, on top of a large
uncommitted working tree. Nothing built since 2026-08-20 is live anywhere — not on
production, not on the dev channel.

Verified today: `npm run lint` = 9 warnings / 0 errors (the documented baseline),
`npm run build` = **84 pages**, sitemap contains the member pages and **no** `/proto`
and **no** editor `/profile` URLs.

## Done

### Shipped to `dev` (26 commits, unmerged to main)

- `/proto/community` visual prototype: irregular lane grid, image cards with scroll-linked
  growth and per-lane parallax, reduced-motion gate, sitemap-excluded, `noindex`.
- Real member data behind it: 21 active members from live Firestore
  (`scripts/gen-proto-real-data.mjs`), 16 with hand-curated artwork downscaled to 1200px
  WebP (`scripts/prep-proto-real-images.mjs` — 35 MB → 5.0 MB).
- Typographic card variant for artwork-less members, shared expandable detail panel
  (native `<details>`, zero JS), card size tiers driven by profile completeness.
- Member gallery + `memberType` feature (`3fcc0ba`) — build-verified only, never reviewed.
- `CLAUDE.md` with the repo's non-obvious architecture facts.

### On `feature/user-content-backend` (5 commits, unmerged to dev)

User-content backend hardening, spec in `20260823-user-content-backend-design.md`:

- Immutable cache headers on gallery and avatar uploads.
- Avatar overhaul: unified WebP pipeline, immutable unique filenames.
- Dominant-colour placeholders (`photoColor`, `gallery[].color`).
- Shared input allowlist with AVIF support, explicit SVG/HEIC rejection.
- Crop/rotate editor before upload (`src/lib/imageEditor.ts`).

### Built but **uncommitted** in the working tree

- **Member profile pages** at `/members/<slug>` and `/de/members/<slug>` —
  `src/pages/[...lang]/members/[slug].astro`, fed by `fetchMemberViews()`
  (`membersBuild.ts`) → `toMemberView()` (`memberView.ts`). 42 member pages, indexed,
  slugs derived per build from `displayName` with German transliteration before diacritic
  stripping. PhotoSwipe moved here from `MemberCard`. Prototype debts cleared: real heading
  outline, alt text from gallery captions, both locales, `getImage` on Storage URLs.
- **Profile editor preview mode** — `/profile` keeps one page with an Edit|Preview switch
  (`ProfileViewPreview.astro`, `profileView.ts`, `profilePreview.ts`). One `ProfileViewModel`
  with two producers: a stored doc at build time, form state at runtime.
- **Prototype profile pages** at `/proto/profile/<id>` with card→page view-transition morph,
  plus the card redesign: manual arrow carousel replacing the 16s crossfade, and the
  **vertical tag rail removed from the card face** — which settles the long-open tag-rail
  clipping question by removal.
- **Brand-ticker hover expansion** in `Layout.astro` — each capital grows its word tail
  (V→isual, S→cience …), with the shell overflow rules that lets it push past 900px.
- Two admin scripts: `cleanup-orphaned-storage.mjs`, `export-volunteers.mjs`.
- Four design docs and seven agent-memory mirrors.

### Decided, so not to be re-litigated

- Galleries are **canonical from the next release**; the directory goes image-led even
  though 0 of 21 members have uploaded one, and cards upgrade as people upload. Avatar
  fallback was explicitly rejected.
- Member pages live under `/members/`, never `/profile/<id>` (the sitemap filter would
  silently drop them).
- Slugs are derived every build, never stored, so they follow a rename — accepted cost is
  that the old URL 404s with no redirect.

## Not done

### Hard blockers

1. **The whole tree is uncommitted and unmerged.** A `deploy:dev` right now would publish
   the WIP; a `main` push auto-deploys production.
2. **`firestore.rules` and `storage.rules` are deployed nowhere.** They must go out
   **with** the frontend, per environment — old deployed clients send JPEG to legacy avatar
   paths and the new rules reject it. Note the CI workflows deploy **hosting only**; rules
   are a manual step in the same window.
3. **Nothing has been verified with a real signed-in session.** Upload flows, legacy-avatar
   replacement, cache-control headers, the crop UI, and the editor's typing→preview sync
   have never run against real auth. Claude cannot sign in — this is Josh's step.
4. **No member has a gallery, so the works section on `/members/<slug>` renders for nobody**
   and the real PhotoSwipe path is unexercised. It was tested against a synthetic gallery.
5. **Three open decisions block the `/community` swap** — see below.

### The three open decisions (`20260824-image-card-directory-design.md`)

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Filtering vs build-time lanes — hiding a card in a lane leaves holes | **CSS multicol on desktop** (`columns: 3` + `break-inside: avoid`); filtering works natively, keeps width/offset irregularity, fixes the DOM-order a11y debt, costs per-lane parallax (replaceable per-card) |
| 2 | Artwork-first ordering vs the random shuffle | **Shuffle within tiers** — image cards ahead of typographic, random inside each group |
| 3 | GSAP (~44 KB gzip) on the site's most-visited page | **Keep** — desktop-only, reduced-motion gated; the growth-on-approach is the design |

A fourth question sits above them: **does this release change `/community` at all**, or does
it ship the backend and member pages first?

### Remaining implementation for the image-led directory

Steps 2, 3, 5, 6 of the design doc are untouched:

- Production image + typographic cards taking the view model, with the prototype debts
  cleared (empty `alt`, name as `<p>`, hardcoded English aria-labels, `getImage` for
  Storage URLs).
- Production grid keeping **both** sides: the prototype's visual language and
  `CommunityGrid`'s behaviour — member count in the `h1`, member-type and openTo filters,
  shuffle, empty/no-results states, signed-out CTA.
- Switch `/community`; delete `MemberCard`, its `updatePreview` binding and
  `embla-carousel` together; point the editor's card preview at the new card.
- Delete the prototype: `src/pages/proto/`, `src/lib/proto-*`, `public/proto/`, and the
  sitemap + `contentWide` special cases that exist only for it.

### Smaller open items

- Proto pages **ship into `dist/`** today (noindex, sitemap-excluded, but publicly
  reachable). Decide: accept, or exclude from the deploy.
- Real-data fixes: Gregor Forster's malformed `https://.instagram.com/...`, Lisa
  Cuthbertson's missing portfolio URL, Janina Hess's 800px images, Gabriela G.'s dead
  domain, Karin S.'s "portfolio" pointing at a ZHdK staff bio.
- Orphaned-Storage cleanup: script exists, never run, no schedule.
- `medium` card tier is unreachable with today's data (no text-only member has both a link
  and 2+ tags) — revisit the AND criterion or accept.
- Lint baseline of 9 warnings is worth zeroing; a warning currently means nothing.
- Verify the profile-save → GitHub rebuild dispatch still works, since new member pages
  only appear after a rebuild.
- Dev and prod read **different Firebase projects** (`npm run dev` → dev, `npm run build` →
  production; 7 of 21 members are missing from dev). Say which environment any check ran
  against.

## The plan (revised 2026-08-24, same day)

Josh's call, replacing the original two-release split: **one reviewed launch.** Everything —
backend hardening, member pages, and the image-led directory — goes to **dev first, with
each member's curated images seeded into their gallery**, then every member gets an email
linking to their own card and profile page so they can review and give the green light on
the images. Only after that does production get one combined release.

This is also the consent mechanism: the 16 curated image sets in `Design/member-curation/`
came from members' portfolios and Instagram, and cannot ship to production without a yes.
A dev preview where each member sees their own work already placed is the strongest
possible ask, and it solves the "Release B ships a wall of type" problem at the same time.

Consequence accepted with it: nothing ships until the directory is built, so the three
grid decisions move to the front of the queue. Standing answers unless Josh overrides:
multicol (1a), shuffle within tiers (2), keep GSAP (3).

### Phase 0 — land the tree (done 2026-08-24)

1. The working tree split into commits on `feature/user-content-backend`: proto profile
   pages + card redesign / editor preview mode / member profile pages / onboarding note /
   brand-ticker expansion / admin scripts / docs. `translations.ts` was staged in three
   states so each commit carries only its own keys.
2. Gate: `npm run lint` at baseline, `npm run build` = 84 pages, sitemap check. Passed.

### Phase 0.5 — make dev reviewable

3. Sync prod → dev Firestore: 7 of 21 members are missing from the dev project, so a third
   of the review emails would link to a 404 without this.
4. Gallery-seeding admin script: uploads each member's curated 1200px WebPs to
   `galleries/{uid}/` and writes the `gallery` array (url, caption, width, height, color) —
   the same shape the upload pipeline produces. Run against dev now; re-run against prod
   for approved members at launch. Dominant color computed server-side.

### Phase 1 — build Release B (the directory swap)

5. Design-doc steps 2 → 3 → 5 → 6 under the standing decisions, each behind lint + build:
   production cards with the prototype debts cleared, multicol grid keeping
   `CommunityGrid`'s behaviour, `/community` switchover with `MemberCard` +
   `embla-carousel` deleted together, prototype deletion.
6. Plus three small features: empty-gallery nudge in the profile editor, per-member OG
   image on `/members/<slug>`, and (via the email, not code) asking members to confirm
   `memberType` and fix known-bad links.
7. Gates: filters at 1440 and 390 (no holes, count updates, no-results state, signed-out
   CTA), DOM order matches visual order, no `/proto` in the sitemap after deletion,
   `contentWide` special case removed.

### Phase 2 — dev deploy and authenticated verification (Josh required)

8. Deploy dev hosting **and** both rules files together:
   `firebase deploy -P dev --only hosting,firestore:rules,storage:rules`.
9. Josh, signed in on dev with his own account: new avatar upload; replacing a **legacy**
   JPEG avatar; crop/rotate; gallery upload; `cache-control` headers; Edit|Preview typing
   sync, tag and openTo sync, gallery-add→preview; PhotoSwipe on a seeded real gallery.
   Members cannot sign in on dev (their auth accounts live in prod) — the review is
   read-only for them, by design.

### Phase 3 — member review

10. Email every member (drafted by Claude, sent by Josh, BCC): link to their own dev card
    and profile page, ask for green light / swaps / declines on the curated images, plus
    `memberType` confirmation and data fixes. Collect over ~1–2 weeks. Janina Hess: ask
    for original files (hers are 800px).

### Phase 4 — one production release

11. Seed approved galleries into prod Storage/Firestore. Merge feature → `dev` → `main`;
    the `main` push auto-deploys hosting; deploy production rules manually in the same
    window, because CI deploys hosting only.
12. Smoke: `/community`, `/members/<slug>` both locales, sitemap, one real upload as a
    signed-in user, rebuild dispatch fires.

### Phase 5 — hygiene, in parallel

13. Dry-run the orphan cleanup and decide a schedule, zero the lint baseline, revisit the
    unreachable `medium` card tier.

### Deliberately deferred

- Slug redirects on rename (derived-slug ruling stands; no inbound links yet).
- Requests board (phase 2, waiting on actual scientists).
- Nightly rebuild cron (profile saves already dispatch a rebuild — verify in Phase 2
  before adding belt-and-braces).

## Risks worth stating out loud

- **Release B ships a page with no images on it** unless members upload first. Accepted, but
  it also *loses* the 13 avatars the current simple card shows.
- **`main` auto-deploys.** A merge is a release; there is no staging gate between them other
  than the manual dev channel.
- **26 unshipped commits in one merge** is the largest single production change this project
  has had. Phase 2 is the moment to slow down, not speed up.
