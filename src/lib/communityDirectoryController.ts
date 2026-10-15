import { watchAuth } from "./auth.ts";
import { pageLifetime } from "./pageLifecycle.ts";
import { navigate } from "astro:transitions/client";
import { isWorkSort, sectionWorks, type SortableWork, type WorkSort } from "./communitySort.ts";
import { DEFAULT_VIEW, viewFromParam, type ViewName } from "./communityLayout.ts";

// ────────────────────────────────────────────────────────────────────────
// Behaviour layer: the deal and the signed-out CTA.
// Runs synchronously on astro:page-load, BEFORE the async motion layer
// below measures anything — a deal after ScrollTrigger creation would leave
// every trigger keyed to a stale position.
// ────────────────────────────────────────────────────────────────────────

/**
 * This decides who stands where. The layout is recomputed from the same
 * module the frontmatter used. PAGES and WALL deal identically: every
 * member (or every work, on the wall) into the view, shuffled artwork
 * leading within a score band, in the build-time completeness order
 * (restored from data-rank) between bands. The pages have no slot table —
 * the DOM order the deal appends IS the stack the page snaps down.
 */
type LayoutMode = ViewName;

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

// ── The Images view's sort ────────────────────────────────────────────────
// One of communitySort's four, or none — the wall's standing shuffled-in-
// bands order. Mirrors into ?sort= like the tag does, reset on every
// astro:page-load for the same reason. Only the wall reads it; the sort
// menu is hidden in every other view (reflectSort).
let workSort: WorkSort | "" = "";

function sortFromURL(): WorkSort | "" {
  const s = new URLSearchParams(window.location.search).get("sort");
  return isWorkSort(s) ? s : "";
}

/** The sort menu: shown on the wall only; its pressed row and the trigger's
 *  name follow `workSort` (the option's text when one is set, the resting
 *  "Sort" otherwise — the tags trigger's convention). */
function reflectSort(mode: LayoutMode) {
  const menu = document.querySelector<HTMLElement>(".sort-menu");
  if (menu) menu.hidden = mode !== "grid";
  let current = "";
  document.querySelectorAll<HTMLButtonElement>(".sort-menu__btn").forEach((btn) => {
    const active = Boolean(workSort) && btn.dataset.sort === workSort;
    btn.setAttribute("aria-pressed", String(active));
    if (active) current = btn.textContent?.trim() ?? "";
  });
  const label = document.getElementById("sort-menu-label");
  if (label) label.textContent = current || (label.dataset.rest ?? "");
  // Filled dark while a sort is set, as the tags trigger is with a tag.
  document.getElementById("sort-menu-btn")?.classList.toggle("filter-word--set", Boolean(current));
}

/** A wall tile, read for communitySort. The attributes are stamped by
 *  CommunityGrid.astro's work cells (data-date, data-member…), the member's
 *  href comes from the same place the lightbox's credit link reads it. */
function sortableOf(cell: HTMLElement): SortableWork & { cell: HTMLElement } {
  const d = cell.dataset;
  const out: SortableWork & { cell: HTMLElement } = {
    cell,
    member: { key: d.member ?? "", label: d.memberName ?? "", href: d.memberHref },
  };
  if (d.date) out.date = d.date;
  if (d.project) out.project = { key: d.project, label: d.projectName ?? "" };
  if (d.field) out.field = { key: d.field, label: d.fieldLabel ?? d.field };
  return out;
}

/** The bar's three drop-ups (tags, sort, view), as [trigger, panel] id pairs. */
const BAR_MENUS = [
  ["tag-filter-btn", "tag-filter-panel"],
  ["sort-menu-btn", "sort-menu-panel"],
  ["view-menu-btn", "view-menu-panel"],
] as const;

/** Close every drop-up in the bar, or every one but `keep`. Queries the live
 *  DOM rather than closing over it, so the module-level listeners below
 *  survive ClientRouter swaps without stacking or holding dead nodes. */
function closeBarMenus(keep?: string) {
  for (const [btnId, panelId] of BAR_MENUS) {
    if (panelId === keep) continue;
    const panel = document.getElementById(panelId);
    if (panel && !panel.hidden) {
      panel.hidden = true;
      document.getElementById(btnId)?.setAttribute("aria-expanded", "false");
    }
  }
}

/** Flip one drop-up, closing the other. Returns whether it is now open. */
function toggleBarMenu(btnId: string, panelId: string): boolean {
  const panel = document.getElementById(panelId);
  if (!panel) return false;
  const opening = panel.hidden;
  closeBarMenus(panelId);
  panel.hidden = !opening;
  document.getElementById(btnId)?.setAttribute("aria-expanded", String(opening));
  return opening;
}

// Module scope, installed ONCE per session — not inside astro:page-load,
// where document-level listeners would stack one copy per navigation.
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest(".bar-menu")) closeBarMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBarMenus();
});

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
  reflectTagClear();
}

/** The tags card's Clear button stands only while there is something to
 *  clear: an active tag, or text in the search field. */
