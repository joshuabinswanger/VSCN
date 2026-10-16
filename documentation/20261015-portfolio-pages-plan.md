# Portfolio pages view — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/community` Portfolios spread with a scroll-snapped stack of full-frame member cards (one member per screen, a native x-snap works row, a view()-driven flourish), and remove what the spread alone needed.

**Architecture:** The directory keeps its one scroll container (`.page-wrap`): the controller sets `data-snap="y"` on it for the `pages` view and the image cells become full-height snap sections. The card keeps its lightbox and preview contracts (`[data-carousel]`, `.ccard__track`, `.ccard__slide`, `.ccard__img`, `data-work-url`, `data-pswp-*`) but the slides become the links and the track scrolls natively, so one engine (`communityCarousel.ts`, same exports) serves the card and the editor preview. Motion is CSS on view timelines inside `@supports`.

**Tech Stack:** Astro 5 (ClientRouter), TypeScript, PostCSS custom media (`--bp-mobile` / `--bp-desktop`), Node `node:test` units via `tests/helpers/load-ts.mjs`, Playwright for the walk.

**Spec:** `documentation/20261015-portfolio-pages-view.md`

## Global Constraints

- `.page-wrap` is the scroll container; `window.scrollY` does not exist here; `.page-wrap` has `scroll-behavior: smooth`, so programmatic scrolls use `scrollTo({behavior: "instant"})`.
- Client scripts init on `astro:page-load`, tear down on `astro:before-swap`.
- Breakpoints only `@media (--bp-mobile)` (≤767px) and `@media (--bp-desktop)`.
- Type: no `font-size`/`font-weight`/`line-height` in component rules; new text elements join a voice in `src/styles/type.css` or take a `.t-*` class.
- `@keyframes` names are global; prefix new ones `cpage-`.
- Use `animation-timeline` / `animation-range` LONGHANDS after the `animation` shorthand, and verify the built CSS keeps them (memory: minifier-folds-animation-timeline).
- `npm run lint` must stay at 0 warnings. `npm run format` is never run.
- No new i18n strings; if one is needed, add both `en` and `de`.
- Commit per task; attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Worktree: `D:\SynoDrive\VSCN\wt-feat-portfolio-pages` (branch `feat/portfolio-pages`, off dev `8173855`). It has no `.site-data.json`: copy one from `D:\SynoDrive\VSCN\repo\.site-data.json` and bump its `generatedAt` to now before `npm run build` or `astro dev`.

---

## File map

| File | Responsibility after this plan |
|---|---|
| `src/lib/communityLayout.ts` | view names (`pages`/`grid`/`index`), `viewFromParam()`, `DEFAULT_VIEW`, `TAG_CHIP_VIEW`; `layOutWall` stays untouched; spread/strip exports deleted |
| `src/lib/communityDirectoryController.ts` | deal, filters, bar menus, `applyLayout` with a `pages` branch; sets/clears `.page-wrap[data-snap]` |
| `src/lib/communityCarousel.ts` | native x-snap engine, same exports (`initCarousels`, `destroyCarousel`, `refreshCarousel`, `destroyAllCarousels`) |
| `src/lib/lightbox.ts` | `CARD_TRIGGER = ".ccard__slide"` |
| `src/components/community/CommunityImageCard.astro` | the full-frame card (layout A) |
| `src/components/community/MemberDetailPanel.astro` | gains `mode="plain"` (a `<div>`, no disclosure); loses `mode="column"` and the fold |
| `src/components/community/CommunityCardPreview.astro` | the editor's shell twin of the new card |
| `src/lib/profilePreview.ts` | `renderCardPreview()`: slide template is an `<a>`; no frame-link |
| `src/styles/communityCard.css` | the card's grid (desktop two columns, phone stacked), frame, snap track, pager, preview overrides |
| `src/components/CommunityGrid.astro` | pages cells, the flourish, the view button; spread/strip/lane/mobile-fade CSS gone |
| `src/styles/global.css` | `.page-wrap[data-snap="y"]` |
| `src/lib/communityMotionController.ts` | wall fade only |
| `src/lib/cardFold.ts` | deleted |
| `tests/unit/communityLayout.test.mjs` | new: `viewFromParam` |
| `tests/unit/pageLifecycle.test.mjs` | carousel section rewritten for the snap engine |
| `package.json` / `package-lock.json` | `embla-carousel` removed |
| `CLAUDE.md`, `documentation/` | updated |

---

### Task 1: Native-snap carousel engine, slides as links

**Files:**
- Modify: `src/lib/communityCarousel.ts` (rewrite the body; keep the exports)
- Modify: `src/lib/lightbox.ts:192` (`CARD_TRIGGER`)
- Modify: `src/components/community/CommunityImageCard.astro:135-247` (slides become `<a>`, frame-link removed)
- Modify: `src/components/community/CommunityCardPreview.astro:68-114,169-171` (frame-link removed; slide template is an `<a>`)
- Modify: `src/styles/communityCard.css:279-324` (track scrolls; `.ccard__slide` is the focus target)
- Modify: `tests/unit/pageLifecycle.test.mjs:70-200` (fake DOM for the snap engine)
- Modify: `package.json` (drop `embla-carousel`), `package-lock.json` via `npm uninstall`

**Interfaces:**
- Produces: `initCarousels(root?: ParentNode)`, `destroyCarousel(frame)`, `refreshCarousel(frame)`, `destroyAllCarousels()` — unchanged names. Markup contract: `[data-carousel]` frame > `.ccard__track` > `a.ccard__slide[data-work-url]` > `img.ccard__img`; `[data-carousel-prev]`, `[data-carousel-next]`, `[data-carousel-live]` inside the frame; `.ccard__dots` on the card. Event in: `vscn:carousel-show` on a slide. Behaviour: `data-index` on the frame = current slide.

- [ ] **Step 1: Rewrite the carousel unit test for the snap engine**

Replace the block from `// ── The carousel, against a fake DOM and a fake Embla` to the end of that test in `tests/unit/pageLifecycle.test.mjs` with:

