import { watchAuth } from "./auth.ts";
import { pageLifetime } from "./pageLifecycle.ts";
import { navigate } from "astro:transitions/client";
import { isWorkSort, sectionWorks, type SortableWork, type WorkSort } from "./communitySort.ts";
import { DEFAULT_VIEW, viewFromParam, type ViewName } from "./communityLayout.ts";
import { setPagesPaging } from "./pagesPager.ts";
import { setPagesEntrance } from "./pagesEntrance.ts";
import { setPagesRail } from "./pagesRail.ts";
import { whenHoldDone } from "./entrance.ts";
import { shuffleBands } from "./communityDeal.ts";
import { searchDirectory, type SearchIndex } from "./communitySearch.ts";

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
  // One implementation for this deal and the one that runs before the first
  // paint (communityDeal.ts), so a seed always gives the same order.
  return shuffleBands(items, dealSeed || (dealSeed = freshSeed()));
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
/** THE MASONRY'S MEASURE (2026-10-15, replacing the multicol — see the
 *  masonry block at the end of CommunityGrid.astro's sheet). The knobs are
 *  read off the grid rule so the drawing has one source: a column to aim
 *  for and a gutter on a desktop (as many columns as fit, the way
 *  `column-width` chose), a fixed count on a phone, and the air under each
 *  tile, which the placement counts as part of a tile's height. `colWidth`
 *  is what the flex columns will resolve to, so a tile's height can be
 *  known from its picture's aspect before anything is laid out. */
function masonryMetrics(grid: HTMLElement): {
  cols: number;
  colWidth: number;
  tileGap: number;
} {
  const cs = getComputedStyle(grid);
  const px = (name: string) => parseFloat(cs.getPropertyValue(name));
  const fixed = px("--masonry-cols");
  const col = px("--masonry-col");
  const gap = px("--masonry-gap");
  const tileGap = px("--masonry-tile-gap");
  const width = grid.clientWidth;
  if (Number.isNaN(gap) || !width) return { cols: 0, colWidth: 0, tileGap: 0 };
  const cols =
    fixed > 0 ? fixed : col > 0 ? Math.max(1, Math.floor((width + gap) / (col + gap))) : 1;
  return {
    cols,
    colWidth: (width - (cols - 1) * gap) / cols,
    tileGap: Number.isNaN(tileGap) ? 0 : tileGap,
  };
}

/** A wall tile's height in a column of `colWidth`, from its picture's
 *  dimensions (the lightbox's data-pswp-width/height): the frame keeps the
 *  aspect and caps a tall work at 1.5 × the column (CommunityWorkCard's
 *  --frame-cap through the cell's --cgrid-row), narrowing it instead. A tile
 *  with no readable dimensions counts as a square. */
function tileHeight(cell: HTMLElement, colWidth: number): number {
  const link = cell.querySelector<HTMLElement>(".cwork__link");
  const w = Number(link?.dataset.pswpWidth);
  const h = Number(link?.dataset.pswpHeight);
  if (!(w > 0 && h > 0)) return colWidth;
  return Math.min(colWidth * (h / w), 1.5 * colWidth);
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
  if (d.fields) {
    // Build-stamped JSON (see workFields in CommunityGrid.astro); a tile
    // whose attribute will not parse is treated as untagged, not dropped.
    try {
      const parsed: unknown = JSON.parse(d.fields);
      if (Array.isArray(parsed)) {
        out.fields = parsed
          .filter((f): f is { key: string; label?: string } => !!f && typeof f.key === "string")
          .map((f) => ({ key: f.key, label: f.label ?? f.key }));
      }
    } catch {
      /* untagged */
    }
  }
  return out;
}

/** The bar's four drop-ups (search, tags, sort, view), as [trigger, panel] id pairs. */
const BAR_MENUS = [
  ["search-btn", "search-panel"],
  ["tag-filter-btn", "tag-filter-panel"],
  ["sort-menu-btn", "sort-menu-panel"],
  ["view-menu-btn", "view-menu-panel"],
] as const;

/** The two queries custom-media.css calls --bp-mobile, spelled out. */
const PHONE_QUERY = "(width <= 767px), (pointer: coarse)";

/** The site's ease-out (lightbox.ts), and long enough to read as the pill
 *  growing rather than jumping. */
const BAR_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const BAR_MS = 320;

/** The pill's size animation in flight, and the panel it is closing over. */
let barAnim: Animation | null = null;
let barLeaving: HTMLElement | null = null;

/** Write the pill's corner radius. Only the phone sheet EASES it (`ease`);
 *  everywhere else it snaps, because --bar-r rests at its registered 999px
 *  and easing from there down to the half-height made the growing box bulge
 *  round for the length of the transition (10-16, Josh: "should not expand
 *  the border roundness on animation"). `null` drops back to the capsule. */
function setBarR(pill: HTMLElement, r: string | null, ease = false) {
  if (!ease) pill.style.transition = "none";
  if (r === null) pill.style.removeProperty("--bar-r");
  else pill.style.setProperty("--bar-r", r);
  if (!ease) {
    getComputedStyle(pill).getPropertyValue("--bar-r");
    pill.style.removeProperty("transition");
  }
}

/** End a size animation where it stands: the closing panel goes, the held
 *  size is released. */
