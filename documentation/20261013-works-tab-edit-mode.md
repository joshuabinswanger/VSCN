# The Works tab is the member page, edited in place (2026-10-13)

Josh: "Instead of separate Preview and Works tabs, have ONE Works tab with a
sleek toggle that switches between Preview and Edit. Edit mode should look like
the preview: the same layout, the same widths, and no horizontal shrinking of
the content. To edit text, you click into it where it sits, inline." Then, on
the first design: "on mobile we can have the toggle centered on the bottom like
the tags and gallery view selection. also a switch between card and profile in
the same bottom bar. En De switch as well in the bottom bar. save also in the
bar."

## What changed

- **Three tabs:** Profile · Works · Account. The Preview tab and
  `src/components/profile/ProfilePreview.astro` are gone; `profile.tab.preview`
  with them.
- **The Works tab renders the member page** (`ProfileViewPreview`, the real
  `.mprof` markup at the page's measure) with the directory card as a second
  view. `WorkEditor.astro` fills a new `editor` slot in the shell, placed
  right after the page's own works slot, so the editor's rows sit in the
  page's works column under the same head, bio and meta rows.
- **The bar** (`#works-bar` in `ProfileForm.astro`'s sticky `.form-footer`):
  Profile | Card, Preview | Edit, EN | DE, and Save, centred on a paper strip.
  Other tabs keep the lone Save at the right. Mode and language are remembered
  in `sessionStorage` (`vscn-works-mode`, `vscn-works-lang`); the view is not.
  The mode switch hides while the card is showing, since the card is never
  edited in place.
- **Edit mode** hides the page's works slot and shows the editor's list; the
  controller renders the page with `works: []` then, so the head is live and
  the works are not drawn twice. **Preview mode** is the old Preview tab.
- **A row is the page's figure.** The item template is a `.mprof__work` with
  the page's `.mprof__work-link` frame (a `<div>`: the editor's picture opens
  nothing) and `.mprof__caption` figcaption. `renderGallery` writes
  `--work-ar` on the figure as the page does, so the 60vh cap, the centring
  and the caption's width all come from `profile.css`. The toolbar (↑ ↓ ↻ ✕,
  project select) stands ABOVE the picture, right-aligned at the picture's
  width (`.gallery-row-tools` mirrors the frame's `max-width` and `margin`).
- **Inline fields.** Title and description are `<input>`/`<textarea>` carrying
  the page's own classes (`.mprof__caption-line`, `.mprof__desc`,
  `.mprof__project-title`, `.mprof__project-desc`) plus `.gallery-inline`: no
  box, dotted hairline underneath, solid on focus, the parent's voice through
  a top-level `:where(.gallery-inline) { font: inherit; color: inherit }` at
  zero specificity. **That rule must stay outside the `.profile-editor` block:**
  nested, it becomes (0,1,0) and ties with `.mprof__project-title`'s own
  voice, and the project title came out at 13px regular. Textareas grow with
  their text (`fitInline` / `refitInline` in the controller; a hidden box
  measures 0, so the refit runs on every list, mode, view, language and tab
  change).
- **One language at a time.** The per-row EN/DE switches went; the stage's
  `data-lang` (from the bar) hides the other pane by CSS. The preview and the
  inline fields agree: `currentViewModel()` resolves role, bio, caption and
  description for `worksLang`, not the tab's locale.
- **The fold** under a work's words is "Links & tags" (`profile.gallery.details`
  renamed): own page link, publication link, tags. A project's fold keeps
  "Project details": link, affiliations, tags.
- **Projects are unrolled in edit mode.** The block is the page's
  `.mprof__project` with its heading group; its works are listed one under the
  other at the heading gap. The page pages two or more as a carousel; editing
  inside a scroll-snap track, with ↑/↓ moving slides out of view and pending
  uploads homed as slides, was judged not worth it for a first version.
- **Reorder** stays arrows only (`moveImage` / `moveProject` unchanged). The
  block's tools (`.gallery-project-tools`: ↑ ↓, Add images, Delete) replaced
  `.gallery-project-head`; the controller's `:scope > .gallery-project-tools`
  lookups follow.