```js
// ── The carousel, against a fake DOM and a fake scroller ──────────────
// The engine is native scroll-snap: the index is the track's scrollLeft
// over its width, the chevrons scroll by one width, the ends wrap.
class El extends EventTarget {
  constructor(children = {}) {
    super();
    this.children = children;
    this.dataset = {};
    this.attrs = {};
    this.classList = { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, add(c) { this.set.add(c); }, contains(c) { return this.set.has(c); } };
    this.style = {};
    this.textContent = "";
    this.tabIndex = 0;
    this.clientWidth = 300;
    this.scrollLeft = 0;
    this.scrolls = [];
  }
  querySelector(sel) { const v = this.children[sel]; return Array.isArray(v) ? v[0] ?? null : v ?? null; }
  querySelectorAll(sel) { const v = this.children[sel]; return Array.isArray(v) ? v : v ? [v] : []; }
  closest() { return null; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return n in this.attrs; }
  scrollTo(o) { this.scrolls.push(o); this.scrollLeft = o.left; }
  prepend() {}
  append() {}
}

function makeCarousel() {
  const document = { documentElement: { lang: "en" }, addEventListener() {}, activeElement: null, createElement: () => new El() };
  const window = { matchMedia: () => ({ matches: false }), ResizeObserver: undefined };
  const pager = loadTs("src/lib/pager.ts", {}, { document });
  const keys = loadTs("src/lib/keys.ts", {});
  const carousel = loadTs(
    "src/lib/communityCarousel.ts",
    { "./pager.ts": pager, "./keys.ts": keys },
    { document, window, requestAnimationFrame: (fn) => fn() },
  );
  const slides = [new El(), new El(), new El()];
  slides.forEach((s, i) => { s.dataset.workUrl = `u${i}`; });
  const images = slides.map(() => new El());
  const track = new El({ ".ccard__slide": slides, ".ccard__img": images });
  const chevPrev = new El();
  const chevNext = new El();
  const count = new El();
  const dotRow = new El({ ".ccard__count": count, ".pager-chev--prev": chevPrev, ".pager-chev--next": chevNext });
  const card = new El({ ".ccard__dot": [], ".ccard__dots": dotRow });
  const live = new El();
  const frame = new El({
    ".ccard__track": track,
    ".ccard__slide": slides,
    ".ccard__img": images,
    "[data-carousel-live]": live,
  });
  frame.closest = (sel) => (sel === ".ccard" ? card : null);
  frame.dataset.positionLabel = "Image {n} of {total}";
  const root = { querySelectorAll: (sel) => (sel === "[data-carousel]" ? [frame] : []) };
  return { carousel, root, frame, track, slides, chevPrev, chevNext, count, live };
}

test("carousel: chevrons page by one width and wrap at the ends", () => {
  const c = makeCarousel();
  c.carousel.initCarousels(c.root);
  assert.equal(c.frame.dataset.ready, "true");
  c.chevNext.dispatchEvent(new Event("click"));
  assert.equal(c.track.scrolls.at(-1).left, 300);
  c.track.dispatchEvent(new Event("scroll"));
  assert.equal(c.frame.dataset.index, "1");
  assert.equal(c.count.textContent, "2 / 3");
  assert.equal(c.live.textContent, "Image 2 of 3");
  assert.equal(c.slides[1].tabIndex, 0);
  assert.equal(c.slides[0].tabIndex, -1);
  c.chevPrev.dispatchEvent(new Event("click"));
  c.chevPrev.dispatchEvent(new Event("click"));
  assert.equal(c.track.scrolls.at(-1).left, 600, "prev from the first slide wraps to the last");
});

test("carousel: a show event scrolls to that slide, and destroy releases the frame", () => {
  const c = makeCarousel();
  c.carousel.initCarousels(c.root);
  const ev = new Event("vscn:carousel-show");
  Object.defineProperty(ev, "target", { value: c.slides[2] });
  c.frame.dispatchEvent(ev);
  assert.equal(c.track.scrolls.at(-1).left, 600);
  c.carousel.destroyCarousel(c.frame);
  assert.equal(c.frame.dataset.ready, undefined);
  c.chevNext.dispatchEvent(new Event("click"));
  assert.equal(c.track.scrolls.length, 1, "no handler left after destroy");
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/unit/pageLifecycle.test.mjs`
Expected: FAIL (the engine still imports `embla-carousel`, which the fake map no longer provides).

- [ ] **Step 3: Rewrite `src/lib/communityCarousel.ts`**

Keep the file header's intent (shared engine, markup contract) in a short comment; replace the implementation with:

