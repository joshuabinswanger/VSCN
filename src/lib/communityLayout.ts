// The /community directory's views and the one generated layout that is
// left: the Images wall. Extracted from CommunityGrid.astro so the same
// layout the build renders can be re-run in the browser.
//
// THE DRAWN TABLES ARE GONE (2026-10-15). This module used to hold the
// hand-authored 24-column slot tables — the editorial spread, the shelved
// strip's index ladder — with the deal math and the validation that kept
// them honest. The Portfolios view is one member a screen now (the pages
// view, `documentation/20261015-portfolio-pages-view.md`): a stack of
// full-frame cards the page snaps between, which needs no table at all. The
// tables and their rules live in git history before that date.
//
// What survives: `Slot` (the wall still emits one per tile) and `layOutWall`,
// whose contract is written above it.

export interface Slot {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

// THE WALL — NOT a drawn table. It is generated from a measurement, because
// that is what "a fixed card width, and as many of them as the window fits"
// means.
//
// WHAT IS FIXED AND WHAT MOVES (2026-08-31, Josh's fourth round on this view):
// the card is 200px wide at every window width, the gutter between two cards is
// 100px, and the two edges keep at least half a card of air. What varies is the
// COUNT — 4 cards at 1440, 6 at 1920, 9 at 2560, and no ceiling, where the drawn
// table was locked to five-and-four and bought pure whitespace above a 2160px
// viewport (the old --grid-max cap). Those three numbers live in CSS, on
// `.cgrid[data-pattern="grid"]` in CommunityGrid.astro; the script reads them
// back and hands the count in here.
//
// THE BRICK SURVIVES. Rows alternate N and N−1 cards, the short rows stepped
// half a pitch right, which is the five-and-four wall generalised to any N —
// the same drawing, no longer pinned to one screen width. Odd `rowStart` is a
// flush row, even is an offset one, and that parity is the whole contract with
// the CSS: the script sets the half-step from it. A one-card wall takes no
// step, because there is nothing for the only card in a row to be offset
// against.
//
// A ROW HERE IS A GRID ROW. Every slot is one row tall and the air between
// rows is an honest `row-gap`. What the cards are bounded by instead is stated
// directly in the wall's CSS: a frame may be 1.5× the card's width, i.e.
// 300px, and a taller upload narrows rather than deepening its row.
//
// NOT VALIDATED, and it needs no validating: one card per track and one row
// per row cannot overlap, cannot leave the grid, and cannot come out of
// emission order.
export function layOutWall(count: number, cols: number, brick = true): Slot[] {
  const wide = Math.max(1, Math.floor(cols));
  // The half step has to come out of the row's width or it would hang the last
  // card off the right edge — so an offset row holds one card fewer, and the
  // wall's two rows sit symmetrically inside the same measure. Without the
  // brick (the static two-wide grid, 2026-10-12) every row is full.
  const narrow = brick ? Math.max(1, wide - 1) : wide;
  const out: Slot[] = [];
  for (let i = 0, row = 1; i < count; row++) {
    const perRow = row % 2 === 1 ? wide : narrow;
    for (let k = 0; k < perRow && i < count; k++, i++) {
      out.push({ colStart: k + 1, colSpan: 1, rowStart: row, rowSpan: 1 });
    }
  }
  return out;
}

/** The directory's views: the pages (one member a screen, Portfolios in the
 *  bar), the Images wall, the People ledger. */
export type ViewName = "pages" | "grid" | "index";
export const VIEWS: readonly ViewName[] = ["pages", "grid", "index"];

/** WHICH VIEW A BARE /community OPENS ON — and which one the server renders
 *  visible, which is the whole no-JS experience. A link to this view carries
 *  no `?pattern=` (the controller deletes it), so the parameter's ABSENCE is
 *  this view, not "unspecified". */
export const DEFAULT_VIEW: ViewName = "pages";

/** Where a member's tag chip sends the reader (links.ts, communityTagHref). */
export const TAG_CHIP_VIEW: ViewName = "pages";

/**
 * `?pattern=` → a view. The Portfolios view was `spread` until 2026-10-15
 * (and `strip` was its shelved sibling); links in the wild still say so.
 */
export function viewFromParam(p: string | null | undefined): ViewName {
  if (p === "spread" || p === "strip") return "pages";
  return (VIEWS as readonly string[]).includes(p ?? "") ? (p as ViewName) : DEFAULT_VIEW;
}