function settleBar(pill: HTMLElement) {
  barAnim?.cancel();
  barAnim = null;
  delete pill.dataset.sizing;
  if (barLeaving) {
    barLeaving.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    barLeaving.hidden = true;
    barLeaving.style.removeProperty("pointer-events");
    barLeaving = null;
  }
  const openPanel = BAR_MENUS.map(([, id]) => document.getElementById(id)).find((p) => p && !p.hidden) ?? null;
  if (!openPanel) setBarR(pill, null);
  // THE WORDS AFTER THE BOX (2026-10-19, Josh: "tags should be revealed
  // after the box is fully revealed. smooth fade in"): a panel that opened
  // with this size animation was held clear while the pill grew; now that
  // the box stands, its content fades in.
  if (openPanel && openPanel.dataset.entering !== undefined) {
    delete openPanel.dataset.entering;
    openPanel.style.removeProperty("opacity");
    openPanel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: "ease-out" });
  }
}

/** Open one drop-up (`null`: none), the pill GROWING round it (2026-10-16,
 *  Josh: "can the selections stay contained in the outer pill so everything
 *  smoothly animates with expands and contracts"). The panels are inside the
 *  pill (.community-bar__panels), so the state change alone resizes it; this
 *  measures the size before and after and eases between the two, the pill
 *  clipping its content meanwhile. Closing keeps the panel in until the
 *  pill has shrunk off it. Retargets from wherever an animation in flight
 *  has got to. Queries the live DOM rather than closing over it, so the
 *  module-level listeners below survive ClientRouter swaps. */
function setBarMenu(open: string | null) {
  const pill = document.querySelector<HTMLElement>(".community-bar__in");
  if (barLeaving && !barLeaving.isConnected) barLeaving = null;
  // Already headed there (a second click outside while it closes, say): let
  // the animation run on rather than snap it to its end.
  const shown = BAR_MENUS.find(([, id]) => {
    const el = document.getElementById(id);
    return el?.hidden === false && el !== barLeaving;
  })?.[1];
  if ((shown ?? null) === open) return;
  if (pill) settleBar(pill);
  const prev = BAR_MENUS.find(([, id]) => document.getElementById(id)?.hidden === false)?.[1] ?? null;
  if (prev === open) return;

  for (const [btnId, panelId] of BAR_MENUS) {
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = panelId !== open;
    document.getElementById(btnId)?.setAttribute("aria-expanded", String(panelId === open));
  }
  if (prev === "search-panel" && open !== prev && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  // ONE CARD FOR ALL THREE (2026-10-29, Josh: "unify the UX across filter
  // sort and search. also the pills should morph over the bottom bar"). On
  // a phone Search, Tags and Sort each open the same card, laid over the
  // bar and grown out of its own pill (growFromPill); the search's
  // full-screen sheet is gone. A desktop's cards cover its strip the same
  // way (2026-10-29).
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (prev && prev !== open) shrinkIntoPill(prev);
    if (open) growFromPill(open);
  }
}

/** THE PILL GROWS INTO ITS FIELD (2026-10-28, Josh: "the pills should grow
 *  into their field (search, tags and sort)"). Each control is its own pill
 *  and its panel a card laid over the strip (or the phone's bar); the card
 *  starts AS the pill — its place, its size, its round ends and its fill —
 *  and opens out to the card while its contents fade in behind. Closing runs
 *  it back into the pill. One element is animated, the card: translated onto
 *  the pill, clipped to the pill's box, in its colour. */
const GROW_MS = 300;
const GROW_EASE = "cubic-bezier(0.2, 0.9, 0.25, 1)";
const SHRINK_EASE = "cubic-bezier(0.5, 0, 0.75, 0)";

function pillParts(panelId: string) {
  const pair = BAR_MENUS.find(([, id]) => id === panelId);
  const trigger = pair ? document.getElementById(pair[0]) : null;
  const panel = document.getElementById(panelId);
  return { trigger, panel, box: panel };
}

/** The colour the trigger is settling to. Closing, it is still easing out of
 *  its open fill (--color-dark) when the card starts back, and a card that
 *  took that first frame's colour folded into a dark slab (2026-10-29, Josh:
 *  "drop up button dark on collapse"). A running transition's last keyframe
 *  is where it is going. */
function restingColour(trigger: HTMLElement): string {
  for (const a of trigger.getAnimations()) {
    if (!(a instanceof CSSTransition) || a.transitionProperty !== "background-color") continue;
    const last = (a.effect as KeyframeEffect | null)?.getKeyframes().at(-1)?.backgroundColor;
    if (typeof last === "string") return last;
  }
  return getComputedStyle(trigger).backgroundColor;
}

function pillFrames(trigger: HTMLElement, box: HTMLElement, closing = false): Keyframe[] {
  const t = trigger.getBoundingClientRect();
  const r = box.getBoundingClientRect();
  // A square box (the phone's full-screen search) ends square: 0 is a radius,
  // not a missing one.
  const radius = parseFloat(getComputedStyle(box).borderTopLeftRadius);
  const end = Math.min(Number.isNaN(radius) ? r.height / 2 : radius, r.height / 2, r.width / 2);
  return [
    {
      transform: `translateY(${t.top - r.top}px)`,
      clipPath: `inset(0px ${r.right - t.right}px ${r.height - t.height}px ${t.left - r.left}px round ${t.height / 2}px)`,
      backgroundColor: closing ? restingColour(trigger) : getComputedStyle(trigger).backgroundColor,
    },
    { transform: "none", clipPath: `inset(0px 0px 0px 0px round ${end}px)`, backgroundColor: getComputedStyle(box).backgroundColor },
  ];
}