```ts
import { ensurePagerChevron } from "./pager.ts";
import { hasKeyModifier } from "./keys.ts";

interface CarouselHandle {
  listeners: AbortController;
  sync?: () => void;
}

const liveCarousels = new Map<HTMLElement, CarouselHandle>();

export function destroyCarousel(node: HTMLElement): void {
  delete node.dataset.ready;
  const handle = liveCarousels.get(node);
  if (!handle) return;
  handle.listeners.abort();
  liveCarousels.delete(node);
}

export function refreshCarousel(node: HTMLElement): void {
  liveCarousels.get(node)?.sync?.();
}

export function destroyAllCarousels(): void {
  [...liveCarousels.keys()].forEach(destroyCarousel);
}

document.addEventListener("astro:before-swap", destroyAllCarousels);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The slide the track is resting on (or nearest to). */
function indexOf(track: HTMLElement, total: number): number {
  const w = track.clientWidth || 1;
  return Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / w)));
}

export function initCarousels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
    if (carousel.dataset.ready) return;
    carousel.dataset.ready = "true";
    const handle: CarouselHandle = { listeners: new AbortController() };
    liveCarousels.set(carousel, handle);
    const { signal } = handle.listeners;

    const images = Array.from(carousel.querySelectorAll<HTMLImageElement>(".ccard__img"));
    const hydrate = (image: HTMLImageElement | undefined) => {
      if (!image?.dataset.src) return;
      image.src = image.dataset.src;
      if (image.dataset.srcset) image.srcset = image.dataset.srcset;
      delete image.dataset.src;
      delete image.dataset.srcset;
    };
    const hydrateAll = () => images.forEach(hydrate);
    carousel.addEventListener("pointerenter", hydrateAll, { once: true, signal });
    carousel.addEventListener("touchstart", hydrateAll, { once: true, passive: true, signal });

    const track = carousel.querySelector<HTMLElement>(".ccard__track");
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(".ccard__slide"));
    if (!track || slides.length < 2) return;
    const total = slides.length;

    const card = carousel.closest<HTMLElement>(".ccard") ?? carousel;
    const dots = Array.from(card.querySelectorAll<HTMLElement>(".ccard__dot"));
    const dotRow = card.querySelector<HTMLElement>(".ccard__dots");
    let count = dotRow?.querySelector<HTMLElement>(".ccard__count") ?? null;
    if (dotRow && !count) {
      count = document.createElement("span");
      count.className = "ccard__count";
      count.textContent = `1 / ${total}`;
      dotRow.prepend(count);
    }
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";

    let current = -1;
    let quiet = false;
    const reflect = (i: number) => {
      if (i === current) return;
      current = i;
      carousel.dataset.index = String(i);
      hydrate(images[i]);
      hydrate(images[i + 1]);
      hydrate(images[i - 1]);
      slides.forEach((slide, n) => {
        if (n === i) slide.removeAttribute("aria-hidden");
        else slide.setAttribute("aria-hidden", "true");
        slide.tabIndex = n === i ? 0 : -1;
      });
      dots.forEach((dot, n) => dot.classList.toggle("ccard__dot--on", n === i));
      if (count) count.textContent = `${i + 1} / ${total}`;
      if (liveRegion && !quiet) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(total));
      }
    };
    reflect(indexOf(track, total));
    handle.sync = () => reflect(indexOf(track, total));

    const goTo = (i: number, jump = false) => {
      const target = ((i % total) + total) % total;
      const wraps = Math.abs(target - current) > 1;
      track.scrollTo({
        left: target * track.clientWidth,
        behavior: jump || wraps || REDUCED.matches ? "instant" : "smooth",
      });
      reflect(target);
    };
    const next = () => goTo(current + 1);
    const prev = () => goTo(current - 1);

    let ticking = false;
    track.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          reflect(indexOf(track, total));
        });
      },
      { passive: true, signal },
    );

    // A resize moves every snap point; put the track back on its slide.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        if (current >= 0) track.scrollTo({ left: current * track.clientWidth, behavior: "instant" });
      });
      ro.observe(track);
      signal.addEventListener("abort", () => ro.disconnect());
    }

    carousel.addEventListener(
      "vscn:carousel-show",
      (e) => {
        const i = slides.indexOf(e.target as HTMLElement);
        if (i >= 0 && i !== current) {
          quiet = true;
          goTo(i, true);
          quiet = false;
        }
      },
      { signal },
    );

    const prevArrow = carousel.querySelector<HTMLElement>("[data-carousel-prev]");
    const nextArrow = carousel.querySelector<HTMLElement>("[data-carousel-next]");
    prevArrow?.addEventListener("click", prev, { signal });
    nextArrow?.addEventListener("click", next, { signal });

    const rest = (e: MouseEvent) => {
      if (e.detail === 0) return;
      carousel.classList.toggle("is-arrows-resting", true);
    };
    const wake = () => carousel.classList.toggle("is-arrows-resting", false);
    prevArrow?.addEventListener("click", rest, { signal });
    nextArrow?.addEventListener("click", rest, { signal });
    carousel.addEventListener("pointerenter", wake, { signal });
    carousel.addEventListener(
      "focusin",
      (e) => {
        if (e.target instanceof Element && e.target.matches(":focus-visible")) wake();
      },
      { signal },
    );

    if (dotRow) {
      const prevPager = ensurePagerChevron(dotRow, "prev", prev, {
        label: prevArrow?.getAttribute("aria-label"),
        signal,
      });
      const nextPager = ensurePagerChevron(dotRow, "next", next, {
        label: nextArrow?.getAttribute("aria-label"),
        signal,
      });
      prevPager.addEventListener("click", rest, { signal });
      nextPager.addEventListener("click", rest, { signal });
    }

    carousel.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        if (hasKeyModifier(e)) return;
        e.preventDefault();
        wake();
        hydrateAll();
        if (e.key === "ArrowRight") next();
        else prev();
        slides[current]?.focus({ preventScroll: true });
      },
      { signal },
    );
  });
}
```

Note what is gone on purpose: the `#member-grid` block (prime / turn / back-to-cover), the scroll-idle tracker, `syncTrigger` (each slide is its own trigger now).

- [ ] **Step 4: Make the slides links in the card and the preview**

In `CommunityImageCard.astro`:
- Change each `<div class="ccard__slide" …>` to `<a class="ccard__slide" href={w.url} target="_blank" rel="noreferrer" tabindex={i === 0 ? 0 : -1} aria-label={isCarousel ? positionFor(i) : `${t("community.card.openImage")} ${member.displayName}`} …>` keeping every `data-pswp-*`, `data-work-url`, `aria-roledescription` and the embed attrs; drop `role="group"` (a link has its own role).
- Delete the whole `<a class="ccard__frame-link" …>` element and the comment above it. Replace the comment with two lines: slides are the click targets; the lightbox reads `.ccard__slide` (`CARD_TRIGGER`).

In `CommunityCardPreview.astro`:
- Delete the href-less `<a class="ccard__frame-link" aria-hidden="true"></a>` and its comment.
- Slide template becomes `<template data-ccpv-tpl="slide"><a class="ccard__slide" tabindex="-1"><img class="ccard__img" alt="" decoding="async" /></a></template>` (href-less: the preview never leaves the form).

In `src/lib/lightbox.ts` line 192: `export const CARD_TRIGGER = ".ccard__slide";`. In `bindCardOpener`, `frame = trigger.parentElement` is now the track; `frame.querySelectorAll(".ccard__slide")` still finds the slides. No other change.

In `src/lib/profilePreview.ts` `renderCardPreview()`: where slides are built (`slide.setAttribute("role", "group")` etc.), delete the `role` line; keep the labels; add `slide.tabIndex = i === 0 ? 0 : -1;`.

- [ ] **Step 5: The track scrolls (communityCard.css)**