- **Save** is unchanged in meaning: words, membership and order commit at Save;
  uploads and removals commit immediately, as before.

## Verification

Lint, `astro check`, 271 unit tests and `astro build --mode development` on the
merged tree. Layout and voices measured on `/styleguide/editor/en` at 375px
(row 343px wide, toolbar above the picture, title 12px dark, description
muted, project title 24px/700). The signed-in walk on dev is the reviewer's.

## Second pass, same day: one fixed bar, round controls, the Plus

Josh: "the bar sits too low on desktop … the adding images etc. is not working
well … the ui feels strange with the square buttons". Guided by the Apple HIG
skill (`~/.claude/skills/apple-design`, from dickwu/apple-design-skill).

- **The bar is fixed**, centred, 20px above the window's foot on a desktop (the
  footer's line) and 12px plus the safe area on a phone, on every tab. It was a
  sticky footer whose resting place depended on the tab's length and on which
  element scrolled. `.profile-form` keeps padding at its end so nothing hides
  under it.
- **Its size animates.** `followContentSize()` in `src/lib/editorBar.ts` sets
  explicit width and height on `.ebar` from `.ebar__in` (max-content, capped
  by the window) through a ResizeObserver, and CSS transitions them. CSS alone
  cannot transition `width: auto`, and `interpolate-size` is not in every
  Safari. The first size is applied untransitioned.
- **Two groups**: what you look at (Profile | Card, EN | DE), what you do
  (Preview | Edit, +, Save). A phone wraps them into two rows, the doing row
  nearest the thumb. Save is the one prominent control, trailing.
- **The Plus** is a pull-down (`bindMenuButton()` in `editorBar.ts`) with the
  old Add row's three buttons, ids unchanged, so their handlers are unchanged.
  Choosing an item switches to Edit on the page first. The video link field is
  a sheet above the bar. The list-foot Add row is gone; drop-to-upload and each
  project's own picker stay.
- **Shapes** (`global.css`, "SHARP SURFACES, ROUND CONTROLS"): pictures,
  cards, panels and fields stay square; every control is a capsule; tags get
  `--radius-tag`. Both shape rules are `:where()` so order decides, which is
  what makes TagSelector's picked chips (buttons) tags. Section tabs and a
  carousel's edge strips stay square.
- **One segmented control** (`.seg` in `global.css`): capsule track, capsule
  segments, a white thumb for the chosen one. It replaced four joined-box
  switches that round corners could not survive: BilingualField's EN/DE, the
  affiliation rows' Name | Member, the bar's switches, and a work's ↑ ↓ ↻ ✕
  (`.seg--actions`, thumb on hover only).

## Third pass, same day: two columns, tools on the work, a floating bar

Josh: "the tool bar for the project images etc, should be either contained in
the images or on the same height as the title … the horizontal bars on the
gallery card can be removed! … vertical padding between projects and images
less big … profile on desktop should have a 2 column design left artist info
right projects and images … the add menu should be over the plus icon … the
buttons on mobile should be separated … either split it or float them … the
menu should be 3 buttons on desktop one next to each other. on mobile just
black bars, thinner though."

- **Two columns on a desktop** (`profile.css`). The page's head, bio and meta
  rows are wrapped in `.mprof__aside` — on the member page and in
  `ProfileViewPreview` alike — and `.mprof` becomes a grid at `--bp-desktop`:
  the person on the left (`clamp(15rem, 28%, 24rem)`, picture over the name),
  the works on the right from the name's line. The member page and `/profile`
  now use Layout's `contentWide`, and `.mprof` caps itself at 86rem, so the
  works column stays about the old 54rem. Not sticky: a long bio would leave
  its foot unreachable. A phone is unchanged. `projectCarousel.ts` reads
  `--carousel-bleed-left: 0` so a passed slide no longer spills over the
  person's column.
- **Less air.** The rhythm is three tokens on `.mprof`, read by the page and
  the editor's list: `--works-gap` 30vh → 16vh (phone 22vh → 12vh),
  `--works-top` 15vh → 12vh (0 in two columns), `--project-gap` 4rem → 2.5rem.