/** What fades with the box: the card's contents. */
function pillContents(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.children) as HTMLElement[];
}

function growFromPill(panelId: string) {
  const { trigger, panel, box } = pillParts(panelId);
  if (!trigger || !panel || !box) return;
  box.animate(pillFrames(trigger, box), { duration: GROW_MS, easing: GROW_EASE });
  for (const el of pillContents(panel)) {
    el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: GROW_MS + 100, easing: "ease-out" });
  }
}

function shrinkIntoPill(panelId: string) {
  const { trigger, panel, box } = pillParts(panelId);
  if (!trigger || !panel || !box) return;
  // Kept on screen, out of reach, until it is back in the pill.
  panel.hidden = false;
  panel.style.pointerEvents = "none";
  barLeaving = panel;
  for (const el of pillContents(panel)) {
    el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: GROW_MS * 0.7, fill: "forwards" });
  }
  const anim = box.animate(pillFrames(trigger, box, true).reverse(), { duration: GROW_MS * 0.7, easing: SHRINK_EASE, fill: "forwards" });
  anim.onfinish = () => {
    if (barLeaving !== panel) return;
    panel.hidden = true;
    panel.style.removeProperty("pointer-events");
    barLeaving = null;
    panel.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  };
}

/** Ease the pill from `from` to the size its content now asks for. A panel
 *  still closing (barLeaving) is left out of that size and kept shown until
 *  the pill has shrunk off it. */
function sizeBar(pill: HTMLElement, from: DOMRect) {
  delete pill.dataset.sizing;
  if (barLeaving) barLeaving.hidden = true;
  const to = pill.getBoundingClientRect();
  // Closing: the capsule's corners for the size it closes to, so the sheet's
  // square corners round back while it shrinks (settleBar drops the value).
  if (!BAR_MENUS.some(([, id]) => document.getElementById(id)?.hidden === false)) {
    setBarR(pill, `${to.height / 2}px`, true);
  }
  // Measured above at rest; from here the row keeps that width (CSS).
  pill.dataset.sizing = "";
  if (barLeaving) barLeaving.hidden = false;
  const anim = pill.animate(
    [
      { width: `${from.width}px`, height: `${from.height}px` },
      { width: `${to.width}px`, height: `${to.height}px` },
    ],
    // Held at the end until the panel is gone, or the pill would flash
    // back to the closing panel's size for a frame.
    { duration: BAR_MS, easing: BAR_EASE, fill: "forwards" }
  );
  barAnim = anim;
  anim.onfinish = () => {
    if (barAnim === anim) settleBar(pill);
  };
}

// THE LABELS CHANGE ACROSS A SWAP. The bar persists, but the new page names
// a new view, tag or sort in its triggers (and shows or hides Sort), so the
// pill's natural width moves. Its size just before the swap is the start;
// once the page-load handler has relabelled it, it eases to the new one —
// retargeting any open or close still in flight.
let barBefore: { el: HTMLElement; rect: DOMRect } | null = null;
document.addEventListener("astro:before-swap", () => {
  const el = document.querySelector<HTMLElement>(".community-bar__in");
  barBefore = el ? { el, rect: el.getBoundingClientRect() } : null;
});
function reflowBar() {
  const before = barBefore;
  barBefore = null;
  const pill = document.querySelector<HTMLElement>(".community-bar__in");
  if (!pill || before?.el !== pill) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // A desktop's bar has no box to ease from one label to the next.
  if (!window.matchMedia(PHONE_QUERY).matches) return;
  // NO SIZE CHANGE, NO EASE (2026-10-29, Josh: "there is still a shift in
  // the bottom bar"). The views keep the same pills now, so the pill is the
  // same size on both sides of a swap — but easing it anyway set
  // data-sizing, which lays the row out at its own width, and every pill
  // stepped 3–4px left and back.
  const now = pill.getBoundingClientRect();
  if (!barAnim && Math.abs(now.width - before.rect.width) < 0.5 && Math.abs(now.height - before.rect.height) < 0.5) return;
  barAnim?.cancel();
  barAnim = null;
  sizeBar(pill, before.rect);
}

/** THE CARD STAYS ABOVE THE KEYBOARD (2026-10-29). The bar is fixed to the
 *  LAYOUT viewport's foot, which iOS does not raise for its keyboard; the
 *  search and the tags' field would open behind it. The keyboard's height
 *  lifts the bar (--bar-kb) and the visible height caps the cards
 *  (--bar-room), see the phone rules in CommunityGrid.astro. */
function fitBarToKeyboard() {
  const bar = document.querySelector<HTMLElement>(".community-bar");
  const vv = window.visualViewport;
  if (!bar || !vv) return;
  // A pinch-zoom shrinks the visual viewport too, without any keyboard:
  // ignored while zoomed, as Layout.astro's --shell-h watchdog does.
  const zoomed = vv.scale !== 1;
  const kb = zoomed ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  bar.style.setProperty("--bar-kb", `${Math.round(kb)}px`);
  bar.style.setProperty("--bar-room", `${Math.round(zoomed ? window.innerHeight : vv.height)}px`);
  // Where the visible screen starts: iOS scrolls the layout viewport up
  // under the keyboard, and the full-screen search must start there.
  bar.style.setProperty("--bar-vtop", `${Math.round(zoomed ? 0 : Math.max(0, vv.offsetTop))}px`);
}
window.visualViewport?.addEventListener("resize", fitBarToKeyboard);
window.visualViewport?.addEventListener("scroll", fitBarToKeyboard);