Replace the `.ccard__track`, `.ccard__slide`, `.ccard__frame-link` and `.ccard__frame-link:focus-visible` rules (lines 279-324) with:

```css
.ccard__track {
  position: absolute;
  inset: 0;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 100%;
  overflow: auto hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.ccard__track::-webkit-scrollbar {
  display: none;
}
.ccard__slide {
  position: relative;
  display: block;
  min-width: 0;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  cursor: zoom-in;
}
.ccard__slide:focus-visible {
  outline: 2px solid var(--color-dark);
  outline-offset: -5px;
  box-shadow: inset 0 0 0 3px var(--color-bg);
}
```

On `.ccard__frame` change `touch-action: pan-y pinch-zoom;` to `touch-action: pan-x pan-y pinch-zoom;` (the track needs the horizontal pan; the page keeps the vertical one). Replace every `.ccard__frame-link` selector left in the file (the preview block's `.ccard--preview .ccard__frame-link { cursor: default }`) with `.ccard--preview .ccard__slide`.

- [ ] **Step 6: Remove Embla**

Run: `npm uninstall embla-carousel` in the worktree. Confirm `grep -rn "embla" src package.json` prints nothing.

- [ ] **Step 7: Run the tests and lint**

Run: `node --test tests/unit/pageLifecycle.test.mjs && npm run lint && npm run check`
Expected: PASS, 0 warnings, no Astro diagnostics.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Carousel: native scroll-snap engine, slides are the lightbox triggers

Replaces Embla in communityCarousel.ts with the track scrolling itself
(x-snap). Same exports and markup contract; the frame-link overlay is
gone because an overlay above a scroller eats its touch pan — each slide
is now an <a> and CARD_TRIGGER reads .ccard__slide. The spread's
prime/turn/back-to-cover behaviour goes with the spread."
```

---

### Task 2: The `pages` view: key, controller, cells, snap

**Files:**
- Modify: `src/lib/communityLayout.ts:248-433`
- Create: `tests/unit/communityLayout.test.mjs`
- Modify: `src/lib/communityDirectoryController.ts` (imports 5-13, `MODES` 40, `writeSlot` ~206-217, `domOrder` ~238, `applyLayout` 496-690, `modeFromURL` ~688, page-load 801-812)
- Modify: `src/components/CommunityGrid.astro` (frontmatter imports 2-8 and `slots`/`cells` 258-264; view button `data-mode="spread"` ~463; `hidden` on `#member-grid` ~598; the `.cgrid__strip` element ~609; the image cells 611-626; CSS)
- Modify: `src/styles/global.css:156-162`
- Modify: `src/lib/links.ts` — no change (it reads `TAG_CHIP_VIEW`)

**Interfaces:**
- Produces: `export type ViewName = "pages" | "grid" | "index"`; `export const DEFAULT_VIEW: ViewName = "pages"`; `export const TAG_CHIP_VIEW: ViewName = "pages"`; `export function viewFromParam(p: string | null | undefined): ViewName` (`"spread"` and `"strip"` → `"pages"`, unknown → `DEFAULT_VIEW`). CSS hooks: `.cgrid[data-pattern="pages"]`, `.page-wrap[data-snap="y"]`, `--cpage-h`.

- [ ] **Step 1: Write the failing test**

`tests/unit/communityLayout.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, TAG_CHIP_VIEW, viewFromParam } from "../../src/lib/communityLayout.ts";

test("the default and the tag-chip view are the pages view", () => {
  assert.equal(DEFAULT_VIEW, "pages");
  assert.equal(TAG_CHIP_VIEW, "pages");
});

test("viewFromParam reads the three views, maps the old spread/strip links, defaults the rest", () => {
  assert.equal(viewFromParam("pages"), "pages");
  assert.equal(viewFromParam("grid"), "grid");
  assert.equal(viewFromParam("index"), "index");
  assert.equal(viewFromParam("spread"), "pages");
  assert.equal(viewFromParam("strip"), "pages");
  assert.equal(viewFromParam(null), DEFAULT_VIEW);
  assert.equal(viewFromParam(undefined), DEFAULT_VIEW);
  assert.equal(viewFromParam("wall"), DEFAULT_VIEW);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/unit/communityLayout.test.mjs`
Expected: FAIL (`viewFromParam` is not exported; `DEFAULT_VIEW` is `"spread"`).

- [ ] **Step 3: `communityLayout.ts`**

Delete `GalleryPatternName`, `GALLERY_PATTERNS`, `STRIP_ROWS`, `STRIP_SLOT_ROWS`, `layOutSlots`, `layOutStripIndex`, `laneOf`, `TEXT_TILE` and the spread pattern literal and every helper only they used (read the file: anything not reached from `layOutWall`, `Slot`, `Pattern`, `COLUMNS` goes). Keep `layOutWall` and its types untouched. Then:

```ts
/** The directory's views: the pages (one member a screen), the Images wall, the People ledger. */
export type ViewName = "pages" | "grid" | "index";
export const VIEWS: readonly ViewName[] = ["pages", "grid", "index"];
export const DEFAULT_VIEW: ViewName = "pages";
/** Where a member's tag chip sends the reader. */
export const TAG_CHIP_VIEW: ViewName = "pages";

/**
 * `?pattern=` → a view. The Portfolios view was `spread` until 2026-10-15
 * (and `strip` was its shelved sibling); links in the wild still say so.
 */
export function viewFromParam(p: string | null | undefined): ViewName {
  if (p === "spread" || p === "strip") return "pages";
  return (VIEWS as readonly string[]).includes(p ?? "") ? (p as ViewName) : DEFAULT_VIEW;
}
```

- [ ] **Step 4: The controller**

- Imports: `import { DEFAULT_VIEW, VIEWS, viewFromParam, type ViewName } from "./communityLayout.ts";` and drop `GALLERY_PATTERNS, STRIP_SLOT_ROWS, laneOf, layOutSlots, Slot`.
- `const MODES: LayoutMode[] = [...VIEWS];` (or delete `MODES` and use `VIEWS`).
- Delete `writeSlot` and `domOrder`.
- `modeFromURL()` becomes `return viewFromParam(new URLSearchParams(window.location.search).get("pattern"));`.
- In `applyLayout`: delete every `strip` branch and the `.cgrid__strip` lookups; replace the final spread block (`const all = layOutSlots(...)` to `cells.sort(domOrder)...`) with the pages branch:

```ts
  // PAGES: the members in deal order, one section each, DOM order = snap
  // order. The deal is still banded by score and seeded per history entry,
  // so Back returns to the stack it left.
  orderedGallery.forEach((cell) => {
    cell.style.removeProperty("--gc");
    cell.style.removeProperty("--gr");
    cell.style.removeProperty("--slot-rows");
    delete cell.dataset.lane;
    grid.appendChild(cell);
  });
  cells.filter((cell) => cell.hidden).forEach((cell) => grid.appendChild(cell));
  reflectFilterState(grid, mode);
```

- Add a snap toggle, called at the top of `applyLayout` after `grid.dataset.pattern = mode;`:

```ts
function reflectSnap(mode: LayoutMode) {
  const wrap = document.querySelector<HTMLElement>(".page-wrap");
  if (!wrap) return;
  if (mode === "pages") wrap.dataset.snap = "y";
  else delete wrap.dataset.snap;
}
```

and `document.addEventListener("astro:before-swap", () => { delete document.querySelector<HTMLElement>(".page-wrap")?.dataset.snap; });` next to the other listeners (the attribute must not leak onto `/profile`).

- Keep `reflectFilterState`, `tagHasWorks`, `reflectTagOptions` as they are: they already treat every non-`index`, non-`grid` mode as the member gallery (`countWorks`).
- Delete the `fadeNav` / `--cgrid-fade-inset` measurement block in the page-load handler and the `fadeInsetObserver` variable (its only consumer is the mobile fade deleted in Task 4).

- [ ] **Step 5: `CommunityGrid.astro` markup**

- Frontmatter: import only `DEFAULT_VIEW` from communityLayout; delete `slots`, replace `const cells = slots.map(...)` with `const cells = imageMembers;` and the loop with:

```astro
{
  cells.map((member, i) => (
    <div
      class="cgrid__cell"
      data-slot="image"
      data-rank={i}
      data-score={bestScore(member)}
      data-tags={tagsAttr(member)}
    >
      <CommunityImageCard member={member} lang={lang} index={i} />
    </div>
  ))
}
```

- Delete the `.cgrid__strip` element and its comment.
- View button: `data-mode="pages"` and `aria-pressed={DEFAULT_VIEW === "pages" ? "true" : "false"}`; `#member-grid`'s `hidden={DEFAULT_VIEW !== "pages" && DEFAULT_VIEW !== "grid"}`; the trigger label logic `DEFAULT_VIEW === "index" ? … : DEFAULT_VIEW === "grid" ? … : "community.view.gallery"` is unchanged.
- `CommunityImageCard` gets an `index` prop (Task 3 uses it for eager loading; add `index?: number` to its Props now, default 0).

- [ ] **Step 6: CSS for the cells and the snap**

`src/styles/global.css`, after the `.page-wrap` rule:

```css
/* THE PAGES VIEW SNAPS (2026-10-15, /community Portfolios): the directory
   controller sets this while one member a screen is on; cleared on every
   other view and before a swap. scroll-padding keeps a snapped card under
   the floating header row, not behind it. */
.page-wrap[data-snap="y"] {
  scroll-snap-type: y mandatory;
  scroll-padding-top: var(--header-h);
}
```

`CommunityGrid.astro` `<style>`, a new block right after the base `.cgrid__cell` rules:

```css
  /* ── THE PAGES (2026-10-15) ────────────────────────────────
     One member a screen. The frame is the viewport minus the header row
     and the bar's band at the bottom; each cell is a snap stop. The card
     inside is in flow (the spread kept it absolute and GSAP-scaled). */
  .cgrid[data-pattern="pages"] {
    --cpage-h: calc(var(--shell-h, 100dvh) - var(--header-h));
    --cpage-chrome-b: 5.5rem;
    display: block;
    width: min(100% - 2 * var(--cgrid-pad), var(--grid-max));
    margin-inline: auto;
    padding-block: 0;
  }
  .cgrid[data-pattern="pages"] > .cgrid__cell {
    display: block;
    position: relative;
    box-sizing: border-box;
    min-height: var(--cpage-h);
    padding-bottom: var(--cpage-chrome-b);
    scroll-snap-align: start;
    scroll-snap-stop: always;
    container-type: normal;
  }
  :global(.cgrid[data-pattern="pages"] > .cgrid__cell > .ccard) {
    position: static;
    margin: 0;
    width: 100%;
    height: calc(var(--cpage-h) - var(--cpage-chrome-b));
  }
  @media (--bp-mobile) {
    .cgrid[data-pattern="pages"] {
      --cpage-chrome-b: 4.5rem;
      width: 100%;
    }
    :global(.cgrid[data-pattern="pages"] > .cgrid__cell > .ccard) {
      height: auto;
      min-height: calc(var(--cpage-h) - var(--cpage-chrome-b));
    }
  }
  /* What follows the last card must be reachable under mandatory snap. */
  .page-wrap[data-snap="y"] .community-signup-cta,
  :global(.page-wrap[data-snap="y"] > .site-footer) {
    scroll-snap-align: end;
  }
```

Delete the lane rules (`:global(.cgrid__cell[data-lane="left"] > .ccard)` / right) and the `.cgrid__strip` rules (base, desktop, reduced-motion, `:global(.cgrid__strip .cgrid__cell > .ccard)`), and the mobile `.cgrid__strip` rule.

- [ ] **Step 7: Run tests, lint, check**

Run: `npm run test:unit && npm run lint && npm run check`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Community: the pages view replaces the spread

ViewName is pages | grid | index; ?pattern=spread and =strip read as
pages. The controller appends the image cells in deal order and sets
data-snap on .page-wrap; each cell is a full-height snap stop. The slot
table, lanes and strip are gone from the markup and the controller."
```

---

### Task 3: The full-frame card (layout A)

**Files:**
- Modify: `src/components/community/MemberDetailPanel.astro` (Props, the root element, a `.pdisc--plain` block in its style)
- Modify: `src/components/community/CommunityImageCard.astro` (body/foot/head/panel order; `index` prop; `sizes`)
- Modify: `src/styles/communityCard.css` (the `.ccard` grid 43-185, frame 225-272, img 297-302, foot 437-505, mobile 546-628)

**Interfaces:**
- Produces: `MemberDetailPanel` prop `mode?: "column" | "plain"`; in `plain` mode the root is `<div class="pdisc pdisc--plain">` holding `.pdisc__body > .pdisc__body-inner` with the same children and the same `footer` slot; no `<summary>`. Card anatomy as the spec's tree (`.ccard` > `.ccard__body` (`.ccard__frame` + `.ccard__foot`), `.ccard__head`, `.pdisc--plain`).

- [ ] **Step 1: `MemberDetailPanel` plain mode**

Props: `mode?: "column" | "plain";` and `const plain = mode === "plain";`. Render:

```astro
{
  !show ? null : plain ? (
    <div class="pdisc pdisc--plain">
      <div class="pdisc__body">
        <div class="pdisc__body-inner">
          …the identical children (lead slot, shell hooks, bio, links, tags, footer slot, templates)…
        </div>
      </div>
    </div>
  ) : (
    <details …existing…>
  )
}
```

Do this without duplicating the children: move the `<div class="pdisc__body">…</div>` subtree into a `<Fragment set:html>`-free pattern — Astro has no local components, so write the body once as a `const body = (<div class="pdisc__body">…</div>)` JSX expression in the frontmatter is NOT possible either. Accept the duplication of the OPENING/CLOSING wrapper only: put the `.pdisc__body` subtree in a `<slot name="body-inner" />`? No. Simplest honest route: keep ONE markup tree and switch the wrapper tag with Astro's dynamic tag: `const Wrapper = plain ? "div" : "details";` then `<Wrapper class="pdisc" class:list={{…, "pdisc--plain": plain}} open={!plain && column && shell}>` and render the `<summary>` only when `!plain`. `set:html` is not needed. (Astro supports a string in a capitalised variable as a dynamic tag; `open` is omitted when false.)

Style, after the existing `.pdisc--line` rules:

```css
  /* PLAIN (2026-10-15, the pages card): the words with no disclosure at
     all — the full-frame card has room for them. No toggle, no fold. */
  .pdisc--plain {
    display: block;
    min-width: 0;
  }
  .pdisc--plain > .pdisc__body {
    display: block;
    padding: 0;
  }
```

Check what `.pdisc__body` and `.pdisc__body-inner` set (lines ~92-154 of the style) and neutralise in `.pdisc--plain` whatever is disclosure-specific (a `::details-content` rule does not apply to a `div`; a `padding-top` for the toggle must go).

- [ ] **Step 2: The card markup**

`CommunityImageCard.astro`: Props gain `index?: number` (default 0). Then:
- Images: the first slide of the FIRST card (`index === 0 && i === 0`) gets `loading="eager"` and `fetchpriority="high"`; all others keep `loading="lazy"`.
- `SIZES` becomes `"(max-width: 767px) 100vw, 60vw"` — the full-frame picture is wider than any spread slot. Keep the comment's warning about decoded memory but note the reason it no longer applies: with the pages view only one card's images are hydrated at a time (the engine hydrates current ±1) and every other card's slides beyond the first stay `data-src`.
- Move the `.ccard__foot` INSIDE `.ccard__body`, after the frame: `<div class="ccard__foot"><div class="ccard__dots" aria-hidden="true">…dots…</div></div>` — look at how the foot is rendered today (around the end of the component, after the panel) and move that element verbatim.
- Panel: `<MemberDetailPanel member={member} lang={lang} forceShow mode="plain">` with the same `footer` slot (`a.ccard__profile`).
- Delete the `style={`--frame-ar:${frameAspect}`}` on the article and the `aspect-ratio:` on the frame (keep the `background:` colour). Delete `frameAspect`.

- [ ] **Step 3: The card's stylesheet**

Replace the `.ccard` block (custom properties + grid, lines 43-116) and the desktop placement block (118-185) with:

```css
.ccard {
  --ccard-gap: 0.6rem;
  --ccard-air: 2rem;
  --ccard-side-w: 20rem;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--ccard-air) var(--ccard-side-w);
  grid-template-rows: auto minmax(0, 1fr);
  row-gap: 0.7rem;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.ccard__body {
  grid-area: 1 / 1 / 3 / 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ccard__head {
  grid-area: 1 / 3 / 2 / 4;
}
.ccard > .pdisc {
  grid-area: 2 / 3 / 3 / 4;
  min-height: 0;
  overflow: hidden auto;
  scrollbar-width: thin;
}
```

Frame (replace `.ccard__frame`'s `flex: 1 1 auto; min-width: 0; overflow: hidden;` plus the `clip-path`): 

```css
.ccard__frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--color-bg);
  touch-action: pan-x pan-y pinch-zoom;
}
```

(The `clip-path: inset(0 1px)` seam defence was for Embla's fractional translate; a snapped scroll lands on whole slide widths — drop it and the long comment, leave one line saying why.)

Image: `.ccard__img { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left center; }` — the work keeps its aspect, stands at the frame's left edge, air on the right toward the words. (Phone: `object-position: center`.)

Foot (replace the desktop `.ccard__foot` placement): 

```css
.ccard__foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding-top: 0.4rem;
}
```

Keep `.ccard__dots`, `.ccard__count`, `.ccard__live`, `.ccard__profile`, the arrows as they are. Delete `--ccard-rail`, `--ccard-pic-w`, `--ccard-chrome`, `--frame-cap`, `--pdisc-*`, the lane mirror block and every `[data-lane]` selector.

Mobile block (replace 546-628):

```css
@media (--bp-mobile) {
  .ccard {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    row-gap: 0.75rem;
    height: auto;
  }
  .ccard__body {
    grid-area: 1 / 1 / 2 / 2;
    height: calc((var(--cpage-h, 100dvh) - var(--cpage-chrome-b, 4.5rem)) * 0.6);
  }
  .ccard__head {
    grid-area: 2 / 1 / 3 / 2;
  }
  .ccard > .pdisc {
    grid-area: 3 / 1 / 4 / 2;
    overflow: visible;
  }
  .ccard__img {
    object-position: center;
  }
  .ccard__profile {
    align-self: flex-end;
    margin-top: 2px;
    gap: 0.3rem;
  }
  .ccard__arrow {
    display: none;
  }
}
```

- [ ] **Step 4: Look at it**

Copy `.site-data.json` from `repo/`, bump `generatedAt`, run `npm run dev` in the worktree (port 4321, or the next free one), open `http://127.0.0.1:<port>/community` in the Browser pane, `resize_window` to 1440×900, screenshot; then 390×844, reload, screenshot. Check: one card fills the frame under the header, the bar does not cover the words, the works row swipes/scrolls (a real wheel gesture with shift), the pager counts, a click on a slide opens the lightbox on that slide.

