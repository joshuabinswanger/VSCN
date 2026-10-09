import { watchAuth } from "./auth.ts";
import { pageLifetime } from "./pageLifecycle.ts";
import { navigate } from "astro:transitions/client";
import {
  DEFAULT_VIEW,
  GALLERY_PATTERNS,
  STRIP_SLOT_ROWS,
  TAG_CHIP_VIEW,
  layOutSlots,
  layOutWall,
  type Slot,
  type ViewName,
} from "./communityLayout.ts";

// ────────────────────────────────────────────────────────────────────────
// Behaviour layer: the deal and the signed-out CTA.
// Runs synchronously on astro:page-load, BEFORE the async motion layer
// below measures anything — a deal after ScrollTrigger creation would leave
// every trigger keyed to a stale position.
// ────────────────────────────────────────────────────────────────────────

/**
 * The grid is drawn at build time; this decides who stands where in it.
 * The layout is recomputed from the same module the frontmatter used.
 * SPREAD and WALL deal identically: every member into the pattern's own
 * slots, shuffled artwork leading, the tag cards closing the page in
 * their build-time completeness order (restored from data-rank), which a
 * shuffle would throw away — same treatment, always last.
 *
 * `strip` — the shelved horizontal layout, reachable only by typing
 * ?pattern=strip — is the exception with no slot table: the image cells
 * move into the .cgrid__strip flex row instead, and only the index is
 * laid out.
 *
 * Rewriting geometry decouples DOM order from what you see, so the DOM is
 * re-sorted into row order afterwards and reading order still runs down
 * the page (appendChild also moves cells back OUT of the strip wrapper).
 */
type LayoutMode = ViewName;
const MODES: LayoutMode[] = ["spread", "grid", "strip", "index"];

// ── THE DEAL HAS TO SURVIVE A BACK ────────────────────
// The shuffle used to draw straight from Math.random(), so returning to this
// page from a member's profile re-dealt every card. With the scroll position
// now restored (see Layout.astro) that was worse than before, not better: you
// came back to the right OFFSET of a completely different page. (2026-09-01,
// Josh: "back navigation dors not work getting back from profiles" — landing
// among strangers is not getting back.)
//
// So the shuffle is seeded, and the seed is stored against ClientRouter's
// history index — the same key Layout.astro files the scroll offset under.
// A history traversal finds the seed the entry was dealt with and reproduces
// that exact page; a fresh visit finds none and mints one. Changing the view
// mints one too, deliberately: "the view toggle deals fresh" is the standing
// behaviour, and the entry's remembered seed becomes the new one so a later
// Back returns to the arrangement actually left behind.
const DEAL_KEY = "vscn:deal:";

function dealKey(): string | null {
  const index = (history.state as { index?: number } | null)?.index;
  return typeof index === "number" ? DEAL_KEY + index : null;
}

/** mulberry32 — 32 bits of state, good enough to shuffle 48 cards with. */
function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function storeSeed(seed: number): number {
  const key = dealKey();
  if (key) {
    try {
      sessionStorage.setItem(key, String(seed));
    } catch {
      /* Private mode: the deal is simply random again. Not worth a branch. */
    }
  }
  return seed;
}

/** The seed this history entry was last dealt with, or a new one. */
function rememberedSeed(): number {
  const key = dealKey();
  if (key) {
    try {
      const saved = Number(sessionStorage.getItem(key));
      if (Number.isFinite(saved) && saved !== 0) return saved;
    } catch {
      /* fall through to a fresh seed */
    }
  }
  return storeSeed(freshSeed());
}

/** Never 0 — mulberry32 is fine with it, but it is the falsy value the
 *  lookup above uses to mean "nothing stored". */
function freshSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
}

let dealSeed = 0;