function closeBarMenus() {
  setBarMenu(null);
}

/** Flip one drop-up, closing the other. Returns whether it is now open. */
function toggleBarMenu(panelId: string): boolean {
  const panel = document.getElementById(panelId);
  if (!panel) return false;
  const opening = panel.hidden || panel === barLeaving;
  setBarMenu(opening ? panelId : null);
  return opening;
}

/** The bar out of <main> and onto <body> (2026-10-16, "persistent across
 *  page changes within community"). It is rendered in main and persisted
 *  from page to page (transition:persist in CommunityGrid.astro), but main
 *  itself fades, rises and blurs on every swap (Layout.astro), and a fixed
 *  element inside an animated one moves with it. Run on after-swap, before
 *  the first frame of the new page, and on page-load for a full load; the
 *  swap finds a persisted element anywhere in the old body, so it comes
 *  back next time too. */
let barLeave: Animation | null = null;
let barArriving = false;

function liftBar() {
  const bar = document.querySelector<HTMLElement>(".community-bar");
  if (bar && bar.parentElement !== document.body) document.body.append(bar);
  // A leave fade (below) whose navigation never left.
  barLeave?.cancel();
  barLeave = null;
  // Moving a node can drop the animation it carries, and then nothing would
  // ever finish it: release a held size and a panel left half-closed.
  const pill = bar?.querySelector<HTMLElement>(".community-bar__in");
  if (pill && barAnim && barAnim.playState !== "running") settleBar(pill);
}
document.addEventListener("astro:after-swap", liftBar);
document.addEventListener("astro:page-load", liftBar);
document.addEventListener("astro:page-load", fitBarToKeyboard);

// Off the directory (another page, or the other language's directory, whose
// bar is a different one): the bar fades with the page it no longer belongs
// to, since it is not in <main> to fade with it.
document.addEventListener("astro:before-preparation", (e) => {
  barArriving = e.to.pathname !== e.from.pathname;
  if (!barArriving) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  barLeave =
    document
      .querySelector<HTMLElement>(".community-bar")
      ?.animate([{}, { opacity: 0 }], { duration: 220, easing: "ease-in", fill: "forwards" }) ?? null;
});

// ...and comes in with the page it arrives on (2026-10-29, Josh: "there is
// some flashing when switching pages"). Coming from another page the bar is
// a new one, outside <main>, so it stood at full strength through the whole
// pause Layout.astro holds the arriving page blank for, and the page then
// faded in under it: the bar blinked on half a second ahead of everything
// else. It now waits out the same hold and fades with <main> (same length,
// same curve). A view switch keeps the persisted bar, which never left.
document.addEventListener("astro:after-swap", () => {
  if (!barArriving) return;
  barArriving = false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const bar = document.querySelector<HTMLElement>(".community-bar");
  if (!bar) return;
  // Held at 0 by a still animation; Layout lifts data-arrive-hold in the
  // same task as it makes <main>'s fade (after the pause AND the view
  // transition), so a fade made here on that cue starts on the same frame.
  const held = bar.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: "forwards" });
  // Layout sets the hold in its own after-swap listener, which may run after
  // this one; by the next frame it is there, or there is none (an iOS edge
  // swipe shows the page at once, and so does the bar).
  requestAnimationFrame(() => {
    if (!document.documentElement.hasAttribute("data-arrive-hold")) {
      held.cancel();
      return;
    }
    void whenHoldDone().then(() => {
      if (held.playState === "idle") return;
      held.cancel();
      bar.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 620,
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      });
    });
  });
});

// Module scope, installed ONCE per session — not inside astro:page-load,
// where document-level listeners would stack one copy per navigation.
// The whole pill counts as inside: the panels are no longer in .bar-menu.
document.addEventListener("click", (e) => {
  if (!(e.target instanceof Element) || !e.target.closest(".community-bar__in, .tag-float")) closeBarMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBarMenus();
});

/** A card's handle folds it (CommunityGrid.astro, .bar-card__handle): a tap,
 *  or a drag that ends 16px or more below where it began. Delegated: the
 *  bar persists from page to page. */
let foldFrom: number | null = null;
document.addEventListener("pointerdown", (e) => {
  const handle = e.target instanceof Element ? e.target.closest(".bar-card__handle") : null;
  foldFrom = handle ? e.clientY : null;
});
document.addEventListener("pointerup", (e) => {
  if (foldFrom !== null && e.clientY - foldFrom >= 16) closeBarMenus();
  foldFrom = null;
});
document.addEventListener("click", (e) => {
  if (e.target instanceof Element && e.target.closest(".bar-card__handle")) closeBarMenus();
});

// ── THE SEARCH (2026-10-16, src/lib/communitySearch.ts) ─────────────────
// The index rides in the bar as JSON; parsed once per bar (the bar persists
// across the directory's own navigations, so usually once per visit).
let searchIndexCache: { el: Element; index: SearchIndex } | null = null;
function searchIndex(): SearchIndex | null {
  const el = document.getElementById("community-search-index");
  if (!el) return null;
  if (searchIndexCache?.el === el) return searchIndexCache.index;
  try {
    const index = JSON.parse(el.textContent ?? "") as SearchIndex;
    searchIndexCache = { el, index };
    return index;
  } catch {
    return null;
  }
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  return node;
}