- [ ] **Step 5: Lint, check, unit**

Run: `npm run lint && npm run check && npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Card: layout A for the pages view, words open beside the picture

Picture left, filling the frame's height, each slide object-fit:contain;
name and role, bio, links, tags and PROFILE in a 20rem column right, in
MemberDetailPanel's new plain mode (a div, no disclosure). Phone stacks
the picture (60% of the frame) over the words. The pager sits under the
picture's bottom corner."
```

---

### Task 4: The flourish

**Files:**
- Modify: `src/components/CommunityGrid.astro` (add the pages motion block; delete the mobile `cgrid-cell-in/out` block ~2200-2260 and its keyframes; delete the `--cgrid-fade-inset` comments)

- [ ] **Step 1: Add the motion**

Inside the pages block from Task 2, after the cell rules:

```css
  /* THE FLOURISH (2026-10-15, Josh: entry 2 + exit 1 of the brainstorm):
     the picture arrives first, the words settle a beat later, the card
     leaving shrinks and dims. View timelines against .page-wrap; the
     section itself is never transformed, so the snap geometry is layout's.
     Longhands after the shorthand, on purpose — see minifier note in
     CLAUDE.md. Browsers without view() get the plain snap. */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      :global(.cgrid[data-pattern="pages"] .ccard__body) {
        animation: cpage-pic-in linear both;
        animation-timeline: view();
        animation-range: entry 0% entry 100%;
      }
      :global(.cgrid[data-pattern="pages"] .ccard__head),
      :global(.cgrid[data-pattern="pages"] .ccard > .pdisc) {
        animation: cpage-words-in linear both;
        animation-timeline: view();
        animation-range: entry 35% entry 110%;
      }
      :global(.cgrid[data-pattern="pages"] .ccard) {
        animation: cpage-out linear both;
        animation-timeline: view();
        animation-range: exit 0% exit 100%;
        transform-origin: 50% 50%;
      }
    }
  }
  @keyframes cpage-pic-in {
    from { transform: translateX(-6%) scale(0.97); opacity: 0.3; }
    to { transform: none; opacity: 1; }
  }
  @keyframes cpage-words-in {
    from { transform: translateY(22px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  @keyframes cpage-out {
    from { transform: none; opacity: 1; }
    to { transform: scale(0.96); opacity: 0.35; }
  }
```

