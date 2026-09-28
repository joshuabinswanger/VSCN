# Project tags, project paragraphs, the carousel count (2026-09-27)

Three requests from Josh on the same day, shipped together because they meet in
the same two files (`MemberProject.astro`, `profile.css`).

## 1. Project tags ("add project tags")

- **Stored** as `projects/{id}.tags`: a list of registry labels, at most 7, each
  1–50 characters. `validProject()` lists `tags` in its `hasOnly` and reuses
  `validImageTags()`, so a project can say no more about itself than one of its
  pictures can. **Budget:** `validProject` runs once per project document, never
  inside `validGallery`, so the seven unrolled checks do not come out of the
  profile save's allowance (`documentation/20260903-gallery-rules-budget.md`).
- **Threaded through:** `projectFields()` / `toProfileProject()` (trim, drop
  empties and case-insensitive repeats, cap), `EDITABLE` in `projectStore.ts`
  (the rules test runs `saveProjects()` against the emulator with a tags
  fixture), the exporter's `projectKeys` allowlist, the editor's project block
  (the work row's `<tag-selector>` fold, cloned per block), the preview, and
  `MemberProject.astro`.
- **Drawn** as the profile's own tags: bare `.tagchip` links. They go to the
  **Grid** (`communityWorkTagHref`), not the spread, because of the next point.
- **They feed the Community Grid** (Josh's pick): `inheritedTags()` gives each
  work its own tags plus its project's, the way `inheritedSiteLink()` gives it
  the project's link. The wall's tiles, the dropdown and `worksByTag` all read
  the work's `tags`, so a project-only tag shows up in the dropdown and finds
  every work in the project. The spread still filters by member tags.
- **No functions change.** The rebuild fingerprint hashes whole project
  documents, so a tags-only edit already queues a publish.

## 2. Paragraphs in a project description

`.mprof__project-desc` was the one description renderer without
`white-space: pre-line`. A work's description (`.mprof__desc`), the bio and the
lightbox already had it. The text is still set as text (Astro escapes it, the
preview uses `textContent`), so `<b>` prints as `<b>`. Community cards do not
show project descriptions, and the lightbox shows only the project's title.

## 3. The carousel's count

The gallery card's tiny dots (PR #121) did not say "there are more". Three
mockups were built on the real member page (a count on the picture; a count
beside the dots with chevrons always out; a ‹ n / total › pager). Josh picked
the first:

- `"2 / 7"` in a small paper tag on the current picture's top right corner
  (placed by the measured `--frame-r`), filled by `projectCarousel.ts`. It
  replaces the dots. A project with one work has no carousel, so no count.
- On a touch screen (`hover: none`) the edge chevrons are out from the start.
  On desktop they still come out on hover or focus.

## Prod release

Rules before Hosting, as always. The merge workflow deploys them ahead of
Hosting, so nothing is by hand. **No functions** need deploying for this
change.

## 2026-09-28: dots again, bigger (supersedes section 3's count)

Josh: "the carousel should be dots again, but make the dots bigger. do it the
same way as on the gallery but bigger. also adjust the gallery". The count is
gone. The project carousel's dots row is back above the picture's top right,
drawn exactly as the directory card's. Both now take their size from one pair
of tokens in `global.css`, `--carousel-dot` (0.36rem, twice the old 0.18rem)
and `--carousel-dot-gap` (0.28rem), so the card and the carousel cannot drift
apart. The touch-screen chevrons from section 3 stay.

## 2026-09-28, later: text instead of dots, on trial

Josh: "try text instead of dots". Both the gallery card and the project
carousel now show "2 / 7" as plain muted text (`--fs-carousel-count`, tabular
figures) in the dots' own place, hard right on the line above the picture:
`.ccard__count` / `.mprof__carousel-count`. The dots are **still rendered and
still follow the carousel**. One rule per stylesheet hides them
(`.ccard__dot { display: none }` in communityCard.css, `.mprof__carousel-dot`
in profile.css), so going back is deleting those two rules and hiding the
counts. The card's count is server-rendered as "1 / n". The editor's card
preview builds only dots, so `communityCarousel.ts` adds the count there.

## 2026-09-28, later still: the lightbox in the site's voices

Josh: "make the counter and all the styles in photoswipe adjusted to the rest
of the site". Every lightbox line now takes the voice of its twin on the page:

- **Counter** — a new COUNT voice in `type.css` (`--fs-75`, weight 400,
  tabular figures, muted), shared by `.ccard__count`, `.mprof__carousel-count`
  and `.pswp__counter`. `--fs-carousel-count` is gone; the voice replaced it.
  The counter was LABEL caps before.
- **Artist credit** — META, the Grid tile's author line, not caps.
- **A work's links** — META, dark, a plain underline 2px below, muted on
  hover: exactly `.mprof__link`, the same links under the work on the page.
  They were bold, muted and 1.5px-underlined.
- **"Part of …" / "With …"** — CAPTION, muted, like the project's own "With …"
  line on the page, with underlined names.
- **Arrows** — the card's bare chevron at 0.75, full strength on hover. The
  paper block that inverted to black was the card's old drawing.
- **Close** — still a LABEL caps word, now with the site's link underline
  (1.5px, 3px below) instead of a 1px border.

## 2026-09-28, the lightbox counter joins the artist line

Josh: "the counter should be black add also some chevrons that act as arrows
to the counter to the left and right of it. also check that it does not insert
an additional gap below the name. it should sit at the same height as the
Artist Name".

- PhotoSwipe's own counter is off (`counter: false` in `src/lib/lightbox.ts`).
  `registerLightboxText` registers `pswp__vscn-counter` in its place:
  "‹ 2 / 7 ›", dark, with the chevrons calling `pswp.prev()` / `pswp.next()`.
  It is hidden for a single picture and while zoomed in, like the credit.
- It hangs off the picture's top-RIGHT corner at the credit's `top`, so the
  name and the count face each other across the picture's top edge. Both are
  plain blocks of inline content on the same line box, so the count sits on
  the name's baseline (measured: centres equal on desktop, 0.5px apart on a
  phone). A flex box had centred it 3px lower.
- The chevrons' hit area is larger than the line, and negative margins give
  the extra back, so nothing above the picture grows. On a narrow picture the
  name's max-width stops short of the counter.
- These are the only pager a phone shows: PhotoSwipe keeps its side arrows
  hidden until it sees a mouse.
- The COUNT voice in `type.css` now lists `.pswp__vscn-counter-count` instead
  of `.pswp__counter`.