/** A row: an optional picture, a name, a quieter line under it. */
function searchRow(href: string, name: string, sub: string, photo: string, round: boolean): HTMLLIElement {
  const li = document.createElement("li");
  const a = make("a", "search__row");
  a.href = href;
  // A person without a picture keeps the disc, so the names stay in line.
  const thumb = `search__thumb${round ? " search__thumb--round" : ""}`;
  if (photo) {
    const img = make("img", thumb);
    img.src = photo;
    img.alt = "";
    img.decoding = "async";
    a.append(img);
  } else if (round) {
    a.append(make("span", thumb));
  }
  const words = make("span", "search__words");
  words.append(make("span", "search__name", name));
  if (sub) words.append(make("span", "search__sub", sub));
  a.append(words);
  li.append(a);
  return li;
}

/** Draw the results for what the field holds. Picture thumbnails are the
 *  wall's own rendered tiles, found by their data-work key. */
function renderSearch() {
  const box = document.getElementById("search-results");
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  const index = searchIndex();
  if (!box || !input || !index) return;
  const q = input.value.trim();
  const found = searchDirectory(index, q);
  const group = (title: string, list: HTMLElement) => {
    const section = make("section", "search__group");
    section.append(make("h3", "search__group-title", title), list);
    return section;
  };
  const parts: HTMLElement[] = [];
  if (found.people.length) {
    const list = make("ul", "search__list");
    found.people.forEach((p) => list.append(searchRow(p.href, p.name, p.role, p.photo, true)));
    parts.push(group(box.dataset.people ?? "", list));
  }
  if (found.projects.length) {
    const list = make("ul", "search__list");
    found.projects.forEach((p) => list.append(searchRow(p.href, p.title, p.member, "", false)));
    parts.push(group(box.dataset.projects ?? "", list));
  }
  if (found.images.length) {
    const list = make("ul", "search__grid");
    found.images.forEach((w) => {
      const li = document.createElement("li");
      const a = make("a", "search__tile");
      a.href = w.href;
      const label = [w.caption, w.member].filter(Boolean).join(" — ");
      a.title = label;
      a.setAttribute("aria-label", label);
      const src = document
        .querySelector<HTMLImageElement>(`.cgrid__cell[data-work="${CSS.escape(w.key)}"] img`)
        ?.getAttribute("src");
      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.decoding = "async";
        a.append(img);
      }
      li.append(a);
      list.append(li);
    });
    parts.push(group(box.dataset.images ?? "", list));
  }
  if (!parts.length) {
    parts.push(make("p", "field-note search__note", (q ? box.dataset.none : box.dataset.hint) ?? ""));
  }
  box.replaceChildren(...parts);
}

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
  let activeRow: HTMLElement | null = null;
  document
    .querySelectorAll<HTMLButtonElement>(".tag-filter__option[data-label]")
    .forEach((opt) => {
      const active = Boolean(tagFilter) && opt.dataset.tag === tagFilter;
      opt.setAttribute("aria-pressed", String(active));
      if (active) {
        activeLabel = opt.dataset.label ?? "";
        activeRow = opt.closest("li");
      }
    });
  liftTagRow(activeRow);
  const label = document.getElementById("tag-filter-label");
  if (label) label.textContent = activeLabel || (label.dataset.rest ?? "");
  // The same name over the views pill, so the filter shows with the card shut.
  const float = document.getElementById("tag-float");
  if (float) {
    float.textContent = activeLabel;
    float.hidden = !activeLabel;
  }
  document
    .getElementById("tag-filter-btn")
    ?.classList.toggle("filter-word--set", Boolean(tagFilter));
  reflectTagClear();
}

/** THE PICKED TAG FIRST (2026-10-30, Josh: "selected tags need to be at the
 *  top of the tag search bar"): the active row moves to the head of the
 *  list, right after "All tags", and every other row keeps the build's
 *  order (stamped once as data-order, so clearing the tag restores it). */