Note: `view()` on `.ccard__body` measures THAT element's crossing; because the body fills the card's height on desktop its entry range equals the card's. On a phone the body is 60% of the frame, which makes the picture finish arriving sooner — acceptable, the spec says the words finish while the card's top is on screen.

- [ ] **Step 2: Delete the old mobile fades**

Remove the `@media (--bp-mobile) and (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) { .cgrid:not([data-pattern="grid"]) .cgrid__cell {…} } }` block and `@keyframes cgrid-cell-in` / `cgrid-cell-out`, plus their explanatory comments.

- [ ] **Step 3: Build and read the built CSS**

Run: `npm run build` (needs `.site-data.json`), then `grep -o "animation-timeline:view()[^}]*" dist/_astro/*.css | head` — expect the three `animation-timeline` longhands present with their `animation-range` values.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Pages: the flourish — picture leads, words follow, the leaving card sinks

Three view()-timeline keyframes inside @supports and no-preference; the
spread's mobile cell fades are gone with the spread."
```

---

### Task 5: The editor's card preview follows; the fold goes

**Files:**
- Modify: `src/components/community/CommunityCardPreview.astro` (structure: body with foot inside, head, plain panel; `.ccard--preview` sizing)
- Modify: `src/lib/profilePreview.ts` (`renderCardPreview`: no `--frame-ar`, no `aspectRatio`; `toggle` hook handling when the toggle is absent)
- Modify: `src/components/community/MemberDetailPanel.astro` (delete `mode="column"`, the column rules 257-414 of its style, the `<script>` importing cardFold)
- Delete: `src/lib/cardFold.ts`
- Modify: `src/styles/communityCard.css` preview block (643-689)

- [ ] **Step 1: Preview markup**

Reorder `CommunityCardPreview.astro` to the card's new tree: `.ccard__body[data-ccpv=body]` holds `.ccard__frame[data-ccpv=frame][data-carousel]` (track, arrows, live) AND `.ccard__foot > .ccard__dots[data-ccpv=dots]`; then `.ccpv__tframe`; then `.ccard__head`; then `<MemberDetailPanel lang shell mode="plain">` with the `footer` slot. Delete the standalone `.ccard__foot` at the end.

- [ ] **Step 2: `renderCardPreview`**

- Delete `root.style.setProperty("--frame-ar", …)`, `frame.style.aspectRatio = …`, and `root.style.removeProperty("--frame-ar")`.
- Where `part("toggle")` is filled (`aria-label` from `data-ccpv-expand`): guard with `if (toggle)` if not already.
- In `MemberDetailPanel` shell mode the `toggle` hook (`data-ccpv="toggle"`) existed on the `<summary>`; in plain mode there is no summary. Remove the `data-ccpv="toggle"` / `data-ccpv-expand` attributes from the panel and the lines in `profilePreview.ts` that fill them (search `"toggle"` and `ccpvExpand`).

- [ ] **Step 3: Delete the column mode and the fold**

`MemberDetailPanel.astro`: `mode?: "plain"` only; remove `column`, `open={…}`, the `pdisc--column` class, the column comments, the style rules from `.pdisc--column {` through the mobile column block, and the `<script>` block. Delete `src/lib/cardFold.ts`. `grep -rn "cardFold\|pdisc--column\|ccard-role-w\|pdisc-bar\|pdisc-rail\|is-closing" src tests` must print nothing.

- [ ] **Step 4: Preview sizing**

Replace the `.ccard--preview` custom-property rule (`--slot-rows: 26; --cgrid-row: 1.5rem; --ccard-slot-w: …`) in `CommunityCardPreview.astro`'s scoped style with:

```css
  .ccard--preview {
    --cpage-h: 30rem;
    --cpage-chrome-b: 0rem;
    height: 30rem;
  }
  @media (--bp-mobile) {
    .ccard--preview {
      height: auto;
    }
  }
```

(The preview column is narrower than the directory; `--ccard-side-w` may need `16rem` under `.ccard--preview` — decide at the screen.)

- [ ] **Step 5: Look at it**

Open `http://127.0.0.1:<port>/styleguide/editor/de` (the no-sign-in editor harness, memory: styleguide-editor-harness) — the Works tab shows the card preview. Add a second image if the seed has one; confirm the preview pages with the chevrons and the words sit beside the picture.

- [ ] **Step 6: Lint, check, unit; commit**

```bash
npm run lint && npm run check && npm run test:unit
git add -A
git commit -m "Editor preview renders the pages card; the fold and cardFold.ts are gone

The shell twin follows the card's new tree (foot inside the body, plain
panel). MemberDetailPanel loses column mode and its rail/bar/chevron
rules; nothing imports cardFold.ts any more."
```

---

### Task 6: Dead code sweep and docs

**Files:**
- Modify: `src/lib/communityMotionController.ts` (delete the spread parallax: `AMPS`, `flowScale`'s spread branch, the per-cell parallax loop; keep the wall fade; simplify `build()` to bail unless `.cgrid[data-pattern="grid"]`)
- Modify: `src/components/CommunityGrid.astro` (the base `.cgrid` 24-column rules → only what the wall still needs; `.cgrid--debug`; the `?grid` debug flag in the controller)
- Modify: `CLAUDE.md` (Layout/scrolling: the snap attribute; Styling: communityCard.css's new shape; "The community visual prototype…" paragraph: card v2 → pages card)
- Modify: `documentation/20261015-portfolio-pages-view.md` — append an "As built" section with any deviation
- Modify: `documentation/release-log.md` if it lists pending changes (read it first)

- [ ] **Step 1: Motion controller**

Read `build()` (65-203). Keep: the fade for `.cwork` tiles on the wall with its per-column stagger. Delete: the parallax block (138-186), `AMPS`, `flowScale`. Add an early `if (grid.dataset.pattern !== "grid") return;` after the existing bails so the pages view never creates a ScrollTrigger (the flourish is CSS). Run `npm run check`.

- [ ] **Step 2: Grid CSS**

In `CommunityGrid.astro`: `.cgrid`'s `display: grid; grid-template-columns: repeat(24, …); grid-auto-rows: …; --cgrid-col; column-gap` are the spread's; the wall's `[data-pattern="grid"]` block restates its own `display`/columns. Move what the wall relies on (`--cgrid-row`, `--grid-max`, `--cgrid-pad`, width/margin) into the base and delete the 24-column declarations, `.cgrid__cell { grid-column: var(--gc); grid-row: var(--gr) }`, `:global(.cgrid__cell > .ccard) { position: absolute … }` (keep the `.cwork` half if the wall needs it — read `[data-pattern="grid"] .cgrid__cell` first), and `.cgrid--debug`. Delete the `?grid` debug class toggle in the controller. Build and compare the Images view before/after with a screenshot at 1440 — it must not move.

- [ ] **Step 3: Docs**

`CLAUDE.md`: in "Layout and scrolling" add one bullet: `.page-wrap[data-snap="y"]` is set by the community controller for the pages view (`scroll-snap-type: y mandatory`), cleared before a swap. In "Conventions", the sentence about card v2 → "the pages card (`documentation/20261015-portfolio-pages-view.md`)". Append "As built" to the spec.

- [ ] **Step 4: Full verify and build**

Run: `npm run verify` (needs Java for the emulator half; if Java is missing run `npm run lint && npm run check && npm run test:unit` and say so) and `npm run build`.
Expected: green; the build renders every page.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Community: remove the spread's parallax, slot CSS and debug grid; docs

The motion controller keeps only the wall's fade. CLAUDE.md records the
snap attribute and the pages card."
```

---

### Task 7: Merge to dev and walk it

- [ ] **Step 1: npm ci proof** — `npm ci` in the worktree (memory: windows-npm-lockfile-merge) must succeed after the Embla removal.
- [ ] **Step 2: Merge** — per the standing rule (memory: no-prs-direct-merge-to-dev): from `repo/`, `git fetch origin`, confirm `feat/portfolio-pages` contains `origin/dev`, then from a detached worktree at `origin/dev` (memory: merging-into-dev-without-switching) `git merge --no-ff feat/portfolio-pages` and `git push origin HEAD:refs/heads/dev`. Watch the staging deploy run with `gh run watch` and READ ITS EXIT CODE (memory: merge-gate-must-read-exit-code).
- [ ] **Step 3: Playwright walk on the dev host** — desktop 1440×900 and iPhone 390×844: load `/community`; assert `.page-wrap[data-snap="y"]`; wheel one notch and assert the second `.cgrid__cell`'s top equals `--header-h` within 2px; shift-wheel over the frame and assert `data-index` becomes `1` and the count reads `2 / n`; click a slide and assert `.pswp` opens with the matching `src`; pick a tag in the bar and assert the first visible cell is at the top; `?pattern=spread` lands on the pages view; the Images view is unchanged (screenshot diff by eye). Sample `getComputedStyle(words).opacity` after a real wheel to confirm the flourish ran on Chromium.
- [ ] **Step 4: Memory note** — write `portfolio-pages-view.md` in the memory store (what shipped, the touch-pan reason the slides are links, the snap attribute, the preview sizing knob) and index it; mark `gallery-card-v2.md` and `community-mobile-pattern.md` as superseded for the Portfolios view.
