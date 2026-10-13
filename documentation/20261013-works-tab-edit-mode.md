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