function liftTagRow(active: HTMLElement | null) {
  const list = document.querySelector<HTMLElement>(".tag-filter__list");
  if (!list) return;
  const rows = Array.from(list.children) as HTMLElement[];
  rows.forEach((li, i) => {
    if (!li.dataset.order) li.dataset.order = String(i);
  });
  const [all, ...rest] = rows;
  rest.sort((a, b) => {
    if (a === active) return -1;
    if (b === active) return 1;
    return Number(a.dataset.order) - Number(b.dataset.order);
  });
  // Only what is out of place moves: a wholesale re-append on every
  // reflect would tear the list down for nothing.
  const current = Array.from(list.children);
  if (all && current[0] !== all) list.prepend(all);
  rest.forEach((li, i) => {
    if (current[i + 1] !== li) list.appendChild(li);
  });
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

  // The field sort's doubles (see the grid branch) are not cells of the
  // deal: gone before the deal counts, matches or orders anything.
  grid.querySelectorAll(".cgrid__cell[data-clone]").forEach((clone) => clone.remove());
  const cells = Array.from(grid.querySelectorAll<HTMLElement>(".cgrid__cell"));
  // The wall's column wrappers (the grid branch below) are not part of any
  // other view: their cells go back to the grid root, then the wrappers go.
  // Cells first — removing a wrapper would take its cells with it.
  grid.querySelectorAll<HTMLElement>(".cgrid__run").forEach((run) => {
    run.querySelectorAll<HTMLElement>(".cgrid__cell").forEach((cell) => grid.appendChild(cell));
    run.remove();
  });
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
    // THE WALL IS A MASONRY THE SCRIPT PLACES (2026-10-15, twice over). The
    // slot deal (layOutWall's --gc/--gr) went first, for the sort's SECTION
    // HEADS — `.cgrid__head` elements made here and removed on the next
    // deal, one run of pictures per head. Then the MULTICOL went, the same
    // evening (Josh: "there is a weird stagger for the right column if
    // sorted"): multicol balances a run by cutting it at half its height,
    // and a tile that will not break goes over to the next column, so three
    // tiles stood one left, two right, with a hole under the first. So each
    // run is now a flex row of N `.cgrid__col`s and every tile goes into the
    // SHORTEST column, its height known from its picture's aspect before
    // anything is laid out (tileHeight) — the masonry the reference site
    // actually draws. N and the column width come from the grid rule's
    // knobs (masonryMetrics); the count is remembered so a resize can tell a
    // step from a wobble (redealWall).
    const metrics = masonryMetrics(grid);
    wallCols = metrics.cols;
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
    // A TILE IN MORE THAN ONE SECTION (the field sort: a work under every
    // tag it carries) is the real cell the first time and a CLONE after
    // that — a node has one place in the DOM. Clones are marked so the next
    // deal removes them (above) and the lightbox pages them like any tile:
    // the same picture under two heads opens from either. The motion layer
    // treats them as cells too; it builds after the deal.
    const placed = new Set<HTMLElement>();
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
      // The run: N columns, each a stack. A tile goes to the shortest
      // column — but a column has to be shorter by more than the air under
      // a tile to count as shorter, else the leftmost wins: with two
      // columns a pixel apart the eye reads them as level, and a third tile
      // dropped on the right for a pixel's sake is exactly the hole on the
      // left the multicol used to leave.
      const run = document.createElement("div");
      run.className = "cgrid__run";
      // Only as many columns as the run has tiles, each at the width a
      // full run's column has (the measure's count rides on the run for
      // the CSS), so a short run stands centred at the usual size
      // (2026-10-30, Josh: "when there are not a lot of images they
      // should arrange in the middle").
      const measureCols = Math.max(1, metrics.cols);
      run.style.setProperty("--run-cols", String(measureCols));
      const cols = Math.max(1, Math.min(measureCols, section.items.length));
      const columns: { el: HTMLElement; height: number }[] = [];
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        el.className = "cgrid__col";
        run.appendChild(el);
        columns.push({ el, height: 0 });
      }
      section.items.forEach(({ cell: original }) => {
        let cell = original;
        if (placed.has(original)) {
          cell = original.cloneNode(true) as HTMLElement;
          cell.dataset.clone = "";
        } else {
          placed.add(original);
        }
        cell.style.removeProperty("--gc");
        cell.style.removeProperty("--gr");
        cell.style.removeProperty("--row-offset");
        // One row tall for the frame cap, as every wall slot was.
        cell.style.setProperty("--slot-rows", "1");
        let target = columns[0];
        for (const col of columns) {
          if (col.height < target.height - metrics.tileGap) target = col;
        }
        // The ?grid labels: the run and the column, not a drawn row.
        cell.dataset.row = String(i + 1);
        cell.dataset.span = "1";
        cell.dataset.col = String(columns.indexOf(target) + 1);
        delete cell.dataset.lane;
        target.el.appendChild(cell);
        target.height += tileHeight(cell, metrics.colWidth) + metrics.tileGap;
      });
      grid.appendChild(run);
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
  setPagesPaging(mode === "pages");
  setPagesEntrance(mode === "pages");
  // The member rail (pagesRail.ts) reads the grid a frame later, once the
  // deal below has hidden and ordered the cells.
  setPagesRail(mode === "pages");
}
document.addEventListener("astro:before-swap", () => {
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (wrap) delete wrap.dataset.snap;
});

// ── BACK RETURNS TO THE MEMBER YOU LEFT (2026-10-16, Josh: "navigating back
// from profiles to portfolio view"). Every arrival starts at the top since
// 81ba724, so Back from member seven's profile landed on member one. A pixel
// offset is not restored (that was the old slide, see Layout.astro): the
// MEMBER is. Leaving the Portfolios view files the rank of the card on screen
// under this entry's history index; a traverse back onto the entry puts that
// card at its snap stop at once, while the arriving page is still held
// invisible, so nothing glides. data-scroll-kept on <html> tells Layout's
// phone "Back starts at the top" reset to stand aside for this arrival.
const PAGES_AT_KEY = "vscn:pages-at:";
/** The index of the entry on screen, adopted at page-load — on a Back,
 *  history.state is already the DESTINATION's by before-preparation. */
let pagesEntryIndex: number | null = null;
/** The same index for ANY view of the directory. A history index is reused
 *  after a Back (the router pushes ++index), so a key filed for it while it
 *  was the Portfolios would outlive it under an Images or People wall and
 *  send the member page's Portfolios pill back onto the wall (2026-10-29). */