function reflectTagClear() {
  const clear = document.getElementById("tag-filter-clear");
  if (!clear) return;
  const search = document.getElementById("tag-filter-search") as HTMLInputElement | null;
  clear.hidden = !tagFilter && !(search?.value.trim() ?? "");
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
  reflectSnap(mode);

  // The wall measures the WINDOW; every other view sits inside the page's
  // measure. This releases main's cap for the wall alone (see global.css),
  // and it has to happen before anything measures — a count taken against
  // the capped measure comes out short, and on a wide screen by several
  // cards. Cleared for every other mode by the same call.
  document.body.classList.toggle("wall-bleed", mode === "grid");

  // NOTHING TO CLOSE ANY MORE (2026-10-12). This used to fold every open
  // disclosure on the way out of the spread, so a panel left open there was
  // not still open on the way back. The only disclosures in the grid now are
  // the gallery cards' text columns, which are OPEN by default and are the
  // card — folding them here would bring the visitor back to a spread of
  // nameless pictures. The wall hides the image cells outright, columns and
  // all, so there is nothing to tidy.

  // The index is not a deal: the server rendered the whole ledger, so the
  // selector only swaps which of the two siblings is visible. The grid keeps
  // whatever slots its cells already hold — switching back re-deals anyway.
  const index = document.getElementById("member-index");
  if (index) index.hidden = mode !== "index";
  if (mode === "index") {
    grid.hidden = true;
    reflectFilterState(grid, mode);
    return;
  }

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


  if (mode === "grid") {
    // THE WALL IS A FLOW, NOT A DEAL INTO SLOTS (2026-10-15, with the sort).
    // It has been a multicol masonry since 2026-10-12 (the block at the end
    // of CommunityGrid.astro's sheet), which places by DOM ORDER and ignores
    // the --gc/--gr slots layOutWall kept writing until today. So the tiles
    // are now appended in reading order with that placement cleared, and the
    // sort's SECTION HEADS are `.cgrid__head` elements the deal creates here
    // and removes on the next: each is a column spanner, so the columns end
    // above it and start again under it — one run of pictures per head.
    // writeWallMetrics still measures the window (--wall-cols, --wall-gap),
    // which the masonry does not read; it is kept so the resize path stays
    // one path.
    wallCols = writeWallMetrics(grid);
    grid.querySelectorAll(".cgrid__head").forEach((head) => head.remove());
    const items = orderedGallery.map(sortableOf);
    // The filtered tag's display label, for the one-section field sort:
    // the option that offered it carries the first spelling seen.
    const filteredOpt = tagFilter
      ? document.querySelector<HTMLElement>(`.tag-filter__option[data-tag="${CSS.escape(tagFilter)}"]`)
      : null;
    const sections = workSort
      ? sectionWorks(items, workSort, {
          // Its own generator over the deal's seed, so the tag sections come
          // back in the same order on Back (see rememberedSeed) without
          // consuming the shuffle's own sequence.
          random: rngFrom(dealSeed + 1),
          noProject: grid.dataset.sortNoProject ?? "",
          noField: grid.dataset.sortNoField ?? "",
          ...(tagFilter && filteredOpt
            ? { filtered: { key: tagFilter, label: filteredOpt.dataset.label ?? tagFilter } }
            : {}),
        })
      : [{ key: "", label: "", items }];
    // The cells this view does not show stay in the grid (display:none) —
    // appended first so the shown run is contiguous and reads in order.
    cells.filter((cell) => cell.hidden).forEach((cell) => grid.appendChild(cell));
    sections.forEach((section, i) => {
      if (section.label) {
        const head = document.createElement("h2");
        head.className = "cgrid__head";
        if (section.href) {
          const a = document.createElement("a");
          a.href = section.href;
          a.textContent = section.label;
          head.appendChild(a);
        } else {
          head.textContent = section.label;
        }
        grid.appendChild(head);
      }
      section.items.forEach(({ cell }) => {
        cell.style.removeProperty("--gc");
        cell.style.removeProperty("--gr");
        cell.style.removeProperty("--row-offset");
        // One row tall for the frame cap, as every wall slot was.
        cell.style.setProperty("--slot-rows", "1");
        // The ?grid labels: the section the tile is in, not a drawn row.
        cell.dataset.row = String(i + 1);
        cell.dataset.span = "1";
        cell.dataset.col = "";
        delete cell.dataset.lane;
        grid.appendChild(cell);
      });
    });
    reflectFilterState(grid, mode);
    return;
  }

  // PAGES: the members in deal order, one section each, DOM order = snap
  // order (there is no slot table any more — the cell IS the frame, see
  // the pages block in CommunityGrid.astro). The deal is still banded by
  // score and seeded per history entry, so Back returns to the stack it
  // left. The wall's placement properties are cleared in case the cell
  // carried them across a view change.
  orderedGallery.forEach((cell) => {
    cell.style.removeProperty("--gc");
    cell.style.removeProperty("--gr");
    cell.style.removeProperty("--slot-rows");
    cell.style.removeProperty("--row-offset");
    delete cell.dataset.lane;
    grid.appendChild(cell);
  });
  cells.filter((cell) => cell.hidden).forEach((cell) => grid.appendChild(cell));
  reflectFilterState(grid, mode);
}

