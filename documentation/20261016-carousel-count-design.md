# The carousel's "‹ 2 / 7 ›" count — archived design

> **Partly restored 2026-10-23** (the desktop UX review): the directory card shows
> `‹ ●•• 2 / 3 ›` — the dots stayed and became buttons, the count stands beside them in
> `.ccard__count`, the chevrons and the picture's hover arrows are back on a desktop. The
> member page's rows are unchanged. The rest of this note is the 2026-10-16 archive.

**Retired 2026-10-16**, when Josh asked for dots under the pictures instead of the numbers,
modelled on Instagram (smaller fading dots at the edges, the current dot black). This note keeps
the count design so it can come back. The last commit that shipped it is the parent of the
commit that adds this file (`ff9102e` on `dev`); `git show ff9102e:<path>` gives every file below
as it was.

## Where it was

- **Directory card** (`/community`, Portfolios view): `.ccard__dots` in the card's foot row, under
  the picture at its right edge — `‹ 1 / 3 ›`, then the filled PROFILE → button.
- **Project carousel** (member page): `.mprof__carousel-dots`, ABOVE the picture, hard right on
  the current picture's edge (`padding-right: var(--frame-r)`).
- **Lightbox**: `pswp__vscn-counter` in the top bar. *Not retired* — the lightbox still shows
  the count.

## What it was

`‹ 2 / 7 ›`: two `.pager-chev` buttons (src/lib/pager.ts, drawn in global.css, hidden on phones)
around a text count.

- Count type: the COUNT voice in `src/styles/type.css` — `--fs-75`, weight 400, line-height 1,
  letter-spacing 0.03em, `tabular-nums`. Colour `--color-muted`, `white-space: nowrap`.
- Chevrons: `--pager-chev-size` 0.38rem, `--pager-chev-stroke` 1.25px, grey, dark on hover.
  On the card the row's gap was 0.1rem and each chevron `min-width: 14px` with 0.15rem side
  padding, so the three read as one control.
- The dots were still rendered underneath and followed the carousel; one `display: none` rule
  hid them (`.ccard__dot` in communityCard.css, `.mprof__carousel-dot` in profile.css).

## Markup and engine

- Card (`CommunityImageCard.astro`): `<span class="ccard__count">1 / {works.length}</span>`
  between the two chevron buttons, then one `<span class="ccard__dot">` per work.
- `communityCarousel.ts`: created `.ccard__count` if missing, and on every move set
  `count.textContent = \`${i + 1} / ${total}\``.
- `projectCarousel.ts`: built `span.mprof__carousel-count` and
  `dotRow.replaceChildren(countPrev, count, countNext, ...dots)`, updated in `update()`.

## To bring it back

Restore the count span and its two engine lines, re-add `.ccard__count` and
`.mprof__carousel-count` to the COUNT selector list in type.css, and hide `.cdots`. The history
of the count itself: `b80e175` "try text instead of dots" (2026-09-28), the chevrons in PR #137,
the card's tight spacing on 2026-10-14.