let entryIndex: number | null = null;
let arrivalTraverse = false;
/** False until the router has swapped once: a page-load before that is the
 *  document's own load, not a swap. */
let swappedOnce = false;
let arrivalSettled: Promise<void> = Promise.resolve();

function pagesCellOnScreen(): HTMLElement | null {
  const mid = window.innerHeight / 2;
  for (const cell of document.querySelectorAll<HTMLElement>(
    '#member-grid[data-pattern="pages"] > .cgrid__cell[data-slot="image"]:not([hidden])'
  )) {
    const r = cell.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) return cell;
  }
  return null;
}

document.addEventListener("astro:before-preparation", () => {
  if (entryIndex === null) return;
  const rank = pagesEntryIndex === null ? undefined : pagesCellOnScreen()?.dataset.rank;
  try {
    if (rank) sessionStorage.setItem(PAGES_AT_KEY + entryIndex, rank);
    else sessionStorage.removeItem(PAGES_AT_KEY + entryIndex);
  } catch {
    /* Private mode: Back starts at the top, as everywhere else. */
  }
});

document.addEventListener("astro:before-swap", (event) => {
  const swap = event as unknown as {
    navigationType?: string;
    viewTransition?: { finished: Promise<void> };
  };
  delete document.documentElement.dataset.scrollKept;
  pagesEntryIndex = null;
  entryIndex = null;
  swappedOnce = true;
  arrivalTraverse = swap.navigationType === "traverse";
  arrivalSettled = swap.viewTransition?.finished.catch(() => {}) ?? Promise.resolve();
});

// Before page-load, so the flag is up whichever page-load handler runs first.
document.addEventListener("astro:after-swap", () => {
  if (arrivalTraverse && savedPagesRank() !== null) {
    document.documentElement.dataset.scrollKept = "";
  }
});

function savedPagesRank(): string | null {
  const index = (history.state as { index?: number } | null)?.index;
  if (typeof index !== "number") return null;
  try {
    return sessionStorage.getItem(PAGES_AT_KEY + index);
  } catch {
    return null;
  }
}

/** Layout position, transforms ignored: the arriving <main> is held at its
 *  first rise frame (translated and scaled), so a client rect lies. */