/**
 * THE PAGE SNAPS ONLY FOR THE PAGES VIEW. .page-wrap is the site's one
 * scroll container (Layout.astro), so the snap is an attribute on it that
 * global.css reads, set here and cleared for every other view and before a
 * swap — a snapping /profile would be a trap.
 */
function reflectSnap(mode: LayoutMode) {
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (!wrap) return;
  if (mode === "pages") wrap.dataset.snap = "y";
  else delete wrap.dataset.snap;
}
document.addEventListener("astro:before-swap", () => {
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (wrap) delete wrap.dataset.snap;
});

function modeFromURL(): LayoutMode {
  return viewFromParam(new URLSearchParams(window.location.search).get("pattern"));
}

/** The view menu's pressed row and its trigger's name. In strip mode
 *  (URL-only, no UI) no row is pressed and the trigger says "View", which
 *  is the honest rendering. */
function reflectMode(mode: LayoutMode) {
  let current = "";
  document.querySelectorAll<HTMLButtonElement>(".view-toggle__btn").forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.setAttribute("aria-pressed", String(active));
    if (active) current = btn.textContent?.trim() ?? "";
  });
  const label = document.getElementById("view-menu-label");
  if (label) label.textContent = current || (label.dataset.rest ?? "");
}

// Module scope so a page swap replaces the watch instead of stacking a
// second one on a bar the first is still holding.

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
    // The wall's sort, from the URL like the tag; the menu shows on the
    // wall only. Before the deal, which reads it.
    workSort = sortFromURL();
    reflectSort(mode);

    // Before the first deal: a Back onto this entry reproduces the page it
    // was left showing, a fresh arrival gets a new one. See rememberedSeed.
    dealSeed = rememberedSeed();

    applyLayout(grid, mode);
    reflectMode(mode);

    // ── A PROFILE TAG GOES TO PORTFOLIOS, WHATEVER VIEW IT IS IN
    // (2026-10-15, Josh: "image tags send to images site with tag selected,
    // profile tags to portfolio".) A chip in a card panel is a MEMBER tag, so
    // communityTagHref() already sends it to the spread, and the chip is left
    // alone. Until today this pass rewrote it to keep the Images view when
    // pressed there (2026-09-03), which landed a member tag on a wall that
    // filters by the PICTURES' tags. Work and project tags go to Images via
    // communityWorkTagHref().
    // The view selector. Each choice is a NAVIGATION to the same page with a
    // different ?pattern= — see goTo above for why it is not a local re-deal
    // any more. Everything else follows from the URL: the handler below runs
    // again on the swapped-in document, deals the view, presses the right
    // button and rebuilds the motion layer.
    document.querySelectorAll<HTMLButtonElement>(".view-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.mode as LayoutMode;
        closeBarMenus();
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

    document
      .getElementById("view-menu-btn")
      ?.addEventListener("click", () => toggleBarMenu("view-menu-btn", "view-menu-panel"));
    document
      .getElementById("sort-menu-btn")
      ?.addEventListener("click", () => toggleBarMenu("sort-menu-btn", "sort-menu-panel"));

    tagBtn?.addEventListener("click", () => {
      if (!tagPanel) return;
      const opening = toggleBarMenu("tag-filter-btn", "tag-filter-panel");
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
    tagSearch?.addEventListener("input", () => {
      reflectTagOptions(mode);
      reflectTagClear();
    });

    // Clear empties the field and, when a tag is set, drops it — a
    // navigation like any other tag change, so it is a history entry.
    // With only search text to clear, the card stays open on the full list.
    document.getElementById("tag-filter-clear")?.addEventListener("click", () => {
      if (tagSearch) tagSearch.value = "";
      if (!tagFilter) {
        reflectTagOptions(mode);
        reflectTagClear();
        // Same rule as opening: no keyboard summoned on a touch screen.
        if (matchMedia("(hover: hover) and (pointer: fine)").matches) tagSearch?.focus();
        return;
      }
      closeBarMenus();
      const url = new URL(window.location.href);
      url.searchParams.delete("tag");
      goTo(url);
    });

    document.querySelectorAll<HTMLButtonElement>(".tag-filter__option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const picked = opt.dataset.tag ?? "";
        const next = picked === tagFilter ? "" : picked;
        closeBarMenus();
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("tag", next);
        else url.searchParams.delete("tag");
        goTo(url);
      });
    });

    // The sort menu: a navigation to ?sort=, like a tag pick — re-picking
    // the active sort clears it, back to the shuffled wall. The sort menu
    // trigger itself is wired with the other two below.
    document.querySelectorAll<HTMLButtonElement>(".sort-menu__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const picked = btn.dataset.sort ?? "";
        const next = picked === workSort ? "" : picked;
        closeBarMenus();
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("sort", next);
        else url.searchParams.delete("sort");
        goTo(url);
      });
    });

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