/** Fisher-Yates, in place, drawing from a caller-supplied stream. */
function shuffleInto<T>(out: T[], random: () => number): T[] {
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * THE DEAL IS RANDOM WITHIN A SCORE, ORDERED BETWEEN SCORES.
 *
 * Two things are true at once and a plain shuffle or a plain sort would each
 * give up one of them. The re-deal exists so the wall feels alive and so no
 * member permanently owns the top-left — a directory whose first tile is the
 * same picture every visit is a poster, not a wall. The score exists so
 * better work surfaces. Banding keeps both: inside a band nobody has a fixed
 * position, across bands the better work is reliably higher up.
 *
 * THE BAND IS AN EXACT EQUAL SCORE, not a bucket width. The score is a 0-100
 * integer, so equal-score groups are the bands the data already has; a width
 * would be a second tuning constant with nothing behind the number chosen.
 *
 * On the day this ships nothing is rated and every score is 48-55 — a handful
 * of wide bands — so the wall deals very much as it does today. Nothing
 * regresses before a single rating exists, and the first ratings tighten it
 * rather than rearranging it.
 *
 * ONE rng for the whole run, not one per band: the stream has to advance
 * across bands or every band of the same length would be permuted
 * identically. Seeded exactly as before, so a history entry's remembered
 * seed still reproduces its deal on Back (see rememberedSeed).
 */
function shuffledInBands(items: HTMLElement[]): HTMLElement[] {
  const random = rngFrom(dealSeed || (dealSeed = freshSeed()));
  const bands = new Map<number, HTMLElement[]>();
  for (const item of items) {
    // A cell with no readable score bands with the other unscored ones at 0
    // rather than becoming its own NaN band — Map keys NaN to itself, which
    // would sort unpredictably against real numbers.
    const key = Number(item.dataset.score);
    const band = bands.get(Number.isFinite(key) ? key : 0);
    if (band) band.push(item);
    else bands.set(Number.isFinite(key) ? key : 0, [item]);
  }
  return [...bands.keys()]
    .sort((a, b) => b - a)
    .flatMap((key) => shuffleInto(bands.get(key) as HTMLElement[], random));
}

// ── THE VIEW IS A NAVIGATION ──────────────────────────
// (2026-09-03, Josh: "back button in browser shoud work to switch. etween
// patterns and from profile".)
//
// Choosing a view or a tag used to REPLACE the current history entry, which
// is why Back could not step between views: there was only ever one entry
// for /community however many views you had looked at. It went through
// replaceState rather than pushState because a view switch "is not a
// navigation" — the two cell sets are both in the DOM and the deal only
// hides one, so switching cost nothing and re-rendering the page for it felt
// wasteful.
//
// WHY IT CANNOT BE A HAND-ROLLED pushState EITHER. ClientRouter keeps its
// bookkeeping in history.state (`{index, scrollX, scrollY}`) and its popstate
// handler returns immediately on a null state. Pushing our own null-state
// entry therefore breaks the OTHER Back: leave for a member's page, press
// Back, and the pop lands on an entry ClientRouter refuses to handle — the
// URL returns to /community and THE MEMBER'S PAGE STAYS ON SCREEN. That is
// the exact bug 2026-09-01 fixed by getting rid of `replaceState(null)`, and
// faking the state shape by hand only moves it (the index would collide with
// the next real navigation's).
//
// So the view goes through Astro's own navigate(): a real entry, ClientRouter's
// own bookkeeping, Back and Forward working in both directions and from a
// profile, and ?pattern= / ?tag= as the single source of truth — the
// astro:page-load handler below already rebuilds the page from them, which is
// what makes a reload, a shared link and a history traversal all land on the
// same page. It costs a document swap of a static page.
//
// IT ALSO SETTLES "Scroll to top when changing views": a forward navigation
// gets a history index with no stored scroll offset, so Layout.astro's
// restore finds nothing and the swapped-in .page-wrap starts at the top. The
// deal is right for free too — the seed is filed against the history index
// (see rememberedSeed), so a new entry deals fresh and a Back reproduces the
// arrangement that entry was left showing.
function goTo(url: URL) {
  navigate(url.pathname + url.search);
}

function writeSlot(cell: HTMLElement, s: Slot) {
  cell.style.setProperty("--gc", `${s.colStart} / span ${s.colSpan}`);
  cell.style.setProperty("--gr", `${s.rowStart} / span ${s.rowSpan}`);
  // The card reads this to bound its frame — a deal that moved the
  // geometry without it would leave a card capped to its old slot.
  cell.style.setProperty("--slot-rows", String(s.rowSpan));
  // The wall's brick step belongs to the wall. Cleared here so a cell that
  // was in an offset row cannot carry the step into the spread — where it
  // would be inert (only the wall's rule reads it) but a lie in the DOM —
  // and the wall re-writes it straight after this call.
  cell.style.removeProperty("--row-offset");
  // Kept in step with the placement so the ?grid labels stay truthful after
  // a deal, and so the row sort below reads the row the cell actually has.
  cell.dataset.row = String(s.rowStart);
  cell.dataset.span = String(s.rowSpan);
  cell.dataset.col = `${s.colStart}-${s.colStart + s.colSpan - 1}`;
}

/** The wall's two measurements: how many fixed-width cards the window fits,
 *  and the gutter that spreads them from edge to edge once they are in.
 *
 *  The knobs live in ONE place — the .cgrid[data-pattern="grid"] rule — and
 *  this reads them back rather than restating them, so the drawing has a
 *  single source. --wall-gap-min is a FLOOR: it decides the count, and the
 *  gutter that comes back is whatever divides the rest of the measure, which
 *  is what makes a row reach both edges at any width.
 *
 *  Returns zeros when the knobs are absent, which is mobile: there the wall
 *  is a two-column multicol flow that owns its own geometry and none of this
 *  applies. Callers pass the 0 count straight to layOutWall, whose floor of
 *  one card per row is the harmless placement mobile then ignores.
 *
 *  Reads clientWidth, so the grid must already be visible and already carry
 *  data-pattern="grid" (and the body its bleed class) when this is called —
 *  otherwise it measures against the wrong width. */
function wallMetrics(grid: HTMLElement): { cols: number; gap: number } {
  const cs = getComputedStyle(grid);
  const px = (name: string) => parseFloat(cs.getPropertyValue(name));
  const card = px("--wall-card");
  const min = px("--wall-gap-min");
  const max = px("--wall-gap-max");
  const edge = px("--wall-edge");
  if (!card || Number.isNaN(min) || Number.isNaN(edge)) return { cols: 0, gap: 0 };
  // n cards and n−1 gutters at the floor have to fit inside the measure less
  // both edges: n × (card + min) − min ≤ available. At least one, however
  // narrow the window.
  const available = grid.clientWidth - 2 * edge;
  const cols = Math.max(1, Math.floor((available + min) / (card + min)));
  // Then spread: everything the cards did not use goes into the gutters, so
  // the first and last card sit on the edges. A lone card has no gutter to
  // widen and keeps the floor. The max() is belt and braces — the count was
  // taken at the floor, so the division cannot come back under it.
  const spread = cols > 1 ? Math.max(min, (available - cols * card) / (cols - 1)) : min;
  // The ceiling hands the surplus back to the edges (the tracks are centred,
  // so nothing else has to know) at the one width where spreading would draw
  // a gutter wider than a card.
  return { cols, gap: Number.isNaN(max) ? spread : Math.min(spread, max) };
}

/** Writes the measurements onto the grid for the CSS to draw from, and hands
 *  back the count the deal needs. */
function writeWallMetrics(grid: HTMLElement): number {
  const { cols, gap } = wallMetrics(grid);
  grid.style.setProperty("--wall-cols", String(Math.max(1, cols)));
  grid.style.setProperty("--wall-gap", `${gap}px`);
  return cols;
}

/** The count the wall was last dealt at. A resize that fits the same number
 *  of cards must not re-deal — it would reshuffle the wall under the reader
 *  for nothing. */
let wallCols = 0;

/** Reading order for the DOM re-sort: down the page, then across it. The
 *  column tiebreak only matters in aligned-rows patterns (grid), where a
 *  whole row shares a rowStart and a stable sort alone would leave the
 *  shuffled deal's order — visually left-to-right, read in random order. */
function domOrder(a: HTMLElement, b: HTMLElement): number {
  const col = (cell: HTMLElement) => Number((cell.dataset.col ?? "").split("-")[0]) || 0;
  return Number(a.dataset.row) - Number(b.dataset.row) || col(a) - col(b);
}

// ── The bar's state ───────────────────────────────────────────────────────
// One selected tag, shared by every view: the galleries re-deal the
// survivors, the index hides rows. Mirrors into ?tag= so a narrowed view
// survives reload and travels as a link. Module state, RESET on every
// astro:page-load — the module survives swaps, the choice should not.
let tagFilter = "";

/** One rule for a grid cell and an index row alike — both carry the same
 *  build-stamped pipe-delimited data-tags. */
function memberMatches(el: HTMLElement): boolean {
  return !tagFilter || (el.dataset.tags ?? "").includes(`|${tagFilter}|`);
}

/** Close the tags panel wherever it is. Queries the live DOM rather than
 *  closing over it, so the module-level listeners below survive
 *  ClientRouter swaps without stacking or holding dead nodes. */
function closeTagPanel() {
  const panel = document.getElementById("tag-filter-panel");
  if (panel && !panel.hidden) {
    panel.hidden = true;
    document.getElementById("tag-filter-btn")?.setAttribute("aria-expanded", "false");
  }
}

// Module scope, installed ONCE per session — not inside astro:page-load,
// where document-level listeners would stack one copy per navigation.
document.addEventListener("click", (e) => {
  const panel = document.getElementById("tag-filter-panel");
  if (!panel || panel.hidden) return;
  if (!(e.target instanceof Element) || !e.target.closest(".tag-filter")) closeTagPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTagPanel();
});

// THE OPEN CARD GROWS INWARD. The spread scales a card up when its disclosure
// opens (the `scale` rules in CommunityGrid.astro), and growing about its
// centre would push a card in the first or last column past the window's
// edge. So on open the pivot's x is placed where the grown card just fits
// between the window's edges: centred when there is room, shifted toward the
// far side when there is not. Module scope and capture phase — `toggle` does
// not bubble, and a document listener installed per page-load would stack.
const OPEN_SCALE = 1.3;
const EDGE = 24;
// AND SCROLLING TAKES IT BACK (2026-10-09, Josh: "on scroll it should get
// smaller again"). Each grown card remembers where .page-wrap stood when it
// opened; once the page has moved SETTLE_AFTER px from there the card gets
// `.ccard--settled` and shrinks to its slot. The panel stays open — a bio
// taller than the screen has to survive being scrolled to. A threshold rather
// than the first scroll event, so a trackpad's settle after the click does not
// take back what the click just did.
const SETTLE_AFTER = 48;
const grown = new Map<HTMLElement, number>();
const scrollTop = () => document.querySelector(".page-wrap")?.scrollTop ?? 0;
document.addEventListener(
  "scroll",
  () => {
    if (grown.size === 0) return;
    const now = scrollTop();
    grown.forEach((from, card) => {
      if (Math.abs(now - from) < SETTLE_AFTER) return;
      card.classList.add("ccard--settled");
      grown.delete(card);
    });
  },
  { capture: true, passive: true }
);
document.addEventListener("astro:before-swap", () => grown.clear());
document.addEventListener(
  "toggle",
  (e) => {
    const details = e.target;
    if (!(details instanceof HTMLDetailsElement)) return;
    const card = details.closest<HTMLElement>(".cgrid[data-pattern='spread'] .cgrid__cell > .ccard");
    if (!card) return;
    card.classList.remove("ccard--settled");
    if (!details.open) {
      grown.delete(card);
      return;
    }
    grown.set(card, scrollTop());
    // offsetWidth, not the rect's width: the rect carries GSAP's approach
    // scale, and the origin is in the card's own untransformed pixels.
    const w = card.offsetWidth;
    const { left } = card.getBoundingClientRect();
    const right = left + w;
    const grow = OPEN_SCALE - 1;
    const viewport = document.documentElement.clientWidth;
    // Grown left edge = left - grow·x, grown right edge = right + grow·(w - x).
    const most = (left - EDGE) / grow;
    const least = w - (viewport - EDGE - right) / grow;
    const x = Math.min(Math.max(w / 2, least), most);
    card.style.transformOrigin = `${Math.round(x)}px 0`;
  },
  true
);

/** The ledger's pass. Returns the visible count. */
function applyIndexFilter(): number {
  let visible = 0;
  document.querySelectorAll<HTMLElement>(".cindex__row").forEach((row) => {
    const show = memberMatches(row);
    row.hidden = !show;
    if (show) visible += 1;
  });
  return visible;
}

/** The empty-state, for whatever view is on screen. */
function reflectFilterState(grid: HTMLElement, mode: LayoutMode) {
  const visible =
    mode === "index"
      ? applyIndexFilter()
      : grid.querySelectorAll<HTMLElement>(".cgrid__cell:not([hidden])").length;
  const emptyEl = document.getElementById("filter-empty");
  if (emptyEl) {
    emptyEl.hidden = visible > 0;
    // Both galleries are artwork; only the ledger lists members.
    const gallery = mode !== "index";
    emptyEl.textContent =
      (gallery ? emptyEl.dataset.works : emptyEl.dataset.rest) ?? emptyEl.textContent;
  }
}

/** Whether a gallery VIEW has anything to show for a tag — build-stamped on
 *  the option as data-count-works (Spread/strip: a member-with-artwork
 *  carries the tag) or data-count-works-by-tag (Grid, since 2026-09-08: the
 *  wall filters by the picture's OWN tags — see the tagIndex note in the
 *  frontmatter). False for a tag no option offers, which is the same answer
 *  to the caller: nothing to show. */
function tagHasWorks(tag: string, mode: LayoutMode): boolean {
  const opt = document.querySelector<HTMLElement>(
    `.tag-filter__option[data-tag="${CSS.escape(tag)}"]`
  );
  const count = mode === "grid" ? opt?.dataset.countWorksByTag : opt?.dataset.countWorks;
  return Number(count ?? 0) > 0;
}

/** The panel's LIST for the view on screen — which options it offers —
 *  folded together with the search field's narrowing, so a row's `hidden`
 *  has ONE writer and neither pass can undo the other (typing cannot bring a
 *  gallery's workless tags back; clearing the field cannot lose them from
 *  the ledger).
 *
 *  (2026-09-07, Josh: "tags stale because you can select them for artists,
 *  but there are no images in the grid or gallery".) The galleries are
 *  artwork only since 2026-09-03, so there an option whose members all have
 *  empty galleries is not offered — picking it could only empty the view.
 *  The ledger lists everyone, so it offers every tag. "All tags" (the empty
 *  key) is always offered. The decision reads a build-stamped count rather
 *  than re-counting the cells, so the list is right before any deal and the
 *  same in every view of one build — Grid reads data-count-works-by-tag
 *  (the picture's own tags, since 2026-09-08), Spread/strip keep reading
 *  data-count-works (2026-09-07). Nothing is printed behind a label — see
 *  the tagIndex note in the frontmatter for why the count came off. */
function reflectTagOptions(mode: LayoutMode) {
  const gallery = mode !== "index";
  const countKey = mode === "grid" ? "countWorksByTag" : "countWorks";
  const search = document.getElementById("tag-filter-search") as HTMLInputElement | null;
  const needle = search?.value.trim().toLowerCase() ?? "";
  document.querySelectorAll<HTMLElement>(".tag-filter__list li").forEach((li) => {
    const opt = li.querySelector<HTMLElement>(".tag-filter__option");
    if (!opt) return;
    const key = opt.dataset.tag ?? "";
    const works = Number(opt.dataset[countKey] ?? 0);
    const workless = gallery && Boolean(key) && works === 0;
    const missed = Boolean(needle) && Boolean(key) && !key.includes(needle);
    li.hidden = workless || missed;
  });
}

/** The tags trigger and its options: the list is the view's (above), the
 *  trigger shows the active tag's label (or its resting text), the active
 *  option is underlined. */
function reflectTagUI(mode: LayoutMode) {
  reflectTagOptions(mode);
  let activeLabel = "";
  document
    .querySelectorAll<HTMLButtonElement>(".tag-filter__option[data-label]")
    .forEach((opt) => {
      const active = Boolean(tagFilter) && opt.dataset.tag === tagFilter;
      opt.setAttribute("aria-pressed", String(active));
      if (active) activeLabel = opt.dataset.label ?? "";
    });
  const label = document.getElementById("tag-filter-label");
  if (label) label.textContent = activeLabel || (label.dataset.rest ?? "");
  document
    .getElementById("tag-filter-btn")
    ?.classList.toggle("filter-word--set", Boolean(tagFilter));
}

// One shuffle per VIEW, not per keystroke: page load and the view toggle
// deal fresh, but narrowing keeps the standing order so surviving cards
// hold their relative positions while the visitor types instead of
// leapfrogging on every input. Kept over ALL artwork cells; a narrowed
// deal takes the survivors in this order.
//
// Keyed by which artwork cells the view is made of — "image" for the
// spread's member cards, "work" for the wall's per-artwork tiles.
const artworkOrder: Record<string, HTMLElement[]> = {};

function applyLayout(grid: HTMLElement, mode: LayoutMode, reshuffle = true) {
  // The motion layer reads this to key its parallax — per row in the
  // aligned-rows grid, per cell in the spread. Stamped before any early
  // return so it is always truthful about what is on screen.
  grid.dataset.pattern = mode;

  // The wall measures the WINDOW; every other view sits inside the page's
  // measure. This releases main's cap for the wall alone (see global.css),
  // and it has to happen before anything measures — a count taken against
  // the capped measure comes out short, and on a wide screen by several
  // cards. Cleared for every other mode by the same call.
  document.body.classList.toggle("wall-bleed", mode === "grid");

  // The grid wall hides the disclosures in CSS; close them here too, or
  // a panel left open in the spread is still open on the way back.
  if (mode !== "spread") {
    grid.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((d) => {
      d.open = false;
    });
  }

  // The index is not a deal: the server rendered the whole ledger, so the
  // selector only swaps which of the two siblings is visible. The grid keeps
  // whatever slots its cells already hold — switching back re-deals anyway.
  const index = document.getElementById("member-index");
  if (index) index.hidden = mode !== "index";
  if (mode === "index") {
    grid.hidden = true;
    const stripEl = grid.querySelector<HTMLElement>(".cgrid__strip");
    if (stripEl) stripEl.hidden = true;
    reflectFilterState(grid, mode);
    return;
  }

  const strip = grid.querySelector<HTMLElement>(".cgrid__strip");
  const cells = Array.from(grid.querySelectorAll<HTMLElement>(".cgrid__cell"));
  // WHICH ARTWORK CELLS THIS VIEW IS MADE OF. The wall deals one tile per
  // WORK; every other view deals one card per MEMBER. Both sets are in the
  // DOM, and the one this view is not built from is hidden outright — which
  // is also why switching costs nothing and why the wall's images are not
  // fetched until the wall is on screen.
  const artKind = mode === "grid" ? "work" : "image";
  // BOTH GALLERIES ARE ARTWORK ONLY. The wall stopped showing the
  // artwork-less members on 2026-09-01 ("remove the empty cards"); the
  // spread followed on 2026-09-03 ("remove memebrs from gallery that dont
  // have images"), so there is no longer a view here that deals a second
  // kind of cell — `artKind` is the whole membership test. Everyone without
  // a gallery is a row in the Index; see the header.
  // The filter narrows the DEAL, not the drawing: non-matching cells leave
  // the grid entirely (display:none) and the survivors are dealt into the
  // pattern's leading slots, so the page always reads as designed. Hiding
  // in place would leave the drawn slots standing empty — the exact failure
  // the old comment on .cgrid__cell[hidden] warned about.
  cells.forEach((cell) => {
    cell.hidden = cell.dataset.slot !== artKind || !memberMatches(cell);
  });
  const matching = cells.filter((cell) => !cell.hidden);
  // With nothing to deal the grid itself steps aside — its padding would
  // otherwise hold the page open under the empty-state message — and the
  // slot math is never asked to lay out zero cards.
  grid.hidden = matching.length === 0;
  if (matching.length === 0) {
    if (strip) strip.hidden = true;
    reflectFilterState(grid, mode);
    return;
  }
  // Every surviving cell is artwork of this view's kind — there is no second
  // kind any more (see the header) — so `matching` IS the gallery.
  //
  // One standing order PER SET, not one shared: the wall's tiles and the
  // spread's cards are different cells, so a single list would be emptied of
  // everything the current view can use on every switch — and the point of
  // keeping it is that narrowing by tag must not reshuffle what is on screen.
  const byRank = (a: HTMLElement, b: HTMLElement) =>
    Number(a.dataset.rank) - Number(b.dataset.rank);
  if (reshuffle || !artworkOrder[artKind]?.length) {
    // SORTED BY RANK BEFORE SHUFFLING, which is not tidiness: a deal
    // re-sorts the cells in the DOM afterwards (see the header — reading
    // order has to run down the page), so `cells` arrives in the PREVIOUS
    // deal's order. A seeded shuffle over a varying input is not
    // reproducible, and reproducing the deal is the whole point of the seed
    // (see rememberedSeed). Rank is the one order that is the same on a
    // freshly swapped document and on one that has been dealt twice.
    // Banded, not flat (see shuffledInBands): the wall's tiles band on the
    // picture's own score and the spread's cards on their member's best, and
    // both read those off data-score. byRank still does exactly what its
    // comment above says — it is what makes the INPUT to the shuffle the
    // same on a freshly swapped document as on a twice-dealt one, which is
    // what a reproducible seed needs.
    artworkOrder[artKind] = shuffledInBands(
      cells.filter((cell) => cell.dataset.slot === artKind).sort(byRank)
    );
  }
  const orderedGallery = artworkOrder[artKind].filter((cell) => matching.includes(cell));

  if (mode === "strip" && strip) {
    orderedGallery.forEach((cell) => {
      // Grid placement goes inert inside the flex row, but the frame cap
      // does not — without it a portrait would grow to its slotless 999.
      cell.style.setProperty("--slot-rows", String(STRIP_SLOT_ROWS));
      // The old rectangle is gone; a stale ?grid label would lie about it.
      cell.dataset.row = "0";
      cell.dataset.span = "";
      cell.dataset.col = "";
      strip.appendChild(cell);
    });
    strip.hidden = false;
    // The index ladder that used to run under the strip is gone with the tag
    // cards it laid out — layOutStripIndex has no callers left.
    reflectFilterState(grid, mode);
    return;
  }

  if (mode === "grid") {
    // The wall deals every WORK into its own slot, and nothing else.
    // Generated, not drawn: as many fixed-width tracks as the window fits
    // (see the wall block in the styles above). The count goes onto the grid
    // for the CSS to build its tracks from, and is remembered so a resize
    // can tell a real change from a wobble.
    wallCols = writeWallMetrics(grid);
    const all = layOutWall(matching.length, wallCols);
    orderedGallery.forEach((cell, i) => {
      writeSlot(cell, all[i]);
      // The brick: even rows are the offset ones (layOutWall's parity), and
      // a one-track wall has nothing to step against — the only card in a
      // row would simply hang off the right edge.
      if (wallCols >= 2 && all[i].rowStart % 2 === 0) {
        cell.style.setProperty("--row-offset", "calc(var(--wall-pitch) / 2)");
      }
    });
    if (strip) strip.hidden = true;
    cells.sort(domOrder).forEach((cell) => grid.appendChild(cell));
    reflectFilterState(grid, mode);
    return;
  }

  // The spread deals exactly like the wall: one run of slots, filled with
  // the shuffled artwork and nothing else.
  const all = layOutSlots(GALLERY_PATTERNS.spread, matching.length, 0);
  orderedGallery.forEach((cell, i) => writeSlot(cell, all[i]));
  if (strip) strip.hidden = true;
  cells.sort(domOrder).forEach((cell) => grid.appendChild(cell));
  reflectFilterState(grid, mode);
}

function modeFromURL(): LayoutMode {
  const p = new URLSearchParams(window.location.search).get("pattern");
  return (MODES as string[]).includes(p ?? "") ? (p as LayoutMode) : DEFAULT_VIEW;
}

/** The Gallery/Grid selector's pressed state. In strip mode (URL-only,
 *  no UI) neither button is pressed, which is the honest rendering. */
function reflectMode(mode: LayoutMode) {
  document.querySelectorAll<HTMLButtonElement>(".view-toggle__btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === mode));
  });
}