function layoutTop(el: HTMLElement): number {
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

function restorePagesMember(mode: LayoutMode) {
  const index = (history.state as { index?: number } | null)?.index;
  entryIndex = typeof index === "number" ? index : null;
  pagesEntryIndex = mode === "pages" ? entryIndex : null;
  const kept = document.documentElement.hasAttribute("data-scroll-kept");
  // A BACK THAT IS A FULL LOAD (2026-10-19, Josh: "chrome on ios doesnt
  // work"): a browser that drops the document between pages comes back to
  // this entry with a fresh load, no swap, so no traverse is seen here —
  // but the entry's history.state survives the round trip, and the rank
  // filed under its index with it. The navigation entry says it is a Back.
  const fullBack =
    !swappedOnce &&
    (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ===
      "back_forward";
  const rank = arrivalTraverse || fullBack ? savedPagesRank() : null;
  arrivalTraverse = false;
  if (mode !== "pages" || !rank) {
    if (kept) delete document.documentElement.dataset.scrollKept;
    return;
  }
  const cell = document.querySelector<HTMLElement>(
    `#member-grid > .cgrid__cell[data-slot="image"][data-rank="${CSS.escape(rank)}"]:not([hidden])`
  );
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (!cell || !wrap) {
    if (kept) delete document.documentElement.dataset.scrollKept;
    return;
  }
  document.documentElement.dataset.scrollKept = "";
  const place = (): number => {
    if (!cell.isConnected) return NaN;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    // On a phone the document scrolls (global.css), on a desktop .page-wrap.
    const phone = getComputedStyle(wrap).overflowY === "visible";
    const top = layoutTop(cell) - header - (phone ? 0 : layoutTop(wrap));
    if (phone) window.scrollTo({ top, behavior: "instant" });
    else wrap.scrollTo({ top, behavior: "instant" });
    return top;
  };
  // Every frame while the page is held invisible, not once: at page-load the
  // swapped-in cells can still be unstyled (each ~9000px tall for a frame in
  // WebKit), and one placement then landed a card down and jumped back once
  // the page was already showing. Stops when the hold is off and the target
  // has stood still, so a reader's own scroll is never fought.
  const root = document.documentElement;
  let last = NaN;
  let frames = 0;
  // A full-load Back has no hold, and the browser's own scroll restoration
  // can land late (scrollRestoration is "auto" across a full navigation),
  // so the placement is kept up for a run of frames there.
  const minFrames = fullBack ? 30 : 0;
  const settle = () => {
    const top = place();
    const held = root.hasAttribute("data-arrive-hold");
    if (!held && top === last && frames >= minFrames) return;
    last = top;
    if (++frames < 120) requestAnimationFrame(settle);
  };
  settle();
  // Again once the transition is done: the router may restore the window's
  // offset late, and the snap only re-engages after the rise.
  void arrivalSettled.then(() => requestAnimationFrame(place));
}


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
  placeViewThumb();
}

/** THE VIEW SWITCH SLIDES (2026-10-28, Josh: "nice and smooth animations
 *  between its states"): one black thumb under the pressed view, moved by
 *  its offset and width; the CSS eases it once it has been placed (the
 *  first placement jumps, data-thumb-ready). The strip persists across the
 *  directory's navigations, so the thumb travels from the old view. */
function placeViewThumb() {
  document.querySelectorAll<HTMLElement>(".view-seg").forEach((seg) => {
    const thumb = seg.querySelector<HTMLElement>(".view-seg__thumb");
    const on = seg.querySelector<HTMLElement>('.view-toggle__btn[aria-pressed="true"]');
    if (!thumb) return;
    if (!on || !on.offsetWidth) {
      thumb.style.opacity = "0";
      return;
    }
    thumb.style.removeProperty("opacity");
    thumb.style.setProperty("--thumb-x", `${on.offsetLeft}px`);
    thumb.style.setProperty("--thumb-w", `${on.offsetWidth}px`);
    if (seg.dataset.thumbReady === undefined) requestAnimationFrame(() => (seg.dataset.thumbReady = ""));
  });
}
// The labels' widths settle once the font is in, and with the window.
void document.fonts?.ready.then(placeViewThumb);
window.addEventListener("resize", placeViewThumb);

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
    {
      const w = window as unknown as { __vscnDeal?: number };
      // The deal before the first paint (communityDealSwap.ts on a
      // navigation, the inline script in CommunityGrid on a full load) hands
      // its seed over; adopting it makes this deal reproduce the screen.
      const handed = w.__vscnDeal ?? null;
      delete w.__vscnDeal;
      dealSeed = handed ? storeSeed(handed) : rememberedSeed();
    }

    applyLayout(grid, mode);
    reflectMode(mode);
    restorePagesMember(mode);

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
    // The bar PERSISTS across the directory's own navigations (transition:persist)
    // while this handler runs again on every one, so its listeners are bound
    // for this page only and dropped at the swap — or they would stack.
    const life = pageLifetime();
    document.querySelectorAll<HTMLButtonElement>(".view-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.mode as LayoutMode;
        closeBarMenus();
        if (grid.dataset.pattern === next) return;
        // The thumb sets off at the press, not when the new page is in.
        reflectMode(next);
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
      }, { signal: life });
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
      ?.addEventListener("click", () => toggleBarMenu("view-menu-panel"), { signal: life });

    // The search: open it and the field takes the caret — unlike the tags
    // room, typing is the whole point here, so a phone's keyboard is asked
    // for on purpose. Each keystroke redraws the lists and the pill eases to
    // their height; Enter follows the first result.
    const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
    document.getElementById("search-btn")?.addEventListener("click", () => {
      if (toggleBarMenu("search-panel")) searchInput?.focus({ preventScroll: true });
    }, { signal: life });
    // The card holds its size while the results change under the field.
    searchInput?.addEventListener("input", renderSearch, { signal: life });
    document.getElementById("search-cancel")?.addEventListener("click", closeBarMenus, { signal: life });
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      document.querySelector<HTMLAnchorElement>("#search-results a")?.click();
    }, { signal: life });
    document.getElementById("search-results")?.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("a")) closeBarMenus();
    }, { signal: life });
    document
      .getElementById("sort-menu-btn")
      ?.addEventListener("click", () => toggleBarMenu("sort-menu-panel"), { signal: life });

    // The floating tag opens the card it summarises.
    document
      .getElementById("tag-float")
      ?.addEventListener("click", () => tagBtn?.click(), { signal: life });
    tagBtn?.addEventListener("click", () => {
      if (!tagPanel) return;
      const opening = toggleBarMenu("tag-filter-panel");
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
    }, { signal: life });

    // Narrowing is the same pass that picks the view's options, so the two
    // rules cannot fight over a row — see reflectTagOptions.
    tagSearch?.addEventListener("input", () => {
      reflectTagOptions(mode);
      reflectTagClear();
    }, { signal: life });

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
    }, { signal: life });

    document.querySelectorAll<HTMLButtonElement>(".tag-filter__option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const picked = opt.dataset.tag ?? "";
        const next = picked === tagFilter ? "" : picked;
        closeBarMenus();
        const url = new URL(window.location.href);
        if (next) url.searchParams.set("tag", next);
        else url.searchParams.delete("tag");
        goTo(url);
      }, { signal: life });
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
      }, { signal: life });
    });

  }

  // One observer per VISIT, not per page-load for ever: every view and tag
  // switch is a navigation (goTo), so a bare observer here gained one more
  // copy, each holding a detached page, with every click in the directory.
  // After every relabel above.
  reflowBar();

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
  if (masonryMetrics(grid).cols === wallCols) return;
  applyLayout(grid, "grid", false);
  document.dispatchEvent(new Event("community:layout-changed"));
}

// The COUNT is a step, and stepping it means re-placing every cell and
// re-measuring the whole motion layer, so it waits for the drag to settle
// and only runs when the count has actually moved. The columns themselves
// are flex and follow the drag on their own. (A continuous gutter used to
// be written here every frame, for the slot grid the masonry replaced.)
let wallResizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(wallResizeTimer);
  wallResizeTimer = window.setTimeout(redealWall, 180);
});

// Crossing INTO desktop is the one case the count comparison cannot catch on
// its own: on the phone the wall's knobs do not exist (its rule is
// desktop-only), so the count that was stored is a mobile reading of a
// layout mobile never used. Force the deal rather than compare.
window.matchMedia("(767px < width) and (not (pointer: coarse))").addEventListener("change", (e) => {
  if (!e.matches) return;
  wallCols = 0;
  redealWall();
});
