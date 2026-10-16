// EACH PROJECT IS A CAROUSEL OF ITS WORKS (2026-09-26, Josh: "the projects
// should be shown as carousels on the profile page and in the preview").
// Until today this module paged between PROJECTS (2026-09-25, one slider for
// all of a member's projects); a project's own works still stacked inside
// each step, so a slide could be several screens tall. Now the projects stack
// down the page like everything else, and each one with two or more works
// pages through them one work per step. One level of swiping, never a swipe
// inside a swipe.
//
// The motion is the BROWSER'S, not a library's: the track is a plain
// horizontal scroll container with `scroll-snap-type: x mandatory` and one
// snap point per work (see .mprof__carousel-track in profile.css). That is
// what makes swipe, trackpad, a scrollbar-less mouse wheel and the arrow keys
// on the focused track all land on a whole work with no code at all. This
// module adds only what CSS cannot do:
//
//   1. THE BLEED, until 2026-10-14: the track reached out to the window's
//      edges so the next work spilled into the margin, measured here. It
//      clips at the column now, as the directory card does (Josh: "the
//      carousel should not show the other card on the right"), so there is
//      nothing left to measure.
//   1b. SLIDES AS WIDE AS THEIR PICTURES (2026-10-14, Josh: "there is still
//      a gap to the right of the images and we see them transition through
//      that"). A picture capped at 60vh is narrower than the column; in a
//      column-wide slide the works travelled a column apart, a strip of bare
//      paper between them. Each slide now takes its picture's width (the
//      frame's own resolved max-width), slides snap to the column's CENTRE,
//      and the track is padded so the first and last can reach it. The
//      stylesheet clips the track to the current picture, so the next one
//      arrives one gap behind the last, as on the directory card. Without
//      the script every slide is column-wide, as before.
//   2. PREV / NEXT, the dots and the spoken position.
//   2b. THE FRAME. A work narrower than the column (the 60vh cap, centred) is
//      not where the column's edges are, so the dots and the two chevrons are
//      placed on the CURRENT picture: its offsets inside its slide go to the
//      stylesheet as --frame-l / --frame-r / --frame-h. The picture is the
//      slide's `.mprof__work-link` (MemberWork.astro, and the preview's
//      figure); without one the frame is the whole slide.
//   1c. SEVERAL WORKS AT ONCE ON A DESKTOP (2026-10-16, Josh: "on bigger
//      screens we need to show multiple images for projects they should be
//      smaller and the carousel should show multiple images from the
//      beginning. also add scroll snap!"). Above the phone breakpoint the
//      pictures are capped lower (profile.css), the track is not clipped to
//      one picture, and every work snaps to the column's LEFT edge: the
//      first work starts at the column's start and the next ones follow it
//      in view. A step is still one work. On a phone nothing changed.
//   1d. WIDER, FADING ON THE RIGHT (2026-10-16): on a desktop the stage reaches
//      out of the column to the right, as far as the project index's list
//      (or the window's edge, less a gutter, where the list is hidden).
//      Measured here as --bleed-r; the fade and its removal at the track's
//      end (is-end) are in profile.css.
//   1e. THE STAGGERED ARRIVAL (2026-10-16): every work but the first is
//      transparent until the page comes to rest with the carousel in view,
//      then they fade in one after the other. See revealWhenSettled below.
//   3. FOLLOWING THE LIGHTBOX (showInCarousel): paging the lightbox pages the
//      carousel behind it, so the close animation lands on a visible picture.
//
// Contract with the markup (MemberProject.astro on the page, the `carousel`
// template in ProfileViewPreview.astro in the editor): `[data-carousel]` on
// the wrapper, `[data-carousel-track]` holding one child per work,
// `[data-carousel-prev/next]`, `[data-carousel-dots]` (an empty row this module
// fills with one dot per work), `[data-carousel-live]`, and
// `data-position-label` ("Work {n} of {total}").

import { pagerChevron } from "./pager.ts";

const live = new Map<HTMLElement, () => void>();

