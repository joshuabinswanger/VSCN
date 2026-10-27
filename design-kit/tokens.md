# VSCN design tokens — starter for Affinity

Snapshot of what the site uses on dev (2026-10-25, dev `52235d2`). Everything in
this folder is derived from `src/styles/global.css`, `src/styles/type.css` and
`src/styles/profile-editor.css`; the code stays the source of truth.

## What is in the folder

| file | use |
|---|---|
| `vscn.ase` | the colour palette — in Affinity: Swatches panel ▸ menu ▸ Import Palette ▸ As Document Palette |
| `spec-board.svg` | one board with swatches, radii, every type voice at real size — File ▸ Open, or Place into your document |
| `fonts/Archivo-Variable*.ttf` | the site's only typeface (variable, 100–900). Install both before opening the board |
| `screens/desktop-*.png` | every screen at 1440px wide, full page |
| `screens/phone-*.png` | the same at 390px (iPhone 14/15), full page |

Set the document to pixels, 1440 × … for desktop and 390 × … for phone, place a
screenshot as a locked bottom layer and draw on top.

## Colours

| token | hex | role |
|---|---|---|
| `--color-dark` | `#000000` | ink: type, chips, pills, hairlines |
| `--color-bg` | `#fcfbfa` | paper (warm off-white; the grain overlay sits on it) |
| `--color-border` | `#e0e0e0` | hairline borders, field edges |
| `--color-muted` | `#686868` | secondary type (5.6:1 on paper) |
| `--color-text-placeholder` | `#707070` | placeholders |
| `--color-error` | `#b83232` | errors |
| `--color-success` | `#217a47` | success |

No other colours exist. The site is black type on paper; the inverted chip
(paper on ink) is the only "accent".

## Type

One typeface: **Archivo** (variable), self-hosted. Root size 13px desktop, 12px
phone; every size is a token pinned to whole pixels at both breakpoints.

| voice | desktop / phone | weight | tracking | case | where |
|---|---|---|---|---|---|
| `t-title` | 19 / 20 | 700 | -0.02em | — | page titles |
| `t-sub` | 13 / 13 | 400 | — | — | sub lines |
| `t-name` | 15 / 14 | 500 | -0.01em | — | member name on cards |
| display name | clamp(2.1rem, 2.6vw, 3.6rem) | 700 | -0.03em | — | member page name |
| `t-heading` | 12 / 13 | 600 | 0.05em | UPPER | section headings |
| `t-label` | 10 / 10 | 600 | 0.08em | UPPER | field labels, eyebrows |
| `t-meta` | 11 / 12 | 500 | — | — | role, details |
| `t-caption` | 14 / 13 | 400 | — | — | image captions |
| `t-body` | 14 / 13 | 400 | — | — | paragraphs (line-height 1.6) |
| `t-link` | 10 / 10 | 600 | 0.02em | — | small links |
| `t-count` | 11 / 11 | 400 | 0.03em | — | pager "‹ 2 / 7 ›", tabular figures |
| `t-chip` | 9 / 9 | 500 | 0.03em | UPPER | editor keys, value chips |
| `t-nav` | 12 / 13 | 600 | 0.04em | UPPER | header links; phone menu lines 40px/700 |
| `t-tag` | 9 / 9 | 400 | 0.06em | UPPER | tag pills |

Full scale (`--fs-*`, desktop px): 58→7.5 60→7.8 … 72→10 78→11 82→12 90→13
100→14 105→15 115→16 120→17 140→19 160→22 180→24 190→26 225→30 300→40.

## Radii

| token | value | where |
|---|---|---|
| `--radius-xs…xl` | 0 | the site default is SQUARE; a universal reset flattens anything not listed below |
| `--radius-tag` | 0.5em | tag pills |
| `--radius-key` | 0.65rem | editor keys (Size, Move, Edit, + Add) |
| `--radius-card` | 0.9rem | people cards, project cards |
| `--radius-soft-card` | 1.1rem | editor work rows |
| `--radius-soft-block` | 1.6rem | editor project blocks |
| `--radius-pill` | 999px | header SIGN UP / avatar, bar pills, chips |
| editor bar | 24px | the floating bottom bar |

## Layout

- Header 56px (phone 48px). Links left, VSCN centred, LOGIN word + SIGN UP pill right; signed in: a 30px round avatar.
- Page measure `--shell-max` 900px with 15px gutters; the works column is 48rem.
- Breakpoint: phone = width ≤ 767px **or** a coarse pointer (iPad is phone). Desktop otherwise.
- Editor: keys 38px tall (36/32 on phone), bar pills 36px, bar padding 6px.
- Motion: one ease-out `cubic-bezier(0.16, 1, 0.3, 1)`; pictures enter with a 0.9→1 grow.

## Handing a mockup back

Keep Affinity (April 2026+) running with MCP enabled in Settings; Claude reads
the open document straight from the app. A pasted screenshot works too.
