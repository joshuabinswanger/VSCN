// The /community directory's hand-authored layout: the slot tables, the math
// that deals them, and the validation that keeps them honest. Extracted from
// CommunityGrid.astro so the same layout the build renders can be re-run in
// the browser — the client script re-deals on every load, and the shelved
// strip layout (?pattern=strip) rebuilds this module's output live.
//
// A 24-column placement grid with NO column gap. Every slot is a rectangle:
// where it starts and how big it is, in both axes. `colStart`/`colSpan` are
// columns, `rowStart`/`rowSpan` are rhythm units (`--cgrid-row` — see
// CommunityGrid.astro for the current value). A pattern of slots repeats down the page until its members run out.
//
// TWO KINDS OF LAYOUT LIVE HERE, and the rest of this header describes only
// the first: DRAWN tables (the spread, the shelved strip's index), whose
// geometry a person authored, and the GENERATED wall (`layOutWall`), whose
// geometry is a measurement of the window. Both emit the same `Slot`, so the
// deal, the DOM re-sort and the motion layer cannot tell them apart — but
// nothing about the 24 columns, the rhythm unit or the validation below
// applies to the wall. Its own contract is written above the function.
//
// Gutters are part of the drawing, not a CSS value. A column nothing occupies
// IS the gutter, so the air between two cards can differ down the page.
//
// Widths: the grid is capped at --grid-max, so a column is a stable ~83px on
// any viewport wide enough, and a span reads directly as a width — 8 columns
// is 667px, 6 is 500, 3 is 250.
//
// `rowSpan` is the space a slot reserves, not the card's height: it sits at
// the top and the rest is the whitespace below. An image card runs 0.75–1.5x
// its own width tall (median 1.0); a typographic card — since it grew its
// framed tag rectangle — roughly 0.25–0.55, content-capped by its slot.
//
// SIZING A SLOT — there is no formula to satisfy. The cell passes its
// `rowSpan` down as `--slot-rows`, and CommunityImageCard bounds the artwork
// by it: a frame taller than the slot keeps its true aspect and gets NARROWER
// instead, so it can never outgrow the rectangle you drew. Draw a tall narrow
// slot when you want a portrait to dominate.
//
// Five rules when editing. The first four are checked at module load (which
// fails the build — this module is imported by the page's frontmatter); the
// fifth is on you:
//   1. No two slots in a pattern share a `rowStart` — except in a pattern
//      that declares `alignedRows`, where shared rows ARE the drawing.
//   2. No two slots overlap as rectangles — including against the NEXT tile's
//      copies, because the pattern repeats and the seam is as real as the
//      inside.
//   3. Slots stay inside the 24 columns.
//   4. A pattern is authored in ascending `rowStart`. The deal pairs member i
//      with slot i, so emission order has to BE row order or the cards come
//      out shuffled against the drawing.
//   5. An empty band — one where every column is empty — is a PAUSE, and it
//      is permanent only up to MAX_EMPTY_ROWS (8): anything wider is closed
//      back to 8 by the collapse, so a pause wider than 8 rows cannot be
//      drawn. The spread's beats interlock and leave no band at all. And
//      leave at least one empty column between two slots that share rows, or
//      their cards will touch.