/** Releases every carousel's observers and listeners — the navigation sweep. */
export function destroyProjectCarousels(): void {
  live.forEach((release) => release());
  live.clear();
}

document.addEventListener("astro:before-swap", destroyProjectCarousels);

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
/** 1c: the --bp-desktop alias (767px < width), where a carousel shows several works. */
const MULTI = window.matchMedia("(min-width: 768px)");

/** 1e: carousels staged and not yet revealed. */
const staged = new Set<HTMLElement>();

/** The share of `el` inside the window, 0–1. */
function visibleShare(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  if (!r.height) return 0;
  const shown = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return Math.max(0, shown) / Math.min(r.height, window.innerHeight);
}

/** Reveals every staged carousel that stands at least half in view. */
function revealInView(): void {
  staged.forEach((carousel) => {
    if (!carousel.isConnected) {
      staged.delete(carousel);
      return;
    }
    if (visibleShare(carousel) < 0.5) return;
    carousel.classList.add("is-revealed");
    // Settled once the last work's delayed fade is over: from then on a
    // step back or forward fades at once.
    const last = carousel.querySelectorAll("[data-carousel-track] > *").length - 2;
    window.setTimeout(() => carousel.classList.add("is-settled"), Math.max(0, last) * 140 + 500);
    staged.delete(carousel);
    arrival.unobserve(carousel);
  });
}

// "After snapping": the page has stopped scrolling. scrollend where the
// browser has it, and a short quiet after the last scroll event everywhere
// (Safari has no scrollend). Captured, because the scroller is .page-wrap
// on a desktop and the document on a phone, and the lightbox's own scrolls
// would never reach a bubbling listener on either.
let settleTimer = 0;
const onScroll = () => {
  if (!staged.size) return;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(revealInView, 140);
};
document.addEventListener("scroll", onScroll, { capture: true, passive: true });
document.addEventListener("scrollend", () => staged.size && revealInView(), { capture: true });
// Arrival needs no scroll: the page's entrance motion moves the carousel
// into view without one, so a visibility observer hands the same settle to
// whatever brought it there.
const arrival = new IntersectionObserver(onScroll, { threshold: [0, 0.25, 0.5, 0.75, 1] });

/** Per carousel: bring slide `i` to rest on the column, without animating. */
const seat = new WeakMap<HTMLElement, (slide: HTMLElement) => void>();

/**
 * Wires every un-wired carousel under `root`. Idempotent. Carousels that have
 * left the document are released first: the editor's preview replaces its
 * whole works list on every render, and each carousel holds a ResizeObserver
 * that would otherwise outlive it.
 */