- **A work's tools are on its picture**: the strip is laid over the figure at
  the frame's width, 10px into its top edge, select left and ↑ ↓ ↻ ✕ right,
  with a shadow; the figure is the page's figure exactly.
- **A project's tools are level with its title**: ↑ ↓, Add images and Delete
  as one icon strip at the heading's right; the title field keeps 138px of
  room for it. No outline around projects: with the tools where they belong
  the grouping reads without one.
- **No rules** above and below the page or the card.
- **The Plus menu** is three black capsules (the site MENU's language), in a
  row centred over the Plus on a desktop and stacked, right edge on the
  Plus's, 32px each, on a phone. `bindMenuButton` positions it on open
  (`--menu-left`, kept 16px inside the window) and animates both ways: state
  is `.is-open` + `inert`, never `hidden`.
- **On a phone there is no bar.** The five controls float on their own, in
  two flex rows across the gutters: Profile | Card, EN | DE and the Plus
  above; Preview | Edit and Save below. 40px controls. Two rows that do not
  share columns: a grid did, and squeezed Save onto two lines.
- **Trap:** `.profile-form.is-works > :not(.form-section)` gave every child
  `width: 100%` and `justify-self: center`, and an absolutely positioned box
  honours `justify-self` — it centred the fixed bar off its own `left`. The
  footer is excluded now.
- **The bar clears the site footer**: on the Works tab, below 1180px of
  window, it rises 40px (measured: at 1024 and 860 it covered the footer's
  links).

## Fourth pass, 2026-10-14: round portrait, person at the edge, works in the middle

Josh: "the profile should have a round profile image. also the left column should be sticky. also more to the left and the center column should be in the middle. the carousel should not show the other card on the right. it should work the same as on the gallery view, just for project images."

- **Round portrait.** The avatar rules already asked for 50%; the site-wide square reset in `global.css` (SHARP SURFACES, ROUND CONTROLS) was flattening them. The member's picture, the editor's photo field and the wizard's are now exceptions to that reset and get `50% !important` in a PORTRAITS rule. The community index's small avatar stays square.
- **Three tracks on a desktop.** `.mprof` is `minmax(16rem, 1fr) minmax(0, 54rem) minmax(0, 1fr)` on the full `contentWide` measure: the works keep their 54rem column, centred on the window (and on the Works bar), and the person stands at the left of the first track. Below about 1100px the first track keeps its minimum and the works give up their centring. The name in the aside dropped to `clamp(1.75rem, 2.2vw, 3.2rem)` so a long surname fits the narrower column whole.
- **Sticky aside.** `position: sticky; top: 7rem` with a `max-height` of the window less its top and 4rem; an aside taller than that scrolls on its own, scrollbar hidden. A scroll-driven animation (`animation-timeline: scroll(self block)`) puts a fade on its foot while there is more below; a box that does not overflow has no timeline, so it never fades.
- **The carousel clips at its column.** The bleed (the track reaching to the window's edges so the next work showed in the margin at 40%) is gone from both `profile.css` and `projectCarousel.ts`, together with the dimming and `--carousel-bleed-left`. One work in view, the next arriving from the column's edge, as the directory card does.

## Fifth pass, 2026-10-14: bigger words on the member page, tighter tags, round index avatar

Josh: "make the index avatar round too, also make the font bigger on the work page it seems extremely small. less vertical spacing on tags".

- **Type.** A work's title and description and a project's description left CAPTION (11px desktop / 12px phone) for their own voice in `type.css` at `--fs-100` (14 / 13px), the bio's size; the "With …" line and `.mprof__link` sit at `--fs-90` (13px). The card's panel and the lightbox keep CAPTION and META. The editor's inline fields inherit, so the Works tab grows with the page.
- **Tags.** Each `.mprof__vals > li` was a block whose line box (23px) stood round a 14px chip, so rows were 9px further apart than the 5px gap. The item is a flex box now: rows 28px → 19px apart.
- **Index avatar.** `.cindex__avatar` joined the PORTRAITS rule in `global.css`.