export interface Slot {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

/** A repeating drawing, and the stride at which it repeats. */
export interface Pattern {
  name: string;
  slots: Slot[];
  /** Only has to be large enough that the next tile's copies clear this one's;
   *  `collapseEmptyBands` below closes whatever slack that leaves. The gallery
   *  patterns keep it deliberately generous — tightening it to fit the drawing
   *  would make the seam the one gap nothing can close. The index tile is
   *  sized SHORTER than its drawing instead, so consecutive copies interleave
   *  lane against lane and the ladder's step never breaks. In the Affinity
   *  document this is the artboard height (1 row = 30px). */
  tileRows: number;
  /** Slots that share a `rowStart` are ROWS, on purpose. Setting this skips the
   *  no-shared-rowStart check (rule 1) for the pattern; every other rule still
   *  applies, including the overlap checks, so two slots in a row must still
   *  keep to their own columns.
   *  NO PATTERN SETS THIS TODAY — the drawn grid wall was its only user, and
   *  the wall is generated now. Kept because a row-aligned drawing is a
   *  legitimate thing to author and the check has to know to stand down. */
  alignedRows?: boolean;
}

export const COLUMNS = 24;

// THE gallery: the editorial spread (the Supera / Zhenya Rynzhuk reference —
// see the ShareX capture referenced in documentation/agent-memory). Two lanes
// and nothing else: left on columns 2–10, right on 13–21, one large image per
// beat alternating sides down the page, each answering the last before it has
// fully passed — the zigzag a reader's eye makes through a magazine.
// Widths wobble 8/9 columns and the lane edge steps by one so the two columns
// read as drawn, not extruded.
//
// Sized against the 83px column (--grid-max: 2000px): a 9-column slot is
// ~750px. The rowSpans double as the size lever — the frame cap is
// rowSpan × --cgrid-row − chrome, and most artwork rides the cap, so the
// spans ARE the image sizes (26 rows ≈ 500px of frame at the current 1.5rem
// row). Redrawn taller and tighter on 2026-08-28 review: the earlier
// 19–23-row spans under a shrunken row unit had quietly shrunk every image
// ~30%, and the 5-row pauses read as dead air.
//
// THE BEATS INTERLOCK (the same review, rounds three and four): each image
// starts while the one before it is still on the page, so the lanes overlap
// by ~4–6 rows and the tile never shows a full-width empty band — inside a
// tile the collapse has nothing to close, and the seam interlocks the same
// way (tileRows 131 is exact: the next tile's opening beat answers the last
// one at the same ~22-row pitch). Round three overlapped ~9 rows; round four
// ("a bit more white space") eased it to this. This deliberately reverses
// the 08-27 "vertical air" rule at Josh's repeated ask; the airier paused
// drawings are in git history. Legality is the lanes': overlapping rows
// never overlap rectangles because the two lanes never share columns.
//
// Authored in code (2026-08-27, replacing the scrapped stagger tile; resized
// and interlocked 2026-08-28) — not yet mirrored to the Affinity document,
// whose first artboard still shows the old stagger drawing.
const SPREAD_TILE: Pattern = {
  name: "spread",
  tileRows: 131,
  slots: [
    { colStart: 2, colSpan: 9, rowStart: 1, rowSpan: 26 },
    { colStart: 13, colSpan: 9, rowStart: 23, rowSpan: 28 },
    { colStart: 3, colSpan: 8, rowStart: 45, rowSpan: 24 },
    { colStart: 14, colSpan: 8, rowStart: 66, rowSpan: 26 },
    { colStart: 2, colSpan: 9, rowStart: 88, rowSpan: 28 },
    { colStart: 13, colSpan: 9, rowStart: 110, rowSpan: 26 },
  ],
};

// The SHELVED STRIP's index — its only remaining user: since the tag-card
// restyle, both real galleries deal the members without artwork into
// ordinary slots at the end (same treatment as artwork, always last), so
// neither passes textCards to layOutSlots any more.
// The cards step down in a plain left-right alternation at FIXED
// columns (the earlier per-slot wobble read as random stagger at a name's
// size rather than as drawn), and the two lanes HUG THE MIDLINE rather than
// echoing the image lanes: these cards carry a fraction of an image's visual
// weight, and out on the page's edges they read as strays — pulled in
// around the centre (midline is between columns 12 and 13) they read as a
// single closing column. The section change is carried by scale and that
// gather toward the centre, not by a new geometry.
//
// A 5-column slot is ~417px. The 10-row `rowSpan` is sized for what the
// typographic card became on 2026-08-28 — name band, framed tag rectangle,
// role row, the image card's anatomy at index scale — where the old 6-row
// tile fit only a name and a role: the frame cap CommunityTextCard derives
// from it (10 rows − chrome ≈ 110px) holds 5 whole stacked tags, and the
// row a wrapped role adds still clears the pitch. The step is a uniform 5 rows, so
// the ladder ticks evenly. The drawing overhangs the 10-row stride —
// deliberately: consecutive copies interleave lane against lane, which is
// what keeps the 5-row step unbroken across the seam. The spill never
// collides because the lanes never share columns.
//
// Authored in code, like the spread's 08-28 redraw — not yet mirrored to the
// Affinity document, whose index artboard still shows the 6-row name ladder.
export const TEXT_TILE: Pattern = {
  name: "text",
  tileRows: 10,
  slots: [
    { colStart: 7, colSpan: 5, rowStart: 1, rowSpan: 10 },
    { colStart: 14, colSpan: 5, rowStart: 6, rowSpan: 10 },
  ],
};

// THE OTHER gallery: the wall — NOT a drawn table. Everything above this line
// is authored as rectangles on the 24-column grid; the wall is generated from a
// measurement instead, because that is what "a fixed card width, and as many of
// them as the window fits" means. The 24 columns played no part in it any more
// once the card stopped being a fraction of the measure.
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
// A ROW HERE IS A GRID ROW, not 19 rhythm units. `--cgrid-row` and the rowSpans
// it counts are the drawn tables' unit and mean nothing to the wall, so every
// slot is one row tall and the air between rows is an honest `row-gap`. What
// the cards are bounded by instead is stated directly in the wall's CSS: a
// frame may be 1.5× the card's width, i.e. 300px, and a taller upload narrows
// rather than deepening its row.
//
// NOT VALIDATED, unlike the tables above, and it needs no validating: one card
// per track and one row per row cannot overlap, cannot leave the grid, and
// cannot come out of emission order. The rules exist to catch a human drawing
// two rectangles on top of each other.
export function layOutWall(count: number, cols: number): Slot[] {
  const wide = Math.max(1, Math.floor(cols));
  // The half step has to come out of the row's width or it would hang the last
  // card off the right edge — so an offset row holds one card fewer, and the
  // wall's two rows sit symmetrically inside the same measure.
  const narrow = Math.max(1, wide - 1);
  const out: Slot[] = [];
  for (let i = 0, row = 1; i < count; row++) {
    const perRow = row % 2 === 1 ? wide : narrow;
    for (let k = 0; k < perRow && i < count; k++, i++) {
      out.push({ colStart: k + 1, colSpan: 1, rowStart: row, rowSpan: 1 });
    }
  }
  return out;
}

/** The two galleries the selector offers. Names of VIEWS, not of tables — only
 *  `spread` still has one (see GALLERY_PATTERNS). */
export type GalleryPatternName = "spread" | "grid";

/** The DRAWN galleries. Only one is left: the wall generates its placement at
 *  runtime (`layOutWall` above) and has no table to keep here. The record
 *  stays a record because the strip may yet come back to it. */
export const GALLERY_PATTERNS: { spread: Pattern } = {
  spread: SPREAD_TILE,
};

// ── The strip (shelved) ─────────────────────────────────────────────────────
// A second gallery layout, held back from the UI but kept reachable at
// ?pattern=strip: NOT a slot pattern but a horizontal scroller (the Rue
// Studio reference), built by the client script moving the image cells into a
// flex row that occupies the top of the grid. These two numbers are what the
// slot system needs to know about it.

/** Grid rows the strip wrapper spans — 20 rows = 600px, sized so a hovered
 *  portrait card (bounded by STRIP_SLOT_ROWS below) fits with air around it. */
export const STRIP_ROWS = 20;

/** The `--slot-rows` handed to cards inside the strip. Smaller than
 *  STRIP_ROWS on purpose: it caps the FRAME (18 rows × --cgrid-row − chrome), and
 *  the difference is the breathing room that keeps a grown card off the
 *  strip's edges. */
export const STRIP_SLOT_ROWS = 18;

/** Do two slots occupy any of the same space, given where each one's tile put it? */
function slotsOverlap(a: Slot, aRow: number, b: Slot, bRow: number): boolean {
  const rows = aRow < bRow + b.rowSpan && bRow < aRow + a.rowSpan;
  const cols = a.colStart < b.colStart + b.colSpan && b.colStart < a.colStart + a.colSpan;
  return rows && cols;
}

// Validated once, at module load, because nothing downstream can catch it: an
// overlapping table renders as cards stacked on top of each other. The page's
// frontmatter imports this module, so a broken table fails `astro build` —
// the right severity, the page would be broken, not merely ugly.
//
// Only ever within a pattern. Gallery and index cannot collide with each
// other by construction — the second starts below everything the first
// reached (see layOutSlots) — so there is no cross-pattern case to check.
for (const { name, slots, tileRows, alignedRows } of [
  ...Object.values(GALLERY_PATTERNS),
  TEXT_TILE,
]) {
  for (const [i, a] of slots.entries()) {
    if (a.colStart < 1 || a.colStart + a.colSpan - 1 > COLUMNS) {
      throw new Error(
        `communityLayout: ${name} slot ${i} spans columns ${a.colStart}–${a.colStart + a.colSpan - 1}, ` +
          `outside the ${COLUMNS}-column grid.`
      );
    }
    if (i > 0 && a.rowStart < slots[i - 1].rowStart) {
      throw new Error(
        `communityLayout: ${name} slot ${i} starts on row ${a.rowStart}, above slot ${i - 1} ` +
          `on row ${slots[i - 1].rowStart}. A pattern must be authored in ascending rowStart — ` +
          `the deal pairs member i with slot i and relies on emission order being row order.`
      );
    }
    for (const [j, b] of slots.entries()) {
      if (i < j && a.rowStart === b.rowStart && !alignedRows) {
        throw new Error(
          `communityLayout: ${name} slots ${i} and ${j} both start on row ${a.rowStart}. ` +
            `Two cards starting at the same height is the one thing these tables exist to prevent ` +
            `— unless the pattern declares alignedRows, which makes shared rows the drawing.`
        );
      }
      if (i < j && slotsOverlap(a, a.rowStart, b, b.rowStart)) {
        throw new Error(
          `communityLayout: ${name} slots ${i} (rows ${a.rowStart}–${a.rowStart + a.rowSpan - 1}, cols ` +
            `${a.colStart}–${a.colStart + a.colSpan - 1}) and ${j} (rows ${b.rowStart}–${b.rowStart + b.rowSpan - 1}, ` +
            `cols ${b.colStart}–${b.colStart + b.colSpan - 1}) overlap.`
        );
      }
      if (slotsOverlap(a, a.rowStart, b, b.rowStart + tileRows)) {
        throw new Error(
          `communityLayout: ${name} slot ${i} overlaps slot ${j} of the following tile. ` +
            `Either shorten it or raise its tileRows (currently ${tileRows}).`
        );
      }
    }
  }
}

// How much empty vertical band to tolerate before closing it up. Only bands
// where ALL columns are empty count, and a pattern never leaves an interior
// hole, so what this closes is always a SEAM. There are two kinds: between one
// tile and the next copy of it (a gallery pattern's `tileRows` is generous on
// purpose and this absorbs the slack), and between the gallery section and the
// index below it. Both land on the same 8 rows, which is the point — the shift
// from spacious to compact reads on its own and does not need a designed gap
// to announce it. The index tile is the exception: its copies interleave (its
// drawing overhangs its stride), so there is nothing between them to close.
const MAX_EMPTY_ROWS = 8;

/** Close bands no column occupies, preserving the order and spans of what is left. */
function collapseEmptyBands(slots: Slot[]): Slot[] {
  const ordered = [...slots].sort((a, b) => a.rowStart - b.rowStart);
  // Seed the shift with whatever sits above the first slot, so the band at the
  // TOP closes too. Every tile starts on row 1 today, so this is a no-op —
  // kept because it is the difference between a table you can redraw freely
  // and one whose first slot must never move.
  let shift = (ordered[0]?.rowStart ?? 1) - 1;
  let frontier = -Infinity;
  for (const slot of ordered) {
    let row = slot.rowStart - shift;
    if (frontier > -Infinity && row - frontier > MAX_EMPTY_ROWS) {
      const extra = row - frontier - MAX_EMPTY_ROWS;
      shift += extra;
      row -= extra;
    }
    slot.rowStart = row;
    // The frontier is the lowest point anything reaches, not the last slot's
    // end: slots overlap in row range across columns, and a band is only empty
    // once every column has cleared it.
    frontier = Math.max(frontier, row + slot.rowSpan);
  }
  return ordered;
}

/** Repeat one pattern from `offset` for `cards` slots, stopping mid-tile. */
function tilePattern(pattern: Pattern, cards: number, offset: number): Slot[] {
  const placed: Slot[] = [];
  for (let i = 0; i < cards; i++) {
    const slot = pattern.slots[i % pattern.slots.length];
    const tile = Math.floor(i / pattern.slots.length);
    placed.push({ ...slot, rowStart: slot.rowStart + offset + tile * pattern.tileRows });
  }
  return placed;
}

/**
 * Lay the gallery out in the given pattern, then the index below it, then
 * close the seams. Returns the gallery's slots first, then the index's, both
 * in ascending row order — the caller relies on that split.
 *
 * The index starts below the lowest point the gallery actually REACHED, not at
 * the next tile boundary — so a gallery that ran out halfway through a tile
 * hands its leftover rows to the collapse instead of leaving a hole. It is
 * also what makes the two sections unable to collide: everything in the second
 * pattern begins beneath everything in the first, whatever either one is
 * redrawn to look like.
 */
export function layOutSlots(gallery: Pattern, imageCards: number, textCards: number): Slot[] {
  const placed = tilePattern(gallery, imageCards, 0);
  const frontier = placed.reduce((low, s) => Math.max(low, s.rowStart + s.rowSpan), 0);
  const index = tilePattern(TEXT_TILE, textCards, frontier);
  return collapseEmptyBands([...placed, ...index]);
}

/**
 * The index alone, for strip mode: the gallery is the strip wrapper spanning
 * rows 1–STRIP_ROWS, so the index starts MAX_EMPTY_ROWS below it — the same
 * 8-row seam every other section boundary lands on. No collapse pass: the
 * offset is exact and TEXT_TILE's copies interleave seamlessly by construction.
 */
export function layOutStripIndex(textCards: number): Slot[] {
  return tilePattern(TEXT_TILE, textCards, STRIP_ROWS + MAX_EMPTY_ROWS);
}