// Module scope so a page swap replaces the watch instead of stacking a
// second one on a bar the first is still holding.
let fadeInsetObserver: ResizeObserver | null = null;

document.addEventListener("astro:page-load", () => {
  const grid = document.getElementById("member-grid");
  if (grid) {
    // The tag comes back from the URL the same way the pattern does — but
    // only if an actual option offers the value. Reset first: the module
    // outlives page swaps, the previous visit's choice must not.
    tagFilter = "";
    const params = new URLSearchParams(window.location.search);
    const tag = params.get("tag");
    if (tag && document.querySelector(`.tag-filter__option[data-tag="${CSS.escape(tag)}"]`)) {
      tagFilter = tag;
    }
    // The view first: the dropdown's list depends on it (reflectTagOptions).
    const mode = modeFromURL();
    reflectTagUI(mode);

    // Before the first deal: a Back onto this entry reproduces the page it
    // was left showing, a fresh arrival gets a new one. See rememberedSeed.
    dealSeed = rememberedSeed();

    applyLayout(grid, mode);
    reflectMode(mode);

    // ── A TAG CHIP KEEPS THE PICTURE VIEW YOU ARE IN ──────
    // (2026-09-03.) communityTagHref() sends every chip to the GALLERY,
    // which is right everywhere the link is printed off this page — a
    // member's own profile has no view to keep. On /community that left
    // the chips disagreeing with the dropdown directly above them: picking
    // "Animation" from the dropdown preserves ?pattern= (it builds its URL
    // from window.location), while a chip in an open panel silently moved a
    // reader off the wall and into the spread.
    //
    // The rule that satisfies both halves of Josh's ask ("clicking on tags
    // opens gallery with tag filter applied", and NOT "a narrower ledger"):
    // a chip goes to PICTURES, and keeps the picture view it was pressed in.
    // The wall is pictures, so grid → grid. The ledger is not, so index →
    // the spread, exactly as before.
    //
    // THE GALLERY IS NAMED NOW, not implied by an absent parameter — the
    // bare URL is the ledger while DEFAULT_VIEW says so, and a chip that
    // dropped ?pattern= would land the reader on the very ledger this rule
    // exists to take them off. So every chip carries an explicit view.
    //
    // The href is REWRITTEN rather than intercepted on click, so the status
    // bar, middle-click and open-in-new-tab all agree with what a left click
    // does. Re-run on every page-load because a view switch is a navigation
    // that swaps this document (see goTo).
    // Edited as TEXT, not round-tripped through URL/URLSearchParams. That
    // rewrites `%20` to `+` in a multi-word tag, which decodes to the same
    // filter but is a different string — a second URL, a second history
    // entry and a second cache key for one place, and it would have silently
    // changed every chip on the page including the ones this rule leaves
    // alone. Splitting on the suffix first makes the pass idempotent, since
    // it runs again on every swapped-in document.
    document.querySelectorAll<HTMLAnchorElement>("a.pdisc__tag").forEach((chip) => {
      // Split on EITHER separator: communityTagHref emits "?tag=…&pattern="
      // for a real tag and "?pattern=" for the tagless case, and a pass that
      // only knew the "&" form would append a second pattern to the latter.
      const base = (chip.getAttribute("href") ?? "").split(/[?&]pattern=/)[0];
      const view = mode === "grid" ? "grid" : TAG_CHIP_VIEW;
      chip.setAttribute("href", `${base}${base.includes("?") ? "&" : "?"}pattern=${view}`);
    });
    if (new URLSearchParams(window.location.search).has("grid")) {
      grid.classList.add("cgrid--debug");
    }

    // The view selector. Each choice is a NAVIGATION to the same page with a
    // different ?pattern= — see goTo above for why it is not a local re-deal
    // any more. Everything else follows from the URL: the handler below runs
    // again on the swapped-in document, deals the view, presses the right
    // button and rebuilds the motion layer.
    document.querySelectorAll<HTMLButtonElement>(".view-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.mode as LayoutMode;
        if (grid.dataset.pattern === next) return;
        const url = new URL(window.location.href);
        // The DEFAULT view is the bare URL; every other view is named.
        // Keyed off the constant rather than off "spread", so moving the
        // default moves the canonical URL with it and the page never has
        // two addresses for the same view.
        if (next === DEFAULT_VIEW) url.searchParams.delete("pattern");
        else url.searchParams.set("pattern", next);
        // ── A WORKLESS TAG DOES NOT FOLLOW YOU INTO A GALLERY ──
        // (2026-09-07, Josh: "tags stale because you can select them for
        // artists, but there are no images in the grid or gallery".) The
        // ledger offers every tag; a gallery offers only the ones with
        // artwork behind them (reflectTagOptions). A tag picked in the
        // ledger that no gallery can show is dropped from the URL on the
        // way over, so the reader lands on the full wall — not on an empty
        // one whose filter is missing from the very dropdown they would
        // open to clear it. Only the URL is edited: the navigation re-reads
        // it, and tagFilter and the trigger follow from there. A DEEP LINK
        // with such a tag still gets the honest empty state — nothing was
        // chosen on this page for it to undo.
        if (next !== "index" && tagFilter && !tagHasWorks(tagFilter, next)) {
          url.searchParams.delete("tag");
        }
        goTo(url);
      });
    });

    // ── WHERE THE GALLERY FADE BEGINS ─────────────────────
    // The mobile gallery's fade runs over `exit` against a scrollport inset
    // by this many pixels, so the number IS the docked filter bar's bottom
    // edge — see the cgrid-cell-out block in the stylesheet. It is read
    // rather than recomputed because the two halves are a calc that has
    // already had to be restated twice (`top`) and a line box of type
    // (`offsetHeight`), and a third copy of either would be a third thing to
    // keep in step.
    //
    // `top` is the DOCKED offset whether or not the bar is docked right now,
    // which is what makes this safe to take at load with the page scrolled
    // to the top. Once per page-load and once per bar resize — the font-size
    // token steps at the breakpoint and the controls can wrap — and never on
    // scroll: this is a constant the compositor then animates against.
    //
    // The same edge is where the header's backdrop layer has to end: the
    // bar paints no fill of its own, and the nav's veil is stretched down
    // past the nav by the difference. Set on .page-wrap because the nav is
    // its child (not this grid's), and .page-wrap is swapped on navigation,
    // so leaving the page takes the extension with it.
    const fadeBar = document.querySelector<HTMLElement>(".community-bar");
    if (fadeBar) {
      const measureFadeInset = () => {
        const dock = parseFloat(getComputedStyle(fadeBar).top);
        if (!Number.isFinite(dock)) return;
        const barBottom = dock + fadeBar.offsetHeight;
        grid.style.setProperty("--cgrid-fade-inset", `${barBottom}px`);
        const pageWrap = fadeBar.closest<HTMLElement>(".page-wrap");
        const nav = pageWrap?.querySelector<HTMLElement>(":scope > nav");
        if (pageWrap && nav) {
          // Unrounded heights, not offsetHeight: the veil's edge is drawn,
          // and a rounded one stops a fraction short of the bar and leaves
          // a sliver of unveiled artwork showing under the controls.
          const extend = Math.max(
            0,
            dock + fadeBar.getBoundingClientRect().height - nav.getBoundingClientRect().height,
          );
          pageWrap.style.setProperty("--nav-backdrop-extend", `${extend}px`);
        }
      };
      measureFadeInset();
      fadeInsetObserver?.disconnect();
      fadeInsetObserver = new ResizeObserver(measureFadeInset);
      fadeInsetObserver.observe(fadeBar);
    }

    // The tags dropdown: the trigger flips the panel; typing in the panel
    // narrows its LIST (local, no deal); picking an option NAVIGATES to the
    // same page with ?tag= set, exactly like the view selector — so a
    // narrowed page is a history entry you can leave and come back to, and
    // a tag link from anywhere else on the site (the disclosure panels' tag
    // chips) lands on the identical URL. Re-picking the active tag (or "All
    // tags") clears it.
    //
    // The re-deal that used to happen here — reshuffle:false, so survivors
    // held their positions while the visitor narrowed — is gone with it: a
    // navigation deals fresh. That is the price of the tag being a real
    // place, and the page scrolls to the top with it, so nothing the
    // standing order was protecting is on screen to be disturbed.
    const tagBtn = document.getElementById("tag-filter-btn");
    const tagPanel = document.getElementById("tag-filter-panel");
    const tagSearch = document.getElementById("tag-filter-search") as HTMLInputElement | null;

    tagBtn?.addEventListener("click", () => {
      if (!tagPanel) return;
      const opening = tagPanel.hidden;
      tagPanel.hidden = !opening;
      tagBtn.setAttribute("aria-expanded", String(opening));
      // ── THE PANEL DOES NOT SUMMON A KEYBOARD ──────────────
      // (2026-09-04, Josh: "search field should not trigger a keyboard
      // directly".) Focusing on open is right where the keyboard is already
      // on the desk and the caret is just a saved click. On a phone it costs
      // the visitor the thing they opened the panel for: the software
      // keyboard rises over the tag LIST, so a control whose main job is
      // browsing every tag opens showing almost none of them, and typing
      // becomes the only way to use it. Tapping the field still focuses it,
      // so nothing is taken away — the keyboard is now asked for rather than
      // assumed.
      if (opening && matchMedia("(hover: hover) and (pointer: fine)").matches) {
        tagSearch?.focus();
      }
    });

    // Narrowing is the same pass that picks the view's options, so the two
    // rules cannot fight over a row — see reflectTagOptions.
    tagSearch?.addEventListener("input", () => reflectTagOptions(mode));

    document.querySelectorAll<HTMLButtonElement>(".tag-filter__option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const picked = opt.dataset.tag ?? "";
        const next = picked === tagFilter ? "" : picked;
        closeTagPanel();
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("tag", next);
        else url.searchParams.delete("tag");
        goTo(url);
      });
    });

    // The page scrolls in .page-wrap, so a mouse wheel over the strip would
    // scroll the PAGE past it. Translate the dominant vertical delta to the
    // strip's own axis — but only while it can still move that way, so the
    // page takes over at either end instead of the strip trapping the wheel.
    const strip = grid.querySelector<HTMLElement>(".cgrid__strip");
    strip?.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        const canRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
        const canLeft = strip.scrollLeft > 0;
        if ((e.deltaY > 0 && canRight) || (e.deltaY < 0 && canLeft)) {
          e.preventDefault();
          strip.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );
  }

  // One observer per VISIT, not per page-load for ever: every view and tag
  // switch is a navigation (goTo), so a bare observer here gained one more
  // copy, each holding a detached page, with every click in the directory.
  const cta = document.getElementById("community-signup-cta");
  if (cta) {
    watchAuth(pageLifetime(), (user) => {
      cta.style.display = user ? "none" : "flex";
    });
  }
});