export function initProjectCarousels(root: ParentNode = document): void {
  live.forEach((release, el) => {
    if (el.isConnected) return;
    release();
    live.delete(el);
  });

  root.querySelectorAll<HTMLElement>("[data-carousel]").forEach((carousel) => {
    if (live.has(carousel)) return;
    const track = carousel.querySelector<HTMLElement>("[data-carousel-track]");
    if (!track) return;
    const slides = Array.from(track.children) as HTMLElement[];
    const prev = carousel.querySelector<HTMLButtonElement>("[data-carousel-prev]");
    const next = carousel.querySelector<HTMLButtonElement>("[data-carousel-next]");
    const dotRow = carousel.querySelector<HTMLElement>("[data-carousel-dots]");
    const dots = slides.map(() => {
      const dot = document.createElement("span");
      dot.className = "mprof__carousel-dot";
      return dot;
    });
    // The position as text (2026-09-28, Josh: "try text instead of dots"),
    // in the dots' row; the dots stay, hidden by one rule in profile.css.
    const count = document.createElement("span");
    count.className = "mprof__carousel-count";
    // Flanked by chevrons that page, "‹ 2 / 7 ›", like the gallery card's and
    // the lightbox's (src/lib/pager.ts). Named after the edge arrows and
    // reachable by a screen reader, but not tab stops: the track itself is
    // the tab stop and its arrow keys page (see pager.ts for the reasoning).
    const countPrev = pagerChevron("prev", () => go(current() - 1), {
      label: prev?.getAttribute("aria-label"),
      focusable: false,
    });
    const countNext = pagerChevron("next", () => go(current() + 1), {
      label: next?.getAttribute("aria-label"),
      focusable: false,
    });
    dotRow?.replaceChildren(countPrev, count, countNext, ...dots);
    const liveRegion = carousel.querySelector<HTMLElement>("[data-carousel-live]");
    const positionLabel = carousel.dataset.positionLabel ?? "";
    const controller = new AbortController();
    const { signal } = controller;

    // 1b: each slide's width, and the track's end padding. The column is the
    // carousel's width (the track's own box shrinks by its padding, and on a
    // desktop the stage reaches past the column by the bleed).
    let column = 0;
    let widths: number[] = [];
    // 1d: how far the stage may reach past the column, read before the
    // column so the column is measured without the bleed.
    const bleed = () => {
      if (!MULTI.matches) {
        carousel.style.removeProperty("--bleed-r");
        return;
      }
      carousel.style.setProperty("--bleed-r", "0px");
      const right = carousel.getBoundingClientRect().right;
      const list = document.querySelector<HTMLElement>(".mprof__index-list");
      const listBox = list?.getBoundingClientRect();
      const limit = listBox && listBox.width ? listBox.left - 24 : document.documentElement.clientWidth - 16;
      carousel.style.setProperty("--bleed-r", `${Math.max(0, Math.round(limit - right))}px`);
    };
    const size = () => {
      bleed();
      column = carousel.clientWidth;
      if (!column) return;
      widths = slides.map((slide) => {
        const pic = slide.querySelector<HTMLElement>(".mprof__work-link");
        const cap = pic ? parseFloat(getComputedStyle(pic).maxWidth) : NaN;
        return Math.round(Number.isFinite(cap) ? Math.min(column, cap) : column);
      });
      slides.forEach((slide, i) => slide.style.setProperty("--slide-w", `${widths[i]}px`));
      // 1c: left-aligned, so no padding to centre the ends on.
      const multi = MULTI.matches;
      track.style.setProperty("--pad-l", `${multi ? 0 : (column - widths[0]) / 2}px`);
      // ...but room after the last work for it to come to rest at the start
      // too (2026-10-16, Josh: "the final image should end up at the left edge").
      track.style.setProperty(
        "--pad-r",
        `${multi ? Math.max(0, track.clientWidth - widths[widths.length - 1]) : (column - widths[widths.length - 1]) / 2}px`,
      );
    };

    // A slide's resting scroll position: its centre on the column's.
    // offsetLeft is measured from the track (position: relative in the CSS)
    // and includes the track's padding.
    // 1c: on a desktop its start on the column's. The end padding lets every
    // work get there, the last included; the clamp only guards a frame where
    // the padding is not yet laid out.
    const maxScroll = () => track.scrollWidth - track.clientWidth;
    const restFor = (i: number) =>
      MULTI.matches
        ? Math.min(slides[i].offsetLeft, maxScroll())
        : slides[i].offsetLeft - (column - (widths[i] ?? column)) / 2;

    const current = () => {
      let best = 0;
      let distance = Infinity;
      slides.forEach((_, i) => {
        const d = Math.abs(restFor(i) - track.scrollLeft);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return best;
    };

    let shown = -1;
    let announce = false;

    const frame = () => {
      const slide = slides[shown < 0 ? 0 : shown];
      if (!slide) return;
      const pic = slide.querySelector<HTMLElement>(".mprof__work-link") ?? slide;
      const p = pic.getBoundingClientRect();
      if (!p.width || !column) return;
      // 1c: several in view, so the chevrons run down the column's edges.
      if (MULTI.matches) {
        carousel.style.setProperty("--frame-l", "0px");
        carousel.style.setProperty("--frame-r", "0px");
        carousel.style.setProperty("--frame-h", `${Math.round(p.height)}px`);
        return;
      }
      // Where the picture stands once it is at rest: centred on the column.
      const side = Math.max(0, Math.round((column - Math.min(column, p.width)) / 2));
      carousel.style.setProperty("--frame-l", `${side}px`);
      carousel.style.setProperty("--frame-r", `${side}px`);
      carousel.style.setProperty("--frame-h", `${Math.round(p.height)}px`);
    };
    const update = () => {
      const i = current();
      if (i === shown) return;
      shown = i;
      const atStart = i === 0;
      // 1c: on a desktop the end is where the track stops, not the last work.
      const atEnd = i === slides.length - 1;
      if (prev) prev.disabled = atStart;
      if (next) next.disabled = atEnd;
      countPrev.disabled = atStart;
      countNext.disabled = atEnd;
      dots.forEach((dot, n) => dot.classList.toggle("mprof__carousel-dot--on", n === i));
      count.textContent = `${i + 1} / ${slides.length}`;
      carousel.classList.toggle("is-end", atEnd);
      slides.forEach((slide, n) => slide.classList.toggle("is-current", n === i));
      frame();
      // Spoken only when a control asked for the move — a swipe or a scroll is
      // already visible to whoever made it, and page load is not news.
      if (liveRegion && announce) {
        liveRegion.textContent = positionLabel
          .replace("{n}", String(i + 1))
          .replace("{total}", String(slides.length));
      }
      announce = false;
    };

    const go = (i: number) => {
      const target = Math.max(0, Math.min(slides.length - 1, i));
      announce = true;
      track.scrollTo({ left: restFor(target), behavior: REDUCED.matches ? "auto" : "smooth" });
    };

    prev?.addEventListener("click", () => go(current() - 1), { signal });
    next?.addEventListener("click", () => go(current() + 1), { signal });
    track.addEventListener("scroll", update, { passive: true, signal });

    // Whenever the column changes size the slide the visitor was on is put
    // back on it: a new width moves every snap point, and without the re-seat
    // a resize would leave the track resting halfway between two works. This
    // is also what frames a carousel that was built while hidden (the
    // editor's preview tab): it has no box until the tab opens, and opening
    // it is a resize.
    const reseat = () => {
      const i = shown < 0 ? 0 : shown;
      size();
      track.scrollTo({ left: restFor(i), behavior: "auto" });
      shown = -1;
      update();
    };
    const observer = new ResizeObserver(reseat);
    observer.observe(carousel);
    // The pictures' cap is in vh: a window that only grows taller changes it
    // without changing the column.
    window.addEventListener("resize", reseat, { signal });

    seat.set(carousel, (slide) => {
      const i = slides.indexOf(slide);
      if (i < 0) return;
      track.scrollTo({ left: restFor(i), behavior: "auto" });
    });

    size();
    update();

    // 1e: staged only when there is motion to give, and only once.
    if (!REDUCED.matches && slides.length > 1 && !carousel.classList.contains("is-revealed")) {
      slides.forEach((slide, n) => slide.style.setProperty("--i", String(Math.max(0, n - 1))));
      carousel.classList.add("is-staged");
      staged.add(carousel);
      arrival.observe(carousel);
    }

    live.set(carousel, () => {
      controller.abort();
      observer.disconnect();
      seat.delete(carousel);
      staged.delete(carousel);
      arrival.unobserve(carousel);
    });
  });
}

/**
 * Puts the carousel slide holding `el` (a work's lightbox trigger) on the
 * column. Called from the lightbox's `change` event, so the carousel behind
 * it follows the lightbox and the zoom-out on close lands on the picture the
 * visitor was last looking at, not on whichever one the track was showing.
 * A no-op for a work that is not in a carousel.
 */
export function showInCarousel(el: Element | null | undefined): void {
  const carousel = el?.closest<HTMLElement>("[data-carousel]");
  const track = carousel?.querySelector<HTMLElement>("[data-carousel-track]");
  if (!carousel || !track) return;
  const slide = Array.from(track.children).find((child) => child.contains(el!));
  if (slide instanceof HTMLElement) seat.get(carousel)?.(slide);
}