// The bar's ResizeObserver goes with the page it measures, rather than
// waiting to be replaced by the next visit to /community.
document.addEventListener("astro:before-swap", () => {
  fadeInsetObserver?.disconnect();
  fadeInsetObserver = null;
});

// ────────────────────────────────────────────────────────────────────────
// The wall follows the window.
// The one view whose drawing is a MEASUREMENT: its track count is however
// many fixed-width cards the window fits, so resizing can change the
// drawing itself — no other view here can say that. Module scope, not inside
// astro:page-load, so a page swap cannot stack a second listener; the
// handler looks the grid up each time and does nothing when the wall is not
// the view on screen.
//
// Re-deal ONLY when the count actually moves. A drag across a few hundred
// pixels that fits the same number of cards must leave the wall alone, or
// the page would reshuffle under the reader for nothing — hence reshuffle
// false as well, so the members hold their places. The rebuild the motion
// layer needs (every trigger position is measured against the old
// placement) is the same event a view switch fires.
// ────────────────────────────────────────────────────────────────────────
function liveWall(): HTMLElement | null {
  const grid = document.getElementById("member-grid");
  if (!grid || grid.dataset.pattern !== "grid" || grid.hidden) return null;
  return grid;
}

function redealWall(): void {
  const grid = liveWall();
  if (!grid) return;
  if (wallMetrics(grid).cols === wallCols) return;
  applyLayout(grid, "grid", false);
  document.dispatchEvent(new Event("community:layout-changed"));
}

// TWO SPEEDS, because the window changes two different things. The GUTTER is
// continuous — every pixel of width redistributes it — so it has to follow
// the drag, and it costs two custom properties. The COUNT is a step, and
// stepping it means re-placing every cell and re-measuring the whole motion
// layer, so that waits for the drag to settle and only runs when the count
// has actually moved.
let wallFrame = 0;
let wallResizeTimer = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(wallFrame);
  wallFrame = requestAnimationFrame(() => {
    const grid = liveWall();
    if (grid) writeWallMetrics(grid);
  });
  clearTimeout(wallResizeTimer);
  wallResizeTimer = window.setTimeout(redealWall, 180);
});

// Crossing INTO desktop is the one case the count comparison cannot catch on
// its own: on the phone the wall's knobs do not exist (its rule is
// desktop-only), so the count that was stored is a mobile reading of a
// layout mobile never used. Force the deal rather than compare.
window.matchMedia("(min-width: 768px)").addEventListener("change", (e) => {
  if (!e.matches) return;
  wallCols = 0;
  redealWall();
});
